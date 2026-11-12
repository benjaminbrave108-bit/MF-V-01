"use client";

import { TableTools } from "./TableTools";
import { useMemo, useState } from "react";
import { MoneyStack } from "./MoneyStack";
import { localizeData, tx } from "../lib/i18n";
import { combineByCurrency, date, toUsd } from "../lib/finance";
import { kasaDebtByCurrency } from "../lib/debts";
import type { CashAccountSummary, KasaSection, Language, Page, RecordItem } from "../lib/types";

// Alan Detayları: çalışma alanı → bölüm → kasa ağacından istenen alanlar işaretlenir; seçilenlerin özeti, alanlar arası
// karşılaştırma ve hiyerarşik dökümü görünür. Veri zaten kullanıcının yetkisine göre süzülmüş gelir (süper yönetici hepsini,
// diğerleri yalnızca kendisine açılan kasaları görür); burada ek bir yetki mantığı yoktur.

type KasaRow = {
  name: string;
  wsKey: string;
  secKey: string | null; // bölümse bölümün anahtarı (sec-<id>), değilse null
  balance: Record<string, number>;
  inBy: Record<string, number>;
  outBy: Record<string, number>;
  debt: Record<string, number>;
  last: string;
  count: number;
};
type Node = { key: string; name: string; color: string; kasas: KasaRow[]; subs: { key: string; name: string; color: string; kasas: KasaRow[] }[] };

const merge = (rows: Record<string, number>[]) => {
  const out: Record<string, number> = {};
  for (const r of rows) for (const [c, v] of Object.entries(r)) out[c] = (out[c] ?? 0) + v;
  return out;
};
const usdOf = (by: Record<string, number>, rates: Record<string, number>) => Object.entries(by).reduce((t, [c, v]) => t + (toUsd(v, c, rates) ?? 0), 0);

export function AreaDetails({
  records,
  cashAccounts,
  sections,
  workspaceOrder,
  language,
  exchangeRates,
  isSuperAdmin,
  goTo,
}: {
  records: RecordItem[];
  cashAccounts: CashAccountSummary[];
  sections: KasaSection[];
  workspaceOrder: string[];
  language: Language;
  exchangeRates: Record<string, number>;
  isSuperAdmin: boolean;
  goTo: (page: Page) => void;
}) {
  // Ay ve yıl seçimi (seçim panelinde): "all" = tümü.
  const [year, setYear] = useState<string>("all");
  const [month, setMonth] = useState<string>("all");
  const [tab, setTab] = useState<"compare" | "tree">("compare");
  const [picked, setPicked] = useState<Set<string> | null>(null); // null = hepsi

  const years = useMemo(() => [...new Set(records.map((x) => x.date.slice(0, 4)).filter(Boolean))].sort().reverse(), [records]);
  const period = `${year}|${month}`;

  const nodes: Node[] = useMemo(() => {
    const cashSections = sections.filter((x) => x.scope === "cash");
    const accountOf = new Map(cashAccounts.map((a) => [a.name, a]));
    const names = [...new Set([...cashAccounts.map((a) => a.name), ...records.filter((x) => x.kind === "cash").map((x) => x.source), ...records.filter((x) => x.kind !== "cash").map((x) => x.cashAccount)].filter(Boolean))];
    const inPeriod = (x: RecordItem) => (year === "all" || x.date.startsWith(year)) && (month === "all" || x.date.slice(5, 7) === month);
    const builtin: { key: string; name: string; color: string }[] = [
      { key: "genel", name: tx(language, "Diğer", "Other", "Yên din"), color: "#315fe8" },
      { key: "liste", name: tx(language, "Liste Kasaları", "List Cash Accounts", "Qaseyên Lîsteyê"), color: "#b9951c" },
      { key: "rj", name: tx(language, "RJ-Kasaları", "RJ Cash Accounts", "Qaseyên RJ"), color: "#7b52bf" },
    ];
    const defs = [...builtin, ...cashSections.map((s) => ({ key: `sec-${s.id}`, name: s.name, color: s.color, parentKey: s.parentKey ?? null, sortOrder: s.sortOrder ?? 0 }))] as { key: string; name: string; color: string; parentKey?: string | null; sortOrder?: number }[];
    const known = new Set(defs.map((d) => d.key));
    const bucket = new Map<string, KasaRow[]>(defs.map((d) => [d.key, []]));
    for (const name of names) {
      const acc = accountOf.get(name);
      const direct = records.filter((x) => x.kind === "cash" && x.source === name);
      const inc = records.filter((x) => x.kind === "income" && x.cashAccount === name);
      const exp = records.filter((x) => x.kind === "expense" && x.cashAccount === name);
      const key = acc?.sectionId != null && cashSections.some((s) => s.id === acc.sectionId) ? `sec-${acc.sectionId}` : acc?.isListWorkspace ? "liste" : acc?.isRjKasa ? "rj" : "genel";
      const def = defs.find((d) => d.key === key)!;
      const isSub = Boolean(def.parentKey) && known.has(def.parentKey as string);
      bucket.get(key)!.push({
        name,
        wsKey: isSub ? (def.parentKey as string) : key,
        secKey: isSub ? key : null,
        balance: combineByCurrency([{ rows: direct }, { rows: inc }, { rows: exp, sign: -1 }]),
        // Kasaya giren her para gelirdir (borç alma girişi dahil); kasadan çıkan her para giderdir (borç ödemesi dahil).
        inBy: combineByCurrency([{ rows: direct.filter(inPeriod) }, { rows: inc.filter(inPeriod) }]),
        outBy: combineByCurrency([{ rows: exp.filter(inPeriod) }]),
        debt: kasaDebtByCurrency(records, name),
        last: [...direct, ...inc, ...exp].map((x) => x.date).filter(Boolean).sort().pop() ?? "",
        count: direct.length + inc.length + exp.length,
      });
    }
    const orderIdx = (k: string) => { const i = workspaceOrder.indexOf(k); return i < 0 ? 1e9 : i; };
    return defs
      .filter((d) => !(Boolean(d.parentKey) && known.has(d.parentKey as string)))
      .sort((a, b) => orderIdx(a.key) - orderIdx(b.key))
      .map((d) => ({
        key: d.key,
        name: d.name,
        color: d.color,
        kasas: bucket.get(d.key)!,
        subs: defs
          .filter((s) => s.parentKey === d.key)
          .sort((a, b) => (a.sortOrder || 1e9) - (b.sortOrder || 1e9))
          .map((s) => ({ key: s.key, name: s.name, color: s.color, kasas: bucket.get(s.key)! })),
      }))
      .filter((n) => n.kasas.length > 0 || n.subs.some((s) => s.kasas.length > 0));
  }, [records, cashAccounts, sections, workspaceOrder, year, month, language]);

  const allNames = useMemo(() => nodes.flatMap((n) => [...n.kasas, ...n.subs.flatMap((s) => s.kasas)].map((k) => k.name)), [nodes]);
  const isOn = (name: string) => (picked ? picked.has(name) : true);
  const setNames = (names: string[], on: boolean) => {
    const next = new Set(picked ?? allNames);
    for (const n of names) (on ? next.add(n) : next.delete(n));
    setPicked(next);
  };
  const state = (names: string[]) => (names.length === 0 ? "off" : names.every(isOn) ? "on" : names.some(isOn) ? "part" : "off");

  const sel = (list: KasaRow[]) => list.filter((k) => isOn(k.name));
  const colsOf = (n: Node) => sel([...n.kasas, ...n.subs.flatMap((s) => s.kasas)]);
  const selected = nodes.flatMap(colsOf);
  const total = {
    balance: merge(selected.map((k) => k.balance)),
    inBy: merge(selected.map((k) => k.inBy)),
    outBy: merge(selected.map((k) => k.outBy)),
    debt: merge(selected.map((k) => k.debt)),
  };
  const net = merge([total.inBy, Object.fromEntries(Object.entries(total.outBy).map(([c, v]) => [c, -v]))]);
  const monthName = (m: string) => new Date(2000, Number(m) - 1, 1).toLocaleDateString(language === "en" ? "en-US" : "tr-TR", { month: "long" });
  const periodWord = year === "all" && month === "all" ? tx(language, "Tüm zamanlar", "All time", "Hemû dem") : [month === "all" ? "" : monthName(month), year === "all" ? "" : year].filter(Boolean).join(" ");

  const cols = nodes.map((n) => ({ n, rows: colsOf(n) })).filter((c) => c.rows.length > 0);
  const maxBal = Math.max(1, ...cols.map((c) => Math.abs(usdOf(merge(c.rows.map((k) => k.balance)), exchangeRates))));
  const lastOf = (rows: KasaRow[]) => rows.map((k) => k.last).filter(Boolean).sort().pop() ?? "";

  const summary = (rows: KasaRow[]) => ({
    balance: merge(rows.map((k) => k.balance)),
    inBy: merge(rows.map((k) => k.inBy)),
    outBy: merge(rows.map((k) => k.outBy)),
    debt: merge(rows.map((k) => k.debt)),
  });

  const Check = ({ names, label, color, level }: { names: string[]; label: string; color?: string; level: 0 | 1 | 2 }) => {
    const st = state(names);
    return (
      <label className={`adCheck lvl${level} ${st}`}>
        <input type="checkbox" checked={st === "on"} ref={(el) => { if (el) el.indeterminate = st === "part"; }} onChange={() => setNames(names, st !== "on")} />
        {color && <i style={{ background: color }} />}
        <span>{label}</span>
        <em>{names.length}</em>
      </label>
    );
  };

  return (
    <div className="areaDetails">
      <div className="adHead">
        <div>
          <h2>{tx(language, "Kasa-Gelir-Gider Detayları", "Cash-Income-Expense Details", "Hûrguliyên Qase-Dahat-Mesref")}</h2>
          <p>{tx(language, "Dönemi, çalışma alanı, bölüm ve kasaları seçin. Kasaya giren her para gelir, çıkan her para gider sayılır (borç alma ve ödemeleri dahil).", "Pick the period, workspaces, sections and cash accounts. Every amount entering a cash account counts as income and every amount leaving it as expense (debts included).", "Dem, qad, beş û qaseyan hilbijêre.")}</p>
        </div>
      </div>

      {!isSuperAdmin && <p className="anNotice">{tx(language, "Yalnızca size açılan kasalar görünür; erişimi süper yönetici belirler.", "Only cash accounts shared with you are shown; access is set by the super admin.", "Tenê qaseyên ji te re vekirî xuya dibin.")}</p>}

      <div className="adLayout">
        <aside className="panel adPicker">
          <div className="adPeriod">
            <label>
              <span>{tx(language, "Yıl", "Year", "Sal")}</span>
              <select value={year} onChange={(e) => setYear(e.target.value)}>
                <option value="all">{tx(language, "Tüm yıllar", "All years", "Hemû sal")}</option>
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </label>
            <label>
              <span>{tx(language, "Ay", "Month", "Meh")}</span>
              <select value={month} onChange={(e) => setMonth(e.target.value)}>
                <option value="all">{tx(language, "Tüm aylar", "All months", "Hemû meh")}</option>
                {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0")).map((m) => <option key={m} value={m}>{monthName(m)}</option>)}
              </select>
            </label>
          </div>
          <div className="adPickerHead">
            <b>{tx(language, "Seçim", "Selection", "Hilbijartin")}</b>
            <span>
              <button type="button" onClick={() => setPicked(null)}>{tx(language, "Tümü", "All", "Hemû")}</button>
              <button type="button" onClick={() => setPicked(new Set())}>{tx(language, "Temizle", "Clear", "Paqij")}</button>
            </span>
          </div>
          {nodes.map((n) => {
            const wsNames = [...n.kasas, ...n.subs.flatMap((s) => s.kasas)].map((k) => k.name);
            return (
              <div key={n.key} className="adGroup">
                <Check names={wsNames} label={n.name} color={n.color} level={0} />
                {n.subs.map((s) => (
                  <div key={s.key} className="adSub">
                    <Check names={s.kasas.map((k) => k.name)} label={s.name} color={s.color} level={1} />
                    {s.kasas.map((k) => <Check key={k.name} names={[k.name]} label={localizeData(k.name, language)} level={2} />)}
                  </div>
                ))}
                {n.kasas.map((k) => <Check key={k.name} names={[k.name]} label={localizeData(k.name, language)} level={2} />)}
              </div>
            );
          })}
        </aside>

        <div className="adMain">
          <div className="lpMetrics anMetrics adMetrics">
            <div className="lpMetric hero"><span className="lpLabel">{tx(language, "Toplam bakiye", "Total balance", "Balansa giştî")}</span><strong><MoneyStack by={total.balance} /></strong><small>{selected.length} {tx(language, "kasa seçili", "cash accounts selected", "qase hatiye hilbijartin")}</small></div>
            <div className="lpMetric"><span className="lpLabel">{tx(language, "Gelir", "Income", "Dahat")} · {periodWord}</span><strong className="pos"><MoneyStack by={total.inBy} /></strong></div>
            <div className="lpMetric"><span className="lpLabel">{tx(language, "Gider", "Expenses", "Mesref")} · {periodWord}</span><strong className="neg"><MoneyStack by={total.outBy} /></strong></div>
            <div className="lpMetric"><span className="lpLabel">{tx(language, "Net / Açık borç", "Net / Open debt", "Net / Deyn")}</span><strong><MoneyStack by={net} /></strong><small>{Object.keys(total.debt).length ? <>{tx(language, "Açık borç", "Open debt", "Deyn")}: <MoneyStack by={total.debt} /></> : tx(language, "Açık borç yok", "No open debt", "Deyn tune")}</small></div>
          </div>

          <div className="anTabs" role="tablist">
            <button type="button" className={tab === "compare" ? "on" : ""} onClick={() => setTab("compare")}>{tx(language, "Karşılaştırma", "Comparison", "Berawirdkirin")}</button>
            <button type="button" className={tab === "tree" ? "on" : ""} onClick={() => setTab("tree")}>{tx(language, "Hiyerarşi", "Hierarchy", "Hiyerarşî")}</button>
          </div>

          {selected.length === 0 ? (
            <p className="lpEmpty panel">{tx(language, "Soldan en az bir kasa seçin.", "Select at least one cash account on the left.", "Herî kêm qaseyek hilbijêre.")}</p>
          ) : tab === "compare" ? (
            <div className="panel adTableWrap">
              <TableTools id="area-2" language={language} resize={false}><table className="lpTable adTable">
                <thead>
                  <tr>
                    <th />
                    {cols.map(({ n }) => <th key={n.key}><i className="adDot" style={{ background: n.color }} />{n.name}</th>)}
                    <th className="adTotal">{tx(language, "Toplam", "Total", "Giştî")}</th>
                  </tr>
                </thead>
                <tbody>
                  {([
                    ["count", tx(language, "Kasa sayısı", "Cash accounts", "Hejmara qaseyan")],
                    ["balance", tx(language, "Bakiye", "Balance", "Balans")],
                    ["inBy", `${tx(language, "Gelir", "Income", "Dahat")} (${periodWord})`],
                    ["outBy", `${tx(language, "Gider", "Expenses", "Mesref")} (${periodWord})`],
                    ["debt", tx(language, "Açık borç", "Open debt", "Deyn")],
                    ["last", tx(language, "Son hareket", "Last activity", "Tevgera dawî")],
                  ] as const).map(([row, label]) => {
                    const cell = (rows: KasaRow[]) => {
                      if (row === "count") return rows.length;
                      if (row === "last") { const d = lastOf(rows); return d ? date(d, language) : "—"; }
                      const by = summary(rows)[row];
                      return Object.keys(by).length ? <MoneyStack by={by} /> : "—";
                    };
                    return (
                      <tr key={row}>
                        <th scope="row">{label}</th>
                        {cols.map(({ n, rows }) => <td key={n.key} className={row === "inBy" ? "pos" : row === "outBy" ? "neg" : ""}>{cell(rows)}</td>)}
                        <td className={`adTotal ${row === "inBy" ? "pos" : row === "outBy" ? "neg" : ""}`}>{cell(selected)}</td>
                      </tr>
                    );
                  })}
                  <tr>
                    <th scope="row">{tx(language, "Bakiye payı", "Balance share", "Para balansê")}</th>
                    {cols.map(({ n, rows }) => {
                      const u = usdOf(summary(rows).balance, exchangeRates);
                      return <td key={n.key}><span className="adBar"><i style={{ width: `${Math.max(0, Math.min(100, (Math.abs(u) / maxBal) * 100))}%`, background: u < 0 ? "var(--red)" : n.color }} /></span></td>;
                    })}
                    <td className="adTotal" />
                  </tr>
                </tbody>
              </table></TableTools>
            </div>
          ) : (
            <div className="panel adTableWrap">
              <TableTools id="area-1" language={language} resize={false}><table className="lpTable adTable adTree">
                <thead>
                  <tr>
                    <th>{tx(language, "Alan / Bölüm / Kasa", "Workspace / Section / Cash account", "Qad / Beş / Qase")}</th>
                    <th>{tx(language, "Bakiye", "Balance", "Balans")}</th>
                    <th>{tx(language, "Gelir", "Income", "Dahat")}</th>
                    <th>{tx(language, "Gider", "Expenses", "Mesref")}</th>
                    <th>{tx(language, "Borç", "Debt", "Deyn")}</th>
                    <th>{tx(language, "Son hareket", "Last", "Dawî")}</th>
                  </tr>
                </thead>
                <tbody>
                  {nodes.flatMap((n) => {
                    const all = colsOf(n);
                    if (all.length === 0) return [];
                    const row = (key: string, label: string, rows: KasaRow[], level: 0 | 1 | 2, color?: string) => {
                      const s = summary(rows);
                      const d = lastOf(rows);
                      return (
                        <tr key={key} className={`adRow lvl${level}`}>
                          <td><span className="adName" style={{ paddingLeft: level * 18 }}>{color && <i className="adDot" style={{ background: color }} />}{label}{level < 2 && <em>{rows.length}</em>}</span></td>
                          <td>{Object.keys(s.balance).length ? <MoneyStack by={s.balance} /> : "—"}</td>
                          <td className="pos">{Object.keys(s.inBy).length ? <MoneyStack by={s.inBy} /> : "—"}</td>
                          <td className="neg">{Object.keys(s.outBy).length ? <MoneyStack by={s.outBy} /> : "—"}</td>
                          <td>{Object.keys(s.debt).length ? <MoneyStack by={s.debt} /> : "—"}</td>
                          <td>{d ? date(d, language) : "—"}</td>
                        </tr>
                      );
                    };
                    const out = [row(n.key, n.name, all, 0, n.color)];
                    for (const k of sel(n.kasas)) out.push(row(`${n.key}:${k.name}`, localizeData(k.name, language), [k], 2));
                    for (const s of n.subs) {
                      const rows = sel(s.kasas);
                      if (rows.length === 0) continue;
                      out.push(row(s.key, s.name, rows, 1, s.color));
                      for (const k of rows) out.push(row(`${s.key}:${k.name}`, localizeData(k.name, language), [k], 2));
                    }
                    return out;
                  })}
                </tbody>
              </table></TableTools>
            </div>
          )}
          {isSuperAdmin && (
            <p className="adFoot">
              {tx(language, "Alan, bölüm ve kasa düzenlemeleri ile kimlerin göreceği ", "Workspace, section and cash account edits and who can see them are managed in ", "Guherandin û kî çi dibîne di ")}
              <button type="button" className="lpTextBtn" onClick={() => goTo("cash")}>{tx(language, "Kasa Kontrol Merkezi'nde yönetilir →", "the Cash Control Center →", "Navenda Kontrola Qaseyan de →")}</button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

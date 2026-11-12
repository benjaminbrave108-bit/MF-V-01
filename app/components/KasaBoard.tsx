"use client";

import { MoneyStack } from "./MoneyStack";
import { useMemo, useState } from "react";
import { localizeData, tx } from "../lib/i18n";
import { combineByCurrency, date, moneyBreakdown, toUsd } from "../lib/finance";
import { kasaDebtByCurrency } from "../lib/debts";
import type { CashAccountSummary, Language, RecordItem } from "../lib/types";

// Kasa panosu: Kasalar sayfasının açılış görünümü. Her kasa bakiyesi, gelir/gider dengesi, son hareketi ve etiketleriyle
// tek kartta görünür; karta tıklayınca kasanın kendi sayfası (Gelirler / Giderler tabloları) açılır.
export type BoardKasa = {
  name: string;
  count: number;
  totalByCurrency: Record<string, number>;
  totalInByCurrency: Record<string, number>;
  totalOutByCurrency: Record<string, number>;
  direct: RecordItem[];
  inc: RecordItem[];
  exp: RecordItem[];
};
// Çalışma alanı → Bölüm → Kasalar: kasas = alana doğrudan bağlı kasalar, subs = alanın bölümleri (her birinin kendi kasaları).
export type BoardSection = { key: string; name: string; color: string; kasas: BoardKasa[] };
export type BoardWorkspace = { key: string; name: string; color: string; kasas: BoardKasa[]; subs: BoardSection[] };
export type BoardAction = { label: string; onClick: () => void; danger?: boolean };

const sumBy = (by: Record<string, number>, rates: Record<string, number>) =>
  Object.entries(by).reduce((t, [cur, v]) => t + (toUsd(v, cur, rates) ?? 0), 0);
const isZero = (by: Record<string, number>) => Object.values(by).every((v) => Math.abs(v) < 0.005);

export function KasaBoard({
  language,
  workspaces,
  cashAccounts,
  allRecords,
  exchangeRates,
  summary,
  onOpen,
  actionsFor,
  onShare,
  canManage = false,
  onReorder,
  onEditGroup,
  onAddSection,
  onAddKasa,
  onAddWorkspace,
}: {
  language: Language;
  workspaces: BoardWorkspace[];
  cashAccounts: CashAccountSummary[];
  allRecords: RecordItem[];
  exchangeRates: Record<string, number>;
  summary: { total: Record<string, number>; inBy: Record<string, number>; outBy: Record<string, number> };
  onOpen: (name: string) => void;
  actionsFor: (name: string) => BoardAction[];
  onShare: (account: CashAccountSummary) => void;
  // Kasa Kontrol Merkezi yönetimi (yalnızca süper yönetici): sıralama, düzenleme/yetki, bölüm-kasa ekleme.
  canManage?: boolean;
  onReorder?: (payload: { workspaces?: string[]; sections?: number[]; kasas?: number[] }) => void;
  onEditGroup?: (key: string, name: string, kasaNames: string[]) => void;
  onAddSection?: (parentKey: string) => void;
  onAddKasa?: (groupKey: string) => void;
  onAddWorkspace?: () => void;
}) {
  const [ws, setWs] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [showEmpty, setShowEmpty] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  // Kapalı çalışma alanları (tarayıcıda hatırlanır).
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem("mf-kasa-collapsed") || "[]")); } catch { return new Set(); }
  });
  const toggleWs = (key: string) => setCollapsed((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    try { localStorage.setItem("mf-kasa-collapsed", JSON.stringify([...next])); } catch {}
    return next;
  });
  const setAllCollapsed = (keys: string[], on: boolean) => {
    const next = new Set(on ? keys : []);
    setCollapsed(next);
    try { localStorage.setItem("mf-kasa-collapsed", JSON.stringify([...next])); } catch {}
  };

  const wsKasas = (w: BoardWorkspace) => [...w.kasas, ...w.subs.flatMap((x) => x.kasas)];
  const all = useMemo(() => {
    const seen = new Set<string>();
    const out: { k: BoardKasa; ws: BoardWorkspace }[] = [];
    for (const w of workspaces) for (const k of wsKasas(w)) if (!seen.has(k.name)) { seen.add(k.name); out.push({ k, ws: w }); }
    return out;
  }, [workspaces]);

  const q = query.trim().toLocaleLowerCase("tr");
  const isEmpty = (k: BoardKasa) => k.count === 0 || (isZero(k.totalByCurrency) && isZero(k.totalInByCurrency) && isZero(k.totalOutByCurrency));
  const visible = (k: BoardKasa) => (!q || k.name.toLocaleLowerCase("tr").includes(q));
  // Elle sıralanmış kasalar (sortOrder > 0) önce, kendi sırasıyla; sıralanmamışlar bakiyeye göre.
  const manual = (k: BoardKasa) => cashAccounts.find((a) => a.name === k.name)?.sortOrder || 0;
  const byBalance = (a: BoardKasa, b: BoardKasa) => ((manual(a) || 1e9) - (manual(b) || 1e9)) || sumBy(b.totalByCurrency, exchangeRates) - sumBy(a.totalByCurrency, exchangeRates);
  const scopedWs = workspaces.filter((w) => ws === "all" || w.key === ws);
  const emptyCount = scopedWs.reduce((n, w) => n + wsKasas(w).filter((k) => visible(k) && isEmpty(k)).length, 0);
  const pick = (list: BoardKasa[]) => list.filter((k) => visible(k) && (showEmpty || !isEmpty(k))).sort(byBalance);
  // Çalışma alanı → bölümler → kasalar; boş kasalar gizliyse ve içinde gösterilecek kasa kalmadıysa bölüm/alan gizlenir.
  // Yönetici boş çalışma alanı/bölümleri de görür (içine kasa eklemek için); arama yapılırken gizlenir.
  const showAlways = canManage && !q;
  const groups = scopedWs
    .map((w) => {
      const direct = pick(w.kasas);
      const subs = w.subs.map((x) => ({ ...x, shown: pick(x.kasas) })).filter((x) => x.shown.length > 0 || showAlways);
      return { w, direct, subs, total: direct.length + subs.reduce((n, x) => n + x.shown.length, 0) };
    })
    .filter((g) => g.total > 0 || showAlways);
  const shownCount = groups.reduce((n, g) => n + g.total, 0);
  // Sıralama: görünen komşuyla yer değiştirir; tam listedeki (gizli olanlar dahil) sıra korunur.
  const swapIn = <T,>(full: T[], visibleList: T[], item: T, dir: -1 | 1): T[] | null => {
    const vi = visibleList.indexOf(item);
    const other = visibleList[vi + dir];
    if (vi < 0 || other === undefined) return null;
    const next = [...full];
    const a = next.indexOf(item), b = next.indexOf(other);
    [next[a], next[b]] = [next[b], next[a]];
    return next;
  };
  const moveWorkspace = (key: string, dir: -1 | 1) => {
    const next = swapIn(workspaces.map((w) => w.key), groups.map((g) => g.w.key), key, dir);
    if (next) onReorder?.({ workspaces: next });
  };
  const moveSection = (w: BoardWorkspace, key: string, dir: -1 | 1, visibleKeys: string[]) => {
    const next = swapIn(w.subs.map((x) => x.key), visibleKeys, key, dir);
    if (next) onReorder?.({ sections: next.map((k) => Number(k.slice(4))).filter((n) => Number.isFinite(n)) });
  };
  const moveKasa = (full: BoardKasa[], visibleList: BoardKasa[], k: BoardKasa, dir: -1 | 1) => {
    // Tam liste, ekrandaki sıraya göre: önce görünenler, sonra gizli olanlar.
    const ordered = [...visibleList, ...full.filter((x) => !visibleList.includes(x))];
    const next = swapIn(ordered, visibleList, k, dir);
    if (next) onReorder?.({ kasas: next.map((x) => cashAccounts.find((a) => a.name === x.name)?.id ?? 0).filter((id) => id > 0) });
  };
  const sumMaps = (list: BoardKasa[], pickBy: (k: BoardKasa) => Record<string, number>) => {
    const out: Record<string, number> = {};
    for (const k of list) for (const [c, v] of Object.entries(pickBy(k))) out[c] = (out[c] ?? 0) + v;
    return out;
  };

  const lastDate = (k: BoardKasa) => [...k.direct, ...k.inc, ...k.exp].map((x) => x.date).filter(Boolean).sort().pop() ?? "";

  const renderCard = (k: BoardKasa, w: { color: string; name: string }, ctx?: { full: BoardKasa[]; list: BoardKasa[] }) => {
  const account = cashAccounts.find((a) => a.name === k.name);
  const negative = sumBy(k.totalByCurrency, exchangeRates) < -0.005 || Object.values(k.totalByCurrency).some((v) => v < -0.005);
  const debt = kasaDebtByCurrency(allRecords, k.name);
  const hasDebt = Object.keys(debt).length > 0;
  const shared = (account?.sharedWithUserIds?.length ?? 0) > 0;
  const inUsd = Math.abs(sumBy(k.totalInByCurrency, exchangeRates));
  const outUsd = Math.abs(sumBy(k.totalOutByCurrency, exchangeRates));
  const sumIo = inUsd + outUsd;
  const inPct = sumIo > 0 ? (inUsd / sumIo) * 100 : 0;
  const last = lastDate(k);
  const actions = actionsFor(k.name);
  // Kartın üzerine gelince açılan özet: oluşturucu, toplam/gider/sonuç ve son 3 ayın aylık dökümü.
  const byMonth = new Map<string, { inc: RecordItem[]; exp: RecordItem[] }>();
  for (const x of k.inc) { const m = x.date.slice(0, 7); byMonth.set(m, { inc: [...(byMonth.get(m)?.inc ?? []), x], exp: byMonth.get(m)?.exp ?? [] }); }
  for (const x of k.exp) { const m = x.date.slice(0, 7); byMonth.set(m, { inc: byMonth.get(m)?.inc ?? [], exp: [...(byMonth.get(m)?.exp ?? []), x] }); }
  const months = [...byMonth.entries()].sort((p, q2) => q2[0].localeCompare(p[0])).slice(0, 3).map(([month, r]) => ({
    month,
    inc: combineByCurrency([{ rows: r.inc }]),
    exp: combineByCurrency([{ rows: r.exp }]),
    res: combineByCurrency([{ rows: r.inc }, { rows: r.exp, sign: -1 }]),
  }));
  // Balon kartı örtüp tıklamayı engellemesin: sabit konumla kartın altına (yer yoksa üstüne) yerleşir.
  const placeTip = (e: React.MouseEvent<HTMLElement>) => {
    const card = e.currentTarget;
    const tip = card.querySelector<HTMLElement>(":scope > .kbTip");
    if (!tip) return;
    requestAnimationFrame(() => {
      const r = card.getBoundingClientRect();
      // Balon genişliği kartın genişliğini referans alır.
      tip.style.width = `${r.width}px`;
      const h = tip.offsetHeight, wd = r.width;
      const below = r.bottom + 8 + h <= window.innerHeight || r.top - 8 - h < 0;
      tip.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - wd - 8))}px`;
      tip.style.top = `${below ? r.bottom + 8 : r.top - 8 - h}px`;
    });
  };
  return (
    <article key={k.name} className={`kbCard${negative ? " neg" : ""}`} style={{ borderTopColor: w.color }} onMouseEnter={placeTip}>
      <button type="button" className="kbOpen" onClick={() => onOpen(k.name)} aria-label={`${k.name} — ${tx(language, "kasayı aç", "open cash account", "qaseyê veke")}`}>
        <span className="kbName">{localizeData(k.name, language)}</span>
        <span className="kbWs" style={{ color: w.color }}>◆ {w.name}</span>
        <strong className={`kbBal${negative ? " neg" : ""}`}><MoneyStack by={k.totalByCurrency} /></strong>
        <span className="kbBar" aria-hidden="true">
          <i className="in" style={{ width: `${inPct}%` }} />
          <i className="out" style={{ width: `${sumIo > 0 ? 100 - inPct : 0}%` }} />
        </span>
        <span className="kbIo">
          <span className="pos">↗ <MoneyStack by={k.totalInByCurrency} /></span>
          <span className="neg">↘ <MoneyStack by={k.totalOutByCurrency} /></span>
        </span>
        <span className="kbMeta">
          {last ? `${tx(language, "Son hareket", "Last activity", "Tevgera dawî")} ${date(last, language)}` : tx(language, "Hareket yok", "No activity", "Tevger tune")} · {k.count} {tx(language, "kayıt", "records", "tomar")}
        </span>
        <span className="kbBadges">
          {negative && <span className="lpBadge bad">{tx(language, "Eksi bakiye", "Negative balance", "Balansa neyînî")}</span>}
          {hasDebt && <span className="lpBadge warn">{tx(language, "Borç", "Debt", "Deyn")}: {moneyBreakdown(debt)}</span>}
        </span>
        {(account?.ownerName || shared) && (
          <span className="kbOwner">
            {account?.ownerName ?? ""}{account?.ownerName && shared ? " · " : ""}{shared ? `${account?.sharedWithUserIds.length} ${tx(language, "kişiyle paylaşımlı", "people shared", "kes parvekirî")}` : ""}
          </span>
        )}
      </button>
      {menuFor !== k.name && (
        <div className="kbTip" role="tooltip">
          <div><small>{tx(language, "Kasa Oluşturucu", "Kasa Owner", "Vekera Qaseyê")}</small><strong>{account?.ownerName || tx(language, "Belirtilmedi", "Unassigned", "Nehatiye diyarkirin")}</strong></div>
          <div><small>{tx(language, "Toplam Kasa", "Total In", "Giştî")}</small><strong className="pos"><MoneyStack by={k.totalInByCurrency} /></strong></div>
          <div><small>{tx(language, "Gider", "Expense", "Mesref")}</small><strong className="neg"><MoneyStack by={k.totalOutByCurrency} /></strong></div>
          <div><small>{tx(language, "Sonuç", "Result", "Encam")}</small><strong className={negative ? "neg" : ""}><MoneyStack by={k.totalByCurrency} /></strong></div>
          {months.length > 0 && (
            <table className="kbTipMonths">
              <thead><tr><th>{tx(language, "Ay", "Month", "Meh")}</th><th>{tx(language, "Gelir", "Income", "Dahat")}</th><th>{tx(language, "Gider", "Expense", "Mesref")}</th><th>{tx(language, "Sonuç", "Result", "Encam")}</th></tr></thead>
              <tbody>
                {months.map((m) => (
                  <tr key={m.month}><td>{m.month}</td><td className="pos">{moneyBreakdown(m.inc)}</td><td className="neg">{moneyBreakdown(m.exp)}</td><td>{moneyBreakdown(m.res)}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
      {(actions.length > 0 || account) && (
        <div className="kbMenuWrap">
          <button type="button" className="kbMore" aria-haspopup="menu" aria-expanded={menuFor === k.name} aria-label={tx(language, "Kasa işlemleri", "Cash account actions", "Karên qaseyê")} onClick={() => setMenuFor(menuFor === k.name ? null : k.name)}>⋯</button>
          {menuFor === k.name && (
            <div className="kbMenu" role="menu" onMouseLeave={() => setMenuFor(null)}>
              <button type="button" role="menuitem" onClick={() => { setMenuFor(null); onOpen(k.name); }}>{tx(language, "Aç", "Open", "Veke")}</button>
              {account && <button type="button" onClick={() => { setMenuFor(null); onShare(account); }}>{tx(language, "Paylaş", "Share", "Parve bike")}</button>}
              {canManage && ctx && ctx.list.indexOf(k) > 0 && <button type="button" onClick={() => { setMenuFor(null); moveKasa(ctx.full, ctx.list, k, -1); }}>{tx(language, "← Öne al", "← Move earlier", "← Bîne pêş")}</button>}
                        {canManage && ctx && ctx.list.indexOf(k) < ctx.list.length - 1 && <button type="button" onClick={() => { setMenuFor(null); moveKasa(ctx.full, ctx.list, k, 1); }}>{tx(language, "Geri al →", "Move later →", "Bibe paş →")}</button>}
              {actions.map((a) => (
                <button key={a.label} type="button" className={a.danger ? "danger" : ""} onClick={() => { setMenuFor(null); a.onClick(); }}>{a.label}</button>
              ))}
            </div>
          )}
        </div>
      )}
    </article>
  );
  };

  return (
    <div className="kasaBoard">
      <div className="kbTop">
        <div className="kbStat hero">
          <span>{tx(language, "Toplam kasa", "Total cash", "Qaseya giştî")}</span>
          <strong><MoneyStack by={summary.total} /></strong>
          <small>{all.length} {tx(language, "kasa", "cash accounts", "qase")}</small>
        </div>
        <div className="kbStat">
          <span>{tx(language, "Gelir", "Income", "Dahat")}</span>
          <strong className="pos"><MoneyStack by={summary.inBy} /></strong>
        </div>
        <div className="kbStat">
          <span>{tx(language, "Gider", "Expenses", "Mesref")}</span>
          <strong className="neg"><MoneyStack by={summary.outBy} /></strong>
        </div>
      </div>

      <div className="kbFilters">
        <div className="kbChips" role="tablist" aria-label={tx(language, "Çalışma alanı", "Workspace", "Qada xebatê")}>
          <button type="button" role="tab" aria-selected={ws === "all"} className={ws === "all" ? "on" : ""} onClick={() => setWs("all")}>
            {tx(language, "Tüm kasalar", "All cash accounts", "Hemû qase")} <em>{all.length}</em>
          </button>
          {workspaces.filter((w) => wsKasas(w).length > 0 || canManage).map((w) => (
            <button key={w.key} type="button" role="tab" aria-selected={ws === w.key} className={ws === w.key ? "on" : ""} onClick={() => setWs(w.key)} style={ws === w.key ? { borderColor: w.color, color: w.color } : undefined}>
              <i style={{ background: w.color }} />{w.name} <em>{wsKasas(w).length}</em>
            </button>
          ))}
        </div>
        <div className="kbTools">
          <button type="button" className="kbAdd2" onClick={() => setAllCollapsed(workspaces.map((w) => w.key), collapsed.size < workspaces.length)}>{collapsed.size < workspaces.length ? tx(language, "Tümünü kapat", "Collapse all", "Hemûyan bigire") : tx(language, "Tümünü aç", "Expand all", "Hemûyan veke")}</button>
          {canManage && <button type="button" className="kbAdd" onClick={() => onAddWorkspace?.()}>＋ {tx(language, "Çalışma alanı", "Workspace", "Qada xebatê")}</button>}
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tx(language, "Kasa ara…", "Search cash accounts…", "Qase bigere…")} aria-label={tx(language, "Kasa ara", "Search cash accounts", "Qase bigere")} />
          {emptyCount > 0 && (
            <label className="kbToggle">
              <input type="checkbox" checked={showEmpty} onChange={(e) => setShowEmpty(e.target.checked)} />
              {tx(language, "Boş kasaları göster", "Show empty accounts", "Qaseyên vala nîşan bide")} ({emptyCount})
            </label>
          )}
        </div>
      </div>

      {shownCount === 0 ? (
        <p className="lpEmpty">{tx(language, "Gösterilecek kasa yok.", "No cash accounts to show.", "Qase tune ne.")}</p>
      ) : (
        <div className="kbTree">
          {groups.map(({ w, direct, subs, total }) => (
            <section key={w.key} className="kbWs">
              <header className="kbWsHead" style={{ borderLeftColor: w.color }}>
                <button type="button" className="kbToggle2" aria-expanded={!collapsed.has(w.key)} aria-label={`${w.name} — ${collapsed.has(w.key) ? tx(language, "aç", "expand", "veke") : tx(language, "kapat", "collapse", "bigire")}`} onClick={() => toggleWs(w.key)}>{collapsed.has(w.key) ? "▸" : "▾"}</button>
                <div className="kbWsTitle" onClick={() => toggleWs(w.key)}>
                  <small>{tx(language, "ÇALIŞMA ALANI", "WORKSPACE", "QADA XEBATÊ")}</small>
                  <h3>{w.name}</h3>
                </div>
                {canManage && (
                  <div className="kbCtl" role="group" aria-label={tx(language, "Çalışma alanı yönetimi", "Workspace controls", "Kontrola qada xebatê")}>
                    <button type="button" disabled={groups.findIndex((g) => g.w.key === w.key) === 0} onClick={() => moveWorkspace(w.key, -1)} title={tx(language, "Yukarı taşı", "Move up", "Bibe jor")} aria-label={tx(language, "Çalışma alanını yukarı taşı", "Move workspace up", "Qada xebatê bibe jor")}>↑</button>
                    <button type="button" disabled={groups.findIndex((g) => g.w.key === w.key) === groups.length - 1} onClick={() => moveWorkspace(w.key, 1)} title={tx(language, "Aşağı taşı", "Move down", "Bibe jêr")} aria-label={tx(language, "Çalışma alanını aşağı taşı", "Move workspace down", "Qada xebatê bibe jêr")}>↓</button>
                    <button type="button" onClick={() => onEditGroup?.(w.key, w.name, wsKasas(w).map((k) => k.name))}>✎ {tx(language, "Düzenle / Yetkiler", "Edit / Access", "Biguherîne / Destûr")}</button>
                    <button type="button" onClick={() => onAddSection?.(w.key)}>＋ {tx(language, "Bölüm", "Section", "Beş")}</button>
                    <button type="button" onClick={() => onAddKasa?.(w.key)}>＋ {tx(language, "Kasa", "Cash account", "Qase")}</button>
                  </div>
                )}
                <div className="kbWsMeta">
                  <span>{subs.length > 0 ? `${subs.length} ${tx(language, "bölüm", "sections", "beş")} · ` : ""}{total} {tx(language, "kasa", "cash accounts", "qase")}</span>
                  <strong><MoneyStack by={sumMaps([...direct, ...subs.flatMap((x) => x.shown)], (k) => k.totalByCurrency)} /></strong>
                </div>
              </header>
              {!collapsed.has(w.key) && (<>
              {direct.length === 0 && subs.length === 0 && <p className="kbEmptySec">{tx(language, "Bu çalışma alanında gösterilecek kasa yok — “＋ Kasa” ile ekleyebilirsiniz.", "No cash accounts in this workspace — add one with “＋ Cash account”.", "Di vê qadê de qase tune — bi “＋ Qase” zêde bike.")}</p>}
              {direct.length > 0 && (
                <div className="kbSec">
                  {subs.length > 0 && <h4 className="kbSecHead"><span>{tx(language, "Bölümsüz kasalar", "Cash accounts without a section", "Qaseyên bê beş")}</span><em>{direct.length}</em></h4>}
                  <div className="kbGrid">{direct.map((k) => renderCard(k, w, { full: w.kasas, list: direct }))}</div>
                </div>
              )}
              {subs.map((x) => (
                <div key={x.key} className="kbSec">
                  <h4 className="kbSecHead" style={{ borderLeftColor: x.color }}>
                    <span><small>{tx(language, "BÖLÜM", "SECTION", "BEŞ")}</small>{x.name}</span>
                    <em>{x.shown.length} {tx(language, "kasa", "cash accounts", "qase")} · {moneyBreakdown(sumMaps(x.shown, (k) => k.totalByCurrency))}</em>
                    {canManage && (
                      <span className="kbCtl" role="group" aria-label={tx(language, "Bölüm yönetimi", "Section controls", "Kontrola beşê")}>
                        <button type="button" disabled={subs.findIndex((y) => y.key === x.key) === 0} onClick={() => moveSection(w, x.key, -1, subs.map((y) => y.key))} title={tx(language, "Yukarı taşı", "Move up", "Bibe jor")} aria-label={tx(language, "Bölümü yukarı taşı", "Move section up", "Beşê bibe jor")}>↑</button>
                        <button type="button" disabled={subs.findIndex((y) => y.key === x.key) === subs.length - 1} onClick={() => moveSection(w, x.key, 1, subs.map((y) => y.key))} title={tx(language, "Aşağı taşı", "Move down", "Bibe jêr")} aria-label={tx(language, "Bölümü aşağı taşı", "Move section down", "Beşê bibe jêr")}>↓</button>
                        <button type="button" onClick={() => onEditGroup?.(x.key, x.name, x.kasas.map((k) => k.name))}>✎ {tx(language, "Düzenle / Yetkiler", "Edit / Access", "Biguherîne / Destûr")}</button>
                        <button type="button" onClick={() => onAddKasa?.(x.key)}>＋ {tx(language, "Kasa", "Cash account", "Qase")}</button>
                      </span>
                    )}
                  </h4>
                  {x.shown.length === 0 ? <p className="kbEmptySec">{tx(language, "Bu bölümde gösterilecek kasa yok — “＋ Kasa” ile ekleyebilirsiniz.", "No cash accounts to show in this section — add one with “＋ Cash account”.", "Di vê beşê de qase tune — bi “＋ Qase” zêde bike.")}</p> : <div className="kbGrid">{x.shown.map((k) => renderCard(k, x, { full: x.kasas, list: x.shown }))}</div>}
                </div>
              ))}
              </>)}
            </section>
          ))}
        </div>
      )}
      <small className="kbHint">{tx(language, "Bir kasaya tıklayarak o kasanın gelir ve gider kayıtlarını açın.", "Click a cash account to open its income and expense records.", "Ji bo vekirina tomarên qaseyê li qaseyê bitikîne.")}</small>
    </div>
  );
}

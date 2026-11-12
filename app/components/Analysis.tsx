"use client";

import { TableTools } from "./TableTools";
import { MoneyStack } from "./MoneyStack";
import { useMemo, useState } from "react";
import { PersonChip } from "./shared";
import { localizeData, tx } from "../lib/i18n";
import { combineByCurrency, date, money, moneyBreakdown, toUsd } from "../lib/finance";
import { isDebtLeg } from "../lib/debts";
import type { Language, Page, RecordItem } from "../lib/types";

export type AnalysisTab = "summary" | "kasa" | "income" | "expense";

const monthOf = (x: RecordItem) => (x.date || "").slice(0, 7);
const shiftMonth = (key: string, delta: number) => {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, (m || 1) - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const nowKey = () => new Date().toISOString().slice(0, 7);

type Group = { key: string; usd: number; by: Record<string, number>; n: number };
function group(rows: RecordItem[], keyFn: (x: RecordItem) => string, usd: (x: RecordItem) => number): Group[] {
  const map = new Map<string, Group>();
  for (const x of rows) {
    const key = keyFn(x) || "—";
    const g = map.get(key) ?? { key, usd: 0, by: {}, n: 0 };
    g.usd += usd(x);
    g.by[x.currency] = (g.by[x.currency] ?? 0) + x.amount;
    g.n += 1;
    map.set(key, g);
  }
  return [...map.values()].sort((a, b) => b.usd - a.usd);
}

// Önceki aya göre değişim rozeti. goodWhenUp: artış olumluysa (gelir/sonuç) true, gider için false.
function Delta({ cur, prev, goodWhenUp, language, prevLabel }: { cur: number; prev: number; goodWhenUp: boolean; language: Language; prevLabel: string }) {
  if (Math.abs(cur) < 0.005 && Math.abs(prev) < 0.005) return <small className="anDelta">—</small>;
  if (Math.abs(prev) < 0.005) return <small className="anDelta">{tx(language, `${prevLabel} için kayıt yok`, `No records for ${prevLabel}`, `Ji bo ${prevLabel} tomar tune`)}</small>;
  const diff = cur - prev;
  if (Math.abs(diff) < 0.005) return <small className="anDelta">{tx(language, "Önceki aya göre değişim yok", "No change from last month", "Ji meha borî guhertin tune")}</small>;
  const up = diff > 0;
  const good = goodWhenUp ? up : !up;
  const pct = (Math.abs(diff) / Math.abs(prev)) * 100;
  return (
    <small className={`anDelta ${good ? "good" : "bad"}`}>
      {up ? "▲" : "▼"} %{pct.toLocaleString("tr-TR", { maximumFractionDigits: 1 })} · {up ? "+" : "−"}{money(Math.abs(diff), "USD")}
      <em> {tx(language, `${prevLabel} ayına göre`, `vs ${prevLabel}`, `li gorî ${prevLabel}`)}</em>
    </small>
  );
}

function ShareBars({ items, total, language, tone }: { items: Group[]; total: number; language: Language; tone: "income" | "expense" }) {
  if (!items.length) return <p className="lpEmpty">{tx(language, "Bu dönemde kayıt yok.", "No records in this period.", "Di vê heyamê de tomar tune.")}</p>;
  return (
    <div className="lpBars">
      {items.slice(0, 7).map((g) => {
        const share = total > 0 ? (g.usd / total) * 100 : 0;
        return (
          <div key={g.key} className="lpBarRow">
            <div className="lpBarHead">
              <b>{localizeData(g.key, language)} <em className="anShare">%{share.toLocaleString("tr-TR", { maximumFractionDigits: 1 })}</em></b>
              <strong className="lpMoney"><MoneyStack by={g.by} /></strong>
            </div>
            <div className="lpBarTrack" aria-hidden="true"><i className={tone} style={{ width: `${Math.min(100, Math.max(2, share))}%` }} /></div>
          </div>
        );
      })}
    </div>
  );
}

export function Analysis({
  records,
  language,
  exchangeRates,
  initialTab = "summary",
  initialPeriod,
  goTo,
}: {
  records: RecordItem[];
  language: Language;
  exchangeRates: Record<string, number>;
  initialTab?: AnalysisTab;
  initialPeriod?: string | null;
  goTo: (page: Page) => void;
}) {
  const usd = (x: RecordItem) => toUsd(x.amount, x.currency, exchangeRates) ?? 0;
  const kasaOf = (x: RecordItem) => (x.kind === "cash" ? x.source : x.cashAccount);

  const inc = useMemo(() => records.filter((x) => x.kind === "income" && !isDebtLeg(x)), [records]);
  const exp = useMemo(() => records.filter((x) => x.kind === "expense" && !isDebtLeg(x)), [records]);
  const cash = useMemo(() => records.filter((x) => x.kind === "cash"), [records]);
  const missingRate = records.some((x) => x.amount !== 0 && toUsd(x.amount, x.currency, exchangeRates) === null);

  const withData = (k: string) => inc.some((x) => monthOf(x) === k) || exp.some((x) => monthOf(x) === k);
  const monthKeys = [...new Set([...inc, ...exp].map(monthOf).filter(Boolean).concat(nowKey()))].sort().reverse();
  const defaultMonth = withData(nowKey()) ? nowKey() : monthKeys.find(withData) ?? nowKey();
  const [tab, setTab] = useState<AnalysisTab>(initialTab);
  const [period, setPeriod] = useState<string>(initialPeriod || defaultMonth);
  const prev = shiftMonth(period, -1);

  const monthLabel = (k: string) => {
    const [y, m] = k.split("-").map(Number);
    return new Date(y, (m || 1) - 1, 1).toLocaleDateString(language === "en" ? "en-US" : "tr-TR", { month: "long", year: "numeric" });
  };
  const monthShort = (k: string) => {
    const [y, m] = k.split("-").map(Number);
    return new Date(y, (m || 1) - 1, 1).toLocaleDateString(language === "en" ? "en-US" : "tr-TR", { month: "short" });
  };
  const monthName = (k: string) => {
    const [y, m] = k.split("-").map(Number);
    return new Date(y, (m || 1) - 1, 1).toLocaleDateString(language === "en" ? "en-US" : "tr-TR", { month: "long" });
  };

  const sum = (rows: RecordItem[]) => rows.reduce((t, x) => t + usd(x), 0);
  const curInc = inc.filter((x) => monthOf(x) === period);
  const curExp = exp.filter((x) => monthOf(x) === period);
  const prevInc = inc.filter((x) => monthOf(x) === prev);
  const prevExp = exp.filter((x) => monthOf(x) === prev);
  const curCash = cash.filter((x) => monthOf(x) === period);
  const incUsd = sum(curInc), expUsd = sum(curExp), prevIncUsd = sum(prevInc), prevExpUsd = sum(prevExp);
  const netUsd = incUsd - expUsd, prevNetUsd = prevIncUsd - prevExpUsd;
  const prevName = monthName(prev);

  // Kasa durumu (Ana Sayfa ile aynı kural: kasa kaydı + bağlı gelir − bağlı gider; borç hareketleri bakiyeye dahildir).
  const kasaNames = [...new Set(records.map(kasaOf).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const kasaRows = kasaNames.map((name) => {
    const all = records.filter((x) => kasaOf(x) === name);
    const balanceBy = combineByCurrency([{ rows: all.filter((x) => x.kind !== "expense") }, { rows: all.filter((x) => x.kind === "expense"), sign: -1 }]);
    const balanceUsd = sum(all.filter((x) => x.kind !== "expense")) - sum(all.filter((x) => x.kind === "expense"));
    const pi = curInc.filter((x) => kasaOf(x) === name), pe = curExp.filter((x) => kasaOf(x) === name);
    const ppi = prevInc.filter((x) => kasaOf(x) === name);
    return { name, balanceBy, balanceUsd, incBy: combineByCurrency([{ rows: pi }]), expBy: combineByCurrency([{ rows: pe }]), incUsd: sum(pi), expUsd: sum(pe), prevIncUsd: sum(ppi) };
  }).sort((a, b) => b.balanceUsd - a.balanceUsd);
  const totalBalanceBy = combineByCurrency([{ rows: cash }, { rows: records.filter((x) => x.kind === "income" && x.cashAccount) }, { rows: records.filter((x) => x.kind === "expense" && x.cashAccount), sign: -1 }]);
  const totalBalanceUsd = kasaRows.reduce((t, k) => t + k.balanceUsd, 0);
  const cashTotalBy = combineByCurrency([{ rows: cash }]);
  const negativeKasas = kasaRows.filter((k) => k.balanceUsd < -0.005);
  const emptyKasas = kasaRows.filter((k) => Math.abs(k.balanceUsd) < 0.005);

  // Son 6 ay eğilimi (USD karşılığı)
  const trend = Array.from({ length: 6 }, (_, i) => shiftMonth(period, i - 5)).map((k) => ({ k, inc: sum(inc.filter((x) => monthOf(x) === k)), exp: sum(exp.filter((x) => monthOf(x) === k)) }));
  const trendMax = Math.max(...trend.flatMap((t) => [t.inc, t.exp]), 1);

  // Analiz özeti (otomatik cümleler)
  type Insight = { tone: "good" | "warn" | "info"; text: string };
  const insights: Insight[] = [];
  const pctOf = (cur: number, p: number) => (p !== 0 ? (Math.abs(cur - p) / Math.abs(p)) * 100 : 0);
  const fmtPct = (v: number) => v.toLocaleString("tr-TR", { maximumFractionDigits: 1 });
  if (prevIncUsd > 0) {
    const d = incUsd - prevIncUsd;
    if (d < -0.005) insights.push({ tone: "warn", text: tx(language, `Gelir ${prevName} ayına göre %${fmtPct(pctOf(incUsd, prevIncUsd))} düştü (${money(Math.abs(d), "USD")} azalış).`, `Income fell ${fmtPct(pctOf(incUsd, prevIncUsd))}% vs ${prevName} (${money(Math.abs(d), "USD")} less).`, `Dahat li gorî ${prevName} %${fmtPct(pctOf(incUsd, prevIncUsd))} kêm bû.`) });
    else if (d > 0.005) insights.push({ tone: "good", text: tx(language, `Gelir ${prevName} ayına göre %${fmtPct(pctOf(incUsd, prevIncUsd))} arttı (${money(d, "USD")} artış).`, `Income rose ${fmtPct(pctOf(incUsd, prevIncUsd))}% vs ${prevName} (${money(d, "USD")} more).`, `Dahat li gorî ${prevName} %${fmtPct(pctOf(incUsd, prevIncUsd))} zêde bû.`) });
    else insights.push({ tone: "info", text: tx(language, `Gelir ${prevName} ayıyla aynı düzeyde.`, `Income is level with ${prevName}.`, `Dahat wekî ${prevName} e.`) });
  } else {
    insights.push({ tone: "info", text: tx(language, `${prevName} ayında gelir kaydı olmadığı için karşılaştırma yapılamıyor.`, `No income in ${prevName}, so no comparison is possible.`, `Di ${prevName} de dahat tune, ji ber vê yekê berawirdkirin nayê kirin.`) });
  }
  if (prevExpUsd > 0) {
    const d = expUsd - prevExpUsd;
    if (d > 0.005) insights.push({ tone: "warn", text: tx(language, `Gider ${prevName} ayına göre %${fmtPct(pctOf(expUsd, prevExpUsd))} arttı (${money(d, "USD")} artış).`, `Expenses rose ${fmtPct(pctOf(expUsd, prevExpUsd))}% vs ${prevName} (${money(d, "USD")} more).`, `Mesref li gorî ${prevName} %${fmtPct(pctOf(expUsd, prevExpUsd))} zêde bû.`) });
    else if (d < -0.005) insights.push({ tone: "good", text: tx(language, `Gider ${prevName} ayına göre %${fmtPct(pctOf(expUsd, prevExpUsd))} azaldı (${money(Math.abs(d), "USD")} tasarruf).`, `Expenses fell ${fmtPct(pctOf(expUsd, prevExpUsd))}% vs ${prevName} (${money(Math.abs(d), "USD")} less).`, `Mesref li gorî ${prevName} %${fmtPct(pctOf(expUsd, prevExpUsd))} kêm bû.`) });
  }
  insights.push(netUsd >= 0
    ? { tone: "good", text: tx(language, `${monthName(period)} sonucu ${money(netUsd, "USD")} fazla (gelir − gider).`, `${monthName(period)} result is a ${money(netUsd, "USD")} surplus (income − expenses).`, `Encama ${monthName(period)} ${money(netUsd, "USD")} zêde ye.`) }
    : { tone: "warn", text: tx(language, `${monthName(period)} sonucu ${money(Math.abs(netUsd), "USD")} açık (gider geliri aşıyor).`, `${monthName(period)} result is a ${money(Math.abs(netUsd), "USD")} deficit (expenses exceed income).`, `Encama ${monthName(period)} ${money(Math.abs(netUsd), "USD")} kêmasî ye.`) });
  if (incUsd > 0) insights.push({ tone: expUsd / incUsd > 1 ? "warn" : "info", text: tx(language, `Giderler gelirin %${fmtPct((expUsd / incUsd) * 100)}'ini oluşturuyor.`, `Expenses equal ${fmtPct((expUsd / incUsd) * 100)}% of income.`, `Mesref %${fmtPct((expUsd / incUsd) * 100)} ya dahatê ye.`) });
  const topExpKasa = group(curExp, kasaOf, usd)[0];
  const topIncKasa = group(curInc, kasaOf, usd)[0];
  if (topIncKasa) insights.push({ tone: "info", text: tx(language, `En çok gelir: ${topIncKasa.key} (${moneyBreakdown(topIncKasa.by)}).`, `Top income source: ${topIncKasa.key} (${moneyBreakdown(topIncKasa.by)}).`, `Dahata herî mezin: ${topIncKasa.key}.`) });
  if (topExpKasa) insights.push({ tone: "info", text: tx(language, `En çok gider: ${topExpKasa.key} (${moneyBreakdown(topExpKasa.by)}).`, `Top expense: ${topExpKasa.key} (${moneyBreakdown(topExpKasa.by)}).`, `Mesrefa herî mezin: ${topExpKasa.key}.`) });
  if (negativeKasas.length) insights.push({ tone: "warn", text: tx(language, `${negativeKasas.length} kasanın bakiyesi eksi: ${negativeKasas.slice(0, 3).map((k) => k.name).join(", ")}${negativeKasas.length > 3 ? "…" : ""}.`, `${negativeKasas.length} cash account(s) are negative: ${negativeKasas.slice(0, 3).map((k) => k.name).join(", ")}.`, `${negativeKasas.length} qase di bin sifirê de ne.`) });
  if (emptyKasas.length) insights.push({ tone: "info", text: tx(language, `${emptyKasas.length} kasanın bakiyesi sıfır.`, `${emptyKasas.length} cash account(s) have a zero balance.`, `${emptyKasas.length} qase sifir in.`) });

  const tabs: { id: AnalysisTab; label: string }[] = [
    { id: "summary", label: tx(language, "Özet", "Summary", "Kurte") },
    { id: "kasa", label: tx(language, "Kasalar", "Cash accounts", "Qase") },
    { id: "income", label: tx(language, "Gelirler", "Income", "Dahat") },
    { id: "expense", label: tx(language, "Giderler", "Expenses", "Mesref") },
  ];

  const topRecords = (rows: RecordItem[]) => [...rows].sort((a, b) => usd(b) - usd(a)).slice(0, 5);
  const flowTab = (kind: "income" | "expense") => {
    const rows = kind === "income" ? curInc : curExp;
    const prevRows = kind === "income" ? prevInc : prevExp;
    const total = kind === "income" ? incUsd : expUsd;
    const prevTotal = kind === "income" ? prevIncUsd : prevExpUsd;
    const by = combineByCurrency([{ rows }]);
    return (
      <>
        <div className="lpGrid anTop">
          <section className="panel">
            <div className="lpPanelHead"><div><h3>{kind === "income" ? tx(language, "Dönem Geliri", "Period Income", "Dahatê Heyamê") : tx(language, "Dönem Gideri", "Period Expenses", "Mesrefa Heyamê")} · {monthLabel(period)}</h3><small>{rows.length} {tx(language, "kayıt", "records", "tomar")}</small></div></div>
            <strong className={`anBig lpMoney ${kind === "income" ? "pos" : "neg"}`}><MoneyStack by={by} /></strong>
            <Delta cur={total} prev={prevTotal} goodWhenUp={kind === "income"} language={language} prevLabel={prevName} />
            <small className="anNote">{tx(language, "Önceki ay", "Previous month", "Meha borî")} ({monthLabel(prev)}): {moneyBreakdown(combineByCurrency([{ rows: prevRows }]))} · {prevRows.length} {tx(language, "kayıt", "records", "tomar")}</small>
          </section>
          <section className="panel">
            <div className="lpPanelHead"><div><h3>{tx(language, "Son 6 ay", "Last 6 months", "6 mehên dawî")}</h3><small>{tx(language, "USD karşılığı", "USD equivalent", "Wekheva USD")}</small></div></div>
            <div className="anTrend">
              {trend.map((t) => (
                <div key={t.k} className={`anTrendCol ${t.k === period ? "on" : ""}`} title={`${monthLabel(t.k)} — ${money(t.inc, "USD")} / ${money(t.exp, "USD")}`}>
                  <div className="anTrendBars">
                    <i className={kind === "income" ? "income" : "expense"} style={{ height: `${Math.max(2, ((kind === "income" ? t.inc : t.exp) / trendMax) * 100)}%` }} />
                  </div>
                  <small>{monthShort(t.k)}</small>
                </div>
              ))}
            </div>
          </section>
        </div>
        <div className="lpGrid anTop">
          <section className="panel">
            <div className="lpPanelHead"><div><h3>{tx(language, "Kasalara göre dağılım", "By cash account", "Li gorî qaseyê")}</h3><small>{tx(language, "Payı ve tutarı", "Share and amount", "Par û mêjer")}</small></div></div>
            <ShareBars items={group(rows, kasaOf, usd)} total={total} language={language} tone={kind} />
          </section>
          <section className="panel">
            <div className="lpPanelHead"><div><h3>{tx(language, "Kişilere göre dağılım", "By person", "Li gorî kesê")}</h3><small>{tx(language, "Kayıtta yazan kişi", "Person on the record", "Kesê di tomarê de")}</small></div></div>
            <ShareBars items={group(rows, (x) => x.person, usd)} total={total} language={language} tone={kind} />
          </section>
        </div>
        <section className="panel anTop">
          <div className="lpPanelHead"><div><h3>{tx(language, "En büyük 5 kayıt", "Top 5 records", "5 tomarên herî mezin")}</h3><small>{monthLabel(period)}</small></div>
            <button type="button" className="lpTextBtn" onClick={() => goTo(kind)}>{tx(language, "Tüm kayıtlar", "All records", "Hemû tomar")} →</button></div>
          <div className="lpTableWrap">
            <TableTools id="analysis-1" language={language} resize={false}><table className="lpTable anRecords">
              <thead><tr><th>{tx(language, "İşlem", "Transaction", "Muamele")}</th><th>{tx(language, "Kasa", "Cash account", "Qase")}</th><th>{tx(language, "Kişi", "Person", "Kes")}</th><th>{tx(language, "Tutar", "Amount", "Mêjer")}</th></tr></thead>
              <tbody>
                {topRecords(rows).length === 0 && <tr><td colSpan={4} className="lpEmpty">{tx(language, "Bu dönemde kayıt yok.", "No records in this period.", "Di vê heyamê de tomar tune.")}</td></tr>}
                {topRecords(rows).map((x) => (
                  <tr key={x.id}>
                    <td><strong>{localizeData(x.source, language)}</strong><small>{date(x.date, language)}</small></td>
                    <td>{localizeData(kasaOf(x) || "—", language)}</td>
                    <td>{x.person ? <PersonChip name={x.person}>{localizeData(x.person, language)}</PersonChip> : "—"}</td>
                    <td className={`lpMoney ${kind === "income" ? "pos" : "neg"}`}>{kind === "income" ? "+" : "−"}{money(x.amount, x.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table></TableTools>
          </div>
        </section>
      </>
    );
  };

  return (
    <div className="analysisPage">
      <div className="anHead">
        <div>
          <span className="lpEyebrow">{tx(language, "ANALİZ", "ANALYSIS", "ANALÎZ")}</span>
          <h2>{tx(language, "Kasa, gelir ve gider analizi", "Cash, income and expense analysis", "Analîza qase, dahat û mesrefê")}</h2>
        </div>
        <label className="lpPeriod anPeriod">
          <span>{tx(language, "Dönem", "Period", "Heyam")}</span>
          <select value={period} onChange={(e) => setPeriod(e.target.value)} aria-label={tx(language, "Dönem seçimi", "Select period", "Heyam hilbijêre")}>
            {monthKeys.map((k) => <option key={k} value={k}>{monthLabel(k)}</option>)}
          </select>
        </label>
      </div>
      <div className="anTabs" role="tablist">
        {tabs.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? "on" : ""} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>
      {missingRate && (
        <p className="anNotice">{tx(language, "Bazı para birimleri için güncel kur bulunamadı; karşılaştırmalarda bu kayıtlar USD toplamına dahil edilmedi.", "No current rate for some currencies; those records are left out of the USD comparisons.", "Ji bo hin diravan kur nehat dîtin; ev tomar di berawirdkirinê de nehatin hesibandin.")}</p>
      )}

      {tab === "summary" && (
        <>
          <div className="lpMetrics anMetrics">
            <div className="lpMetric">
              <span className="lpIcon income">↗</span>
              <span className="lpLabel">{tx(language, "Dönem Geliri", "Period Income", "Dahatê Heyamê")} · {monthLabel(period)}</span>
              <strong><MoneyStack by={combineByCurrency([{ rows: curInc }])} /></strong>
              <Delta cur={incUsd} prev={prevIncUsd} goodWhenUp language={language} prevLabel={prevName} />
            </div>
            <div className="lpMetric">
              <span className="lpIcon expense">↘</span>
              <span className="lpLabel">{tx(language, "Dönem Gideri", "Period Expenses", "Mesrefa Heyamê")} · {monthLabel(period)}</span>
              <strong><MoneyStack by={combineByCurrency([{ rows: curExp }])} /></strong>
              <Delta cur={expUsd} prev={prevExpUsd} goodWhenUp={false} language={language} prevLabel={prevName} />
            </div>
            <div className="lpMetric net">
              <span className="lpIcon">=</span>
              <span className="lpLabel">{tx(language, "Dönem Sonucu", "Period Result", "Encama Heyamê")}</span>
              <strong><MoneyStack by={combineByCurrency([{ rows: curInc }, { rows: curExp, sign: -1 }])} /></strong>
              <Delta cur={netUsd} prev={prevNetUsd} goodWhenUp language={language} prevLabel={prevName} />
            </div>
            <div className="lpMetric hero">
              <span className="lpLabel">{tx(language, "Mevcut Kasa Bakiyesi", "Current Cash Balance", "Balansa Qaseyê")}</span>
              <strong><MoneyStack by={totalBalanceBy} /></strong>
              <small>≈ {money(totalBalanceUsd, "USD")} · {kasaRows.length} {tx(language, "kasa", "cash accounts", "qase")}</small>
            </div>
          </div>
          <div className="lpGrid anTop">
            <section className="panel">
              <div className="lpPanelHead"><div><h3>{tx(language, "Analiz özeti", "Analysis summary", "Kurteya analîzê")}</h3><small>{monthLabel(period)} · {tx(language, "otomatik değerlendirme", "automatic review", "nirxandina otomatîk")}</small></div></div>
              <ul className="anInsights">
                {insights.map((i, idx) => (
                  <li key={idx} className={i.tone}><span aria-hidden="true">{i.tone === "good" ? "✔" : i.tone === "warn" ? "!" : "i"}</span>{i.text}</li>
                ))}
              </ul>
            </section>
            <section className="panel">
              <div className="lpPanelHead"><div><h3>{tx(language, "Son 6 ay", "Last 6 months", "6 mehên dawî")}</h3><small>{tx(language, "Gelir ve gider · USD karşılığı", "Income and expenses · USD equivalent", "Dahat û mesref · wekheva USD")}</small></div></div>
              <div className="anTrend">
                {trend.map((t) => (
                  <div key={t.k} className={`anTrendCol ${t.k === period ? "on" : ""}`} title={`${monthLabel(t.k)} — ${tx(language, "Gelir", "Income", "Dahat")} ${money(t.inc, "USD")} / ${tx(language, "Gider", "Expense", "Mesref")} ${money(t.exp, "USD")}`}>
                    <div className="anTrendBars">
                      <i className="income" style={{ height: `${Math.max(2, (t.inc / trendMax) * 100)}%` }} />
                      <i className="expense" style={{ height: `${Math.max(2, (t.exp / trendMax) * 100)}%` }} />
                    </div>
                    <small>{monthShort(t.k)}</small>
                  </div>
                ))}
              </div>
              <div className="anLegend"><span><i className="income" />{tx(language, "Gelir", "Income", "Dahat")}</span><span><i className="expense" />{tx(language, "Gider", "Expense", "Mesref")}</span></div>
            </section>
          </div>
        </>
      )}

      {tab === "kasa" && (
        <>
          <div className="lpMetrics anMetrics">
            <div className="lpMetric hero">
              <span className="lpLabel">{tx(language, "Toplam Kasa Gelirleri", "Total Cash Income", "Dahatên Giştî yên Qaseyê")}</span>
              <strong><MoneyStack by={cashTotalBy} /></strong>
              <small>{cash.length} {tx(language, "kasa kaydı", "cash entries", "tomara qaseyê")} · {monthLabel(period)}: {moneyBreakdown(combineByCurrency([{ rows: curCash }]))}</small>
            </div>
            <div className="lpMetric net">
              <span className="lpIcon">▣</span>
              <span className="lpLabel">{tx(language, "Mevcut Kasa Bakiyesi", "Current Cash Balance", "Balansa Qaseyê")}</span>
              <strong><MoneyStack by={totalBalanceBy} /></strong>
              <small>≈ {money(totalBalanceUsd, "USD")}</small>
            </div>
            <div className="lpMetric">
              <span className="lpIcon expense">!</span>
              <span className="lpLabel">{tx(language, "Eksi bakiyeli kasa", "Negative balance", "Qaseyên bi balansa neyînî")}</span>
              <strong>{negativeKasas.length}</strong>
              <small>{negativeKasas.length ? negativeKasas.slice(0, 2).map((k) => k.name).join(", ") : tx(language, "Yok", "None", "Tune")}</small>
            </div>
            <div className="lpMetric">
              <span className="lpIcon">○</span>
              <span className="lpLabel">{tx(language, "Bakiyesi sıfır olan kasa", "Zero balance", "Qaseyên bi balansa sifir")}</span>
              <strong>{emptyKasas.length}</strong>
              <small>{tx(language, `${kasaRows.length} kasadan`, `of ${kasaRows.length}`, `ji ${kasaRows.length} qaseyan`)}</small>
            </div>
          </div>
          <section className="panel anTop">
            <div className="lpPanelHead"><div><h3>{tx(language, "Kasaların durumu", "Cash account status", "Rewşa qaseyan")}</h3><small>{tx(language, `Bakiye anlık; gelir/gider ${monthLabel(period)} dönemine ait`, `Balance is current; income/expenses are for ${monthLabel(period)}`, `Balans niha ye; dahat/mesref ya ${monthLabel(period)} e`)}</small></div>
              <button type="button" className="lpTextBtn" onClick={() => goTo("cash")}>{tx(language, "Kasalar sayfası", "Cash accounts page", "Rûpela qaseyan")} →</button></div>
            <div className="lpTableWrap">
              <TableTools id="analysis-2" language={language} resize={false}><table className="lpTable anKasaTable">
                <thead><tr><th>{tx(language, "Kasa", "Cash account", "Qase")}</th><th>{tx(language, "Bakiye", "Balance", "Balans")}</th><th>{tx(language, "Dönem geliri", "Period income", "Dahatê heyamê")}</th><th>{tx(language, "Dönem gideri", "Period expenses", "Mesrefa heyamê")}</th><th>{tx(language, "Gelir değişimi", "Income change", "Guherîna dahatê")}</th></tr></thead>
                <tbody>
                  {kasaRows.map((k) => (
                    <tr key={k.name}>
                      <td><strong>{localizeData(k.name, language)}</strong>{k.balanceUsd < -0.005 && <span className="lpBadge bad">{tx(language, "Eksi", "Negative", "Neyînî")}</span>}</td>
                      <td className={`lpMoney ${k.balanceUsd < -0.005 ? "neg" : ""}`}><MoneyStack by={k.balanceBy} /></td>
                      <td className="lpMoney pos">{Object.keys(k.incBy).length ? <MoneyStack by={k.incBy} /> : "—"}</td>
                      <td className="lpMoney neg">{Object.keys(k.expBy).length ? <MoneyStack by={k.expBy} /> : "—"}</td>
                      <td><Delta cur={k.incUsd} prev={k.prevIncUsd} goodWhenUp language={language} prevLabel={prevName} /></td>
                    </tr>
                  ))}
                </tbody>
              </table></TableTools>
            </div>
          </section>
        </>
      )}

      {tab === "income" && flowTab("income")}
      {tab === "expense" && flowTab("expense")}
    </div>
  );
}

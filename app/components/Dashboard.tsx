"use client";

import { TableTools } from "./TableTools";
import { MoneyStack } from "./MoneyStack";
import { useEffect, useState } from "react";
import { Title, PersonChip } from "./shared";
import { localizeData, tx } from "../lib/i18n";
import { combineByCurrency, date, money, moneyBreakdown, total } from "../lib/finance";
import { isDebtLeg } from "../lib/debts";
import type { CashTransfer, Language, Page, RecordItem } from "../lib/types";
import type { AnalysisTab } from "./Analysis";

function Stat({
  label,
  linkLabel,
  display,
  tone,
  icon,
  onClick,
}: {
  label: string;
  linkLabel: string;
  display: string;
  tone: string;
  icon: string;
  onClick: () => void;
}) {
  return (
    <button className={`stat ${tone}`} onClick={onClick} title={linkLabel}>
      <span>
        <small>{label}</small>
        <b>{display}</b>
        <em>{linkLabel} →</em>
      </span>
      <i>{icon}</i>
    </button>
  );
}

function Bar({
  label,
  value,
  max,
  tone,
  display,
}: {
  label: string;
  value: number;
  max: number;
  tone: "income" | "expense" | "net";
  display?: string;
}) {
  return (
    <div className="lpBarRow">
      <div className="lpBarHead">
        <b>{label}</b>
        <strong className="lpMoney">{display ?? money(value)}</strong>
      </div>
      <div className="lpBarTrack" aria-hidden="true">
        <i className={tone} style={{ width: `${Math.min(100, Math.max(3, (Math.abs(value) / max) * 100))}%` }} />
      </div>
    </div>
  );
}

export function Dashboard({
  records,
  language,
  goTo,
  onOpenAnalysis,
  exchangeRates = {},
  rateInfo,
  cashTransfers = [],
  myCashAccountIds = [],
  profileName = "",
  onTransfersChanged,
}: {
  records: RecordItem[];
  language: Language;
  goTo: (page: Page) => void;
  onOpenAnalysis?: (tab: AnalysisTab, period: string | null) => void;
  exchangeRates?: Record<string, number>;
  rateInfo?: { manual: Record<string, number>; auto: Record<string, number>; date: string | null };
  cashTransfers?: CashTransfer[];
  myCashAccountIds?: number[];
  profileName?: string;
  onTransfersChanged?: () => void;
}) {
  // Alınan borç girişi ve borç ödemesi kasa bakiyesine girer ama gelir/gider/net toplamlarına ve analize girmez.
  const cashRows = records.filter((x) => x.kind === "cash");
  const incomeRows = records.filter((x) => x.kind === "income" && !isDebtLeg(x));
  const expenseRows = records.filter((x) => x.kind === "expense" && !isDebtLeg(x));
  const linkedIncomeRows = records.filter((x) => x.kind === "income" && x.cashAccount);
  const linkedExpenseRows = records.filter((x) => x.kind === "expense" && x.cashAccount);
  const cashIn = total(cashRows);
  const income = total(incomeRows) + cashIn,
    expense = total(expenseRows);
  const cashBalance = cashIn + total(linkedIncomeRows) - total(linkedExpenseRows);
  // Per-currency breakdowns for the card text (see combineByCurrency) — the
  // scalar values above stay blended and are only used for the bar chart's
  // relative widths, never shown to the user as a money figure.
  const incomeByCurrency = combineByCurrency([{ rows: incomeRows }, { rows: cashRows }]);
  const expenseByCurrency = combineByCurrency([{ rows: expenseRows }]);
  const netByCurrency = combineByCurrency([{ rows: incomeRows }, { rows: cashRows }, { rows: expenseRows, sign: -1 }]);
  const cashBalanceByCurrency = combineByCurrency([
    { rows: cashRows },
    { rows: linkedIncomeRows },
    { rows: linkedExpenseRows, sign: -1 },
  ]);
  // Gelir – Gider Analizi için kasa seçimi: boş = tüm kasalar; seçilen kasalara göre analiz yenilenir.
  const kasaOf = (x: RecordItem) => (x.kind === "cash" ? x.source : x.cashAccount);
  const kasaNames = [...new Set(records.map(kasaOf).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const [picked, setPicked] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const analysisRecords = picked.length ? records.filter((x) => picked.includes(kasaOf(x))) : records;
  const aCash = analysisRecords.filter((x) => x.kind === "cash");
  const aIncome = analysisRecords.filter((x) => x.kind === "income" && !isDebtLeg(x));
  const aExpense = analysisRecords.filter((x) => x.kind === "expense" && !isDebtLeg(x));
  const aIncomeTotal = total(aIncome) + total(aCash);
  const aExpenseTotal = total(aExpense);
  const aIncomeBy = combineByCurrency([{ rows: aIncome }, { rows: aCash }]);
  const aExpenseBy = combineByCurrency([{ rows: aExpense }]);
  const aNetBy = combineByCurrency([{ rows: aIncome }, { rows: aCash }, { rows: aExpense, sign: -1 }]);
  const shownKasas = picked.length ? picked : kasaNames;
  // Kasa sonuçları varsayılan olarak 7 satır gösterilir; "Tümünü göster" ile geri kalanı açılır.
  const KASA_PREVIEW = 7;
  const [showAllKasas, setShowAllKasas] = useState(false);
  const visibleKasas = showAllKasas ? shownKasas : shownKasas.slice(0, KASA_PREVIEW);
  const recent = [...records]
    .filter((x) => x.kind !== "cash")
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);
  // Dönem (ay) seçimi: dönem geliri / gideri yalnız seçili ayın kayıtlarını toplar.
  const monthOf = (x: RecordItem) => (x.date || "").slice(0, 7);
  const nowKey = new Date().toISOString().slice(0, 7);
  const monthKeys = [...new Set([...records.filter((x) => (x.kind === "income" || x.kind === "expense") && !isDebtLeg(x)).map(monthOf).filter(Boolean), nowKey])].sort().reverse();
  const hasData = (k: string) => records.some((x) => (x.kind === "income" || x.kind === "expense") && !isDebtLeg(x) && monthOf(x) === k);
  const defaultMonth = hasData(nowKey) ? nowKey : monthKeys.find(hasData) ?? nowKey;
  const [period, setPeriod] = useState<string | null>(null);
  const periodKey = period ?? defaultMonth;
  const monthLabel = (k: string) => {
    const [y, m] = k.split("-").map(Number);
    return new Date(y, (m || 1) - 1, 1).toLocaleDateString(language === "en" ? "en-US" : "tr-TR", { month: "long", year: "numeric" });
  };
  const periodIncomeBy = combineByCurrency([{ rows: incomeRows.filter((x) => monthOf(x) === periodKey) }]);
  const periodExpenseBy = combineByCurrency([{ rows: expenseRows.filter((x) => monthOf(x) === periodKey) }]);
  const periodIncomeCount = incomeRows.filter((x) => monthOf(x) === periodKey).length;
  const periodExpenseCount = expenseRows.filter((x) => monthOf(x) === periodKey).length;
  // Toplam kasa gelirleri: kasalara girilen (Kasa kaydı) toplam tutarlar.
  const cashIncomeBy = combineByCurrency([{ rows: cashRows }]);

  // Bekleyen onaylar: bana gelen (onayımı bekleyen) ve gönderdiğim (karşı tarafın onayını bekleyen) kasa aktarımları.
  const [approvingId, setApprovingId] = useState<number | null>(null);
  const mine = (id: number) => myCashAccountIds.includes(id);
  const pendingAll = cashTransfers.filter((t) => t.status === "pending");
  const incomingTransfers = pendingAll.filter((t) => mine(t.toCashAccountId) || (!!profileName && t.recipientUserName === profileName));
  const outgoingTransfers = pendingAll.filter((t) => !incomingTransfers.includes(t) && (mine(t.fromCashAccountId) || (!!profileName && t.createdByUserName === profileName)));
  async function approve(id: number) {
    setApprovingId(id);
    try {
      const response = await fetch(`/api/cash-transfers/${id}/confirm`, { method: "POST" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        alert(body.error || tx(language, "Aktarım onaylanamadı.", "The transfer could not be confirmed.", "Veguhastin nehat erêkirin."));
        return;
      }
      onTransfersChanged?.();
    } catch {
      alert(tx(language, "Aktarım onaylanamadı.", "The transfer could not be confirmed.", "Veguhastin nehat erêkirin."));
    } finally {
      setApprovingId(null);
    }
  }

  // Belgeler ve Mesajlar: eki olan son kayıtlar + son yorum akışları (yorum izni yoksa sessizce boş kalır).
  type Thread = { record: { id: number; source: string; kind: string }; comments: { userName: string; text: string; createdAt: string }[]; hasUnread: boolean };
  const [threads, setThreads] = useState<Thread[]>([]);
  useEffect(() => {
    let alive = true;
    fetch("/api/comments")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d && Array.isArray(d.threads)) setThreads(d.threads as Thread[]); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  const docRecords = [...records].filter((x) => (x.attachments?.length ?? 0) > 0).sort((a, b) => b.date.localeCompare(a.date));
  const docCount = docRecords.reduce((t, x) => t + (x.attachments?.length ?? 0), 0);
  const unreadThreads = threads.filter((t) => t.hasUnread).length;

  // Döviz durumu: seçilen para biriminin günlük kuru ve kasalardaki karşılığı.
  const RATE_LIST: { code: string; name: [string, string, string]; country: [string, string, string] }[] = [
    { code: "USD", name: ["Dolar", "US Dollar", "Dolar"], country: ["ABD", "USA", "DYA"] },
    { code: "EUR", name: ["Euro", "Euro", "Euro"], country: ["Avrupa", "Europe", "Ewropa"] },
    { code: "TRY", name: ["Türk Lirası", "Turkish Lira", "Lîreya Tirk"], country: ["Türkiye", "Türkiye", "Tirkiye"] },
    { code: "SYP", name: ["Suriye Lirası", "Syrian Pound", "Lîreya Sûrî"], country: ["Suriye", "Syria", "Sûriye"] },
    { code: "IQD", name: ["Irak Dinarı", "Iraqi Dinar", "Dînarê Iraqî"], country: ["Irak", "Iraq", "Iraq"] },
    { code: "AED", name: ["BAE Dirhemi", "UAE Dirham", "Dirhema BAE"], country: ["BAE", "UAE", "BAE"] },
  ];
  const [rateCur, setRateCur] = useState("USD");
  const [convAmount, setConvAmount] = useState("100");
  const curInfo = RATE_LIST.find((c) => c.code === rateCur) ?? RATE_LIST[0];
  const curRate = rateCur === "USD" ? 1 : exchangeRates[rateCur];
  const curManual = rateCur !== "USD" && !!rateInfo?.manual?.[rateCur];
  const heldByCur = cashBalanceByCurrency[rateCur] ?? 0;
  const heldUsd = curRate ? heldByCur / curRate : null;
  const convNum = Number(convAmount.replace(",", "."));
  const convUsd = curRate && Number.isFinite(convNum) ? convNum / curRate : null;
  const fmtRate = (v: number) => v.toLocaleString("tr-TR", { maximumFractionDigits: v < 1 ? 6 : 4 });
  const labels =
    language === "tr"
      ? {
          income: "Toplam Gelir",
          expense: "Toplam Gider",
          net: "Net Sonuç",
          cash: "Mevcut Kasa Bakiyesi",
          all: "Tüm kayıtları gör",
          analysis: "Gelir – Gider Analizi",
          analysisSub: "Ana başlıklara göre karşılaştırma",
          barIncome: "Gelir",
          barExpense: "Gider",
          barNet: "Net",
          recent: "Son Hareketler",
          recentSub: "En güncel gelir ve gider kayıtları",
        }
      : language === "en"
        ? {
            income: "Total Income",
            expense: "Total Expenses",
            net: "Net Result",
            cash: "Current Cash Balance",
            all: "View all records",
            analysis: "Income – Expense Analysis",
            analysisSub: "Comparison by main categories",
            barIncome: "Income",
            barExpense: "Expenses",
            barNet: "Net",
            recent: "Recent Transactions",
            recentSub: "Latest income and expense records",
          }
        : {
            income: "Dahata Giştî",
            expense: "Mesrefa Giştî",
            net: "Encama Paqij",
            cash: "Balansa Qaseyê",
            all: "Hemû qeydan bibîne",
            analysis: "Analîza Dahat û Mesrefan",
            analysisSub: "Li gorî sernavên sereke berawird bike",
            barIncome: "Dahat",
            barExpense: "Mesref",
            barNet: "Paqij",
            recent: "Tevgerên Dawî",
            recentSub: "Qeydên herî dawî yên dahat û mesrefan",
          };
  return (
    <>
      <div className="lpPeriod">
        <label>
          <span>{tx(language, "Dönem", "Period", "Heyam")}</span>
          <select value={periodKey} onChange={(e) => setPeriod(e.target.value)} aria-label={tx(language, "Dönem seçimi", "Select period", "Heyam hilbijêre")}>
            {monthKeys.map((k) => <option key={k} value={k}>{monthLabel(k)}</option>)}
          </select>
        </label>
      </div>
      <div className="lpMetrics">
        <button type="button" className="lpMetric hero" onClick={() => (onOpenAnalysis ? onOpenAnalysis("kasa", periodKey) : goTo("cash"))} title={tx(language, "Kasa analizini aç", "Open cash analysis", "Analîza qaseyê veke")}>
          <span className="lpLabel">{tx(language, "Toplam Kasa Gelirleri", "Total Cash Income", "Dahatên Giştî yên Qaseyê")}</span>
          <strong><MoneyStack by={cashIncomeBy} /></strong>
          <small>{kasaNames.length} {tx(language, "kasa", "cash accounts", "qase")} · {cashRows.length} {tx(language, "kasa kaydı", "cash entries", "tomara qaseyê")}</small>
        </button>
        <button type="button" className="lpMetric" onClick={() => (onOpenAnalysis ? onOpenAnalysis("income", periodKey) : goTo("income"))} title={tx(language, "Gelir analizini aç", "Open income analysis", "Analîza dahatê veke")}>
          <span className="lpIcon income">↗</span>
          <span className="lpLabel">{tx(language, "Dönem Geliri", "Period Income", "Dahatê Heyamê")} · {monthLabel(periodKey)}</span>
          <strong><MoneyStack by={periodIncomeBy} /></strong>
          <small>{periodIncomeCount} {tx(language, "gelir kaydı", "income records", "tomara dahatê")} · {tx(language, "analiz", "analysis", "analîz")} →</small>
        </button>
        <button type="button" className="lpMetric" onClick={() => (onOpenAnalysis ? onOpenAnalysis("expense", periodKey) : goTo("expense"))} title={tx(language, "Gider analizini aç", "Open expense analysis", "Analîza mesrefê veke")}>
          <span className="lpIcon expense">↘</span>
          <span className="lpLabel">{tx(language, "Dönem Gideri", "Period Expenses", "Mesrefa Heyamê")} · {monthLabel(periodKey)}</span>
          <strong><MoneyStack by={periodExpenseBy} /></strong>
          <small>{periodExpenseCount} {tx(language, "gider kaydı", "expense records", "tomara mesrefê")} · {tx(language, "analiz", "analysis", "analîz")} →</small>
        </button>
        <button type="button" className="lpMetric net" onClick={() => goTo("cash")} title={labels.all}>
          <span className="lpIcon">▣</span>
          <span className="lpLabel">{labels.cash}</span>
          <strong><MoneyStack by={cashBalanceByCurrency} /></strong>
          <small>{tx(language, "Tüm kasaların anlık toplamı", "Current total of all cash accounts", "Berhevoka niha ya hemû qaseyan")}</small>
        </button>
      </div>
      <div className="lpAnalysis">
        <section className="panel">
          <div className="lpPanelHead">
            <div>
              <h3>{labels.analysis}</h3>
              <small>{labels.analysisSub}</small>
            </div>
            <div className="lpPicker">
              <button type="button" className="lpGhostBtn" aria-expanded={pickerOpen} onClick={() => setPickerOpen((v) => !v)}>
                ▣ {tx(language, "Kasa seç", "Select cash accounts", "Qase hilbijêre")} ({picked.length ? picked.length : tx(language, "Tümü", "All", "Hemû")}) {pickerOpen ? "▴" : "▾"}
              </button>
              {picked.length > 0 && (
                <button type="button" className="lpGhostBtn" onClick={() => setPicked([])}>✕ {tx(language, "Seçimi temizle", "Clear selection", "Hilbijartinê paqij bike")}</button>
              )}
              {pickerOpen && (
                <div className="lpPickerMenu">
                  {kasaNames.length === 0 && <small>—</small>}
                  {kasaNames.map((name) => (
                    <label key={name} className="checkField">
                      <input
                        type="checkbox"
                        checked={picked.includes(name)}
                        onChange={(e) => setPicked((prev) => (e.target.checked ? [...prev, name] : prev.filter((n) => n !== name)))}
                      />
                      {localizeData(name, language)}
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="lpBars">
            <Bar label={labels.barIncome} tone="income" value={aIncomeTotal} max={Math.max(aIncomeTotal, aExpenseTotal, 1)} display={moneyBreakdown(aIncomeBy)} />
            <Bar label={labels.barExpense} tone="expense" value={aExpenseTotal} max={Math.max(aIncomeTotal, aExpenseTotal, 1)} display={moneyBreakdown(aExpenseBy)} />
            <Bar label={labels.barNet} tone="net" value={aIncomeTotal - aExpenseTotal} max={Math.max(aIncomeTotal, aExpenseTotal, 1)} display={moneyBreakdown(aNetBy)} />
          </div>
          {shownKasas.length > 0 && (
            <div className="lpTableWrap">
              <TableTools id="dash-1" language={language} resize={false}><table className="lpTable lpKasaTable">
                <thead>
                  <tr>
                    <th>{tx(language, "Kasa", "Cash account", "Qase")}</th>
                    <th>{tx(language, "Gelir", "Income", "Dahat")}</th>
                    <th>{tx(language, "Gider", "Expense", "Mesref")}</th>
                    <th>{tx(language, "Net", "Net", "Paqij")}</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleKasas.map((name) => {
                    const rows = records.filter((x) => kasaOf(x) === name);
                    const inc = combineByCurrency([{ rows: rows.filter((x) => x.kind === "income" || x.kind === "cash") }]);
                    const exp = combineByCurrency([{ rows: rows.filter((x) => x.kind === "expense") }]);
                    const net = combineByCurrency([{ rows: rows.filter((x) => x.kind !== "expense") }, { rows: rows.filter((x) => x.kind === "expense"), sign: -1 }]);
                    return (
                      <tr key={name}>
                        <td><strong>{localizeData(name, language)}</strong></td>
                        <td className="lpMoney pos"><MoneyStack by={inc} /></td>
                        <td className="lpMoney neg"><MoneyStack by={exp} /></td>
                        <td className="lpMoney"><MoneyStack by={net} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table></TableTools>
            </div>
          )}
          {shownKasas.length > KASA_PREVIEW && (
            <button type="button" className="lpMoreBtn" aria-expanded={showAllKasas} onClick={() => setShowAllKasas((v) => !v)}>
              {showAllKasas
                ? `▴ ${tx(language, "Daha az göster", "Show less", "Kêmtir nîşan bide")}`
                : `▾ ${tx(language, "Tümünü göster", "Show all", "Hemûyan nîşan bide")} (+${shownKasas.length - KASA_PREVIEW})`}
            </button>
          )}
        </section>
      </div>
      <div className="lpGrid">
        <section className="panel">
          <div className="lpPanelHead">
            <div>
              <h3>{labels.recent}</h3>
              <small>{labels.recentSub}</small>
            </div>
            <button type="button" className="lpTextBtn" onClick={() => goTo("activity")}>{tx(language, "Tüm işlemleri gör", "View all activity", "Hemû çalakiyan bibîne")} →</button>
          </div>
          <div className="lpTableWrap">
            <TableTools id="dash-2" language={language} resize={false}><table className="lpTable">
              <thead>
                <tr>
                  <th>{tx(language, "İşlem", "Transaction", "Muamele")}</th>
                  <th>{tx(language, "Kasa", "Cash account", "Qase")}</th>
                  <th>{tx(language, "Tür", "Type", "Cure")}</th>
                  <th>{tx(language, "Tutar", "Amount", "Mêjer")}</th>
                </tr>
              </thead>
              <tbody>
                {recent.length === 0 && (
                  <tr><td colSpan={4} className="lpEmpty">{tx(language, "Henüz gelir veya gider kaydı yok.", "No income or expense records yet.", "Hê qeyda dahat an mesrefê tune.")}</td></tr>
                )}
                {recent.map((x) => (
                  <tr key={x.id}>
                    <td>
                      <strong>{localizeData(x.source, language)}</strong>
                      <small>{date(x.date, language)} · <PersonChip name={x.person}>{localizeData(x.person, language)}</PersonChip></small>
                    </td>
                    <td>{localizeData(x.cashAccount || "—", language)}</td>
                    <td><span className={`lpBadge ${x.kind === "income" ? "good" : "bad"}`}>{x.kind === "income" ? tx(language, "Gelir", "Income", "Dahat") : tx(language, "Gider", "Expense", "Mesref")}</span></td>
                    <td className={`lpMoney ${x.kind === "income" ? "pos" : "neg"}`}>{x.kind === "income" ? "+" : "−"}{money(x.amount, x.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table></TableTools>
          </div>
        </section>
        <section className="panel lpFx">
          <div className="lpPanelHead">
            <div>
              <h3>{tx(language, "Günlük Döviz Durumu", "Daily Exchange Rates", "Rewşa Dravê ya Rojane")}</h3>
              <small>{tx(language, "Bir para birimi / ülke seçin", "Select a currency / country", "Dirav / welatek hilbijêre")}</small>
            </div>
          </div>
          <div className="lpFxTabs" role="tablist">
            {RATE_LIST.map((c) => (
              <button key={c.code} type="button" role="tab" aria-selected={rateCur === c.code} className={rateCur === c.code ? "on" : ""} onClick={() => setRateCur(c.code)}>
                <b>{c.code}</b>
                <small>{tx(language, c.country[0], c.country[1], c.country[2])}</small>
              </button>
            ))}
          </div>
          <div className="lpFxBody">
            <span className="lpFxName">{tx(language, curInfo.name[0], curInfo.name[1], curInfo.name[2])} · {tx(language, curInfo.country[0], curInfo.country[1], curInfo.country[2])}</span>
            {rateCur === "USD" ? (
              <div className="lpFxList">
                {RATE_LIST.filter((c) => c.code !== "USD").map((c) => (
                  <div key={c.code}>
                    <span>1 USD</span>
                    <b className="lpMoney">{exchangeRates[c.code] ? fmtRate(exchangeRates[c.code]) : "—"} {c.code}</b>
                  </div>
                ))}
              </div>
            ) : curRate ? (
              <>
                <strong className="lpFxRate lpMoney">1 USD = {fmtRate(curRate)} {rateCur}</strong>
                <span className="lpFxInv lpMoney">1 {rateCur} = {fmtRate(1 / curRate)} USD</span>
              </>
            ) : (
              <p className="lpEmpty">{tx(language, "Bu para birimi için kur henüz alınamadı.", "No rate available yet for this currency.", "Ji bo vê diravê kur hê nehatiye girtin.")}</p>
            )}
            <div className="lpFxRow">
              <span>{tx(language, "Kasalardaki bakiye", "Balance in cash accounts", "Balansa qaseyan")}</span>
              <b className="lpMoney">{money(heldByCur, rateCur)}{heldUsd !== null && rateCur !== "USD" ? ` ≈ ${money(heldUsd, "USD")}` : ""}</b>
            </div>
            {rateCur !== "USD" && curRate && (
              <label className="lpFxConv">
                <input inputMode="decimal" value={convAmount} onChange={(e) => setConvAmount(e.target.value)} aria-label={tx(language, "Çevrilecek tutar", "Amount to convert", "Mêjera veguhestinê")} />
                <span>{rateCur} =</span>
                <b className="lpMoney">{convUsd !== null ? money(convUsd, "USD") : "—"}</b>
              </label>
            )}
            <small className="lpFxSource">
              {curManual ? tx(language, "Elle girilmiş kur", "Manually entered rate", "Kura bi destî hatiye nivîsandin") : tx(language, "Kaynak: open.er-api.com (günlük)", "Source: open.er-api.com (daily)", "Çavkanî: open.er-api.com (rojane)")}
              {rateInfo?.date ? ` · ${date(rateInfo.date, language)}` : ""}
            </small>
          </div>
        </section>
      </div>
      <div className="lpGrid lpGridFlip">
        <section className="panel">
          <div className="lpPanelHead">
            <div>
              <h3>{tx(language, "Belgeler ve Mesajlar", "Documents and Messages", "Belge û Peyam")}</h3>
              <small>{docCount} {tx(language, "belge", "documents", "belge")} · {unreadThreads} {tx(language, "okunmamış mesaj", "unread messages", "peyama nexwendî")}</small>
            </div>
            <button type="button" className="lpTextBtn" onClick={() => goTo("comments")}>{tx(language, "Tüm mesajlar", "All messages", "Hemû peyam")} →</button>
          </div>
          <h4 className="lpSubHead">{tx(language, "Son belgeler", "Latest documents", "Belgeyên dawî")}</h4>
          {docRecords.length === 0 && <p className="lpEmpty">{tx(language, "Belge eklenmiş kayıt yok.", "No records with documents.", "Tomarên bi belge tune.")}</p>}
          {docRecords.slice(0, 4).map((x) => (
            <button type="button" key={x.id} className="lpDocRow" onClick={() => goTo(x.kind === "cash" ? "cash" : x.kind)}>
              <span className="lpDocIcon" aria-hidden="true">📎</span>
              <span className="lpDocText">
                <b>{x.attachments?.[0]?.name}{(x.attachments?.length ?? 0) > 1 ? ` +${(x.attachments?.length ?? 0) - 1}` : ""}</b>
                <small>{localizeData(x.source, language)} · {date(x.date, language)}</small>
              </span>
              <span className={`lpBadge ${x.kind === "income" ? "good" : x.kind === "expense" ? "bad" : ""}`}>{x.kind === "income" ? tx(language, "Gelir", "Income", "Dahat") : x.kind === "expense" ? tx(language, "Gider", "Expense", "Mesref") : tx(language, "Kasa", "Cash", "Qase")}</span>
            </button>
          ))}
          <h4 className="lpSubHead">{tx(language, "Son mesajlar", "Latest messages", "Peyamên dawî")}</h4>
          {threads.length === 0 && <p className="lpEmpty">{tx(language, "Henüz mesaj yok.", "No messages yet.", "Hê peyam tune.")}</p>}
          {threads.slice(0, 3).map((t) => {
            const last = t.comments[t.comments.length - 1];
            return (
              <button type="button" key={t.record.id} className="lpDocRow" onClick={() => goTo("comments")}>
                <span className="lpDocIcon" aria-hidden="true">💬</span>
                <span className="lpDocText">
                  <b>{localizeData(t.record.source, language)}</b>
                  <small>{last.userName}: {last.text}</small>
                </span>
                {t.hasUnread && <span className="lpBadge warn">{tx(language, "Yeni", "New", "Nû")}</span>}
              </button>
            );
          })}
        </section>
        <section className="panel">
          <div className="lpPanelHead">
            <div>
              <h3>{tx(language, "Bekleyen Onaylar", "Pending Approvals", "Erêkirinên li Bendê")}</h3>
              <small>{tx(language, "Kasa aktarımları ve onay durumları", "Cash transfers and approval status", "Veguhestinên qaseyê û rewşa erêkirinê")}</small>
            </div>
            <span className={`lpBadge ${incomingTransfers.length ? "warn" : ""}`}>{incomingTransfers.length + outgoingTransfers.length}</span>
          </div>
          {incomingTransfers.length + outgoingTransfers.length === 0 && (
            <p className="lpEmpty">{tx(language, "Onay bekleyen aktarım yok.", "No transfers awaiting approval.", "Veguhestina li benda erêkirinê tune.")}</p>
          )}
          {incomingTransfers.map((t) => (
            <div key={t.id} className="lpApprovalRow">
              <div>
                <b>{localizeData(t.fromCashAccountName, language)} → {localizeData(t.toCashAccountName, language)}</b>
                <small>{t.createdByUserName} {tx(language, "gönderdi", "sent", "şand")} · {date(t.date, language)}{t.recipientUserName ? ` · ${tx(language, "Alıcı", "Recipient", "Wergir")}: ${t.recipientUserName}` : ""}</small>
                <span className="lpBadge warn">{tx(language, "Onayınız bekleniyor", "Awaiting your approval", "Li benda erêkirina te")}</span>
              </div>
              <div className="lpApprovalSide">
                <strong className="lpMoney">{money(t.amount, t.currency)}</strong>
                {mine(t.toCashAccountId) && (
                  <button type="button" className="lpApproveBtn" disabled={approvingId === t.id} onClick={() => approve(t.id)}>
                    {approvingId === t.id ? "…" : tx(language, "Onayla", "Approve", "Erê bike")}
                  </button>
                )}
              </div>
            </div>
          ))}
          {outgoingTransfers.map((t) => (
            <div key={t.id} className="lpApprovalRow">
              <div>
                <b>{localizeData(t.fromCashAccountName, language)} → {localizeData(t.toCashAccountName, language)}</b>
                <small>{date(t.date, language)}{t.recipientUserName ? ` · ${tx(language, "Alıcı", "Recipient", "Wergir")}: ${t.recipientUserName}` : t.recipientPerson ? ` · ${t.recipientPerson}` : ""}</small>
                <span className="lpBadge">{tx(language, "Karşı tarafın onayı bekleniyor", "Awaiting the recipient's approval", "Li benda erêkirina aliyê din")}</span>
              </div>
              <div className="lpApprovalSide"><strong className="lpMoney">{money(t.amount, t.currency)}</strong></div>
            </div>
          ))}
        </section>
      </div>
    </>
  );
}

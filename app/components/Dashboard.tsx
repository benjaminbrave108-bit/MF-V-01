"use client";

import { useState } from "react";
import { Title } from "./shared";
import { localizeData, tx } from "../lib/i18n";
import { combineByCurrency, date, money, moneyBreakdown, total } from "../lib/finance";
import type { Language, Page, RecordItem } from "../lib/types";

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
  expense,
  display,
}: {
  label: string;
  value: number;
  max: number;
  expense?: boolean;
  display?: string;
}) {
  return (
    <div>
      <span>
        <b>{label}</b>
        <strong>{display ?? money(value)}</strong>
      </span>
      <i>
        <em
          className={expense ? "expense" : ""}
          style={{ width: `${Math.max(4, (Math.abs(value) / max) * 100)}%` }}
        ></em>
      </i>
    </div>
  );
}

export function Dashboard({
  records,
  language,
  goTo,
}: {
  records: RecordItem[];
  language: Language;
  goTo: (page: Page) => void;
}) {
  const cashRows = records.filter((x) => x.kind === "cash");
  const incomeRows = records.filter((x) => x.kind === "income");
  const expenseRows = records.filter((x) => x.kind === "expense");
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
  const aIncome = analysisRecords.filter((x) => x.kind === "income");
  const aExpense = analysisRecords.filter((x) => x.kind === "expense");
  const aIncomeTotal = total(aIncome) + total(aCash);
  const aExpenseTotal = total(aExpense);
  const aIncomeBy = combineByCurrency([{ rows: aIncome }, { rows: aCash }]);
  const aExpenseBy = combineByCurrency([{ rows: aExpense }]);
  const aNetBy = combineByCurrency([{ rows: aIncome }, { rows: aCash }, { rows: aExpense, sign: -1 }]);
  const shownKasas = picked.length ? picked : kasaNames;
  const recent = [...records]
    .filter((x) => x.kind !== "cash")
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);
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
      <div className="stats">
        <Stat
          label={labels.income}
          linkLabel={labels.all}
          display={moneyBreakdown(incomeByCurrency)}
          tone="green"
          icon="↗"
          onClick={() => goTo("income")}
        />
        <Stat
          label={labels.expense}
          linkLabel={labels.all}
          display={moneyBreakdown(expenseByCurrency)}
          tone="orange"
          icon="↘"
          onClick={() => goTo("expense")}
        />
        <Stat
          label={labels.net}
          linkLabel={labels.all}
          display={moneyBreakdown(netByCurrency)}
          tone="blue"
          icon="="
          onClick={() => goTo("reportBuilder")}
        />
        <Stat
          label={labels.cash}
          linkLabel={labels.all}
          display={moneyBreakdown(cashBalanceByCurrency)}
          tone="purple"
          icon="▣"
          onClick={() => goTo("cash")}
        />
      </div>
      <div className="twoCols">
        <div className="panel">
          <Title title={labels.analysis} sub={labels.analysisSub} />
          <div className="analysisKasaPicker">
            <button type="button" className="light compact" onClick={() => setPickerOpen((v) => !v)}>
              ▣ {tx(language, "Kasa seç", "Select cash accounts", "Qase hilbijêre")} ({picked.length ? picked.length : tx(language, "Tümü", "All", "Hemû")}) {pickerOpen ? "▴" : "▾"}
            </button>
            {picked.length > 0 && (
              <button type="button" className="light compact" onClick={() => setPicked([])}>✕ {tx(language, "Tümünü göster", "Show all", "Hemûyan nîşan bide")}</button>
            )}
            {pickerOpen && (
              <div className="analysisKasaMenu">
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
          <div className="bars">
            <Bar label={labels.barIncome} value={aIncomeTotal} max={Math.max(aIncomeTotal, aExpenseTotal, 1)} display={moneyBreakdown(aIncomeBy)} />
            <Bar label={labels.barExpense} value={aExpenseTotal} max={Math.max(aIncomeTotal, aExpenseTotal, 1)} expense display={moneyBreakdown(aExpenseBy)} />
            <Bar label={labels.barNet} value={aIncomeTotal - aExpenseTotal} max={Math.max(aIncomeTotal, aExpenseTotal, 1)} display={moneyBreakdown(aNetBy)} />
          </div>
          {shownKasas.length > 0 && (
            <div className="analysisKasaTable">
              {shownKasas.map((name) => {
                const rows = records.filter((x) => kasaOf(x) === name);
                const inc = combineByCurrency([{ rows: rows.filter((x) => x.kind === "income" || x.kind === "cash") }]);
                const exp = combineByCurrency([{ rows: rows.filter((x) => x.kind === "expense") }]);
                const net = combineByCurrency([{ rows: rows.filter((x) => x.kind !== "expense") }, { rows: rows.filter((x) => x.kind === "expense"), sign: -1 }]);
                return (
                  <div key={name}>
                    <b>{localizeData(name, language)}</b>
                    <span className="in">↗ {moneyBreakdown(inc)}</span>
                    <span className="out">↘ {moneyBreakdown(exp)}</span>
                    <strong>{moneyBreakdown(net)}</strong>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="panel">
          <Title title={labels.recent} sub={labels.recentSub} />
          <div className="recent">
            {recent.map((x) => (
              <div key={x.id}>
                <i className={x.kind}></i>
                <span>
                  <b>{localizeData(x.source, language)}</b>
                  <small>
                    {date(x.date, language)} ·{" "}
                    {localizeData(x.person, language)}
                  </small>
                </span>
                <strong>
                  {x.kind === "income" ? "+" : "-"}
                  {money(x.amount, x.currency)}
                </strong>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

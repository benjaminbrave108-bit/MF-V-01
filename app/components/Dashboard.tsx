"use client";

import { Title } from "./shared";
import { localizeData } from "../lib/i18n";
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
}: {
  label: string;
  value: number;
  max: number;
  expense?: boolean;
}) {
  return (
    <div>
      <span>
        <b>{label}</b>
        <strong>{money(value)}</strong>
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
          <div className="bars">
            <Bar
              label={labels.barIncome}
              value={income}
              max={Math.max(income, expense)}
            />
            <Bar
              label={labels.barExpense}
              value={expense}
              max={Math.max(income, expense)}
              expense
            />
            <Bar
              label={labels.barNet}
              value={income - expense}
              max={Math.max(income, expense)}
            />
          </div>
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

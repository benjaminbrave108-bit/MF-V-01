"use client";

import { useMemo, useState } from "react";
import ExcelJS from "exceljs";
import { Title, DeleteConfirmModal, PersonChip } from "./shared";
import { TableTools } from "./TableTools";
import { tx, localizeData } from "../lib/i18n";
import { date, money, moneyBreakdown, total } from "../lib/finance";
import type { CashAccountSummary, KasaSection, Language, PreparedReport, Profile, RecordItem, ReportLine } from "../lib/types";
import { ExcelImportModal } from "./ExcelImport";
import { ConsolidatePanel } from "./ConsolidatePanel";

// Rapor satırları kendi para birimiyle (USD, SYP, EUR...) tutulur; toplamlar para birimi başına ayrı hesaplanır.
type Totals = Record<string, number>;
const lineCurrency = (line: { currency?: string }) => line.currency || "USD";
function sumBy(lines: { amount: number; currency?: string }[]): Totals {
  const t: Totals = {};
  for (const line of lines) t[lineCurrency(line)] = Math.round(((t[lineCurrency(line)] ?? 0) + line.amount) * 100) / 100;
  return t;
}
function diffBy(a: Totals, b: Totals): Totals {
  const t: Totals = { ...a };
  for (const [c, v] of Object.entries(b)) t[c] = Math.round(((t[c] ?? 0) - v) * 100) / 100;
  return t;
}
const isNegative = (t: Totals) => Object.values(t).some((v) => v < 0);
const excelMoneyFormat = (currency: string) => (currency === "USD" ? "$ #,##0.00;[Red]-$ #,##0.00" : `"${currency}" #,##0.00;[Red]-"${currency}" #,##0.00`);

export function ReportBuilder({
  language,
  records,
  preparedReports,
  onCreateReport,
  onUpdateReport,
  onDeleteReport,
  profile,
  checkPassword,
  cashAccounts,
  sections,
  tab,
  onTabChange,
  onDataChanged,
}: {
  language: Language;
  records: RecordItem[];
  preparedReports: PreparedReport[];
  onCreateReport: (report: PreparedReport) => void;
  onUpdateReport: (report: PreparedReport) => void;
  onDeleteReport: (id: string, reason: string) => void;
  profile: Profile;
  checkPassword: (password: string) => Promise<boolean>;
  cashAccounts: CashAccountSummary[];
  sections: KasaSection[];
  tab: "prepare" | "upload";
  onTabChange: (tab: "prepare" | "upload") => void;
  onDataChanged: () => void;
}) {
  const [uploadOpen, setUploadOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editingReport, setEditingReport] = useState<PreparedReport | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PreparedReport | null>(null);
  const sorted = [...preparedReports].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (tab === "upload") {
    return (
      <div className="panel reportBuilderPage">
        <div className="reportTabs">
          <button type="button" onClick={() => onTabChange("prepare")}>{tx(language, "Rapor Hazırla", "Prepare Report", "Raporê Amade Bike")}</button>
          <button type="button" className="active">{tx(language, "Rapor Yükle", "Upload Report", "Raporê Barke")}</button>
        </div>
        <div className="toolbar">
          <Title
            title={tx(language, "Rapor Yükle", "Upload Report", "Raporê Barke")}
            sub={tx(language, "Excel raporunu bir çalışma alanı ve kasaya yükleyin; aylık gelir/gider olarak işlenir", "Upload an Excel report into a workspace and cash account; it is booked as monthly income/expense", "Raporeke Excel li qada xebatê û qaseyekê barke; wekî dahat/mesrefa mehane tê tomarkirin")}
          />
          <button className="primary" onClick={() => setUploadOpen(true)}>⇧ {tx(language, "Excel Yükle", "Upload Excel", "Excel Barke")}</button>
        </div>
        <ol className="reportUploadSteps">
          <li>{tx(language, "Excel dosyasını seçin.", "Choose the Excel file.", "Pela Excel hilbijêre.")}</li>
          <li>{tx(language, "Hangi çalışma alanına ve kasaya ekleneceğini seçin (kasa zorunludur).", "Choose which workspace and cash account it goes to (a cash account is required).", "Hilbijêre ku biçe kîjan qada xebatê û qaseyê (qase mecbûrî ye).")}</li>
          <li>{tx(language, "Aylık tek kalem mi, her satır ayrı mı; Excel detayı eklensin mi — seçin.", "Choose monthly single item or one record per row, and whether to attach the Excel detail.", "Hilbijêre yek kalemê mehane an her rêz cuda, û detaya Excel were zêdekirin an na.")}</li>
          <li>{tx(language, "Her ay Gelir veya Gider sayfasında ve seçtiğiniz kasada tek kalem olarak görünür; kayıttaki Detay'a basınca Excel verisinin özeti açılır.", "Each month appears as a single item on the Income or Expense page and in the chosen cash account; opening the record's Detail shows a summary of the Excel data.", "Her meh li rûpela Dahat an Mesref û di qaseya hilbijartî de wekî yek kalem xuya dibe; bi tikandina Hûrguliyê kurteya daneyên Excel vedibe.")}</li>
        </ol>
        <ConsolidatePanel language={language} onDone={onDataChanged} />
        {uploadOpen && (
          <ExcelImportModal language={language} cashAccounts={cashAccounts} sections={sections} onClose={() => setUploadOpen(false)} onDone={onDataChanged} />
        )}
      </div>
    );
  }
  return (
    <div className="panel reportBuilderPage">
      <div className="reportTabs">
        <button type="button" className="active">{tx(language, "Rapor Hazırla", "Prepare Report", "Raporê Amade Bike")}</button>
        <button type="button" onClick={() => onTabChange("upload")}>{tx(language, "Rapor Yükle", "Upload Report", "Raporê Barke")}</button>
      </div>
      <div className="toolbar">
        <Title
          title={tx(language, "Rapor Hazırla", "Prepare Report", "Raporê Amade Bike")}
          sub={tx(
            language,
            "Kasa, Gelir ve Gider kayıtlarından seçerek mali rapor oluşturun",
            "Create a financial report by selecting from Cash, Income and Expense records",
            "Ji qeydên Qase, Dahat û Mesrefê raporeke darayî çêbikin",
          )}
        />
        <button className="primary" onClick={() => setCreating(true)}>＋ {tx(language, "Yeni Rapor", "New Report", "Rapora Nû")}</button>
      </div>
      <div className="monthlyDocumentList">
        {sorted.map((report) => {
          const totalIncome = sumBy(report.income);
          const totalExpense = sumBy(report.expense);
          const totalResult = diffBy(totalIncome, totalExpense);
          const open = openId === report.id;
          return (
            <article key={report.id} className={`monthlyDocument ${open ? "open" : ""}`}>
              <button className="monthlyDocumentSummary" onClick={() => setOpenId(open ? null : report.id)}>
                <span><b>{report.title}</b><small>{date(report.date, language)} · {report.presentedTo || tx(language, "Belirtilmedi", "Not specified", "Nehatiye diyarkirin")}</small></span>
                <strong className="typeIncome">{moneyBreakdown(totalIncome)}</strong>
                <strong className="typeExpense">{moneyBreakdown(totalExpense)}</strong>
                <strong>{moneyBreakdown(totalResult)}</strong>
                <i>{open ? "⌃" : "⌄"}</i>
              </button>
              {open && (
                <div className="monthlyDocumentBody reportTemplate">
                  <header className="templateHeading">
                    <b>{report.title}</b>
                    <span>{report.cashAccount ? `${report.cashAccount} · ` : ""}{date(report.date, language)}{report.presentedTo ? ` · ${report.presentedTo}` : ""}</span>
                  </header>
                  <div className="reportResultCards">
                    <div><small>{tx(language, "Toplam Gelir", "Total Income", "Dahata Giştî")}</small><b className="typeIncome">{moneyBreakdown(totalIncome)}</b></div>
                    <div><small>{tx(language, "Toplam Gider", "Total Expense", "Mesrefa Giştî")}</small><b className="typeExpense">{moneyBreakdown(totalExpense)}</b></div>
                    <div><small>{tx(language, "Sonuç", "Result", "Encam")}</small><b>{moneyBreakdown(totalResult)}</b></div>
                  </div>
                  {report.detail && <p className="reportBuilderDetail">{report.detail}</p>}
                  <TemplateTable title={tx(language, "Gelir", "Income", "Dahat")} kind="income" lines={report.income} total={totalIncome} language={language} />
                  <TemplateTable title={tx(language, "Gider", "Expense", "Mesref")} kind="expense" lines={report.expense} total={totalExpense} language={language} />
                  <div className="templateTotals">
                    <div><b>{tx(language, "Toplam Gelir", "Total Income", "Dahata Giştî")}</b><strong>{moneyBreakdown(totalIncome)}</strong></div>
                    <div><b>{tx(language, "Toplam Gider", "Total Expense", "Mesrefa Giştî")}</b><strong>{moneyBreakdown(totalExpense)}</strong></div>
                    <div className={isNegative(totalResult) ? "debt" : ""}><b>{tx(language, "Sonuç", "Result", "Encam")}</b><strong>{moneyBreakdown(totalResult)}</strong></div>
                  </div>
                  <div className="reportSignatureRow">
                    <div><small>{tx(language, "Hazırlayan", "Prepared by", "Amade kir")}</small><b>{profile.name}</b></div>
                    <div><small>{tx(language, "Rapor İmzası", "Report Signature", "Îmzeya Raporê")}</small><b>{report.signature || "—"}</b></div>
                  </div>
                  <div className="builderFooter reportCardFooter">
                    <button type="button" className="light" onClick={() => setEditingReport(report)}>✎ {tx(language, "Düzenle", "Edit", "Biguherîne")}</button>
                    <button type="button" className="light" onClick={() => downloadPreparedReport(report, language)}>⇩ {tx(language, "İndir", "Download", "Dakêşe")}</button>
                    <button type="button" className="light redText" onClick={() => setDeleteTarget(report)}>🗑 {tx(language, "Sil", "Delete", "Jêbibe")}</button>
                  </div>
                </div>
              )}
            </article>
          );
        })}
        {!sorted.length && (
          <div className="empty reportEmpty">
            {tx(language, "Henüz oluşturulmuş rapor yok.", "No report created yet.", "Hêj rapor nehatiye çêkirin.")}
          </div>
        )}
      </div>
      {creating && (
        <ReportBuilderModal
          language={language}
          records={records}
          onClose={() => setCreating(false)}
          onSave={(report) => {
            onCreateReport(report);
            setOpenId(report.id);
            setCreating(false);
          }}
        />
      )}
      {editingReport && (
        <ReportBuilderModal
          language={language}
          records={records}
          initial={editingReport}
          onClose={() => setEditingReport(null)}
          onSave={(report) => {
            onUpdateReport(report);
            setOpenId(report.id);
            setEditingReport(null);
          }}
        />
      )}
      {deleteTarget && (
        <DeleteConfirmModal
          language={language}
          itemLabel={deleteTarget.title}
          checkPassword={checkPassword}
          onClose={() => setDeleteTarget(null)}
          onConfirm={(reason) => {
            onDeleteReport(deleteTarget.id, reason);
            if (openId === deleteTarget.id) setOpenId(null);
            setDeleteTarget(null);
          }}
        />
      )}
    </div>
  );
}

function ReportBuilderModal({
  language,
  records,
  initial,
  onClose,
  onSave,
}: {
  language: Language;
  records: RecordItem[];
  initial?: PreparedReport;
  onClose: () => void;
  onSave: (report: PreparedReport) => void;
}) {
  const knownCashAccounts = useMemo(() => [...new Set(records.filter((x) => x.kind === "cash").map((x) => x.source).filter(Boolean))], [records]);
  // Birden fazla kasa seçilebilir; hiçbiri seçili değilse tüm kasalar listelenir. Rapora "Kasa1, Kasa2" olarak yazılır.
  const [kasas, setKasas] = useState<Set<string>>(
    () => new Set(initial?.cashAccount ? knownCashAccounts.filter((n) => initial.cashAccount.split(/\s*,\s*/).includes(n)) : []),
  );
  const cashAccount = [...kasas].join(", ");
  const toggleKasa = (name: string) => setKasas((cur) => { const n = new Set(cur); if (n.has(name)) n.delete(name); else n.add(name); return n; });
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [query, setQuery] = useState("");
  const q = query.trim().toLocaleLowerCase("tr");
  const ofKasa = (x: RecordItem) => !kasas.size || (x.kind === "cash" ? kasas.has(x.source) : kasas.has(x.cashAccount || ""));
  const visibleFilter = (x: RecordItem) => ofKasa(x) && (!from || x.date >= from) && (!to || x.date <= to) && (!q || [x.source, x.detail, x.person, x.cashAccount].join(" ").toLocaleLowerCase("tr").includes(q));
  const incomeRecords = useMemo(() => records.filter((x) => x.kind === "income" || x.kind === "cash").sort((a, b) => b.date.localeCompare(a.date)), [records]);
  const expenseRecords = useMemo(() => records.filter((x) => x.kind === "expense").sort((a, b) => b.date.localeCompare(a.date)), [records]);
  const lineMatches = (line: ReportLine, record: RecordItem) => line.date === record.date && line.title === record.source && line.amount === record.amount;

  const [reportDate, setReportDate] = useState(initial?.date ?? new Date().toISOString().slice(0, 10));
  const [title, setTitle] = useState(initial?.title ?? "");
  const [presentedTo, setPresentedTo] = useState(initial?.presentedTo ?? "");
  const [detail, setDetail] = useState(initial?.detail ?? "");
  const [signature, setSignature] = useState(initial?.signature ?? "");
  const [incomeIds, setIncomeIds] = useState<Set<number>>(
    () => new Set(initial ? incomeRecords.filter((r) => initial.income.some((line) => lineMatches(line, r))).map((r) => r.id) : []),
  );
  const [expenseIds, setExpenseIds] = useState<Set<number>>(
    () => new Set(initial ? expenseRecords.filter((r) => initial.expense.some((line) => lineMatches(line, r))).map((r) => r.id) : []),
  );
  const [manualExpenses, setManualExpenses] = useState<ReportLine[]>(
    () => initial ? initial.expense.filter((line) => !expenseRecords.some((r) => lineMatches(line, r))) : [],
  );
  const [addingManualExpense, setAddingManualExpense] = useState(false);
  const [meDate, setMeDate] = useState(new Date().toISOString().slice(0, 10));
  const [meTitle, setMeTitle] = useState("");
  const [meDetail, setMeDetail] = useState("");
  const [meNote, setMeNote] = useState("");
  const [meAmount, setMeAmount] = useState(0);
  const [meCurrency, setMeCurrency] = useState("USD");

  const setMany = (setter: (f: (c: Set<number>) => Set<number>) => void, ids: number[], on: boolean) => setter((cur) => { const n = new Set(cur); for (const id of ids) { if (on) n.add(id); else n.delete(id); } return n; });
  const toggleIncome = (id: number) => setIncomeIds((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const toggleExpense = (id: number) => setExpenseIds((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const totalIncome = sumBy(incomeRecords.filter((x) => incomeIds.has(x.id)));
  const totalExpense = sumBy([...expenseRecords.filter((x) => expenseIds.has(x.id)), ...manualExpenses]);
  const valid = Boolean(title.trim()) && (incomeIds.size > 0 || expenseIds.size > 0 || manualExpenses.length > 0);
  const addManualExpense = () => {
    if (!meTitle.trim() || meAmount <= 0) return;
    setManualExpenses((current) => [...current, { date: meDate, title: meTitle.trim(), detail: meDetail.trim(), note: meNote.trim(), amount: meAmount, currency: meCurrency }]);
    setMeDate(new Date().toISOString().slice(0, 10));
    setMeTitle("");
    setMeDetail("");
    setMeNote("");
    setMeAmount(0);
    setAddingManualExpense(false);
  };
  return (
    <div className="overlay">
      <form
        className="modal reportBuilderModal"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          onSave({
            id: initial?.id ?? `${Date.now()}`,
            createdAt: initial?.createdAt ?? new Date().toISOString(),
            date: reportDate,
            title: title.trim(),
            detail: detail.trim(),
            presentedTo: presentedTo.trim(),
            cashAccount,
            signature: signature.trim(),
            income: incomeRecords.filter((x) => incomeIds.has(x.id)).map((x) => ({ date: x.date, title: x.source, detail: x.detail, note: x.note, amount: x.amount, currency: x.currency })),
            expense: [...expenseRecords.filter((x) => expenseIds.has(x.id)).map((x) => ({ date: x.date, title: x.source, detail: x.detail, note: x.note, amount: x.amount, currency: x.currency })), ...manualExpenses],
          });
        }}
      >
        <div className="modalHead">
          <div>
            <h2>{initial ? tx(language, "Raporu Düzenle", "Edit Report", "Raporê Biguherîne") : tx(language, "Yeni rapor hazırla", "Prepare new report", "Rapora nû amade bike")}</h2>
            <p>{tx(language, "Bir veya birden fazla kasa seçin, ardından Gelir ve Gider kayıtlarından istediklerinizi işaretleyin.", "Create a report by selecting from existing Cash, Income and Expense records.", "Ji qeydên heyî yên Qase, Dahat û Mesrefê hilbijêre û raporê çêke.")}</p>
          </div>
          <button type="button" onClick={onClose}>×</button>
        </div>
        <div className="formGrid">
          <label>
            {tx(language, "Tarih Ekle", "Add Date", "Tarîxê Zêde Bike")}
            <input type="date" required value={reportDate} onChange={(e) => setReportDate(e.target.value)} />
          </label>
          <label className="wide">
            {tx(language, "Rapor Başlığı", "Report Title", "Sernavê Raporê")}
            <input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder={tx(language, "Örn. Temmuz 2026 Mali Durum Raporu", "e.g. July 2026 Financial Report", "Mînak: Rapora Darayî ya Tîrmeh 2026")} />
          </label>
          <label className="wide">
            {tx(language, "Rapor Sunulacak Yer", "Report Recipient", "Cîhê Rapor Lê Tê Pêşkêşkirin")}
            <input value={presentedTo} onChange={(e) => setPresentedTo(e.target.value)} placeholder={tx(language, "Örn. KB Group Yönetim Kurulu", "e.g. KB Group Board", "Mînak: Desteya Rêveberiya KB Group")} />
          </label>
          <label className="wide">
            {tx(language, "Detay Bilgi", "Detail Information", "Agahiya Hûrgulî")}
            <textarea rows={2} value={detail} onChange={(e) => setDetail(e.target.value)} />
          </label>
          <div className="wide rbKasas">
            <div className="rbKasaHead">
              <b>{tx(language, "Kasalar", "Cash accounts", "Qase")}</b>
              <small>{kasas.size ? `${kasas.size} ${tx(language, "kasa seçili", "selected", "hilbijartî")}` : tx(language, "Seçim yok: tüm kasalar", "None selected: all cash accounts", "Tune: hemû qase")}</small>
              <span>
                <button type="button" className="light compact" onClick={() => setKasas(new Set(knownCashAccounts))}>{tx(language, "Tümünü seç", "Select all", "Hemûyan hilbijêre")}</button>
                <button type="button" className="light compact" onClick={() => setKasas(new Set())}>{tx(language, "Temizle", "Clear", "Paqij bike")}</button>
              </span>
            </div>
            <div className="rbChips">
              {knownCashAccounts.map((name) => (
                <button key={name} type="button" className={kasas.has(name) ? "on" : ""} aria-pressed={kasas.has(name)} onClick={() => toggleKasa(name)}>{kasas.has(name) ? "✓ " : ""}{localizeData(name, language)}</button>
              ))}
            </div>
          </div>
          <div className="wide rbFilters">
            <label>{tx(language, "Başlangıç", "From", "Ji")}<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
            <label>{tx(language, "Bitiş", "To", "Heta")}<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
            <label className="rbSearch">{tx(language, "Ara", "Search", "Bigere")}<input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tx(language, "Başlık, detay, kişi…", "Title, detail, person…", "Sernav, hûrgulî, kes…")} /></label>
            {(from || to || query) && <button type="button" className="light compact" onClick={() => { setFrom(""); setTo(""); setQuery(""); }}>{tx(language, "Filtreyi temizle", "Clear filter", "Fîlterê paqij bike")}</button>}
          </div>
          <div className="wide rbPanels">
            {([
              { tone: "in", title: tx(language, "Gelirler", "Income", "Dahat"), list: incomeRecords.filter(visibleFilter), ids: incomeIds, setter: setIncomeIds, sum: totalIncome, toggle: toggleIncome },
              { tone: "out", title: tx(language, "Giderler", "Expenses", "Mesref"), list: expenseRecords.filter(visibleFilter), ids: expenseIds, setter: setExpenseIds, sum: totalExpense, toggle: toggleExpense },
            ] as const).map((p) => {
              const visibleIds = p.list.map((x) => x.id);
              const allOn = visibleIds.length > 0 && visibleIds.every((id) => p.ids.has(id));
              return (
                <section key={p.tone} className={`rbPanel ${p.tone}`}>
                  <header>
                    <b>{p.title}</b>
                    <span className="rbCount">{p.ids.size + (p.tone === "out" ? manualExpenses.length : 0)} {tx(language, "seçili", "selected", "hilbijartî")}</span>
                    <strong className={p.tone === "in" ? "typeIncome" : "typeExpense"}>{moneyBreakdown(p.sum)}</strong>
                  </header>
                  <div className="rbTools">
                    <label className="rbAll"><input type="checkbox" checked={allOn} onChange={(e) => setMany(p.setter, visibleIds, e.target.checked)} /> {tx(language, `Görünenlerin tümü (${visibleIds.length})`, `All visible (${visibleIds.length})`, `Hemû yên xuya (${visibleIds.length})`)}</label>
                  </div>
                  <div className="rbList">
                    {p.list.map((item) => (
                      <label key={item.id} className={`rbRow${p.ids.has(item.id) ? " on" : ""}`}>
                        <input type="checkbox" checked={p.ids.has(item.id)} onChange={() => p.toggle(item.id)} />
                        <span className="rbInfo"><b>{item.source || "—"}</b><small>{date(item.date, language)}{item.cashAccount ? ` · ${localizeData(item.cashAccount, language)}` : ""}{item.person ? ` · ${item.person}` : ""}</small></span>
                        <em className={p.tone === "in" ? "typeIncome" : "typeExpense"}>{money(item.amount, item.currency)}</em>
                      </label>
                    ))}
                    {!p.list.length && <div className="reportBuilderPickerEmpty">{tx(language, "Bu filtreye uyan kayıt yok.", "No records match this filter.", "Qeyda li gorî fîlterê tune.")}</div>}
                  </div>
                  {p.tone === "out" && (
                    <div className="rbManual">
                      {manualExpenses.map((line, index) => (
                        <div key={`manual-${index}`} className="reportBuilderPickerRow reportBuilderManualRow">
                          <span className="reportBuilderPickerInfo"><b>{line.title}</b><small>{date(line.date, language)}{line.detail ? ` · ${line.detail}` : ""}</small></span>
                          <span className="typeExpense">{money(line.amount, lineCurrency(line))}</span>
                          <button type="button" aria-label={tx(language, "Satırı sil", "Remove row", "Rêzê jêbibe")} onClick={() => setManualExpenses((current) => current.filter((_, i) => i !== index))}>×</button>
                        </div>
                      ))}
                      {addingManualExpense ? (
                        <div className="reportBuilderManualForm">
                          <input aria-label="Tarih" type="date" value={meDate} onChange={(e) => setMeDate(e.target.value)} />
                          <input aria-label="Gider" placeholder={tx(language, "Gider", "Expense", "Mesref")} value={meTitle} onChange={(e) => setMeTitle(e.target.value)} />
                          <input aria-label="Detay" placeholder={tx(language, "Detay", "Detail", "Hûragahî")} value={meDetail} onChange={(e) => setMeDetail(e.target.value)} />
                          <input aria-label="Not" placeholder={tx(language, "Not", "Note", "Nîşe")} value={meNote} onChange={(e) => setMeNote(e.target.value)} />
                          <input aria-label="Miktar" type="number" min="0" step="any" placeholder={tx(language, "Miktar", "Amount", "Meblağ")} value={meAmount || ""} onChange={(e) => setMeAmount(Number(e.target.value))} />
                          <select aria-label="Para birimi" value={meCurrency} onChange={(e) => setMeCurrency(e.target.value)}>{["USD", "SYP", "IQD", "TRY", "EUR"].map((c) => <option key={c}>{c}</option>)}</select>
                          <div className="reportBuilderManualFormActions">
                            <button type="button" className="light" onClick={() => setAddingManualExpense(false)}>{tx(language, "Vazgeç", "Cancel", "Betal")}</button>
                            <button type="button" className="primary compact" onClick={addManualExpense}>{tx(language, "Ekle", "Add", "Zêde Bike")}</button>
                          </div>
                        </div>
                      ) : (
                        <button type="button" className="light reportBuilderAddExpense" onClick={() => setAddingManualExpense(true)}>＋ {tx(language, "Listede olmayan gider ekle", "Add an expense not in the list", "Mesrefa ne di lîsteyê de zêde bike")}</button>
                      )}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
          <div className="wide reportResultCards reportBuilderResult">
            <div><small>{tx(language, "Toplam Gelir", "Total Income", "Dahata Giştî")}</small><b className="typeIncome">{moneyBreakdown(totalIncome)}</b></div>
            <div><small>{tx(language, "Toplam Gider", "Total Expense", "Mesrefa Giştî")}</small><b className="typeExpense">{moneyBreakdown(totalExpense)}</b></div>
            <div><small>{tx(language, "Sonuç", "Result", "Encam")}</small><b>{moneyBreakdown(diffBy(totalIncome, totalExpense))}</b></div>
          </div>
          <label className="wide">
            {tx(language, "Rapor İmzası", "Report Signature", "Îmzeya Raporê")}
            <input value={signature} onChange={(e) => setSignature(e.target.value)} placeholder={tx(language, "Örn. Ad Soyad, Unvan", "e.g. Name, Title", "Mînak: Nav, Payename")} />
          </label>
        </div>
        <div className="modalActions">
          <button type="button" className="light" onClick={onClose}>{tx(language, "Vazgeç", "Cancel", "Betal")}</button>
          <button className="primary" disabled={!valid}>{initial ? tx(language, "Değişiklikleri Kaydet", "Save Changes", "Guherînan Tomar Bike") : tx(language, "Raporu Oluştur", "Create Report", "Raporê Çêke")}</button>
        </div>
      </form>
    </div>
  );
}

async function downloadPreparedReport(report: PreparedReport, language: Language) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Maliye-Finans Online";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet(tx(language, "Rapor", "Report", "Rapor"), {
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
    views: [{ showGridLines: false }],
  });
  const incomeBy = sumBy(report.income);
  const expenseBy = sumBy(report.expense);
  const resultBy = diffBy(incomeBy, expenseBy);
  // Tek para birimi: sayısal hücre + o para biriminin biçimi; birden fazla para birimi: "$10 + SYP 5" gibi metin.
  const totalCell = (by: Totals): { value: string | number; format?: string } => {
    const keys = Object.keys(by);
    if (keys.length <= 1) return { value: by[keys[0]] ?? 0, format: excelMoneyFormat(keys[0] ?? "USD") };
    return { value: moneyBreakdown(by) };
  };
  const totalIncome = totalCell(incomeBy);
  const totalExpense = totalCell(expenseBy);
  const result = totalCell(resultBy);
  const thin = { style: "thin" as const, color: { argb: "FFD3DDDD" } };
  const border = { top: thin, left: thin, bottom: thin, right: thin };
  const setFill = (row: number, color: string) => { sheet.getRow(row).eachCell({ includeEmpty: true }, (cell) => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } }; }); };
  const mergeTitle = (row: number, value: string, color: string, size: number) => {
    sheet.mergeCells(row, 1, row, 5);
    const cell = sheet.getCell(row, 1);
    cell.value = value;
    cell.font = { name: "Arial", bold: true, size, color: { argb: "FF172B2F" } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
    cell.border = border;
  };
  const addHeader = (labels: string[]) => {
    const row = sheet.addRow(labels);
    row.height = 24;
    row.eachCell((cell) => { cell.font = { name: "Arial", bold: true, size: 10, color: { argb: "FFFFFFFF" } }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF5F9FAF" } }; cell.alignment = { vertical: "middle", horizontal: "left" }; cell.border = border; });
  };
  const addData = (values: (string | number)[], currency = "USD") => {
    const row = sheet.addRow(values);
    row.height = 23;
    row.eachCell({ includeEmpty: true }, (cell, col) => { cell.font = { name: "Arial", size: 10, color: { argb: "FF314750" } }; cell.alignment = { vertical: "middle", wrapText: true, horizontal: col === 5 ? "right" : "left" }; cell.border = border; });
    row.getCell(5).numFmt = excelMoneyFormat(currency);
    row.getCell(5).font = { name: "Arial", size: 10, bold: true, color: { argb: "FF314750" } };
  };

  sheet.columns = [{ width: 17 }, { width: 31 }, { width: 25 }, { width: 25 }, { width: 19 }];
  mergeTitle(1, report.title, "FFB9D3D5", 15);
  mergeTitle(2, `${date(report.date, "tr")}${report.presentedTo ? ` · ${report.presentedTo}` : ""}`, "FFB9D3D5", 12);
  sheet.getRow(1).height = 27;
  sheet.getRow(2).height = 23;

  if (report.detail) {
    const detailRow = sheet.addRow([report.detail]);
    sheet.mergeCells(detailRow.number, 1, detailRow.number, 5);
    detailRow.height = 22;
    detailRow.eachCell({ includeEmpty: true }, (cell) => { cell.border = border; cell.font = { name: "Arial", italic: true, size: 9, color: { argb: "FF60736B" } }; cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true }; });
  }

  const summaryRow1 = sheet.addRow(["", "", "", "", ""]);
  sheet.mergeCells(summaryRow1.number, 1, summaryRow1.number, 2); sheet.mergeCells(summaryRow1.number, 3, summaryRow1.number, 4);
  sheet.getCell(summaryRow1.number, 1).value = "Toplam Gelir"; sheet.getCell(summaryRow1.number, 3).value = "Toplam Gider"; sheet.getCell(summaryRow1.number, 5).value = "Sonuç";
  const summaryRow2 = sheet.addRow(["", "", "", "", ""]);
  sheet.mergeCells(summaryRow2.number, 1, summaryRow2.number, 2); sheet.mergeCells(summaryRow2.number, 3, summaryRow2.number, 4);
  sheet.getCell(summaryRow2.number, 1).value = totalIncome.value; sheet.getCell(summaryRow2.number, 3).value = totalExpense.value; sheet.getCell(summaryRow2.number, 5).value = result.value;
  [summaryRow1.number, summaryRow2.number].forEach((rowNumber) => {
    sheet.getRow(rowNumber).height = rowNumber === summaryRow1.number ? 21 : 29;
    sheet.getRow(rowNumber).eachCell({ includeEmpty: true }, (cell) => { cell.border = border; cell.alignment = { horizontal: "center", vertical: "middle" }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } }; });
  });
  [1, 3, 5].forEach((col) => { sheet.getCell(summaryRow1.number, col).font = { name: "Arial", size: 9, color: { argb: "FF73847D" } }; });
  sheet.getCell(summaryRow2.number, 1).font = { name: "Arial", size: 15, bold: true, color: { argb: "FF188263" } };
  sheet.getCell(summaryRow2.number, 3).font = { name: "Arial", size: 15, bold: true, color: { argb: "FFC74F4F" } };
  sheet.getCell(summaryRow2.number, 5).font = { name: "Arial", size: 15, bold: true, color: { argb: "FF172B2F" } };
  ([[1, totalIncome], [3, totalExpense], [5, result]] as const).forEach(([col, t]) => { if (t.format) sheet.getCell(summaryRow2.number, col).numFmt = t.format; });

  mergeTitle(sheet.rowCount + 1, tx(language, "Gelir", "Income", "Dahat"), "FFEDF6F7", 12);
  addHeader(["Tarih", "Gelir", "Detay", "Not", "Miktar"]);
  report.income.forEach((line) => addData([date(line.date, "tr"), line.title, line.detail, line.note, line.amount], lineCurrency(line)));
  const incomeTotalRow = sheet.addRow(["", "", "", "Toplam Gelir", totalIncome.value]);
  incomeTotalRow.height = 24; setFill(incomeTotalRow.number, "FFE7F4EF");
  incomeTotalRow.eachCell({ includeEmpty: true }, (cell, colNumber) => { cell.border = border; cell.font = { name: "Arial", size: 10, bold: true, color: { argb: "FF314750" } }; cell.alignment = { vertical: "middle", horizontal: colNumber === 5 ? "right" : "left" }; });
  if (totalIncome.format) incomeTotalRow.getCell(5).numFmt = totalIncome.format;

  mergeTitle(sheet.rowCount + 1, tx(language, "Gider", "Expense", "Mesref"), "FFEDF6F7", 12);
  addHeader(["Tarih", "Gider", "Detay", "Not", "Miktar"]);
  report.expense.forEach((line) => addData([date(line.date, "tr"), line.title, line.detail, line.note, line.amount], lineCurrency(line)));
  const expenseTotalRow = sheet.addRow(["", "", "", "Toplam Gider", totalExpense.value]);
  expenseTotalRow.height = 24; setFill(expenseTotalRow.number, "FFE7F4EF");
  expenseTotalRow.eachCell({ includeEmpty: true }, (cell, colNumber) => { cell.border = border; cell.font = { name: "Arial", size: 10, bold: true, color: { argb: "FF314750" } }; cell.alignment = { vertical: "middle", horizontal: colNumber === 5 ? "right" : "left" }; });
  if (totalExpense.format) expenseTotalRow.getCell(5).numFmt = totalExpense.format;

  const totals = [[tx(language, "Toplam Gelir", "Total Income", "Dahata Giştî"), totalIncome, incomeBy], [tx(language, "Toplam Gider", "Total Expense", "Mesrefa Giştî"), totalExpense, expenseBy], [tx(language, "Sonuç", "Result", "Encam"), result, resultBy]] as const;
  totals.forEach(([label, t, by]) => {
    const row = sheet.addRow([label, "", "", "", t.value]);
    sheet.mergeCells(row.number, 1, row.number, 4);
    row.height = 24;
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => { cell.border = border; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD8D8D8" } }; cell.font = { name: "Arial", size: 10, bold: true, color: { argb: isNegative(by) ? "FFBD3131" : "FF12191D" } }; cell.alignment = { vertical: "middle", horizontal: colNumber === 5 ? "right" : "left" }; });
    if (t.format) row.getCell(5).numFmt = t.format;
  });

  const signRow = sheet.addRow([tx(language, "Hazırlayan", "Prepared by", "Amade kir"), "", tx(language, "Rapor İmzası", "Report Signature", "Îmzeya Raporê"), "", ""]);
  sheet.mergeCells(signRow.number, 1, signRow.number, 2); sheet.mergeCells(signRow.number, 3, signRow.number, 5);
  signRow.height = 30;
  signRow.eachCell({ includeEmpty: true }, (cell) => { cell.border = border; cell.font = { name: "Arial", size: 9, color: { argb: "FF73847D" } }; cell.alignment = { vertical: "middle", horizontal: "left" }; });
  const signValueRow = sheet.addRow(["", "", report.signature || "", "", ""]);
  sheet.mergeCells(signValueRow.number, 1, signValueRow.number, 2); sheet.mergeCells(signValueRow.number, 3, signValueRow.number, 5);
  signValueRow.height = 26;
  signValueRow.eachCell({ includeEmpty: true }, (cell) => { cell.border = border; cell.font = { name: "Arial", size: 11, bold: true, color: { argb: "FF12191D" } }; cell.alignment = { vertical: "middle", horizontal: "left" }; });

  sheet.pageSetup.margins = { left: 0.3, right: 0.3, top: 0.45, bottom: 0.45, header: 0.2, footer: 0.2 };
  sheet.headerFooter.oddFooter = `&L${report.title}&RPage &P / &N`;
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const link = window.document.createElement("a");
  link.href = url;
  link.download = `${report.title.replaceAll(" ", "-").replace(/[\\/:*?"<>|]/g, "-")}.xlsx`;
  link.click();
  URL.revokeObjectURL(url);
}

function TemplateTable({ title, kind, lines, total, language }: { title: string; kind: "income" | "expense"; lines: ReportLine[]; total: Totals; language: Language }) {
  return <section className="templateSection">
    <h3>{title}</h3>
    <TableTools id="report-template" language={language} className="templateTableScroll"><table><thead><tr><th>{tx(language, "Tarih", "Date", "Dîrok")}</th><th>{kind === "income" ? tx(language, "Gelir", "Income", "Dahat") : tx(language, "Gider", "Expense", "Mesref")}</th><th>{tx(language, "Detay", "Detail", "Hûrgulî")}</th><th>{tx(language, "Not", "Note", "Nîşe")}</th><th>{tx(language, "Miktar", "Amount", "Meblağ")}</th></tr></thead><tbody>{lines.map((line, index) => <tr key={`${line.title}-${index}`}><td>{date(line.date, language)}</td><td>{localizeData(line.title, language)}</td><td>{localizeData(line.detail || "", language)}</td><td>{localizeData(line.note || "", language)}</td><td className="amount">{money(line.amount, lineCurrency(line))}</td></tr>)}{!lines.length && <tr><td colSpan={5}>—</td></tr>}<tr className="templateSubtotal"><td colSpan={3}></td><td>{kind === "income" ? tx(language, "Toplam Gelir", "Total Income", "Dahata Giştî") : tx(language, "Toplam Gider", "Total Expense", "Mesrefa Giştî")}</td><td className="amount">{moneyBreakdown(total)}</td></tr></tbody></table></TableTools>
  </section>;
}

function ReportLines({ lines, language }: { lines: ReportLine[]; language: Language }) {
  return <TableTools id="report-compact" language={language} className="recordsTable compactReportTable"><table><thead><tr><th>{tx(language, "Tarih", "Date", "Dîrok")}</th><th>{tx(language, "Başlık", "Category", "Sernav")}</th><th>{tx(language, "Detay / Not", "Detail / Note", "Hûrgulî / Nîşe")}</th><th>{tx(language, "Tutar", "Amount", "Meblağ")}</th></tr></thead><tbody>{lines.map((line, index) => <tr key={`${line.title}-${index}`}><td>{date(line.date, language)}</td><td>{localizeData(line.title, language)}</td><td>{localizeData(line.detail || line.note || "—", language)}</td><td className="amount">{money(line.amount, lineCurrency(line))}</td></tr>)}</tbody></table></TableTools>;
}

export function AnnualReports({
  language,
  records,
  kind,
}: {
  language: Language;
  records: RecordItem[];
  kind: "income" | "expense";
}) {
  const currentYear = new Date().getFullYear();
  const years = [...new Set([
    currentYear,
    currentYear - 1,
    currentYear - 2,
    ...records.map((x) => Number(x.date.slice(0, 4))),
  ])].sort((a, b) => b - a);
  const [year, setYear] = useState(currentYear);
  const yearCards = years.map((item) => {
    const items = records.filter(
      (x) => x.kind === kind && Number(x.date.slice(0, 4)) === item,
    );
    return { year: item, items, amount: total(items) };
  });
  const selectedItems = yearCards
    .find((item) => item.year === year)?.items
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date)) ?? [];
  const selectedTotal = total(selectedItems);
  return (
    <div className="panel monthly">
      <div className="toolbar">
        <Title
          title={tx(
            language,
            kind === "income" ? "Yıllık Gelirler" : "Yıllık Giderler",
            kind === "income" ? "Annual Income" : "Annual Expenses",
            kind === "income" ? "Dahata Salane" : "Mesrefa Salane",
          )}
          sub={tx(
            language,
            kind === "income" ? "Gelirleri yıllara göre inceleyin" : "Giderleri yıllara göre inceleyin",
            kind === "income" ? "Review income by year" : "Review expenses by year",
            kind === "income" ? "Dahatan li gorî salan bibînin" : "Mesrefan li gorî salan bibînin",
          )}
        />
      </div>
      <div className="yearCards" aria-label={tx(language, "Yıllık rapor kartları", "Annual report cards", "Kartên rapora salane") }>
        {yearCards.map((item) => (
          <button
            key={`${kind}-${item.year}`}
            className={`yearCard ${kind} ${year === item.year ? "active" : ""}`}
            onClick={() => setYear(item.year)}
          >
            <span>
              {kind === "income"
                ? tx(language, `${item.year} Yılı Gelirleri`, `${item.year} Income`, `Dahata Sala ${item.year}`)
                : tx(language, `${item.year} Yılı Giderleri`, `${item.year} Expenses`, `Mesrefa Sala ${item.year}`)}
            </span>
            <b>{money(item.amount)}</b>
            <small>
              {tx(language, `${item.items.length} kayıt`, `${item.items.length} records`, `${item.items.length} qeyd`)} · {tx(language, "Ayrıntıları göster", "Show details", "Hûrguliyan nîşan bide")}
            </small>
          </button>
        ))}
      </div>
      <div className="reportListHead">
        <div>
          <h3>
            {kind === "income"
              ? tx(language, `${year} Gelir Listesi`, `${year} Income List`, `Lîsteya Dahata ${year}`)
              : tx(language, `${year} Gider Listesi`, `${year} Expense List`, `Lîsteya Mesrefa ${year}`)}
          </h3>
          <p>{tx(language, "Seçilen yıla ait bütün kayıtlar", "All records for the selected year", "Hemû qeydên sala hilbijartî")}</p>
        </div>
        <strong>{money(selectedTotal)}</strong>
      </div>
      <div className="recordsTable">
        <table>
          <thead>
            <tr>
              <th>{tx(language, "Tarih", "Date", "Dîrok")}</th>
              <th>{tx(language, "Başlık", "Category", "Sernav")}</th>
              <th>{tx(language, "Açıklama", "Description", "Danasîn")}</th>
              <th>{tx(language, "Kişi", "Person", "Kes")}</th>
              <th>{tx(language, "Tutar", "Amount", "Meblağ")}</th>
            </tr>
          </thead>
          <tbody>
            {selectedItems.map((item) => (
              <tr key={item.id}>
                <td>{date(item.date, language)}</td>
                <td><b>{localizeData(item.source, language)}</b></td>
                <td>{localizeData(item.detail, language)}</td>
                <td><PersonChip name={item.person}>{localizeData(item.person, language)}</PersonChip></td>
                <td className="amount">{money(item.amount)} {item.currency}</td>
              </tr>
            ))}
            {!selectedItems.length && (
              <tr><td className="empty" colSpan={5}>{tx(language, "Bu yıla ait kayıt bulunmuyor.", "No records found for this year.", "Ji bo vê salê qeyd tune.")}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

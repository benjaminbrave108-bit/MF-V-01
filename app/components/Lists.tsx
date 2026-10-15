"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { date as formatDate, money } from "../lib/finance";
import { tx } from "../lib/i18n";
import type { Language } from "../lib/types";

// Liste Kasaları (çalışma alanları): bir kasanın geliri, giderleri ve giderlerin kişilere dağılımı. Kasanın Gider
// kayıtları (Gider sayfasından girilir) burada bir tabloda listelenir; her giderin kişilere dağıtılan kısmı kişinin
// o giderdeki harcamasıdır. Kasada kalan = kasa geliri − kasa gideri.
type Recipient = { id: number; name: string };
type Expense = {
  id: number;
  date: string;
  source: string;
  detail: string;
  note: string;
  person: string;
  listName: string;
  amount: number;
  currency: string;
  byRecipient: Record<string, number>;
  unassigned: number;
};
type Balance = { recipientId: number; name: string; spent: number; perExpense: Record<string, number> };
type Workspace = {
  cashAccountId: number;
  name: string;
  kasaName: string;
  note: string;
  amountMode: "auto" | "manual";
  autoIncome: number;
  ownerName: string;
  canWrite: boolean;
  currency: string;
  recipients: Recipient[];
  incomes: { id: number; date: string; source: string; amount: number; currency: string }[];
  expenses: Expense[];
  balances: Balance[];
  totals: { income: number; distributed: number; expense: number; kasaRemaining: number; unassigned: number };
};
type Kasa = { id: number; name: string; currentAmount?: number };

const today = () => new Date().toISOString().slice(0, 10);
const r2 = (n: number) => Math.round(n * 100) / 100;

async function api<T>(url: string, method: string, body?: unknown): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const response = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return { ok: false, error: data?.error || `HTTP ${response.status}` };
    return { ok: true, data: data as T };
  } catch {
    return { ok: false, error: "Network error" };
  }
}

// "1.234,56", "1,234.56", "1234.5", "$ 1 200" gibi yapıştırılan sayıları çözer.
function parseNumber(text: string): number {
  let t = text.replace(/[^\d.,-]/g, "");
  if (!t) return 0;
  const lastDot = t.lastIndexOf(".");
  const lastComma = t.lastIndexOf(",");
  if (lastDot !== -1 && lastComma !== -1) {
    t = lastComma > lastDot ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  } else if (lastComma !== -1) {
    t = /,\d{1,2}$/.test(t) ? t.replace(",", ".") : t.replace(/,/g, "");
  } else if (lastDot !== -1 && /\.\d{3}(?!\d)/.test(t) && t.split(".").length > 2) {
    t = t.replace(/\./g, "");
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}

export function Lists({ language, onDataChanged }: { language: Language; onDataChanged?: () => void; users?: unknown; isSuperAdmin?: boolean; currentUserName?: string }) {
  const [workspaces, setWorkspaces] = useState<Workspace[] | null>(null);
  const [kasas, setKasas] = useState<Kasa[]>([]);
  const [kasaId, setKasaId] = useState<number | null>(null);
  const [wsForm, setWsForm] = useState<"new" | Workspace | null>(null);
  const [resultFor, setResultFor] = useState<number[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const result = await api<{ workspaces: Workspace[]; kasas: Kasa[] }>("/api/lists", "GET");
    if (!result.ok) return setError(result.error);
    setError("");
    setWorkspaces(result.data.workspaces);
    setKasas(result.data.kasas);
  }, []);
  useEffect(() => {
    load();
    // Giderler başka sayfalardan girildiği için ekran periyodik tazelenir.
    const interval = setInterval(load, 20000);
    return () => clearInterval(interval);
  }, [load]);

  const workspace = useMemo(() => workspaces?.find((w) => w.cashAccountId === kasaId) ?? null, [workspaces, kasaId]);

  function apply(next: Workspace | null | undefined, id: number) {
    setWorkspaces((prev) => {
      const rest = (prev ?? []).filter((w) => w.cashAccountId !== id);
      return next ? [...rest, next].sort((a, b) => a.name.localeCompare(b.name)) : rest;
    });
  }
  // Tüm değişiklik uçları güncel çalışma alanını döndürür.
  async function mutate(url: string, method: string, body?: unknown, id = kasaId): Promise<boolean> {
    setBusy(true);
    const result = await api<{ workspace?: Workspace | null }>(url, method, body);
    setBusy(false);
    if (!result.ok) {
      alert(result.error);
      return false;
    }
    if (id != null && "workspace" in result.data) apply(result.data.workspace, id);
    onDataChanged?.();
    return true;
  }

  return (
    <section className="listsPage">
      {error && <p className="listsError">{error}</p>}
      {!workspace && (
        <>
          <div className="listsToolbar">
            <div className="listsToolbarInfo">
              <span className="listWsLabel">{tx(language, "Çalışma Alanları", "Workspaces", "Qadên Xebatê")}</span>
              <small className="listMuted">
                {tx(language, "Liste kasaları: kasa geliri, kasa gideri ve kişilere dağıtılan giderler", "List cash accounts: cash income, cash expense and expenses allocated to people", "Qaseyên lîsteyê: dahat, mesref û mesrefên ji kesan re hatine dabeşkirin")}
              </small>
            </div>
            <div className="listsToolbarActions">
              <button className="light" onClick={() => setResultFor((workspaces ?? []).map((w) => w.cashAccountId))} disabled={!workspaces?.length}>
                📊 {tx(language, "Sonuçları Görüntüle", "View Results", "Encaman Nîşan Bide")}
              </button>
              <button className="primary" onClick={() => setWsForm("new")}>
                ＋ {tx(language, "Yeni Çalışma Alanı", "New Workspace", "Qada Xebatê ya Nû")}
              </button>
            </div>
          </div>
          {workspaces === null && <p className="listsHint">…</p>}
          {workspaces?.length === 0 && (
            <p className="listsHint">
              {tx(language, "Henüz çalışma alanı yok. Yeni Çalışma Alanı ile bir kasa seçin; kasanın giderleri burada kişilere dağıtılır.", "No workspaces yet. Create one with New Workspace by picking a cash account; its expenses are allocated to people here.", "Hê qada xebatê tune. Bi Qada Xebatê ya Nû qaseyekê hilbijêrin; mesrefên wê li vir ji kesan re têne dabeşkirin.")}
            </p>
          )}
          <div className="listCards">
            {workspaces?.map((w) => (
              <button key={w.cashAccountId} type="button" className="listCard" onClick={() => setKasaId(w.cashAccountId)}>
                <span className="listCardCode">{tx(language, "Çalışma alanı", "Workspace", "Qada xebatê")}</span>
                <strong>{w.name}</strong>
                <small>
                  {w.kasaName !== w.name ? `${tx(language, "Kasa", "Cash", "Qase")}: ${w.kasaName} · ` : ""}{w.ownerName || "—"} · {w.expenses.length} {tx(language, "gider", "expenses", "mesref")} · {w.recipients.length} {tx(language, "alıcı", "recipients", "wergir")}
                </small>
                <dl>
                  <div><dt>{tx(language, "Gelir", "Income", "Dahat")}</dt><dd>{money(w.totals.income, w.currency)}</dd></div>
                  <div><dt>{tx(language, "Gider", "Expense", "Mesref")}</dt><dd>{money(w.totals.expense, w.currency)}</dd></div>
                  <div><dt>{tx(language, "Kasada kalan", "Cash left", "Di qasayê de")}</dt><dd className={w.totals.kasaRemaining < 0 ? "negative" : undefined}>{money(w.totals.kasaRemaining, w.currency)}</dd></div>
                </dl>
              </button>
            ))}
          </div>
        </>
      )}
      {workspace && (
        <WorkspaceView
          language={language}
          ws={workspace}
          busy={busy}
          onBack={() => setKasaId(null)}
          onShowResult={() => setResultFor([workspace.cashAccountId])}
          onEditWorkspace={() => setWsForm(workspace)}
          onAddRecipient={(name) => mutate(`/api/list-workspaces/${workspace.cashAccountId}/recipients`, "POST", { name })}
          onRenameRecipient={(id, name) => mutate(`/api/list-workspaces/${workspace.cashAccountId}/recipients/${id}`, "PUT", { name })}
          onDeleteRecipient={(id) => mutate(`/api/list-workspaces/${workspace.cashAccountId}/recipients/${id}`, "DELETE")}
          onSaveAllocations={(expenseId, allocations) => mutate(`/api/records/${expenseId}/allocations`, "PUT", { allocations })}
        />
      )}
      {resultFor && workspaces && <ListsResultModal language={language} workspaces={workspaces} initialIds={resultFor} onClose={() => setResultFor(null)} />}
      {wsForm && (
        <WorkspaceFormModal
          language={language}
          kasas={wsForm === "new" ? kasas.filter((k) => !workspaces?.some((w) => w.cashAccountId === k.id)) : kasas}
          workspace={wsForm === "new" ? null : wsForm}
          onClose={() => setWsForm(null)}
          onSaved={(ws) => {
            setWsForm(null);
            apply(ws, ws.cashAccountId);
            setKasaId(ws.cashAccountId);
          }}
        />
      )}
    </section>
  );
}

// "Sonuçları Görüntüle" — Kasalar'daki "Sonuç Oluştur" raporuyla aynı pencere dili: çalışma alanının
// (kasa) Gelir / Liste gideri dökümü, alıcı özeti ve toplam sonuç; birden çok çalışma alanı birleştirilebilir
// ve Excel'e aktarılabilir.
function ListsResultModal({
  language,
  workspaces,
  initialIds,
  onClose,
}: {
  language: Language;
  workspaces: Workspace[];
  initialIds: number[];
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<number[]>(initialIds);
  const [pendingAdd, setPendingAdd] = useState("");
  const blocks = workspaces.filter((w) => selected.includes(w.cashAccountId));
  const available = workspaces.filter((w) => !selected.includes(w.cashAccountId));
  const isMulti = blocks.length > 1;
  const reportDate = formatDate(today(), language);
  const title = blocks.map((w) => w.name).join(" + ");

  const sum = (f: (w: Workspace) => number) => r2(blocks.reduce((a, w) => a + f(w), 0));
  // Birden çok çalışma alanı farklı para birimi kullanabilir; rapor çalışma alanı başına kendi birimiyle
  // gösterilir, toplamlar para birimine göre ayrı ayrı toplanır.
  const byCurrency = (f: (w: Workspace) => number): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const w of blocks) out[w.currency] = r2((out[w.currency] ?? 0) + f(w));
    return out;
  };
  const fmt = (m: Record<string, number>) => {
    const parts = Object.entries(m).filter(([, v]) => Math.abs(v) > 0.004).map(([cur, v]) => money(v, cur));
    return parts.length ? parts.join(" + ") : money(0);
  };
  const income = byCurrency((w) => w.totals.income);
  const expense = byCurrency((w) => w.totals.expense);
  const result = byCurrency((w) => w.totals.income - w.totals.expense);
  const cashLeft = byCurrency((w) => w.totals.kasaRemaining);
  const allocatedSum = byCurrency((w) => w.totals.distributed);
  const incomeTotal = sum((w) => w.totals.income);
  const expenseTotal = sum((w) => w.totals.expense);
  const barMax = Math.max(incomeTotal, expenseTotal, 1);

  type Row = { key: string; date: string; title: string; ws: string; amount: number; currency: string };
  const incomeRows: Row[] = blocks
    .flatMap((w) => w.incomes.map((i) => ({ key: `i${i.id}`, date: i.date, title: i.source, ws: w.name, amount: i.amount, currency: w.currency })))
    .sort((a, b) => b.date.localeCompare(a.date));
  const expenseRows: Row[] = blocks
    .flatMap((w) => w.expenses.map((e) => ({ key: `e${e.id}`, date: e.date, title: e.source, ws: w.name, amount: e.amount, currency: e.currency })))
    .sort((a, b) => b.date.localeCompare(a.date));

  async function exportToExcel() {
    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Maliye-Finans Online";
    workbook.created = new Date();
    const thin = { style: "thin" as const, color: { argb: "FFD3DDDD" } };
    const border = { top: thin, left: thin, bottom: thin, right: thin };
    const sheet = workbook.addWorksheet(tx(language, "Liste Sonucu", "List Result", "Encama Lîsteyê").slice(0, 31), {
      pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
      views: [{ showGridLines: false }],
    });
    sheet.columns = [{ width: 14 }, { width: 22 }, { width: 34 }, { width: 18 }];
    const fill = (argb: string) => ({ type: "pattern" as const, pattern: "solid" as const, fgColor: { argb } });
    const band = (text: string, bg: string, color: string, size = 12) => {
      const row = sheet.addRow([text]);
      sheet.mergeCells(row.number, 1, row.number, 4);
      row.height = 22;
      row.getCell(1).font = { name: "Arial", bold: true, size, color: { argb: color } };
      row.getCell(1).alignment = { horizontal: "left", vertical: "middle", indent: 1 };
      row.getCell(1).fill = fill(bg);
      row.eachCell({ includeEmpty: true }, (cell) => { cell.border = border; });
    };
    band(title, "FF123F52", "FFFFFFFF", 16);
    band(`${tx(language, "Toplam Sonucu", "Total Result", "Encama Giştî")}: ${fmt(result)}`, "FFDDEEF3", "FF17384A");
    sheet.addRow([]);
    const section = (name: string, rows: Row[], totalText: string, bg: string, color: string) => {
      band(name, bg, color);
      const head = sheet.addRow([tx(language, "Tarih", "Date", "Tarîx"), tx(language, "Çalışma alanı", "Workspace", "Qada xebatê"), tx(language, "Başlık", "Title", "Sernav"), tx(language, "Tutar", "Amount", "Meblağ")]);
      head.eachCell((cell) => { cell.font = { name: "Arial", bold: true, size: 9, color: { argb: "FF5B6F77" } }; cell.border = border; });
      for (const r of rows) {
        const row = sheet.addRow([formatDate(r.date, language), r.ws, r.title, r.amount]);
        row.eachCell({ includeEmpty: true }, (cell, n) => {
          cell.font = { name: "Arial", size: 9, color: { argb: "FF314750" } };
          cell.alignment = { horizontal: n === 4 ? "right" : "left" };
          cell.border = border;
        });
        row.getCell(4).numFmt = "#,##0.00;[Red]-#,##0.00";
      }
      const total = sheet.addRow([tx(language, "Sonuç", "Result", "Encam"), "", "", totalText]);
      sheet.mergeCells(total.number, 1, total.number, 3);
      total.eachCell({ includeEmpty: true }, (cell, n) => {
        cell.font = { name: "Arial", bold: true, size: 10, color: { argb: "FF17384A" } };
        cell.alignment = { horizontal: n === 1 ? "left" : "right" };
        cell.border = border;
      });
      sheet.addRow([]);
    };
    section(tx(language, "GELİR (KASA)", "INCOME (CASH)", "DAHAT (QASE)"), incomeRows, fmt(income), "FFDFF5ED", "FF118164");
    section(tx(language, "GİDER (KASA GİDERLERİ)", "EXPENSE (CASH EXPENSES)", "MESREF (MESREFÊN QASEYÊ)"), expenseRows, fmt(expense), "FFFFF0DF", "FFD06F22");

    band(tx(language, "ALICILAR", "RECIPIENTS", "WERGIR"), "FFE7EEF6", "FF176B87");
    const rh = sheet.addRow([tx(language, "Çalışma alanı", "Workspace", "Qada xebatê"), tx(language, "Alıcı", "Recipient", "Wergir"), tx(language, "Giderlerdeki harcaması", "Spent per expense", "Lêçûn li gorî mesrefê"), tx(language, "Toplam harcama", "Total spent", "Lêçûna giştî")]);
    rh.eachCell((cell) => { cell.font = { name: "Arial", bold: true, size: 9, color: { argb: "FF5B6F77" } }; cell.border = border; });
    for (const w of blocks) {
      for (const b of w.balances) {
        const row = sheet.addRow([w.name, b.name, w.expenses.filter((e) => b.perExpense[e.id]).map((e) => `${e.source}: ${money(b.perExpense[e.id], w.currency)}`).join(" · ") || "—", b.spent]);
        row.eachCell({ includeEmpty: true }, (cell, n) => {
          cell.font = { name: "Arial", size: 9, color: { argb: "FF314750" } };
          cell.alignment = { horizontal: n === 4 ? "right" : "left" };
          cell.border = border;
        });
        row.getCell(4).numFmt = "#,##0.00;[Red]-#,##0.00";
      }
    }
    sheet.addRow([]);
    const lines: [string, string, string, string][] = [
      [tx(language, "KASADA KALAN (GELİR − GİDER)", "CASH LEFT (INCOME − EXPENSE)", "DI QASEYÊ DE (DAHAT − MESREF)"), fmt(result), "FFEAF4F7", "FF12414F"],
      [tx(language, "TOPLAM GELİR", "TOTAL INCOME", "DAHATA GİŞTÎ"), fmt(income), "FFE7F4EF", "FF14795E"],
      [tx(language, "TOPLAM GİDER", "TOTAL EXPENSE", "MESREFA GİŞTÎ"), fmt(expense), "FFFDF1E7", "FFB33D3D"],
      [tx(language, "KİŞİLERE DAĞITILAN (HARCAMA)", "ALLOCATED TO RECIPIENTS (SPENT)", "JI WERGIRAN RE (LÊÇÛN)"), fmt(allocatedSum), "FFFFF6DB", "FF7A5A1D"],
      [tx(language, "TARİH", "DATE", "TARÎX"), reportDate, "FFF5F7F8", "FF5B6F77"],
    ];
    for (const [label, value, bg, color] of lines) {
      const row = sheet.addRow([label, "", "", value]);
      sheet.mergeCells(row.number, 1, row.number, 3);
      row.getCell(1).font = { name: "Arial", bold: true, size: 10, color: { argb: color } };
      row.getCell(4).font = { name: "Arial", bold: true, size: 11, color: { argb: color } };
      row.getCell(4).alignment = { horizontal: "right" };
      row.eachCell({ includeEmpty: true }, (cell) => { cell.fill = fill(bg); cell.border = border; });
    }
    const buffer = await workbook.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${title.replace(/[\\/:*?"<>|]/g, "-")}-Liste-Sonuc-${today()}.xlsx`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const rowsView = (rows: Row[]) =>
    rows.length === 0 ? (
      <p className="kasaReportEmpty">{tx(language, "Kayıt yok.", "No records.", "Qeyd tune.")}</p>
    ) : (
      rows.map((r) => (
        <div className="kasaReportRow" key={r.key}>
          <span className="kasaReportRowDate">{formatDate(r.date, language)}</span>
          <span className="kasaReportRowTitle">
            {r.title}
            {isMulti && <small className="kasaReportRowKasa">▣ {r.ws}</small>}
          </span>
          <span className="kasaReportRowAmount">{money(r.amount, r.currency)}</span>
        </div>
      ))
    );

  return (
    <div className="overlay">
      <div className="modal kasaReportModal" onClick={(e) => e.stopPropagation()}>
        <div className="modalHead">
          <div>
            <h2>{tx(language, "Liste Kasası Sonuç Raporu", "List Cash Result Report", "Rapora Encama Qaseya Lîsteyê")}</h2>
            <p>{title || "—"}</p>
          </div>
          <button type="button" onClick={onClose}>×</button>
        </div>
        {available.length > 0 && (
          <div className="kasaReportAdd">
            <select value={pendingAdd} onChange={(e) => setPendingAdd(e.target.value)}>
              <option value="">{tx(language, "— Başka çalışma alanı ekle —", "— Add another workspace —", "— Qadeke xebatê ya din zêde bike —")}</option>
              {available.map((w) => (<option key={w.cashAccountId} value={w.cashAccountId}>{w.name}</option>))}
            </select>
            <button
              type="button"
              className="light compact"
              disabled={!pendingAdd}
              onClick={() => {
                if (!pendingAdd) return;
                setSelected((cur) => [...cur, Number(pendingAdd)]);
                setPendingAdd("");
              }}
            >
              ＋ {tx(language, "Ekle", "Add", "Zêde Bike")}
            </button>
          </div>
        )}
        {isMulti && (
          <div className="kasaReportChips">
            {blocks.map((w) => (
              <span className="kasaReportChip" key={w.cashAccountId}>
                {w.name}
                <button type="button" onClick={() => setSelected((cur) => (cur.length > 1 ? cur.filter((x) => x !== w.cashAccountId) : cur))} title={tx(language, "Bu çalışma alanını kaldır", "Remove this workspace", "Vê qada xebatê rake")}>×</button>
              </span>
            ))}
          </div>
        )}
        <div className="kasaReportHead">
          <span>{title || "—"}</span>
          <div>
            <small>{tx(language, "Toplam Sonucu", "Total Result", "Encama Giştî")}</small>
            <strong>{fmt(result)}</strong>
          </div>
        </div>
        <div className="bars kasaReportBars">
          <div>
            <span><b>{tx(language, "Gelir", "Income", "Dahat")}</b><strong>{fmt(income)}</strong></span>
            <i><em style={{ width: `${Math.max(4, (incomeTotal / barMax) * 100)}%` }} /></i>
          </div>
          <div>
            <span><b>{tx(language, "Gider", "Expense", "Mesref")}</b><strong>{fmt(expense)}</strong></span>
            <i><em className="expense" style={{ width: `${Math.max(4, (expenseTotal / barMax) * 100)}%` }} /></i>
          </div>
        </div>
        <div className="kasaReportSection kasaReportIncome">
          <div className="kasaReportSectionHead"><span>{tx(language, "Gelir (kasa)", "Income (cash)", "Dahat (qase)")}</span><strong>{fmt(income)}</strong></div>
          <div className="kasaReportList">{rowsView(incomeRows)}</div>
        </div>
        <div className="kasaReportSection kasaReportExpense">
          <div className="kasaReportSectionHead"><span>{tx(language, "Gider (kasa giderleri)", "Expense (cash expenses)", "Mesref (mesrefên qaseyê)")}</span><strong>{fmt(expense)}</strong></div>
          <div className="kasaReportList">{rowsView(expenseRows)}</div>
        </div>
        <div className="kasaReportSection">
          <div className="kasaReportSectionHead"><span>{tx(language, "Kişiler (gider harcamaları)", "People (expense spending)", "Kes (lêçûnên mesrefan)")}</span><strong>{fmt(allocatedSum)}</strong></div>
          <div className="kasaReportList">
            {blocks.every((w) => w.balances.length === 0) ? (
              <p className="kasaReportEmpty">{tx(language, "Alıcı yok.", "No recipients.", "Wergir tune.")}</p>
            ) : (
              blocks.flatMap((w) =>
                w.balances.map((b) => (
                  <div className="kasaReportRow" key={`${w.cashAccountId}-${b.recipientId}`}>
                    <span className="kasaReportRowDate">{isMulti ? w.name : ""}</span>
                    <span className="kasaReportRowTitle">
                      {b.name}
                      <small className="kasaReportRowKasa">
                        {w.expenses.filter((e) => b.perExpense[e.id]).map((e) => `${e.source} ${money(b.perExpense[e.id], w.currency)}`).join(" · ") || "—"}
                      </small>
                    </span>
                    <span className="kasaReportRowAmount">{money(b.spent, w.currency)}</span>
                  </div>
                )),
              )
            )}
          </div>
        </div>
        <div className="kasaReportSummary">
          <div className="kasaReportSummaryRow kasaReportSummaryMain"><small>{tx(language, "KASADA KALAN (GELİR − GİDER)", "CASH LEFT (INCOME − EXPENSE)", "DI QASEYÊ DE (DAHAT − MESREF)")}</small><strong>{fmt(result)}</strong></div>
          <div className="kasaReportSummaryRow kasaReportSummaryIncome"><small>{tx(language, "TOPLAM GELİR", "TOTAL INCOME", "DAHATA GİŞTÎ")}</small><strong>{fmt(income)}</strong></div>
          <div className="kasaReportSummaryRow kasaReportSummaryExpense"><small>{tx(language, "TOPLAM GİDER", "TOTAL EXPENSE", "MESREFA GİŞTÎ")}</small><strong>{fmt(expense)}</strong></div>
          <div className="kasaReportSummaryRow kasaReportSummaryMain"><small>{tx(language, "KİŞİLERE DAĞITILAN (HARCAMA)", "ALLOCATED TO RECIPIENTS (SPENT)", "JI WERGIRAN RE (LÊÇÛN)")}</small><strong>{fmt(allocatedSum)}</strong></div>
          <div className="kasaReportSummaryRow kasaReportSummaryDate"><small>{tx(language, "TARİH", "DATE", "TARÎX")}</small><strong>{reportDate}</strong></div>
        </div>
        <div className="modalActions">
          <button type="button" className="light" onClick={onClose}>{tx(language, "Kapat", "Close", "Bigire")}</button>
          <button type="button" className="primary" onClick={exportToExcel}>⇩ {tx(language, "Excel'e Aktar", "Export to Excel", "Derxe Excelê")}</button>
        </div>
      </div>
    </div>
  );
}

// Yeni çalışma alanı / düzenleme: bir kasa seçilir (çalışma alanının kasası), isteğe bağlı ad, gelir tutarı
// (kasadan otomatik ya da elle) ve not girilir. Alt listeler çalışma alanının içinde oluşturulur.
function WorkspaceFormModal({
  language,
  kasas,
  workspace,
  onClose,
  onSaved,
}: {
  language: Language;
  kasas: Kasa[];
  workspace: Workspace | null;
  onClose: () => void;
  onSaved: (ws: Workspace) => void;
}) {
  const [kasaId, setKasaId] = useState<number | "">(workspace?.cashAccountId ?? "");
  const [name, setName] = useState(workspace && workspace.name !== workspace.kasaName ? workspace.name : "");
  const [mode, setMode] = useState<"auto" | "manual">(workspace?.amountMode ?? "auto");
  const [amount, setAmount] = useState(workspace && workspace.amountMode === "manual" ? String(workspace.totals.income) : "");
  const [note, setNote] = useState(workspace?.note ?? "");
  const [saving, setSaving] = useState(false);
  const kasa = kasas.find((k) => k.id === kasaId);
  const current = workspace ? workspace.autoIncome : kasa?.currentAmount ?? 0;

  async function save() {
    if (kasaId === "") return;
    const manual = mode === "manual";
    const value = manual ? r2(parseNumber(amount)) : null;
    setSaving(true);
    const result = workspace
      ? await api<{ workspace: Workspace }>(`/api/list-workspaces/${workspace.cashAccountId}`, "PUT", { name: name.trim(), amount: value, note: note.trim() })
      : await api<{ workspace: Workspace }>("/api/list-workspaces", "POST", { cashAccountId: kasaId, name: name.trim(), amount: value, note: note.trim() });
    setSaving(false);
    if (!result.ok) return alert(result.error);
    onSaved(result.data.workspace);
  }

  return (
    <div className="overlay">
      <form
        className="modal listFormModal"
        onSubmit={(e) => {
          e.preventDefault();
          if (kasaId !== "") save();
        }}
      >
        <div className="modalHead">
          <div>
            <h2>{workspace ? tx(language, "Çalışma Alanını Düzenle", "Edit Workspace", "Qada Xebatê Biguherîne") : tx(language, "Yeni Çalışma Alanı", "New Workspace", "Qada Xebatê ya Nû")}</h2>
            <p>{tx(language, "Çalışma alanının kasasını seçin; ad, gelir tutarı ve not isteğe bağlıdır. Listeler alanın içinde oluşturulur.", "Pick the workspace's cash account; name, income amount and note are optional. Lists are created inside the workspace.", "Qaseya qada xebatê hilbijêrin; nav, mîqdar û nîşe bijarte ne. Lîste di nav qadê de têne çêkirin.")}</p>
          </div>
          <button type="button" onClick={onClose}>×</button>
        </div>
        <div className="formGrid">
          <label>
            {tx(language, "Kasa (çalışma alanı)", "Cash account (workspace)", "Qase (qada xebatê)")}
            {workspace ? (
              <input value={workspace.kasaName} disabled />
            ) : (
              <select required value={kasaId} onChange={(e) => setKasaId(e.target.value ? Number(e.target.value) : "")}>
                <option value="">{kasas.length ? tx(language, "Kasa seçin", "Select a cash account", "Qaseyekê hilbijêre") : tx(language, "Seçilebilecek kasa yok", "No cash account available", "Qase tune")}</option>
                {kasas.map((k) => (<option key={k.id} value={k.id}>{k.name}</option>))}
              </select>
            )}
          </label>
          <label>
            {tx(language, "Ad (isteğe bağlı)", "Name (optional)", "Nav (bijarte)")}
            <input value={name} maxLength={200} placeholder={kasa?.name ?? workspace?.kasaName ?? ""} onChange={(e) => setName(e.target.value)} />
          </label>
          <div className="wide listMembersEditor">
            <small>{tx(language, "Gelir tutarı", "Income amount", "Mîqdara dahatê")}</small>
            <div className="listAmountMode">
              <label className="checkField">
                <input type="radio" name="wsAmountMode" checked={mode === "auto"} onChange={() => setMode("auto")} />
                {tx(language, "Kasadan otomatik al", "Take from the cash account", "Ji qaseyê bixweber bigire")}
                <em>{money(current, "USD")}</em>
              </label>
              <label className="checkField">
                <input type="radio" name="wsAmountMode" checked={mode === "manual"} onChange={() => setMode("manual")} />
                {tx(language, "Elle gir", "Enter manually", "Bi destî binivîse")}
              </label>
            </div>
            {mode === "manual" && (
              <div className="listInlineForm" style={{ width: "100%" }}>
                <input inputMode="decimal" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
                <button type="button" className="light compact" onClick={() => setAmount(String(current))} disabled={kasaId === ""}>
                  {tx(language, "Kasadaki tutarı getir", "Fetch the cash account amount", "Mîqdara qaseyê bîne")}
                </button>
              </div>
            )}
          </div>
          <label className="wide">
            {tx(language, "Not", "Note", "Nîşe")}
            <textarea rows={2} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
        </div>
        <div className="modalActions">
          <button type="button" className="light" onClick={onClose}>{tx(language, "Vazgeç", "Cancel", "Betal")}</button>
          <button className="primary" disabled={saving || kasaId === "" || (mode === "manual" && !amount.trim())}>
            {workspace ? tx(language, "Değişiklikleri Kaydet", "Save Changes", "Guherînan Tomar Bike") : tx(language, "Çalışma Alanını Kaydet", "Save Workspace", "Qada Xebatê Tomar Bike")}
          </button>
        </div>
      </form>
    </div>
  );
}

function WorkspaceView({
  language,
  ws,
  busy,
  onBack,
  onAddRecipient,
  onRenameRecipient,
  onDeleteRecipient,
  onSaveAllocations,
  onShowResult,
  onEditWorkspace,
}: {
  language: Language;
  ws: Workspace;
  busy: boolean;
  onBack: () => void;
  onShowResult: () => void;
  onEditWorkspace: () => void;
  onSaveAllocations: (expenseId: number, allocations: { recipientId: number; amount: number }[]) => Promise<boolean>;
  onAddRecipient: (name: string) => Promise<boolean>;
  onRenameRecipient: (id: number, name: string) => Promise<boolean>;
  onDeleteRecipient: (id: number) => Promise<boolean>;
}) {
  const c = ws.currency;
  const [panel, setPanel] = useState<"recipients" | "distribution" | "accounts" | null>(null);
  const [newRecipient, setNewRecipient] = useState("");

  return (
    <div className="listDetail">
      <div className="listWsBar">
        <div className="listWsInfo">
          <button className="light compact" onClick={onBack}>← {tx(language, "Listeler", "Lists", "Lîste")}</button>
          <span className="listWsLabel">{tx(language, "Çalışma Alanı", "Workspace", "Qada Xebatê")}</span>
          <span className="listWsName">{ws.name}</span>
          <small className="listMuted">{ws.kasaName !== ws.name ? `${tx(language, "Kasa", "Cash", "Qase")}: ${ws.kasaName} · ` : ""}{ws.ownerName || "—"} · {c}</small>
          {ws.note && <small className="listWsNote" title={ws.note}>📝 {ws.note}</small>}
        </div>
        <div className="listWsActions">
          {ws.canWrite && <button className="light" onClick={onEditWorkspace}>✎ {tx(language, "Düzenle", "Edit", "Biguherîne")}</button>}
          <button className="light" onClick={onShowResult}>📊 {tx(language, "Sonuçları Görüntüle", "View Results", "Encaman Nîşan Bide")}</button>
        </div>
      </div>

      <div className="listMetrics">
        <div className="metricBlue" title={tx(language, "Bu kasadaki kasa ve gelir kayıtlarının toplamı (Kasalar/Gelir sayfalarından girilir)", "Total of this account's cash and income records (entered on the Cash/Income pages)", "Hejmara tomarên qase û dahatê yên vê qasayê")}><small>{tx(language, "Kasa geliri", "Cash income", "Dahata qasayê")}</small><b>{money(ws.totals.income, c)}</b></div>
        <div title={tx(language, "Bu kasaya bağlı Gider kayıtlarının toplamı (Gider sayfasından girilir)", "Total of this account's Expense records (entered on the Expense page)", "Hejmara tomarên Mesrefê yên vê qasayê")}><small>{tx(language, "Kasa gideri", "Cash expense", "Mesrefa qasayê")}</small><b>{money(ws.totals.expense, c)}</b></div>
        <div><small>{tx(language, "Kişilere dağıtılan", "Allocated to people", "Ji kesan re hatiye dabeşkirin")}</small><b>{money(ws.totals.distributed, c)}</b></div>
        <div className={ws.totals.kasaRemaining < 0 ? "metricAmber" : undefined}><small>{tx(language, "Kasada kalan", "Cash left", "Di qasayê de")}</small><b className={ws.totals.kasaRemaining < 0 ? "negative" : "positive"}>{money(ws.totals.kasaRemaining, c)}</b></div>
      </div>

      {ws.expenses.length === 0 ? (
        <p className="listsHint">
          {tx(language, "Bu kasaya bağlı gider yok. Gider sayfasından bu kasayı seçerek gider ekleyin; giderler burada kişilere dağıtılır.", "No expenses linked to this cash account. Add expenses on the Expense page by choosing this account; they are allocated to people here.", "Mesrefa girêdayî vê qaseyê tune. Ji rûpela Mesref vê qaseyê hilbijêrin; mesref li vir ji kesan re têne dabeşkirin.")}
        </p>
      ) : (
        <ExpensesGrid language={language} ws={ws} onSaveAllocations={onSaveAllocations} onAddRecipient={onAddRecipient} />
      )}

      <section className="listTools">
        <div className="listToolsBar" role="tablist">
          {(
            [
              ["distribution", tx(language, "Dağıtılan miktarı görüntüle", "View distributed amount", "Mîqdara hatiye dabeşkirin nîşan bide"), money(ws.totals.distributed, c)],
              ["recipients", tx(language, "Kişileri yönet", "Manage people", "Kesan birêve bibe"), String(ws.recipients.length)],
              ["accounts", tx(language, "Kişi hesapları", "Person accounts", "Hesabên kesan"), ""],
            ] as ["recipients" | "distribution" | "accounts", string, string][]
          ).map(([id, label, badge]) => (
            <button key={id} type="button" role="tab" aria-selected={panel === id} className={`listToolsTab${panel === id ? " active" : ""}`} onClick={() => setPanel((cur) => (cur === id ? null : id))}>
              {label}
              {badge && <em>{badge}</em>}
            </button>
          ))}
        </div>

        {panel === "distribution" && (
          <div className="listToolsBody">
            <p className="listsHint">{tx(language, "Kişilere dağıtılan miktarlar — her kişinin bu kasanın giderlerindeki harcaması", "Amounts allocated to people — each person's spending in this account's expenses", "Mîqdarên ji kesan re hatine dabeşkirin — lêçûna her kesî di mesrefên vê qasayê de")}</p>
            <div className="listReceivedRow">
              {ws.balances.length === 0 && <span className="listMuted">—</span>}
              {ws.balances.map((b, i) => (
                <span key={b.recipientId} className="listReceivedChip">
                  <span style={{ background: RECIPIENT_COLORS[i % RECIPIENT_COLORS.length] }}>{b.name}</span>
                  <b>{money(b.spent, c)}</b>
                </span>
              ))}
              {ws.totals.unassigned > 0.005 && (
                <span className="listReceivedChip">
                  <span style={{ background: "#fde9c0" }}>{tx(language, "Dağıtılmamış", "Unallocated", "Nehatiye dabeşkirin")}</span>
                  <b>{money(ws.totals.unassigned, c)}</b>
                </span>
              )}
            </div>
          </div>
        )}

        {panel === "recipients" && (
          <div className="listToolsBody">
            <div className="listRecipients">
              {ws.recipients.map((r) => (
                <span key={r.id} className="listRecipientChip">
                  {r.name}
                  {ws.canWrite && (
                    <>
                      <button
                        type="button"
                        title={tx(language, "Yeniden adlandır", "Rename", "Nav biguherîne")}
                        onClick={() => {
                          const next = prompt(tx(language, "Kişi adı", "Person name", "Navê kesî"), r.name);
                          if (next && next.trim() && next.trim() !== r.name) onRenameRecipient(r.id, next.trim());
                        }}
                      >✎</button>
                      <button
                        type="button"
                        title={tx(language, "Sil", "Delete", "Jê bibe")}
                        onClick={() => confirm(tx(language, `${r.name} silinsin mi? Giderlerdeki dağıtımları da silinir.`, `Delete ${r.name}? Their allocations in expenses are deleted too.`, `${r.name} were jêbirin? Dabeşkirinên wî/wê yên di mesrefan de jî têne jêbirin.`)) && onDeleteRecipient(r.id)}
                      >×</button>
                    </>
                  )}
                </span>
              ))}
              {ws.canWrite && (
                <form
                  className="listInlineForm"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (newRecipient.trim() && (await onAddRecipient(newRecipient.trim()))) setNewRecipient("");
                  }}
                >
                  <input value={newRecipient} maxLength={200} placeholder={tx(language, "Yeni kişi adı", "New person name", "Navê kesê nû")} onChange={(e) => setNewRecipient(e.target.value)} />
                  <button className="light compact" disabled={!newRecipient.trim() || busy}>＋ {tx(language, "Kişi ekle", "Add person", "Kes zêde bike")}</button>
                </form>
              )}
            </div>
          </div>
        )}

        {panel === "accounts" && (
          <div className="listToolsBody">
            {ws.balances.length === 0 ? (
              <p className="listsHint">{tx(language, "Henüz kişi yok.", "No people yet.", "Hê kes tune.")}</p>
            ) : (
              <div className="listMatrixScroll">
                <table className="listTable">
                  <thead>
                    <tr>
                      <th>{tx(language, "Kişi", "Person", "Kes")}</th>
                      {ws.expenses.map((e) => (<th key={e.id} className="r" title={`${formatDate(e.date, language)} · ${money(e.amount, e.currency)}`}>{e.source}</th>))}
                      <th className="r">{tx(language, "Toplam harcama", "Total spent", "Lêçûna giştî")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ws.balances.map((b) => (
                      <tr key={b.recipientId}>
                        <td>{b.name}</td>
                        {ws.expenses.map((e) => (<td key={e.id} className="r">{b.perExpense[e.id] ? money(b.perExpense[e.id], c) : "—"}</td>))}
                        <td className="r">{money(b.spent, c)}</td>
                      </tr>
                    ))}
                    <tr className="listTotalRow">
                      <td>{tx(language, "Toplam", "Total", "Giştî")}</td>
                      {ws.expenses.map((e) => (<td key={e.id} className="r">{money(r2(e.amount - e.unassigned), c)}</td>))}
                      <td className="r">{money(ws.totals.distributed, c)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

const RECIPIENT_TINTS = ["#f1f6fc", "#f2f9f1", "#fef5ee", "#f7f2fb", "#fdf1f4", "#f1f9f9"];
const RECIPIENT_TEXT = ["#0c447c", "#085041", "#712b13", "#3c3489", "#72243e", "#0f5a5a"];
const RECIPIENT_COLORS = ["#cfe1f4", "#d5ecd4", "#fbdcc4", "#e6d9f3", "#f8d3de", "#d3ecec"];

// Liste kasasının Gider kayıtları: her gider bir satır; solda giderin bilgileri (tarih, gider, not, tutar), sağa doğru
// her kişi için ayrı sütun (hücreye o kişiye dağıtılan tutar = kişinin bu giderdeki harcaması), Dağıtılan ve Kalan.
function ExpensesGrid({
  language,
  ws,
  onSaveAllocations,
  onAddRecipient,
}: {
  language: Language;
  ws: Workspace;
  onSaveAllocations: (expenseId: number, allocations: { recipientId: number; amount: number }[]) => Promise<boolean>;
  onAddRecipient: (name: string) => Promise<boolean>;
}) {
  const c = ws.currency;
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [edits, setEdits] = useState<Record<string, string>>({});
  // Arama ve süzme: serbest metin (gider, kişi, liste, kasa, not), kişi (dağıtım yapılan) ve liste adı.
  const [q, setQ] = useState("");
  const [fPerson, setFPerson] = useState<number | "">("");
  const [fList, setFList] = useState("");
  // Kişi sütunları soldan sağa açılıp kapanır; tercih tarayıcıda hatırlanır.
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem("listsRecipientsOpen") !== "0";
    } catch {
      return true;
    }
  });
  const toggle = () =>
    setOpen((prev) => {
      try {
        localStorage.setItem("listsRecipientsOpen", prev ? "0" : "1");
      } catch {}
      return !prev;
    });
  const key = (expenseId: number, recipientId: number) => `${expenseId}:${recipientId}`;
  // Sütun genişlikleri: başlığın sağ kenarından sürüklenerek ayarlanır (çift tıklama varsayılana döndürür); tarayıcıda hatırlanır.
  const [widths, setWidths] = useState<Record<string, number>>(() => {
    try {
      return JSON.parse(localStorage.getItem("listsGridWidths") || "{}");
    } catch {
      return {};
    }
  });
  const colW = (k: string, def: number) => widths[k] ?? def;
  function startResize(k: string, def: number, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const base = colW(k, def);
    const onMove = (ev: MouseEvent) => {
      const next = Math.min(560, Math.max(56, Math.round(base + ev.clientX - startX)));
      setWidths((prev) => ({ ...prev, [k]: next }));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.classList.remove("noSelectDragging");
      setWidths((prev) => {
        try {
          localStorage.setItem("listsGridWidths", JSON.stringify(prev));
        } catch {}
        return prev;
      });
    };
    document.body.classList.add("noSelectDragging");
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }
  const resetWidth = (k: string) =>
    setWidths((prev) => {
      const next = { ...prev };
      delete next[k];
      try {
        localStorage.setItem("listsGridWidths", JSON.stringify(next));
      } catch {}
      return next;
    });
  const grip = (k: string, def: number) => (
    <i className="lgResizer" title="↔" onMouseDown={(e) => startResize(k, def, e)} onDoubleClick={() => resetWidth(k)} />
  );

  async function commit(expense: Expense, recipientId: number) {
    const k = key(expense.id, recipientId);
    const raw = edits[k];
    if (raw === undefined) return;
    const value = r2(parseNumber(raw));
    const current = expense.byRecipient[recipientId] ?? 0;
    setEdits((prev) => {
      const next = { ...prev };
      delete next[k];
      return next;
    });
    if (value === current) return;
    const allocations = ws.recipients
      .map((r) => ({ recipientId: r.id, amount: r.id === recipientId ? value : expense.byRecipient[r.id] ?? 0 }))
      .filter((a) => a.amount > 0);
    await onSaveAllocations(expense.id, allocations);
  }

  const sumRecipient = (id: number) => r2(shown.reduce((a, e) => a + (e.byRecipient[id] ?? 0), 0));
  const allocatedTotal = (e: Expense) => r2(Object.values(e.byRecipient).reduce((a, v) => a + v, 0));
  const money0 = (v: number) => (Math.abs(v) < 0.005 ? "—" : money(v, c));
  const D = { date: 104, name: 200, kasa: 120, person: 120, list: 120, note: 150, amount: 126, recipient: 116, alloc: open ? 116 : 150, left: 150 };
  const listNames = [...new Set(ws.expenses.map((e) => e.listName).filter(Boolean))];
  const shown = ws.expenses.filter((e) => {
    if (fPerson !== "" && !((e.byRecipient[fPerson] ?? 0) > 0)) return false;
    if (fList && e.listName !== fList) return false;
    const needle = q.trim().toLowerCase();
    if (!needle) return true;
    const people = ws.recipients.filter((r) => (e.byRecipient[r.id] ?? 0) > 0).map((r) => r.name);
    return [e.date, formatDate(e.date, language), e.source, e.detail, e.note, e.person, e.listName, ws.kasaName, ws.name, ...people].join(" ").toLowerCase().includes(needle);
  });
  const filtered = shown.length !== ws.expenses.length;
  const expenseTotal = r2(shown.reduce((a, e) => a + e.amount, 0));
  const grandAllocated = r2(shown.reduce((a, e) => a + allocatedTotal(e), 0));
  const minWidth =
    colW("date", D.date) + colW("name", D.name) + colW("kasa", D.kasa) + colW("person", D.person) + colW("list", D.list) + colW("note", D.note) + colW("amount", D.amount) +
    (open ? ws.recipients.reduce((a, r) => a + colW(`r${r.id}`, D.recipient), 0) : 0) + colW("alloc", D.alloc) + colW("left", D.left);

  return (
    <div className="listMatrixScroll">
      <div className="listFilters">
        <input
          type="search"
          value={q}
          placeholder={tx(language, "Ara: gider, kişi, liste, kasa, not…", "Search: expense, person, list, cash account, note…", "Lêgerîn: mesref, kes, lîste, qase, nîşe…")}
          onChange={(e) => setQ(e.target.value)}
        />
        <select value={fPerson} onChange={(e) => setFPerson(e.target.value ? Number(e.target.value) : "")} aria-label={tx(language, "Kişi", "Person", "Kes")}>
          <option value="">{tx(language, "Tüm kişiler", "All people", "Hemû kes")}</option>
          {ws.recipients.map((r) => (<option key={r.id} value={r.id}>{r.name}</option>))}
        </select>
        <select value={fList} onChange={(e) => setFList(e.target.value)} aria-label={tx(language, "Liste", "List", "Lîste")} disabled={listNames.length === 0}>
          <option value="">{tx(language, "Tüm listeler", "All lists", "Hemû lîste")}</option>
          {listNames.map((n) => (<option key={n} value={n}>{n}</option>))}
        </select>
        {(q || fPerson !== "" || fList) && (
          <button type="button" className="light compact" onClick={() => { setQ(""); setFPerson(""); setFList(""); }}>
            ✕ {tx(language, "Temizle", "Clear", "Paqij bike")}
          </button>
        )}
        <small className="listMuted">{shown.length}/{ws.expenses.length}</small>
      </div>
      <table className="listTable listsGrid" style={{ minWidth }}>
        <colgroup>
          <col style={{ width: colW("date", D.date) }} />
          <col style={{ width: colW("name", D.name) }} />
          <col style={{ width: colW("kasa", D.kasa) }} />
          <col style={{ width: colW("person", D.person) }} />
          <col style={{ width: colW("list", D.list) }} />
          <col style={{ width: colW("note", D.note) }} />
          <col style={{ width: colW("amount", D.amount) }} />
          {open && ws.recipients.map((r) => <col key={r.id} style={{ width: colW(`r${r.id}`, D.recipient) }} />)}
          <col style={{ width: colW("alloc", D.alloc) }} />
          <col style={{ width: colW("left", D.left) }} />
          <col />
        </colgroup>
        <thead>
          <tr>
            <th className="lgH1">{tx(language, "Tarih", "Date", "Dîrok")}{grip("date", D.date)}</th>
            <th className="lgH1">{tx(language, "Gider", "Expense", "Mesref")}{grip("name", D.name)}</th>
            <th className="lgH1">{tx(language, "Kasa", "Cash account", "Qase")}{grip("kasa", D.kasa)}</th>
            <th className="lgH1">{tx(language, "Kişi", "Person", "Kes")}{grip("person", D.person)}</th>
            <th className="lgH1">{tx(language, "Liste", "List", "Lîste")}{grip("list", D.list)}</th>
            <th className="lgH1 lgCenter">{tx(language, "Not", "Note", "Nîşe")}{grip("note", D.note)}</th>
            <th className="lgH1">{tx(language, "Gider tutarı", "Expense amount", "Mîqdara mesrefê")}{grip("amount", D.amount)}</th>
            {open &&
              ws.recipients.map((r, i) => (
                <th key={r.id} className="lgH2 r">
                  {i === 0 && (
                    <button type="button" className="listsGridToggle" onClick={toggle} title={tx(language, "Kişi sütunlarını kapat", "Collapse people columns", "Stûnên kesan bigire")}>
                      ◂
                    </button>
                  )}
                  <span className="lgName" style={{ background: RECIPIENT_COLORS[i % RECIPIENT_COLORS.length] }}>{r.name}</span>
                  {grip(`r${r.id}`, D.recipient)}
                </th>
              ))}
            <th className="lgH2 r">
              {!open && (
                <button type="button" className="listsGridToggle" onClick={toggle} title={tx(language, "Kişi sütunlarını aç", "Expand people columns", "Stûnên kesan veke")}>
                  ▸ {tx(language, "Kişiler", "People", "Kes")} ({ws.recipients.length})
                </button>
              )}
              {tx(language, "Dağıtılan", "Allocated", "Hatiye dabeşkirin")}
              {grip("alloc", D.alloc)}
            </th>
            <th className="lgH3 r">
              <span className="lgKalanHead">
                {tx(language, "Kalan", "Left", "Mayî")}
                {ws.canWrite &&
                  (adding ? (
                    <input
                      autoFocus
                      value={newName}
                      maxLength={200}
                      placeholder={tx(language, "Kişi adı", "Person name", "Navê kesî")}
                      onChange={(e) => setNewName(e.target.value)}
                      onKeyDown={async (e) => {
                        if (e.key === "Escape") {
                          setAdding(false);
                          setNewName("");
                        } else if (e.key === "Enter" && newName.trim()) {
                          if (await onAddRecipient(newName.trim())) {
                            setNewName("");
                            setAdding(false);
                          }
                        }
                      }}
                      onBlur={() => !newName.trim() && setAdding(false)}
                    />
                  ) : (
                    <button type="button" className="lgAddRecipient" onClick={() => setAdding(true)} title={tx(language, "Çalışma alanına yeni kişi ekle", "Add a person to this workspace", "Kesekî nû li vê qada xebatê zêde bike")}>
                      ＋ {tx(language, "Kişi ekle", "Add person", "Kes zêde bike")}
                    </button>
                  ))}
              </span>
              {grip("left", D.left)}
            </th>
            <th className="lgFill" />
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 && (
            <tr><td colSpan={12} className="lgMuted" style={{ textAlign: "center", padding: 18 }}>{tx(language, "Aramanıza uyan gider yok.", "No expenses match your search.", "Mesrefa li gorî lêgerîna we tune.")}</td></tr>
          )}
          {shown.map((e) => {
            const left = r2(e.amount - allocatedTotal(e));
            return (
              <tr key={e.id}>
                <td className="lgMuted">{formatDate(e.date, language)}</td>
                <td><span className="listNameLink">{e.source}</span></td>
                <td className="lgMuted">{ws.kasaName}</td>
                <td>{e.person || "—"}</td>
                <td>{e.listName ? <span className="lgListTag">{e.listName}</span> : "—"}</td>
                <td className="listGridNote lgMuted lgCenter" title={e.note || e.detail}>{e.note || e.detail || "—"}</td>
                <td className="listsGridAmount lgT1">{money(e.amount, e.currency)}</td>
                {open &&
                  ws.recipients.map((r, i) => {
                    const k = key(e.id, r.id);
                    const value = e.byRecipient[r.id] ?? 0;
                    return (
                      <td
                        key={r.id}
                        className="listsGridCell r"
                        style={{ background: `${RECIPIENT_COLORS[i % RECIPIENT_COLORS.length]}55`, color: RECIPIENT_TEXT[i % RECIPIENT_TEXT.length], fontWeight: 600 }}
                      >
                        {ws.canWrite ? (
                          <input
                            className="r"
                            inputMode="decimal"
                            placeholder="—"
                            value={edits[k] ?? (value ? money(value, c) : "")}
                            onFocus={() => setEdits((prev) => (prev[k] === undefined ? { ...prev, [k]: value ? String(value) : "" } : prev))}
                            onChange={(ev) => setEdits((prev) => ({ ...prev, [k]: ev.target.value }))}
                            onBlur={() => commit(e, r.id)}
                            onKeyDown={(ev) => ev.key === "Enter" && (ev.target as HTMLInputElement).blur()}
                          />
                        ) : (
                          money0(value)
                        )}
                      </td>
                    );
                  })}
                <td className="lgT2 lgStrong r">{money0(allocatedTotal(e))}</td>
                <td className={`lgT3 r ${left < -0.005 ? "negative" : left > 0.005 ? "lgRemain" : "lgMuted"}`}>{money0(left)}</td>
                <td className="lgFill" />
              </tr>
            );
          })}
          <tr className="listTotalRow">
            <td colSpan={6} className="lgTot1">{filtered ? `${tx(language, "Toplam (süzülmüş)", "Total (filtered)", "Giştî (parzûnkirî)")} · ${shown.length}/${ws.expenses.length}` : tx(language, "Toplam", "Total", "Giştî")}</td>
            <td className="lgTot1">{money(expenseTotal, c)}</td>
            {open && ws.recipients.map((r) => (<td key={r.id} className="lgTot2 r">{money0(sumRecipient(r.id))}</td>))}
            <td className="lgTot2 r">{money0(grandAllocated)}</td>
            <td className="lgTot3 r">{money0(r2(expenseTotal - grandAllocated))}</td>
            <td className="lgFill" />
          </tr>
        </tbody>
      </table>
      <p className="listsHint">
        {open
          ? tx(language, "Tutarı doğrudan kişinin hücresine yazın (o kişinin bu giderdeki harcaması); Enter ile kaydedilir.", "Type amounts straight into a person's cell (their spending in this expense); Enter saves.", "Mîqdarê rasterast di şaneya kesî de binivîse (lêçûna wî/wê di vê mesrefê de); Enter tomar dike.")
          : tx(language, "Kişilere göre dağılımı görmek ve düzenlemek için “Kişiler” düğmesiyle sütunları sağa doğru açın.", "Use the “People” button to expand the per-person columns to the right.", "Ji bo dîtina dabeşkirina li gorî kesan bi bişkoka “Kes” stûnan ber bi rastê veke.")}
      </p>
    </div>
  );
}

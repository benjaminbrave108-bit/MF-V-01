"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { date as formatDate, money } from "../lib/finance";
import { tx } from "../lib/i18n";
import type { Language } from "../lib/types";

// Proje Aşaması 2 — Liste defteri. Çalışma alanı = kasa (ör. "2026-V"):
// kasanın geliri alıcılara dağıtılır; kasanın altında kodlu listeler vardır;
// bir listenin ürünleri alıcılara yazılır; böylece her alıcının hangi listeden
// ne kadar harcadığı ve kasada/alıcılarda ne kaldığı çıkar.
type Recipient = { id: number; name: string };
type Distribution = { id: number; recipientId: number; amount: number; date: string; note: string };
type Item = { id: number; name: string; quantity: number; unitPrice: number; amount: number; recipientId: number | null; note: string };
type ListSummary = {
  id: number;
  code: string;
  name: string;
  date: string;
  status: "open" | "closed";
  note: string;
  itemCount: number;
  itemsTotal: number;
  total: number;
  byRecipient: Record<string, number>;
  unassigned: number;
  items: Item[];
};
type Balance = { recipientId: number; name: string; spent: number; perList: Record<string, number> };
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
  lists: ListSummary[];
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
  const [listId, setListId] = useState<number | null>(null);
  const [newListFor, setNewListFor] = useState<number | null>(null);
  const [wsForm, setWsForm] = useState<"new" | Workspace | null>(null);
  const [editingList, setEditingList] = useState<ListSummary | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [resultFor, setResultFor] = useState<number[] | null>(null);
  const [statusFor, setStatusFor] = useState<number | null>(null);

  const load = useCallback(async () => {
    const result = await api<{ workspaces: Workspace[]; kasas: Kasa[] }>("/api/lists", "GET");
    if (!result.ok) return setError(result.error);
    setError("");
    setWorkspaces(result.data.workspaces);
    setKasas(result.data.kasas);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  // Seçili ekranlarda düzenleme yapılmıyorken diğer sayfalardan gelen kasa
  // gelirleri de görünsün diye periyodik yenileme (ürün düzenlenirken yapılmaz).
  const [editingItems, setEditingItems] = useState(false);
  useEffect(() => {
    if (editingItems) return;
    const interval = setInterval(load, 20000);
    return () => clearInterval(interval);
  }, [load, editingItems]);

  const workspace = useMemo(() => workspaces?.find((w) => w.cashAccountId === kasaId) ?? null, [workspaces, kasaId]);
  const list = useMemo(() => workspace?.lists.find((l) => l.id === listId) ?? null, [workspace, listId]);

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
                {tx(language, "Kasa bazında listeler, ürünler ve alıcı harcamaları", "Lists, products and recipient spending per cash account", "Lîste, berhem û lêçûnên wergiran li gorî qaseyê")}
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
              {tx(language, "Henüz çalışma alanı yok. Yeni Çalışma Alanı ile bir kasa seçin; listeleri alanın içinde oluşturursunuz.", "No workspaces yet. Create one with New Workspace by picking a cash account; you create lists inside it.", "Hê qada xebatê tune. Bi Qada Xebatê ya Nû qaseyekê hilbijêrin; lîste di nav qadê de têne çêkirin.")}
            </p>
          )}
          <div className="listCards">
            {workspaces?.map((w) => (
              <button key={w.cashAccountId} type="button" className="listCard" onClick={() => setKasaId(w.cashAccountId)}>
                <span className="listCardCode">{tx(language, "Çalışma alanı", "Workspace", "Qada xebatê")}</span>
                <strong>{w.name}</strong>
                <small>
                  {w.kasaName !== w.name ? `${tx(language, "Kasa", "Cash", "Qase")}: ${w.kasaName} · ` : ""}{w.ownerName || "—"} · {w.lists.length} {tx(language, "liste", "lists", "lîste")} · {w.recipients.length} {tx(language, "alıcı", "recipients", "wergir")}
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
      {workspace && !list && (
        <WorkspaceView
          language={language}
          ws={workspace}
          busy={busy}
          onBack={() => setKasaId(null)}
          onOpenList={(id) => setListId(id)}
          onNewList={() => setNewListFor(workspace.cashAccountId)}
          onAddRecipient={(name) => mutate(`/api/list-workspaces/${workspace.cashAccountId}/recipients`, "POST", { name })}
          onRenameRecipient={(id, name) => mutate(`/api/list-workspaces/${workspace.cashAccountId}/recipients/${id}`, "PUT", { name })}
          onDeleteRecipient={(id) => mutate(`/api/list-workspaces/${workspace.cashAccountId}/recipients/${id}`, "DELETE")}
          onRequestStatus={(id) => setStatusFor(id)}
          onShowResult={() => setResultFor([workspace.cashAccountId])}
          onEditWorkspace={() => setWsForm(workspace)}
          onSaveAllocations={(id, allocations) => mutate(`/api/lists/${id}/allocations`, "PUT", { allocations })}
        />
      )}
      {workspace && list && (
        <ListView
          language={language}
          ws={workspace}
          list={list}
          busy={busy}
          onBack={() => {
            setListId(null);
            setEditingItems(false);
          }}
          onEdit={() => setEditingList(list)}
          onToggleStatus={() => setStatusFor(list.id)}
          onDelete={async () => {
            if (!confirm(tx(language, "Liste ve ürünleri silinsin mi?", "Delete this list and its products?", "Lîste û berhemên wê were jêbirin?"))) return;
            if (await mutate(`/api/lists/${list.id}`, "DELETE")) setListId(null);
          }}
          onSaveItems={(items) => mutate(`/api/lists/${list.id}/items`, "PUT", { items })}
          onApplyItems={(amount, allocations) => mutate(`/api/lists/${list.id}`, "PUT", { amount, allocations })}
          onDirty={setEditingItems}
        />
      )}
      {resultFor && workspaces && <ListsResultModal language={language} workspaces={workspaces} initialIds={resultFor} onClose={() => setResultFor(null)} />}
      {statusFor !== null && workspace && workspace.lists.some((l) => l.id === statusFor) && (
        <ListStatusModal
          language={language}
          ws={workspace}
          list={workspace.lists.find((l) => l.id === statusFor)!}
          onClose={() => setStatusFor(null)}
          onConfirm={async () => {
            const target = workspace.lists.find((l) => l.id === statusFor)!;
            if (await mutate(`/api/lists/${target.id}`, "PUT", { status: target.status === "open" ? "closed" : "open" })) setStatusFor(null);
          }}
        />
      )}
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
            setListId(null);
          }}
        />
      )}
      {newListFor !== null && (
        <ListFormModal
          language={language}
          kasas={kasas}
          fixedKasaId={newListFor}
          workspace={workspaces?.find((w) => w.cashAccountId === newListFor) ?? null}
          list={null}
          onClose={() => setNewListFor(null)}
          onSaved={(ws, id) => {
            onDataChanged?.();
            setNewListFor(null);
            apply(ws, ws.cashAccountId);
            setKasaId(ws.cashAccountId);
            setListId(id);
          }}
        />
      )}
      {editingList && workspace && (
        <ListFormModal
          language={language}
          kasas={kasas}
          fixedKasaId={workspace.cashAccountId}
          workspace={workspace}
          list={editingList}
          onClose={() => setEditingList(null)}
          onSaved={(ws) => {
            onDataChanged?.();
            setEditingList(null);
            apply(ws, ws.cashAccountId);
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
    .flatMap((w) => w.lists.map((l) => ({ key: `l${l.id}`, date: l.date, title: `${l.name} · ${l.code}`, ws: w.name, amount: l.total, currency: w.currency })))
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
    section(tx(language, "GİDER (LİSTELER)", "EXPENSE (LISTS)", "MESREF (LÎSTE)"), expenseRows, fmt(expense), "FFFFF0DF", "FFD06F22");

    band(tx(language, "ALICILAR", "RECIPIENTS", "WERGIR"), "FFE7EEF6", "FF176B87");
    const rh = sheet.addRow([tx(language, "Çalışma alanı", "Workspace", "Qada xebatê"), tx(language, "Alıcı", "Recipient", "Wergir"), tx(language, "Listelerde harcadığı", "Spent per list", "Lêçûn li gorî lîsteyê"), tx(language, "Toplam harcama", "Total spent", "Lêçûna giştî")]);
    rh.eachCell((cell) => { cell.font = { name: "Arial", bold: true, size: 9, color: { argb: "FF5B6F77" } }; cell.border = border; });
    for (const w of blocks) {
      for (const b of w.balances) {
        const row = sheet.addRow([w.name, b.name, w.lists.filter((l) => b.perList[l.id]).map((l) => `${l.code}: ${money(b.perList[l.id], w.currency)}`).join(" · ") || "—", b.spent]);
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
      [tx(language, "ALICILARA DAĞITILAN (HARCAMA)", "ALLOCATED TO RECIPIENTS (SPENT)", "JI WERGIRAN RE (LÊÇÛN)"), fmt(allocatedSum), "FFFFF6DB", "FF7A5A1D"],
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
            <h2>{tx(language, "Liste Sonuç Raporu", "List Result Report", "Rapora Encama Lîsteyê")}</h2>
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
          <div className="kasaReportSectionHead"><span>{tx(language, "Gider (listeler)", "Expense (lists)", "Mesref (lîste)")}</span><strong>{fmt(expense)}</strong></div>
          <div className="kasaReportList">{rowsView(expenseRows)}</div>
        </div>
        <div className="kasaReportSection">
          <div className="kasaReportSectionHead"><span>{tx(language, "Alıcılar (liste harcamaları)", "Recipients (list spending)", "Wergir (lêçûnên lîsteyê)")}</span><strong>{fmt(allocatedSum)}</strong></div>
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
                        {w.lists.filter((l) => b.perList[l.id]).map((l) => `${l.code} ${money(b.perList[l.id], w.currency)}`).join(" · ") || "—"}
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
          <div className="kasaReportSummaryRow kasaReportSummaryMain"><small>{tx(language, "ALICILARA DAĞITILAN (HARCAMA)", "ALLOCATED TO RECIPIENTS (SPENT)", "JI WERGIRAN RE (LÊÇÛN)")}</small><strong>{fmt(allocatedSum)}</strong></div>
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

// Liste durumu: "Liste bitti / Sonuçlandır" — liste sonuçlandığında hesabı kapanır: liste tutarı, dağıtılan
// miktar ve kalan sabitlenir (kapalı listede tutar, dağıtım ve ürünler değişmez). Yeniden açılabilir.
function ListStatusModal({
  language,
  ws,
  list,
  onClose,
  onConfirm,
}: {
  language: Language;
  ws: Workspace;
  list: ListSummary;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const c = ws.currency;
  const closing = list.status === "open";
  const allocated = r2(Object.values(list.byRecipient).reduce((a, v) => a + v, 0));
  const left = r2(list.total - allocated);
  return (
    <div className="overlay">
      <div className="modal listFormModal" onClick={(e) => e.stopPropagation()}>
        <div className="modalHead">
          <div>
            <h2>
              {closing
                ? tx(language, "Listeyi Sonuçlandır", "Finalize List", "Lîsteyê Biqedîne")
                : tx(language, "Listeyi Yeniden Aç", "Reopen List", "Lîsteyê Dîsa Veke")}
            </h2>
            <p>{list.code} · {list.name} · {ws.name}</p>
          </div>
          <button type="button" onClick={onClose}>×</button>
        </div>
        <div className="listMetrics" style={{ marginBottom: 10 }}>
          <div><small>{tx(language, "Liste tutarı", "List amount", "Mîqdara lîsteyê")}</small><b>{money(list.total, c)}</b></div>
          <div><small>{tx(language, "Dağıtılan", "Allocated", "Hatiye dabeşkirin")}</small><b>{money(allocated, c)}</b></div>
          <div className={left > 0.005 ? "metricAmber" : undefined}><small>{tx(language, "Kalan", "Left", "Mayî")}</small><b>{money(left, c)}</b></div>
        </div>
        {closing ? (
          <p className="listsHint">
            {left > 0.005
              ? tx(language, `Listede alıcılara dağıtılmamış ${money(left, c)} var. Sonuçlandırırsanız bu tutar listenin kalanı olarak sabitlenir.`, `${money(left, c)} of this list is not allocated to recipients. If you finalize, it is fixed as the list's remainder.`, `${money(left, c)} ji vê lîsteyê ji wergiran re nehatiye dabeşkirin. Heke biqedînin wekî mayî tê sabitkirin.`)
              : tx(language, "Liste tutarı alıcılara tamamen dağıtılmış.", "The list amount is fully allocated to recipients.", "Mîqdara lîsteyê bi temamî ji wergiran re hatiye dabeşkirin.")}
            {" "}
            {tx(language, "Sonuçlanan listede tutar, dağıtım ve ürünler değiştirilemez; gerekirse yeniden açabilirsiniz.", "A finalized list's amount, allocation and products cannot be changed; you can reopen it if needed.", "Di lîsteya qediyayî de mîqdar, dabeşkirin û berhem nayên guhertin; ger hewce be dîsa dikarin vekin.")}
          </p>
        ) : (
          <p className="listsHint">{tx(language, "Liste yeniden açılınca tutar, dağıtım ve ürünler tekrar düzenlenebilir.", "When reopened, the amount, allocation and products can be edited again.", "Dema lîste dîsa vebe, mîqdar, dabeşkirin û berhem dîsa dikarin werin guhertin.")}</p>
        )}
        <div className="modalActions">
          <button type="button" className="light" onClick={onClose}>{tx(language, "Vazgeç", "Cancel", "Betal")}</button>
          <button
            type="button"
            className="primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await onConfirm();
              setBusy(false);
            }}
          >
            {closing ? `✔ ${tx(language, "Liste bitti — Sonuçlandır", "List finished — Finalize", "Lîste qediya — Biqedîne")}` : tx(language, "Yeniden aç", "Reopen", "Dîsa veke")}
          </button>
        </div>
      </div>
    </div>
  );
}

function WorkspaceView({
  language,
  ws,
  busy,
  onBack,
  onOpenList,
  onNewList,
  onAddRecipient,
  onRenameRecipient,
  onDeleteRecipient,
  onSaveAllocations,
  onShowResult,
  onEditWorkspace,
  onRequestStatus,
}: {
  language: Language;
  ws: Workspace;
  busy: boolean;
  onShowResult: () => void;
  onEditWorkspace: () => void;
  onRequestStatus: (listId: number) => void;
  onBack: () => void;
  onSaveAllocations: (listId: number, allocations: { recipientId: number; amount: number }[]) => Promise<boolean>;
  onOpenList: (id: number) => void;
  onNewList: () => void;
  onAddRecipient: (name: string) => Promise<boolean>;
  onRenameRecipient: (id: number, name: string) => Promise<boolean>;
  onDeleteRecipient: (id: number) => Promise<boolean>;
}) {
  const c = ws.currency;
  const [panel, setPanel] = useState<"recipients" | "distribution" | "accounts" | null>(null);
  const [newRecipient, setNewRecipient] = useState("");
  const [recipientId, setRecipientId] = useState<number | "">("");
  const [amount, setAmount] = useState("");
  const [dDate, setDDate] = useState(today());
  const [note, setNote] = useState("");
  const name = (id: number) => ws.recipients.find((r) => r.id === id)?.name ?? "—";

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
          {ws.canWrite && <button className="primary" onClick={onNewList}>＋ {tx(language, "Yeni Liste", "New List", "Lîsteya Nû")}</button>}
        </div>
      </div>

      <div className="listMetrics">
        <div className="metricBlue" title={tx(language, "Bu kasadaki kasa ve gelir kayıtlarının toplamı (Kasalar/Gelir sayfalarından girilir)", "Total of this account's cash and income records (entered on the Cash/Income pages)", "Hejmara tomarên qase û dahatê yên vê qasayê")}><small>{tx(language, "Kasa geliri", "Cash income", "Dahata qasayê")}</small><b>{money(ws.totals.income, c)}</b></div>
        <div><small>{tx(language, "Alıcılara dağıtılan", "Allocated to recipients", "Ji wergiran re hatiye dabeşkirin")}</small><b>{money(ws.totals.distributed, c)}</b></div>
        <div><small>{tx(language, "Toplam gider", "Total expense", "Mesrefa giştî")}</small><b>{money(ws.totals.expense, c)}</b></div>
        <div className={ws.totals.kasaRemaining < 0 ? "metricAmber" : undefined}><small>{tx(language, "Kasada kalan", "Cash left", "Di qasayê de")}</small><b className={ws.totals.kasaRemaining < 0 ? "negative" : "positive"}>{money(ws.totals.kasaRemaining, c)}</b></div>
        <div><small>{tx(language, "Açık listeler", "Open lists", "Lîsteyên vekirî")}</small><b>{ws.lists.filter((l) => l.status === "open").length}</b></div>
        <div><small>{tx(language, "Sonuçlanan listeler", "Finalized lists", "Lîsteyên qediyayî")}</small><b>{ws.lists.filter((l) => l.status === "closed").length}</b></div>
      </div>

      {ws.lists.length === 0 ? (
        <p className="listsHint">{tx(language, "Bu çalışma alanında henüz liste yok.", "No lists in this workspace yet.", "Di vê qada xebatê de hê lîste tune.")}</p>
      ) : (
        <ListsGrid language={language} ws={ws} onOpenList={onOpenList} onSaveAllocations={onSaveAllocations} onAddRecipient={onAddRecipient} onRequestStatus={onRequestStatus} />
      )}

      <section className="listTools">
        <div className="listToolsBar" role="tablist">
          {(
            [
              ["distribution", tx(language, "Dağıtılan miktarı görüntüle", "View distributed amount", "Mîqdara hatiye dabeşkirin nîşan bide"), money(ws.totals.distributed, c)],
              ["recipients", tx(language, "Alıcıları yönet", "Manage recipients", "Wergiran birêve bibe"), String(ws.recipients.length)],
              ["accounts", tx(language, "Alıcı hesapları", "Recipient accounts", "Hesabên wergiran"), ""],
            ] as ["recipients" | "distribution" | "accounts", string, string][]
          ).map(([id, label, badge]) => (
            <button key={id} type="button" role="tab" aria-selected={panel === id} className={`listToolsTab${panel === id ? " active" : ""}`} onClick={() => setPanel((cur) => (cur === id ? null : id))}>
              {label}
              {badge && <em>{badge}</em>}
            </button>
          ))}
        </div>
      {panel === "recipients" && (<div className="listToolsBody">
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
                    const next = prompt(tx(language, "Alıcı adı", "Recipient name", "Navê wergir"), r.name);
                    if (next && next.trim() && next.trim() !== r.name) onRenameRecipient(r.id, next.trim());
                  }}
                >✎</button>
                <button
                  type="button"
                  title={tx(language, "Sil", "Delete", "Jê bibe")}
                  onClick={() => confirm(tx(language, `${r.name} silinsin mi? Dağıtımları silinir, ürünlerdeki alıcısı boşalır.`, `Delete ${r.name}? Their distributions are deleted and products lose this recipient.`, `${r.name} were jêbirin? Dabeşkirinên wî/wê têne jêbirin.`)) && onDeleteRecipient(r.id)}
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
            <input value={newRecipient} maxLength={200} placeholder={tx(language, "Yeni alıcı adı", "New recipient name", "Navê wergirê nû")} onChange={(e) => setNewRecipient(e.target.value)} />
            <button className="light compact" disabled={!newRecipient.trim() || busy}>＋ {tx(language, "Alıcı ekle", "Add recipient", "Wergir zêde bike")}</button>
          </form>
        )}
      </div>

      </div>)}

      {panel === "distribution" && (<div className="listToolsBody">
        <p className="listsHint">{tx(language, "Alıcılara dağıtılan miktarlar — her alıcının liste giderlerindeki harcaması", "Amounts allocated to recipients — each recipient's spending in list expenses", "Mîqdarên ji wergiran re hatine dabeşkirin — lêçûna her wergirekî di mesrefên lîsteyê de")}</p>
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
      </div>)}

      {panel === "accounts" && (<div className="listToolsBody">
      {ws.balances.length === 0 ? (
        <p className="listsHint">{tx(language, "Henüz alıcı yok.", "No recipients yet.", "Hê wergir tune.")}</p>
      ) : (
        <div className="listMatrixScroll">
          <table className="listTable">
            <thead>
              <tr>
                <th>{tx(language, "Alıcı", "Recipient", "Wergir")}</th>
                {ws.lists.map((l) => (<th key={l.id} className="r">{l.code}</th>))}
                <th className="r">{tx(language, "Toplam harcama", "Total spent", "Lêçûna giştî")}</th>
              </tr>
            </thead>
            <tbody>
              {ws.balances.map((b) => (
                <tr key={b.recipientId}>
                  <td>{b.name}</td>
                  {ws.lists.map((l) => (<td key={l.id} className="r">{b.perList[l.id] ? money(b.perList[l.id], c) : "—"}</td>))}
                  <td className="r">{money(b.spent, c)}</td>
                </tr>
              ))}
              <tr className="listTotalRow">
                <td>{tx(language, "Toplam", "Total", "Giştî")}</td>
                {ws.lists.map((l) => (<td key={l.id} className="r">{money(l.total - l.unassigned, c)}</td>))}
                <td className="r">{money(r2(ws.balances.reduce((a, b) => a + b.spent, 0)), c)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      </div>)}
      </section>
    </div>
  );
}

const RECIPIENT_TINTS = ["#f1f6fc", "#f2f9f1", "#fef5ee", "#f7f2fb", "#fdf1f4", "#f1f9f9"];
const RECIPIENT_TEXT = ["#0c447c", "#085041", "#712b13", "#3c3489", "#72243e", "#0f5a5a"];
const RECIPIENT_COLORS = ["#cfe1f4", "#d5ecd4", "#fbdcc4", "#e6d9f3", "#f8d3de", "#d3ecec"];

// Çalışma alanındaki listeler: tablo gibi bir ızgara — her liste bir satır, liste gideri
// ve her alıcı için ayrı bir sütun (hücreye o alıcıya dağıtılan tutar yazılır).
function ListsGrid({
  language,
  ws,
  onOpenList,
  onSaveAllocations,
  onAddRecipient,
  onRequestStatus,
}: {
  language: Language;
  ws: Workspace;
  onOpenList: (id: number) => void;
  onSaveAllocations: (listId: number, allocations: { recipientId: number; amount: number }[]) => Promise<boolean>;
  onAddRecipient: (name: string) => Promise<boolean>;
  onRequestStatus: (listId: number) => void;
}) {
  const c = ws.currency;
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [edits, setEdits] = useState<Record<string, string>>({});
  // Alıcı sütunları soldan sağa açılıp kapanır; tercih tarayıcıda hatırlanır.
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem("listsRecipientsOpen") === "1";
    } catch {
      return false;
    }
  });
  const toggle = () =>
    setOpen((prev) => {
      try {
        localStorage.setItem("listsRecipientsOpen", prev ? "0" : "1");
      } catch {}
      return !prev;
    });
  const key = (listId: number, recipientId: number) => `${listId}:${recipientId}`;

  async function commit(list: ListSummary, recipientId: number) {
    const k = key(list.id, recipientId);
    const raw = edits[k];
    if (raw === undefined) return;
    const value = r2(parseNumber(raw));
    const current = list.byRecipient[recipientId] ?? 0;
    setEdits((prev) => {
      const next = { ...prev };
      delete next[k];
      return next;
    });
    if (value === current) return;
    const allocations = ws.recipients
      .map((r) => ({ recipientId: r.id, amount: r.id === recipientId ? value : list.byRecipient[r.id] ?? 0 }))
      .filter((a) => a.amount > 0);
    await onSaveAllocations(list.id, allocations);
  }

  const sumRecipient = (id: number) => r2(ws.lists.reduce((a, l) => a + (l.byRecipient[id] ?? 0), 0));
  const allocatedTotal = (l: ListSummary) => r2(Object.values(l.byRecipient).reduce((a, v) => a + v, 0));
  const grandAllocated = r2(ws.lists.reduce((a, l) => a + allocatedTotal(l), 0));
  const money0 = (v: number) => (Math.abs(v) < 0.005 ? "—" : money(v, c));
  const recipientCount = open ? ws.recipients.length : 0;
  const minWidth = 104 + 170 + 96 + 84 + 130 + 126 + recipientCount * 116 + 116 + 150;

  return (
    <div className="listMatrixScroll">
      <table className="listTable listsGrid" style={{ minWidth }}>
        <colgroup>
          <col style={{ width: 104 }} />
          <col style={{ width: 170 }} />
          <col style={{ width: 96 }} />
          <col style={{ width: 84 }} />
          <col style={{ width: 130 }} />
          <col style={{ width: 126 }} />
          {open && ws.recipients.map((r) => <col key={r.id} style={{ width: 116 }} />)}
          <col style={{ width: open ? 116 : 150 }} />
          <col style={{ width: 150 }} />
        </colgroup>
        <thead>
          <tr>
            <th className="lgH1">{tx(language, "Tarih", "Date", "Dîrok")}</th>
            <th className="lgH1">{tx(language, "Liste", "List", "Lîste")}</th>
            <th className="lgH1">{tx(language, "Kod", "Code", "Kod")}</th>
            <th className="lgH1">{tx(language, "Durum", "Status", "Rewş")}</th>
            <th className="lgH1 lgCenter">{tx(language, "Not", "Note", "Nîşe")}</th>
            <th className="lgH1">{tx(language, "Liste gideri", "List expense", "Mesrefa lîsteyê")}</th>
            {open &&
              ws.recipients.map((r, i) => (
                <th key={r.id} className="lgH2 r">
                  {i === 0 && (
                    <button type="button" className="listsGridToggle" onClick={toggle} title={tx(language, "Alıcı sütunlarını kapat", "Collapse recipient columns", "Stûnên wergiran bigire")}>
                      ◂
                    </button>
                  )}
                  <span className="lgName" style={{ background: RECIPIENT_COLORS[i % RECIPIENT_COLORS.length] }}>{r.name}</span>
                </th>
              ))}
            <th className="lgH2 r">
              {!open && (
                <button type="button" className="listsGridToggle" onClick={toggle} title={tx(language, "Alıcı sütunlarını aç", "Expand recipient columns", "Stûnên wergiran veke")}>
                  ▸ {tx(language, "Alıcılar", "Recipients", "Wergir")} ({ws.recipients.length})
                </button>
              )}
              {tx(language, "Dağıtılan", "Allocated", "Hatiye dabeşkirin")}
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
                      placeholder={tx(language, "Alıcı adı", "Recipient name", "Navê wergir")}
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
                    <button type="button" className="lgAddRecipient" onClick={() => setAdding(true)} title={tx(language, "Çalışma alanına yeni alıcı ekle", "Add a recipient to this workspace", "Wergirekî nû li vê qada xebatê zêde bike")}>
                      ＋ {tx(language, "Alıcı ekle", "Add recipient", "Wergir zêde bike")}
                    </button>
                  ))}
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          {ws.lists.map((l) => {
            const editable = ws.canWrite && l.status === "open";
            const left = r2(l.total - allocatedTotal(l));
            return (
              <tr key={l.id}>
                <td className="lgMuted">{formatDate(l.date, language)}</td>
                <td><button type="button" className="listNameLink" onClick={() => onOpenList(l.id)}>{l.name}</button></td>
                <td><button type="button" className="listCodeLink" onClick={() => onOpenList(l.id)}>{l.code}</button></td>
                <td>
                  {ws.canWrite ? (
                    <button
                      type="button"
                      className={`listStatus listStatusBtn ${l.status}`}
                      onClick={() => onRequestStatus(l.id)}
                      title={l.status === "open" ? tx(language, "Liste bitti — sonuçlandır", "List finished — finalize", "Lîste qediya — biqedîne") : tx(language, "Sonuçlandı — yeniden açmak için tıklayın", "Finalized — click to reopen", "Qediya — ji bo vekirinê bitikîne")}
                    >
                      {l.status === "open" ? tx(language, "Açık", "Open", "Vekirî") : `✔ ${tx(language, "Sonuçlandı", "Finalized", "Qediya")}`}
                    </button>
                  ) : (
                    <span className={`listStatus ${l.status}`}>{l.status === "open" ? tx(language, "Açık", "Open", "Vekirî") : `✔ ${tx(language, "Sonuçlandı", "Finalized", "Qediya")}`}</span>
                  )}
                </td>
                <td className="listGridNote lgMuted lgCenter" title={l.note}>{l.note || "—"}</td>
                <td className="listsGridAmount lgT1">{money(l.total, c)}</td>
                {open &&
                  ws.recipients.map((r, i) => {
                    const k = key(l.id, r.id);
                    const value = l.byRecipient[r.id] ?? 0;
                    return (
                      <td
                        key={r.id}
                        className="listsGridCell r"
                        style={{ background: `${RECIPIENT_COLORS[i % RECIPIENT_COLORS.length]}55`, color: RECIPIENT_TEXT[i % RECIPIENT_TEXT.length], fontWeight: 600 }}
                      >
                        {editable ? (
                          <input
                            className="r"
                            inputMode="decimal"
                            placeholder="—"
                            value={edits[k] ?? (value ? money(value, c) : "")}
                            onFocus={() => setEdits((prev) => (prev[k] === undefined ? { ...prev, [k]: value ? String(value) : "" } : prev))}
                            onChange={(e) => setEdits((prev) => ({ ...prev, [k]: e.target.value }))}
                            onBlur={() => commit(l, r.id)}
                            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                          />
                        ) : (
                          money0(value)
                        )}
                      </td>
                    );
                  })}
                <td className="lgT2 lgStrong r">{money0(allocatedTotal(l))}</td>
                <td className={`lgT3 r ${left < -0.005 ? "negative" : left > 0.005 ? "lgRemain" : "lgMuted"}`}>{money0(left)}</td>
              </tr>
            );
          })}
          <tr className="listTotalRow">
            <td colSpan={5} className="lgTot1">{tx(language, "Toplam", "Total", "Giştî")}</td>
            <td className="lgTot1">{money(ws.totals.expense, c)}</td>
            {open && ws.recipients.map((r, i) => (<td key={r.id} className="lgTot2 r">{money0(sumRecipient(r.id))}</td>))}
            <td className="lgTot2 r">{money0(grandAllocated)}</td>
            <td className="lgTot3 r">{money0(r2(ws.totals.expense - grandAllocated))}</td>
          </tr>
        </tbody>
      </table>
      <p className="listsHint">
        {open
          ? tx(language, "Tutarı doğrudan alıcı hücresine yazın; Enter ile kaydedilir.", "Type amounts straight into a recipient cell; Enter saves.", "Mîqdarê rasterast di şaneya wergir de binivîse; Enter tomar dike.")
          : tx(language, "Alıcılara göre dağılımı görmek ve düzenlemek için “Alıcılar” düğmesiyle sütunları sağa doğru açın.", "Use the “Recipients” button to expand the per-recipient columns to the right.", "Ji bo dîtina dabeşkirina li gorî wergiran bi bişkoka “Wergir” stûnan ber bi rastê veke.")}
      </p>
    </div>
  );
}

type Draft = { key: number; name: string; quantity: string; unitPrice: string; recipientId: number | null; note: string };
let draftKey = 1;
const toDraft = (i: Item): Draft => ({ key: draftKey++, name: i.name, quantity: String(i.quantity), unitPrice: String(i.unitPrice), recipientId: i.recipientId, note: i.note });
const blankDraft = (): Draft => ({ key: draftKey++, name: "", quantity: "1", unitPrice: "", recipientId: null, note: "" });

function ListView({
  language,
  ws,
  list,
  busy,
  onBack,
  onEdit,
  onToggleStatus,
  onDelete,
  onSaveItems,
  onApplyItems,
  onDirty,
}: {
  language: Language;
  ws: Workspace;
  list: ListSummary;
  busy: boolean;
  onBack: () => void;
  onEdit: () => void;
  onToggleStatus: () => void;
  onDelete: () => void;
  onSaveItems: (items: unknown[]) => Promise<boolean>;
  onApplyItems: (amount: number, allocations: { recipientId: number; amount: number }[]) => Promise<boolean>;
  onDirty: (dirty: boolean) => void;
}) {
  const c = ws.currency;
  const closed = list.status === "closed";
  const editable = ws.canWrite && !closed;
  const [drafts, setDrafts] = useState<Draft[]>(() => list.items.map(toDraft));
  const [dirty, setDirty] = useState(false);
  const [pasteNote, setPasteNote] = useState("");
  // Sunucudan yeni veri geldiğinde (kaydet / durum değişimi) ve düzenleme yoksa taslağı tazele.
  useEffect(() => {
    if (!dirty) setDrafts(list.items.map(toDraft));
  }, [list.items, dirty]);
  useEffect(() => {
    onDirty(dirty);
    return () => onDirty(false);
  }, [dirty, onDirty]);

  const update = (key: number, patch: Partial<Draft>) => {
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)));
    setDirty(true);
  };
  const lineAmount = (d: Draft) => r2(parseNumber(d.quantity) * parseNumber(d.unitPrice));
  const draftTotal = r2(drafts.reduce((a, d) => a + lineAmount(d), 0));
  const rName = (id: number) => ws.recipients.find((r) => r.id === id)?.name ?? "—";
  // Liste giderinin alıcılara dağılımı (kayıtlı dağılımdan).
  const splitRows = [
    ...ws.recipients
      .filter((r) => list.byRecipient[r.id])
      .map((r) => ({ name: r.name, amount: list.byRecipient[r.id], none: false })),
    ...(list.unassigned > 0.005 ? [{ name: tx(language, "Dağıtılmamış", "Unallocated", "Nehatiye dabeşkirin"), amount: list.unassigned, none: true }] : []),
  ].map((row) => ({ ...row, pct: list.total ? Math.round((row.amount / list.total) * 1000) / 10 : 0 }));

  // Excel/Sheets'ten yapıştırma: Ürün | Adet | Birim fiyat | Alıcı | Not (başlık satırı otomatik atlanır).
  function pasteRows(text: string) {
    const rows = text
      .split(/\r\n|\n|\r/)
      .map((line) => line.split("\t"))
      .filter((cells) => cells.some((cell) => cell.trim()));
    if (!rows.length) return;
    const headerLike = rows[0].length > 1 && rows[0][1].trim() !== "" && parseNumber(rows[0][1]) === 0 && !/^\s*0+([.,]0+)?\s*$/.test(rows[0][1]);
    const body = headerLike ? rows.slice(1) : rows;
    const added: Draft[] = body.map((cells) => {
      const matched = cells[3] ? ws.recipients.find((r) => r.name.toLowerCase() === cells[3].trim().toLowerCase()) : undefined;
      return {
        key: draftKey++,
        name: (cells[0] ?? "").trim().slice(0, 300),
        quantity: cells[1]?.trim() ? String(parseNumber(cells[1])) : "1",
        unitPrice: cells[2]?.trim() ? String(parseNumber(cells[2])) : "",
        recipientId: matched?.id ?? null,
        note: (cells[4] ?? "").trim().slice(0, 500),
      };
    });
    setDrafts((prev) => [...prev.filter((d) => d.name || d.unitPrice), ...added].slice(0, 1000));
    setDirty(true);
    const unmatched = body.filter((cells) => cells[3]?.trim() && !ws.recipients.some((r) => r.name.toLowerCase() === cells[3].trim().toLowerCase())).length;
    setPasteNote(
      `${added.length} ${tx(language, "satır eklendi", "rows added", "rêz hatin zêdekirin")}` +
        (unmatched ? ` · ${unmatched} ${tx(language, "satırda alıcı adı eşleşmedi", "rows had an unknown recipient", "rêzan wergirê nenas hebû")}` : ""),
    );
  }
  async function pasteFromClipboard() {
    try {
      pasteRows(await navigator.clipboard.readText());
    } catch {
      setPasteNote(tx(language, "Tarayıcı panoyu okutmadı: tablonun üzerine tıklayıp Ctrl+V ile yapıştırın.", "The browser blocked clipboard access: click the table and press Ctrl+V.", "Gerok destûr neda: li tabloyê bitikîne û Ctrl+V bikar bîne."));
    }
  }
  async function save() {
    const items = drafts
      .filter((d) => d.name.trim() || parseNumber(d.unitPrice) > 0)
      .map((d) => ({ name: d.name.trim(), quantity: parseNumber(d.quantity), unitPrice: parseNumber(d.unitPrice), recipientId: d.recipientId, note: d.note.trim() }));
    if (await onSaveItems(items)) {
      setDirty(false);
      setPasteNote("");
    }
  }

  return (
    <div className="listDetail">
      <div className="listDetailHead">
        <button
          className="light compact"
          onClick={() => {
            if (dirty && !confirm(tx(language, "Kaydedilmemiş değişiklikler var. Çıkılsın mı?", "You have unsaved changes. Leave?", "Guherînên neqeydkirî hene. Derkevî?"))) return;
            onBack();
          }}
        >
          ← {ws.name}
        </button>
        <div className="listDetailTitle">
          <span className="listCardCode">{list.code}</span>
          <h3>{list.name}</h3>
          <small>
            {formatDate(list.date, language)} · {tx(language, "Çalışma alanı", "Workspace", "Qada xebatê")}: {ws.name} ·{" "}
            <span className={`listStatus ${closed ? "closed" : "open"}`}>{closed ? `✔ ${tx(language, "Sonuçlandı", "Finalized", "Qediya")}` : tx(language, "Açık", "Open", "Vekirî")}</span>
          </small>
        </div>
        {ws.canWrite && (
          <div className="listDetailActions">
            <button className="light compact" onClick={onEdit}>{tx(language, "Düzenle", "Edit", "Biguherîne")}</button>
            <button className={closed ? "light compact" : "primary compact"} onClick={onToggleStatus} disabled={dirty}>
              {closed ? tx(language, "Yeniden aç", "Reopen", "Dîsa veke") : `✔ ${tx(language, "Liste bitti — Sonuçlandır", "List finished — Finalize", "Lîste qediya — Biqedîne")}`}
            </button>
            <button className="light compact danger" onClick={onDelete}>{tx(language, "Sil", "Delete", "Jê bibe")}</button>
          </div>
        )}
      </div>

      <div className="listMetrics">
        <div className="metricBlue"><small>{tx(language, "Kasa geliri (çalışma alanı)", "Cash income (workspace)", "Dahata qasayê (qada xebatê)")}</small><b>{money(ws.totals.income, c)}</b></div>
        <div><small>{tx(language, "Liste gideri", "List expense", "Mesrefa lîsteyê")}</small><b>{money(list.total, c)}</b></div>
        <div className={list.unassigned > 0.005 ? "metricAmber" : undefined}><small>{tx(language, "Dağıtılmamış", "Unallocated", "Nehatiye dabeşkirin")}</small><b className={list.unassigned < -0.005 ? "negative" : undefined}>{money(list.unassigned, c)}</b></div>
      </div>
      <div className="listSplit">
        <small>{tx(language, "Liste giderinin alıcılara dağılımı", "Split of the list expense by recipient", "Dabeşkirina mesrefa lîsteyê li gorî wergiran")}</small>
        {splitRows.length === 0 ? (
          <span className="listMuted">{tx(language, "Henüz dağıtım yok. Düzenle ile veya çalışma alanı tablosundan alıcılara dağıtın.", "No allocation yet. Allocate with Edit or from the workspace table.", "Hê dabeşkirin tune. Bi Biguherîne an ji tabloya qada xebatê dabeş bike.")}</span>
        ) : (
          <div className="listSplitRows">
            {splitRows.map((row) => (
              <span key={row.name} className={`listSplitChip${row.none ? " none" : ""}`}>
                <b>{row.name}</b> {money(row.amount, c)} <em>{row.pct}%</em>
              </span>
            ))}
          </div>
        )}
      </div>

      <h4>
        {tx(language, "Ürün detayı (isteğe bağlı)", "Product detail (optional)", "Hûrguliyên berheman (bijarte)")}{" "}
        <span className="listMuted">· {tx(language, "ürün toplamı", "products total", "giştiya berheman")} {money(dirty ? draftTotal : list.itemsTotal, c)}</span>
        {editable && (
          <button
            type="button"
            className="light compact listH4Button"
            disabled={dirty || list.itemCount === 0 || busy}
            title={tx(language, "Liste giderini ve alıcı dağılımını ürünlerden hesaplar", "Sets the list expense and recipient split from the products", "Mesref û dabeşkirinê ji berheman hesab dike")}
            onClick={async () => {
              const by = new Map<number, number>();
              for (const i of list.items) if (i.recipientId) by.set(i.recipientId, r2((by.get(i.recipientId) ?? 0) + i.amount));
              if (!confirm(tx(language, `Liste gideri ${money(list.itemsTotal, c)} olarak ayarlanacak ve alıcı dağılımı ürünlerden yazılacak. Devam edilsin mi?`, `The list expense will be set to ${money(list.itemsTotal, c)} and the split rewritten from products. Continue?`, `Mesref dê bibe ${money(list.itemsTotal, c)}. Berdewam?`))) return;
              await onApplyItems(list.itemsTotal, [...by.entries()].map(([recipientId, amount]) => ({ recipientId, amount })));
            }}
          >
            {tx(language, "Ürünlerden hesapla", "Calculate from products", "Ji berheman hesab bike")}
          </button>
        )}
      </h4>
      {ws.recipients.length === 0 && ws.canWrite && (
        <p className="listsHint">{tx(language, "Ürünleri alıcılara yazabilmek için önce çalışma alanı sayfasından alıcı ekleyin.", "Add recipients on the workspace page first so you can assign products.", "Ji bo girêdana berheman bi wergiran re pêşî wergiran li rûpela qada xebatê zêde bike.")}</p>
      )}
      {editable && (
        <div className="listItemsBar">
          <button className="light compact" onClick={pasteFromClipboard}>⎘ {tx(language, "Excel'den yapıştır", "Paste from Excel", "Ji Excelê bi cih bike")}</button>
          <button className="light compact" onClick={() => { setDrafts((p) => [...p, blankDraft()]); setDirty(true); }} disabled={drafts.length >= 1000}>
            ＋ {tx(language, "Satır ekle", "Add row", "Rêz zêde bike")}
          </button>
          <small className="listMuted">{tx(language, "Yapıştırma sırası: Ürün · Adet · Birim fiyat · Alıcı · Not", "Paste order: Product · Qty · Unit price · Recipient · Note", "Rêza bicihkirinê: Berhem · Hejmar · Bihayê yekê · Wergir · Nîşe")}</small>
        </div>
      )}
      {pasteNote && <p className="listsHint">{pasteNote}</p>}
      <div
        className="listItemsWrap"
        tabIndex={0}
        onPaste={(e) => {
          if (!editable) return;
          const target = e.target as HTMLElement;
          const text = e.clipboardData.getData("text/plain");
          // Hücre içine tek değer yapıştırılıyorsa normal davranış; çok satırlı/çok sütunlu blok tabloya eklenir.
          if (target.tagName === "INPUT" && !/[\t\n]/.test(text)) return;
          e.preventDefault();
          pasteRows(text);
        }}
      >
        <table className="listTable listItemsTable">
          <thead>
            <tr>
              <th style={{ width: 34 }}>#</th>
              <th>{tx(language, "Ürün", "Product", "Berhem")}</th>
              <th style={{ width: 80 }} className="r">{tx(language, "Adet", "Qty", "Hejmar")}</th>
              <th style={{ width: 110 }} className="r">{tx(language, "Birim fiyat", "Unit price", "Bihayê yekê")}</th>
              <th style={{ width: 120 }} className="r">{tx(language, "Tutar", "Amount", "Mîqdar")}</th>
              <th style={{ width: 150 }}>{tx(language, "Alıcı", "Recipient", "Wergir")}</th>
              <th>{tx(language, "Not", "Note", "Nîşe")}</th>
              {editable && <th style={{ width: 34 }} />}
            </tr>
          </thead>
          <tbody>
            {drafts.length === 0 && (
              <tr><td colSpan={8} className="listMuted">{tx(language, "Henüz ürün yok. Excel'den yapıştırın veya satır ekleyin.", "No products yet. Paste from Excel or add a row.", "Hê berhem tune. Ji Excelê bi cih bike an rêzekê zêde bike.")}</td></tr>
            )}
            {drafts.map((d, index) => (
              <tr key={d.key}>
                <td className="listMuted">{index + 1}</td>
                <td>{editable ? <input value={d.name} maxLength={300} onChange={(e) => update(d.key, { name: e.target.value })} /> : d.name}</td>
                <td className="r">{editable ? <input className="r" inputMode="decimal" value={d.quantity} onChange={(e) => update(d.key, { quantity: e.target.value })} /> : d.quantity}</td>
                <td className="r">{editable ? <input className="r" inputMode="decimal" value={d.unitPrice} onChange={(e) => update(d.key, { unitPrice: e.target.value })} /> : money(parseNumber(d.unitPrice), c)}</td>
                <td className="r">{money(lineAmount(d), c)}</td>
                <td>
                  {editable ? (
                    <select value={d.recipientId ?? ""} onChange={(e) => update(d.key, { recipientId: e.target.value ? Number(e.target.value) : null })}>
                      <option value="">—</option>
                      {ws.recipients.map((r) => (<option key={r.id} value={r.id}>{r.name}</option>))}
                    </select>
                  ) : d.recipientId ? rName(d.recipientId) : "—"}
                </td>
                <td>{editable ? <input value={d.note} maxLength={500} onChange={(e) => update(d.key, { note: e.target.value })} /> : d.note}</td>
                {editable && (
                  <td>
                    <button type="button" className="light compact" title={tx(language, "Satırı sil", "Delete row", "Rêzê jê bibe")} onClick={() => { setDrafts((p) => p.filter((x) => x.key !== d.key)); setDirty(true); }}>×</button>
                  </td>
                )}
              </tr>
            ))}
            <tr className="listTotalRow">
              <td colSpan={4}>{tx(language, "Ürün toplamı", "Products total", "Giştiya berheman")}</td>
              <td className="r">{money(draftTotal, c)}</td>
              <td colSpan={editable ? 3 : 2} />
            </tr>
          </tbody>
        </table>
      </div>
      {editable && (
        <div className="listItemsBar">
          <button className="primary" onClick={save} disabled={!dirty || busy}>{tx(language, "Ürünleri Kaydet", "Save Products", "Berheman Tomar Bike")}</button>
          {dirty && (
            <button className="light" onClick={() => { setDrafts(list.items.map(toDraft)); setDirty(false); setPasteNote(""); }}>
              {tx(language, "Değişiklikleri at", "Discard changes", "Guherînan paşguh bike")}
            </button>
          )}
          {dirty && <small className="negative">{tx(language, "Kaydedilmemiş değişiklikler var", "Unsaved changes", "Guherînên neqeydkirî")}</small>}
        </div>
      )}
      {closed && <p className="listsHint">{tx(language, "Liste sonuçlandı: tutar, dağıtım ve ürünler değiştirilemez. Değiştirmek için “Yeniden aç”ı kullanın.", "This list is finalized: amount, allocation and products can't be changed. Use “Reopen” to edit.", "Lîste qediyaye: mîqdar, dabeşkirin û berhem nayên guhertin. Ji bo guhertinê “Dîsa veke” bikar bîne.")}</p>}
    </div>
  );
}

function ListFormModal({
  language,
  kasas,
  fixedKasaId,
  workspace,
  list,
  onClose,
  onSaved,
}: {
  language: Language;
  kasas: Kasa[];
  fixedKasaId: number | null;
  workspace: Workspace | null;
  list: ListSummary | null;
  onClose: () => void;
  onSaved: (ws: Workspace, listId: number) => void;
}) {
  const [kasaId, setKasaId] = useState<number | "">(fixedKasaId ?? "");
  const [code, setCode] = useState(list?.code ?? "");
  const [name, setName] = useState(list?.name ?? "");
  const [dateValue, setDateValue] = useState(list?.date ?? today());
  const [amount, setAmount] = useState(list && list.total ? String(list.total) : "");
  const [note, setNote] = useState(list?.note ?? "");
  const recipients = workspace?.recipients ?? [];
  const [alloc, setAlloc] = useState<Record<number, string>>(() =>
    Object.fromEntries(recipients.map((r) => [r.id, list?.byRecipient[r.id] ? String(list.byRecipient[r.id]) : ""])),
  );
  const [saving, setSaving] = useState(false);
  const kasaName = kasas.find((k) => k.id === kasaId)?.name ?? workspace?.name ?? "";
  const currency = workspace?.currency ?? "USD";
  const total = r2(parseNumber(amount));
  const allocated = r2(recipients.reduce((a, r) => a + parseNumber(alloc[r.id] ?? ""), 0));
  const over = allocated > total + 0.005;
  const closed = list?.status === "closed";

  async function save() {
    if (kasaId === "") return;
    setSaving(true);
    const allocations = recipients.map((r) => ({ recipientId: r.id, amount: r2(parseNumber(alloc[r.id] ?? "")) })).filter((a) => a.amount > 0);
    const money = closed ? {} : { amount: total, ...(recipients.length ? { allocations } : {}) };
    const result = list
      ? await api<{ workspace: Workspace; listId?: number }>(`/api/lists/${list.id}`, "PUT", { code, name, date: dateValue, note: note.trim(), ...money })
      : await api<{ workspace: Workspace; listId?: number }>("/api/lists", "POST", {
          cashAccountId: kasaId,
          code,
          name,
          date: dateValue,
          note: note.trim(),
          amount: total,
          ...(recipients.length ? { allocations } : {}),
        });
    setSaving(false);
    if (!result.ok) return alert(result.error);
    onSaved(result.data.workspace, list ? list.id : result.data.listId ?? 0);
  }

  return (
    <div className="overlay">
      <form
        className="modal listFormModal"
        onSubmit={(e) => {
          e.preventDefault();
          if (code.trim() && name.trim() && kasaId !== "" && !over) save();
        }}
      >
        <div className="modalHead">
          <div>
            <h2>{list ? tx(language, "Listeyi Düzenle", "Edit List", "Lîsteyê Biguherîne") : tx(language, "Yeni Liste", "New List", "Lîsteya Nû")}</h2>
            <p>{tx(language, "Çalışma alanı (kasa), tarih, liste adı, kodu, gider tutarı ve notu girin.", "Enter the workspace (cash account), date, list name, code, expense amount and note.", "Qada xebatê (qase), dîrok, navê lîsteyê, kod, mîqdara mesrefê û nîşeyê têkevin.")}</p>
          </div>
          <button type="button" onClick={onClose}>×</button>
        </div>
        <div className="formGrid">
          <label>
            {tx(language, "Tarih", "Date", "Dîrok")}
            <input type="date" required value={dateValue} onChange={(e) => setDateValue(e.target.value)} />
          </label>
          <label>
            {tx(language, "Çalışma Alanı (Kasa)", "Workspace (Cash account)", "Qada Xebatê (Qase)")}
            {fixedKasaId !== null ? (
              <input value={kasaName} disabled />
            ) : (
              <select required value={kasaId} onChange={(e) => setKasaId(e.target.value ? Number(e.target.value) : "")}>
                <option value="">{tx(language, "Kasa seçin", "Select a cash account", "Qaseyekê hilbijêre")}</option>
                {kasas.map((k) => (<option key={k.id} value={k.id}>{k.name}</option>))}
              </select>
            )}
          </label>
          <label>
            {tx(language, "Liste Adı", "List Name", "Navê Lîsteyê")}
            <input required value={name} maxLength={200} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            {tx(language, "Kodu", "Code", "Kod")}
            <input required value={code} maxLength={40} placeholder="260201" onChange={(e) => setCode(e.target.value)} />
          </label>
          <label>
            {tx(language, `Tutar (Liste Gideri, ${currency})`, `Amount (List expense, ${currency})`, `Mîqdar (Mesrefa lîsteyê, ${currency})`)}
            <input inputMode="decimal" value={amount} disabled={closed} placeholder="0" onChange={(e) => setAmount(e.target.value)} />
          </label>
          <label className="wide">
            {tx(language, "Not", "Note", "Nîşe")}
            <textarea rows={2} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          {recipients.length > 0 && (
            <div className="wide listMembersEditor">
              <small>{tx(language, "Alıcılara dağıt", "Allocate to recipients", "Ji wergiran re dabeş bike")}</small>
              <div className="listAllocGrid">
                {recipients.map((r, i) => (
                  <label key={r.id}>
                    <span className="listAllocName" style={{ background: RECIPIENT_COLORS[i % RECIPIENT_COLORS.length] }}>{r.name}</span>
                    <input inputMode="decimal" value={alloc[r.id] ?? ""} disabled={closed} placeholder="0" onChange={(e) => setAlloc((prev) => ({ ...prev, [r.id]: e.target.value }))} />
                  </label>
                ))}
              </div>
              <small className={over ? "negative" : "listMuted"}>
                {tx(language, "Dağıtılan", "Allocated", "Hatiye dabeşkirin")} {money(allocated, currency)} / {money(total, currency)}
                {!over && total - allocated > 0.005 && ` · ${tx(language, "dağıtılmamış", "unallocated", "nehatiye dabeşkirin")} ${money(r2(total - allocated), currency)}`}
                {over && ` · ${tx(language, "liste giderini aşıyor", "exceeds the list expense", "ji mesrefa lîsteyê zêdetir e")}`}
              </small>
            </div>
          )}
        </div>
        <div className="modalActions">
          <button type="button" className="light" onClick={onClose}>{tx(language, "Vazgeç", "Cancel", "Betal")}</button>
          <button className="primary" disabled={saving || over || !code.trim() || !name.trim() || kasaId === ""}>
            {list ? tx(language, "Değişiklikleri Kaydet", "Save Changes", "Guherînan Tomar Bike") : tx(language, "Listeyi Kaydet", "Save List", "Lîsteyê Tomar Bike")}
          </button>
        </div>
      </form>
    </div>
  );
}

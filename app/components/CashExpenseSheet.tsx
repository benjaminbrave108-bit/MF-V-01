"use client";

import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import ExcelJS from "exceljs";
import { Title, DeleteConfirmModal } from "./shared";
import { tx, localizeData } from "../lib/i18n";
import { date, money } from "../lib/finance";
import type { CashExpenseSheetComment, CashExpenseSheetRow, Language, RecordItem } from "../lib/types";

// One kasa's live total for this sheet's kind — sum of every income/expense
// record linked to cashAccountName (records.cashAccount). This is what keeps
// the sheet's Asıl Gelir/Gider column always matching the ledger instead of
// drifting like a manually-typed spreadsheet.
function kasaTotal(records: RecordItem[], cashAccountName: string, kind: "income" | "expense"): number {
  return records
    .filter((x) => x.kind === kind && x.cashAccount === cashAccountName)
    .reduce((sum, row) => sum + row.amount, 0);
}

// Sürükle-bırak ile taşınabilir, kenarından tutup boyutlandırılabilir sütun
// sistemi — Kasalar/Gelir/Gider tablosundaki (Records.tsx) aynı desen. Her
// sütun kendi renkli bölümüne (section1/2/3) ait kalır — bölümler arası
// taşıma yok, sadece bölüm içinde sıralama, çünkü renkli gruplamanın anlamı
// budur; bölüm başlığının colSpan'ı da böylece hep sabit sütun sayısına eşit
// kalır.
type SheetColumnId = "code" | "kasa" | "start" | "end" | "budget" | "actual" | "reportReady" | "reportDelivered" | "responsible" | "note" | "resultNote" | "comment";
const SECTION1_DEFAULT: SheetColumnId[] = ["code", "kasa", "start", "end", "budget", "actual"];
const SECTION2_DEFAULT: SheetColumnId[] = ["reportReady", "reportDelivered"];
const SECTION3_DEFAULT: SheetColumnId[] = ["responsible", "note", "resultNote", "comment"];
const DEFAULT_SHEET_WIDTHS: Record<SheetColumnId, number> = {
  code: 70, kasa: 150, start: 110, end: 110, budget: 140, actual: 140,
  reportReady: 90, reportDelivered: 120,
  responsible: 130, note: 170, resultNote: 170, comment: 90,
};
const MIN_SHEET_COLUMN_WIDTH = 56;
const SHEET_COLUMNS_STORAGE_KEY = "mf-sheet-columns-v1";

// Gelir > Gelir Çizelgesi ve Gider > Gider Çizelgesi'nin ikisini de besler —
// tek fark `kind`: hangi kayıt türünden (income/expense) canlı hesaplama
// yapılacağı ve metinlerin "Gelir" mi "Gider" mi diyeceği.
export function CashExpenseSheet({
  language,
  kind,
  records,
  rows,
  onCreate,
  onUpdate,
  onDelete,
  checkPassword,
}: {
  language: Language;
  kind: "income" | "expense";
  records: RecordItem[];
  rows: CashExpenseSheetRow[];
  onCreate: (input: Omit<CashExpenseSheetRow, "id" | "kind" | "code" | "createdAt" | "updatedAt">) => void;
  onUpdate: (row: CashExpenseSheetRow) => void;
  onDelete: (id: number) => void;
  checkPassword: (password: string) => Promise<boolean>;
}) {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<CashExpenseSheetRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CashExpenseSheetRow | null>(null);
  const [commentsFor, setCommentsFor] = useState<CashExpenseSheetRow | null>(null);
  // Bölüm 3 (Sorumlu/Özel Not/Sonuç/Yorum) daraltılıp açılabilir — bkz.
  // sheetGroupToggle.
  const [section3Open, setSection3Open] = useState(true);
  const actualLabel = kind === "income"
    ? tx(language, "Asıl Gelir", "Actual Income", "Dahata Rastîn")
    : tx(language, "Asıl Gider", "Actual Expense", "Mesrefa Rastîn");
  const budgetTotalLabel = tx(language, "Toplam Kasa Gelir Tutarı", "Total Kasa Income Amount", "Bi Giştî Meblağa Dahata Qase");

  // Sütun sırası/genişliği — Kasalar/Gelir/Gider tablosundaki gibi
  // sürükleyerek taşınabilir ve kenarından tutup boyutlandırılabilir. Tek,
  // paylaşılan bir tercih olarak saklanır (Gelir/Gider çizelgesi arasında
  // ortak — sütun kimlikleri ikisinde de aynı).
  const [section1Order, setSection1Order] = useState<SheetColumnId[]>(SECTION1_DEFAULT);
  const [section2Order, setSection2Order] = useState<SheetColumnId[]>(SECTION2_DEFAULT);
  const [section3Order, setSection3Order] = useState<SheetColumnId[]>(SECTION3_DEFAULT);
  const [columnWidths, setColumnWidths] = useState<Record<SheetColumnId, number>>(DEFAULT_SHEET_WIDTHS);
  const [columnsLoaded, setColumnsLoaded] = useState(false);
  const [draggedColumn, setDraggedColumn] = useState<SheetColumnId | null>(null);
  const resizingRef = useRef<{ id: SheetColumnId; startX: number; startWidth: number } | null>(null);
  // Satır sırası (İşlem sütunundaki ⠿ tutamacı) — kind'a göre ayrı saklanır.
  const [rowOrder, setRowOrder] = useState<number[]>([]);
  const [draggedRowId, setDraggedRowId] = useState<number | null>(null);
  const rowOrderStorageKey = `mf-sheet-row-order-${kind}`;

  useEffect(() => {
    try {
      const saved = localStorage.getItem(SHEET_COLUMNS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as {
          section1?: string[]; section2?: string[]; section3?: string[]; widths?: Partial<Record<SheetColumnId, number>>;
        };
        const clean = (ids: string[] | undefined, fallback: SheetColumnId[]) => {
          if (!Array.isArray(ids)) return fallback;
          const valid = ids.filter((id): id is SheetColumnId => (fallback as string[]).includes(id));
          const missing = fallback.filter((id) => !valid.includes(id));
          return valid.length ? [...valid, ...missing] : fallback;
        };
        setSection1Order(clean(parsed.section1, SECTION1_DEFAULT));
        setSection2Order(clean(parsed.section2, SECTION2_DEFAULT));
        setSection3Order(clean(parsed.section3, SECTION3_DEFAULT));
        if (parsed.widths) setColumnWidths((w) => ({ ...w, ...parsed.widths }));
      }
    } catch {
      // Bozuk/erişilemez depolama — varsayılanlar kalır.
    }
    setColumnsLoaded(true);
  }, []);
  useEffect(() => {
    if (!columnsLoaded) return;
    try {
      localStorage.setItem(SHEET_COLUMNS_STORAGE_KEY, JSON.stringify({ section1: section1Order, section2: section2Order, section3: section3Order, widths: columnWidths }));
    } catch {
      // Kota/private mod hatası — düzen sonraki oturuma taşınmaz.
    }
  }, [section1Order, section2Order, section3Order, columnWidths, columnsLoaded]);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(rowOrderStorageKey);
      setRowOrder(saved ? JSON.parse(saved) : []);
    } catch {
      setRowOrder([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);
  function persistRowOrder(order: number[]) {
    setRowOrder(order);
    try {
      localStorage.setItem(rowOrderStorageKey, JSON.stringify(order));
    } catch {
      // Kota/private mod hatası — sıra sonraki oturuma taşınmaz.
    }
  }

  function reorderWithinSection(setOrder: (updater: (order: SheetColumnId[]) => SheetColumnId[]) => void, draggedId: SheetColumnId, targetId: SheetColumnId) {
    setOrder((order) => {
      const from = order.indexOf(draggedId);
      const to = order.indexOf(targetId);
      if (from === -1 || to === -1 || from === to) return order;
      const next = [...order];
      next.splice(from, 1);
      next.splice(to, 0, draggedId);
      return next;
    });
  }
  function onResizeMove(e: MouseEvent) {
    const r = resizingRef.current;
    if (!r) return;
    const next = Math.max(MIN_SHEET_COLUMN_WIDTH, r.startWidth + (e.clientX - r.startX));
    setColumnWidths((w) => ({ ...w, [r.id]: next }));
  }
  function onResizeEnd() {
    resizingRef.current = null;
    window.removeEventListener("mousemove", onResizeMove);
    window.removeEventListener("mouseup", onResizeEnd);
  }
  function startResize(e: ReactMouseEvent, id: SheetColumnId) {
    e.preventDefault();
    e.stopPropagation();
    resizingRef.current = { id, startX: e.clientX, startWidth: columnWidths[id] };
    window.addEventListener("mousemove", onResizeMove);
    window.addEventListener("mouseup", onResizeEnd);
  }

  const kasaTotals = useMemo(
    () => new Map(rows.map((row) => [row.id, kasaTotal(records, row.cashAccountName, kind)])),
    [rows, records, kind],
  );
  const orderedRows = useMemo(() => {
    const byCreated = [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const indexOf = new Map(rowOrder.map((id, i) => [id, i]));
    return byCreated
      .map((row, i) => ({ row, sortKey: indexOf.has(row.id) ? indexOf.get(row.id)! : Number.MAX_SAFE_INTEGER + i }))
      .sort((a, b) => a.sortKey - b.sortKey)
      .map((x) => x.row);
  }, [rows, rowOrder]);
  function moveRow(draggedId: number, targetId: number) {
    const current = orderedRows.map((r) => r.id);
    const from = current.indexOf(draggedId);
    const to = current.indexOf(targetId);
    if (from === -1 || to === -1 || from === to) return;
    const next = [...current];
    next.splice(from, 1);
    next.splice(to, 0, draggedId);
    persistRowOrder(next);
  }
  const totals = {
    budget: rows.reduce((sum, row) => sum + row.budget, 0),
    actual: rows.reduce((sum, row) => sum + (kasaTotals.get(row.id) ?? 0), 0),
  };
  const totalCols = section1Order.length + section2Order.length + (section3Open ? section3Order.length : 1) + 1;

  function columnLabel(id: SheetColumnId): string {
    switch (id) {
      case "code": return tx(language, "Kod", "Code", "Kod");
      case "kasa": return tx(language, "Kasa", "Cash Account", "Qase");
      case "start": return tx(language, "Başlangıç", "Start", "Destpêk");
      case "end": return tx(language, "Bitiş", "End", "Dawî");
      case "budget": return tx(language, "Bütçe", "Budget", "Budçe");
      case "actual": return actualLabel;
      case "reportReady": return tx(language, "Rapor", "Report", "Rapor");
      case "reportDelivered": return tx(language, "Rapor Verildi", "Report Delivered", "Rapor Hate Dayin");
      case "responsible": return tx(language, "Sorumlu", "Responsible", "Berpirsiyar");
      case "note": return tx(language, "Özel Not", "Note", "Nîşe");
      case "resultNote": return tx(language, "Sonuç", "Result", "Encam");
      case "comment": return tx(language, "Yorum", "Comments", "Şîrove");
    }
  }
  function columnCellClassName(id: SheetColumnId): string {
    if (id === "budget" || id === "actual") return "amount";
    if (id === "note" || id === "resultNote") return "sheetNoteCell";
    return "";
  }
  function renderHeaderCell(id: SheetColumnId, sectionClass: string, setOrder: (updater: (order: SheetColumnId[]) => SheetColumnId[]) => void, isLast: boolean) {
    return (
      <th
        key={id}
        className={`${sectionClass}${isLast ? " sheetSectionEnd" : ""}${draggedColumn === id ? " colDragging" : ""}`}
        draggable
        onDragStart={(e) => { setDraggedColumn(id); e.dataTransfer.effectAllowed = "move"; }}
        onDragOver={(e) => { if (draggedColumn !== null) e.preventDefault(); }}
        onDrop={(e) => { e.preventDefault(); if (draggedColumn !== null) reorderWithinSection(setOrder, draggedColumn, id); setDraggedColumn(null); }}
        onDragEnd={() => setDraggedColumn(null)}
        title={tx(language, "Sürükleyerek taşı, kenarından tutup genişliğini ayarla", "Drag to reorder, drag the edge to resize", "Ji bo veguhastinê bikişîne, ji kêleka wê bigire da ku firehiyê saz bike")}
      >
        <span className="colHeaderLabel">{id === "budget" ? (<>{columnLabel(id)}<br /><small>({tx(language, "Kasa Gelir Tutarı", "Kasa Income Amount", "Meblağa Dahata Qase")})</small></>) : columnLabel(id)}</span>
        <span className="colResizeHandle" draggable={false} onMouseDown={(e) => startResize(e, id)} onClick={(e) => e.stopPropagation()} />
      </th>
    );
  }
  function renderCell(id: SheetColumnId, row: CashExpenseSheetRow, actual: number) {
    switch (id) {
      case "code": return row.code;
      case "kasa": return <b>{localizeData(row.cashAccountName, language) || "—"}</b>;
      case "start": return row.startDate ? date(row.startDate, language) : "—";
      case "end": return row.endDate ? date(row.endDate, language) : "—";
      case "budget": return money(row.budget);
      case "actual": return money(actual);
      case "reportReady": return <input type="checkbox" checked={row.reportReady} onChange={(e) => onUpdate({ ...row, reportReady: e.target.checked })} />;
      case "reportDelivered": return <input type="checkbox" checked={row.reportDelivered} onChange={(e) => onUpdate({ ...row, reportDelivered: e.target.checked })} />;
      case "responsible": return localizeData(row.responsible, language) || "—";
      case "note": return <span title={row.note}>{row.note || "—"}</span>;
      case "resultNote": return <span title={row.resultNote}>{row.resultNote || "—"}</span>;
      case "comment": return <button type="button" className="icon" title={tx(language, "Yorumlar", "Comments", "Şîrove")} onClick={() => setCommentsFor(row)}>💬</button>;
    }
  }
  function footerCell(id: SheetColumnId, isFirst: boolean) {
    if (id === "budget") return money(totals.budget);
    if (id === "actual") return money(totals.actual);
    if (isFirst) return tx(language, "Toplam", "Total", "Giştî");
    return "";
  }

  return (
    <div className="cashExpenseSheet">
      <div className="toolbar">
        <Title
          title={kind === "income"
            ? tx(language, "Gelir Çizelgesi", "Income Sheet", "Çîzelgeya Dahatê")
            : tx(language, "Gider Çizelgesi", "Expense Sheet", "Çîzelgeya Mesrefê")}
          sub={kind === "income"
            ? tx(
                language,
                "Bir kasa ekleyin; bütçe ve gerçekleşen gelir otomatik izlenir",
                "Add a kasa; budget and actual income are tracked automatically",
                "Qaseyekê zêde bike; budçe û dahata rastîn bixweber tê şopandin",
              )
            : tx(
                language,
                "Bir kasa ekleyin; bütçe ve gerçekleşen gider otomatik izlenir",
                "Add a kasa; budget and actual spend are tracked automatically",
                "Qaseyekê zêde bike; budçe û mesrefa rastîn bixweber tê şopandin",
              )}
        />
        <div className="rowActions">
          <button type="button" className="light" disabled={!orderedRows.length} onClick={() => downloadCashFlowSheet(rows, kasaTotals, totals, kind, language)}>
            ⇩ {tx(language, "Excel'e Aktar", "Export to Excel", "Bal ve Excel Derxe")}
          </button>
          <button className="primary" onClick={() => setCreating(true)}>＋ {tx(language, "Çizelgeye Kasa Ekle", "Add Cash Account to Sheet", "Qaseyê Li Çîzelgeyê Zêde Bike")}</button>
        </div>
      </div>
      <div className="recordsTable cashExpenseSheetTable resizableTable">
        <table>
          <colgroup>
            {section1Order.map((id) => <col key={id} style={{ width: columnWidths[id] }} />)}
            {section2Order.map((id) => <col key={id} style={{ width: columnWidths[id] }} />)}
            {(section3Open ? section3Order : ["__collapsed__"]).map((id) => <col key={id} style={{ width: id === "__collapsed__" ? 40 : columnWidths[id as SheetColumnId] }} />)}
            <col style={{ width: 90 }} />
          </colgroup>
          <thead>
            <tr className="sheetGroupRow">
              <th colSpan={section1Order.length} className="sheetSection1">
                {tx(language, "Kasa ve Bütçe Bilgisi", "Kasa & Budget Info", "Agahiya Qase û Budçe")}
                <br /><small>({budgetTotalLabel}: {money(totals.budget)})</small>
              </th>
              <th colSpan={section2Order.length} className="sheetSection2">
                {tx(language, "Rapor Durumu", "Report Status", "Rewşa Raporê")}
              </th>
              <th
                colSpan={section3Open ? section3Order.length : 1}
                className="sheetSection3 sheetGroupToggle"
                onClick={() => setSection3Open((v) => !v)}
                title={tx(language, "Daralt / Genişlet", "Collapse / Expand", "Teng bike / Fireh bike")}
              >
                {section3Open ? "▾" : "▸"} {tx(language, "Detay ve Yorum", "Detail & Comments", "Hûrgulî û Şîrove")}
              </th>
              <th rowSpan={2} className="sheetSectionAction">{tx(language, "İşlem", "Action", "Çalakî")}</th>
            </tr>
            <tr>
              {section1Order.map((id, i) => renderHeaderCell(id, "sheetSection1", setSection1Order, i === section1Order.length - 1))}
              {section2Order.map((id, i) => renderHeaderCell(id, "sheetSection2", setSection2Order, i === section2Order.length - 1))}
              {section3Open
                ? section3Order.map((id) => renderHeaderCell(id, "sheetSection3", setSection3Order, false))
                : <th className="sheetSection3"></th>}
            </tr>
          </thead>
          <tbody>
            {orderedRows.map((row) => {
              const actual = kasaTotals.get(row.id) ?? 0;
              return (
                <tr
                  key={row.id}
                  className={draggedRowId === row.id ? "rowDragging" : ""}
                  draggable
                  onDragStart={(e) => {
                    if (!(e.target as HTMLElement).closest(".rowDragHandle")) { e.preventDefault(); return; }
                    setDraggedRowId(row.id);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragOver={(e) => { if (draggedRowId !== null) e.preventDefault(); }}
                  onDrop={(e) => { e.preventDefault(); if (draggedRowId !== null) moveRow(draggedRowId, row.id); setDraggedRowId(null); }}
                  onDragEnd={() => setDraggedRowId(null)}
                >
                  {section1Order.map((id, i) => (
                    <td key={id} className={`sheetSection1 ${columnCellClassName(id)}${i === section1Order.length - 1 ? " sheetSectionEnd" : ""}`}>{renderCell(id, row, actual)}</td>
                  ))}
                  {section2Order.map((id, i) => (
                    <td key={id} className={`sheetSection2 ${columnCellClassName(id)}${i === section2Order.length - 1 ? " sheetSectionEnd" : ""}`}>{renderCell(id, row, actual)}</td>
                  ))}
                  {section3Open
                    ? section3Order.map((id) => <td key={id} className={`sheetSection3 ${columnCellClassName(id)}`}>{renderCell(id, row, actual)}</td>)
                    : <td className="sheetSection3"></td>}
                  <td className="sheetSectionAction">
                    <div className="rowActions">
                      <button type="button" className="icon" title={tx(language, "Düzenle", "Edit", "Biguherîne")} onClick={() => setEditing(row)}>✎</button>
                      <button type="button" className="icon" title={tx(language, "Sil", "Delete", "Jêbibe")} onClick={() => setDeleteTarget(row)}>🗑</button>
                      <span className="rowDragHandle" title={tx(language, "Satırı taşımak için sürükleyin", "Drag to move the row", "Ji bo veguhastina rêzê bikişîne")}>⠿</span>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!orderedRows.length && (
              <tr>
                <td colSpan={totalCols} className="empty">
                  {tx(language, "Henüz çizelgeye kasa eklenmedi.", "No cash account added to the sheet yet.", "Hîn qase li çîzelgeyê nehatiye zêdekirin.")}
                </td>
              </tr>
            )}
          </tbody>
          {Boolean(orderedRows.length) && (
            <tfoot>
              <tr className="templateSubtotal">
                {section1Order.map((id, i) => <td key={id} className={columnCellClassName(id)}>{footerCell(id, i === 0)}</td>)}
                {section2Order.map((id) => <td key={id}></td>)}
                {section3Open ? section3Order.map((id) => <td key={id}></td>) : <td></td>}
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {creating && (
        <CashExpenseSheetModal
          language={language}
          kind={kind}
          records={records}
          existingCashAccountNames={rows.map((row) => row.cashAccountName)}
          onClose={() => setCreating(false)}
          onSave={(input) => {
            onCreate(input);
            setCreating(false);
          }}
        />
      )}
      {editing && (
        <CashExpenseSheetModal
          language={language}
          kind={kind}
          records={records}
          initial={editing}
          existingCashAccountNames={rows.filter((row) => row.id !== editing.id).map((row) => row.cashAccountName)}
          onClose={() => setEditing(null)}
          onSave={(input) => {
            onUpdate({ ...editing, ...input });
            setEditing(null);
          }}
        />
      )}
      {deleteTarget && (
        <DeleteConfirmModal
          language={language}
          itemLabel={deleteTarget.cashAccountName}
          warningText={tx(
            language,
            "Bu çizelge satırı kalıcı olarak silinecektir. Kasaya bağlı gelir/gider kayıtları etkilenmez. Devam etmek istiyor musunuz?",
            "This sheet row will be permanently deleted. The kasa's own income/expense records are not affected. Continue?",
            "Ev rêza çîzelgeyê dê bi awayekî domdar were jêbirin. Qeydên dahat/mesrefê yên qaseyê ji vê nayên bandorkirin. Berdewam bikî?",
          )}
          checkPassword={checkPassword}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => {
            onDelete(deleteTarget.id);
            setDeleteTarget(null);
          }}
        />
      )}
      {commentsFor && (
        <SheetCommentsModal language={language} row={commentsFor} onClose={() => setCommentsFor(null)} />
      )}
    </div>
  );
}

// Bölüm 3'teki "💬 Yorum" girişi — RecordCommentsModal'a benzer ama basit:
// tepki (emoji) ve "dikkat" işareti yok, sadece kronolojik metin yorumları.
function SheetCommentsModal({
  language,
  row,
  onClose,
}: {
  language: Language;
  row: CashExpenseSheetRow;
  onClose: () => void;
}) {
  const [comments, setComments] = useState<CashExpenseSheetComment[] | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`/api/cash-expense-sheets/${row.id}/comments`);
        const data = await response.json().catch(() => ({}));
        if (!cancelled) setComments(response.ok ? (data.comments ?? []) : []);
      } catch {
        if (!cancelled) setComments([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [row.id]);

  async function addComment() {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/cash-expense-sheets/${row.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed }),
      });
      if (!response.ok) {
        alert(tx(language, "Yorum gönderilemedi.", "The comment could not be sent.", "Şîrove nehat şandin."));
        return;
      }
      const data = await response.json();
      setComments((current) => [...(current ?? []), data.comment]);
      setText("");
    } catch {
      alert(tx(language, "Yorum gönderilemedi.", "The comment could not be sent.", "Şîrove nehat şandin."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal commentsModal" onClick={(e) => e.stopPropagation()}>
        <div className="modalHead">
          <div>
            <h2>{tx(language, "Yorumlar", "Comments", "Şîrove")}</h2>
            <small>{localizeData(row.cashAccountName, language)} · {row.code}</small>
          </div>
          <button type="button" onClick={onClose}>×</button>
        </div>
        <div className="commentThread">
          <div className="commentList">
            {comments === null ? (
              <small>{tx(language, "Yükleniyor…", "Loading…", "Tê barkirin…")}</small>
            ) : comments.length === 0 ? (
              <small className="commentEmpty">{tx(language, "Henüz yorum yok.", "No comments yet.", "Hîn şîrove tune.")}</small>
            ) : (
              comments.map((c) => (
                <div className="commentItem" key={c.id}>
                  <div className="commentItemLine">
                    <strong>{c.userName || tx(language, "Silinmiş kullanıcı", "Deleted user", "Bikarhênerê hatiye jêbirin")}</strong>
                    <small>{new Date(c.createdAt).toLocaleString(language === "en" ? "en-GB" : "tr-TR")}</small>
                    <span className="commentItemText">{c.text}</span>
                  </div>
                </div>
              ))
            )}
          </div>
          <form
            className="commentReplyForm"
            onSubmit={(e) => {
              e.preventDefault();
              addComment();
            }}
          >
            <div className="commentReplyBox">
              <textarea
                rows={2}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={tx(language, "Yorumunuzu yazın…", "Write your comment…", "Şîroveya xwe binivîse…")}
                disabled={busy}
              />
            </div>
            <button type="submit" className="primary" disabled={busy || !text.trim()}>
              {tx(language, "Gönder", "Send", "Bişîne")}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function CashExpenseSheetModal({
  language,
  kind,
  records,
  initial,
  existingCashAccountNames,
  onClose,
  onSave,
}: {
  language: Language;
  kind: "income" | "expense";
  records: RecordItem[];
  initial?: CashExpenseSheetRow;
  existingCashAccountNames: string[];
  onClose: () => void;
  onSave: (input: Omit<CashExpenseSheetRow, "id" | "kind" | "code" | "createdAt" | "updatedAt">) => void;
}) {
  const knownCashAccounts = useMemo(
    () => [...new Set(records.filter((x) => x.kind === "cash").map((x) => x.source).filter(Boolean))]
      .filter((name) => name === initial?.cashAccountName || !existingCashAccountNames.includes(name)),
    [records, existingCashAccountNames, initial],
  );
  const [cashAccountName, setCashAccountName] = useState(initial?.cashAccountName ?? "");
  const [startDate, setStartDate] = useState(initial?.startDate ?? new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(initial?.endDate ?? "");
  const [budget, setBudget] = useState(initial?.budget ?? 0);
  const [reportReady, setReportReady] = useState(initial?.reportReady ?? false);
  const [reportDelivered, setReportDelivered] = useState(initial?.reportDelivered ?? false);
  const [reportDate, setReportDate] = useState(initial?.reportDate ?? "");
  const [responsible, setResponsible] = useState(initial?.responsible ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [resultNote, setResultNote] = useState(initial?.resultNote ?? "");
  const valid = Boolean(cashAccountName);

  // Yeni satır eklerken kasayı seçer seçmez Bütçe'yi o kasanın kendi
  // (gelir) tutarından, Sorumlu'yu da o kasanın kayıtlarında tek bir kişi
  // varsa ondan otomatik doldur — kullanıcı isterse yine elle değiştirebilir.
  // Düzenleme modunda (initial dolu) dokunmuyoruz, zaten kayıtlı değerler var.
  useEffect(() => {
    if (initial || !cashAccountName) return;
    const kasaRecord = records.find((x) => x.kind === "cash" && x.source === cashAccountName);
    // Kasa tutarı eksi (borç/düzeltme) olabilir — Bütçe kavramsal olarak
    // her zaman pozitif bir hedef olduğundan mutlak değerini kullanıyoruz.
    if (kasaRecord) setBudget(Math.abs(kasaRecord.amount));
    const involvedPersons = [...new Set(
      records.filter((x) => x.kind === kind && x.cashAccount === cashAccountName).map((x) => x.person.trim()).filter(Boolean),
    )];
    if (involvedPersons.length === 1) setResponsible(involvedPersons[0]);
  }, [cashAccountName, initial, records, kind]);

  return (
    <div className="overlay">
      <form
        className="modal"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          onSave({ cashAccountName, startDate, endDate, budget, reportReady, reportDelivered, reportDate, responsible: responsible.trim(), note: note.trim(), resultNote: resultNote.trim() });
        }}
      >
        <div className="modalHead">
          <div>
            <h2>{initial ? tx(language, "Çizelge Satırını Düzenle", "Edit Sheet Row", "Rêza Çîzelgeyê Biguherîne") : tx(language, "Çizelgeye Kasa Ekle", "Add Cash Account to Sheet", "Qaseyê Li Çîzelgeyê Zêde Bike")}</h2>
            <p>{tx(language, "Kasayı seçin; o kasaya ait tüm kayıtlar (tarih, kimden, tutar) çizelgeye olduğu gibi işlenir.", "Select the kasa; all of its records (date, from whom, amount) are carried into the sheet as-is.", "Qaseyê hilbijêre; hemû qeydên wê qaseyê (dîrok, ji kê, meblağ) wekî xwe tên çîzelgeyê.")}</p>
          </div>
          <button type="button" onClick={onClose}>×</button>
        </div>
        <div className="formGrid">
          <label>
            {tx(language, "Kasa Seç", "Select Cash Account", "Qase Hilbijêre")}
            <select required value={cashAccountName} onChange={(e) => setCashAccountName(e.target.value)} disabled={Boolean(initial)}>
              <option value="">{tx(language, "— Seçiniz —", "— Select —", "— Hilbijêre —")}</option>
              {knownCashAccounts.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
          <label>
            {tx(language, "Başlangıç Tarihi", "Start Date", "Dîroka Destpêkê")}
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </label>
          <label>
            {tx(language, "Bitiş Tarihi", "End Date", "Dîroka Dawî")}
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </label>
          <label>
            {tx(language, "Bütçe (Kasa Gelir Tutarı)", "Budget (Kasa Income Amount)", "Budçe (Meblağa Dahata Qase)")}
            <input type="number" min="0" value={budget || ""} onChange={(e) => setBudget(Number(e.target.value))} />
          </label>
          <label>
            {tx(language, "Sorumlu / Kimden", "Responsible", "Berpirsiyar")}
            <input value={responsible} onChange={(e) => setResponsible(e.target.value)} />
          </label>
          <label>
            {tx(language, "Rapor Veriliş Tarihi", "Report Submission Date", "Dîroka Radestkirina Raporê")}
            <input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} />
          </label>
          <label className="checkboxField">
            <input type="checkbox" checked={reportReady} onChange={(e) => setReportReady(e.target.checked)} />
            {tx(language, "Rapor Hazırlandı", "Report Prepared", "Rapor Hate Amadekirin")}
          </label>
          <label className="checkboxField">
            <input type="checkbox" checked={reportDelivered} onChange={(e) => setReportDelivered(e.target.checked)} />
            {tx(language, "Rapor Verildi", "Report Delivered", "Rapor Hate Radestkirin")}
          </label>
          <label className="wide">
            {tx(language, "Özel Not", "Note", "Nîşe")}
            <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <label className="wide">
            {tx(language, "Sonuç (Encam)", "Result", "Encam")}
            <textarea rows={2} value={resultNote} onChange={(e) => setResultNote(e.target.value)} />
          </label>
        </div>
        <div className="modalActions">
          <button type="button" className="light" onClick={onClose}>{tx(language, "Vazgeç", "Cancel", "Betal")}</button>
          <button className="primary" disabled={!valid}>{initial ? tx(language, "Değişiklikleri Kaydet", "Save Changes", "Guherînan Tomar Bike") : tx(language, "Ekle", "Add", "Zêde Bike")}</button>
        </div>
      </form>
    </div>
  );
}

async function downloadCashFlowSheet(
  rows: CashExpenseSheetRow[],
  kasaTotals: Map<number, number>,
  totals: { budget: number; actual: number },
  kind: "income" | "expense",
  language: Language,
) {
  const sheetTitle = kind === "income"
    ? tx(language, "Gelir Çizelgesi", "Income Sheet", "Çîzelgeya Dahatê")
    : tx(language, "Gider Çizelgesi", "Expense Sheet", "Çîzelgeya Mesrefê");
  const actualLabel = kind === "income"
    ? tx(language, "Asıl Gelir", "Actual Income", "Dahata Rastîn")
    : tx(language, "Asıl Gider", "Actual Expense", "Mesrefa Rastîn");

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Maliye-Finans Online";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet(sheetTitle, {
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
    views: [{ showGridLines: false }],
  });

  const headers = [
    tx(language, "Kod", "Code", "Kod"),
    tx(language, "Kasa", "Cash Account", "Qase"),
    tx(language, "Başlangıç", "Start", "Destpêk"),
    tx(language, "Bitiş", "End", "Dawî"),
    tx(language, "Bütçe", "Budget", "Budçe"),
    actualLabel,
    tx(language, "Rapor", "Report", "Rapor"),
    tx(language, "Rapor Verildi", "Report Delivered", "Rapor Hate Dayin"),
    tx(language, "Sorumlu", "Responsible", "Berpirsiyar"),
    tx(language, "Özel Not", "Note", "Nîşe"),
    tx(language, "Sonuç", "Result", "Encam"),
  ];
  sheet.columns = headers.map((_, index) => ({ width: index < 2 ? 20 : index >= 8 && index <= 10 ? 24 : 16 }));

  const thin = { style: "thin" as const, color: { argb: "FFD3DDDD" } };
  const border = { top: thin, left: thin, bottom: thin, right: thin };
  const moneyFormat = '$ #,##0.00;[Red]-$ #,##0.00';

  const titleRow = sheet.addRow([sheetTitle]);
  sheet.mergeCells(titleRow.number, 1, titleRow.number, headers.length);
  titleRow.height = 27;
  titleRow.eachCell({ includeEmpty: true }, (cell) => {
    cell.font = { name: "Arial", bold: true, size: 15, color: { argb: "FF172B2F" } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFB9D3D5" } };
    cell.border = border;
  });

  const headerRow = sheet.addRow(headers);
  headerRow.height = 24;
  headerRow.eachCell((cell) => {
    cell.font = { name: "Arial", bold: true, size: 10, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF5F9FAF" } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = border;
  });

  const sorted = [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  for (const row of sorted) {
    const values = [
      row.code,
      row.cashAccountName,
      row.startDate ? date(row.startDate, "tr") : "",
      row.endDate ? date(row.endDate, "tr") : "",
      row.budget,
      kasaTotals.get(row.id) ?? 0,
      row.reportReady ? "✓" : "",
      row.reportDelivered ? "✓" : "",
      row.responsible,
      row.note,
      row.resultNote,
    ];
    const dataRow = sheet.addRow(values);
    dataRow.height = 22;
    dataRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cell.font = { name: "Arial", size: 10, color: { argb: "FF314750" } };
      cell.alignment = { vertical: "middle", wrapText: true, horizontal: colNumber === 5 || colNumber === 6 ? "right" : "left" };
      cell.border = border;
    });
    [5, 6].forEach((col) => { dataRow.getCell(col).numFmt = moneyFormat; dataRow.getCell(col).font = { name: "Arial", size: 10, bold: true, color: { argb: "FF314750" } }; });
  }

  const totalRow = sheet.addRow([tx(language, "Toplam", "Total", "Giştî"), "", "", "", totals.budget, totals.actual]);
  sheet.mergeCells(totalRow.number, 1, totalRow.number, 4);
  totalRow.height = 24;
  totalRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    cell.border = border;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE7F4EF" } };
    cell.font = { name: "Arial", size: 10, bold: true, color: { argb: "FF314750" } };
    cell.alignment = { vertical: "middle", horizontal: colNumber === 1 ? "left" : "right" };
  });
  [5, 6].forEach((col) => { totalRow.getCell(col).numFmt = moneyFormat; });

  sheet.pageSetup.margins = { left: 0.3, right: 0.3, top: 0.45, bottom: 0.45, header: 0.2, footer: 0.2 };
  sheet.headerFooter.oddFooter = `&L${sheetTitle}&RPage &P / &N`;
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const link = window.document.createElement("a");
  link.href = url;
  link.download = `${sheetTitle.replaceAll(" ", "-").replace(/[\\/:*?"<>|]/g, "-")}.xlsx`;
  link.click();
  URL.revokeObjectURL(url);
}

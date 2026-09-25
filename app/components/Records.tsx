"use client";

import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import ExcelJS from "exceljs";
import { Title, ConfirmModal, DeleteConfirmModal } from "./shared";
import { RecordCommentsModal } from "./Comments";
import { tx, localizeData, noteRelationLabel } from "../lib/i18n";
import { combineByCurrency, date, money, moneyBreakdown, normalizeRecord, parseImportDate, total } from "../lib/finance";
import type { CashAccountSummary, CashTransfer, FinanceNote, Kind, Language, NoteRelation, NoteStatus, RecordItem, UserAccount } from "../lib/types";

function ShareKasaModal({
  language,
  account,
  users,
  onToggle,
  busyKey,
  onToggleDashboardShare,
  dashboardShareBusy,
  onClose,
}: {
  language: Language;
  account: CashAccountSummary;
  users: UserAccount[];
  onToggle: (userId: number, grant: boolean) => void;
  busyKey: string | null;
  onToggleDashboardShare: (enabled: boolean) => void;
  dashboardShareBusy: boolean;
  onClose: () => void;
}) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modalHead">
          <div>
            <h2>{tx(language, "Kasayı Paylaş", "Share Kasa", "Qaseyê Parve Bike")}</h2>
            <small>{account.name}</small>
          </div>
          <button type="button" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="userPermissionOptions">
          {users.map((u) => {
            const key = `${account.id}-${u.id}`;
            const shared = account.sharedWithUserIds.includes(u.id);
            const isOwner = account.ownerUserId === u.id;
            return (
              <label key={u.id} className="userPermissionOption">
                <input
                  type="checkbox"
                  checked={shared || isOwner}
                  disabled={isOwner || busyKey === key}
                  onChange={(e) => onToggle(u.id, e.target.checked)}
                />
                {u.name} {isOwner ? `(${tx(language, "sahibi", "owner", "xwedî")})` : ""}
              </label>
            );
          })}
        </div>
        <label className="wide check dashboardShareOption">
          <input
            type="checkbox"
            checked={account.dashboardShareEnabled}
            disabled={dashboardShareBusy}
            onChange={(e) => onToggleDashboardShare(e.target.checked)}
          />
          <span>
            <b>{tx(language, "Süper Admin'in Ana Sayfa'sında göster", "Show in Super Admin's Ana Sayfa", "Di Ana Sayfaya Super Admin de nîşan bide")}</b>
            <small>
              {tx(
                language,
                "İşaretlerseniz, süper admin isterse (Ayarlar > Görüntüle) bu kasanın sonuçlarını kendi Ana Sayfa toplamlarına dahil edebilir.",
                "If checked, a super admin can choose (Ayarlar > Görüntüle) to fold this kasa's results into their own Ana Sayfa totals.",
                "Heke hatibe nîşankirin, super admin dikare (Ayarlar > Nîşandan) encamên vê qaseyê têxe nav giştiyên Ana Sayfaya xwe.",
              )}
            </small>
          </span>
        </label>
        <div className="modalActions">
          <button type="button" onClick={onClose}>
            {tx(language, "Kapat", "Close", "Bigire")}
          </button>
        </div>
      </div>
    </div>
  );
}

function SuggestInput({
  value,
  onChange,
  options,
  placeholder,
  required,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const filtered = options
    .filter((o) => o.toLowerCase().includes(value.toLowerCase()))
    .slice(0, 8);
  return (
    <div className="suggestField">
      <input
        required={required}
        disabled={disabled}
        autoComplete="off"
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
      />
      {open && filtered.length > 0 && (
        <div className="suggestList">
          {filtered.map((o) => (
            <button
              type="button"
              key={o}
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(o);
                setOpen(false);
              }}
            >
              {o}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Virgülle ayrılmış çoklu etiket girişi — SuggestInput'tan farklı olarak
// önerileri tüm metne değil, en son (henüz yazılmakta olan) etikete göre
// filtreler, böylece "sa" yazınca daha önce girilmiş "sabit" gibi bir
// etiket baş harfleri eşleşir eşleşmez seçenek olarak çıkar. Yerel metin
// tamponu (text state) tutuyor ki kullanıcı virgül yazıp yeni bir etikete
// geçerken input değeri elindeki yazının altından kaymasın.
function TagsInput({
  tags,
  onChange,
  options,
  placeholder,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  options: string[];
  placeholder?: string;
}) {
  const [text, setText] = useState(tags.join(", "));
  const [open, setOpen] = useState(false);
  const segments = text.split(",");
  const draft = (segments[segments.length - 1] ?? "").trim();
  const confirmed = segments.slice(0, -1).map((s) => s.trim()).filter(Boolean);
  const confirmedLower = new Set(confirmed.map((t) => t.toLowerCase()));
  const filtered = options
    .filter((o) => !confirmedLower.has(o.toLowerCase()))
    .filter((o) => (draft ? o.toLowerCase().startsWith(draft.toLowerCase()) : true))
    .filter((o) => o.toLowerCase() !== draft.toLowerCase())
    .slice(0, 8);

  function commitText(next: string) {
    setText(next);
    onChange(
      next
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean),
    );
  }
  function pick(tag: string) {
    commitText([...confirmed, tag].join(", ") + ", ");
  }

  return (
    <div className="suggestField">
      <input
        autoComplete="off"
        value={text}
        placeholder={placeholder}
        onChange={(e) => {
          commitText(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
      />
      {open && filtered.length > 0 && (
        <div className="suggestList">
          {filtered.map((o) => (
            <button
              type="button"
              key={o}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(o);
              }}
            >
              {o}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Kasalar/Gelir/Gider tablosunun sütunları — kullanıcı bunları sürükleyerek
// sırasını değiştirebilir ve kenarından tutup genişliğini ayarlayabilir
// (bkz. columnOrder/columnWidths in Records()). Tek bir liste hem sütun
// kimliklerini hem de varsayılan genişliklerini taşır; sırası
// DEFAULT_COLUMN_ORDER'ın başlangıç durumudur.
type ColumnId = "date" | "title" | "detail" | "messages" | "person" | "amount" | "location" | "tags" | "action";
const DEFAULT_COLUMN_ORDER: ColumnId[] = ["date", "title", "detail", "messages", "person", "amount", "location", "tags", "action"];
// Detay/Not ve Mesajlar öntanımlı olarak en dar iki sütun — uzun metin
// satıra sığmayınca satırı büyütmek yerine tek satırda "..." ile kesilir
// (bkz. renderCell'deki .cellDetailText ve .messagesCellText), böylece
// tablo hem dikeyde hem yatayda daha az yer kaplar. amount/action bilerek
// küçültülmedi — tutarların ve satır aksiyon ikonlarının kesilmemesi
// gerekiyor. Kullanıcı isterse sütun kenarından tutup yine genişletebilir.
const DEFAULT_COLUMN_WIDTHS: Record<ColumnId, number> = {
  date: 100,
  title: 140,
  detail: 110,
  messages: 110,
  person: 80,
  amount: 110,
  location: 120,
  tags: 110,
  action: 110,
};
const MIN_COLUMN_WIDTH = 64;
// v2: Detay/Not ve Mesajlar öntanımlı genişlikleri daraltıldı — anahtar
// sürümü artırılmasa, daha önce kaydedilmiş (geniş) genişlikler yeni
// varsayılanları maskeler ve kullanıcı hiçbir fark görmez.
const COLUMNS_STORAGE_KEY = "mf-records-columns-v2";

export function Records({
  language,
  kind,
  records,
  allRecords,
  onAdd,
  onEdit,
  onDelete,
  onImport,
  checkPassword,
  cashAccounts,
  users,
  onCashAccountsChange,
  search,
  setSearch,
  cashTransfers,
  onTransfersChanged,
  onCommentsRead,
  readOnly,
}: {
  language: Language;
  kind: Kind;
  records: RecordItem[];
  allRecords: RecordItem[];
  onAdd: () => void;
  onEdit: (x: RecordItem) => void;
  onDelete: (x: RecordItem) => void;
  onImport: (rows: Omit<RecordItem, "id">[]) => void;
  checkPassword: (password: string) => Promise<boolean>;
  cashAccounts: CashAccountSummary[];
  users: UserAccount[];
  onCashAccountsChange: (updater: CashAccountSummary[] | ((current: CashAccountSummary[]) => CashAccountSummary[])) => void;
  search: string;
  setSearch: (v: string) => void;
  cashTransfers: CashTransfer[];
  onTransfersChanged: () => void;
  onCommentsRead?: () => void;
  readOnly: boolean;
}) {
  const [deleteTarget, setDeleteTarget] = useState<RecordItem | null>(null);
  const [commentTarget, setCommentTarget] = useState<RecordItem | null>(null);
  const [kasaResultOpen, setKasaResultOpen] = useState(false);
  // Manual row order (drag handle in the İşlem column) — a per-kind override
  // on top of the default date/id sort, kept in localStorage since it's a
  // personal display preference, not app data. Ids not in the saved order
  // (new records) fall back to their normal sorted position, after the ones
  // the user has placed.
  const [rowOrder, setRowOrder] = useState<number[]>([]);
  const [draggedRowId, setDraggedRowId] = useState<number | null>(null);
  const [dragOverRowId, setDragOverRowId] = useState<number | null>(null);
  const rowOrderStorageKey = `mf-row-order-${kind}`;
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
      // Quota or private-mode failure — the order just won't survive reload.
    }
  }
  // Tarihe göre / son eklenene göre sıralama — standart bir liste özelliği.
  // Seçim değişince önceki elle sürükleme sırası (rowOrder) temizlenir, yoksa
  // yeni seçim görünürde hiçbir şey değiştirmemiş gibi durur.
  type SortMode = "dateDesc" | "dateAsc" | "addedDesc" | "addedAsc";
  const [sortMode, setSortMode] = useState<SortMode>("dateDesc");
  const sortModeStorageKey = `mf-sort-mode-${kind}`;
  useEffect(() => {
    try {
      const saved = localStorage.getItem(sortModeStorageKey) as SortMode | null;
      setSortMode(saved && ["dateDesc", "dateAsc", "addedDesc", "addedAsc"].includes(saved) ? saved : "dateDesc");
    } catch {
      setSortMode("dateDesc");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);
  function changeSortMode(next: SortMode) {
    setSortMode(next);
    try {
      localStorage.setItem(sortModeStorageKey, next);
    } catch {
      // Quota or private-mode failure — the choice just won't survive reload.
    }
    persistRowOrder([]);
  }
  // Sütun sırası ve genişlikleri — Kasalar/Gelir/Gider üçünde de aynı
  // sütun kimlikleri geçerli olduğu için tek, paylaşılan bir tercih olarak
  // saklanır (kind'a göre ayrı değil).
  const [columnOrder, setColumnOrder] = useState<ColumnId[]>(DEFAULT_COLUMN_ORDER);
  const [columnWidths, setColumnWidths] = useState<Record<ColumnId, number>>(DEFAULT_COLUMN_WIDTHS);
  const [columnsLoaded, setColumnsLoaded] = useState(false);
  const [draggedColumn, setDraggedColumn] = useState<ColumnId | null>(null);
  const resizingRef = useRef<{ id: ColumnId; startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(COLUMNS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as { order?: string[]; widths?: Partial<Record<ColumnId, number>> };
        if (Array.isArray(parsed.order)) {
          const valid = parsed.order.filter((id): id is ColumnId => (DEFAULT_COLUMN_ORDER as string[]).includes(id));
          const missing = DEFAULT_COLUMN_ORDER.filter((id) => !valid.includes(id));
          setColumnOrder([...valid, ...missing]);
        }
        if (parsed.widths) setColumnWidths((w) => ({ ...w, ...parsed.widths }));
      }
    } catch {
      // Corrupt/unavailable storage — defaults stay in place.
    }
    setColumnsLoaded(true);
  }, []);

  useEffect(() => {
    if (!columnsLoaded) return;
    try {
      localStorage.setItem(COLUMNS_STORAGE_KEY, JSON.stringify({ order: columnOrder, widths: columnWidths }));
    } catch {
      // Quota or private-mode failure — the layout just won't survive reload.
    }
  }, [columnOrder, columnWidths, columnsLoaded]);

  function reorderColumn(draggedId: ColumnId, targetId: ColumnId) {
    setColumnOrder((order) => {
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
    const next = Math.max(MIN_COLUMN_WIDTH, r.startWidth + (e.clientX - r.startX));
    setColumnWidths((w) => ({ ...w, [r.id]: next }));
  }
  function onResizeEnd() {
    resizingRef.current = null;
    window.removeEventListener("mousemove", onResizeMove);
    window.removeEventListener("mouseup", onResizeEnd);
  }
  function startResize(e: ReactMouseEvent, id: ColumnId) {
    e.preventDefault();
    e.stopPropagation();
    resizingRef.current = { id, startX: e.clientX, startWidth: columnWidths[id] };
    window.addEventListener("mousemove", onResizeMove);
    window.addEventListener("mouseup", onResizeEnd);
  }

  function columnLabel(id: ColumnId): string {
    switch (id) {
      case "date":
        return tx(language, "Tarih", "Date", "Tarîx");
      case "title":
        return kind === "cash"
          ? tx(language, "Kasa Adı", "Cash Account", "Navê Qaseyê")
          : tx(language, "Ana Başlık", "Main Category", "Sernavê Sereke");
      case "detail":
        return showListColumn
          ? tx(language, "Liste Kaydı", "List Record", "Qeyda Lîsteyê")
          : tx(language, "Detay / Not", "Detail / Note", "Hûragahî / Nîşe");
      case "messages":
        return tx(language, "Mesajlar", "Messages", "Peyam");
      case "person":
        return tx(language, "Kişi", "Person", "Kes");
      case "amount":
        return tx(language, "Miktar", "Amount", "Meblağ");
      case "location":
        return kind === "cash"
          ? tx(language, "Kasa Yeri", "Cash Location", "Cihê Qaseyê")
          : tx(language, "Proje / Birim", "Project / Unit", "Proje / Yekîne");
      case "tags":
        return tx(language, "Etiket", "Tag", "Etîket");
      case "action":
        return tx(language, "İşlem", "Action", "Çalakî");
    }
  }
  function columnCellClassName(id: ColumnId): string {
    return id === "amount" ? "amount" : "";
  }
  function renderCell(
    id: ColumnId,
    x: RecordItem,
    ctx: { pendingTransfer?: CashTransfer; canApprove?: boolean },
  ) {
    switch (id) {
      case "date":
        return date(x.date, language);
      case "title":
        return (
          <>
            {readOnly ? (
              <b className="cellTitle" title={localizeData(x.source, language)}>
                {localizeData(x.source, language)}
              </b>
            ) : (
              <button
                type="button"
                className="cellTitle cellTitleButton"
                title={tx(
                  language,
                  "Girilen verileri görmek için tıklayın",
                  "Click to view the entered data",
                  "Ji bo dîtina daneyên hatine nivîsandin bitikîne",
                )}
                onClick={() => onEdit(x)}
              >
                {localizeData(x.source, language)}
              </button>
            )}
            {ctx.pendingTransfer && (
              <small className="subNote pendingBadge">
                ⏳ {tx(language, "Onay Bekliyor", "Awaiting Approval", "Li Benda Erêkirinê")}
              </small>
            )}
          </>
        );
      case "detail":
        return showListColumn ? (
          x.listName ? (
            <button
              type="button"
              className="linkButton"
              onClick={() => openList(x.listName)}
              title={tx(
                language,
                "Bu listeye ait tüm kayıtları göster",
                "Show all records in this list",
                "Hemû qeydên vê lîsteyê nîşan bide",
              )}
            >
              {localizeData(x.listName, language)}
            </button>
          ) : (
            "—"
          )
        ) : (
          <>
            <span className="cellDetailText" title={localizeData(x.detail || x.note, language)}>
              {localizeData(x.detail || x.note, language)}
            </span>
            <small className="subNote" title={x.detail ? localizeData(x.note, language) : undefined}>
              {x.detail && localizeData(x.note, language)}
            </small>
          </>
        );
      case "messages":
        return (
          <button
            type="button"
            className={`messagesCell${commentSummaries[x.id] ? "" : " messagesCellEmpty"}${
              commentSummaries[x.id]?.hasAttention ? " attention" : ""
            }${commentSummaries[x.id]?.hasUnread ? " unread" : ""}`}
            title={commentSummaries[x.id]?.lastText}
            onClick={() => setCommentTarget(x)}
          >
            {commentSummaries[x.id] ? (
              <>
                {commentSummaries[x.id].hasUnread && <span className="commentUnreadDot" title={tx(language, "Okunmadı", "Unread", "Nexwendî")} />}
                {commentSummaries[x.id].hasAttention ? "⚠️" : "💬"}
                <b>{commentSummaries[x.id].lastUserName}:</b>
                <span className="messagesCellText">{commentSummaries[x.id].lastText}</span>
                <span className="messagesCellCount">{commentSummaries[x.id].count}</span>
              </>
            ) : (
              <>💬 {tx(language, "Yorum ekle", "Add a comment", "Şîrove zêde bike")}</>
            )}
          </button>
        );
      case "person":
        return localizeData(x.person, language);
      case "amount":
        return money(x.amount, x.currency);
      case "location":
        return (
          <>
            <span className="cellDetailText" title={localizeData(x.project, language)}>
              {localizeData(x.project, language)}
            </span>
            {x.cashAccount && (
              <small className="subNote" title={localizeData(x.cashAccount, language)}>
                ▣ {localizeData(x.cashAccount, language)}
              </small>
            )}
          </>
        );
      case "tags":
        return (
          <div className="tagRow">
            {(x.tags || []).map((t) => (
              <span key={t}>{localizeData(t, language)}</span>
            ))}
          </div>
        );
      case "action":
        return (
          <>
            {!readOnly && ctx.canApprove && (
              <button
                type="button"
                className="icon approve"
                title={tx(language, "Aktarımı Onayla", "Approve Transfer", "Veguhastinê Erê Bike")}
                disabled={approvingId === ctx.pendingTransfer!.id}
                onClick={() => approveTransfer(ctx.pendingTransfer!.id)}
              >
                ✓
              </button>
            )}
            {!readOnly && (
              <>
                <button className="icon edit" title={tx(language, "Düzenle", "Edit", "Biguherîne")} onClick={() => onEdit(x)}>
                  ✎
                </button>
                <button
                  className="icon delete"
                  title={tx(language, "Sil", "Delete", "Jêbirin")}
                  onClick={() => setDeleteTarget(x)}
                >
                  🗑
                </button>
              </>
            )}
            <span
              className="icon rowDragHandle"
              onMouseDown={(e) => startRowDrag(e, x.id)}
              title={tx(
                language,
                "Satırı sürükleyerek yukarı/aşağı taşı",
                "Drag to move this row up/down",
                "Ji bo derbaskirina jor/jêr rêzê bikişîne",
              )}
            >
              ⠿
            </span>
          </>
        );
    }
  }
  const [commentSummaries, setCommentSummaries] = useState<
    Record<number, { count: number; lastText: string; lastUserName: string; hasAttention: boolean; hasUnread: boolean }>
  >({});
  const [shareTarget, setShareTarget] = useState<CashAccountSummary | null>(null);
  const [shareBusyKey, setShareBusyKey] = useState<string | null>(null);
  const [dashboardShareBusy, setDashboardShareBusy] = useState(false);
  const [approvingId, setApprovingId] = useState<number | null>(null);

  async function approveTransfer(transferId: number) {
    setApprovingId(transferId);
    try {
      const response = await fetch(`/api/cash-transfers/${transferId}/confirm`, { method: "POST" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        alert(body.error || tx(language, "Aktarım onaylanamadı.", "The transfer could not be confirmed.", "Veguhastin nehat erêkirin."));
        return;
      }
      onTransfersChanged();
    } catch {
      alert(tx(language, "Aktarım onaylanamadı.", "The transfer could not be confirmed.", "Veguhastin nehat erêkirin."));
    } finally {
      setApprovingId(null);
    }
  }

  async function toggleShare(userId: number, grant: boolean) {
    if (!shareTarget) return;
    const cashAccountId = shareTarget.id;
    const key = `${cashAccountId}-${userId}`;
    setShareBusyKey(key);
    try {
      const response = grant
        ? await fetch(`/api/cash-accounts/${cashAccountId}/access`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId }),
          })
        : await fetch(`/api/cash-accounts/${cashAccountId}/access?userId=${userId}`, { method: "DELETE" });
      if (!response.ok) {
        alert(tx(language, "İşlem tamamlanamadı.", "The operation could not be completed.", "Kirin nehat qedandin."));
        return;
      }
      // Built from `shareTarget` itself (not the `cashAccounts` prop, which
      // may be scoped to just the active workspace) so this patches the
      // right row in the full list regardless of what's currently filtered.
      const updatedTarget: CashAccountSummary = {
        ...shareTarget,
        sharedWithUserIds: grant
          ? [...shareTarget.sharedWithUserIds, userId]
          : shareTarget.sharedWithUserIds.filter((id) => id !== userId),
      };
      onCashAccountsChange((current) => current.map((a) => (a.id === cashAccountId ? updatedTarget : a)));
      setShareTarget(updatedTarget);
    } catch {
      alert(tx(language, "İşlem tamamlanamadı.", "The operation could not be completed.", "Kirin nehat qedandin."));
    } finally {
      setShareBusyKey(null);
    }
  }

  async function toggleDashboardShare(enabled: boolean) {
    if (!shareTarget) return;
    const cashAccountId = shareTarget.id;
    setDashboardShareBusy(true);
    try {
      const response = await fetch(`/api/cash-accounts/${cashAccountId}/dashboard-share`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      if (!response.ok) {
        alert(tx(language, "İşlem tamamlanamadı.", "The operation could not be completed.", "Kirin nehat qedandin."));
        return;
      }
      const updatedTarget: CashAccountSummary = { ...shareTarget, dashboardShareEnabled: enabled };
      onCashAccountsChange((current) => current.map((a) => (a.id === cashAccountId ? updatedTarget : a)));
      setShareTarget(updatedTarget);
    } catch {
      alert(tx(language, "İşlem tamamlanamadı.", "The operation could not be completed.", "Kirin nehat qedandin."));
    } finally {
      setDashboardShareBusy(false);
    }
  }
  const [source, setSource] = useState("Tümü");
  const [showListColumn, setShowListColumn] = useState(false);
  const [activeList, setActiveList] = useState("");
  const [showAllLists, setShowAllLists] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [filterSource, setFilterSource] = useState("");
  const [filterPerson, setFilterPerson] = useState("");
  const [filterProject, setFilterProject] = useState("");
  const [filterTag, setFilterTag] = useState("");
  const activeFilterCount = [filterFrom, filterTo, filterSource, filterPerson, filterProject, filterTag].filter(Boolean).length;
  const clearFilters = () => {
    setFilterFrom("");
    setFilterTo("");
    setFilterSource("");
    setFilterPerson("");
    setFilterProject("");
    setFilterTag("");
  };
  const filterSourceOptions = [...new Set(records.map((x) => x.source).filter(Boolean))];
  const openList = (name: string) => {
    setSource("Tümü");
    setSearch(name);
    setActiveList(name);
    setShowAllLists(false);
  };
  const openCardRecord = (
    field: "source" | "listName",
    value: string,
    matchKind?: Kind,
  ) => {
    const candidates = records.filter((x) =>
      field === "source"
        ? x.source === value && (!matchKind || x.kind === matchKind)
        : x.listName === value,
    );
    const rec = [...candidates].sort((a, b) => b.date.localeCompare(a.date))[0];
    if (rec) onEdit(rec);
  };
  const groups = useMemo(
    () =>
      [...new Set(records.map((x) => x.source))].map((name) => {
        const directRows = records.filter((x) => x.source === name);
        const linkedIncomeRows =
          kind === "cash"
            ? allRecords.filter((x) => x.kind === "income" && x.cashAccount === name)
            : [];
        const linkedExpenseRows =
          kind === "cash"
            ? allRecords.filter((x) => x.kind === "expense" && x.cashAccount === name)
            : [];
        const directAmount = total(directRows);
        const linkedIncome = total(linkedIncomeRows);
        const linkedExpense = total(linkedExpenseRows);
        return {
          name,
          kind: records.find((x) => x.source === name)?.kind ?? kind,
          count: directRows.length + linkedIncomeRows.length + linkedExpenseRows.length,
          totalIn: directAmount + linkedIncome,
          totalOut: linkedExpense,
          total: directAmount + linkedIncome - linkedExpense,
          totalInByCurrency: combineByCurrency([{ rows: directRows }, { rows: linkedIncomeRows }]),
          totalOutByCurrency: combineByCurrency([{ rows: linkedExpenseRows }]),
          totalByCurrency: combineByCurrency([
            { rows: directRows },
            { rows: linkedIncomeRows },
            { rows: linkedExpenseRows, sign: -1 },
          ]),
        };
      }),
    [records, allRecords, kind],
  );
  // Kart satırı flex-wrap olduğu için genişlik yeterliyse zaten hepsi
  // görünür — önceden ilk 4'ten sonrasını "Diğer Kasalar" açılır menüsünde
  // gizliyorduk, ekran dar olmasa bile. Artık tüm kartlar render ediliyor;
  // dar ekranda tarayıcı bunları kendiliğinden alt satıra sarar.
  const renderGroupTooltip = (g: (typeof groups)[number], matchingAccount: CashAccountSummary | undefined) => (
    <div className="groupCardTooltip">
      {g.kind === "cash" ? (
        <>
          <div>
            <small>{tx(language, "Kasa Oluşturucu", "Kasa Owner", "Vekera Qaseyê")}</small>
            <strong>{matchingAccount?.ownerName || tx(language, "Belirtilmedi", "Unassigned", "Nehatiye diyarkirin")}</strong>
          </div>
          <div>
            <small>{tx(language, "Toplam Kasa", "Total In", "Giştî")}</small>
            <strong>{moneyBreakdown(g.totalInByCurrency)}</strong>
          </div>
          <div>
            <small>{tx(language, "Gider", "Expense", "Mesref")}</small>
            <strong className="negative">{moneyBreakdown(g.totalOutByCurrency)}</strong>
          </div>
          <div>
            <small>{tx(language, "Sonuç", "Result", "Encam")}</small>
            <strong>{moneyBreakdown(g.totalByCurrency)}</strong>
          </div>
        </>
      ) : (
        <>
          <div>
            <small>
              {g.kind === "income"
                ? tx(language, "Toplam Gelir", "Total Income", "Dahata Giştî")
                : tx(language, "Toplam Gider", "Total Expense", "Mesrefa Giştî")}
            </small>
            <strong className={g.kind === "expense" ? "negative" : ""}>
              {moneyBreakdown(g.totalByCurrency)}
            </strong>
          </div>
          <div>
            <small>{tx(language, "Kayıt Sayısı", "Record Count", "Hejmara Qeydan")}</small>
            <strong>{g.count}</strong>
          </div>
        </>
      )}
    </div>
  );
  // Overall pill total, computed per currency directly from the record
  // arrays (not by summing groups' already-blended totals) so mixed
  // currencies show as separate amounts instead of one wrong number.
  const overallByCurrency = useMemo(
    () =>
      combineByCurrency([
        { rows: records },
        { rows: kind === "cash" ? allRecords.filter((x) => x.kind === "income" && x.cashAccount) : [] },
        { rows: kind === "cash" ? allRecords.filter((x) => x.kind === "expense" && x.cashAccount) : [], sign: -1 },
      ]),
    [records, allRecords, kind],
  );
  const listedRecords = records.filter((x) => x.listName);
  const listGroups = useMemo(
    () =>
      [...new Set(records.map((x) => x.listName).filter(Boolean))].map(
        (name) => {
          const directRows = records.filter((x) => x.listName === name);
          const linkedIncomeRows =
            kind === "cash"
              ? allRecords.filter((x) => x.kind === "income" && x.listName === name)
              : [];
          const linkedExpenseRows =
            kind === "cash"
              ? allRecords.filter((x) => x.kind === "expense" && x.listName === name)
              : [];
          const directAmount = total(directRows);
          const linkedIncome = total(linkedIncomeRows);
          const linkedExpense = total(linkedExpenseRows);
          return {
            name,
            count: records.filter((x) => x.listName === name).length,
            totalIn: directAmount + linkedIncome,
            totalOut: linkedExpense,
            total: directAmount + linkedIncome - linkedExpense,
            totalInByCurrency: combineByCurrency([{ rows: directRows }, { rows: linkedIncomeRows }]),
            totalOutByCurrency: combineByCurrency([{ rows: linkedExpenseRows }]),
            totalByCurrency: combineByCurrency([
              { rows: directRows },
              { rows: linkedIncomeRows },
              { rows: linkedExpenseRows, sign: -1 },
            ]),
          };
        },
      ),
    [records, allRecords, kind],
  );
  const overallListByCurrency = useMemo(
    () =>
      combineByCurrency([
        { rows: listedRecords },
        { rows: kind === "cash" ? allRecords.filter((x) => x.kind === "income" && x.listName) : [] },
        { rows: kind === "cash" ? allRecords.filter((x) => x.kind === "expense" && x.listName) : [], sign: -1 },
      ]),
    [listedRecords, allRecords, kind],
  );
  // Belirli bir kasa seçildiğinde (source !== "Tümü"), o kasanın kart
  // toplamına dahil edilen ama `records`'ta (sadece kind="cash" satırları)
  // bulunmayan bağlı gelir/gider kayıtlarını da listeye kat — aksi halde
  // "Toplam Kasa" tutarı bu kayıtları sayar ama liste onları hiç göstermez
  // (bildirilen hata tam olarak buydu).
  const linkedRowsForSelectedKasa =
    kind === "cash" && source !== "Tümü"
      ? allRecords.filter((x) => (x.kind === "income" || x.kind === "expense") && x.cashAccount === source)
      : [];
  const rows = [...records, ...linkedRowsForSelectedKasa].filter(
    (x) =>
      (source === "Tümü" || x.source === source || x.cashAccount === source) &&
      (!showAllLists || x.listName) &&
      (!filterFrom || x.date >= filterFrom) &&
      (!filterTo || x.date <= filterTo) &&
      (!filterSource || x.source === filterSource) &&
      (!filterPerson || x.person.toLowerCase().includes(filterPerson.toLowerCase())) &&
      (!filterProject || x.project.toLowerCase().includes(filterProject.toLowerCase())) &&
      (!filterTag || x.tags.some((t) => t.toLowerCase().includes(filterTag.toLowerCase()))) &&
      JSON.stringify(x).toLowerCase().includes(search.toLowerCase()),
  );
  const sortedRows = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      switch (sortMode) {
        case "dateAsc":
          return a.date.localeCompare(b.date) || a.id - b.id;
        case "addedAsc":
          return a.id - b.id;
        case "addedDesc":
          return b.id - a.id;
        case "dateDesc":
        default:
          return b.date.localeCompare(a.date) || b.id - a.id;
      }
    });
    return copy;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sortMode]);
  const orderedRows = useMemo(() => {
    if (!rowOrder.length) return sortedRows;
    const index = new Map(rowOrder.map((id, i) => [id, i]));
    return [...sortedRows].sort((a, b) => {
      const ai = index.has(a.id) ? index.get(a.id)! : Number.MAX_SAFE_INTEGER;
      const bi = index.has(b.id) ? index.get(b.id)! : Number.MAX_SAFE_INTEGER;
      return ai - bi;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedRows, rowOrder]);
  // Satır sürükleme — native HTML5 drag-and-drop (draggable + onDragStart/
  // onDrop) tablo satırlarında (<tr>) tarayıcılar arasında güvenilir çalışmadığı
  // için (sürükleme hiç başlamayabiliyor), fare olaylarıyla elle takip edilen
  // aynı yöntem kullanılıyor — bkz. shared.tsx'teki useDraggableModals.
  function startRowDrag(e: ReactMouseEvent, id: number) {
    e.preventDefault();
    setDraggedRowId(id);
    document.body.classList.add("noSelectDragging");
    function onMove(ev: MouseEvent) {
      const el = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null;
      const rowEl = el?.closest("tr[data-row-id]") as HTMLElement | null;
      setDragOverRowId(rowEl ? Number(rowEl.dataset.rowId) : null);
    }
    function onUp(ev: MouseEvent) {
      const el = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null;
      const rowEl = el?.closest("tr[data-row-id]") as HTMLElement | null;
      const targetId = rowEl ? Number(rowEl.dataset.rowId) : null;
      if (targetId !== null) moveRow(id, targetId);
      setDraggedRowId(null);
      setDragOverRowId(null);
      document.body.classList.remove("noSelectDragging");
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }
  function moveRow(draggedId: number, targetId: number) {
    if (draggedId === targetId) return;
    const currentIds = orderedRows.map((r) => r.id);
    const from = currentIds.indexOf(draggedId);
    const to = currentIds.indexOf(targetId);
    if (from === -1 || to === -1) return;
    const next = [...currentIds];
    next.splice(from, 1);
    next.splice(to, 0, draggedId);
    persistRowOrder(next);
  }
  const latestRows = [...records]
    .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)
    .slice(0, 5);
  const rowIdsKey = rows.map((x) => x.id).join(",");
  async function refreshCommentSummaries() {
    if (!rowIdsKey) {
      setCommentSummaries({});
      return;
    }
    try {
      const response = await fetch(`/api/comments/summary?ids=${rowIdsKey}`);
      const data = await response.json().catch(() => ({}));
      setCommentSummaries(response.ok ? (data.summaries ?? {}) : {});
    } catch {
      setCommentSummaries({});
    }
  }
  // Powers the 💬 icon's hover preview (only shown once a record has ≥1
  // comment) — refetched whenever the visible row set changes, and again
  // right after the comment modal closes so a just-added comment shows up.
  useEffect(() => {
    refreshCommentSummaries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowIdsKey]);
  const title =
    kind === "cash"
      ? tx(language, "Kasalar", "Cash Accounts", "Qasayên Pere")
      : kind === "income"
        ? tx(language, "Gelirler", "Income", "Dahat")
        : tx(language, "Giderler", "Expenses", "Mesref");
  const recordWord = tx(language, "kayıt", "records", "qeyd");
  async function exportExcel() {
    const columns = [
      tx(language, "Tarih", "Date", "Tarîx"),
      kind === "cash"
        ? tx(language, "Kasa Adı", "Cash Account", "Navê Qaseyê")
        : tx(language, "Ana Başlık", "Category", "Sernav"),
      tx(language, "Detay", "Detail", "Hûragahî"),
      tx(language, "Not", "Note", "Nîşe"),
      tx(language, "Kişi", "Person", "Kes"),
      tx(language, "Miktar", "Amount", "Meblağ"),
      tx(language, "Para Birimi", "Currency", "Yekeya Pere"),
      tx(language, "Proje / Birim", "Project / Unit", "Proje / Yekîne"),
      tx(language, "Etiketler", "Tags", "Etîket"),
    ];
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Kayitlar");
    sheet.addRow(columns);
    for (const x of orderedRows) {
      sheet.addRow([
        date(x.date),
        x.source,
        x.detail,
        x.note,
        x.person,
        x.amount,
        x.currency,
        x.project,
        x.tags.join(", "),
      ]);
    }
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const safeName = (source === "Tümü" ? title : source).replace(/[\\/:*?"<>|]/g, "-");
    link.href = url;
    link.download = `${safeName}-${new Date().toISOString().slice(0, 10)}.xlsx`;
    link.click();
    URL.revokeObjectURL(url);
  }
  async function importExcel(file?: File) {
    if (!file) return;
    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(await file.arrayBuffer());
      const sheet = workbook.worksheets[0];
      if (!sheet) throw new Error();
      const headerRow = sheet.getRow(1);
      const headers: string[] = [];
      headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        headers[colNumber] = String(cell.value ?? "").trim();
      });
      const raw: { rowNumber: number; row: Record<string, unknown> }[] = [];
      sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const record: Record<string, unknown> = {};
        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          const header = headers[colNumber];
          if (!header) return;
          const value = cell.value;
          record[header] = value && typeof value === "object" && "text" in (value as object)
            ? (value as { text: string }).text
            : value ?? "";
        });
        raw.push({ rowNumber, row: record });
      });
      const invalidDateRows: number[] = [];
      const imported = raw
        .map(({ rowNumber, row }): (Omit<RecordItem, "id"> & { rowNumber: number }) | null => {
          const values = Object.values(row);
          const get = (...names: string[]) => {
            for (const name of names)
              if (row[name] !== undefined && row[name] !== "") return row[name];
            return "";
          };
          const excelDate = get("Tarih", "Date", "Tarîx");
          // Import is the one place a bad date shouldn't silently become
          // "today" — that would misfile a transaction under the wrong day
          // without anyone noticing. Reject the row instead.
          const parsedDate = parseImportDate(excelDate || values[0]);
          if (!parsedDate) {
            invalidDateRows.push(rowNumber);
            return null;
          }
          const resolvedSource =
            source !== "Tümü"
              ? source
              : String(
                  get(
                    "Kasa Adı",
                    "Cash Account",
                    "Navê Qaseyê",
                    "Ana Başlık",
                    "Category",
                    "Sernav",
                  ) ||
                    values[1] ||
                    "Excel Aktarımı",
                );
          return {
            rowNumber,
            kind,
            date: parsedDate,
            source: resolvedSource,
            detail: String(
              get("Detay", "Detail", "Hûragahî") || values[2] || "",
            ),
            note: String(get("Not", "Note", "Nîşe") || ""),
            person: String(get("Kişi", "Person", "Kes") || ""),
            amount: Number(get("Miktar", "Amount", "Meblağ") || 0),
            currency: String(
              get("Para Birimi", "Currency", "Yekeya Pere") || "USD",
            ),
            project: String(
              get("Proje / Birim", "Project / Unit", "Proje / Yekîne") || "",
            ),
            tags: String(get("Etiketler", "Tags", "Etîket") || "")
              .split(",")
              .map((x) => x.trim())
              .filter(Boolean),
            cashAccount: kind === "cash" ? "" : resolvedSource,
            listName: "",
          };
        })
        .filter((x): x is Omit<RecordItem, "id"> & { rowNumber: number } => x !== null && Boolean(x.source) && Number.isFinite(x.amount))
        .map(({ rowNumber: _rowNumber, ...record }) => record);
      if (!imported.length && !invalidDateRows.length) throw new Error();

      const duplicateCount = imported.filter((x) =>
        records.some((existing) => existing.date === x.date && existing.amount === x.amount && existing.currency === x.currency && existing.source === x.source),
      ).length;
      if (duplicateCount > 0) {
        const proceed = window.confirm(
          tx(
            language,
            `İçe aktarılacak ${imported.length} kayıttan ${duplicateCount} tanesi mevcut kayıtlarla aynı tarih, tutar ve başlığa sahip. Yine de içe aktarmak istiyor musunuz?`,
            `${duplicateCount} of the ${imported.length} rows to import match an existing record's date, amount and title. Import anyway?`,
            `${duplicateCount} ji ${imported.length} rêzên ku dê werin têxistin, bi heman tarîx, meblağ û sernavê qeydek heyî re li hev in. Dîsa jî têxistin?`,
          ),
        );
        if (!proceed) return;
      }

      if (imported.length) onImport(imported);
      const skippedNote = invalidDateRows.length
        ? tx(
            language,
            ` (${invalidDateRows.length} satır geçersiz tarih nedeniyle atlandı: satır ${invalidDateRows.join(", ")})`,
            ` (${invalidDateRows.length} row(s) skipped for invalid dates: row ${invalidDateRows.join(", ")})`,
            ` (${invalidDateRows.length} rêz ji ber tarîxa nederbasdar hatin derbasqilkirin: rêz ${invalidDateRows.join(", ")})`,
          )
        : "";
      alert(
        tx(
          language,
          `${imported.length} kayıt Excel'den eklendi.${skippedNote}`,
          `${imported.length} records imported from Excel.${skippedNote}`,
          `${imported.length} qeyd ji Excelê hatin têxistin.${skippedNote}`,
        ),
      );
    } catch {
      alert(
        tx(
          language,
          "Excel dosyası okunamadı. Lütfen ilk satırda sütun başlıkları bulunan .xlsx dosyası seçin.",
          "The Excel file could not be read. Choose an .xlsx file with column headers in the first row.",
          "Pelê Excelê nehat xwendin. Pelek .xlsx ku di rêza yekem de sernavên stûnan heye hilbijêre.",
        ),
      );
    }
  }
  // Tek bir kolgroup/thead/tbody bloğu üretir — sütun sırası/genişliği ve
  // satır sürükleme tüm tablolarda aynı davransın diye Kasa detayındaki
  // Gelir/Gider ayrımında da (bkz. aşağıdaki kasaResultSplit) bu fonksiyon
  // yeniden kullanılıyor, tek bir birleşik tabloda da.
  function renderRecordsTable(tableRows: RecordItem[]) {
    return (
      <div className="recordsTable resizableTable">
        <table>
          <colgroup>
            {columnOrder.map((id) => (
              <col key={id} style={{ width: columnWidths[id] }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {columnOrder.map((id) => (
                <th
                  key={id}
                  className={draggedColumn === id ? "colDragging" : ""}
                  draggable
                  onDragStart={(e) => {
                    setDraggedColumn(id);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragOver={(e) => {
                    if (draggedColumn !== null) e.preventDefault();
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (draggedColumn !== null) reorderColumn(draggedColumn, id);
                    setDraggedColumn(null);
                  }}
                  onDragEnd={() => setDraggedColumn(null)}
                  title={tx(
                    language,
                    "Sürükleyerek sütunu taşı, kenarından tutup genişliğini ayarla",
                    "Drag to move this column, drag its edge to resize",
                    "Ji bo derbaskirina stûnê bikişîne, ji kêleka wê genîtiyê saz bike",
                  )}
                >
                  <span className="colHeaderLabel">{columnLabel(id)}</span>
                  <span
                    className="colResizeHandle"
                    draggable={false}
                    onMouseDown={(e) => startResize(e, id)}
                    onClick={(e) => e.stopPropagation()}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tableRows.length === 0 && (
              <tr>
                <td colSpan={columnOrder.length} className="empty">
                  {tx(language, "Bu grupta kayıt yok.", "No records in this group.", "Di vê komê de qeyd tune.")}
                </td>
              </tr>
            )}
            {tableRows.map((x) => {
              const pendingTransfer =
                kind !== "cash" ? cashTransfers.find((t) => t.toRecordId === x.id && t.status === "pending") : undefined;
              const canApprove = pendingTransfer && cashAccounts.some((a) => a.id === pendingTransfer.toCashAccountId);
              return (
                <tr
                  key={x.id}
                  data-row-id={x.id}
                  className={`${pendingTransfer ? "pendingTransferRow" : ""}${draggedRowId === x.id ? " rowDragging" : ""}${dragOverRowId === x.id && draggedRowId !== null && draggedRowId !== x.id ? " rowDragOver" : ""}`}
                >
                  {columnOrder.map((id) => (
                    <td key={id} className={columnCellClassName(id)}>
                      {renderCell(id, x, { pendingTransfer, canApprove })}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }
  // Bir kasa seçildiğinde (source !== "Tümü"), Gelir ve Gider kayıtları aynı
  // tabloda karışık görünmesin diye iki ayrı kutuya bölünür — kullanıcı
  // hangisinin gelir hangisinin gider olduğunu tabloya bakmadan, kutunun
  // rengi ve başlığından anlar. "Tümü" görünümünde ve Gelir/Gider
  // sayfalarında (kind !== "cash") tek, birleşik tablo olarak kalır.
  const kasaSplitActive = kind === "cash" && source !== "Tümü";
  const selectedKasaGroup = kasaSplitActive ? groups.find((g) => g.name === source) : undefined;
  const kasaIncomeRows = kasaSplitActive ? orderedRows.filter((x) => x.kind !== "expense") : [];
  const kasaExpenseRows = kasaSplitActive ? orderedRows.filter((x) => x.kind === "expense") : [];
  // Gelir/Gider sayfalarındaki "En Son Gelirler/Giderler" panosuyla aynı
  // düzen — kasa seçiliyken de sağda bu kasanın en son 5 hareketi (gelir +
  // gider karışık) görünsün diye, kullanıcının elle sıraladığı orderedRows
  // yerine `rows`'tan bağımsızca en güncel tarihe göre hesaplanır.
  const kasaLatestRows = kasaSplitActive
    ? [...rows].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id).slice(0, 5)
    : [];
  return (
    <div className="panel">
      <div className="toolbar">
        <Title
          title={title}
          inline
          sub={
            kind === "cash"
              ? tx(
                  language,
                  "Kasa kartını seçerek o kasanın hareketlerini görün",
                  "Select a cash account card to view its transactions",
                  "Kartê qaseyê hilbijêre û tevgerên wê bibîne",
                )
              : tx(
                  language,
                  "Ana başlığı seçerek farklı tarihlerdeki hareketleri görün",
                  "Select a main category to view transactions on different dates",
                  "Sernavê sereke hilbijêre û tevgerên tarîxên cuda bibîne",
                )
          }
        />
        <div>
          {!readOnly && (
            <label className="light fileButton">
              ⇧ {tx(language, "Excel Ekle", "Import Excel", "Excel Têxe")}
              <input
                hidden
                type="file"
                accept=".xlsx"
                onChange={(e) => {
                  importExcel(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </label>
          )}
          <button className="light" onClick={exportExcel}>
            ⇩ {tx(language, "Excel'e Çıkar", "Export to Excel", "Derxe Excelê")}
          </button>
          {kasaSplitActive && (
            <button className="light" onClick={() => setKasaResultOpen(true)}>
              📊 {tx(language, "Sonuç Oluştur", "Create Result", "Encamê Biafirîne")}
            </button>
          )}
          {!readOnly && (
            <button className="primary" onClick={onAdd}>
              ＋ {tx(language, "Yeni Kayıt", "New Record", "Qeyda Nû")}
            </button>
          )}
        </div>
      </div>
      {readOnly && (
        <div className="readOnlyBanner">
          👁 {tx(
            language,
            "Bu, başka bir kullanıcının paylaştığı verilerdir — yalnızca görüntüleyebilirsiniz.",
            "This is another user's shared data — you can only view it.",
            "Ev daneyên bikarhênerek din in ku hatine parvekirin — hûn tenê dikarin bibînin.",
          )}
        </div>
      )}
      <div className="groups">
        <button
          className={source === "Tümü" && !showAllLists ? "selected" : ""}
          onClick={() => {
            setSource("Tümü");
            setShowAllLists(false);
          }}
        >
          <b>
            {kind === "cash"
              ? tx(language, "Tüm Kasalar", "All Cash Accounts", "Hemû Qase")
              : kind === "income"
                ? tx(language, "Tüm Gelirler", "All Income", "Hemû Dahat")
                : tx(language, "Tüm Giderler", "All Expenses", "Hemû Mesref")}
          </b>
          <small>
            {records.length} {recordWord}
          </small>
          <strong>
            {moneyBreakdown(overallByCurrency)}
          </strong>
        </button>
        {groups.map((g) => {
          const matchingAccount = g.kind === "cash" ? cashAccounts.find((a) => a.name === g.name) : undefined;
          return (
          <div className="groupCard" key={g.name}>
            <button
              className={source === g.name && !showAllLists ? "selected" : ""}
              onClick={() => {
                setSource(g.name);
                setShowAllLists(false);
              }}
            >
              <b>{localizeData(g.name, language)}</b>
              <small>
                {g.count}{" "}
                {tx(
                  language,
                  "tarihli kayıt",
                  "dated records",
                  "qeydên bi tarîx",
                )}
              </small>
              <strong>{moneyBreakdown(g.totalByCurrency)}</strong>
            </button>
            {!readOnly && source === g.name && (
              <button
                className="cashEditIcon"
                title={tx(language, "Kaydı Düzenle", "Edit Record", "Qeydê Biguherîne")}
                aria-label={tx(language, "Kaydı Düzenle", "Edit Record", "Qeydê Biguherîne")}
                onClick={() => openCardRecord("source", g.name, g.kind)}
              >
                🗂
              </button>
            )}
            {source === g.name &&
              kind === "cash" &&
              matchingAccount && (
                // Shown even while readOnly (browsing a shared owner's workspace):
                // matchingAccount only ever exists here because the server already
                // scoped `cashAccounts` to kasas this user can see (owned or shared)
                // — anyone with visibility into a kasa may manage its sharing, not
                // just its owner (see canManageCashAccountAccess). readOnly still
                // blocks editing records themselves, just not who can see them.
                <button
                  className="cashEditIcon"
                  title={tx(language, "Kasayı Paylaş", "Share Kasa", "Qaseyê Parve Bike")}
                  aria-label={tx(language, "Kasayı Paylaş", "Share Kasa", "Qaseyê Parve Bike")}
                  onClick={() => setShareTarget(matchingAccount)}
                >
                  🔗
                </button>
              )}
            {renderGroupTooltip(g, matchingAccount)}
          </div>
          );
        })}
      </div>
      {listGroups.length > 0 && (
        <div className="groups listGroups">
          <button
            className={showAllLists ? "selected" : ""}
            onClick={() => {
              setSource("Tümü");
              setSearch("");
              setActiveList("");
              setShowAllLists(true);
            }}
          >
            <b>
              {kind === "cash"
                ? tx(language, "Tüm Liste Kasaları", "All List Accounts", "Hemû Qaseyên Lîsteyê")
                : kind === "income"
                  ? tx(language, "Tüm Liste Gelirleri", "All List Income", "Hemû Dahatên Lîsteyê")
                  : tx(language, "Tüm Liste Giderleri", "All List Expenses", "Hemû Mesrefên Lîsteyê")}
            </b>
            <small>
              {listedRecords.length} {recordWord}
            </small>
            <strong>
              {moneyBreakdown(overallListByCurrency)}
            </strong>
          </button>
          {listGroups.map((g) => (
            <div className="groupCard" key={g.name}>
              <button
                className={activeList === g.name ? "selected" : ""}
                onClick={() => openList(g.name)}
              >
                <b>{localizeData(g.name, language)}</b>
                <small>
                  {g.count} {tx(language, "kayıt", "records", "qeyd")}
                </small>
                <strong>{moneyBreakdown(g.totalByCurrency)}</strong>
              </button>
              {!readOnly && activeList === g.name && (
                <button
                  className="cashEditIcon"
                  title={tx(language, "Kaydı Düzenle", "Edit Record", "Qeydê Biguherîne")}
                  aria-label={tx(language, "Kaydı Düzenle", "Edit Record", "Qeydê Biguherîne")}
                  onClick={() => openCardRecord("listName", g.name)}
                >
                  🗂
                </button>
              )}
              {kind === "cash" && (
                <div className="groupCardTooltip">
                  <div>
                    <small>{tx(language, "Toplam Kasa", "Total In", "Giştî")}</small>
                    <strong>{moneyBreakdown(g.totalInByCurrency)}</strong>
                  </div>
                  <div>
                    <small>{tx(language, "Gider", "Expense", "Mesref")}</small>
                    <strong className="negative">{moneyBreakdown(g.totalOutByCurrency)}</strong>
                  </div>
                  <div>
                    <small>{tx(language, "Sonuç", "Result", "Encam")}</small>
                    <strong>{moneyBreakdown(g.totalByCurrency)}</strong>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="search">
        <span>⌕</span>
        <button
          type="button"
          className="light compact"
          onClick={() => setShowListColumn((v) => !v)}
        >
          {showListColumn
            ? tx(language, "Detay / Not Göster", "Show Detail / Note", "Hûragahî / Nîşe Nîşan Bide")
            : tx(language, "Liste Kaydı Göster", "Show List Record", "Qeyda Lîsteyê Nîşan Bide")}
        </button>
        {kind === "cash" && (
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setActiveList("");
            }}
            placeholder={tx(
              language,
              "Kayıtlarda ara…",
              "Search records…",
              "Di qeydan de bigere…",
            )}
          />
        )}
        <button
          type="button"
          className={`light compact${activeFilterCount ? " filterActive" : ""}`}
          onClick={() => setFiltersOpen((v) => !v)}
        >
          ▤ {tx(language, "Filtrele", "Filter", "Parzûn")}
          {activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
        </button>
        <label className="sortSelect">
          <span>⇅</span>
          <select value={sortMode} onChange={(e) => changeSortMode(e.target.value as typeof sortMode)}>
            <option value="dateDesc">{tx(language, "Tarihe Göre (Yeni → Eski)", "By Date (Newest First)", "Li gorî Tarîxê (Ji Nû Ve Dawî)")}</option>
            <option value="dateAsc">{tx(language, "Tarihe Göre (Eski → Yeni)", "By Date (Oldest First)", "Li gorî Tarîxê (Ji Kevn Ve Nû)")}</option>
            <option value="addedDesc">{tx(language, "Son Eklenen (Yeni → Eski)", "Recently Added (Newest First)", "Ya Herî Dawî Hatiye Zêdekirin (Nû → Kevn)")}</option>
            <option value="addedAsc">{tx(language, "Son Eklenen (Eski → Yeni)", "Recently Added (Oldest First)", "Ya Herî Dawî Hatiye Zêdekirin (Kevn → Nû)")}</option>
          </select>
        </label>
        <small>
          {rows.length} {recordWord}
        </small>
      </div>
      {filtersOpen && (
        <div className="filterPanel">
          <label>
            {tx(language, "Başlangıç Tarihi", "From Date", "Ji Tarîxê")}
            <input type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} />
          </label>
          <label>
            {tx(language, "Bitiş Tarihi", "To Date", "Heta Tarîxê")}
            <input type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} />
          </label>
          <label>
            {tx(language, "Ana Başlık", "Main Category", "Sernavê Sereke")}
            <select value={filterSource} onChange={(e) => setFilterSource(e.target.value)}>
              <option value="">{tx(language, "Tümü", "All", "Hemû")}</option>
              {filterSourceOptions.map((name) => (
                <option key={name} value={name}>
                  {localizeData(name, language)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {tx(language, "Kişi", "Person", "Kes")}
            <input value={filterPerson} onChange={(e) => setFilterPerson(e.target.value)} />
          </label>
          <label>
            {tx(language, "Proje / Birim", "Project / Unit", "Proje / Yekîne")}
            <input value={filterProject} onChange={(e) => setFilterProject(e.target.value)} />
          </label>
          <label>
            {tx(language, "Etiket", "Tag", "Etîket")}
            <input value={filterTag} onChange={(e) => setFilterTag(e.target.value)} />
          </label>
          <button type="button" className="light" onClick={clearFilters} disabled={!activeFilterCount}>
            {tx(language, "Filtreleri Temizle", "Clear Filters", "Parzûnan Paqij Bike")}
          </button>
        </div>
      )}
      <div className={kind === "cash" && !kasaSplitActive ? "" : "recordsGrid"}>
        {kasaSplitActive ? (
          <div className="kasaResultSplit">
            <div className="kasaResultGroup kasaResultIncome">
              <div className="kasaResultGroupHead">
                <span>↗</span>
                <div>
                  <h3>
                    {tx(language, "Gelirler", "Income", "Dahat")}
                    <strong className="positive">
                      {selectedKasaGroup ? moneyBreakdown(selectedKasaGroup.totalInByCurrency) : money(0)}
                    </strong>
                  </h3>
                  <small>
                    {kasaIncomeRows.length} {recordWord}
                  </small>
                </div>
              </div>
              {renderRecordsTable(kasaIncomeRows)}
            </div>
            <div className="kasaResultGroup kasaResultExpense">
              <div className="kasaResultGroupHead">
                <span>↘</span>
                <div>
                  <h3>
                    {tx(language, "Giderler", "Expenses", "Mesref")}
                    <strong className="negative">
                      {selectedKasaGroup ? moneyBreakdown(selectedKasaGroup.totalOutByCurrency) : money(0)}
                    </strong>
                  </h3>
                  <small>
                    {kasaExpenseRows.length} {recordWord}
                  </small>
                </div>
              </div>
              {renderRecordsTable(kasaExpenseRows)}
            </div>
          </div>
        ) : (
          renderRecordsTable(orderedRows)
        )}
        {(kind !== "cash" || kasaSplitActive) && (
          <aside className={`latestRecords ${kasaSplitActive ? "cash" : kind}`}>
            <div className="latestHead">
              <span>{kasaSplitActive ? "⇄" : kind === "income" ? "↗" : "↘"}</span>
              <div>
                <h3>
                  {kasaSplitActive
                    ? tx(language, "Son Hareketler", "Latest Activity", "Çalakiyên Dawî")
                    : kind === "income"
                      ? tx(language, "En Son Gelirler", "Latest Income", "Dahatên Dawî")
                      : tx(language, "En Son Giderler", "Latest Expenses", "Mesrefên Dawî")}
                </h3>
                <small>
                  {tx(language, "Son eklenen 5 kayıt", "5 most recent records", "5 qeydên herî dawî")}
                </small>
              </div>
            </div>
            <div className="latestList">
              {(kasaSplitActive ? kasaLatestRows : latestRows).map((x) => (
                <article key={x.id} className={x.kind === "expense" ? "expense" : ""}>
                  <i />
                  <span>
                    <b>{localizeData(x.source, language)}</b>
                    <small>{date(x.date, language)} · {localizeData(x.person, language)}</small>
                  </span>
                  <strong>{x.kind === "expense" ? "−" : "+"}{money(x.amount, x.currency)}</strong>
                </article>
              ))}
            </div>
          </aside>
        )}
      </div>
      {deleteTarget && (
        <DeleteConfirmModal
          language={language}
          itemLabel={`${localizeData(deleteTarget.source, language)} · ${money(deleteTarget.amount, deleteTarget.currency)}`}
          checkPassword={checkPassword}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => {
            onDelete(deleteTarget);
            setDeleteTarget(null);
          }}
        />
      )}
      {shareTarget && (
        <ShareKasaModal
          language={language}
          account={shareTarget}
          users={users}
          busyKey={shareBusyKey}
          onToggle={toggleShare}
          onToggleDashboardShare={toggleDashboardShare}
          dashboardShareBusy={dashboardShareBusy}
          onClose={() => setShareTarget(null)}
        />
      )}
      {commentTarget && (
        <RecordCommentsModal
          language={language}
          record={commentTarget}
          onRead={onCommentsRead}
          onClose={() => {
            setCommentTarget(null);
            refreshCommentSummaries();
          }}
        />
      )}
      {kasaResultOpen && kasaSplitActive && (
        <KasaResultModal
          language={language}
          initialKasaName={source}
          kasaOptions={groups.map((g) => g.name)}
          records={records}
          allRecords={allRecords}
          onClose={() => setKasaResultOpen(false)}
        />
      )}
    </div>
  );
}

// "Sonuç Oluştur" ile açılan kasa özet raporu — bir kasanın Gelir/Gider
// dökümünü ve toplam sonucunu tek pencerede gösterir, Excel'e aktarılabilir.
// Sayfadaki Gelir/Gider kutularıyla aynı renk dilini kullanır (yeşil/
// turuncu) ama kendi başlık/ölçek hiyerarşisiyle bir "rapor" hissi verir.
type KasaReportData = {
  name: string;
  incomeRows: RecordItem[];
  expenseRows: RecordItem[];
  totalInByCurrency: Record<string, number>;
  totalOutByCurrency: Record<string, number>;
  totalByCurrency: Record<string, number>;
  totalInAmount: number;
  totalOutAmount: number;
};

function computeKasaReportData(name: string, records: RecordItem[], allRecords: RecordItem[]): KasaReportData {
  const directRows = records.filter((x) => x.source === name);
  const linkedIncomeRows = allRecords.filter((x) => x.kind === "income" && x.cashAccount === name);
  const linkedExpenseRows = allRecords.filter((x) => x.kind === "expense" && x.cashAccount === name);
  const incomeRows = [...directRows, ...linkedIncomeRows].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  const expenseRows = [...linkedExpenseRows].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  return {
    name,
    incomeRows,
    expenseRows,
    totalInByCurrency: combineByCurrency([{ rows: directRows }, { rows: linkedIncomeRows }]),
    totalOutByCurrency: combineByCurrency([{ rows: linkedExpenseRows }]),
    totalByCurrency: combineByCurrency([{ rows: directRows }, { rows: linkedIncomeRows }, { rows: linkedExpenseRows, sign: -1 }]),
    totalInAmount: total(directRows) + total(linkedIncomeRows),
    totalOutAmount: total(linkedExpenseRows),
  };
}

// Sayfadaki "Gelir – Gider Analizi" (bkz. Dashboard.tsx) ile aynı .bars
// görsel dilini burada da kullanıyor — ayrı bir bileşen olarak dışa
// aktarılmadığı için küçük bir kopyası; renk/şekil ana sistemle bire bir
// aynı kalsın diye.
function KasaReportBar({ label, value, max, expense }: { label: string; value: number; max: number; expense?: boolean }) {
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
        />
      </i>
    </div>
  );
}

// "Sonuç Oluştur" ile açılan kasa özet raporu — bir veya birden çok
// kasanın Gelir/Gider dökümünü, mini bir analiz çizelgesini ve toplam
// sonucunu tek pencerede gösterir, Excel'e aktarılabilir. Sayfadaki
// Gelir/Gider kutularıyla aynı renk dilini kullanır (yeşil/turuncu/teal).
function mergeCurrencyMaps(maps: Record<string, number>[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of maps) for (const [c, v] of Object.entries(m)) out[c] = (out[c] ?? 0) + v;
  return out;
}

// Sonuç Oluştur penceresine 2., 3. kasa eklendiğinde ayrı ayrı değil,
// seçilmiş ilk kasanın sonucuyla BİRLEŞTİRİLEREK tek bir Gelir/Gider/Sonuç
// hâline getirilir — ayrı ayrı görmek isteyen kullanıcı zaten pencereyi
// her kasa için tek tek açabilir. Birden çok kasa satırları karışınca
// hangi kayıt hangi kasaya ait olduğu görünsün diye satıra kasa adı
// etiketlenir (bkz. TaggedRow / kasaReportRowKasa).
type TaggedRow = { row: RecordItem; kasaName: string };

function KasaResultModal({
  language,
  initialKasaName,
  kasaOptions,
  records,
  allRecords,
  onClose,
}: {
  language: Language;
  initialKasaName: string;
  kasaOptions: string[];
  records: RecordItem[];
  allRecords: RecordItem[];
  onClose: () => void;
}) {
  const [selectedKasas, setSelectedKasas] = useState<string[]>([initialKasaName]);
  const [pendingAdd, setPendingAdd] = useState("");
  const reportDate = date(new Date().toISOString().slice(0, 10), language);
  const availableToAdd = kasaOptions.filter((n) => !selectedKasas.includes(n));
  const kasaBlocks = selectedKasas.map((name) => computeKasaReportData(name, records, allRecords));
  const isMulti = kasaBlocks.length > 1;

  const mergedIncome: TaggedRow[] = kasaBlocks
    .flatMap((d) => d.incomeRows.map((row) => ({ row, kasaName: d.name })))
    .sort((a, b) => b.row.date.localeCompare(a.row.date) || b.row.id - a.row.id);
  const mergedExpense: TaggedRow[] = kasaBlocks
    .flatMap((d) => d.expenseRows.map((row) => ({ row, kasaName: d.name })))
    .sort((a, b) => b.row.date.localeCompare(a.row.date) || b.row.id - a.row.id);
  const mergedTotalInByCurrency = mergeCurrencyMaps(kasaBlocks.map((d) => d.totalInByCurrency));
  const mergedTotalOutByCurrency = mergeCurrencyMaps(kasaBlocks.map((d) => d.totalOutByCurrency));
  const mergedTotalByCurrency = mergeCurrencyMaps(kasaBlocks.map((d) => d.totalByCurrency));
  const mergedTotalInAmount = kasaBlocks.reduce((s, d) => s + d.totalInAmount, 0);
  const mergedTotalOutAmount = kasaBlocks.reduce((s, d) => s + d.totalOutAmount, 0);
  const combinedTitle = kasaBlocks.map((d) => localizeData(d.name, language)).join(" + ");

  function addKasa() {
    if (!pendingAdd) return;
    setSelectedKasas((cur) => (cur.includes(pendingAdd) ? cur : [...cur, pendingAdd]));
    setPendingAdd("");
  }
  function removeKasa(name: string) {
    setSelectedKasas((cur) => (cur.length > 1 ? cur.filter((n) => n !== name) : cur));
  }

  async function exportToExcel() {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Maliye-Finans Online";
    workbook.created = new Date();
    const headers = isMulti
      ? [
          tx(language, "Tarih", "Date", "Tarîx"),
          tx(language, "Kasa", "Kasa", "Qase"),
          tx(language, "Başlık", "Title", "Sernav"),
          tx(language, "Kişi", "Person", "Kes"),
          tx(language, "Tutar", "Amount", "Meblağ"),
        ]
      : [
          tx(language, "Tarih", "Date", "Tarîx"),
          tx(language, "Başlık", "Title", "Sernav"),
          tx(language, "Kişi", "Person", "Kes"),
          tx(language, "Tutar", "Amount", "Meblağ"),
        ];
    const colCount = headers.length;
    const thin = { style: "thin" as const, color: { argb: "FFD3DDDD" } };
    const border = { top: thin, left: thin, bottom: thin, right: thin };
    const moneyFormat = "#,##0.00;[Red]-#,##0.00";

    const sheet = workbook.addWorksheet(
      tx(language, "Kasa Sonucu", "Cash Result", "Encama Qaseyê").slice(0, 31),
      {
        pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
        views: [{ showGridLines: false }],
      },
    );
    sheet.columns = isMulti
      ? [{ width: 14 }, { width: 20 }, { width: 30 }, { width: 20 }, { width: 18 }]
      : [{ width: 14 }, { width: 34 }, { width: 22 }, { width: 18 }];

    const titleRow = sheet.addRow([combinedTitle]);
    sheet.mergeCells(titleRow.number, 1, titleRow.number, colCount);
    titleRow.height = 28;
    titleRow.getCell(1).font = { name: "Arial", bold: true, size: 16, color: { argb: "FFFFFFFF" } };
    titleRow.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
    titleRow.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF176B87" } };
    titleRow.eachCell({ includeEmpty: true }, (cell) => { cell.border = border; });

    const subRow = sheet.addRow([
      `${tx(language, "Toplam Sonucu", "Total Result", "Encama Giştî")}: ${moneyBreakdown(mergedTotalByCurrency)}`,
    ]);
    sheet.mergeCells(subRow.number, 1, subRow.number, colCount);
    subRow.height = 22;
    subRow.getCell(1).font = { name: "Arial", bold: true, size: 12, color: { argb: "FF17384A" } };
    subRow.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
    subRow.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDDEEF3" } };
    subRow.eachCell({ includeEmpty: true }, (cell) => { cell.border = border; });
    sheet.addRow([]);

    function addSection(
      sectionTitle: string,
      rows: TaggedRow[],
      sectionTotal: Record<string, number>,
      headFill: string,
      headColor: string,
      totalFill: string,
    ) {
      const sectionHead = sheet.addRow([sectionTitle]);
      sheet.mergeCells(sectionHead.number, 1, sectionHead.number, colCount);
      sectionHead.height = 22;
      sectionHead.getCell(1).font = { name: "Arial", bold: true, size: 12, color: { argb: headColor } };
      sectionHead.getCell(1).alignment = { horizontal: "left", vertical: "middle", indent: 1 };
      sectionHead.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: headFill } };
      sectionHead.eachCell({ includeEmpty: true }, (cell) => { cell.border = border; });

      const headerRow = sheet.addRow(headers);
      headerRow.height = 18;
      headerRow.eachCell((cell) => {
        cell.font = { name: "Arial", bold: true, size: 9, color: { argb: "FF5B6F77" } };
        cell.alignment = { vertical: "middle", horizontal: "left" };
        cell.border = border;
      });

      for (const { row: r, kasaName } of rows) {
        const values = isMulti
          ? [date(r.date, language), localizeData(kasaName, language), localizeData(r.source, language), localizeData(r.person, language), r.amount]
          : [date(r.date, language), localizeData(r.source, language), localizeData(r.person, language), r.amount];
        const row = sheet.addRow(values);
        row.height = 18;
        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          cell.font = { name: "Arial", size: 9, color: { argb: "FF314750" } };
          cell.alignment = { vertical: "middle", horizontal: colNumber === colCount ? "right" : "left" };
          cell.border = border;
        });
        row.getCell(colCount).numFmt = moneyFormat;
      }
      if (!rows.length) {
        const emptyRow = sheet.addRow([tx(language, "Kayıt yok.", "No records.", "Qeyd tune.")]);
        sheet.mergeCells(emptyRow.number, 1, emptyRow.number, colCount);
        emptyRow.getCell(1).font = { name: "Arial", italic: true, size: 9, color: { argb: "FF9AA7AB" } };
        emptyRow.getCell(1).alignment = { horizontal: "center" };
      }
      const totalRow = sheet.addRow([
        tx(language, "Sonuç", "Result", "Encam"),
        ...Array(colCount - 2).fill(""),
        moneyBreakdown(sectionTotal),
      ]);
      sheet.mergeCells(totalRow.number, 1, totalRow.number, colCount - 1);
      totalRow.height = 20;
      totalRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        cell.font = { name: "Arial", bold: true, size: 10, color: { argb: "FF17384A" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: totalFill } };
        cell.alignment = { vertical: "middle", horizontal: colNumber === 1 ? "left" : "right" };
        cell.border = border;
      });
      sheet.addRow([]);
    }

    addSection(tx(language, "GELİR", "INCOME", "DAHAT"), mergedIncome, mergedTotalInByCurrency, "FFDFF5ED", "FF118164", "FFE7F4EF");
    addSection(tx(language, "GİDER", "EXPENSE", "MESREF"), mergedExpense, mergedTotalOutByCurrency, "FFFFF0DF", "FFD06F22", "FFFDF1E7");

    // Sonuç satırları — her biri ekrandaki renk bloğuyla eşleşen bir dolgu
    // rengi alır, sadece metin rengiyle sınırlı kalmaz.
    const summaryLines: [string, string, string, string][] = [
      [tx(language, "KASA SONUÇ", "CASH RESULT", "ENCAMA QASEYÊ"), moneyBreakdown(mergedTotalByCurrency), "FFEAF4F7", "FF12414F"],
      [tx(language, "TOPLAM GELİR", "TOTAL INCOME", "DAHATA GİŞTÎ"), moneyBreakdown(mergedTotalInByCurrency), "FFE7F4EF", "FF14795E"],
      [tx(language, "TOPLAM GİDER", "TOTAL EXPENSE", "MESREFA GİŞTÎ"), moneyBreakdown(mergedTotalOutByCurrency), "FFFDF1E7", "FFB33D3D"],
      [tx(language, "TARİH", "DATE", "TARÎX"), reportDate, "FFF5F7F8", "FF5B6F77"],
    ];
    for (const [label, value, fill, color] of summaryLines) {
      const row = sheet.addRow([label, ...Array(colCount - 2).fill(""), value]);
      sheet.mergeCells(row.number, 1, row.number, colCount - 1);
      row.height = 20;
      row.getCell(1).font = { name: "Arial", bold: true, size: 10, color: { argb: color } };
      row.getCell(colCount).font = { name: "Arial", bold: true, size: 11, color: { argb: color } };
      row.getCell(colCount).alignment = { horizontal: "right" };
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
        cell.border = border;
      });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const safeName = kasaBlocks.map((d) => localizeData(d.name, language)).join("-").replace(/[\\/:*?"<>|]/g, "-");
    link.href = url;
    link.download = `${safeName}-Sonuc-${new Date().toISOString().slice(0, 10)}.xlsx`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="overlay">
      <div className="modal kasaReportModal" onClick={(e) => e.stopPropagation()}>
        <div className="modalHead">
          <div>
            <h2>{tx(language, "Kasa Sonuç Raporu", "Cash Result Report", "Rapora Encama Qaseyê")}</h2>
            <p>{combinedTitle}</p>
          </div>
          <button type="button" onClick={onClose}>×</button>
        </div>
        {availableToAdd.length > 0 && (
          <div className="kasaReportAdd">
            <select value={pendingAdd} onChange={(e) => setPendingAdd(e.target.value)}>
              <option value="">
                {tx(language, "— Başka kasa ekle —", "— Add another kasa —", "— Qaseyek din zêde bike —")}
              </option>
              {availableToAdd.map((name) => (
                <option key={name} value={name}>{localizeData(name, language)}</option>
              ))}
            </select>
            <button type="button" className="light compact" onClick={addKasa} disabled={!pendingAdd}>
              ＋ {tx(language, "Ekle", "Add", "Zêde Bike")}
            </button>
          </div>
        )}
        {isMulti && (
          <div className="kasaReportChips">
            {selectedKasas.map((name) => (
              <span className="kasaReportChip" key={name}>
                {localizeData(name, language)}
                <button
                  type="button"
                  onClick={() => removeKasa(name)}
                  title={tx(language, "Bu kasayı kaldır", "Remove this kasa", "Vê qaseyê rake")}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="kasaReportHead">
          <span>{combinedTitle}</span>
          <div>
            <small>{tx(language, "Toplam Sonucu", "Total Result", "Encama Giştî")}</small>
            <strong>{moneyBreakdown(mergedTotalByCurrency)}</strong>
          </div>
        </div>
        <div className="bars kasaReportBars">
          <KasaReportBar
            label={tx(language, "Gelir", "Income", "Dahat")}
            value={mergedTotalInAmount}
            max={Math.max(mergedTotalInAmount, mergedTotalOutAmount, 1)}
          />
          <KasaReportBar
            label={tx(language, "Gider", "Expense", "Mesref")}
            value={mergedTotalOutAmount}
            max={Math.max(mergedTotalInAmount, mergedTotalOutAmount, 1)}
            expense
          />
        </div>
        <div className="kasaReportSection kasaReportIncome">
          <div className="kasaReportSectionHead">
            <span>{tx(language, "Gelir", "Income", "Dahat")}</span>
            <strong>{moneyBreakdown(mergedTotalInByCurrency)}</strong>
          </div>
          <div className="kasaReportList">
            {mergedIncome.length === 0 ? (
              <p className="kasaReportEmpty">{tx(language, "Kayıt yok.", "No records.", "Qeyd tune.")}</p>
            ) : (
              mergedIncome.map(({ row: r, kasaName }) => (
                <div className="kasaReportRow" key={r.id}>
                  <span className="kasaReportRowDate">{date(r.date, language)}</span>
                  <span className="kasaReportRowTitle">
                    {localizeData(r.source, language)}
                    {isMulti && <small className="kasaReportRowKasa">▣ {localizeData(kasaName, language)}</small>}
                  </span>
                  <span className="kasaReportRowAmount">{money(r.amount, r.currency)}</span>
                </div>
              ))
            )}
          </div>
        </div>
        <div className="kasaReportSection kasaReportExpense">
          <div className="kasaReportSectionHead">
            <span>{tx(language, "Gider", "Expense", "Mesref")}</span>
            <strong>{moneyBreakdown(mergedTotalOutByCurrency)}</strong>
          </div>
          <div className="kasaReportList">
            {mergedExpense.length === 0 ? (
              <p className="kasaReportEmpty">{tx(language, "Kayıt yok.", "No records.", "Qeyd tune.")}</p>
            ) : (
              mergedExpense.map(({ row: r, kasaName }) => (
                <div className="kasaReportRow" key={r.id}>
                  <span className="kasaReportRowDate">{date(r.date, language)}</span>
                  <span className="kasaReportRowTitle">
                    {localizeData(r.source, language)}
                    {isMulti && <small className="kasaReportRowKasa">▣ {localizeData(kasaName, language)}</small>}
                  </span>
                  <span className="kasaReportRowAmount">{money(r.amount, r.currency)}</span>
                </div>
              ))
            )}
          </div>
        </div>
        <div className="kasaReportSummary">
          <div className="kasaReportSummaryRow kasaReportSummaryMain">
            <small>{tx(language, "KASA SONUÇ", "CASH RESULT", "ENCAMA QASEYÊ")}</small>
            <strong>{moneyBreakdown(mergedTotalByCurrency)}</strong>
          </div>
          <div className="kasaReportSummaryRow kasaReportSummaryIncome">
            <small>{tx(language, "TOPLAM GELİR", "TOTAL INCOME", "DAHATA GİŞTÎ")}</small>
            <strong>{moneyBreakdown(mergedTotalInByCurrency)}</strong>
          </div>
          <div className="kasaReportSummaryRow kasaReportSummaryExpense">
            <small>{tx(language, "TOPLAM GİDER", "TOTAL EXPENSE", "MESREFA GİŞTÎ")}</small>
            <strong>{moneyBreakdown(mergedTotalOutByCurrency)}</strong>
          </div>
          <div className="kasaReportSummaryRow kasaReportSummaryDate">
            <small>{tx(language, "TARİH", "DATE", "TARÎX")}</small>
            <strong>{reportDate}</strong>
          </div>
        </div>
        <div className="modalActions">
          <button type="button" className="light" onClick={onClose}>
            {tx(language, "Kapat", "Close", "Bigire")}
          </button>
          <button type="button" className="primary" onClick={exportToExcel}>
            ⇩ {tx(language, "Excel'e Aktar", "Export to Excel", "Derxe Excelê")}
          </button>
        </div>
      </div>
    </div>
  );
}

export function RecordModal({
  language,
  kind,
  initial,
  records,
  onCreateNote,
  onClose,
  onSave,
  cashAccounts,
  users,
  onTransfersChanged,
}: {
  language: Language;
  kind: Kind;
  initial?: RecordItem;
  records: RecordItem[];
  onCreateNote: (input: Omit<FinanceNote, "id" | "createdAt" | "updatedAt">) => void;
  onClose: () => void;
  onSave: (x: Omit<RecordItem, "id">, id?: number) => void;
  cashAccounts: CashAccountSummary[];
  users: UserAccount[];
  onTransfersChanged: () => void;
}) {
  const defaultNoteRelation: NoteRelation =
    kind === "cash" ? "cash" : kind === "income" ? "income" : "expense";
  const [financeNote, setFinanceNote] = useState("");
  const [duplicateConfirmOpen, setDuplicateConfirmOpen] = useState(false);
  const [financeNoteStatus, setFinanceNoteStatus] = useState<NoteStatus>("pending");
  const [financeNoteRelation, setFinanceNoteRelation] = useState<NoteRelation>(defaultNoteRelation);
  const [financeNoteRelationDetail, setFinanceNoteRelationDetail] = useState("");
  const financeNoteStatusOptions: { id: NoteStatus; label: string }[] = [
    { id: "important", label: tx(language, "Önemli Notlar", "Important Notes", "Nîşeyên Girîng") },
    { id: "urgent", label: tx(language, "Acil Notlar", "Urgent Notes", "Nîşeyên Acîl") },
    { id: "pending", label: tx(language, "Bekleyen Notlar", "Pending Notes", "Nîşeyên Li Bendê") },
    { id: "completed", label: tx(language, "Tamamlanmış Notlar", "Completed Notes", "Nîşeyên Qediyayî") },
  ];
  const financeNoteRelationOptions: NoteRelation[] = ["none", "cash", "income", "expense", "reports", "archive", "other"];
  const financeNoteTitleOptions = [
    ...new Set(
      records
        .filter(
          (x) =>
            x.kind === financeNoteRelation ||
            (financeNoteRelation === "income" && x.kind === "cash"),
        )
        .map((x) => x.source)
        .filter(Boolean),
    ),
  ];
  const base = initial
    ? normalizeRecord(initial)
    : {
        kind,
        date: new Date().toISOString().slice(0, 10),
        source: "",
        detail: "",
        note: "",
        person: "",
        amount: 0,
        currency: "USD",
        project: "",
        tags: [],
        cashAccount: "",
        listName: "",
        attachments: [],
      };
  // Always seed the form with the raw stored values, never the display-only
  // Kurdish demo translations — otherwise saving without touching a field
  // (or picking a translated autocomplete suggestion below) would write the
  // translated string back to the database, breaking cashAccount name
  // matching and silently corrupting data across languages.
  const [form, setForm] = useState<Omit<RecordItem, "id">>(base);
  const previous = (field: "source" | "person" | "project" | "listName") => [
    ...new Set(
      records
        .filter((x) => field !== "source" || x.kind === kind)
        .map((x) => x[field])
        .filter(Boolean),
    ),
  ];
  const previousTags = [...new Set(records.flatMap((x) => x.tags))];
  // Excel/Office/PDF ekleri (birden fazla olabilir) — avatar/logo ile aynı
  // desen: her dosya base64 data URL'e çevrilip form state'teki diziye
  // eklenir, kayıtla birlikte gönderilir. Sunucudaki sınırlarla aynı
  // seviyede burada da erken uyarı verilir.
  const MAX_ATTACHMENT_BYTES = 6 * 1024 * 1024;
  const MAX_ATTACHMENTS = 5;
  function pickAttachments(files: FileList | null) {
    if (!files || !files.length) return;
    const room = MAX_ATTACHMENTS - (form.attachments?.length ?? 0);
    if (room <= 0) {
      alert(
        tx(
          language,
          `En fazla ${MAX_ATTACHMENTS} dosya eklenebilir.`,
          `You can attach at most ${MAX_ATTACHMENTS} files.`,
          `Herî zêde ${MAX_ATTACHMENTS} pel dikarin werin pêvekirin.`,
        ),
      );
      return;
    }
    const selected = Array.from(files).slice(0, room);
    for (const file of selected) {
      if (file.size > MAX_ATTACHMENT_BYTES) {
        alert(
          tx(
            language,
            `"${file.name}" çok büyük (en fazla 6MB).`,
            `"${file.name}" is too large (max 6MB).`,
            `"${file.name}" pir mezin e (herî zêde 6MB).`,
          ),
        );
        continue;
      }
      const reader = new FileReader();
      // Functional update — birden çok dosya aynı anda seçildiğinde her
      // FileReader kendi temposunda tamamlanır; kapalı (closure) bir
      // `form` üzerinden yazmak eş zamanlı okumalardan birini kaybettirir.
      reader.onload = () =>
        setForm((f) => ({
          ...f,
          attachments: [...(f.attachments ?? []), { name: file.name, data: String(reader.result) }],
        }));
      reader.readAsDataURL(file);
    }
  }
  function removeAttachment(index: number) {
    setForm({ ...form, attachments: (form.attachments ?? []).filter((_, i) => i !== index) });
  }
  // "Görüntüle" — dev bir base64 data URL'i doğrudan <a href> yapmak
  // yerine (bazı tarayıcılarda güvenilir açılmıyor/indirme diyaloğuna
  // takılıyordu), tıklamada senkron olarak bir Blob URL'e çevirip
  // window.open ile açıyoruz; bu hem daha güvenilir hem de dosya doğru
  // MIME tipiyle (mümkünse tarayıcı içinde) açılıyor.
  function viewAttachment(attachment: { name: string; data: string }) {
    // window.open() bazı tarayıcılarda tek başına açılır pencere olarak
    // engellenebiliyor; bunun yerine bu uygulamadaki "Excel'e Çıkar"
    // indirmesiyle aynı, kanıtlanmış yöntem kullanılıyor — geçici bir <a>
    // elementi oluşturup gerçek bir tıklama tetikliyoruz, bu tarayıcıların
    // engelleme kurallarına takılmıyor.
    try {
      const [header, base64] = attachment.data.split(",");
      const mime = /data:(.*?);base64/.exec(header)?.[1] || "application/octet-stream";
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
      const link = document.createElement("a");
      link.href = url;
      link.target = "_blank";
      link.rel = "noreferrer";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      const link = document.createElement("a");
      link.href = attachment.data;
      link.target = "_blank";
      link.rel = "noreferrer";
      document.body.appendChild(link);
      link.click();
      link.remove();
    }
  }
  function commitSave() {
    if (financeNote.trim()) {
      onCreateNote({
        title: form.source.trim() || tx(language, "Mali Özel Not", "Private Finance Note", "Nîşeya Darayî ya Taybet"),
        content: financeNote.trim(),
        status: financeNoteStatus,
        relation: financeNoteRelation,
        relationDetail: financeNoteRelation === "none" ? "" : (financeNoteRelationDetail.trim() || form.source),
      });
    }
    onSave(form, initial?.id);
  }
  return (
    <div className="overlay overlayScrollThrough">
      <form
        className="modal"
        onSubmit={(e) => {
          e.preventDefault();
          const duplicate = records.find((x) => x.id !== initial?.id && x.kind === kind && x.date === form.date && x.amount === form.amount && x.currency === form.currency && (x.cashAccount || "") === (form.cashAccount || "") && x.source === form.source);
          if (duplicate) {
            setDuplicateConfirmOpen(true);
            return;
          }
          commitSave();
        }}
      >
        <div className="modalHead">
          <div>
            <h2>
              {initial
                ? tx(
                    language,
                    "Kaydı Düzenle",
                    "Edit Record",
                    "Qeydê Biguherîne",
                  )
                : tx(language, "Yeni Kayıt", "New Record", "Qeyda Nû")}
            </h2>
            <p>
              {initial
                ? tx(
                    language,
                    "Eski hali otomatik olarak Arşiv bölümünde saklanacaktır.",
                    "The previous version will be stored automatically in Archive.",
                    "Rewşa berê dê bixweber di Arşîvê de were parastin.",
                  )
                : tx(
                    language,
                    "Daha önce kullanılan bilgiler alanlarda öneri olarak görünür.",
                    "Previously used information appears as suggestions.",
                    "Agahiyên berê hatine bikaranîn wek pêşniyar xuya dibin.",
                  )}
            </p>
          </div>
          <button type="button" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="formGrid">
          <label>
            {tx(language, "Tarih", "Date", "Tarîx")}
            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
            />
          </label>
          <label>
            {kind === "cash"
              ? tx(language, "Kasa Adı", "Cash Account", "Navê Qaseyê")
              : kind === "income"
                ? tx(
                    language,
                    "Gelir Ana Başlığı",
                    "Income Category",
                    "Sernavê Dahatê",
                  )
                : tx(
                    language,
                    "Gider Ana Başlığı",
                    "Expense Category",
                    "Sernavê Mesrefê",
                  )}
            <SuggestInput
              required
              value={form.source}
              onChange={(v) => setForm({ ...form, source: v })}
              options={previous("source")}
            />
          </label>
          <label>
            {tx(language, "Kişi", "Person", "Kes")}
            <SuggestInput
              value={form.person}
              onChange={(v) => setForm({ ...form, person: v })}
              options={previous("person")}
            />
          </label>
          <label>
            {tx(language, "Liste Kaydı", "List Record", "Qeyda Lîsteyê")}
            <SuggestInput
              value={form.listName}
              onChange={(v) => setForm({ ...form, listName: v })}
              options={previous("listName")}
              placeholder={tx(
                language,
                "Örn. V Listesi",
                "E.g. List V",
                "Mînak: Lîsteya V",
              )}
            />
          </label>
          <label>
            {tx(language, "Miktar / Para Birimi", "Amount / Currency", "Meblağ / Yekeya Pere")}
            <div className="amountCurrency">
              <input
                type="number"
                min="0"
                value={form.amount}
                onChange={(e) =>
                  setForm({ ...form, amount: Number(e.target.value) })
                }
              />
              <select
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
              >
                <option>USD</option>
                <option>IQD</option>
                <option>TRY</option>
                <option>EUR</option>
              </select>
            </div>
          </label>
          <label>
            {tx(language, "Birim Adı", "Unit Name", "Navê Yekîneyê")}
            <SuggestInput
              value={form.project}
              onChange={(v) => setForm({ ...form, project: v })}
              options={previous("project")}
            />
          </label>
          {kind !== "cash" && (
            <label>
              {tx(language, "Kasa Seç", "Select Cash Account", "Qase Hilbijêre")}
              <select value={form.cashAccount || ""} onChange={(e) => setForm({ ...form, cashAccount: e.target.value })}>
                <option value="">
                  {kind === "expense"
                    ? tx(language, "Seçilmezse: Diğer Giderler", "If unset: Other Expenses", "Heke neyê hilbijartin: Mesrefên Din")
                    : tx(language, "Seçilmezse: Diğer", "If unset: Other", "Heke neyê hilbijartin: Yên Din")}
                </option>
                {[...new Set(records.filter((x) => x.kind === "cash").map((x) => x.source).filter(Boolean))].map((name) => <option key={name} value={name}>{localizeData(name, language)}</option>)}
              </select>
            </label>
          )}
          <label>
            {tx(language, "Detay", "Detail", "Hûragahî")}
            <input
              value={form.detail}
              onChange={(e) => setForm({ ...form, detail: e.target.value })}
            />
          </label>
          <label>
            {tx(language, "Etiketler", "Tags", "Etîket")}
            <TagsInput
              tags={form.tags}
              onChange={(tags) => setForm({ ...form, tags })}
              options={previousTags}
              placeholder={tx(
                language,
                "Örn: maaş, sabit, solar",
                "E.g. salary, fixed, solar",
                "Mînak: mûçe, sabît, solar",
              )}
            />
          </label>
          <label className="wide">
            {tx(language, "Ek Dosyalar (Excel/Office/PDF)", "Attachments (Excel/Office/PDF)", "Peldankên Pêvekirî (Excel/Office/PDF)")}
            <div className="attachmentField">
              <input
                type="file"
                multiple
                accept=".xlsx,.xls,.csv,.doc,.docx,.ppt,.pptx,.pdf"
                disabled={(form.attachments?.length ?? 0) >= MAX_ATTACHMENTS}
                onChange={(e) => {
                  pickAttachments(e.target.files);
                  e.target.value = "";
                }}
              />
            </div>
            {(form.attachments?.length ?? 0) > 0 && (
              <ul className="attachmentList">
                {form.attachments!.map((att, index) => (
                  <li key={`${att.name}-${index}`}>
                    <small className="attachmentFieldName">{att.name}</small>
                    <button
                      type="button"
                      className="light compact"
                      onClick={() => viewAttachment(att)}
                    >
                      👁 {tx(language, "Görüntüle", "View", "Nîşan Bide")}
                    </button>
                    <button
                      type="button"
                      className="light compact"
                      onClick={() => removeAttachment(index)}
                    >
                      {tx(language, "Kaldır", "Remove", "Rake")}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </label>
          <div className="wide notesRow">
            <label>
              {tx(language, "Not", "Note", "Nîşe")}
              <textarea
                rows={3}
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
              />
            </label>
            <label>
              {tx(language, "Mali Özel Not", "Private Finance Note", "Nîşeya Darayî ya Taybet")}
              <textarea
                rows={3}
                value={financeNote}
                onChange={(e) => setFinanceNote(e.target.value)}
                placeholder={tx(
                  language,
                  "Bu kayıtla ilişkili mali özel not…",
                  "A private finance note linked to this record…",
                  "Nîşeyeke darayî ya taybet a girêdayî vê qeydê…",
                )}
              />
            </label>
          </div>
          {financeNote.trim() && (
            <div className="wide notesRow noteExpand">
              <label>
                {tx(language, "Not Durumu", "Note Status", "Rewşa Nîşeyê")}
                <select
                  value={financeNoteStatus}
                  onChange={(e) => setFinanceNoteStatus(e.target.value as NoteStatus)}
                >
                  {financeNoteStatusOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {tx(language, "İlişkili Bölüm", "Linked Section", "Beşa Girêdayî")}
                <select
                  value={financeNoteRelation}
                  onChange={(e) => {
                    setFinanceNoteRelation(e.target.value as NoteRelation);
                    setFinanceNoteRelationDetail("");
                  }}
                >
                  {financeNoteRelationOptions.map((option) => (
                    <option key={option} value={option}>
                      {noteRelationLabel(option, language)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="wide">
                {tx(language, "İlişkili Başlık", "Linked Title", "Sernavê Girêdayî")}
                <SuggestInput
                  disabled={financeNoteRelation === "none"}
                  value={financeNoteRelationDetail}
                  onChange={setFinanceNoteRelationDetail}
                  options={financeNoteTitleOptions}
                  placeholder={
                    financeNoteRelation === "none"
                      ? ""
                      : form.source ||
                        tx(language, "Başlık seçin veya yazın", "Choose or type a title", "Sernav hilbijêre an binivîse")
                  }
                />
              </label>
            </div>
          )}
        </div>
        {kind === "cash" && initial && (
          <div className="cashHistory">
            <h3>
              {tx(language, "Kasa Hareketleri", "Cash Account History", "Tevgerên Qaseyê")}
            </h3>
            {(() => {
              const linkedIncome = total(
                records.filter(
                  (x) => x.kind === "income" && x.cashAccount === initial.source,
                ),
              );
              const linkedExpense = total(
                records.filter(
                  (x) => x.kind === "expense" && x.cashAccount === initial.source,
                ),
              );
              const totalIn = initial.amount + linkedIncome;
              const totalOut = linkedExpense;
              const net = totalIn - totalOut;
              const remainingPercent = totalIn
                ? Math.round((net / totalIn) * 100)
                : 0;
              return (
                <div className="cashHistoryStats">
                  <div>
                    <small>{tx(language, "Toplam Giriş", "Total In", "Giştî Têketin")}</small>
                    <strong>{money(totalIn)}</strong>
                  </div>
                  <div>
                    <small>{tx(language, "Toplam Gider", "Total Out", "Giştî Derketin")}</small>
                    <strong className="negative">{money(totalOut)}</strong>
                  </div>
                  <div>
                    <small>{tx(language, "Net Bakiye", "Net Balance", "Bakiya Paqij")}</small>
                    <strong>{money(net)}</strong>
                  </div>
                  <div>
                    <small>{tx(language, "Kalan %", "Remaining %", "% Mayî")}</small>
                    <strong>%{remainingPercent}</strong>
                  </div>
                </div>
              );
            })()}
            <div className="cashHistoryList">
              {records
                .filter((x) => x.kind !== "cash" && x.cashAccount === initial.source)
                .sort((a, b) => b.date.localeCompare(a.date))
                .map((x) => (
                  <div className="cashHistoryRow" key={x.id}>
                    <span>{date(x.date, language)}</span>
                    <span>
                      {x.kind === "income"
                        ? tx(language, "Gelir", "Income", "Dahat")
                        : tx(language, "Gider", "Expense", "Mesref")}
                    </span>
                    <span>{localizeData(x.source, language)}</span>
                    <strong className={x.kind === "expense" ? "negative" : ""}>
                      {x.kind === "income" ? "+" : "−"}
                      {money(x.amount, x.currency)}
                    </strong>
                  </div>
                ))}
              {!records.some(
                (x) => x.kind !== "cash" && x.cashAccount === initial.source,
              ) && (
                <div className="cashHistoryEmpty">
                  {tx(
                    language,
                    "Bu kasaya bağlı hareket yok.",
                    "No transactions linked to this cash account.",
                    "Tevgerek girêdayî vê qaseyê tune.",
                  )}
                </div>
              )}
            </div>
          </div>
        )}
        {kind === "cash" && initial && (
          <KasaTransferSection
            language={language}
            kasa={initial}
            cashAccounts={cashAccounts}
            users={users}
            onTransfersChanged={onTransfersChanged}
          />
        )}
        <div className="modalActions">
          <button type="button" className="light" onClick={onClose}>
            {tx(language, "Vazgeç", "Cancel", "Betal")}
          </button>
          <button className="primary">
            {initial
              ? tx(
                  language,
                  "Değişiklikleri Kaydet",
                  "Save Changes",
                  "Guherînan Tomar Bike",
                )
              : tx(language, "Kaydet", "Save", "Tomar Bike")}
          </button>
        </div>
      </form>
      {duplicateConfirmOpen && (
        <ConfirmModal
          language={language}
          message={tx(
            language,
            `Aynı tarih ve tutarla benzer bir kayıt bulundu (${form.date} · ${money(form.amount, form.currency)}). Bu kaydı yine de eklemek istediğinizden emin misiniz?`,
            `A similar record exists with the same date and amount (${form.date} · ${money(form.amount, form.currency)}). Save anyway?`,
            `Qeydek mîna vê bi heman tarîx û meblağê heye. Dîsa tomar bike?`,
          )}
          onClose={() => setDuplicateConfirmOpen(false)}
          onConfirm={() => {
            setDuplicateConfirmOpen(false);
            commitSave();
          }}
        />
      )}
    </div>
  );
}

// "Kasa Aktarımı": moves money from `kasa` to another kasa (existing or
// brand new), pending until the recipient side confirms receipt — see
// app/api/cash-transfers. Nothing here touches app/page.tsx's `records`
// state directly; a confirm calls `onTransfersChanged` so the parent
// refetches and every kasa's balance reflects the new ledger rows.
function KasaTransferSection({
  language,
  kasa,
  cashAccounts,
  users,
  onTransfersChanged,
}: {
  language: Language;
  kasa: RecordItem;
  cashAccounts: CashAccountSummary[];
  users: UserAccount[];
  onTransfersChanged: () => void;
}) {
  const thisAccount = cashAccounts.find((a) => a.name === kasa.source);
  const [open, setOpen] = useState(false);
  const [transfers, setTransfers] = useState<CashTransfer[] | null>(null);
  const [allAccounts, setAllAccounts] = useState<{ id: number; name: string }[] | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [targetId, setTargetId] = useState("");
  const [newKasaName, setNewKasaName] = useState("");
  const [recipientPerson, setRecipientPerson] = useState("");
  const [recipientUserId, setRecipientUserId] = useState("");
  const [tDate, setTDate] = useState(new Date().toISOString().slice(0, 10));
  const [tAmount, setTAmount] = useState(0);
  const [tCurrency, setTCurrency] = useState("USD");
  const [tDetail, setTDetail] = useState("");
  const [tNote, setTNote] = useState("");
  const [sentConfirmed, setSentConfirmed] = useState(false);

  async function loadTransfers() {
    try {
      const response = await fetch("/api/cash-transfers");
      const data = await response.json().catch(() => ({}));
      setTransfers(response.ok ? (data.cashTransfers ?? []) : []);
    } catch {
      setTransfers([]);
    }
  }

  async function loadAllAccounts() {
    try {
      const response = await fetch("/api/cash-accounts/all");
      const data = await response.json().catch(() => ({}));
      setAllAccounts(response.ok ? (data.cashAccounts ?? []) : []);
    } catch {
      setAllAccounts([]);
    }
  }

  useEffect(() => {
    loadTransfers();
    loadAllAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kasa.source]);

  const outgoing = (transfers ?? []).filter((t) => t.fromCashAccountId === thisAccount?.id);
  const incoming = (transfers ?? []).filter((t) => t.toCashAccountId === thisAccount?.id);
  // Every kasa in the system, not just the ones this user can already see —
  // sending money to a kasa shouldn't require having view access to it.
  const otherAccounts = (allAccounts ?? cashAccounts).filter((a) => a.id !== thisAccount?.id);
  const valid = Boolean(thisAccount) && tAmount > 0 && Boolean(targetId || newKasaName.trim()) && sentConfirmed;

  async function submitTransfer() {
    if (!thisAccount || !valid) return;
    setSubmitting(true);
    try {
      const response = await fetch("/api/cash-transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromCashAccountId: thisAccount.id,
          ...(targetId ? { toCashAccountId: Number(targetId) } : { toCashAccountName: newKasaName.trim() }),
          amount: tAmount,
          currency: tCurrency,
          date: tDate,
          detail: tDetail,
          note: tNote,
          recipientPerson,
          ...(recipientUserId ? { recipientUserId: Number(recipientUserId) } : {}),
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        alert(body.error || tx(language, "Aktarım oluşturulamadı.", "The transfer could not be created.", "Veguhastin nehat afirandin."));
        return;
      }
      setTargetId("");
      setNewKasaName("");
      setRecipientPerson("");
      setRecipientUserId("");
      setTAmount(0);
      setTDetail("");
      setTNote("");
      setSentConfirmed(false);
      await loadTransfers();
      // A brand-new target kasa gets a zero-balance placeholder record on
      // creation (see POST /api/cash-transfers) — refresh so it shows up
      // immediately instead of only after the next full reload.
      onTransfersChanged();
    } catch {
      alert(tx(language, "Aktarım oluşturulamadı.", "The transfer could not be created.", "Veguhastin nehat afirandin."));
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmTransfer(id: number) {
    setBusyId(id);
    try {
      const response = await fetch(`/api/cash-transfers/${id}/confirm`, { method: "POST" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        alert(body.error || tx(language, "Aktarım onaylanamadı.", "The transfer could not be confirmed.", "Veguhastin nehat erêkirin."));
        return;
      }
      await loadTransfers();
      onTransfersChanged();
    } catch {
      alert(tx(language, "Aktarım onaylanamadı.", "The transfer could not be confirmed.", "Veguhastin nehat erêkirin."));
    } finally {
      setBusyId(null);
    }
  }

  const statusLabel = (s: CashTransfer["status"]) =>
    s === "pending"
      ? tx(language, "Bekliyor", "Pending", "Li benda")
      : s === "confirmed"
        ? tx(language, "Onaylandı", "Confirmed", "Hat erêkirin")
        : tx(language, "İptal", "Cancelled", "Betal");

  return (
    <div className="cashTransferSection">
      <div className="cashTransferHead">
        <h3>{tx(language, "Kasa Aktarımı", "Kasa Transfer", "Veguhastina Qaseyê")}</h3>
        <button type="button" className="light" onClick={() => setOpen((o) => !o)}>
          {open
            ? tx(language, "Kapat", "Close", "Bigire")
            : tx(language, "Kasa Aktar", "Transfer Kasa", "Qaseyê Veguhezîne")}
        </button>
      </div>

      {open && thisAccount && (
        <div className="formGrid cashTransferForm">
          <label>
            {tx(language, "Aktarılacak Kasa", "Target Kasa", "Qaseya Armanc")}
            <select
              value={targetId}
              onChange={(e) => {
                setTargetId(e.target.value);
                if (e.target.value) setNewKasaName("");
              }}
            >
              <option value="">
                {tx(language, "— Seçin —", "— Select —", "— Hilbijêre —")}
              </option>
              {otherAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {tx(language, "Yeni Kasa Adı", "New Kasa Name", "Navê Qaseya Nû")}
            <input
              value={newKasaName}
              disabled={Boolean(targetId)}
              onChange={(e) => setNewKasaName(e.target.value)}
              placeholder={tx(
                language,
                "Listede yoksa buraya yazın",
                "Type here if not in the list above",
                "Heke ne di lîsteyê de be li vir binivîse",
              )}
            />
          </label>
          <label>
            {tx(language, "Aktarılacak Kişi", "Recipient", "Kesê Wergir")}
            <input value={recipientPerson} onChange={(e) => setRecipientPerson(e.target.value)} />
          </label>
          <label>
            {tx(language, "Alıcı Kullanıcı", "Recipient User", "Bikarhênerê Wergir")}
            <select value={recipientUserId} onChange={(e) => setRecipientUserId(e.target.value)}>
              <option value="">{tx(language, "Belirtilmedi", "Unspecified", "Nehatiye diyarkirin")}</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {tx(language, "Tarih", "Date", "Tarîx")}
            <input type="date" value={tDate} onChange={(e) => setTDate(e.target.value)} />
          </label>
          <label>
            {tx(language, "Miktar / Para Birimi", "Amount / Currency", "Meblağ / Yekeya Pere")}
            <div className="amountCurrency">
              <input type="number" min="0" value={tAmount} onChange={(e) => setTAmount(Number(e.target.value))} />
              <select value={tCurrency} onChange={(e) => setTCurrency(e.target.value)}>
                <option>USD</option>
                <option>IQD</option>
                <option>TRY</option>
                <option>EUR</option>
              </select>
            </div>
          </label>
          <label>
            {tx(language, "Detay", "Detail", "Hûragahî")}
            <input value={tDetail} onChange={(e) => setTDetail(e.target.value)} />
          </label>
          <label className="wide">
            {tx(language, "Not", "Note", "Nîşe")}
            <textarea rows={2} value={tNote} onChange={(e) => setTNote(e.target.value)} />
          </label>
          <label className="wide check">
            <input type="checkbox" checked={sentConfirmed} onChange={(e) => setSentConfirmed(e.target.checked)} />
            <span>
              <b>{tx(language, "Kasa aktarıldı", "Kasa has been sent", "Qase hat veguhastin")}</b>
              <small>
                {tx(
                  language,
                  "Tutar bu kasadan hemen düşülür ve hedef kasada gelir olarak görünür; karşı taraf onaylayana kadar o kayıt 'Onay Bekliyor' tonunda gösterilir.",
                  "The amount is deducted from this kasa immediately and appears as income in the target kasa right away; that record shows an 'Awaiting Approval' tone until the other side confirms it.",
                  "Meblağ tavilê ji vê qaseyê tê kêmkirin û di qaseya armanc de wek dahat xuya dike; heta alîyê din erê neke, ew qeyd bi rengê 'Li Benda Erêkirinê' tê nîşandan.",
                )}
              </small>
            </span>
          </label>
          <button type="button" className="wide primary" disabled={!valid || submitting} onClick={submitTransfer}>
            {tx(language, "Kasayı Aktar", "Transfer Kasa", "Qaseyê Veguhezîne")}
          </button>
        </div>
      )}

      {(outgoing.length > 0 || incoming.length > 0) && (
        <div className="cashTransferList">
          {outgoing.length > 0 && (
            <div>
              <small>{tx(language, "Gönderilen Aktarımlar", "Outgoing Transfers", "Veguhastinên Şandî")}</small>
              {outgoing.map((t) => (
                <div className="cashTransferRow" key={t.id}>
                  <span>{date(t.date, language)}</span>
                  <span>{localizeData(t.toCashAccountName, language)}</span>
                  <span>{t.recipientPerson || t.recipientUserName || "—"}</span>
                  <strong>{money(t.amount, t.currency)}</strong>
                  <em className={`transferStatus transferStatus-${t.status}`}>{statusLabel(t.status)}</em>
                </div>
              ))}
            </div>
          )}
          {incoming.length > 0 && (
            <div>
              <small>{tx(language, "Bu Kasaya Gelen Aktarımlar", "Incoming Transfers", "Veguhastinên Hatî")}</small>
              {incoming.map((t) => (
                <div className="cashTransferRow" key={t.id}>
                  <span>{date(t.date, language)}</span>
                  <span>{localizeData(t.fromCashAccountName, language)}</span>
                  <span>{t.recipientPerson || t.recipientUserName || "—"}</span>
                  <strong>{money(t.amount, t.currency)}</strong>
                  {t.status === "pending" ? (
                    <label className="check transferConfirm">
                      <input
                        type="checkbox"
                        checked={false}
                        disabled={busyId === t.id}
                        onChange={() => confirmTransfer(t.id)}
                      />
                      {tx(language, "Aktarılan Kasa Alındı", "Received", "Hat Wergirtin")}
                    </label>
                  ) : (
                    <em className={`transferStatus transferStatus-${t.status}`}>{statusLabel(t.status)}</em>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

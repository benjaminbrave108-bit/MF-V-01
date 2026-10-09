"use client";

import { useEffect, useState } from "react";
import { Title } from "./shared";
import { tx, noteRelationLabel } from "../lib/i18n";
import type { FinanceNote, Language, NoteRelation, NoteStatus, UserAccount } from "../lib/types";

export function Notes({
  language,
  notes,
  users,
  onCreateNote,
  onUpdateNote,
  onDeleteNote,
  onArchiveNote,
  onMarkAllRead,
}: {
  language: Language;
  notes: FinanceNote[];
  users: UserAccount[];
  onCreateNote: (note: Omit<FinanceNote, "id" | "createdAt" | "updatedAt" | "isArchived" | "archivedAt">) => void;
  onUpdateNote: (note: FinanceNote) => void;
  onDeleteNote: (id: number) => void;
  onArchiveNote: (id: number, archived: boolean) => void;
  onMarkAllRead?: () => void;
}) {
  const [addingTo, setAddingTo] = useState<NoteStatus | null>(null);
  const [editingNote, setEditingNote] = useState<FinanceNote | null>(null);
  const [dragOver, setDragOver] = useState<NoteStatus | null>(null);
  // Notlar sayfasını açmak, üstündeki okunmamış rozetini temizler — Yorumlar
  // sayfasındaki aynı davranışın (thread açılınca okundu işaretlenmesi)
  // burada tüm listeye uygulanmış hali.
  useEffect(() => {
    onMarkAllRead?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const columns: { id: NoteStatus; label: string; color: string }[] = [
    { id: "important", label: tx(language, "Önemli Notlar", "Important Notes", "Nîşeyên Girîng"), color: "#d6a52b" },
    { id: "urgent", label: tx(language, "Acil Notlar", "Urgent Notes", "Nîşeyên Acîl"), color: "#df5b5b" },
    { id: "pending", label: tx(language, "Bekleyen Notlar", "Pending Notes", "Nîşeyên Li Bendê"), color: "#398db1" },
    { id: "completed", label: tx(language, "Tamamlanmış Notlar", "Completed Notes", "Nîşeyên Qediyayî"), color: "#38a477" },
  ];
  // Arşivlenen notlar panoda hiç görünmez (bkz. Arşiv > Notlar Arşivi) —
  // panonun zamanla birikip kalabalıklaşmaması için elle "Arşivle" ile
  // buradan çıkarılır.
  const activeNotes = notes.filter((note) => !note.isArchived);
  const visibleNotes = (status: NoteStatus) => activeNotes
    .filter((note) => note.status === status)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const moveNote = (id: number, status: NoteStatus) => {
    const note = notes.find((x) => x.id === id);
    if (note) onUpdateNote({ ...note, status, updatedAt: new Date().toISOString() });
  };
  return (
    <div className="panel">
      <div className="toolbar">
        <Title
          title={tx(
            language,
            "Mali Özel Notları",
            "Private Finance Notes",
            "Nîşeyên Taybet ên Darayî",
          )}
          sub={tx(
            language,
            "Kasa, gelir ve giderlerle ilgili özel açıklamalar",
            "Private notes about cash, income and expenses",
            "Daxuyaniyên taybet derbarê qase, dahat û mesrefan",
          )}
        />
      </div>
      <div className="noteBoard">
        {columns.map((column) => <section className={`noteColumn noteColumn-${column.id}${dragOver === column.id ? " noteColumnDrop" : ""}`} key={column.id} onDragOver={(event) => { event.preventDefault(); setDragOver(column.id); }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragOver(null); }} onDrop={(event) => { event.preventDefault(); const id = Number(event.dataTransfer.getData("text/plain")); if (id) moveNote(id, column.id); setDragOver(null); }}>
          <header><span className="noteColumnTitle"><i style={{ background: column.color }} />{column.label}</span><span className="noteColumnActions"><button aria-label={`${column.label} - ${tx(language, "Not Ekle", "Add Note", "Nîşe Zêde Bike")}`} onClick={() => setAddingTo(column.id)}>＋</button><b>{visibleNotes(column.id).length}</b></span></header>
          <div className="noteColumnBody">
            {visibleNotes(column.id).map((note) => <article className={`noteCard${note.isUnread ? " noteCardUnread" : ""}`} key={note.id} draggable onDragStart={(event) => { if ((event.target as HTMLElement).closest("button, select")) { event.preventDefault(); return; } event.dataTransfer.setData("text/plain", String(note.id)); event.dataTransfer.effectAllowed = "move"; }} onDragEnd={() => setDragOver(null)}>
              {note.isUnread && <span className="noteUnreadDot" title={tx(language, "Okunmamış", "Unread", "Nexwendî")} />}
              <div className="noteMeta"><small>{new Date(note.updatedAt).toLocaleDateString(language === "en" ? "en-GB" : "tr-TR")}</small>{note.relation !== "none" && <span className="noteRelation">↗ {noteRelationLabel(note.relation, language)}{note.relationDetail ? ` · ${note.relationDetail}` : ""}</span>}</div>
              <h3>{note.title}</h3><p>{note.content}</p>
              {note.assignedUserNames && note.assignedUserNames.length > 0 && (
                <small className="noteAssigned">👤 {note.assignedUserNames.join(", ")}</small>
              )}
              <label>{tx(language, "Durum", "Status", "Rewş")}<select value={note.status} onChange={(event) => moveNote(note.id, event.target.value as NoteStatus)}>{columns.map((option) => <option value={option.id} key={option.id}>{option.label}</option>)}</select></label>
              <button type="button" className="noteEdit" title={tx(language, "Notu Düzenle", "Edit Note", "Nîşeyê Biguherîne")} aria-label={tx(language, "Notu Düzenle", "Edit Note", "Nîşeyê Biguherîne")} onClick={() => setEditingNote(note)}>✎</button>
              <button type="button" className="noteArchive" title={tx(language, "Arşivle", "Archive", "Arşîv Bike")} aria-label={tx(language, "Arşivle", "Archive", "Arşîv Bike")} onClick={() => onArchiveNote(note.id, true)}>🗄</button>
              <button className="noteDelete" title={tx(language, "Sil", "Delete", "Jêbirin")} onClick={() => onDeleteNote(note.id)}>×</button>
            </article>)}
            {!visibleNotes(column.id).length && <div className="noteColumnEmpty">{tx(language, "Not yok", "No notes", "Nîşe tune")}</div>}
          </div>
        </section>)}
      </div>
      {addingTo && <NoteModal language={language} initialStatus={addingTo} users={users} columns={columns} onClose={() => setAddingTo(null)} onSave={(note) => { onCreateNote(note); setAddingTo(null); }} />}
      {editingNote && <NoteModal language={language} initialStatus={editingNote.status} initialNote={editingNote} users={users} columns={columns} onClose={() => setEditingNote(null)} onSave={(updated) => { onUpdateNote(updated); setEditingNote(null); }} />}
    </div>
  );
}

function NoteModal({ language, initialStatus, initialNote, initialRelation, initialRelationDetail, users, columns, onClose, onSave }: { language: Language; initialStatus: NoteStatus; initialNote?: FinanceNote; initialRelation?: NoteRelation; initialRelationDetail?: string; users: UserAccount[]; columns: { id: NoteStatus; label: string }[]; onClose: () => void; onSave: (note: FinanceNote) => void }) {
  const [title, setTitle] = useState(initialNote?.title ?? "");
  const [content, setContent] = useState(initialNote?.content ?? "");
  const [status, setStatus] = useState<NoteStatus>(initialStatus);
  const [relation, setRelation] = useState<NoteRelation>(initialNote?.relation ?? initialRelation ?? "none");
  const [relationDetail, setRelationDetail] = useState(initialNote?.relationDetail ?? initialRelationDetail ?? "");
  const [assignedUserIds, setAssignedUserIds] = useState<number[]>(initialNote?.assignedUserIds ?? []);
  const relationOptions: NoteRelation[] = ["none", "cash", "income", "expense", "reports", "archive", "other"];
  function toggleAssignee(userId: number, checked: boolean) {
    setAssignedUserIds((current) => (checked ? [...current, userId] : current.filter((id) => id !== userId)));
  }
  return <div className="overlay"><form className="modal noteModal" onSubmit={(event) => { event.preventDefault(); const now = new Date().toISOString(); if (title.trim() && content.trim()) onSave({ id: initialNote?.id ?? Date.now(), title: title.trim(), content: content.trim(), status, relation, relationDetail: relation === "none" ? "" : relationDetail.trim(), assignedUserIds, assignedUserNames: users.filter((u) => assignedUserIds.includes(u.id)).map((u) => u.name), isArchived: initialNote?.isArchived ?? false, archivedAt: initialNote?.archivedAt ?? null, createdAt: initialNote?.createdAt ?? now, updatedAt: now }); }}>
    <div className="modalHead"><div><h2>{initialNote ? tx(language, "Mali Notu Düzenle", "Edit Finance Note", "Nîşeya Darayî Biguherîne") : tx(language, "Yeni Mali Not", "New Finance Note", "Nîşeya Darayî ya Nû")}</h2><p>{tx(language, "Not bilgilerini ve bağlantılı olduğu bölümü belirleyin.", "Set the note details and its linked section.", "Agahiyên nîşeyê û beşa girêdayî diyar bikin.")}</p></div><button type="button" onClick={onClose}>×</button></div>
    <div className="formGrid"><label>{tx(language, "Not Başlığı", "Note Title", "Sernavê Nîşeyê")}<input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} /></label><label>{tx(language, "Not Durumu", "Note Status", "Rewşa Nîşeyê")}<select value={status} onChange={(event) => setStatus(event.target.value as NoteStatus)}>{columns.map((column) => <option key={column.id} value={column.id}>{column.label}</option>)}</select></label><label>{tx(language, "İlişkili Bölüm", "Linked Section", "Beşa Girêdayî")}<select value={relation} onChange={(event) => setRelation(event.target.value as NoteRelation)}>{relationOptions.map((option) => <option key={option} value={option}>{noteRelationLabel(option, language)}</option>)}</select></label><label>{tx(language, "İlişki Detayı", "Link Detail", "Hûrguliya Girêdanê")}<input value={relationDetail} disabled={relation === "none"} onChange={(event) => setRelationDetail(event.target.value)} placeholder={tx(language, "Örn. Ağustos 2026 veya kasa adı", "E.g. August 2026 or cash account", "Mînak: Tebax 2026 an navê qaseyê")} /></label>
      <label className="wide">
        {tx(language, "Kime Atanmış (Birden Fazla Seçilebilir)", "Assigned To (Multiple Allowed)", "Ji Kê Re Hatiye Vekirin (Bi Firehî)")}
        {users.length === 0 ? (
          <small>{tx(language, "Kayıtlı kullanıcı yok.", "No users available.", "Bikarhênerek tune ye.")}</small>
        ) : (
          <div className="userPermissionOptions">
            {users.map((u) => (
              <label key={u.id} className="userPermissionOption">
                <input
                  type="checkbox"
                  checked={assignedUserIds.includes(u.id)}
                  onChange={(event) => toggleAssignee(u.id, event.target.checked)}
                />
                {u.name}
              </label>
            ))}
          </div>
        )}
      </label>
      <label className="wide">{tx(language, "İçerik", "Description", "Naverok")}<textarea rows={6} value={content} onChange={(event) => setContent(event.target.value)} placeholder={tx(language, "Notun ayrıntılarını yazın…", "Write the note details…", "Hûrguliyên nîşeyê binivîse…")} /></label></div>
    <div className="modalActions"><button type="button" className="light" onClick={onClose}>{tx(language, "Vazgeç", "Cancel", "Betal Bike")}</button><button className="primary" disabled={!title.trim() || !content.trim()}>{initialNote ? tx(language, "Değişiklikleri Kaydet", "Save Changes", "Guherînan Tomar Bike") : tx(language, "Notu Kaydet", "Save Note", "Nîşeyê Tomar Bike")}</button></div>
  </form></div>;
}

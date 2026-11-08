"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Title } from "./shared";
import { tx, noteRelationLabel } from "../lib/i18n";
import type { FinanceNote, Language, NoteColumn, NoteComment, NoteRelation, NoteStatus, RecordAttachment, UserAccount } from "../lib/types";

// Düzenleme penceresinden çıkan not: belgeler yeni eklenenler + kaldırılacak sıra numaraları olarak gider.
export type NoteSave = FinanceNote & { addAttachments?: RecordAttachment[]; removeAttachmentIndexes?: number[] };

const DEFAULT_COLUMNS = (language: Language): NoteColumn[] => [
  { id: 1, key: "important", label: tx(language, "Önemli Notlar", "Important Notes", "Nîşeyên Girîng"), color: "#d6a52b" },
  { id: 2, key: "urgent", label: tx(language, "Acil Notlar", "Urgent Notes", "Nîşeyên Acîl"), color: "#df5b5b" },
  { id: 3, key: "pending", label: tx(language, "Bekleyen Notlar", "Pending Notes", "Nîşeyên Li Bendê"), color: "#398db1" },
  { id: 4, key: "completed", label: tx(language, "Tamamlanmış Notlar", "Completed Notes", "Nîşeyên Qediyayî"), color: "#38a477" },
];

const MAX_NOTE_ATTACHMENTS = 5;
const MAX_ATTACHMENT_BYTES = 6 * 1024 * 1024;

// Pdf/resim yeni sekmede açılır, diğer dosyalar indirilir.
function openDataFile(attachment: { name: string; data: string }) {
  try {
    const [header, base64] = attachment.data.split(",");
    const mime = /data:([^;]+)/.exec(header)?.[1] ?? "application/octet-stream";
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
    if (/^(application\/pdf|image\/)/.test(mime)) {
      window.open(url, "_blank");
    } else {
      const link = document.createElement("a");
      link.href = url;
      link.download = attachment.name;
      document.body.appendChild(link);
      link.click();
      link.remove();
    }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch {
    // Bozuk veri — sessizce geçilir.
  }
}

async function openNoteAttachment(noteId: number, index: number) {
  try {
    const response = await fetch(`/api/notes/${noteId}/attachments/${index}`);
    if (!response.ok) return;
    const data = await response.json();
    if (data.attachment) openDataFile(data.attachment);
  } catch {
    // Ağ hatası — belge açılmaz.
  }
}

export function Notes({
  language,
  notes,
  noteColumns,
  currentUserId,
  users,
  onCreateNote,
  onUpdateNote,
  onDeleteNote,
  onArchiveNote,
  onMarkAllRead,
  onChanged,
}: {
  language: Language;
  notes: FinanceNote[];
  noteColumns?: NoteColumn[];
  currentUserId?: number;
  users: UserAccount[];
  onCreateNote: (note: Partial<FinanceNote> & { addAttachments?: RecordAttachment[] }) => void;
  onUpdateNote: (note: NoteSave) => void;
  onDeleteNote: (id: number) => void;
  onArchiveNote: (id: number, archived: boolean) => void;
  onMarkAllRead?: () => void;
  onChanged?: () => void;
}) {
  const [addingTo, setAddingTo] = useState<NoteStatus | null>(null);
  const [editingNote, setEditingNote] = useState<FinanceNote | null>(null);
  const [messagesNote, setMessagesNote] = useState<FinanceNote | null>(null);
  const [dragOver, setDragOver] = useState<NoteStatus | null>(null);
  // Okunmamış notlar sayfa açılınca sunucuda "okundu" olur (rozet söner) ama kartlar
  // kullanıcı onlara dokunana kadar renkli kalır — hangi notların yeni olduğu görülebilsin.
  const [highlightIds, setHighlightIds] = useState<Set<number>>(new Set());
  const markedRef = useRef(false);
  useEffect(() => {
    const fresh = notes.filter((n) => n.isUnread && !n.isArchived).map((n) => n.id);
    if (fresh.length) {
      setHighlightIds((current) => {
        const next = new Set(current);
        for (const id of fresh) next.add(id);
        return next.size === current.size ? current : next;
      });
      // Sayfa açıkken yeni gelen notlar da okundu işaretlenir (rozet birikmesin).
      onMarkAllRead?.();
    } else if (!markedRef.current) {
      markedRef.current = true;
      onMarkAllRead?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes]);
  const dismissHighlight = (id: number) =>
    setHighlightIds((current) => {
      if (!current.has(id)) return current;
      const next = new Set(current);
      next.delete(id);
      return next;
    });

  const columns = noteColumns && noteColumns.length ? noteColumns : DEFAULT_COLUMNS(language);
  const firstKey = columns[0].key;
  // Arşivlenen notlar panoda görünmez (bkz. Arşiv > Notlar Arşivi). Silinmiş bir sütunun
  // anahtarını taşıyan not (olağan dışı) ilk sütunda gösterilir.
  const activeNotes = notes.filter((note) => !note.isArchived);
  const columnKeys = new Set(columns.map((c) => c.key));
  const visibleNotes = (status: NoteStatus) =>
    activeNotes
      .filter((note) => (columnKeys.has(note.status) ? note.status === status : status === firstKey))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const moveNote = (id: number, status: NoteStatus) => {
    const note = notes.find((x) => x.id === id);
    if (note) onUpdateNote({ ...note, status, updatedAt: new Date().toISOString() });
  };
  return (
    <div className="panel">
      <div className="toolbar">
        <Title
          title={tx(language, "Mali Özel Notları", "Private Finance Notes", "Nîşeyên Taybet ên Darayî")}
          sub={tx(language, "Kasa, gelir ve giderlerle ilgili özel açıklamalar", "Private notes about cash, income and expenses", "Daxuyaniyên taybet derbarê qase, dahat û mesrefan")}
        />
      </div>
      <div className="noteBoard" style={{ gridTemplateColumns: `repeat(${Math.max(columns.length, 1)}, minmax(220px, 1fr))` }}>
        {columns.map((column) => (
          <section
            className={`noteColumn noteColumn-${column.key}${dragOver === column.key ? " noteColumnDrop" : ""}`}
            key={column.key}
            onDragOver={(event) => { event.preventDefault(); setDragOver(column.key); }}
            onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragOver(null); }}
            onDrop={(event) => { event.preventDefault(); const id = Number(event.dataTransfer.getData("text/plain")); if (id) moveNote(id, column.key); setDragOver(null); }}
          >
            <header>
              <span className="noteColumnTitle"><i style={{ background: column.color }} />{column.label}</span>
              <span className="noteColumnActions">
                <button aria-label={`${column.label} - ${tx(language, "Not Ekle", "Add Note", "Nîşe Zêde Bike")}`} onClick={() => setAddingTo(column.key)}>＋</button>
                <b>{visibleNotes(column.key).length}</b>
              </span>
            </header>
            <div className="noteColumnBody">
              {visibleNotes(column.key).map((note) => {
                const isNew = highlightIds.has(note.id);
                const assignedToMe = currentUserId ? note.assignedUserIds.includes(currentUserId) : false;
                return (
                  <article
                    className={`noteCard${isNew ? " noteCardUnread" : ""}`}
                    style={{ borderLeftColor: isNew ? undefined : column.color }}
                    key={note.id}
                    draggable
                    onMouseEnter={() => isNew && dismissHighlight(note.id)}
                    onClick={() => dismissHighlight(note.id)}
                    onDragStart={(event) => { if ((event.target as HTMLElement).closest("button, select")) { event.preventDefault(); return; } event.dataTransfer.setData("text/plain", String(note.id)); event.dataTransfer.effectAllowed = "move"; }}
                    onDragEnd={() => setDragOver(null)}
                  >
                    {isNew && <span className="noteNewBadge">{tx(language, "YENİ", "NEW", "NÛ")}</span>}
                    <div className="noteMeta"><small>{new Date(note.updatedAt).toLocaleDateString(language === "en" ? "en-GB" : "tr-TR")}</small>{note.relation !== "none" && <span className="noteRelation">↗ {noteRelationLabel(note.relation, language)}{note.relationDetail ? ` · ${note.relationDetail}` : ""}</span>}</div>
                    <h3>{note.title}</h3><p>{note.content}</p>
                    {note.attachmentNames && note.attachmentNames.length > 0 && (
                      <div className="noteAttachments">
                        {note.attachmentNames.map((name, index) => (
                          <button type="button" key={`${name}-${index}`} className="noteAttachmentChip" title={name} onClick={() => openNoteAttachment(note.id, index)}>
                            📎 <span>{name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {note.assignedUserNames && note.assignedUserNames.length > 0 && (
                      <small className="noteAssigned">👤 {note.assignedUserNames.join(", ")}{assignedToMe ? ` (${tx(language, "siz", "you", "tu")})` : ""}</small>
                    )}
                    <label>{tx(language, "Durum", "Status", "Rewş")}<select value={columnKeys.has(note.status) ? note.status : firstKey} onChange={(event) => moveNote(note.id, event.target.value as NoteStatus)}>{columns.map((option) => <option value={option.key} key={option.key}>{option.label}</option>)}</select></label>
                    <button type="button" className="noteMessages" title={tx(language, "Mesajlar", "Messages", "Peyam")} aria-label={tx(language, "Mesajlar", "Messages", "Peyam")} onClick={() => setMessagesNote(note)}>💬{note.commentCount ? <b>{note.commentCount}</b> : null}</button>
                    <button type="button" className="noteEdit" title={tx(language, "Notu Düzenle", "Edit Note", "Nîşeyê Biguherîne")} aria-label={tx(language, "Notu Düzenle", "Edit Note", "Nîşeyê Biguherîne")} onClick={() => setEditingNote(note)}>✎</button>
                    <button type="button" className="noteArchive" title={tx(language, "Arşivle", "Archive", "Arşîv Bike")} aria-label={tx(language, "Arşivle", "Archive", "Arşîv Bike")} onClick={() => onArchiveNote(note.id, true)}>🗄</button>
                    <button className="noteDelete" title={tx(language, "Sil", "Delete", "Jêbirin")} onClick={() => onDeleteNote(note.id)}>×</button>
                  </article>
                );
              })}
              {!visibleNotes(column.key).length && <div className="noteColumnEmpty">{tx(language, "Not yok", "No notes", "Nîşe tune")}</div>}
            </div>
          </section>
        ))}
      </div>
      {addingTo && <NoteModal language={language} initialStatus={addingTo} users={users} columns={columns} onClose={() => setAddingTo(null)} onSave={(note) => { onCreateNote(note); setAddingTo(null); }} />}
      {editingNote && <NoteModal language={language} initialStatus={editingNote.status} initialNote={editingNote} users={users} columns={columns} onClose={() => setEditingNote(null)} onSave={(updated) => { onUpdateNote(updated); setEditingNote(null); }} />}
      {messagesNote && createPortal(<NoteMessagesModal language={language} note={messagesNote} onClose={() => { setMessagesNote(null); onChanged?.(); }} />, document.body)}
    </div>
  );
}

// Notla ilişkili (atanmış) kullanıcıların yazışması. Yönetici ve atanmış kullanıcılar yazabilir; diğerleri okur.
function NoteMessagesModal({ language, note, onClose }: { language: Language; note: FinanceNote; onClose: () => void }) {
  const [comments, setComments] = useState<NoteComment[] | null>(null);
  const [canPost, setCanPost] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/notes/${note.id}/comments`)
      .then((r) => (r.ok ? r.json() : { comments: [], canPost: false }))
      .then((data) => {
        if (cancelled) return;
        setComments(data.comments ?? []);
        setCanPost(Boolean(data.canPost));
      })
      .catch(() => !cancelled && setComments([]));
    return () => {
      cancelled = true;
    };
  }, [note.id]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [comments]);

  async function send() {
    const value = text.trim();
    if (!value || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/notes/${note.id}/comments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: value }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) setError(data.error || tx(language, "Mesaj gönderilemedi.", "The message could not be sent.", "Peyam nehat şandin."));
      else {
        setComments((current) => [...(current ?? []), data.comment]);
        setText("");
      }
    } catch {
      setError(tx(language, "Mesaj gönderilemedi.", "The message could not be sent.", "Peyam nehat şandin."));
    }
    setBusy(false);
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal commentsModal" onClick={(e) => e.stopPropagation()}>
        <div className="modalHead">
          <div>
            <h2>{tx(language, "Not Mesajları", "Note Messages", "Peyamên Nîşeyê")}</h2>
            <small>{note.title}{note.assignedUserNames?.length ? ` · 👤 ${note.assignedUserNames.join(", ")}` : ""}</small>
          </div>
          <button type="button" onClick={onClose}>×</button>
        </div>
        <div className="commentThread">
          <div className="commentList">
            {comments === null ? (
              <small>{tx(language, "Yükleniyor…", "Loading…", "Tê barkirin…")}</small>
            ) : comments.length === 0 ? (
              <small className="commentEmpty">{tx(language, "Henüz mesaj yok.", "No messages yet.", "Hîn peyam tune.")}</small>
            ) : (
              comments.map((c) => (
                <div className="commentItem" key={c.id}>
                  <div className="commentItemLine">
                    <strong>{c.userName}</strong>
                    <small>{new Date(c.createdAt).toLocaleString(language === "en" ? "en-GB" : "tr-TR")}</small>
                    <span className="commentItemText">{c.text}</span>
                  </div>
                </div>
              ))
            )}
            <div ref={endRef} />
          </div>
          {canPost ? (
            <form className="commentReplyForm" onSubmit={(e) => { e.preventDefault(); send(); }}>
              <div className="commentReplyBox">
                <textarea rows={2} value={text} disabled={busy} onChange={(e) => setText(e.target.value)} placeholder={tx(language, "Mesajınızı yazın…", "Write your message…", "Peyama xwe binivîse…")} />
              </div>
              <button type="submit" className="primary" disabled={busy || !text.trim()}>{tx(language, "Gönder", "Send", "Bişîne")}</button>
            </form>
          ) : (
            <small className="commentEmpty">{tx(language, "Bu nota yalnızca atanan kullanıcılar ve yöneticiler mesaj yazabilir.", "Only assigned users and admins can write messages on this note.", "Tenê bikarhênerên diyarkirî û rêveber dikarin peyam binivîsin.")}</small>
          )}
          {error && <small className="redText">{error}</small>}
        </div>
      </div>
    </div>
  );
}

function NoteModal({ language, initialStatus, initialNote, initialRelation, initialRelationDetail, users, columns, onClose, onSave }: { language: Language; initialStatus: NoteStatus; initialNote?: FinanceNote; initialRelation?: NoteRelation; initialRelationDetail?: string; users: UserAccount[]; columns: NoteColumn[]; onClose: () => void; onSave: (note: NoteSave) => void }) {
  const [title, setTitle] = useState(initialNote?.title ?? "");
  const [content, setContent] = useState(initialNote?.content ?? "");
  const [status, setStatus] = useState<NoteStatus>(initialStatus);
  const [relation, setRelation] = useState<NoteRelation>(initialNote?.relation ?? initialRelation ?? "none");
  const [relationDetail, setRelationDetail] = useState(initialNote?.relationDetail ?? initialRelationDetail ?? "");
  const [assignedUserIds, setAssignedUserIds] = useState<number[]>(initialNote?.assignedUserIds ?? []);
  // Mevcut belgeler (adlar) — kaldırılacaklar işaretlenir; yeni belgeler tam veriyle eklenir.
  const existingNames = initialNote?.attachmentNames ?? [];
  const [removedIdx, setRemovedIdx] = useState<number[]>([]);
  const [newFiles, setNewFiles] = useState<RecordAttachment[]>([]);
  const [fileError, setFileError] = useState("");
  // Dosya okunurken Kaydet'e basılırsa belge kayda girmiyordu: okuma bitene kadar Kaydet bekletilir.
  const [readingFiles, setReadingFiles] = useState(0);
  const relationOptions: NoteRelation[] = ["none", "cash", "income", "expense", "reports", "archive", "other"];
  const keptCount = existingNames.length - removedIdx.length;
  function toggleAssignee(userId: number, checked: boolean) {
    setAssignedUserIds((current) => (checked ? [...current, userId] : current.filter((id) => id !== userId)));
  }
  function pickFiles(files: FileList | null) {
    if (!files) return;
    setFileError("");
    for (const file of Array.from(files)) {
      if (file.size > MAX_ATTACHMENT_BYTES) {
        setFileError(tx(language, `"${file.name}" çok büyük (en fazla 6MB).`, `"${file.name}" is too large (max 6MB).`, `"${file.name}" pir mezin e (herî zêde 6MB).`));
        continue;
      }
      const reader = new FileReader();
      setReadingFiles((n) => n + 1);
      reader.onerror = () => {
        setReadingFiles((n) => Math.max(0, n - 1));
        setFileError(tx(language, `"${file.name}" okunamadı.`, `"${file.name}" could not be read.`, `"${file.name}" nehat xwendin.`));
      };
      reader.onload = () => {
        setReadingFiles((n) => Math.max(0, n - 1));
        setNewFiles((current) => {
          if (keptCount + current.length >= MAX_NOTE_ATTACHMENTS) {
            setFileError(tx(language, `En fazla ${MAX_NOTE_ATTACHMENTS} belge eklenebilir.`, `You can attach at most ${MAX_NOTE_ATTACHMENTS} files.`, `Herî zêde ${MAX_NOTE_ATTACHMENTS} pel dikarin werin pêvekirin.`));
            return current;
          }
          return [...current, { name: file.name, data: String(reader.result) }];
        });
      };
      reader.readAsDataURL(file);
    }
  }
  return <div className="overlay"><form className="modal noteModal" onSubmit={(event) => { event.preventDefault(); const now = new Date().toISOString(); if (title.trim() && content.trim()) onSave({ id: initialNote?.id ?? Date.now(), title: title.trim(), content: content.trim(), status, relation, relationDetail: relation === "none" ? "" : relationDetail.trim(), assignedUserIds, assignedUserNames: users.filter((u) => assignedUserIds.includes(u.id)).map((u) => u.name), isArchived: initialNote?.isArchived ?? false, archivedAt: initialNote?.archivedAt ?? null, createdAt: initialNote?.createdAt ?? now, updatedAt: now, addAttachments: newFiles, removeAttachmentIndexes: removedIdx }); }}>
    <div className="modalHead"><div><h2>{initialNote ? tx(language, "Mali Notu Düzenle", "Edit Finance Note", "Nîşeya Darayî Biguherîne") : tx(language, "Yeni Mali Not", "New Finance Note", "Nîşeya Darayî ya Nû")}</h2><p>{tx(language, "Not bilgilerini ve bağlantılı olduğu bölümü belirleyin.", "Set the note details and its linked section.", "Agahiyên nîşeyê û beşa girêdayî diyar bikin.")}</p></div><button type="button" onClick={onClose}>×</button></div>
    <div className="formGrid"><label>{tx(language, "Not Başlığı", "Note Title", "Sernavê Nîşeyê")}<input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} /></label><label>{tx(language, "Not Durumu", "Note Status", "Rewşa Nîşeyê")}<select value={status} onChange={(event) => setStatus(event.target.value as NoteStatus)}>{columns.map((column) => <option key={column.key} value={column.key}>{column.label}</option>)}</select></label><label>{tx(language, "İlişkili Bölüm", "Linked Section", "Beşa Girêdayî")}<select value={relation} onChange={(event) => setRelation(event.target.value as NoteRelation)}>{relationOptions.map((option) => <option key={option} value={option}>{noteRelationLabel(option, language)}</option>)}</select></label><label>{tx(language, "İlişki Detayı", "Link Detail", "Hûrguliya Girêdanê")}<input value={relationDetail} disabled={relation === "none"} onChange={(event) => setRelationDetail(event.target.value)} placeholder={tx(language, "Örn. Ağustos 2026 veya kasa adı", "E.g. August 2026 or cash account", "Mînak: Tebax 2026 an navê qaseyê")} /></label>
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
        <small className="listKasaHint">{tx(language, "Atanan kullanıcılar bu nota mesaj yazabilir.", "Assigned users can write messages on this note.", "Bikarhênerên diyarkirî dikarin li ser vê nîşeyê peyam binivîsin.")}</small>
      </label>
      <label className="wide">{tx(language, "İçerik", "Description", "Naverok")}<textarea rows={6} value={content} onChange={(event) => setContent(event.target.value)} placeholder={tx(language, "Notun ayrıntılarını yazın…", "Write the note details…", "Hûrguliyên nîşeyê binivîse…")} /></label>
      <label className="wide">
        {tx(language, "Belgeler (Excel/Office/PDF/Resim)", "Documents (Excel/Office/PDF/Image)", "Belge (Excel/Office/PDF/Wêne)")}
        <div className="attachmentField">
          <input type="file" multiple accept=".xlsx,.xls,.csv,.doc,.docx,.ppt,.pptx,.pdf,.png,.jpg,.jpeg" disabled={keptCount + newFiles.length >= MAX_NOTE_ATTACHMENTS} onChange={(e) => { pickFiles(e.target.files); e.target.value = ""; }} />
        </div>
        {(existingNames.length > 0 || newFiles.length > 0) && (
          <ul className="attachmentList">
            {existingNames.map((name, index) => !removedIdx.includes(index) && (
              <li key={`old-${index}`}>
                <small className="attachmentFieldName">{name}</small>
                {initialNote && <button type="button" className="light compact" onClick={() => openNoteAttachment(initialNote.id, index)}>⇩ {tx(language, "Aç / İndir", "Open / Download", "Veke / Daxîne")}</button>}
                <button type="button" className="light compact" onClick={() => setRemovedIdx((c) => [...c, index])}>{tx(language, "Kaldır", "Remove", "Rake")}</button>
              </li>
            ))}
            {newFiles.map((file, index) => (
              <li key={`new-${index}`}>
                <small className="attachmentFieldName">{file.name}</small>
                <button type="button" className="light compact" onClick={() => setNewFiles((c) => c.filter((_, i) => i !== index))}>{tx(language, "Kaldır", "Remove", "Rake")}</button>
              </li>
            ))}
          </ul>
        )}
        {fileError && <small className="redText">{fileError}</small>}
      </label></div>
    <div className="modalActions"><button type="button" className="light" onClick={onClose}>{tx(language, "Vazgeç", "Cancel", "Betal Bike")}</button><button className="primary" disabled={!title.trim() || !content.trim() || readingFiles > 0}>{readingFiles > 0 ? tx(language, "⏳ Dosya yükleniyor…", "⏳ Loading file…", "⏳ Pel tê barkirin…") : initialNote ? tx(language, "Değişiklikleri Kaydet", "Save Changes", "Guherînan Tomar Bike") : tx(language, "Notu Kaydet", "Save Note", "Nîşeyê Tomar Bike")}</button></div>
  </form></div>;
}

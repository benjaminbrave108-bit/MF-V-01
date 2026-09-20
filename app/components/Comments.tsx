"use client";

import { useEffect, useState } from "react";
import { Title } from "./shared";
import { tx, localizeData, nav } from "../lib/i18n";
import { date, money } from "../lib/finance";
import type { Language, RecordComment, RecordItem } from "../lib/types";

const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

// One comment's reaction pills (existing reactions, click to toggle yours)
// plus a "🙂+" button that reveals REACTION_EMOJIS to add a new one — the
// "kalp işareti içinde +" style add-reaction control.
function CommentReactions({
  reactions,
  onToggle,
}: {
  reactions: RecordComment["reactions"];
  onToggle: (emoji: string) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  return (
    <div className="commentReactions">
      {reactions.map((r) => (
        <button
          key={r.emoji}
          type="button"
          className={`commentReactionPill${r.mine ? " mine" : ""}`}
          onClick={() => onToggle(r.emoji)}
        >
          {r.emoji} {r.count}
        </button>
      ))}
      <div className="commentReactionAddWrap">
        <button
          type="button"
          className="commentReactionAdd"
          onClick={() => setPickerOpen((v) => !v)}
          aria-label="Emoji ekle"
        >
          🙂+
        </button>
        {pickerOpen && (
          <div className="commentReactionPicker" onMouseLeave={() => setPickerOpen(false)}>
            {REACTION_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  onToggle(emoji);
                  setPickerOpen(false);
                }}
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Shared by RecordCommentsModal (one record, opened from its Kasalar/Gelir/
// Gider row) and the Yorumlar page below (every commented record at once):
// same list + reply box, same POST target — a comment made through either
// entry point lands in the exact same thread.
export function CommentThread({
  language,
  comments,
  onAddComment,
  onToggleReaction,
  busy,
}: {
  language: Language;
  comments: RecordComment[];
  onAddComment: (text: string, isAttention: boolean) => void;
  onToggleReaction: (commentId: number, emoji: string) => void;
  busy: boolean;
}) {
  const [text, setText] = useState("");
  const [isAttention, setIsAttention] = useState(false);
  return (
    <div className="commentThread">
      <div className="commentList">
        {comments.length === 0 ? (
          <small className="commentEmpty">
            {tx(language, "Henüz yorum yok.", "No comments yet.", "Hîn şîrove tune.")}
          </small>
        ) : (
          comments.map((c) => (
            <div className={`commentItem${c.isAttention ? " commentItemAttention" : ""}`} key={c.id}>
              <div className="commentItemLine">
                {c.isAttention && (
                  <span className="commentAttentionBadge" title={tx(language, "Dikkat", "Attention", "Balkêşî")}>
                    ⚠️
                  </span>
                )}
                <strong>{c.userName || tx(language, "Silinmiş kullanıcı", "Deleted user", "Bikarhênerê hatiye jêbirin")}</strong>
                <small>{new Date(c.createdAt).toLocaleString(language === "en" ? "en-GB" : "tr-TR")}</small>
                <span className="commentItemText">{c.text}</span>
              </div>
              <CommentReactions reactions={c.reactions} onToggle={(emoji) => onToggleReaction(c.id, emoji)} />
            </div>
          ))
        )}
      </div>
      <form
        className="commentReplyForm"
        onSubmit={(e) => {
          e.preventDefault();
          const trimmed = text.trim();
          if (!trimmed || busy) return;
          onAddComment(trimmed, isAttention);
          setText("");
          setIsAttention(false);
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
          <label className="commentAttentionToggle">
            <input type="checkbox" checked={isAttention} onChange={(e) => setIsAttention(e.target.checked)} disabled={busy} />
            ⚠️ {tx(language, "Dikkat", "Attention", "Balkêşî")}
          </label>
        </div>
        <button type="submit" className="primary" disabled={busy || !text.trim()}>
          {tx(language, "Gönder", "Send", "Bişîne")}
        </button>
      </form>
    </div>
  );
}

async function postReactionToggle(commentId: number, emoji: string): Promise<RecordComment["reactions"] | null> {
  try {
    const response = await fetch(`/api/comments/${commentId}/reactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emoji }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data.reactions ?? [];
  } catch {
    return null;
  }
}

// Opened from the "💬" action on a Kasalar/Gelir/Gider row — this record's
// own thread, same data the Yorumlar page shows once it has ≥1 comment.
export function RecordCommentsModal({
  language,
  record,
  onClose,
  onRead,
}: {
  language: Language;
  record: RecordItem;
  onClose: () => void;
  onRead?: () => void;
}) {
  const [comments, setComments] = useState<RecordComment[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`/api/records/${record.id}/comments`);
        const data = await response.json().catch(() => ({}));
        if (!cancelled) setComments(response.ok ? (data.comments ?? []) : []);
      } catch {
        if (!cancelled) setComments([]);
      }
      // Opening this record's thread reads it — drops the "Yorumlar" sidebar
      // badge by however many unread comments were in it.
      try {
        await fetch(`/api/records/${record.id}/comments/read`, { method: "POST" });
        if (!cancelled) onRead?.();
      } catch {
        // Non-fatal — the badge just won't update until the next open/poll.
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record.id]);

  async function addComment(text: string, isAttention: boolean) {
    setBusy(true);
    try {
      const response = await fetch(`/api/records/${record.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, isAttention }),
      });
      if (!response.ok) {
        alert(tx(language, "Yorum gönderilemedi.", "The comment could not be sent.", "Şîrove nehat şandin."));
        return;
      }
      const data = await response.json();
      setComments((current) => [...(current ?? []), data.comment]);
    } catch {
      alert(tx(language, "Yorum gönderilemedi.", "The comment could not be sent.", "Şîrove nehat şandin."));
    } finally {
      setBusy(false);
    }
  }

  async function toggleReaction(commentId: number, emoji: string) {
    const reactions = await postReactionToggle(commentId, emoji);
    if (reactions === null) return;
    setComments((current) => (current ?? []).map((c) => (c.id === commentId ? { ...c, reactions } : c)));
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal commentsModal" onClick={(e) => e.stopPropagation()}>
        <div className="modalHead">
          <div>
            <h2>{tx(language, "Yorumlar", "Comments", "Şîrove")}</h2>
            <small>{localizeData(record.source, language)}</small>
          </div>
          <button type="button" onClick={onClose}>
            ×
          </button>
        </div>
        {comments === null ? (
          <small>{tx(language, "Yükleniyor…", "Loading…", "Tê barkirin…")}</small>
        ) : (
          <CommentThread
            language={language}
            comments={comments}
            onAddComment={addComment}
            onToggleReaction={toggleReaction}
            busy={busy}
          />
        )}
      </div>
    </div>
  );
}

// Mali Özel Notlar > Yorumlar: every record that has at least one comment,
// as a card carrying that record's own info (kasa/kind, tag, amount) with
// its full thread inline — replying here posts to the exact same thread the
// "💬" row action on Kasalar/Gelir/Gider opens.
export function Comments({ language, onRead }: { language: Language; onRead?: () => void }) {
  const [threads, setThreads] = useState<{ record: RecordItem; comments: RecordComment[]; hasUnread: boolean }[] | null>(null);
  const [busyRecordId, setBusyRecordId] = useState<number | null>(null);
  const [tab, setTab] = useState<"all" | "attention">("all");
  // Solda başlık listesi, sağda seçilen başlığın yorum ipliği — Notes tarzı
  // ana/detay görünümü. Sekme değişince veya seçili başlık artık listede
  // yoksa (attention filtresine takılınca vs.) ilk görünen başlığa döner.
  const [selectedId, setSelectedId] = useState<number | null>(null);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    try {
      const response = await fetch("/api/comments");
      const data = await response.json().catch(() => ({}));
      setThreads(response.ok ? (data.threads ?? []) : []);
    } catch {
      setThreads([]);
    }
  }

  // Okunmamışlar sayfayı açar açmaz değil, kullanıcı o başlığı gerçekten
  // seçtiğinde (soldaki listeden tıklayınca ya da ilk başlık otomatik
  // seçilince) okunmuş sayılır — böylece liste açıldığı anda her şey
  // "okundu" olup gitmez, hangi başlıkların okunmadığı görülebilir kalır.
  useEffect(() => {
    if (selectedId === null) return;
    const thread = (threads ?? []).find((t) => t.record.id === selectedId);
    if (!thread || !thread.hasUnread) return;
    (async () => {
      try {
        await fetch(`/api/records/${selectedId}/comments/read`, { method: "POST" });
        setThreads((current) => (current ?? []).map((t) => (t.record.id === selectedId ? { ...t, hasUnread: false } : t)));
        onRead?.();
      } catch {
        // Non-fatal — the badge/dot just won't update until the next open/poll.
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, threads]);

  async function addComment(recordId: number, text: string, isAttention: boolean) {
    setBusyRecordId(recordId);
    try {
      const response = await fetch(`/api/records/${recordId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, isAttention }),
      });
      if (!response.ok) {
        alert(tx(language, "Yorum gönderilemedi.", "The comment could not be sent.", "Şîrove nehat şandin."));
        return;
      }
      const data = await response.json();
      setThreads((current) =>
        (current ?? []).map((t) => (t.record.id === recordId ? { ...t, comments: [...t.comments, data.comment] } : t)),
      );
    } catch {
      alert(tx(language, "Yorum gönderilemedi.", "The comment could not be sent.", "Şîrove nehat şandin."));
    } finally {
      setBusyRecordId(null);
    }
  }

  async function toggleReaction(recordId: number, commentId: number, emoji: string) {
    const reactions = await postReactionToggle(commentId, emoji);
    if (reactions === null) return;
    setThreads((current) =>
      (current ?? []).map((t) =>
        t.record.id === recordId
          ? { ...t, comments: t.comments.map((c) => (c.id === commentId ? { ...c, reactions } : c)) }
          : t,
      ),
    );
  }

  const attentionThreads = (threads ?? []).filter((t) => t.comments.some((c) => c.isAttention));
  const unreadThreadCount = (threads ?? []).filter((t) => t.hasUnread).length;
  const unreadAttentionCount = attentionThreads.filter((t) => t.hasUnread).length;
  const visibleThreads = tab === "attention" ? attentionThreads : threads ?? [];
  useEffect(() => {
    if (!visibleThreads.some((t) => t.record.id === selectedId)) {
      setSelectedId(visibleThreads[0]?.record.id ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleThreads.map((t) => t.record.id).join(","), tab]);
  const selected = visibleThreads.find((t) => t.record.id === selectedId) ?? null;

  return (
    <div className="panel">
      <Title
        title={tx(language, "Yorumlar", "Comments", "Şîrove")}
        sub={tx(
          language,
          "Kasa, gelir ve gider kayıtlarına yapılan yorumlar — soldan bir başlık seçin, o kaydın yorum ipliği sağda açılır.",
          "Comments made on cash, income and expense records — pick a title on the left, its thread opens on the right.",
          "Şîroveyên li ser qeydên qase, dahat û mesrefan — ji milê çepê sernavekê hilbijêre, riştê şîroveyê li rastê vebe.",
        )}
      />
      <div className="settingsMainTabs commentsMainTabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "all"} className={tab === "all" ? "active" : ""} onClick={() => setTab("all")}>
          {tx(language, "Tüm Yorumlar", "All Comments", "Hemû Şîrove")}
          {unreadThreadCount > 0 && <b className="tabBarCount">{unreadThreadCount}</b>}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "attention"}
          className={tab === "attention" ? "active" : ""}
          onClick={() => setTab("attention")}
        >
          ⚠️ {tx(language, "Dikkat Yorumları", "Attention Comments", "Şîroveyên Balkêş")}
          {unreadAttentionCount > 0 && <b className="tabBarCount">{unreadAttentionCount}</b>}
        </button>
      </div>
      {threads === null ? (
        <small>{tx(language, "Yükleniyor…", "Loading…", "Tê barkirin…")}</small>
      ) : tab === "attention" && !attentionThreads.length ? (
        <small>
          {tx(
            language,
            "Dikkat işaretli bir yorum yok. Bir yorumu gönderirken \"⚠️ Dikkat\" kutusunu işaretleyerek burada göstermesini sağlayabilirsiniz.",
            "No comment is flagged for attention. Check \"⚠️ Attention\" when sending a comment to have it show up here.",
            "Şîroveya bi nîşana balkêşiyê tune. Dema şîroveyekê dişînin, bi nîşankirina qutiya \"⚠️ Balkêşî\" hûn dikarin wê li vir nîşan bidin.",
          )}
        </small>
      ) : !threads.length ? (
        <small>
          {tx(
            language,
            "Henüz yorum yapılmış bir kayıt yok. Kasalar, Gelir veya Gider sayfasındaki bir satırın 💬 simgesinden başlayabilirsiniz.",
            "No record has a comment yet. Start one from the 💬 icon on a row in Kasalar, Gelir or Gider.",
            "Hîn qeydek bi şîrove tune. Hûn dikarin ji sembola 💬 ya rêzek li Kasalar, Gelir an Gider dest pê bikin.",
          )}
        </small>
      ) : (
        <div className="commentSplitView">
          <div className="commentSplitList">
            {visibleThreads.map(({ record, comments, hasUnread }) => {
              const last = comments[comments.length - 1];
              const hasAttention = comments.some((c) => c.isAttention);
              return (
                <button
                  type="button"
                  key={record.id}
                  className={`commentListItem${selectedId === record.id ? " active" : ""}${hasUnread ? " unread" : ""}`}
                  onClick={() => setSelectedId(record.id)}
                >
                  <span className="commentListItemHead">
                    <strong>
                      {hasUnread && <span className="commentUnreadDot" title={tx(language, "Okunmadı", "Unread", "Nexwendî")} />}
                      {localizeData(record.source, language)}
                    </strong>
                    <span className="amount">{money(record.amount, record.currency)}</span>
                  </span>
                  <small>
                    {date(record.date, language)} · {nav.find((n) => n.id === record.kind)?.label[language] ?? record.kind}
                  </small>
                  {last && (
                    <p className="commentListItemPreview">
                      {hasAttention && "⚠️ "}
                      <b>{last.userName}:</b> {last.text}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
          <div className="commentSplitDetail">
            {selected ? (
              <article className="commentCard" key={selected.record.id}>
                <header>
                  <div>
                    <strong>{localizeData(selected.record.source, language)}</strong>
                    <small>
                      {date(selected.record.date, language)} · {nav.find((n) => n.id === selected.record.kind)?.label[language] ?? selected.record.kind}
                    </small>
                  </div>
                </header>
                {selected.record.tags?.length ? (
                  <div className="tagRow">
                    {selected.record.tags.map((t) => (
                      <span key={t}>{localizeData(t, language)}</span>
                    ))}
                  </div>
                ) : null}
                <CommentThread
                  language={language}
                  comments={selected.comments}
                  onAddComment={(text, isAttention) => addComment(selected.record.id, text, isAttention)}
                  onToggleReaction={(commentId, emoji) => toggleReaction(selected.record.id, commentId, emoji)}
                  busy={busyRecordId === selected.record.id}
                />
              </article>
            ) : (
              <div className="commentSplitEmpty">
                {tx(language, "Soldan bir kayıt seçin.", "Select a record on the left.", "Ji milê çepê qeydekê hilbijêre.")}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Title } from "./shared";
import { date as formatDate, money } from "../lib/finance";
import { tx } from "../lib/i18n";
import type { Language, UserAccount } from "../lib/types";

// Proje Aşaması 2 — Liste defteri (Taslak 1). Bir liste; tarihi, kodu, adı ve
// çalışma alanı olan bir defterdir: liste geliri kişilere dağıtılır, liste
// gideri kişiler arasında paylaştırılır, her kişinin bakiyesi (aldığı − payı)
// ve liste kasasında kalan tutar bu sayfada hesaplanır. Liste gelir/gider
// kayıtlarının kendisi Gelir/Gider sayfalarında "Liste Kaydı" ile girilir.
type Member = { id: number; name: string };
type Distribution = { id: number; memberId: number; amount: number; date: string; note: string };
type ListIncome = { id: number; date: string; source: string; detail: string; amount: number; currency: string };
type ListExpense = ListIncome & { shares: { memberId: number; amount: number }[] };
type Balance = { memberId: number; name: string; received: number; share: number; balance: number };
type ListDetail = {
  id: number;
  code: string;
  name: string;
  date: string;
  currency: string;
  ownerUserId: number | null;
  ownerName: string;
  canWrite: boolean;
  members: Member[];
  distributions: Distribution[];
  incomes: ListIncome[];
  expenses: ListExpense[];
  balances: Balance[];
  totals: { income: number; expense: number; distributed: number; listCash: number; unsharedExpense: number; net: number };
};

const today = () => new Date().toISOString().slice(0, 10);
const CURRENCIES = ["USD", "IQD", "TRY", "EUR"];

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

export function Lists({
  language,
  users,
  isSuperAdmin,
  currentUserName,
}: {
  language: Language;
  users: UserAccount[];
  isSuperAdmin: boolean;
  currentUserName: string;
}) {
  const [lists, setLists] = useState<ListDetail[] | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editing, setEditing] = useState<ListDetail | "new" | null>(null);
  const [sharing, setSharing] = useState<ListExpense | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const result = await api<{ lists: ListDetail[] }>("/api/lists", "GET");
    if (result.ok) setLists(result.data.lists);
    else setError(result.error);
  }, []);
  useEffect(() => {
    load();
    // Liste gelir/giderleri başka sayfalardan girildiği için ekran periyodik tazelenir.
    const interval = setInterval(load, 20000);
    return () => clearInterval(interval);
  }, [load]);

  const selected = useMemo(() => lists?.find((l) => l.id === selectedId) ?? null, [lists, selectedId]);
  function replaceList(list: ListDetail) {
    setLists((prev) => (prev ? prev.map((l) => (l.id === list.id ? list : l)) : prev));
  }
  async function mutate(url: string, method: string, body?: unknown): Promise<boolean> {
    const result = await api<{ list: ListDetail }>(url, method, body);
    if (!result.ok) {
      alert(result.error);
      return false;
    }
    if (result.data.list) replaceList(result.data.list);
    return true;
  }

  const t = {
    title: tx(language, "Listeler", "Lists", "Lîste"),
    sub: tx(language, "Liste geliri, kişilere dağıtım, gider paylaşımı ve kişi bakiyeleri", "List income, distributions, expense sharing and per-person balances", "Dahata lîsteyê, dabeşkirin, parvekirina mesrefê û bakiyeyên kesan"),
  };

  return (
    <section className="listsPage">
      <Title title={t.title} sub={t.sub} />
      {error && <p className="listsError">{error}</p>}
      {!selected && (
        <>
          <div className="listsToolbar">
            <button className="primary" onClick={() => setEditing("new")}>
              ＋ {tx(language, "Yeni Liste", "New List", "Lîsteya Nû")}
            </button>
          </div>
          {lists === null && <p className="listsHint">…</p>}
          {lists?.length === 0 && (
            <p className="listsHint">
              {tx(language, "Henüz liste yok. Yeni Liste ile ilk listenizi oluşturun.", "No lists yet. Create your first list with New List.", "Hê lîste tune. Bi Lîsteya Nû ya yekem biafirînin.")}
            </p>
          )}
          <div className="listCards">
            {lists?.map((l) => {
              const indebted = l.balances.filter((b) => b.balance < 0).length;
              return (
                <button key={l.id} type="button" className="listCard" onClick={() => setSelectedId(l.id)}>
                  <span className="listCardCode">{l.code}</span>
                  <strong>{l.name}</strong>
                  <small>
                    {formatDate(l.date, language)} · {l.ownerName || "—"}
                  </small>
                  <dl>
                    <div>
                      <dt>{tx(language, "Gelir", "Income", "Dahat")}</dt>
                      <dd>{money(l.totals.income, l.currency)}</dd>
                    </div>
                    <div>
                      <dt>{tx(language, "Liste kasasında", "In list cash", "Di qasaya lîsteyê de")}</dt>
                      <dd>{money(l.totals.listCash, l.currency)}</dd>
                    </div>
                    <div>
                      <dt>{tx(language, "Borçlu kişi", "In debt", "Kesên deyndar")}</dt>
                      <dd className={indebted ? "negative" : undefined}>{indebted}</dd>
                    </div>
                  </dl>
                </button>
              );
            })}
          </div>
        </>
      )}
      {selected && (
        <ListDetailView
          language={language}
          list={selected}
          onBack={() => setSelectedId(null)}
          onEdit={() => setEditing(selected)}
          onShare={(expense) => setSharing(expense)}
          onAddDistribution={(body) => mutate(`/api/lists/${selected.id}/distributions`, "POST", body)}
          onDeleteDistribution={(distId) => mutate(`/api/lists/${selected.id}/distributions/${distId}`, "DELETE")}
          onDelete={async () => {
            if (!confirm(tx(language, "Liste silinsin mi? Gelir/gider kayıtları silinmez, yalnızca listeden ayrılır; dağıtım ve paylaşımlar silinir.", "Delete this list? Income/expense records are kept but detached; distributions and shares are deleted.", "Lîste were jêbirin? Tomarên dahat/mesrefê namînin, tenê têne veqetandin; dabeşkirin û parvekirin têne jêbirin."))) return;
            const result = await api(`/api/lists/${selected.id}`, "DELETE");
            if (!result.ok) return alert(result.error);
            setSelectedId(null);
            load();
          }}
        />
      )}
      {editing && (
        <ListFormModal
          language={language}
          list={editing === "new" ? null : editing}
          users={users}
          isSuperAdmin={isSuperAdmin}
          currentUserName={currentUserName}
          onClose={() => setEditing(null)}
          onSaved={(list) => {
            setEditing(null);
            setSelectedId(list.id);
            load();
          }}
        />
      )}
      {sharing && selected && (
        <ShareModal
          language={language}
          list={selected}
          expense={sharing}
          onClose={() => setSharing(null)}
          onSave={async (shares) => {
            if (await mutate(`/api/records/${sharing.id}/shares`, "PUT", { shares })) setSharing(null);
          }}
        />
      )}
    </section>
  );
}

function ListDetailView({
  language,
  list,
  onBack,
  onEdit,
  onDelete,
  onShare,
  onAddDistribution,
  onDeleteDistribution,
}: {
  language: Language;
  list: ListDetail;
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onShare: (expense: ListExpense) => void;
  onAddDistribution: (body: { memberId: number; amount: number; date: string; note: string }) => Promise<boolean>;
  onDeleteDistribution: (id: number) => Promise<boolean>;
}) {
  const [memberId, setMemberId] = useState<number | "">("");
  const [amount, setAmount] = useState("");
  const [dDate, setDDate] = useState(today());
  const [note, setNote] = useState("");
  const memberName = (id: number) => list.members.find((m) => m.id === id)?.name ?? "—";
  const c = list.currency;
  const personTotal = list.balances.reduce((a, b) => a + b.balance, 0);
  const check = Math.round((personTotal + list.totals.listCash) * 100) / 100;
  const expected = Math.round((list.totals.net + list.totals.unsharedExpense) * 100) / 100;

  return (
    <div className="listDetail">
      <div className="listDetailHead">
        <button className="light compact" onClick={onBack}>
          ← {tx(language, "Listeler", "Lists", "Lîste")}
        </button>
        <div className="listDetailTitle">
          <span className="listCardCode">{list.code}</span>
          <h3>{list.name}</h3>
          <small>
            {formatDate(list.date, language)} · {tx(language, "Çalışma alanı", "Workspace", "Qada xebatê")}: {list.ownerName || "—"} · {c}
          </small>
        </div>
        {list.canWrite && (
          <div className="listDetailActions">
            <button className="light compact" onClick={onEdit}>
              {tx(language, "Düzenle", "Edit", "Biguherîne")}
            </button>
            <button className="light compact danger" onClick={onDelete}>
              {tx(language, "Sil", "Delete", "Jê bibe")}
            </button>
          </div>
        )}
      </div>

      <div className="listMetrics">
        <div><small>{tx(language, "Liste geliri", "List income", "Dahata lîsteyê")}</small><b>{money(list.totals.income, c)}</b></div>
        <div><small>{tx(language, "Dağıtılan", "Distributed", "Hatiye dabeşkirin")}</small><b>{money(list.totals.distributed, c)}</b></div>
        <div><small>{tx(language, "Liste kasasında", "In list cash", "Di qasaya lîsteyê de")}</small><b className={list.totals.listCash < 0 ? "negative" : undefined}>{money(list.totals.listCash, c)}</b></div>
        <div><small>{tx(language, "Liste gideri", "List expense", "Mesrefa lîsteyê")}</small><b>{money(list.totals.expense, c)}</b></div>
      </div>

      <h4>{tx(language, "1) Liste geliri", "1) List income", "1) Dahata lîsteyê")}</h4>
      {list.incomes.length === 0 ? (
        <p className="listsHint">
          {tx(language, "Henüz gelir yok. Gelir sayfasında kayıt eklerken “Liste Kaydı”nı işaretleyip bu listeyi seçin.", "No income yet. On the Income page, tick “List record” and pick this list when adding a record.", "Hê dahat tune. Di rûpela Dahat de “Tomara Lîsteyê” hilbijêrin û vê lîsteyê hilbijêrin.")}
        </p>
      ) : (
        <table className="listTable">
          <thead><tr><th>{tx(language, "Tarih", "Date", "Dîrok")}</th><th>{tx(language, "Kaynak", "Source", "Çavkanî")}</th><th className="r">{tx(language, "Tutar", "Amount", "Mîqdar")}</th></tr></thead>
          <tbody>
            {list.incomes.map((r) => (
              <tr key={r.id}><td>{formatDate(r.date, language)}</td><td>{r.source}</td><td className="r">{money(r.amount, r.currency)}</td></tr>
            ))}
          </tbody>
        </table>
      )}

      <h4>{tx(language, "2) Dağıtım (gelirden kişilere)", "2) Distribution (income to people)", "2) Dabeşkirin (ji dahatê ji kesan re)")}</h4>
      {list.members.length === 0 ? (
        <p className="listsHint">{tx(language, "Önce Düzenle ile listeye kişi ekleyin.", "Add people to the list with Edit first.", "Pêşî bi Biguherîne kesan li lîsteyê zêde bikin.")}</p>
      ) : (
        <>
          {list.distributions.length > 0 && (
            <table className="listTable">
              <thead><tr><th>{tx(language, "Tarih", "Date", "Dîrok")}</th><th>{tx(language, "Kişi", "Person", "Kes")}</th><th>{tx(language, "Not", "Note", "Nîşe")}</th><th className="r">{tx(language, "Aldığı", "Received", "Wergirtî")}</th>{list.canWrite && <th className="listActionCol" />}</tr></thead>
              <tbody>
                {list.distributions.map((d) => (
                  <tr key={d.id}>
                    <td>{formatDate(d.date, language)}</td>
                    <td>{memberName(d.memberId)}</td>
                    <td>{d.note}</td>
                    <td className="r">{money(d.amount, c)}</td>
                    {list.canWrite && (
                      <td className="listActionCol">
                        <button className="light compact" onClick={() => confirm(tx(language, "Bu dağıtım silinsin mi?", "Delete this distribution?", "Ev dabeşkirin were jêbirin?")) && onDeleteDistribution(d.id)}>
                          {tx(language, "Sil", "Delete", "Jê bibe")}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {list.canWrite && (
            <form
              className="listInlineForm"
              onSubmit={async (e) => {
                e.preventDefault();
                const value = Number(amount.replace(",", "."));
                if (memberId === "" || !(value > 0)) return;
                if (await onAddDistribution({ memberId, amount: value, date: dDate, note: note.trim() })) {
                  setAmount("");
                  setNote("");
                }
              }}
            >
              <select value={memberId} onChange={(e) => setMemberId(e.target.value ? Number(e.target.value) : "")} aria-label={tx(language, "Kişi", "Person", "Kes")}>
                <option value="">{tx(language, "Kişi seçin", "Select person", "Kes hilbijêre")}</option>
                {list.members.map((m) => (<option key={m.id} value={m.id}>{m.name}</option>))}
              </select>
              <input inputMode="decimal" placeholder={tx(language, "Tutar", "Amount", "Mîqdar")} value={amount} onChange={(e) => setAmount(e.target.value)} />
              <input type="date" value={dDate} onChange={(e) => setDDate(e.target.value)} />
              <input placeholder={tx(language, "Not (isteğe bağlı)", "Note (optional)", "Nîşe (bijarte)")} value={note} onChange={(e) => setNote(e.target.value)} />
              <button className="primary compact" disabled={memberId === "" || !(Number(amount.replace(",", ".")) > 0)}>
                {tx(language, "Dağıtım ekle", "Add distribution", "Dabeşkirinê zêde bike")}
              </button>
            </form>
          )}
        </>
      )}

      <h4>{tx(language, "3) Liste gideri ve paylaşım", "3) List expense and sharing", "3) Mesrefa lîsteyê û parvekirin")}</h4>
      {list.expenses.length === 0 ? (
        <p className="listsHint">
          {tx(language, "Henüz gider yok. Gider sayfasında kayıt eklerken “Liste Kaydı”nı işaretleyip bu listeyi seçin.", "No expense yet. On the Expense page, tick “List record” and pick this list when adding a record.", "Hê mesref tune. Di rûpela Mesref de “Tomara Lîsteyê” hilbijêrin û vê lîsteyê hilbijêrin.")}
        </p>
      ) : (
        <table className="listTable">
          <thead><tr><th>{tx(language, "Tarih", "Date", "Dîrok")}</th><th>{tx(language, "Gider", "Expense", "Mesref")}</th><th className="r">{tx(language, "Tutar", "Amount", "Mîqdar")}</th><th>{tx(language, "Paylaşım", "Sharing", "Parvekirin")}</th>{list.canWrite && <th className="listActionCol" />}</tr></thead>
          <tbody>
            {list.expenses.map((e) => {
              const shared = Math.round(e.shares.reduce((a, s) => a + s.amount, 0) * 100) / 100;
              const remaining = Math.round((e.amount - shared) * 100) / 100;
              return (
                <tr key={e.id}>
                  <td>{formatDate(e.date, language)}</td>
                  <td>{e.source}</td>
                  <td className="r">{money(e.amount, e.currency)}</td>
                  <td>
                    {e.shares.length === 0 ? (
                      <span className="listMuted">{tx(language, "Paylaştırılmadı", "Not shared", "Nehatiye parvekirin")}</span>
                    ) : (
                      <>
                        {e.shares.map((s) => `${memberName(s.memberId)} ${money(s.amount, e.currency)}`).join(" · ")}
                        {remaining > 0.005 && <span className="listMuted"> · {tx(language, "kalan", "left", "mayî")} {money(remaining, e.currency)}</span>}
                      </>
                    )}
                  </td>
                  {list.canWrite && (
                    <td className="listActionCol">
                      <button className="light compact" onClick={() => onShare(e)} disabled={list.members.length === 0}>
                        {tx(language, "Paylaştır", "Share", "Parve bike")}
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <h4>{tx(language, "4) Kişi hesabı", "4) Person accounts", "4) Hesabê kesan")}</h4>
      {list.balances.length === 0 ? (
        <p className="listsHint">{tx(language, "Listede kişi yok.", "No people in the list.", "Di lîsteyê de kes tune.")}</p>
      ) : (
        <table className="listTable">
          <thead><tr><th>{tx(language, "Kişi", "Person", "Kes")}</th><th className="r">{tx(language, "Aldığı", "Received", "Wergirtî")}</th><th className="r">{tx(language, "Payına düşen gider", "Share of expense", "Beşa mesrefê")}</th><th className="r">{tx(language, "Sonuç", "Result", "Encam")}</th></tr></thead>
          <tbody>
            {list.balances.map((b) => (
              <tr key={b.memberId}>
                <td>{b.name}</td>
                <td className="r">{money(b.received, c)}</td>
                <td className="r">{money(b.share, c)}</td>
                <td className={`r ${b.balance < 0 ? "negative" : b.balance > 0 ? "positive" : ""}`}>
                  {b.balance < 0
                    ? `${money(b.balance, c)} ${tx(language, "borç", "debt", "deyn")}`
                    : b.balance > 0
                      ? `+${money(b.balance, c)} ${tx(language, "kasasında", "in hand", "di qasa wî de")}`
                      : tx(language, "0 kapandı", "0 settled", "0 hate girtin")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="listsHint">
        {tx(language, "Kontrol", "Check", "Kontrol")}: {tx(language, "kişi bakiyeleri", "person balances", "bakiyeyên kesan")} {money(personTotal, c)} + {tx(language, "liste kasası", "list cash", "qasaya lîsteyê")} {money(list.totals.listCash, c)} = {money(check, c)}
        {check === expected ? " ✓" : ` · ${tx(language, "fark", "difference", "ferq")} ${money(Math.round((check - expected) * 100) / 100, c)}`}
        {list.totals.unsharedExpense > 0.005 && ` · ${tx(language, "paylaştırılmamış gider", "unshared expense", "mesrefa nehatiye parvekirin")} ${money(list.totals.unsharedExpense, c)}`}
      </p>
    </div>
  );
}

function ListFormModal({
  language,
  list,
  users,
  isSuperAdmin,
  currentUserName,
  onClose,
  onSaved,
}: {
  language: Language;
  list: ListDetail | null;
  users: UserAccount[];
  isSuperAdmin: boolean;
  currentUserName: string;
  onClose: () => void;
  onSaved: (list: ListDetail) => void;
}) {
  const [code, setCode] = useState(list?.code ?? "");
  const [name, setName] = useState(list?.name ?? "");
  const [dateValue, setDateValue] = useState(list?.date ?? today());
  const [currency, setCurrency] = useState(list?.currency ?? "USD");
  const [ownerUserId, setOwnerUserId] = useState<number | "">("");
  const [members, setMembers] = useState<{ id?: number; name: string }[]>(list ? list.members.map((m) => ({ ...m })) : [{ name: "" }]);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const cleanMembers = members.map((m) => ({ ...m, name: m.name.trim() })).filter((m) => m.name);
    const removed = list ? list.members.filter((m) => !cleanMembers.some((c) => c.id === m.id)) : [];
    if (removed.length && !confirm(tx(language, `Listeden çıkarılan kişilerin dağıtım ve paylaşımları da silinecek: ${removed.map((m) => m.name).join(", ")}. Devam edilsin mi?`, `Distributions and shares of removed people will be deleted too: ${removed.map((m) => m.name).join(", ")}. Continue?`, `Dabeşkirin û parvekirinên kesên hatine rakirin jî dê bêne jêbirin: ${removed.map((m) => m.name).join(", ")}. Berdewam?`))) {
      setSaving(false);
      return;
    }
    const result = list
      ? await api<{ list: ListDetail }>(`/api/lists/${list.id}`, "PUT", { code, name, date: dateValue, members: cleanMembers })
      : await api<{ list: ListDetail }>("/api/lists", "POST", {
          code,
          name,
          date: dateValue,
          currency,
          members: cleanMembers.map((m) => m.name),
          ...(isSuperAdmin && ownerUserId !== "" ? { ownerUserId } : {}),
        });
    setSaving(false);
    if (!result.ok) return alert(result.error);
    onSaved(result.data.list);
  }

  const owner = list ? list.ownerName : ownerUserId === "" ? currentUserName : users.find((u) => u.id === ownerUserId)?.name ?? currentUserName;
  return (
    <div className="overlay">
      <form
        className="modal listFormModal"
        onSubmit={(e) => {
          e.preventDefault();
          if (code.trim() && name.trim()) save();
        }}
      >
        <div className="modalHead">
          <div>
            <h2>{list ? tx(language, "Listeyi Düzenle", "Edit List", "Lîsteyê Biguherîne") : tx(language, "Yeni Liste", "New List", "Lîsteya Nû")}</h2>
            <p>{tx(language, "Tarih, çalışma alanı, liste adı ve kodu ile kişileri belirleyin.", "Set the date, workspace, list name, code and people.", "Dîrok, qada xebatê, navê lîsteyê, kod û kesan diyar bikin.")}</p>
          </div>
          <button type="button" onClick={onClose}>×</button>
        </div>
        <div className="formGrid">
          <label>
            {tx(language, "Tarih", "Date", "Dîrok")}
            <input type="date" required value={dateValue} onChange={(e) => setDateValue(e.target.value)} />
          </label>
          <label>
            {tx(language, "Çalışma Alanı", "Workspace", "Qada Xebatê")}
            {isSuperAdmin && !list ? (
              <select value={ownerUserId} onChange={(e) => setOwnerUserId(e.target.value ? Number(e.target.value) : "")}>
                <option value="">{currentUserName} ({tx(language, "Kendi Verilerim", "My data", "Daneyên min")})</option>
                {users.filter((u) => u.name !== currentUserName).map((u) => (<option key={u.id} value={u.id}>{u.name}</option>))}
              </select>
            ) : (
              <input value={owner} disabled />
            )}
          </label>
          <label>
            {tx(language, "Liste Adı", "List Name", "Navê Lîsteyê")}
            <input required value={name} maxLength={200} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            {tx(language, "Kodu", "Code", "Kod")}
            <input required value={code} maxLength={40} placeholder="L-001" onChange={(e) => setCode(e.target.value)} />
          </label>
          <label>
            {tx(language, "Para Birimi", "Currency", "Dirav")}
            <select value={currency} disabled={!!list} onChange={(e) => setCurrency(e.target.value)}>
              {CURRENCIES.map((cur) => (<option key={cur}>{cur}</option>))}
            </select>
          </label>
          <div className="wide listMembersEditor">
            <small>{tx(language, "Kişiler", "People", "Kes")}</small>
            {members.map((m, index) => (
              <div key={m.id ?? `new-${index}`} className="listMemberRow">
                <input
                  value={m.name}
                  maxLength={200}
                  placeholder={tx(language, "Kişi adı", "Person name", "Navê kesî")}
                  onChange={(e) => setMembers((prev) => prev.map((x, i) => (i === index ? { ...x, name: e.target.value } : x)))}
                />
                <button type="button" className="light compact" onClick={() => setMembers((prev) => prev.filter((_, i) => i !== index))}>
                  {tx(language, "Çıkar", "Remove", "Rake")}
                </button>
              </div>
            ))}
            <button type="button" className="light compact" onClick={() => setMembers((prev) => [...prev, { name: "" }])}>
              ＋ {tx(language, "Kişi ekle", "Add person", "Kes zêde bike")}
            </button>
          </div>
        </div>
        <div className="modalActions">
          <button type="button" className="light" onClick={onClose}>{tx(language, "Vazgeç", "Cancel", "Betal")}</button>
          <button className="primary" disabled={saving || !code.trim() || !name.trim()}>
            {list ? tx(language, "Değişiklikleri Kaydet", "Save Changes", "Guherînan Tomar Bike") : tx(language, "Listeyi Kaydet", "Save List", "Lîsteyê Tomar Bike")}
          </button>
        </div>
      </form>
    </div>
  );
}

// Bir liste giderini kişilere paylaştırma: elle tutar, eşit bölme veya oran (%).
function ShareModal({
  language,
  list,
  expense,
  onClose,
  onSave,
}: {
  language: Language;
  list: ListDetail;
  expense: ListExpense;
  onClose: () => void;
  onSave: (shares: { memberId: number; amount: number }[]) => void;
}) {
  type Mode = "manual" | "equal" | "ratio";
  const [mode, setMode] = useState<Mode>("manual");
  const [values, setValues] = useState<Record<number, string>>(() =>
    Object.fromEntries(list.members.map((m) => [m.id, String(expense.shares.find((s) => s.memberId === m.id)?.amount ?? "")])),
  );
  const [included, setIncluded] = useState<Record<number, boolean>>(() =>
    Object.fromEntries(list.members.map((m) => [m.id, true])),
  );
  const num = (v: string | undefined) => {
    const n = Number((v ?? "").replace(",", "."));
    return Number.isFinite(n) && n > 0 ? n : 0;
  };

  const computed = useMemo(() => {
    const out: Record<number, number> = {};
    const total = expense.amount;
    if (mode === "manual") {
      for (const m of list.members) out[m.id] = Math.round(num(values[m.id]) * 100) / 100;
    } else if (mode === "equal") {
      const ids = list.members.filter((m) => included[m.id]).map((m) => m.id);
      const each = ids.length ? Math.floor((total / ids.length) * 100) / 100 : 0;
      ids.forEach((id, i) => {
        out[id] = i === ids.length - 1 ? Math.round((total - each * (ids.length - 1)) * 100) / 100 : each;
      });
    } else {
      const sum = list.members.reduce((a, m) => a + num(values[m.id]), 0);
      let allocated = 0;
      const withValue = list.members.filter((m) => num(values[m.id]) > 0);
      withValue.forEach((m, i) => {
        const part = i === withValue.length - 1 ? Math.round((total - allocated) * 100) / 100 : Math.floor(((num(values[m.id]) / sum) * total) * 100) / 100;
        out[m.id] = part;
        allocated += part;
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, values, included, list.members, expense.amount]);
  const sum = Math.round(Object.values(computed).reduce((a, b) => a + b, 0) * 100) / 100;
  const over = sum > expense.amount + 0.005;
  const c = expense.currency;

  return (
    <div className="overlay">
      <div className="modal listFormModal">
        <div className="modalHead">
          <div>
            <h2>{tx(language, "Gideri Paylaştır", "Share Expense", "Mesrefê Parve Bike")}</h2>
            <p>{expense.source} · {formatDate(expense.date, language)} · {money(expense.amount, c)}</p>
          </div>
          <button type="button" onClick={onClose}>×</button>
        </div>
        <div className="listShareModes" role="tablist">
          {(
            [
              ["manual", tx(language, "Elle tutar", "Manual amount", "Mîqdara destî")],
              ["equal", tx(language, "Eşit böl", "Split equally", "Wekhev parve bike")],
              ["ratio", tx(language, "Oran (%)", "Ratio (%)", "Rêje (%)")],
            ] as [Mode, string][]
          ).map(([m, label]) => (
            <button key={m} type="button" className={`light compact${mode === m ? " active" : ""}`} onClick={() => setMode(m)}>
              {label}
            </button>
          ))}
        </div>
        <table className="listTable">
          <tbody>
            {list.members.map((m) => (
              <tr key={m.id}>
                <td>
                  {mode === "equal" ? (
                    <label className="listShareInclude">
                      <input type="checkbox" checked={included[m.id]} onChange={(e) => setIncluded((prev) => ({ ...prev, [m.id]: e.target.checked }))} /> {m.name}
                    </label>
                  ) : (
                    m.name
                  )}
                </td>
                <td style={{ width: 130 }}>
                  {mode !== "equal" && (
                    <input
                      inputMode="decimal"
                      placeholder={mode === "ratio" ? "%" : "0"}
                      value={values[m.id] ?? ""}
                      onChange={(e) => setValues((prev) => ({ ...prev, [m.id]: e.target.value }))}
                    />
                  )}
                </td>
                <td className="r" style={{ width: 140 }}>{money(computed[m.id] ?? 0, c)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className={`listsHint${over ? " negative" : ""}`}>
          {tx(language, "Paylaşılan", "Shared", "Hatiye parvekirin")} {money(sum, c)} / {money(expense.amount, c)}
          {!over && expense.amount - sum > 0.005 && ` · ${tx(language, "kalan", "left", "mayî")} ${money(Math.round((expense.amount - sum) * 100) / 100, c)}`}
          {over && ` · ${tx(language, "gider tutarını aşıyor", "exceeds the expense", "ji mesrefê zêdetir e")}`}
        </p>
        <div className="modalActions">
          <button type="button" className="light" onClick={onClose}>{tx(language, "Vazgeç", "Cancel", "Betal")}</button>
          <button
            className="primary"
            disabled={over}
            onClick={() => onSave(list.members.filter((m) => (computed[m.id] ?? 0) > 0).map((m) => ({ memberId: m.id, amount: computed[m.id] })))}
          >
            {tx(language, "Paylaşımı Kaydet", "Save Sharing", "Parvekirinê Tomar Bike")}
          </button>
        </div>
      </div>
    </div>
  );
}

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
type Balance = { recipientId: number; name: string; received: number; spent: number; balance: number; perList: Record<string, number> };
type Workspace = {
  cashAccountId: number;
  name: string;
  ownerName: string;
  canWrite: boolean;
  currency: string;
  recipients: Recipient[];
  distributions: Distribution[];
  lists: ListSummary[];
  balances: Balance[];
  totals: { income: number; distributed: number; expense: number; kasaRemaining: number; recipientsNet: number; unassigned: number };
};
type Kasa = { id: number; name: string };

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

export function Lists({ language }: { language: Language; users?: unknown; isSuperAdmin?: boolean; currentUserName?: string }) {
  const [workspaces, setWorkspaces] = useState<Workspace[] | null>(null);
  const [kasas, setKasas] = useState<Kasa[]>([]);
  const [kasaId, setKasaId] = useState<number | null>(null);
  const [listId, setListId] = useState<number | null>(null);
  const [newListFor, setNewListFor] = useState<number | "pick" | null>(null);
  const [editingList, setEditingList] = useState<ListSummary | null>(null);
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
              <button className="primary" onClick={() => setNewListFor("pick")} disabled={kasas.length === 0}>
                ＋ {tx(language, "Yeni Liste", "New List", "Lîsteya Nû")}
              </button>
            </div>
          </div>
          {workspaces === null && <p className="listsHint">…</p>}
          {workspaces?.length === 0 && (
            <p className="listsHint">
              {tx(language, "Henüz liste yok. Bir kasayı çalışma alanı olarak seçip ilk listenizi oluşturun.", "No lists yet. Pick a cash account as the workspace and create your first list.", "Hê lîste tune. Qaseyekê wekî qada xebatê hilbijêrin û lîsteya xwe ya yekem biafirînin.")}
            </p>
          )}
          <div className="listCards">
            {workspaces?.map((w) => (
              <button key={w.cashAccountId} type="button" className="listCard" onClick={() => setKasaId(w.cashAccountId)}>
                <span className="listCardCode">{tx(language, "Çalışma alanı", "Workspace", "Qada xebatê")}</span>
                <strong>{w.name}</strong>
                <small>
                  {w.ownerName || "—"} · {w.lists.length} {tx(language, "liste", "lists", "lîste")} · {w.recipients.length} {tx(language, "alıcı", "recipients", "wergir")}
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
          onSaveAllocations={(id, allocations) => mutate(`/api/lists/${id}/allocations`, "PUT", { allocations })}
          onAddDistribution={(body) => mutate(`/api/list-workspaces/${workspace.cashAccountId}/distributions`, "POST", body)}
          onDeleteDistribution={(id) => mutate(`/api/list-workspaces/${workspace.cashAccountId}/distributions/${id}`, "DELETE")}
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
          onToggleStatus={() => mutate(`/api/lists/${list.id}`, "PUT", { status: list.status === "open" ? "closed" : "open" })}
          onDelete={async () => {
            if (!confirm(tx(language, "Liste ve ürünleri silinsin mi?", "Delete this list and its products?", "Lîste û berhemên wê were jêbirin?"))) return;
            if (await mutate(`/api/lists/${list.id}`, "DELETE")) setListId(null);
          }}
          onSaveItems={(items) => mutate(`/api/lists/${list.id}/items`, "PUT", { items })}
          onApplyItems={(amount, allocations) => mutate(`/api/lists/${list.id}`, "PUT", { amount, allocations })}
          onDirty={setEditingItems}
        />
      )}
      {newListFor !== null && (
        <ListFormModal
          language={language}
          kasas={kasas}
          fixedKasaId={newListFor === "pick" ? null : newListFor}
          workspace={newListFor === "pick" ? null : workspaces?.find((w) => w.cashAccountId === newListFor) ?? null}
          list={null}
          onClose={() => setNewListFor(null)}
          onSaved={(ws, id) => {
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
            setEditingList(null);
            apply(ws, ws.cashAccountId);
          }}
        />
      )}
    </section>
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
  onAddDistribution,
  onDeleteDistribution,
  onSaveAllocations,
}: {
  language: Language;
  ws: Workspace;
  busy: boolean;
  onBack: () => void;
  onSaveAllocations: (listId: number, allocations: { recipientId: number; amount: number }[]) => Promise<boolean>;
  onOpenList: (id: number) => void;
  onNewList: () => void;
  onAddRecipient: (name: string) => Promise<boolean>;
  onRenameRecipient: (id: number, name: string) => Promise<boolean>;
  onDeleteRecipient: (id: number) => Promise<boolean>;
  onAddDistribution: (body: { recipientId: number; amount: number; date: string; note: string }) => Promise<boolean>;
  onDeleteDistribution: (id: number) => Promise<boolean>;
}) {
  const c = ws.currency;
  const [newRecipient, setNewRecipient] = useState("");
  const [recipientId, setRecipientId] = useState<number | "">("");
  const [amount, setAmount] = useState("");
  const [dDate, setDDate] = useState(today());
  const [note, setNote] = useState("");
  const name = (id: number) => ws.recipients.find((r) => r.id === id)?.name ?? "—";
  const check = r2(ws.totals.kasaRemaining + ws.totals.recipientsNet);
  const expected = r2(ws.totals.income - ws.totals.expense);

  return (
    <div className="listDetail">
      <div className="listWsBar">
        <div className="listWsInfo">
          <button className="light compact" onClick={onBack}>← {tx(language, "Listeler", "Lists", "Lîste")}</button>
          <span className="listWsLabel">{tx(language, "Çalışma Alanı", "Workspace", "Qada Xebatê")}</span>
          <span className="listWsName">{ws.name}</span>
          <small className="listMuted">{ws.ownerName || "—"} · {c}</small>
        </div>
        {ws.canWrite && (
          <div className="listWsActions">
            <button className="primary" onClick={onNewList}>＋ {tx(language, "Yeni Liste", "New List", "Lîsteya Nû")}</button>
          </div>
        )}
      </div>

      <div className="listMetrics">
        <div className="metricBlue" title={tx(language, "Bu kasadaki kasa ve gelir kayıtlarının toplamı (Kasalar/Gelir sayfalarından girilir)", "Total of this account's cash and income records (entered on the Cash/Income pages)", "Hejmara tomarên qase û dahatê yên vê qasayê")}><small>{tx(language, "Kasa geliri", "Cash income", "Dahata qasayê")}</small><b>{money(ws.totals.income, c)}</b></div>
        <div><small>{tx(language, "Alıcılara dağıtılan", "Distributed", "Ji wergiran re hatiye dabeşkirin")}</small><b>{money(ws.totals.distributed, c)}</b></div>
        <div><small>{tx(language, "Toplam gider", "Total expense", "Mesrefa giştî")}</small><b>{money(ws.totals.expense, c)}</b></div>
        <div><small>{tx(language, "Kasada kalan", "Cash left", "Di qasayê de")}</small><b className={ws.totals.kasaRemaining < 0 ? "negative" : undefined}>{money(ws.totals.kasaRemaining, c)}</b></div>
        <div className={ws.totals.recipientsNet < 0 ? "metricAmber" : undefined}><small>{tx(language, "Alıcılarda kalan", "Left with recipients", "Li cem wergiran")}</small><b className={ws.totals.recipientsNet < 0 ? "negative" : "positive"}>{money(ws.totals.recipientsNet, c)}</b></div>
        <div><small>{tx(language, "Açık listeler", "Open lists", "Lîsteyên vekirî")}</small><b>{ws.lists.filter((l) => l.status === "open").length}</b></div>
        <div><small>{tx(language, "Kapanan listeler", "Closed lists", "Lîsteyên girtî")}</small><b>{ws.lists.filter((l) => l.status === "closed").length}</b></div>
      </div>

      {ws.lists.length === 0 ? (
        <p className="listsHint">{tx(language, "Bu çalışma alanında henüz liste yok.", "No lists in this workspace yet.", "Di vê qada xebatê de hê lîste tune.")}</p>
      ) : (
        <ListsGrid language={language} ws={ws} onOpenList={onOpenList} onSaveAllocations={onSaveAllocations} onAddRecipient={onAddRecipient} />
      )}

      <details className="listFold">
        <summary>
          {tx(language, "Alıcıları yönet", "Manage recipients", "Wergiran birêve bibe")} <em>{ws.recipients.length}</em>
        </summary>
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

      </details>

      <details className="listFold">
        <summary>
          {tx(language, "Dağıtılan miktarı görüntüle", "View distributed amount", "Mîqdara hatiye dabeşkirin nîşan bide")} <em>{money(ws.totals.distributed, c)}</em>
        </summary>
        <p className="listsHint">{tx(language, "Kasadan alıcılara verilen paralar", "Money given from the cash account to recipients", "Pereyên ji qasayê ji wergiran re hatine dayîn")}</p>
        <div className="listReceivedRow">
          {ws.balances.length === 0 && <span className="listMuted">—</span>}
          {ws.balances.map((b, i) => (
            <span key={b.recipientId} className="listReceivedChip">
              <span style={{ background: RECIPIENT_COLORS[i % RECIPIENT_COLORS.length] }}>{b.name}</span>
              <b>{money(b.received, c)}</b>
            </span>
          ))}
        </div>
      {ws.distributions.length > 0 && (
        <table className="listTable">
          <thead><tr><th>{tx(language, "Tarih", "Date", "Dîrok")}</th><th>{tx(language, "Alıcı", "Recipient", "Wergir")}</th><th>{tx(language, "Not", "Note", "Nîşe")}</th><th className="r">{tx(language, "Tutar", "Amount", "Mîqdar")}</th>{ws.canWrite && <th className="listActionCol" />}</tr></thead>
          <tbody>
            {ws.distributions.map((d) => (
              <tr key={d.id}>
                <td>{formatDate(d.date, language)}</td>
                <td>{name(d.recipientId)}</td>
                <td>{d.note}</td>
                <td className="r">{money(d.amount, c)}</td>
                {ws.canWrite && (
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
      {ws.canWrite && ws.recipients.length > 0 && (
        <form
          className="listInlineForm"
          onSubmit={async (e) => {
            e.preventDefault();
            const value = parseNumber(amount);
            if (recipientId === "" || !(value > 0)) return;
            if (await onAddDistribution({ recipientId, amount: value, date: dDate, note: note.trim() })) {
              setAmount("");
              setNote("");
            }
          }}
        >
          <select value={recipientId} onChange={(e) => setRecipientId(e.target.value ? Number(e.target.value) : "")}>
            <option value="">{tx(language, "Alıcı seçin", "Select recipient", "Wergir hilbijêre")}</option>
            {ws.recipients.map((r) => (<option key={r.id} value={r.id}>{r.name}</option>))}
          </select>
          <input inputMode="decimal" placeholder={tx(language, "Tutar", "Amount", "Mîqdar")} value={amount} onChange={(e) => setAmount(e.target.value)} />
          <input type="date" value={dDate} onChange={(e) => setDDate(e.target.value)} />
          <input placeholder={tx(language, "Not (isteğe bağlı)", "Note (optional)", "Nîşe (bijarte)")} value={note} onChange={(e) => setNote(e.target.value)} />
          <button className="primary compact" disabled={recipientId === "" || !(parseNumber(amount) > 0) || busy}>{tx(language, "Dağıtım ekle", "Add distribution", "Dabeşkirinê zêde bike")}</button>
        </form>
      )}

      </details>

      <details className="listFold">
        <summary>{tx(language, "Alıcı hesapları (alıcı × liste)", "Recipient accounts (recipient × list)", "Hesabên wergiran (wergir × lîste)")}</summary>
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
                <th className="r">{tx(language, "Dağıtım aldı", "Received", "Wergirtî")}</th>
                <th className="r">{tx(language, "Sonuç", "Result", "Encam")}</th>
              </tr>
            </thead>
            <tbody>
              {ws.balances.map((b) => (
                <tr key={b.recipientId}>
                  <td>{b.name}</td>
                  {ws.lists.map((l) => (<td key={l.id} className="r">{b.perList[l.id] ? money(b.perList[l.id], c) : "—"}</td>))}
                  <td className="r">{money(b.spent, c)}</td>
                  <td className="r">{money(b.received, c)}</td>
                  <td className={`r ${b.balance < 0 ? "negative" : b.balance > 0 ? "positive" : ""}`}>
                    {b.balance < 0 ? `${money(b.balance, c)} ${tx(language, "borç", "debt", "deyn")}` : b.balance > 0 ? `+${money(b.balance, c)}` : "0"}
                  </td>
                </tr>
              ))}
              <tr className="listTotalRow">
                <td>{tx(language, "Toplam", "Total", "Giştî")}</td>
                {ws.lists.map((l) => (<td key={l.id} className="r">{money(l.total - l.unassigned, c)}</td>))}
                <td className="r">{money(r2(ws.balances.reduce((a, b) => a + b.spent, 0)), c)}</td>
                <td className="r">{money(ws.totals.distributed, c)}</td>
                <td className="r">{money(ws.totals.recipientsNet, c)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      </details>
      <p className="listsHint">
        {tx(language, "Kontrol", "Check", "Kontrol")}: {tx(language, "kasada kalan", "cash left", "di qasayê de")} {money(ws.totals.kasaRemaining, c)} + {tx(language, "alıcılarda kalan", "left with recipients", "li cem wergiran")} {money(ws.totals.recipientsNet, c)} = {money(check, c)}
        {check === r2(expected - ws.totals.unassigned) ? " ✓" : ""} ({tx(language, "gelir", "income", "dahat")} {money(ws.totals.income, c)} − {tx(language, "gider", "expense", "mesref")} {money(ws.totals.expense, c)} = {money(expected, c)})
        {ws.totals.unassigned > 0.005 && ` · ${tx(language, "alıcısız ürün gideri", "expense without recipient", "mesrefa bê wergir")} ${money(ws.totals.unassigned, c)}`}
      </p>
    </div>
  );
}

const RECIPIENT_TINTS = ["#f1f6fc", "#f2f9f1", "#fef5ee", "#f7f2fb", "#fdf1f4", "#f1f9f9"];
const RECIPIENT_COLORS = ["#cfe1f4", "#d5ecd4", "#fbdcc4", "#e6d9f3", "#f8d3de", "#d3ecec"];

// Çalışma alanındaki listeler: tablo gibi bir ızgara — her liste bir satır, liste gideri
// ve her alıcı için ayrı bir sütun (hücreye o alıcıya dağıtılan tutar yazılır).
function ListsGrid({
  language,
  ws,
  onOpenList,
  onSaveAllocations,
  onAddRecipient,
}: {
  language: Language;
  ws: Workspace;
  onOpenList: (id: number) => void;
  onSaveAllocations: (listId: number, allocations: { recipientId: number; amount: number }[]) => Promise<boolean>;
  onAddRecipient: (name: string) => Promise<boolean>;
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
  const recipientCols = open ? ws.recipients.length : 0;

  return (
    <div className="listMatrixScroll">
      <table className="listTable listsGrid" style={{ minWidth: 104 + 170 + 96 + 84 + 170 + 126 + (open ? ws.recipients.length : 1) * 116 + 126 + (open && ws.canWrite ? 104 : 0) }}>
        <colgroup>
          <col style={{ width: 104 }} />
          <col style={{ width: 170 }} />
          <col style={{ width: 96 }} />
          <col style={{ width: 84 }} />
          <col style={{ width: 170 }} />
          <col style={{ width: 126 }} />
          {open ? ws.recipients.map((r) => <col key={r.id} style={{ width: 116 }} />) : <col style={{ width: 126 }} />}
          <col style={{ width: 126 }} />
          {open && ws.canWrite && <col style={{ width: 104 }} />}
        </colgroup>
        <thead>
          <tr className="listsGroupRow">
            <th colSpan={6} className="listsGroupMain">{tx(language, "Liste bilgileri", "List details", "Agahiyên lîsteyê")}</th>
            <th colSpan={(open ? ws.recipients.length : 1) + 1 + (open && ws.canWrite ? 1 : 0)} className="listsGroupRecipients">
              {tx(language, "Alıcılara dağıtım", "Allocation to recipients", "Dabeşkirina ji wergiran re")}
            </th>
          </tr>
          <tr>
            <th>{tx(language, "Tarih", "Date", "Dîrok")}</th>
            <th>{tx(language, "Liste", "List", "Lîste")}</th>
            <th>{tx(language, "Kod", "Code", "Kod")}</th>
            <th>{tx(language, "Durum", "Status", "Rewş")}</th>
            <th>{tx(language, "Not", "Note", "Nîşe")}</th>
            <th className="listsGridAmountHead r">{tx(language, "Liste gideri", "List expense", "Mesrefa lîsteyê")}</th>
            {open ? (
              ws.recipients.map((r, i) => (
                <th key={r.id} className={`listsGridRecipientHead${i === 0 ? " listsGridGroupStart" : ""}`}>
                  {i === 0 && (
                    <button type="button" className="listsGridToggle" onClick={toggle} title={tx(language, "Alıcı sütunlarını kapat", "Collapse recipient columns", "Stûnên wergiran bigire")}>
                      ◂
                    </button>
                  )}
                  <span style={{ background: RECIPIENT_COLORS[i % RECIPIENT_COLORS.length] }}>{r.name}</span>
                </th>
              ))
            ) : (
              <th className="listsGridRecipientHead listsGridGroupStart">
                <button type="button" className="listsGridToggle wide" onClick={toggle} title={tx(language, "Alıcı sütunlarını aç", "Expand recipient columns", "Stûnên wergiran veke")}>
                  ▸ {tx(language, "Alıcılar", "Recipients", "Wergir")} ({ws.recipients.length})
                </button>
              </th>
            )}
            <th className="r">{tx(language, "Dağıtılmamış", "Unallocated", "Nehatiye dabeşkirin")}</th>
            {open && ws.canWrite && (
              <th className="listsGridAddHead">
                {adding ? (
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
                  <button type="button" className="light compact" onClick={() => setAdding(true)} title={tx(language, "Alıcı ekle", "Add recipient", "Wergir zêde bike")}>
                    ＋ {tx(language, "Alıcı", "Recipient", "Wergir")}
                  </button>
                )}
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {ws.lists.map((l) => {
            const editable = ws.canWrite && l.status === "open";
            return (
              <tr key={l.id}>
                <td>{formatDate(l.date, language)}</td>
                <td><button type="button" className="listNameLink" onClick={() => onOpenList(l.id)}>{l.name}</button></td>
                <td><button type="button" className="listCodeLink" onClick={() => onOpenList(l.id)}>{l.code}</button></td>
                <td><span className={`listStatus ${l.status}`}>{l.status === "open" ? tx(language, "Açık", "Open", "Vekirî") : tx(language, "Kapandı", "Closed", "Girtî")}</span></td>
                <td className="listGridNote" title={l.note}>{l.note}</td>
                <td className="listsGridAmount r">{money(l.total, c)}</td>
                {open ? (
                  ws.recipients.map((r, i) => {
                    const k = key(l.id, r.id);
                    const value = l.byRecipient[r.id] ?? 0;
                    return (
                      <td key={r.id} className={`listsGridCell r${i === 0 ? " listsGridGroupStart" : ""}`} style={{ background: RECIPIENT_TINTS[i % RECIPIENT_TINTS.length] }}>
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
                        ) : value ? (
                          money(value, c)
                        ) : (
                          "—"
                        )}
                      </td>
                    );
                  })
                ) : (
                  <td className="listsGridCell r listsGridGroupStart">{allocatedTotal(l) ? money(allocatedTotal(l), c) : "—"}</td>
                )}
                <td className={`r ${l.unassigned < -0.005 ? "negative" : ""}`}>{l.unassigned > 0.005 || l.unassigned < -0.005 ? money(l.unassigned, c) : "—"}</td>
                {open && ws.canWrite && <td />}
              </tr>
            );
          })}
          <tr className="listTotalRow">
            <td colSpan={5}>{tx(language, "Toplam", "Total", "Giştî")}</td>
            <td className="r">{money(ws.totals.expense, c)}</td>
            {open ? ws.recipients.map((r, i) => (<td key={r.id} className={`r${i === 0 ? " listsGridGroupStart" : ""}`}>{money(sumRecipient(r.id), c)}</td>)) : <td className="r listsGridGroupStart">{money(r2(ws.lists.reduce((a, l) => a + allocatedTotal(l), 0)), c)}</td>}
            <td className="r">{money(ws.totals.unassigned, c)}</td>
            {open && ws.canWrite && <td />}
          </tr>
        </tbody>
      </table>
      <p className="listsHint">
        {recipientCols
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
            <span className={closed ? "negative" : "positive"}>{closed ? tx(language, "Kapandı", "Closed", "Girtî") : tx(language, "Açık", "Open", "Vekirî")}</span>
          </small>
        </div>
        {ws.canWrite && (
          <div className="listDetailActions">
            <button className="light compact" onClick={onEdit}>{tx(language, "Düzenle", "Edit", "Biguherîne")}</button>
            <button className="light compact" onClick={onToggleStatus} disabled={dirty}>
              {closed ? tx(language, "Yeniden aç", "Reopen", "Dîsa veke") : tx(language, "Listeyi kapat", "Close list", "Lîsteyê bigire")}
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
      {closed && <p className="listsHint">{tx(language, "Liste kapalı: ürünler değiştirilemez. Değiştirmek için “Yeniden aç”ı kullanın.", "This list is closed: products can't be changed. Use “Reopen” to edit.", "Lîste girtî ye: berhem nayên guhertin. Ji bo guhertinê “Dîsa veke” bikar bîne.")}</p>}
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

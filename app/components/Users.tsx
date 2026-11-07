"use client";

import { useEffect, useState } from "react";
import { Title, PasswordField, DeleteConfirmModal } from "./shared";
import { tx, nav } from "../lib/i18n";
import type { CashAccountSummary, KasaSection, Language, Page, UserAccount } from "../lib/types";
import { workspaceKeyOf, workspaceOptions } from "./KasaManage";
import { restrictablePages } from "../lib/types";

const accessPages = restrictablePages.filter((p) => p !== "lists");

// Mirrors db/passwords.ts's validatePasswordPolicy — checked client-side too
// so the Kaydet button can disable itself instead of round-tripping to the
// server just to learn the password is too short.
function passwordPolicyError(language: Language, password: string, username: string): string | null {
  const trimmed = password.trim();
  if (!trimmed) return null;
  if (trimmed.length < 10) {
    return tx(language, "Şifre en az 10 karakter olmalı.", "Password must be at least 10 characters.", "Divê şîfre herî kêm 10 karakter be.");
  }
  if (!/[a-zA-Z]/.test(trimmed) || !/[0-9]/.test(trimmed)) {
    return tx(language, "Şifre en az bir harf ve bir rakam içermeli.", "Password must contain at least one letter and one number.", "Divê şîfre herî kêm yek tîp û yek hejmar bihewîne.");
  }
  if (trimmed.toLowerCase() === username.trim().toLowerCase()) {
    return tx(language, "Şifre kullanıcı adıyla aynı olamaz.", "Password cannot be the same as the username.", "Şîfre nikare mîna navê bikarhêner be.");
  }
  return null;
}

export function Users({
  language,
  users,
  setUsers,
  currentUsername,
  currentUserIsAdmin,
  currentUserIsSuperAdmin,
  checkPassword,
  onlineUserIds,
  sections = [],
}: {
  language: Language;
  sections?: KasaSection[];
  users: UserAccount[];
  setUsers: (updater: UserAccount[] | ((current: UserAccount[]) => UserAccount[])) => void;
  currentUsername: string;
  currentUserIsAdmin: boolean;
  currentUserIsSuperAdmin: boolean;
  checkPassword: (password: string) => Promise<boolean>;
  onlineUserIds: number[];
}) {
  const onlineSet = new Set(onlineUserIds);
  const [editing, setEditing] = useState<UserAccount | "new" | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserAccount | null>(null);
  const [accessTarget, setAccessTarget] = useState<UserAccount | null>(null);
  const adminCount = users.filter((u) => u.isAdmin).length;
  const superAdminCount = users.filter((u) => u.isSuperAdmin).length;
  return (
    <div className="panel">
      <div className="toolbar">
        <Title
          title={tx(language, "Kullanıcılar", "Users", "Bikarhêner")}
          sub={
            currentUserIsAdmin
              ? tx(
                  language,
                  "Uygulama kullanıcıları, rolleri ve erişim izinleri",
                  "Application users, roles and access permissions",
                  "Bikarhêner, rol û destûrên gihîştinê yên bernameyê",
                )
              : tx(
                  language,
                  "Kendi hesap bilgilerinizi buradan görüntüleyip düzenleyebilirsiniz",
                  "View and edit your own account details here",
                  "Hûn dikarin agahiyên hesabê xwe li vir bibînin û biguherînin",
                )
          }
        />
        {currentUserIsSuperAdmin && (
          <button className="primary" onClick={() => setEditing("new")}>
            ＋{" "}
            {tx(language, "Kullanıcı Ekle", "Add User", "Bikarhêner Zêde Bike")}
          </button>
        )}
      </div>
      {currentUserIsSuperAdmin && <AccessBoard language={language} sections={sections} />}
      <div className="users">
        {users.map((u) => {
          const isSelf = u.username === currentUsername;
          const isLastAdmin = u.isAdmin && adminCount <= 1;
          const isLastSuperAdmin = u.isSuperAdmin && superAdminCount <= 1;
          const isOnline = onlineSet.has(u.id);
          return (
            <article key={u.id}>
              <b className="userAvatarWrap">
                {u.name.slice(0, 1).toUpperCase()}
                <span
                  className={`userOnlineDot${isOnline ? " online" : ""}`}
                  title={isOnline ? tx(language, "Çevrimiçi", "Online", "Girêdayî") : tx(language, "Çevrimdışı", "Offline", "Negirêdayî")}
                />
              </b>
              <span>
                <strong>{u.name}</strong>
                <small>@{u.username}</small>
                <small className={`userOnlineLabel${isOnline ? " online" : ""}`}>
                  {isOnline ? tx(language, "● Çevrimiçi", "● Online", "● Girêdayî") : tx(language, "○ Çevrimdışı", "○ Offline", "○ Negirêdayî")}
                </small>
                <em>{u.roleLabel}</em>
                {u.locked && (
                  <span className="userPermTag userPermTagLocked">
                    🔒{" "}
                    {tx(
                      language,
                      "Kilitli — güvenlik nedeniyle askıda",
                      "Locked — suspended for security",
                      "Kilît — ji ber ewlehiyê hate rawestandin",
                    )}
                  </span>
                )}
                <div className="userPermissions">
                  {u.isSuperAdmin && (
                    <span className="userPermTag userPermTagAdmin">
                      ★ {tx(language, "Süper Admin", "Super Admin", "Super Admîn")}
                    </span>
                  )}
                  {!u.isSuperAdmin && (
                    <span className="userPermTag">{tx(language, "Admin", "Admin", "Admîn")}</span>
                  )}
                  {u.isAdmin ? (
                    <span className="userPermTag userPermTagAdmin">
                      {tx(language, "Tüm bölümlere erişim", "Access to all sections", "Gihîştina hemû beşan")}
                    </span>
                  ) : u.permissions.length ? (
                    u.permissions.map((p) => (
                      <span key={p} className="userPermTag">
                        {nav.find((n) => n.id === p)?.label[language] ?? p}
                      </span>
                    ))
                  ) : (
                    <span className="userPermTag userPermTagEmpty">
                      {tx(language, "Erişim yok", "No access", "Destûr tune")}
                    </span>
                  )}
                </div>
                <div className="userActions">
                  <button type="button" onClick={() => setEditing(u)}>
                    ✎ {tx(language, "Düzenle", "Edit", "Biguherîne")}
                  </button>
                  {currentUserIsSuperAdmin && !u.isSuperAdmin && (
                    <button type="button" onClick={() => setAccessTarget(u)}>
                      🔑 {tx(language, "Admin Erişimi", "Admin Access", "Gihîştina Admîn")}
                    </button>
                  )}
                  {u.locked && currentUserIsSuperAdmin && (
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const response = await fetch(`/api/users/${u.id}/unlock`, { method: "POST" });
                          if (!response.ok) {
                            alert(tx(language, "Kilit açılamadı.", "Could not unlock the account.", "Kilît nehat vekirin."));
                            return;
                          }
                          const data = await response.json();
                          setUsers((current) => current.map((x) => (x.id === data.user.id ? { ...x, ...data.user } : x)));
                        } catch {
                          alert(tx(language, "Kilit açılamadı.", "Could not unlock the account.", "Kilît nehat vekirin."));
                        }
                      }}
                    >
                      🔓 {tx(language, "Kilidi Aç", "Unlock", "Kilîtê Veke")}
                    </button>
                  )}
                  {currentUserIsSuperAdmin && !isSelf && !isLastAdmin && !isLastSuperAdmin && (
                    <button type="button" className="redText" onClick={() => setDeleteTarget(u)}>
                      🗑 {tx(language, "Sil", "Delete", "Jêbibe")}
                    </button>
                  )}
                </div>
              </span>
            </article>
          );
        })}
      </div>
      {editing && currentUserIsSuperAdmin && (
        <UserModal
          language={language}
          initial={editing === "new" ? null : editing}
          existingUsernames={users.filter((u) => u !== editing).map((u) => u.username.toLowerCase())}
          canGrantSuperAdmin={currentUserIsSuperAdmin}
          onClose={() => setEditing(null)}
          onSave={async (input) => {
            try {
              const response = await fetch(input.id ? `/api/users/${input.id}` : "/api/users", {
                method: input.id ? "PUT" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(input),
              });
              if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                alert(body.error || tx(language, "Kullanıcı kaydedilemedi.", "The user could not be saved.", "Bikarhêner nehat tomarkirin."));
                return;
              }
              const data = await response.json();
              setUsers((current) =>
                input.id ? current.map((u) => (u.id === data.user.id ? data.user : u)) : [...current, data.user],
              );
              setEditing(null);
            } catch {
              alert(tx(language, "Kullanıcı kaydedilemedi.", "The user could not be saved.", "Bikarhêner nehat tomarkirin."));
            }
          }}
        />
      )}
      {editing && editing !== "new" && !currentUserIsSuperAdmin && (
        <SelfEditModal
          language={language}
          initial={editing}
          onClose={() => setEditing(null)}
          onSave={async (input) => {
            try {
              const response = await fetch(`/api/users/${input.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(input),
              });
              if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                alert(body.error || tx(language, "Bilgiler kaydedilemedi.", "The details could not be saved.", "Agahî nehat tomarkirin."));
                return;
              }
              const data = await response.json();
              setUsers((current) => current.map((u) => (u.id === data.user.id ? data.user : u)));
              setEditing(null);
            } catch {
              alert(tx(language, "Bilgiler kaydedilemedi.", "The details could not be saved.", "Agahî nehat tomarkirin."));
            }
          }}
        />
      )}
      {deleteTarget && (
        <DeleteConfirmModal
          language={language}
          itemLabel={`${deleteTarget.name} (@${deleteTarget.username})`}
          checkPassword={checkPassword}
          onClose={() => setDeleteTarget(null)}
          onConfirm={async () => {
            try {
              const response = await fetch(`/api/users/${deleteTarget.id}`, { method: "DELETE" });
              if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                alert(body.error || tx(language, "Kullanıcı silinemedi.", "The user could not be deleted.", "Bikarhêner nehat jêbirin."));
                return;
              }
              setUsers((current) => current.filter((u) => u.id !== deleteTarget.id));
            } catch {
              alert(tx(language, "Kullanıcı silinemedi.", "The user could not be deleted.", "Bikarhêner nehat jêbirin."));
            }
            setDeleteTarget(null);
          }}
        />
      )}
      {accessTarget && currentUserIsSuperAdmin && (
        <AdminAccessModal
          language={language}
          user={accessTarget}
          sections={sections}
          onClose={() => setAccessTarget(null)}
          onSaved={(saved) => setUsers((current) => current.map((x) => (x.id === saved.id ? saved : x)))}
        />
      )}
    </div>
  );
}

// Kasaları çalışma alanlarına göre gruplar (boş alanlar atlanır).
function groupKasasByWorkspace(accounts: CashAccountSummary[], sections: KasaSection[], language: Language) {
  return workspaceOptions(sections, language)
    .map((w) => ({
      ...w,
      kasas: accounts
        .filter((a) => workspaceKeyOf({ sectionId: a.sectionId ?? null, rjKasa: !!a.isRjKasa, listKasa: !!a.isListWorkspace }, sections) === w.key)
        .sort((x, y) => x.name.localeCompare(y.name)),
    }))
    .filter((w) => w.kasas.length > 0);
}

// Erişim Panosu: başlıkta Süper Admin, altında erişebildiği alanlar. Liste uzunsa iki sütuna bölünür.
function AccessBoard({ language, sections }: { language: Language; sections: KasaSection[] }) {
  const [accounts, setAccounts] = useState<CashAccountSummary[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/cash-accounts")
      .then((r) => (r.ok ? r.json() : { cashAccounts: [] }))
      .then((d) => {
        if (!cancelled) setAccounts(d.cashAccounts ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  const pages = accessPages.map((p) => nav.find((n) => n.id === p)?.label[language] ?? p);
  pages.push(tx(language, "Ayarlar", "Settings", "Mîheng"), tx(language, "Kullanıcılar ve Yetkiler", "Users & Permissions", "Bikarhêner û Destûr"));
  const workspaces = groupKasasByWorkspace(accounts, sections, language);
  const areaCount = pages.length + workspaces.reduce((n, w) => n + 1 + w.kasas.length, 0);
  return (
    <div className="panel accessBoard">
      <div className="accessBoardHead">
        <b>★ {tx(language, "Süper Admin", "Super Admin", "Super Admîn")}</b>
        <small>{tx(language, "Tüm sisteme erişir; silme işlemlerinde onay ve şifre gerekir.", "Full system access; deletions need confirmation and a password.", "Gihîştina tevahiya pergalê; di jêbirinê de erêkirin û şîfre pêwîst e.")}</small>
      </div>
      <div className={`accessBoardAreas${areaCount > 14 ? " twoCols" : ""}`}>
        <div className="accessBoardGroup">
          <strong>{tx(language, "Bölümler", "Sections", "Beş")}</strong>
          <ul>
            {pages.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
        {workspaces.map((w) => (
          <div key={w.key} className="accessBoardGroup">
            <strong>{w.label} <small>({w.kasas.length})</small></strong>
            <ul>
              {w.kasas.map((a) => (
                <li key={a.id}>{a.name}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

// Admin Erişimi: bir admine hangi bölümlerin ve (tam yetkili değilse) hangi çalışma alanı / kasaların verileceği.
// Değişiklikler taslak olarak tutulur; onay kutusu işaretlenip "Onayla ve Kaydet" ile tek seferde yazılır.
function AdminAccessModal({
  language,
  user,
  sections,
  onClose,
  onSaved,
}: {
  language: Language;
  user: UserAccount;
  sections: KasaSection[];
  onClose: () => void;
  onSaved: (user: UserAccount) => void;
}) {
  const [accounts, setAccounts] = useState<CashAccountSummary[] | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [fullAccess, setFullAccess] = useState(user.isAdmin);
  const [pages, setPages] = useState<Page[]>(user.permissions);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const failText = tx(language, "Erişim ayarları kaydedilemedi.", "Access settings could not be saved.", "Sazkariyên gihîştinê nehatin tomarkirin.");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/cash-accounts");
        const data = await response.json().catch(() => ({}));
        const list: CashAccountSummary[] = response.ok ? (data.cashAccounts ?? []) : [];
        let granted: number[] = [];
        if (list.length) {
          const access = await fetch(`/api/workspace-access?cashAccountIds=${list.map((a) => a.id).join(",")}`);
          const accessData = await access.json().catch(() => ({}));
          if (access.ok) granted = accessData.grants?.[String(user.id)] ?? [];
          else if (!cancelled) setError(accessData.error || failText);
        }
        if (cancelled) return;
        setAccounts(list);
        setSelected(new Set(granted));
      } catch {
        if (!cancelled) {
          setAccounts([]);
          setError(failText);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id]);

  const workspaces = groupKasasByWorkspace(accounts ?? [], sections, language);
  const isOn = (a: CashAccountSummary) => a.ownerUserId === user.id || selected.has(a.id);
  const toggleKasa = (id: number, on: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  const toggleWorkspace = (kasas: CashAccountSummary[], on: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      for (const a of kasas) {
        if (on) next.add(a.id);
        else next.delete(a.id);
      }
      return next;
    });
  const togglePage = (p: Page) => setPages((current) => (current.includes(p) ? current.filter((x) => x !== p) : [...current, p]));

  async function save() {
    if (!accounts) return;
    setSaving(true);
    setError("");
    try {
      const userResponse = await fetch(`/api/users/${user.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: user.name, roleLabel: user.roleLabel, isAdmin: fullAccess, isSuperAdmin: false, permissions: fullAccess ? [] : pages, password: "" }),
      });
      const userBody = await userResponse.json().catch(() => ({}));
      if (!userResponse.ok) {
        setError(userBody.error || failText);
        return;
      }
      if (!fullAccess && accounts.length) {
        const response = await fetch("/api/workspace-access", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cashAccountIds: accounts.map((a) => a.id), grants: { [String(user.id)]: [...selected] } }),
        });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          setError(body.error || failText);
          return;
        }
      }
      onSaved(userBody.user);
      onClose();
    } catch {
      setError(failText);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="overlay">
      <div className="modal accessSettingsModal">
        <div className="modalHead">
          <div>
            <h2>{tx(language, "Admin Erişimi", "Admin Access", "Gihîştina Admîn")} — {user.name}</h2>
            <p>
              {tx(
                language,
                "Bu admine verilecek bölümleri, çalışma alanlarını ve kasaları seçin. Değişiklik onaylanıp kaydedilince geçerli olur.",
                "Choose the sections, workspaces and cash accounts this admin gets. Changes apply once confirmed and saved.",
                "Beş, qadên xebatê û qaseyên ku ev admîn werdigire hilbijêre. Guhertin piştî erêkirin û tomarkirinê derbas dibin.",
              )}
            </p>
          </div>
          <button type="button" onClick={onClose}>×</button>
        </div>
        <label className="accessFullToggle">
          <input type="checkbox" checked={fullAccess} onChange={(e) => setFullAccess(e.target.checked)} />
          <span>{tx(language, "Tüm bölümlere ve kasalara erişim (tam yetkili admin)", "Access to every section and cash account (full admin)", "Gihîştina hemû beş û qaseyan (admîna tevahî)")}</span>
        </label>
        {!fullAccess && (
          <>
            <div className="accessSectionTitle">{tx(language, "Bölümler", "Sections", "Beş")}</div>
            <div className="accessKasaGrid" style={{ paddingLeft: 0 }}>
              {accessPages.map((p) => (
                <label key={p} className="accessKasaItem">
                  <input type="checkbox" checked={pages.includes(p)} onChange={() => togglePage(p)} />
                  <span>{nav.find((n) => n.id === p)?.label[language] ?? p}</span>
                </label>
              ))}
            </div>
            <div className="accessSectionTitle">{tx(language, "Çalışma alanları ve kasalar", "Workspaces and cash accounts", "Qadên xebatê û qase")}</div>
            {accounts === null ? (
              <small>{tx(language, "Yükleniyor…", "Loading…", "Tê barkirin…")}</small>
            ) : !accounts.length ? (
              <small>{tx(language, "Henüz kasa yok.", "No kasas yet.", "Hîn qase tune.")}</small>
            ) : (
              <div className="accessWorkspaceList">
                {workspaces.map((w) => {
                  const onCount = w.kasas.filter(isOn).length;
                  const all = onCount === w.kasas.length;
                  const lockedAll = w.kasas.every((a) => a.ownerUserId === user.id);
                  return (
                    <section key={w.key} className="accessWorkspace">
                      <label className="accessWorkspaceHead">
                        <input
                          type="checkbox"
                          checked={all}
                          disabled={lockedAll}
                          ref={(el) => {
                            if (el) el.indeterminate = onCount > 0 && !all;
                          }}
                          onChange={(e) => toggleWorkspace(w.kasas, e.target.checked)}
                        />
                        <strong>{w.label}</strong>
                        <small>{onCount}/{w.kasas.length}</small>
                      </label>
                      <div className="accessKasaGrid">
                        {w.kasas.map((a) => {
                          const owner = a.ownerUserId === user.id;
                          return (
                            <label key={a.id} className="accessKasaItem" title={owner ? tx(language, "kasa sahibi — her zaman erişebilir", "kasa owner — always has access", "xwedîyê qaseyê — her tim gihîştin heye") : undefined}>
                              <input type="checkbox" checked={isOn(a)} disabled={owner} onChange={(e) => toggleKasa(a.id, e.target.checked)} />
                              <span>{a.name}{owner ? " ★" : ""}</span>
                            </label>
                          );
                        })}
                      </div>
                    </section>
                  );
                })}
              </div>
            )}
          </>
        )}
        <label className="accessFullToggle" style={{ marginTop: 10 }}>
          <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
          <span>{tx(language, "Bu erişim değişikliğini onaylıyorum.", "I confirm this access change.", "Ez vê guhertina gihîştinê erê dikim.")}</span>
        </label>
        {error && <small className="formWarning" style={{ display: "block", marginTop: 8 }}>{error}</small>}
        <div className="modalActions">
          <button type="button" className="light" onClick={onClose}>
            {tx(language, "Vazgeç", "Cancel", "Betal")}
          </button>
          <button type="button" className="primary" disabled={saving || !confirmed || (!fullAccess && accounts === null)} onClick={save}>
            {saving ? tx(language, "Kaydediliyor…", "Saving…", "Tê tomarkirin…") : tx(language, "Onayla ve Kaydet", "Confirm and Save", "Erê Bike û Tomar Bike")}
          </button>
        </div>
      </div>
    </div>
  );
}

function UserModal({
  language,
  initial,
  existingUsernames,
  canGrantSuperAdmin,
  onClose,
  onSave,
}: {
  language: Language;
  initial: UserAccount | null;
  existingUsernames: string[];
  canGrantSuperAdmin: boolean;
  onClose: () => void;
  onSave: (input: { id?: number; name: string; username: string; password: string; roleLabel: string; isAdmin: boolean; isSuperAdmin: boolean; permissions: Page[] }) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [username, setUsername] = useState(initial?.username ?? "");
  const [password, setPassword] = useState("");
  const [roleLabel, setRoleLabel] = useState(initial?.roleLabel ?? "");
  const isAdmin = initial?.isAdmin ?? false;
  const [isSuperAdmin, setIsSuperAdmin] = useState(initial?.isSuperAdmin ?? false);
  const permissions: Page[] = initial?.permissions ?? [];
  const usernameTaken = existingUsernames.includes(username.trim().toLowerCase());
  const pwError = passwordPolicyError(language, password, username);
  const valid =
    Boolean(name.trim()) &&
    Boolean(username.trim()) &&
    !usernameTaken &&
    Boolean(roleLabel.trim()) &&
    (Boolean(initial) || Boolean(password.trim())) &&
    !pwError;
  return (
    <div className="overlay">
      <form
        className="modal"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          onSave({
            id: initial?.id,
            name: name.trim(),
            username: username.trim(),
            password: password.trim(),
            roleLabel: roleLabel.trim(),
            isAdmin: isSuperAdmin || isAdmin,
            isSuperAdmin,
            permissions: isSuperAdmin || isAdmin ? [] : permissions,
          });
        }}
      >
        <div className="modalHead">
          <div>
            <h2>{initial ? tx(language, "Kullanıcıyı Düzenle", "Edit User", "Bikarhênerê Biguherîne") : tx(language, "Kullanıcı Ekle", "Add User", "Bikarhêner Zêde Bike")}</h2>
            <p>{tx(language, "Kullanıcı bilgilerini ve erişebileceği bölümleri belirleyin.", "Set the user's details and which sections they can access.", "Agahiyên bikarhêner û beşên ku ew dikare gihîje diyar bike.")}</p>
          </div>
          <button type="button" onClick={onClose}>×</button>
        </div>
        <div className="formGrid">
          <label>
            {tx(language, "Ad Soyad", "Full Name", "Nav û Paşnav")}
            <input required value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            {tx(language, "Kullanıcı Adı", "Username", "Navê Bikarhêner")}
            <input required value={username} onChange={(e) => setUsername(e.target.value)} />
          </label>
          {usernameTaken && (
            <small className="wide formWarning">
              {tx(language, "Bu kullanıcı adı zaten kullanılıyor.", "This username is already in use.", "Ev navê bikarhêner jixwe tê bikaranîn.")}
            </small>
          )}
          <label>
            {tx(language, "Şifre", "Password", "Şîfre")}
            <PasswordField
              required={!initial}
              value={password}
              onChange={setPassword}
              placeholder={initial ? tx(language, "Değiştirmek için yazın", "Type to change", "Ji bo guherînê binivîse") : ""}
            />
          </label>
          {!pwError && (
            <small className="wide">
              {tx(
                language,
                "En az 10 karakter, en az bir harf ve bir rakam içermeli.",
                "At least 10 characters, with at least one letter and one number.",
                "Herî kêm 10 karakter, herî kêm yek tîp û yek hejmar.",
              )}
            </small>
          )}
          {pwError && (
            <small className="wide formWarning">{pwError}</small>
          )}
          <label>
            {tx(language, "Rol Etiketi", "Role Label", "Nîşana Rolê")}
            <input required value={roleLabel} onChange={(e) => setRoleLabel(e.target.value)} placeholder={tx(language, "Örn. Finans Müdürü", "e.g. Finance Manager", "Mînak: Birêvebirê Darayî")} />
          </label>
          <label className="wide">
            {tx(language, "Kullanıcı Türü", "User Type", "Cureya Bikarhêner")}
            <select value={isSuperAdmin ? "super" : "admin"} onChange={(e) => setIsSuperAdmin(e.target.value === "super")}>
              <option value="admin">{tx(language, "Admin — erişimi “Admin Erişimi” düğmesinden verilir", "Admin — access is granted via “Admin Access”", "Admîn — gihîştin ji bişkoja “Gihîştina Admîn” tê dayin")}</option>
              {canGrantSuperAdmin && (
                <option value="super">★ {tx(language, "Süper Admin — tüm sisteme erişir", "Super Admin — full system access", "Super Admîn — gihîştina tevahiya pergalê")}</option>
              )}
            </select>
          </label>
        </div>
        <div className="modalActions">
          <button type="button" className="light" onClick={onClose}>{tx(language, "Vazgeç", "Cancel", "Betal")}</button>
          <button className="primary" disabled={!valid}>{tx(language, "Kaydet", "Save", "Tomar Bike")}</button>
        </div>
      </form>
    </div>
  );
}

// What a non-admin sees when they open their own card in Kullanıcılar:
// name and password only — role, permissions, and admin/super-admin status
// are read-only for them (the server pins those fields regardless of what's
// sent, but hiding the controls here avoids implying they're editable).
function SelfEditModal({
  language,
  initial,
  onClose,
  onSave,
}: {
  language: Language;
  initial: UserAccount;
  onClose: () => void;
  onSave: (input: { id: number; name: string; password: string }) => void;
}) {
  const [name, setName] = useState(initial.name);
  const [password, setPassword] = useState("");
  const pwError = passwordPolicyError(language, password, initial.username);
  const valid = Boolean(name.trim()) && !pwError;
  return (
    <div className="overlay">
      <form
        className="modal"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          onSave({ id: initial.id, name: name.trim(), password: password.trim() });
        }}
      >
        <div className="modalHead">
          <div>
            <h2>{tx(language, "Bilgilerimi Düzenle", "Edit My Details", "Agahiyên Min Biguherîne")}</h2>
            <p>
              {tx(
                language,
                "Ad soyad ve şifrenizi buradan güncelleyebilirsiniz. Rol ve erişim izinleriniz sadece yönetici tarafından değiştirilebilir.",
                "Update your name and password here. Your role and access permissions can only be changed by an admin.",
                "Nav û şîfreya xwe li vir nûve bikin. Rol û destûrên gihîştinê yên we tenê ji aliyê rêveberê ve tê guherandin.",
              )}
            </p>
          </div>
          <button type="button" onClick={onClose}>×</button>
        </div>
        <div className="formGrid">
          <label>
            {tx(language, "Ad Soyad", "Full Name", "Nav û Paşnav")}
            <input required value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            {tx(language, "Kullanıcı Adı", "Username", "Navê Bikarhêner")}
            <input value={initial.username} disabled />
          </label>
          <label>
            {tx(language, "Şifre", "Password", "Şîfre")}
            <PasswordField
              value={password}
              onChange={setPassword}
              placeholder={tx(language, "Değiştirmek için yazın", "Type to change", "Ji bo guherînê binivîse")}
            />
          </label>
          {!pwError && (
            <small className="wide">
              {tx(
                language,
                "En az 10 karakter, en az bir harf ve bir rakam içermeli.",
                "At least 10 characters, with at least one letter and one number.",
                "Herî kêm 10 karakter, herî kêm yek tîp û yek hejmar.",
              )}
            </small>
          )}
          {pwError && (
            <small className="wide formWarning">{pwError}</small>
          )}
          <label>
            {tx(language, "Rol Etiketi", "Role Label", "Nîşana Rolê")}
            <input value={initial.roleLabel} disabled />
          </label>
        </div>
        <div className="modalActions">
          <button type="button" className="light" onClick={onClose}>{tx(language, "Vazgeç", "Cancel", "Betal")}</button>
          <button className="primary" disabled={!valid}>{tx(language, "Kaydet", "Save", "Tomar Bike")}</button>
        </div>
      </form>
    </div>
  );
}

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
  const [selectedId, setSelectedId] = useState<number | "new" | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserAccount | null>(null);
  const adminCount = users.filter((u) => u.isAdmin).length;
  const superAdminCount = users.filter((u) => u.isSuperAdmin).length;
  const selected = typeof selectedId === "number" ? users.find((u) => u.id === selectedId) ?? null : null;
  const cardColors = ["#4f7d0f", "#f2c61b", "#1f6f87", "#7b52bf", "#d85a30", "#d4537e", "#0f6e56", "#5f5e5a"];

  async function unlock(u: UserAccount) {
    try {
      const response = await fetch(`/api/users/${u.id}/unlock`, { method: "POST" });
      if (!response.ok) return false;
      const data = await response.json();
      setUsers((current) => current.map((x) => (x.id === data.user.id ? { ...x, ...data.user } : x)));
      return true;
    } catch {
      return false;
    }
  }

  return (
    <div className="panel">
      <div className="toolbar">
        <Title
          title={tx(language, "Kullanıcılar ve Yetkiler", "Users & Permissions", "Bikarhêner û Destûr")}
          sub={
            currentUserIsSuperAdmin
              ? tx(language, "Hesapları, kullanıcı türlerini ve erişimleri buradan yönetin", "Manage accounts, user types and access here", "Hesab, cureyên bikarhêneran û gihîştinê li vir birêve bibe")
              : tx(language, "Kendi hesap bilgilerinizi buradan görüntüleyip düzenleyebilirsiniz", "View and edit your own account details here", "Hûn dikarin agahiyên hesabê xwe li vir bibînin û biguherînin")
          }
        />
        {currentUserIsSuperAdmin && (
          <button className="primary" onClick={() => setSelectedId("new")}>
            ＋ {tx(language, "Kullanıcı Ekle", "Add User", "Bikarhêner Zêde Bike")}
          </button>
        )}
      </div>
      {currentUserIsSuperAdmin && <AccessBoard language={language} sections={sections} />}
      <div className="userCardGrid">
        {users.map((u, index) => {
          const isSelf = u.username === currentUsername;
          if (!currentUserIsSuperAdmin && !isSelf) return null;
          const isOnline = onlineSet.has(u.id);
          const access = u.isSuperAdmin
            ? tx(language, "Süper Admin", "Super Admin", "Super Admîn")
            : u.isAdmin
              ? tx(language, "Tam yetki", "Full access", "Destûra tevahî")
              : `${u.permissions.length} ${tx(language, "yetki", "permissions", "destûr")}`;
          return (
            <button key={u.id} type="button" className={`userCard${selectedId === u.id ? " selected" : ""}`} onClick={() => setSelectedId(selectedId === u.id ? null : u.id)}>
              <b style={{ background: cardColors[index % cardColors.length], color: cardColors[index % cardColors.length] === "#f2c61b" ? "#1f2e33" : "#fff" }}>{u.name.slice(0, 2).toUpperCase()}</b>
              <span>
                <strong>{u.name}</strong>
                <small>@{u.username} · {access}</small>
              </span>
              <em className={u.locked ? "locked" : isOnline ? "online" : ""}>
                {u.locked ? tx(language, "Kilitli", "Locked", "Kilît") : isOnline ? tx(language, "Çevrimiçi", "Online", "Girêdayî") : tx(language, "Aktif", "Active", "Çalak")}
              </em>
            </button>
          );
        })}
      </div>
      {selectedId !== null && currentUserIsSuperAdmin && (selectedId === "new" || selected) && (
        <UserManagePanel
          key={String(selectedId)}
          language={language}
          initial={selected}
          existingUsernames={users.filter((u) => u.id !== selected?.id).map((u) => u.username.toLowerCase())}
          sections={sections}
          canDelete={Boolean(selected) && selected!.username !== currentUsername && !(selected!.isAdmin && adminCount <= 1) && !(selected!.isSuperAdmin && superAdminCount <= 1)}
          onClose={() => setSelectedId(null)}
          onSaved={(saved, created) => {
            setUsers((current) => (created ? [...current, saved] : current.map((u) => (u.id === saved.id ? saved : u))));
            setSelectedId(created ? saved.id : selectedId);
          }}
          onDelete={() => selected && setDeleteTarget(selected)}
          onUnlock={() => (selected ? unlock(selected) : Promise.resolve(false))}
        />
      )}
      {selected && !currentUserIsSuperAdmin && (
        <SelfEditModal
          language={language}
          initial={selected}
          onClose={() => setSelectedId(null)}
          onSave={async (input) => {
            try {
              const response = await fetch(`/api/users/${input.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
              if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                alert(body.error || tx(language, "Bilgiler kaydedilemedi.", "The details could not be saved.", "Agahî nehat tomarkirin."));
                return;
              }
              const data = await response.json();
              setUsers((current) => current.map((u) => (u.id === data.user.id ? data.user : u)));
              setSelectedId(null);
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
              setSelectedId(null);
            } catch {
              alert(tx(language, "Kullanıcı silinemedi.", "The user could not be deleted.", "Bikarhêner nehat jêbirin."));
            }
            setDeleteTarget(null);
          }}
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
  return (
    <div className="accessBoard">
      <div className="accessBoardHead">
        <span className="accessBoardStar">★</span>
        <div>
          <b>{tx(language, "Süper Admin", "Super Admin", "Super Admîn")}</b>
          <small>{tx(language, "Tüm sisteme erişir; silme işlemlerinde onay ve şifre gerekir.", "Full system access; deletions need confirmation and a password.", "Gihîştina tevahiya pergalê; di jêbirinê de erêkirin û şîfre pêwîst e.")}</small>
        </div>
        <em>{pages.length} {tx(language, "bölüm", "sections", "beş")} · {accounts.length} {tx(language, "kasa", "cash accounts", "qase")}</em>
      </div>
      <div className="accessBoardBody">
        <div className="accessBoardCard">
          <h4>▤ {tx(language, "Bölümler", "Sections", "Beş")}</h4>
          <div className="accessChips">
            {pages.map((p) => (
              <span key={p}>{p}</span>
            ))}
          </div>
        </div>
        <div className="accessBoardCard">
          <h4>▣ {tx(language, "Çalışma alanları ve kasalar", "Workspaces and cash accounts", "Qadên xebatê û qase")}</h4>
          {workspaces.map((w) => (
            <div key={w.key} className="accessBoardWs">
              <div className="accessBoardWsName">{w.label} <small>{w.kasas.length}</small></div>
              <div className="accessChips kasa">
                {w.kasas.map((a) => (
                  <span key={a.id}>{a.name}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Seçilen kullanıcının hesabı, türü ve erişimleri tek panelde: sol sütun bölümler, sağ sütun çalışma alanları ve kasalar.
// Değişiklikler taslak olarak tutulur; onay kutusu işaretlenip "Kaydet" ile tek seferde yazılır.
function UserManagePanel({
  language,
  initial,
  existingUsernames,
  sections,
  canDelete,
  onClose,
  onSaved,
  onDelete,
  onUnlock,
}: {
  language: Language;
  initial: UserAccount | null;
  existingUsernames: string[];
  sections: KasaSection[];
  canDelete: boolean;
  onClose: () => void;
  onSaved: (user: UserAccount, created: boolean) => void;
  onDelete: () => void;
  onUnlock: () => Promise<boolean>;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [username, setUsername] = useState(initial?.username ?? "");
  const [password, setPassword] = useState("");
  const [roleLabel, setRoleLabel] = useState(initial?.roleLabel ?? "");
  const [isSuper, setIsSuper] = useState(initial?.isSuperAdmin ?? false);
  const [fullAccess, setFullAccess] = useState(initial?.isAdmin ?? false);
  const [pages, setPages] = useState<Page[]>(initial?.permissions ?? []);
  const [accounts, setAccounts] = useState<CashAccountSummary[] | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const failText = tx(language, "Kullanıcı kaydedilemedi.", "The user could not be saved.", "Bikarhêner nehat tomarkirin.");
  const userId = initial?.id ?? null;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/cash-accounts");
        const data = await response.json().catch(() => ({}));
        const list: CashAccountSummary[] = response.ok ? (data.cashAccounts ?? []) : [];
        let granted: number[] = [];
        if (list.length && userId != null) {
          const access = await fetch(`/api/workspace-access?cashAccountIds=${list.map((a) => a.id).join(",")}`);
          const accessData = await access.json().catch(() => ({}));
          if (access.ok) granted = accessData.grants?.[String(userId)] ?? [];
        }
        if (cancelled) return;
        setAccounts(list);
        setSelected(new Set(granted));
      } catch {
        if (!cancelled) setAccounts([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const usernameTaken = !initial && existingUsernames.includes(username.trim().toLowerCase());
  const pwError = passwordPolicyError(language, password, username);
  const valid = Boolean(name.trim()) && Boolean(username.trim()) && !usernameTaken && Boolean(roleLabel.trim()) && (Boolean(initial) || Boolean(password.trim())) && !pwError && confirmed;
  const limited = !isSuper && !fullAccess;
  const workspaces = groupKasasByWorkspace(accounts ?? [], sections, language);
  const isOn = (a: CashAccountSummary) => (userId != null && a.ownerUserId === userId) || selected.has(a.id);
  const togglePage = (p: Page) => setPages((current) => (current.includes(p) ? current.filter((x) => x !== p) : [...current, p]));
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

  async function save() {
    if (!valid) return;
    setSaving(true);
    setError("");
    try {
      const body = {
        name: name.trim(),
        roleLabel: roleLabel.trim(),
        password: password.trim(),
        isAdmin: isSuper || fullAccess,
        isSuperAdmin: isSuper,
        permissions: limited ? pages : [],
        ...(initial ? {} : { username: username.trim() }),
      };
      const response = await fetch(initial ? `/api/users/${initial.id}` : "/api/users", {
        method: initial ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || failText);
        return;
      }
      const saved: UserAccount = data.user;
      if (limited && accounts && accounts.length) {
        const access = await fetch("/api/workspace-access", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cashAccountIds: accounts.map((a) => a.id), grants: { [String(saved.id)]: [...selected] } }),
        });
        if (!access.ok) {
          const accessBody = await access.json().catch(() => ({}));
          onSaved(saved, !initial);
          setError(accessBody.error || tx(language, "Hesap kaydedildi ama kasa erişimi kaydedilemedi.", "The account was saved but cash access could not be saved.", "Hesab hate tomarkirin lê gihîştina qaseyê nehat tomarkirin."));
          return;
        }
      }
      onSaved(saved, !initial);
      setPassword("");
      setConfirmed(false);
      if (!initial) onClose();
    } catch {
      setError(failText);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="userManage">
      <div className="userManageHead">
        <div>
          <h3>{initial ? tx(language, "Hesabı yönet", "Manage account", "Hesabê birêve bibe") : tx(language, "Yeni kullanıcı", "New user", "Bikarhêna nû")}</h3>
          <small>{tx(language, "Değişiklikler kullanıcının bir sonraki işleminde geçerli olur.", "Changes apply on the user's next action.", "Guhertin di çalakiya piştî ya bikarhêner de derbas dibin.")}</small>
        </div>
        <button type="button" className="light" onClick={onClose}>{tx(language, "Kapat", "Close", "Bigire")}</button>
      </div>
      <div className="userManageGrid">
        <label>
          {tx(language, "Görünen ad", "Display name", "Navê xuya")}
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          {tx(language, "Kullanıcı adı", "Username", "Navê bikarhêner")}
          <input value={username} disabled={Boolean(initial)} onChange={(e) => setUsername(e.target.value)} />
        </label>
        {usernameTaken && <small className="wide formWarning">{tx(language, "Bu kullanıcı adı zaten kullanılıyor.", "This username is already in use.", "Ev navê bikarhêner jixwe tê bikaranîn.")}</small>}
        <label>
          {tx(language, "Rol etiketi", "Role label", "Nîşana rolê")}
          <input value={roleLabel} onChange={(e) => setRoleLabel(e.target.value)} placeholder={tx(language, "Örn. Finans Müdürü", "e.g. Finance Manager", "Mînak: Birêvebirê Darayî")} />
        </label>
        <label>
          {initial ? tx(language, "Yeni şifre (isteğe bağlı)", "New password (optional)", "Şîfreya nû (bijarte)") : tx(language, "Şifre", "Password", "Şîfre")}
          <PasswordField required={!initial} value={password} onChange={setPassword} placeholder={initial ? tx(language, "Mevcut şifreyi korumak için boş bırakın", "Leave blank to keep the current password", "Ji bo parastina şîfreya heyî vala bihêle") : ""} />
        </label>
        {pwError ? (
          <small className="wide formWarning">{pwError}</small>
        ) : (
          <small className="wide">{tx(language, "En az 10 karakter, en az bir harf ve bir rakam içermeli.", "At least 10 characters, with at least one letter and one number.", "Herî kêm 10 karakter, herî kêm yek tîp û yek hejmar.")}</small>
        )}
        <label className="wide">
          {tx(language, "Kullanıcı türü", "User type", "Cureya bikarhêner")}
          <select value={isSuper ? "super" : "admin"} onChange={(e) => setIsSuper(e.target.value === "super")}>
            <option value="admin">{tx(language, "Admin — erişimi aşağıdan seçilir", "Admin — access is chosen below", "Admîn — gihîştin li jêr tê hilbijartin")}</option>
            <option value="super">★ {tx(language, "Süper Admin — tüm sisteme erişir", "Super Admin — full system access", "Super Admîn — gihîştina tevahiya pergalê")}</option>
          </select>
        </label>
      </div>

      {isSuper ? (
        <p className="userManageNote">★ {tx(language, "Süper Admin tüm bölümlere, çalışma alanlarına ve kasalara erişir; silme işlemlerinde onay ve şifre gerekir.", "A Super Admin can reach every section, workspace and cash account; deletions need confirmation and a password.", "Super Admîn digihîje hemû beş, qad û qaseyan; di jêbirinê de erêkirin û şîfre pêwîst e.")}</p>
      ) : (
        <>
          <div className="userManageStrip">
            <label>
              <input type="checkbox" checked={fullAccess} onChange={(e) => setFullAccess(e.target.checked)} />
              <b>{tx(language, "Tam yönetici erişimi", "Full admin access", "Gihîştina rêvebirê tevahî")}</b>
              <span>{tx(language, "tüm bölümleri ve kasaları görür", "sees every section and cash account", "hemû beş û qaseyan dibîne")}</span>
            </label>
          </div>
          {limited && (
            <div className="userManageCols">
              <div className="userManageCol sectionsCol">
                <div className="userManageColHead">▤ {tx(language, "Bölümler", "Sections", "Beş")}</div>
                <div className="userManageColBody">
                  {accessPages.map((p) => (
                    <label key={p}>
                      <input type="checkbox" checked={pages.includes(p)} onChange={() => togglePage(p)} />
                      {nav.find((n) => n.id === p)?.label[language] ?? p}
                    </label>
                  ))}
                </div>
              </div>
              <div className="userManageCol kasaCol">
                <div className="userManageColHead">▣ {tx(language, "Çalışma alanları ve kasalar", "Workspaces and cash accounts", "Qadên xebatê û qase")}</div>
                <div className="userManageColBody">
                  {accounts === null ? (
                    <small>{tx(language, "Yükleniyor…", "Loading…", "Tê barkirin…")}</small>
                  ) : !accounts.length ? (
                    <small>{tx(language, "Henüz kasa yok.", "No kasas yet.", "Hîn qase tune.")}</small>
                  ) : (
                    workspaces.map((w) => {
                      const onCount = w.kasas.filter(isOn).length;
                      const all = onCount === w.kasas.length;
                      const lockedAll = userId != null && w.kasas.every((a) => a.ownerUserId === userId);
                      return (
                        <div key={w.key} className="userManageWs">
                          <label className="userManageWsHead">
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
                          {w.kasas.map((a) => {
                            const owner = userId != null && a.ownerUserId === userId;
                            return (
                              <label key={a.id} className="userManageKasa" title={owner ? tx(language, "kasa sahibi — her zaman erişebilir", "kasa owner — always has access", "xwedîyê qaseyê — her tim gihîştin heye") : undefined}>
                                <input type="checkbox" checked={isOn(a)} disabled={owner} onChange={(e) => toggleKasa(a.id, e.target.checked)} />
                                {a.name}{owner ? " ★" : ""}
                              </label>
                            );
                          })}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {error && <small className="formWarning" style={{ display: "block", marginTop: 8 }}>{error}</small>}
      <div className="userManageFoot">
        <div className="userManageFootLeft">
          {initial?.locked && (
            <button type="button" className="light" onClick={() => void onUnlock()}>🔓 {tx(language, "Kilidi Aç", "Unlock", "Kilîtê Veke")}</button>
          )}
          {canDelete && (
            <button type="button" className="light redText" onClick={onDelete}>🗑 {tx(language, "Sil", "Delete", "Jêbibe")}</button>
          )}
        </div>
        <label className="userManageConfirm">
          <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
          {tx(language, "Değişikliği onaylıyorum", "I confirm the changes", "Ez guhertinê erê dikim")}
        </label>
        <button type="button" className="primary" disabled={!valid || saving} onClick={save}>
          {saving ? tx(language, "Kaydediliyor…", "Saving…", "Tê tomarkirin…") : tx(language, "Kaydet", "Save", "Tomar Bike")}
        </button>
      </div>
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

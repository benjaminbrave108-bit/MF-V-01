"use client";

import { useEffect, useState } from "react";
import { Title, PasswordField, DeleteConfirmModal } from "./shared";
import { tx, nav } from "../lib/i18n";
import type { CashAccountSummary, Language, Page, UserAccount } from "../lib/types";
import { restrictablePages } from "../lib/types";

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
}: {
  language: Language;
  users: UserAccount[];
  setUsers: (updater: UserAccount[] | ((current: UserAccount[]) => UserAccount[])) => void;
  currentUsername: string;
  currentUserIsAdmin: boolean;
  currentUserIsSuperAdmin: boolean;
  checkPassword: (password: string) => Promise<boolean>;
}) {
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
        {currentUserIsAdmin && (
          <button className="primary" onClick={() => setEditing("new")}>
            ＋{" "}
            {tx(language, "Kullanıcı Ekle", "Add User", "Bikarhêner Zêde Bike")}
          </button>
        )}
      </div>
      <div className="users">
        {users.map((u) => {
          const isSelf = u.username === currentUsername;
          const isLastAdmin = u.isAdmin && adminCount <= 1;
          const isLastSuperAdmin = u.isSuperAdmin && superAdminCount <= 1;
          return (
            <article key={u.id}>
              <b>{u.name.slice(0, 1).toUpperCase()}</b>
              <span>
                <strong>{u.name}</strong>
                <small>@{u.username}</small>
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
                  {currentUserIsAdmin && (
                    <button type="button" onClick={() => setAccessTarget(u)}>
                      🔑 {tx(language, "Erişim Ayarları", "Access Settings", "Sazkariyên Gihîştinê")}
                    </button>
                  )}
                  {u.locked && (
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
                  {!isSelf && !isLastAdmin && !isLastSuperAdmin && (
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
      {editing && currentUserIsAdmin && (
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
      {editing && editing !== "new" && !currentUserIsAdmin && (
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
      {accessTarget && currentUserIsAdmin && (
        <KasaAccessModal language={language} user={accessTarget} onClose={() => setAccessTarget(null)} />
      )}
    </div>
  );
}

// Owner grouping'de sırayla döngüsel atanan hafif ton paleti — her sahip
// kendi rengini alır, aynı sahibin kasaları art arda geldiğinde ayırt
// edilebilsin (yeni bir kullanıcı eklendiğinde ona ait kasalar da otomatik
// olarak bir sonraki tonu alır).
const ownerTintPalette = ["#eaf6f2", "#eef3fc", "#fdf3e7", "#f5eefb", "#fdecee", "#eefbf5"];

// Süper admin only — tek bir kullanıcı için "hangi kasaları görebilir"
// ataması. Bir kasada işaretli olmayan kullanıcı, o kasanın gelir/gider/
// rapor verisine API seviyesinde de erişemez (bkz. app/api/_lib/cash-access.ts).
// Kullanıcı kartındaki "Erişim Ayarları" düğmesinden açılır — böylece Kasa
// Erişimi artık tüm kullanıcı × kasa matrisini tek panoda göstermek yerine,
// her kullanıcı için kendi kısa listesine ayrılmış olur.
function KasaAccessModal({
  language,
  user,
  onClose,
}: {
  language: Language;
  user: UserAccount;
  onClose: () => void;
}) {
  const [cashAccounts, setCashAccounts] = useState<CashAccountSummary[] | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/cash-accounts");
        const data = await response.json().catch(() => ({}));
        if (!cancelled) setCashAccounts(response.ok ? (data.cashAccounts ?? []) : []);
      } catch {
        if (!cancelled) setCashAccounts([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function toggle(cashAccountId: number, grant: boolean) {
    setBusyId(cashAccountId);
    try {
      const response = grant
        ? await fetch(`/api/cash-accounts/${cashAccountId}/access`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: user.id }),
          })
        : await fetch(`/api/cash-accounts/${cashAccountId}/access?userId=${user.id}`, { method: "DELETE" });
      if (!response.ok) {
        alert(tx(language, "İşlem tamamlanamadı.", "The operation could not be completed.", "Kirin nehat qedandin."));
        return;
      }
      setCashAccounts((current) =>
        (current ?? []).map((account) =>
          account.id === cashAccountId
            ? {
                ...account,
                sharedWithUserIds: grant
                  ? [...account.sharedWithUserIds, user.id]
                  : account.sharedWithUserIds.filter((id) => id !== user.id),
              }
            : account,
        ),
      );
    } catch {
      alert(tx(language, "İşlem tamamlanamadı.", "The operation could not be completed.", "Kirin nehat qedandin."));
    } finally {
      setBusyId(null);
    }
  }

  // Sahibe göre grupla (sahipsiz kasalar en sona) — aynı sahibin kasaları
  // art arda gelsin ki hem renk tonu hem de ayırıcı çizgi anlamlı olsun.
  const grouped = cashAccounts ? groupByOwner(cashAccounts) : [];
  const ownerColor = new Map<number | null, string>();
  let nextTint = 0;
  for (const { ownerUserId } of grouped) {
    if (!ownerColor.has(ownerUserId)) {
      ownerColor.set(ownerUserId, ownerTintPalette[nextTint % ownerTintPalette.length]);
      nextTint += 1;
    }
  }

  return (
    <div className="overlay">
      <div className="modal accessSettingsModal">
        <div className="modalHead">
          <div>
            <h2>{tx(language, "Erişim Ayarları", "Access Settings", "Sazkariyên Gihîştinê")}</h2>
            <p>
              {tx(
                language,
                `${user.name} adlı kullanıcının hangi kasaların gelir/gider/rapor verisini görebileceğini belirleyin.`,
                `Choose which kasas' income/expense/report data ${user.name} can see.`,
                `Diyar bike ka ${user.name} dikare daneyên gelir/gider/rapor ên kîjan qasan bibîne.`,
              )}
            </p>
          </div>
          <button type="button" onClick={onClose}>×</button>
        </div>
        {cashAccounts === null ? (
          <small>{tx(language, "Yükleniyor…", "Loading…", "Tê barkirin…")}</small>
        ) : !cashAccounts.length ? (
          <small>{tx(language, "Henüz kasa yok.", "No kasas yet.", "Hîn qase tune.")}</small>
        ) : (
          <>
            <small className="cashAccessLegend">
              ★ {tx(language, "kasa sahibi — her zaman erişebilir", "kasa owner — always has access", "xwedîyê qaseyê — her tim gihîştin heye")}
              {" · "}
              {tx(
                language,
                "aynı renk tonu aynı sahibin kasalarını gösterir",
                "matching shading marks kasas that share an owner",
                "renga wekhev qaseyên heman xwedî nîşan dide",
              )}
            </small>
            <div className="recordsTable cashAccessTable accessSettingsTable">
              <table>
                <thead>
                  <tr>
                    <th>{tx(language, "Kasa", "Kasa", "Qase")}</th>
                    <th>{tx(language, "Erişim", "Access", "Gihîştin")}</th>
                  </tr>
                </thead>
                <tbody>
                  {grouped.map((account, index) => {
                    const isGroupStart = index === 0 || grouped[index - 1].ownerUserId !== account.ownerUserId;
                    const isOwner = account.ownerUserId === user.id;
                    const shared = account.sharedWithUserIds.includes(user.id);
                    return (
                      <tr
                        key={account.id}
                        className={isGroupStart ? "cashAccessGroupStart" : ""}
                        style={{ backgroundColor: ownerColor.get(account.ownerUserId) }}
                      >
                        <td>
                          <span className="cellTitle">{account.name}</span>
                          <br />
                          <small>
                            {tx(language, "Sahibi", "Owner", "Xwedî")}: {account.ownerName || tx(language, "Belirtilmedi", "Unassigned", "Nehatiye diyarkirin")}
                          </small>
                        </td>
                        <td className="cashAccessCell">
                          {isOwner ? (
                            <span className="cashAccessOwnerCell" title={tx(language, "kasa sahibi", "kasa owner", "xwedîyê qaseyê")}>
                              ★
                            </span>
                          ) : (
                            <input
                              type="checkbox"
                              checked={shared}
                              disabled={busyId === account.id}
                              onChange={(e) => toggle(account.id, e.target.checked)}
                            />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
        <div className="modalActions">
          <button type="button" className="light" onClick={onClose}>
            {tx(language, "Kapat", "Close", "Bigire")}
          </button>
        </div>
      </div>
    </div>
  );
}

// Aynı sahibin kasalarını art arda getirir (mevcut göreli sırayı korur),
// sahipsiz kasalar en sona düşer.
function groupByOwner(accounts: CashAccountSummary[]): CashAccountSummary[] {
  const order: (number | null)[] = [];
  const byOwner = new Map<number | null, CashAccountSummary[]>();
  for (const account of accounts) {
    const key = account.ownerUserId ?? null;
    if (!byOwner.has(key)) {
      byOwner.set(key, []);
      order.push(key);
    }
    byOwner.get(key)!.push(account);
  }
  order.sort((a, b) => (a === null ? 1 : b === null ? -1 : 0));
  return order.flatMap((key) => byOwner.get(key)!);
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
  const [isAdmin, setIsAdmin] = useState(initial?.isAdmin ?? false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(initial?.isSuperAdmin ?? false);
  const [permissions, setPermissions] = useState<Page[]>(initial?.permissions ?? []);
  const togglePermission = (p: Page) =>
    setPermissions((current) => current.includes(p) ? current.filter((x) => x !== p) : [...current, p]);
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
            isAdmin: isAdmin || isSuperAdmin,
            isSuperAdmin,
            permissions: isAdmin || isSuperAdmin ? [] : permissions,
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
          <label className="wide relationTypeOption">
            <input type="checkbox" checked={isAdmin || isSuperAdmin} disabled={isSuperAdmin} onChange={(e) => setIsAdmin(e.target.checked)} />
            {tx(language, "Tam Yetkili (Yönetici) — tüm bölümlere erişebilir", "Full access (Admin) — can reach every section", "Destûra Tevahî (Rêveber) — dikare bighêje hemû beşan")}
          </label>
          {canGrantSuperAdmin && (
            <label className="wide relationTypeOption">
              <input type="checkbox" checked={isSuperAdmin} onChange={(e) => setIsSuperAdmin(e.target.checked)} />
              ★ {tx(
                language,
                "Süper Admin — tüm kasalara erişir, kasa erişim atamalarını yapar",
                "Super Admin — sees every kasa, manages kasa access grants",
                "Super Admîn — bighêje hemû qasan, veqetandinên gihîştinê yên qasan birêve dibe",
              )}
            </label>
          )}
          {!isAdmin && !isSuperAdmin && (
            <div className="wide userPermissionGrid">
              <small>{tx(language, "Erişebileceği bölümler", "Sections this user can access", "Beşên ku ev bikarhêner dikare bighêje")}</small>
              <div className="userPermissionOptions">
                {restrictablePages.map((p) => (
                  <label key={p} className="userPermissionOption">
                    <input type="checkbox" checked={permissions.includes(p)} onChange={() => togglePermission(p)} />
                    {nav.find((n) => n.id === p)?.label[language] ?? p}
                  </label>
                ))}
              </div>
            </div>
          )}
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

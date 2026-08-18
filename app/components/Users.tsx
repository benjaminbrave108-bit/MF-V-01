"use client";

import { useState } from "react";
import { Title, PasswordField, DeleteConfirmModal } from "./shared";
import { tx, nav } from "../lib/i18n";
import type { Language, Page, UserAccount } from "../lib/types";
import { restrictablePages } from "../lib/types";

export function Users({
  language,
  users,
  setUsers,
  currentUsername,
  checkPassword,
}: {
  language: Language;
  users: UserAccount[];
  setUsers: (updater: UserAccount[] | ((current: UserAccount[]) => UserAccount[])) => void;
  currentUsername: string;
  checkPassword: (password: string) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState<UserAccount | "new" | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserAccount | null>(null);
  const adminCount = users.filter((u) => u.isAdmin).length;
  return (
    <div className="panel">
      <div className="toolbar">
        <Title
          title={tx(language, "Kullanıcılar", "Users", "Bikarhêner")}
          sub={tx(
            language,
            "Uygulama kullanıcıları, rolleri ve erişim izinleri",
            "Application users, roles and access permissions",
            "Bikarhêner, rol û destûrên gihîştinê yên bernameyê",
          )}
        />
        <button className="primary" onClick={() => setEditing("new")}>
          ＋{" "}
          {tx(language, "Kullanıcı Ekle", "Add User", "Bikarhêner Zêde Bike")}
        </button>
      </div>
      <div className="users">
        {users.map((u) => {
          const isSelf = u.username === currentUsername;
          const isLastAdmin = u.isAdmin && adminCount <= 1;
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
                  {!isSelf && !isLastAdmin && (
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
      {editing && (
        <UserModal
          language={language}
          initial={editing === "new" ? null : editing}
          existingUsernames={users.filter((u) => u !== editing).map((u) => u.username.toLowerCase())}
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
    </div>
  );
}

function UserModal({
  language,
  initial,
  existingUsernames,
  onClose,
  onSave,
}: {
  language: Language;
  initial: UserAccount | null;
  existingUsernames: string[];
  onClose: () => void;
  onSave: (input: { id?: number; name: string; username: string; password: string; roleLabel: string; isAdmin: boolean; permissions: Page[] }) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [username, setUsername] = useState(initial?.username ?? "");
  const [password, setPassword] = useState("");
  const [roleLabel, setRoleLabel] = useState(initial?.roleLabel ?? "");
  const [isAdmin, setIsAdmin] = useState(initial?.isAdmin ?? false);
  const [permissions, setPermissions] = useState<Page[]>(initial?.permissions ?? []);
  const togglePermission = (p: Page) =>
    setPermissions((current) => current.includes(p) ? current.filter((x) => x !== p) : [...current, p]);
  const usernameTaken = existingUsernames.includes(username.trim().toLowerCase());
  const valid = Boolean(name.trim()) && Boolean(username.trim()) && !usernameTaken && Boolean(roleLabel.trim()) && (Boolean(initial) || Boolean(password.trim()));
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
            isAdmin,
            permissions: isAdmin ? [] : permissions,
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
          <label>
            {tx(language, "Rol Etiketi", "Role Label", "Nîşana Rolê")}
            <input required value={roleLabel} onChange={(e) => setRoleLabel(e.target.value)} placeholder={tx(language, "Örn. Finans Müdürü", "e.g. Finance Manager", "Mînak: Birêvebirê Darayî")} />
          </label>
          <label className="wide relationTypeOption">
            <input type="checkbox" checked={isAdmin} onChange={(e) => setIsAdmin(e.target.checked)} />
            {tx(language, "Tam Yetkili (Yönetici) — tüm bölümlere erişebilir", "Full access (Admin) — can reach every section", "Destûra Tevahî (Rêveber) — dikare bighêje hemû beşan")}
          </label>
          {!isAdmin && (
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

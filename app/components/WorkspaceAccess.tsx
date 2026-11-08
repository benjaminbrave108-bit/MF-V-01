"use client";

import { useEffect, useState } from "react";
import type { CashAccountSummary, KasaSection, Language } from "../lib/types";
import { tx } from "../lib/i18n";
import { workspaceOptions, workspaceState } from "./KasaManage";

type AccessUser = { id: number; name: string; username: string };
export type AccessKasa = { id: number; name: string; ownerUserId?: number | null };

// Çalışma alanı / tek kasa için "Kimler görebilir?" penceresi (yalnız süper admin).
// Satır = kullanıcı, sütun = kasa; "Tümü" bir kullanıcının alandaki tüm kasalarını açar/kapatır.
// Hiçbir kasası işaretli olmayan kullanıcı bu çalışma alanını hiç görmez.
export function WorkspaceAccessModal({
  language,
  title,
  kasas,
  section,
  sections = [],
  accounts = [],
  checkPassword,
  onClose,
  onDone,
}: {
  language: Language;
  title: string;
  kasas: AccessKasa[];
  section?: KasaSection;
  sections?: KasaSection[];
  accounts?: CashAccountSummary[];
  checkPassword?: (password: string) => Promise<boolean>;
  onClose: () => void;
  onDone: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [name, setName] = useState(section?.name ?? "");
  // Üst çalışma alanı: seçilirse bu alan onun içinde "bölüm" olarak görünür ("" = ana seviye).
  const [parentKey, setParentKey] = useState(section?.parentKey ?? "");
  const hasChildren = Boolean(section && sections.some((x) => x.parentKey === `sec-${section.id}`));
  const parentChoices = workspaceOptions(sections, language).filter((o) => section && o.key !== `sec-${section.id}` && !sections.some((x) => `sec-${x.id}` === o.key && x.parentKey));
  const [people, setPeople] = useState<AccessUser[]>([]);
  const [grants, setGrants] = useState<Record<string, Set<number>>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const idsKey = kasas.map((k) => k.id).join(",");

  useEffect(() => {
    let cancelled = false;
    if (!idsKey) {
      setLoading(false);
      return;
    }
    fetch(`/api/workspace-access?cashAccountIds=${idsKey}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { users: AccessUser[]; grants: Record<string, number[]> }) => {
        if (cancelled) return;
        setPeople(d.users);
        setGrants(Object.fromEntries(d.users.map((u) => [String(u.id), new Set(d.grants[String(u.id)] ?? [])])));
      })
      .catch(() => {
        if (!cancelled) setError(tx(language, "Kullanıcı listesi alınamadı.", "Could not load the user list.", "Lîsteya bikarhêneran nehat girtin."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [idsKey, language]);

  const isOwner = (userId: number, kasa: AccessKasa) => kasa.ownerUserId === userId;
  function toggle(userId: number, kasaId: number) {
    setGrants((prev) => {
      const next = new Set(prev[String(userId)] ?? []);
      if (next.has(kasaId)) next.delete(kasaId);
      else next.add(kasaId);
      return { ...prev, [String(userId)]: next };
    });
  }
  function toggleAll(userId: number) {
    setGrants((prev) => {
      const current = prev[String(userId)] ?? new Set<number>();
      const all = kasas.every((k) => current.has(k.id));
      return { ...prev, [String(userId)]: all ? new Set(kasas.filter((k) => isOwner(userId, k)).map((k) => k.id)) : new Set(kasas.map((k) => k.id)) };
    });
  }

  async function save() {
    setBusy(true);
    setError("");
    try {
      const parentChanged = Boolean(section) && (parentKey || null) !== (section?.parentKey ?? null);
      if (section && ((name.trim() && name.trim() !== section.name) || parentChanged)) {
        const renamed = await fetch(`/api/sections/${section.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...(name.trim() && name.trim() !== section.name ? { name: name.trim() } : {}), ...(parentChanged ? { parentKey: parentKey || null } : {}) }),
        });
        if (!renamed.ok) {
          setError(
            renamed.status === 409
              ? tx(language, "Bu adla bir çalışma alanı zaten var.", "A workspace with this name already exists.", "Qada xebatê bi vî navî heye.")
              : tx(language, "Kaydedilemedi.", "Could not be saved.", "Nehat tomarkirin."),
          );
          return;
        }
      }
      if (kasas.length) {
        const response = await fetch("/api/workspace-access", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cashAccountIds: kasas.map((k) => k.id),
            grants: Object.fromEntries(Object.entries(grants).map(([id, set]) => [id, [...set]])),
          }),
        });
        if (!response.ok) {
          setError(tx(language, "Erişim kaydedilemedi.", "Access could not be saved.", "Gihîştin nehat tomarkirin."));
          return;
        }
      }
      onDone();
      onClose();
    } catch {
      setError(tx(language, "Kaydedilemedi.", "Could not save.", "Nehat tomarkirin."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="overlay">
      <div className="modal kasaManageModal kasaAccessModal" onClick={(e) => e.stopPropagation()}>
        <div className="modalHead">
          <div>
            <h2>{title}</h2>
            <p>{tx(language, "Kimler görebilir? İşaretlenen kullanıcılar ilgili kasaları görür; hiçbiri işaretli değilse çalışma alanını hiç görmez.", "Who can see it? Checked users see those cash accounts; with none checked a user does not see the workspace at all.", "Kî dikare bibîne? Bikarhênerên nîşankirî wan qaseyan dibînin; heke tu nîşankirî nebe qada xebatê qet nayê dîtin.")}</p>
          </div>
          <button type="button" onClick={onClose}>×</button>
        </div>
        <div className="kasaManageBody">
          {section && (
            <label>
              {tx(language, "Çalışma alanı adı", "Workspace name", "Navê qada xebatê")}
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
            </label>
          )}
          {section && (
            <label>
              {tx(language, "Başka bir çalışma alanının bölümü olarak taşı", "Move into another workspace as a section", "Wekî beşa qadeke din bipêçe")}
              <select value={parentKey} disabled={hasChildren} onChange={(e) => setParentKey(e.target.value)}>
                <option value="">{tx(language, "— Ana seviye (bölüm değil)", "— Top level (not a section)", "— Asta bilind (ne beş e)")}</option>
                {parentChoices.map((o) => (
                  <option key={o.key} value={o.key}>{o.label}</option>
                ))}
              </select>
              <small className="kasaManageHint">
                {hasChildren
                  ? tx(language, "Bu alanın altında bölümler olduğu için başka alana taşınamaz.", "This workspace has sections under it, so it cannot be moved into another.", "Ev qad beşên wê hene, nikare bê guhastin.")
                  : tx(language, "Seçilen alanda, kasaların önünde solda \"Bölüm\" olarak görünür; basınca içindeki kasalar açılır.", "It appears as a \"Section\" before the cash accounts; click it to open its accounts.", "Wekî \"Beş\" li pêşiya qaseyan xuya dibe.")}
              </small>
            </label>
          )}
          {loading ? (
            <small className="kasaManageHint">…</small>
          ) : kasas.length === 0 ? (
            <small className="kasaManageHint">{tx(language, "Bu çalışma alanında henüz kasa yok.", "This workspace has no cash accounts yet.", "Di vê qada xebatê de hê qase tune.")}</small>
          ) : (
            <div className="accessMatrixWrap">
              <table className="accessMatrix">
                <thead>
                  <tr>
                    <th>{tx(language, "Kullanıcı", "User", "Bikarhêner")}</th>
                    {kasas.length > 1 && <th>{tx(language, "Tümü", "All", "Hemû")}</th>}
                    {kasas.map((k) => (
                      <th key={k.id} title={k.name}>{k.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {people.map((u) => {
                    const set = grants[String(u.id)] ?? new Set<number>();
                    const count = kasas.filter((k) => set.has(k.id)).length;
                    return (
                      <tr key={u.id}>
                        <th>
                          {u.name || u.username}
                          <small>{count}/{kasas.length}</small>
                        </th>
                        {kasas.length > 1 && (
                          <td>
                            <input type="checkbox" checked={count === kasas.length} onChange={() => toggleAll(u.id)} />
                          </td>
                        )}
                        {kasas.map((k) => (
                          <td key={k.id}>
                            <input type="checkbox" checked={set.has(k.id)} disabled={isOwner(u.id, k)} onChange={() => toggle(u.id, k.id)} />
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                  {people.length === 0 && (
                    <tr>
                      <td colSpan={kasas.length + 2}>{tx(language, "Yönetici olmayan kullanıcı yok.", "There are no non-admin users.", "Bikarhênerên ne-rêvebir tune.")}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          <small className="kasaManageHint">{tx(language, "Yöneticiler her kasayı görür; kasanın sahibi kendi kasasını her zaman görür.", "Administrators see every cash account; an owner always sees their own.", "Rêvebir hemû qaseyan dibînin; xwediyê qaseyê her dem qaseya xwe dibîne.")}</small>
          {error && <p className="kasaManageError">{error}</p>}
        </div>
        <div className="modalActions">
          {section && checkPassword && (
            <button type="button" className="danger" style={{ marginRight: "auto" }} onClick={() => setDeleting(true)}>
              🗑 {tx(language, "Çalışma Alanını Sil", "Delete Workspace", "Qada Xebatê Jê Bibe")}
            </button>
          )}
          <button type="button" className="light" onClick={onClose}>{tx(language, "Vazgeç", "Cancel", "Betal")}</button>
          <button type="button" className="primary" disabled={busy || loading} onClick={save}>{tx(language, "Kaydet", "Save", "Tomar bike")}</button>
        </div>
      </div>
      {deleting && section && checkPassword && (
        <WorkspaceDeleteModal
          language={language}
          section={section}
          sections={sections}
          kasas={kasas.map((k) => accounts.find((a) => a.id === k.id)).filter((a): a is CashAccountSummary => Boolean(a))}
          checkPassword={checkPassword}
          onClose={() => setDeleting(false)}
          onDone={() => {
            onDone();
            onClose();
          }}
        />
      )}
    </div>
  );
}

// Çalışma alanını siler. İçinde kasa varsa kasalar önce geçici adlı yeni bir çalışma alanına ya da seçilen mevcut bir alana
// taşınır; hiçbir kasa veya kayıt silinmez. Silme için şifre istenir.
function WorkspaceDeleteModal({
  language,
  section,
  sections,
  kasas,
  checkPassword,
  onClose,
  onDone,
}: {
  language: Language;
  section: KasaSection;
  sections: KasaSection[];
  kasas: CashAccountSummary[];
  checkPassword: (password: string) => Promise<boolean>;
  onClose: () => void;
  onDone: () => void;
}) {
  const ownKey = `sec-${section.id}`;
  const others = workspaceOptions(sections, language).filter((o) => o.key !== ownKey);
  const [mode, setMode] = useState<"temp" | "existing">("temp");
  const [tempName, setTempName] = useState(tx(language, "Geçici Kasalar", "Temporary Cash Accounts", "Qaseyên Demkî"));
  const [target, setTarget] = useState(others[0]?.key ?? "genel");
  const [password, setPassword] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function confirmDelete() {
    setBusy(true);
    setError("");
    try {
      if (!(await checkPassword(password))) {
        setError(tx(language, "Şifre yanlış.", "Wrong password.", "Şîfre şaş e."));
        return;
      }
      let targetKey = target;
      if (kasas.length && mode === "temp") {
        if (!tempName.trim()) {
          setError(tx(language, "Geçici çalışma alanı için bir ad yazın.", "Enter a name for the temporary workspace.", "Ji bo qada demkî navek binivîse."));
          return;
        }
        const created = await fetch("/api/sections", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scope: "cash", name: tempName.trim(), color: section.color }),
        });
        const body = await created.json().catch(() => ({}));
        if (!created.ok) {
          setError(created.status === 409 ? tx(language, "Bu adla bir çalışma alanı zaten var.", "A workspace with this name already exists.", "Qada xebatê bi vî navî heye.") : body.error || tx(language, "Geçici çalışma alanı oluşturulamadı.", "Could not create the temporary workspace.", "Qada demkî nehat afirandin."));
          return;
        }
        targetKey = `sec-${body.section.id}`;
      }
      for (const account of kasas) {
        const next = workspaceState(targetKey, { rjKasa: !!account.isRjKasa, listKasa: !!account.isListWorkspace });
        const moved = await fetch(`/api/cash-accounts/${account.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: account.name, listKasa: next.listKasa, rjKasa: next.rjKasa, sectionId: next.sectionId }),
        });
        if (!moved.ok) {
          setError(tx(language, `“${account.name}” taşınamadı; çalışma alanı silinmedi.`, `“${account.name}” could not be moved; the workspace was not deleted.`, `“${account.name}” nehat barkirin; qada xebatê nehat jêbirin.`));
          return;
        }
      }
      const removed = await fetch(`/api/sections/${section.id}?reason=${encodeURIComponent(reason.trim())}`, { method: "DELETE" });
      if (!removed.ok) {
        setError(tx(language, "Çalışma alanı silinemedi.", "The workspace could not be deleted.", "Qada xebatê nehat jêbirin."));
        return;
      }
      onDone();
    } catch {
      setError(tx(language, "Çalışma alanı silinemedi.", "The workspace could not be deleted.", "Qada xebatê nehat jêbirin."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="overlay">
      <div className="modal kasaManageModal" onClick={(e) => e.stopPropagation()}>
        <div className="modalHead">
          <div>
            <h2>{tx(language, "Çalışma Alanını Sil", "Delete Workspace", "Qada Xebatê Jê Bibe")}</h2>
            <p>{section.name}</p>
          </div>
          <button type="button" onClick={onClose}>×</button>
        </div>
        <div className="kasaManageBody">
          {kasas.length > 0 ? (
            <>
              <p className="kasaManageWarn">
                {tx(language, `Bu çalışma alanında ${kasas.length} kasa var. Kasalar ve kayıtları silinmez; aşağıdan nereye taşınacağını seçin.`, `This workspace has ${kasas.length} cash account(s). They and their records are not deleted; choose where to move them.`, `Di vê qada xebatê de ${kasas.length} qase hene. Ew û tomarên wan nayên jêbirin; hilbijêre ku bibin ku.`)}
              </p>
              <label className="relationTypeOption">
                <input type="radio" name="wsDelMode" checked={mode === "temp"} onChange={() => setMode("temp")} />
                {tx(language, "Geçici bir çalışma alanı oluştur ve kasaları oraya taşı", "Create a temporary workspace and move the cash accounts there", "Qadek demkî çêke û qaseyan bibe wê")}
              </label>
              {mode === "temp" && (
                <input value={tempName} maxLength={80} onChange={(e) => setTempName(e.target.value)} placeholder={tx(language, "Geçici çalışma alanı adı", "Temporary workspace name", "Navê qada demkî")} />
              )}
              <label className="relationTypeOption">
                <input type="radio" name="wsDelMode" checked={mode === "existing"} onChange={() => setMode("existing")} />
                {tx(language, "Kasaları mevcut bir çalışma alanına taşı", "Move the cash accounts to an existing workspace", "Qaseyan bibe qadeke heyî")}
              </label>
              {mode === "existing" && (
                <select value={target} onChange={(e) => setTarget(e.target.value)}>
                  {others.map((o) => (
                    <option key={o.key} value={o.key}>{o.label}</option>
                  ))}
                </select>
              )}
            </>
          ) : (
            <p className="kasaManageWarn">{tx(language, "Bu çalışma alanında kasa yok; yalnızca çalışma alanı silinecek.", "This workspace has no cash accounts; only the workspace is deleted.", "Di vê qada xebatê de qase tune; tenê qada xebatê tê jêbirin.")}</p>
          )}
          <label>
            {tx(language, "Silme gerekçesi (zorunlu)", "Reason for deleting (required)", "Sedema jêbirinê (pêwîst)")}
            <textarea rows={2} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
          </label>
          <label>
            {tx(language, "Onay için şifrenizi girin", "Enter your password to confirm", "Ji bo erêkirinê şîfreya xwe binivîse")}
            <input type="password" value={password} autoComplete="current-password" onChange={(e) => setPassword(e.target.value)} />
          </label>
          {error && <p className="kasaManageError">{error}</p>}
        </div>
        <div className="modalActions">
          <button type="button" className="light" onClick={onClose}>{tx(language, "Vazgeç", "Cancel", "Betal")}</button>
          <button type="button" className="danger" disabled={busy || !password || reason.trim().length < 3} onClick={confirmDelete}>
            {tx(language, "Çalışma Alanını Sil", "Delete Workspace", "Qada Xebatê Jê Bibe")}
          </button>
        </div>
      </div>
    </div>
  );
}

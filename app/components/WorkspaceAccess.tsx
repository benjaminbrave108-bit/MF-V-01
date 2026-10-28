"use client";

import { useEffect, useState } from "react";
import type { KasaSection, Language } from "../lib/types";
import { tx } from "../lib/i18n";

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
  onClose,
  onDone,
}: {
  language: Language;
  title: string;
  kasas: AccessKasa[];
  section?: KasaSection;
  onClose: () => void;
  onDone: () => void;
}) {
  const [name, setName] = useState(section?.name ?? "");
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
      if (section && name.trim() && name.trim() !== section.name) {
        const renamed = await fetch(`/api/sections/${section.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim() }),
        });
        if (!renamed.ok) {
          setError(
            renamed.status === 409
              ? tx(language, "Bu adla bir çalışma alanı zaten var.", "A workspace with this name already exists.", "Qada xebatê bi vî navî heye.")
              : tx(language, "Ad kaydedilemedi.", "The name could not be saved.", "Nav nehat tomarkirin."),
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
          <button type="button" className="light" onClick={onClose}>{tx(language, "Vazgeç", "Cancel", "Betal")}</button>
          <button type="button" className="primary" disabled={busy || loading} onClick={save}>{tx(language, "Kaydet", "Save", "Tomar bike")}</button>
        </div>
      </div>
    </div>
  );
}

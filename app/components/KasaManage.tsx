"use client";

import { useState } from "react";
import type { CashAccountSummary, KasaSection, Language } from "../lib/types";
import { tx } from "../lib/i18n";

// Çalışma alanı seçenekleri: hazır alanlar (Genel / Liste / RJ) + Ayarlar'dan oluşturulan kasa çalışma alanları.
// Her kasa mutlaka tek bir alana bağlıdır; "alansız" seçenek yoktur (varsayılan Genel Kasalar).
export function workspaceOptions(sections: KasaSection[], language: Language): { key: string; label: string }[] {
  return [
    { key: "genel", label: tx(language, "Genel Kasalar", "General Cash Accounts", "Qaseyên Giştî") },
    { key: "liste", label: tx(language, "Liste Kasaları", "List Cash Accounts", "Qaseyên Lîsteyê") },
    { key: "rj", label: tx(language, "RJ-Kasaları", "RJ Cash Accounts", "Qaseyên RJ") },
    ...sections.filter((x) => x.scope === "cash").map((x) => ({ key: `sec-${x.id}`, label: x.name })),
  ];
}

export function workspaceKeyOf(state: { sectionId: number | null; rjKasa: boolean; listKasa: boolean }, sections: KasaSection[]): string {
  if (state.sectionId != null && sections.some((x) => x.scope === "cash" && x.id === state.sectionId)) return `sec-${state.sectionId}`;
  if (state.listKasa) return "liste";
  if (state.rjKasa) return "rj";
  return "genel";
}

// Seçilen çalışma alanına karşılık gelen kasa işaretleri. Özel bir alana taşınırken Liste/RJ işareti korunur.
export function workspaceState(key: string, current: { rjKasa: boolean; listKasa: boolean }): { sectionId: number | null; rjKasa: boolean; listKasa: boolean } {
  if (key.startsWith("sec-")) return { sectionId: Number(key.slice(4)), rjKasa: current.rjKasa, listKasa: current.listKasa };
  if (key === "liste") return { sectionId: null, rjKasa: false, listKasa: true };
  if (key === "rj") return { sectionId: null, rjKasa: true, listKasa: false };
  return { sectionId: null, rjKasa: false, listKasa: false };
}

// Seçili kasa için "Kasayı Düzenle" ve "Çalışma Alanına Taşı" (moveOnly) penceresi.
export function KasaEditModal({
  language,
  account,
  sections,
  moveOnly = false,
  onClose,
  onDone,
}: {
  language: Language;
  account: CashAccountSummary;
  sections: KasaSection[];
  moveOnly?: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const current = { sectionId: account.sectionId ?? null, rjKasa: !!account.isRjKasa, listKasa: !!account.isListWorkspace };
  const [name, setName] = useState(account.name);
  const [wsKey, setWsKey] = useState(workspaceKeyOf(current, sections));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const options = workspaceOptions(sections, language);
  const leavingList = account.isListWorkspace && workspaceState(wsKey, current).listKasa === false;

  async function save() {
    if (!name.trim()) return;
    setBusy(true);
    setError("");
    const next = workspaceState(wsKey, current);
    try {
      const response = await fetch(`/api/cash-accounts/${account.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), listKasa: next.listKasa, rjKasa: next.rjKasa, sectionId: next.sectionId }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(body.error || tx(language, "Kasa kaydedilemedi.", "The cash account could not be saved.", "Qase nehat tomarkirin."));
        return;
      }
      onDone();
      onClose();
    } catch {
      setError(tx(language, "Kasa kaydedilemedi.", "The cash account could not be saved.", "Qase nehat tomarkirin."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="overlay">
      <div className="modal kasaManageModal" onClick={(e) => e.stopPropagation()}>
        <div className="modalHead">
          <div>
            <h2>{moveOnly ? tx(language, "Kasayı Çalışma Alanına Taşı", "Move Cash Account to Workspace", "Qaseyê Bibe Qada Xebatê") : tx(language, "Kasayı Düzenle", "Edit Cash Account", "Qaseyê Biguherîne")}</h2>
            {moveOnly && <p>{account.name}</p>}
          </div>
          <button type="button" onClick={onClose}>×</button>
        </div>
        <div className="kasaManageBody">
          {!moveOnly && (
            <label>
              {tx(language, "Kasa adı", "Cash account name", "Navê qaseyê")}
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoFocus />
            </label>
          )}
          <label>
            {tx(language, "Çalışma alanı", "Workspace", "Qada xebatê")}
            <select value={wsKey} onChange={(e) => setWsKey(e.target.value)}>
              {options.map((o) => (
                <option key={o.key} value={o.key}>{o.label}</option>
              ))}
            </select>
          </label>
          <small className="kasaManageHint">
            {tx(language, "Her kasa mutlaka bir çalışma alanına bağlıdır; taşımak kasanın kayıtlarını değiştirmez.", "Every cash account belongs to a workspace; moving it does not change its records.", "Her qase girêdayî qada xebatê ye; barkirin tomarên qaseyê naguherîne.")}
          </small>
          {leavingList && (
            <p className="kasaManageWarn">
              {tx(language, "Bu kasa şu an bir Liste Kasası. Başka alana taşırsanız Listeler sayfasındaki çalışma alanı bağlantısı kalkar (veriler silinmez).", "This is currently a List cash account. Moving it elsewhere removes its link to the Lists page workspace (data is not deleted).", "Ev qase niha Qaseya Lîsteyê ye. Heke bibe cihekî din girêdana qada xebatê ya rûpela Lîsteyê radibe (dane nayên jêbirin).")}
            </p>
          )}
          {error && <p className="kasaManageError">{error}</p>}
        </div>
        <div className="modalActions">
          <button type="button" className="light" onClick={onClose}>{tx(language, "Vazgeç", "Cancel", "Betal")}</button>
          <button type="button" className="primary" disabled={busy || !name.trim()} onClick={save}>
            {moveOnly ? tx(language, "Taşı", "Move", "Bibe") : tx(language, "Kaydet", "Save", "Tomar bike")}
          </button>
        </div>
      </div>
    </div>
  );
}

export function KasaDeleteModal({
  language,
  account,
  recordCount,
  onClose,
  onDone,
}: {
  language: Language;
  account: CashAccountSummary;
  recordCount: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function confirmDelete() {
    if (!password) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/cash-accounts/${account.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(body.error || tx(language, "Kasa silinemedi.", "The cash account could not be deleted.", "Qase nehat jêbirin."));
        return;
      }
      onDone();
      onClose();
    } catch {
      setError(tx(language, "Kasa silinemedi.", "The cash account could not be deleted.", "Qase nehat jêbirin."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="overlay">
      <div className="modal kasaManageModal" onClick={(e) => e.stopPropagation()}>
        <div className="modalHead">
          <div>
            <h2>{tx(language, "Kasayı Sil", "Delete Cash Account", "Qaseyê Jê Bibe")}</h2>
            <p>{account.name}</p>
          </div>
          <button type="button" onClick={onClose}>×</button>
        </div>
        <div className="kasaManageBody">
          <p className="kasaManageWarn">
            {tx(
              language,
              `Bu kasa ve ona bağlı ${recordCount} kayıt (kasa, gelir, gider) silinecek. Silinen kayıtlar Arşiv'e düşer; kasa ve çalışma alanı ayarları geri alınamaz.`,
              `This cash account and its ${recordCount} linked records (cash, income, expense) will be deleted. Deleted records go to the Archive; the account and its workspace settings cannot be restored.`,
              `Ev qase û ${recordCount} tomarên girêdayî (qase, dahat, mesref) wê werin jêbirin. Tomarên jêbirî diçin Arşîvê; qase û mîhengên qada xebatê venagerin.`,
            )}
          </p>
          <label>
            {tx(language, "Onay için şifrenizi girin", "Enter your password to confirm", "Ji bo erêkirinê şîfreya xwe binivîse")}
            <input
              type="password"
              value={password}
              autoComplete="current-password"
              autoFocus
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") confirmDelete();
              }}
            />
          </label>
          {error && <p className="kasaManageError">{error}</p>}
        </div>
        <div className="modalActions">
          <button type="button" className="light" onClick={onClose}>{tx(language, "Vazgeç", "Cancel", "Betal")}</button>
          <button type="button" className="danger" disabled={busy || !password} onClick={confirmDelete}>
            {tx(language, "Kasayı Kalıcı Sil", "Delete Permanently", "Bi Temamî Jê Bibe")}
          </button>
        </div>
      </div>
    </div>
  );
}

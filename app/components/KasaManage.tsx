"use client";

import { useState } from "react";
import type { CashAccountSummary, KasaSection, Language } from "../lib/types";
import { tx } from "../lib/i18n";

// Seçili kasa için "Kasayı Düzenle" ve "Kasayı Sil" (şifreyle ikinci onay) pencereleri.
export function KasaEditModal({
  language,
  account,
  sections,
  onClose,
  onDone,
}: {
  language: Language;
  account: CashAccountSummary;
  sections: KasaSection[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [name, setName] = useState(account.name);
  const [listKasa, setListKasa] = useState(!!account.isListWorkspace);
  const [rjKasa, setRjKasa] = useState(!!account.isRjKasa);
  const [sectionId, setSectionId] = useState<number | null>(account.sectionId ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const cashSections = sections.filter((s) => s.scope === "cash");

  async function save() {
    if (!name.trim()) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/cash-accounts/${account.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          // Liste Kasası işareti yalnız eklenir (çalışma alanı oluşur); kaldırma Listeler sayfasından yapılır.
          listKasa: listKasa && !account.isListWorkspace ? true : undefined,
          rjKasa,
          sectionId,
        }),
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
            <h2>{tx(language, "Kasayı Düzenle", "Edit Cash Account", "Qaseyê Biguherîne")}</h2>
          </div>
          <button type="button" onClick={onClose}>×</button>
        </div>
        <div className="kasaManageBody">
          <label>
            {tx(language, "Kasa adı", "Cash account name", "Navê qaseyê")}
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoFocus />
          </label>
          {cashSections.length > 0 && (
            <label>
              {tx(language, "Kasa bölümü", "Cash section", "Beşa qaseyê")}
              <select value={sectionId ?? ""} onChange={(e) => setSectionId(e.target.value ? Number(e.target.value) : null)}>
                <option value="">{tx(language, "Genel Kasa (bölümsüz)", "Main cash account (no section)", "Qaseya Giştî (bê beş)")}</option>
                {cashSections.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </label>
          )}
          <label className="checkRow">
            <input type="checkbox" checked={listKasa} disabled={!!account.isListWorkspace} onChange={(e) => setListKasa(e.target.checked)} />
            {tx(language, "Liste Kasası", "List cash account", "Qaseya Lîsteyê")}
          </label>
          <label className="checkRow">
            <input type="checkbox" checked={rjKasa} onChange={(e) => setRjKasa(e.target.checked)} />
            {tx(language, "RJ-Kasası", "RJ Cash Account", "Qaseya RJ")}
          </label>
          {error && <p className="kasaManageError">{error}</p>}
        </div>
        <div className="modalActions">
          <button type="button" className="light" onClick={onClose}>{tx(language, "Vazgeç", "Cancel", "Betal")}</button>
          <button type="button" className="primary" disabled={busy || !name.trim()} onClick={save}>
            {tx(language, "Kaydet", "Save", "Tomar bike")}
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

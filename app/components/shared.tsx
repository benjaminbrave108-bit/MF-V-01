"use client";

import { useState } from "react";
import { tx } from "../lib/i18n";
import type { Language } from "../lib/types";

export function Title({
  title,
  sub,
  inline,
}: {
  title: string;
  sub: string;
  inline?: boolean;
}) {
  if (inline)
    return (
      <div className="title">
        <h2>
          {title} <small className="titleSubInline">({sub})</small>
        </h2>
      </div>
    );
  return (
    <div className="title">
      <h2>{title}</h2>
      <p>{sub}</p>
    </div>
  );
}

export function PasswordField({
  value,
  onChange,
  autoComplete,
  required,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  required?: boolean;
  placeholder?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="passwordFieldWrap">
      <input
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        required={required}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        className="passwordFieldToggle"
        tabIndex={-1}
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Şifreyi gizle" : "Şifreyi göster"}
      >
        {visible ? "🙈" : "👁"}
      </button>
    </div>
  );
}

export function ConfirmModal({
  language,
  title,
  message,
  confirmLabel,
  danger,
  onClose,
  onConfirm,
}: {
  language: Language;
  title?: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="overlay">
      <form
        className="modal"
        onSubmit={(e) => {
          e.preventDefault();
          onConfirm();
        }}
      >
        <div className="modalHead">
          <div>
            <h2>
              {title ??
                tx(language, "Onay Gerekli", "Confirmation Required", "Erêkirin Pêwîst e")}
            </h2>
          </div>
          <button type="button" onClick={onClose}>
            ×
          </button>
        </div>
        <p className="deleteWarning">{message}</p>
        <div className="modalActions">
          <button type="button" className="light" onClick={onClose}>
            {tx(language, "Hayır", "No", "Na")}
          </button>
          <button className={danger ? "danger" : "primary"}>
            {confirmLabel ?? tx(language, "Evet", "Yes", "Erê")}
          </button>
        </div>
      </form>
    </div>
  );
}
export function DeleteConfirmModal({
  language,
  itemLabel,
  title,
  warningText,
  confirmLabel,
  checkPassword,
  onClose,
  onConfirm,
}: {
  language: Language;
  itemLabel: string;
  title?: string;
  warningText?: string;
  confirmLabel?: string;
  checkPassword: (password: string) => Promise<boolean>;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  return (
    <div className="overlay">
      <form
        className="modal deleteModal"
        onSubmit={async (e) => {
          e.preventDefault();
          if (step === 1) {
            setStep(2);
            return;
          }
          if (!(await checkPassword(password))) {
            setError(true);
            return;
          }
          onConfirm();
        }}
      >
        <div className="modalHead">
          <div>
            <h2>{title ?? tx(language, "Kaydı Sil", "Delete Record", "Qeydê Jêbibe")}</h2>
            <p>{itemLabel}</p>
          </div>
          <button type="button" onClick={onClose}>
            ×
          </button>
        </div>
        {step === 1 ? (
          <p className="deleteWarning">
            {warningText ?? tx(
              language,
              "Bu kayıt kalıcı olarak silinecektir. Eski hali Arşiv bölümünde saklanır. Devam etmek istiyor musunuz?",
              "This record will be permanently deleted. The previous version is kept in Archive. Continue?",
              "Ev qeyd dê bi awayekî domdar were jêbirin. Rewşa berê di Arşîvê de tê parastin. Domandin?",
            )}
          </p>
        ) : (
          <label className="settingLabel">
            {tx(
              language,
              "Onaylamak için şifrenizi girin",
              "Enter your password to confirm",
              "Ji bo piştrastkirinê şîfreya xwe binivîse",
            )}
            <input
              type="password"
              autoFocus
              autoComplete="current-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError(false);
              }}
            />
            {error && (
              <small className="deleteError">
                {tx(language, "Şifre yanlış.", "Incorrect password.", "Şîfre çewt e.")}
              </small>
            )}
          </label>
        )}
        <div className="modalActions">
          <button type="button" className="light" onClick={onClose}>
            {tx(language, "Vazgeç", "Cancel", "Betal")}
          </button>
          <button className="danger">
            {step === 1
              ? tx(language, "Devam Et", "Continue", "Bidomîne")
              : confirmLabel ?? tx(language, "Kalıcı Olarak Sil", "Delete Permanently", "Bi Domdarî Jêbibe")}
          </button>
        </div>
      </form>
    </div>
  );
}

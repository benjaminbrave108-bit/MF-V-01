"use client";

import { useState } from "react";
import { PasswordField } from "./shared";
import type { Language, Profile } from "../lib/types";

export function ProfileModal({
  profile,
  language,
  onClose,
  onSave,
}: {
  profile: Profile;
  language: Language;
  onClose: () => void;
  onSave: (x: Profile) => void;
}) {
  const [form, setForm] = useState(profile);
  const text =
    language === "tr"
      ? {
          title: "Kullanıcı Bilgilerim",
          sub: "Görünen adınızı, avatarınızı ve hesap bilgilerinizi düzenleyin.",
          name: "Ad Soyad",
          user: "Kullanıcı Adı",
          role: "Görev / Rol",
          avatar: "Kişisel Avatar",
          choose: "Fotoğraf Seç",
          remove: "Kaldır",
          cancel: "Vazgeç",
          save: "Değişiklikleri Kaydet",
          pwTitle: "Şifre Değiştir",
          pwCurrent: "Mevcut Şifre",
          pwNew: "Yeni Şifre",
          pwConfirm: "Yeni Şifre (Tekrar)",
          pwSave: "Şifreyi Güncelle",
          pwMismatch: "Yeni şifreler eşleşmiyor",
          pwSuccess: "Şifre güncellendi",
        }
      : language === "en"
        ? {
            title: "My Profile",
            sub: "Edit your avatar, display name and account information.",
            name: "Full Name",
            user: "Username",
            role: "Job / Role",
            avatar: "Personal Avatar",
            choose: "Choose Photo",
            remove: "Remove",
            cancel: "Cancel",
            save: "Save Changes",
            pwTitle: "Change Password",
            pwCurrent: "Current Password",
            pwNew: "New Password",
            pwConfirm: "New Password (again)",
            pwSave: "Update Password",
            pwMismatch: "New passwords do not match",
            pwSuccess: "Password updated",
          }
        : {
            title: "Profîla Min",
            sub: "Avatar, nav û agahiyên hesabê xwe biguherînin.",
            name: "Nav û Paşnav",
            user: "Navê Bikarhêner",
            role: "Kar / Rol",
            avatar: "Avatara Kesane",
            choose: "Wêne Hilbijêre",
            remove: "Rake",
            cancel: "Betal",
            save: "Guherînan Tomar Bike",
            pwTitle: "Şîfreyê Biguherîne",
            pwCurrent: "Şîfreya Heyî",
            pwNew: "Şîfreya Nû",
            pwConfirm: "Şîfreya Nû (dîsa)",
            pwSave: "Şîfreyê Nûve Bike",
            pwMismatch: "Şîfreyên nû li hev nakin",
            pwSuccess: "Şîfre hate nûvekirin",
          };
  function pickAvatar(file?: File) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setForm({ ...form, avatar: String(reader.result) });
    reader.readAsDataURL(file);
  }
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwStatus, setPwStatus] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [pwSaving, setPwSaving] = useState(false);
  async function changePassword() {
    if (pwSaving) return;
    if (newPassword !== confirmPassword) {
      setPwStatus({ kind: "error", text: text.pwMismatch });
      return;
    }
    setPwSaving(true);
    setPwStatus(null);
    try {
      const response = await fetch("/api/profile/password", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setPwStatus({ kind: "error", text: data.error || "Hata oluştu" });
      } else {
        setPwStatus({ kind: "success", text: text.pwSuccess });
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      }
    } catch {
      setPwStatus({ kind: "error", text: "Hata oluştu" });
    } finally {
      setPwSaving(false);
    }
  }
  return (
    <div className="overlay">
      <form
        className="modal profileModal"
        onSubmit={(e) => {
          e.preventDefault();
          onSave(form);
        }}
      >
        <div className="modalHead">
          <div>
            <h2>{text.title}</h2>
            <p>{text.sub}</p>
          </div>
          <button type="button" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="avatarEditor">
          <div className="profileAvatar">
            {form.avatar ? (
              <img src={form.avatar} alt="Avatar önizlemesi" />
            ) : (
              form.name.slice(0, 1).toUpperCase() || "A"
            )}
          </div>
          <span>
            <b>{text.avatar}</b>
            <small>PNG, JPG veya WEBP</small>
            <label className="light">
              {text.choose}
              <input
                hidden
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => pickAvatar(e.target.files?.[0])}
              />
            </label>
            {form.avatar && (
              <button
                type="button"
                className="light redText"
                onClick={() => setForm({ ...form, avatar: "" })}
              >
                {text.remove}
              </button>
            )}
          </span>
        </div>
        <div className="formGrid">
          <label>
            {text.name}
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <label>
            {text.user}
            <input value={form.username} readOnly disabled />
          </label>
          <label className="wide">
            {text.role}
            <input value={form.role} readOnly disabled />
          </label>
        </div>
        <div className="modalActions">
          <button type="button" className="light" onClick={onClose}>
            {text.cancel}
          </button>
          <button className="primary">{text.save}</button>
        </div>
        <div className="passwordEditor">
          <h3>{text.pwTitle}</h3>
          <div className="formGrid">
            <label>
              {text.pwCurrent}
              <input
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </label>
            <label>
              {text.pwNew}
              <PasswordField autoComplete="new-password" value={newPassword} onChange={setNewPassword} />
            </label>
            <label>
              {text.pwConfirm}
              <PasswordField autoComplete="new-password" value={confirmPassword} onChange={setConfirmPassword} />
            </label>
          </div>
          {pwStatus && (
            <p className={pwStatus.kind === "error" ? "loginError" : "successText"}>{pwStatus.text}</p>
          )}
          <div className="modalActions">
            <button
              type="button"
              className="light"
              disabled={pwSaving || !currentPassword || !newPassword}
              onClick={changePassword}
            >
              {text.pwSave}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

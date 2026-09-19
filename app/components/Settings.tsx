"use client";

import { useEffect, useState } from "react";
import { Title } from "./shared";
import { tx, kbGroupLogo } from "../lib/i18n";
import { defaultTypography, typographyNames, colorSwatches } from "../lib/typography";
import type { BlockedIp, Language, TypographyKey, TypographyRule, TypographySettings } from "../lib/types";

type SettingsTab = "general" | "typography" | "users" | "view" | "database";

export function Settings({
  language,
  company,
  setCompany,
  logo,
  setLogo,
  uploadLogo,
  typography,
  setTypography,
  checkPassword,
  isSuperAdmin,
  sharedOwners,
  dashboardIncludedUserIds,
  onDashboardIncludedUserIdsChange,
}: {
  language: Language;
  company: string;
  setCompany: (x: string) => void;
  logo: string;
  setLogo: (x: string) => void;
  uploadLogo: (f?: File) => void;
  typography: TypographySettings;
  setTypography: (value: TypographySettings) => void;
  checkPassword: (password: string) => Promise<boolean>;
  isSuperAdmin: boolean;
  sharedOwners: { id: number; name: string }[];
  dashboardIncludedUserIds: number[];
  onDashboardIncludedUserIdsChange: (ids: number[]) => void;
}) {
  const [tab, setTab] = useState<SettingsTab>("general");
  const [activeTypographyKey, setActiveTypographyKey] = useState<TypographyKey>("pageTitle");
  const [typographyDraft, setTypographyDraft] = useState<TypographySettings>(typography);
  const [typographyApproved, setTypographyApproved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [blockedIps, setBlockedIps] = useState<BlockedIp[]>([]);
  const [blockedIpsLoaded, setBlockedIpsLoaded] = useState(false);
  const [dbBusy, setDbBusy] = useState(false);

  useEffect(() => setTypographyDraft(typography), [typography]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/blocked-ips")
      .then((r) => (r.ok ? r.json() : { blockedIps: [] }))
      .then((data) => {
        if (!cancelled) setBlockedIps(data.blockedIps ?? []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setBlockedIpsLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function unblockIp(ip: string) {
    try {
      const response = await fetch(`/api/admin/blocked-ips/${encodeURIComponent(ip)}`, { method: "DELETE" });
      if (!response.ok) {
        alert(tx(language, "IP engeli kaldırılamadı.", "Could not remove the IP block.", "Astengiya IP nehat rakirin."));
        return;
      }
      setBlockedIps((current) => current.filter((x) => x.ip !== ip));
    } catch {
      alert(tx(language, "IP engeli kaldırılamadı.", "Could not remove the IP block.", "Astengiya IP nehat rakirin."));
    }
  }

  async function persistSettings(next: { company?: string; logo?: string; typography?: TypographySettings }) {
    setSaving(true);
    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company: next.company ?? company,
          logo: next.logo ?? logo,
          typography: next.typography ?? typography,
          language,
        }),
      });
      if (response.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } else {
        alert(tx(language, "Ayarlar kaydedilemedi.", "Settings could not be saved.", "Mîheng nehatin tomarkirin."));
      }
    } catch {
      alert(tx(language, "Ayarlar kaydedilemedi.", "Settings could not be saved.", "Mîheng nehatin tomarkirin."));
    }
    setSaving(false);
  }

  function updateTypographyDraft(key: TypographyKey, next: TypographyRule) {
    setTypographyDraft((current) => ({ ...current, [key]: next }));
    setTypographyApproved(false);
  }

  async function approveTypography(approved: boolean) {
    setTypographyApproved(approved);
    if (approved) {
      setTypography(typographyDraft);
      await persistSettings({ typography: typographyDraft });
    }
  }

  const dbErrorMessage = tx(language, "İşlem tamamlanamadı. Lütfen tekrar deneyin.", "The operation could not be completed. Please try again.", "Kirin nehat qedandin. Ji kerema xwe dîsa biceribîne.");

  async function exportDatabase() {
    setDbBusy(true);
    try {
      const response = await fetch("/api/database/export");
      if (!response.ok) throw new Error();
      const data = await response.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `mf-v01-yedek-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      alert(dbErrorMessage);
    }
    setDbBusy(false);
  }

  async function importDatabase(file?: File) {
    if (!file) return;
    setDbBusy(true);
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      const response = await fetch("/api/database/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error();
      alert(
        tx(
          language,
          "Veriler içe aktarıldı. Sayfa yenileniyor.",
          "Data imported. Reloading the page.",
          "Daneyên hatin têxistin. Rûpel tê nûvekirin.",
        ),
      );
      window.location.reload();
    } catch {
      alert(
        tx(
          language,
          "Dosya okunamadı veya içe aktarılamadı. Lütfen bu uygulamadan dışa aktarılmış bir yedek dosyası seçin.",
          "The file could not be read or imported. Please choose a backup file exported from this application.",
          "Pel nehat xwendin an têxistin. Ji kerema xwe pelek ku ji vê sepanê hatiye derxistin hilbijêre.",
        ),
      );
    }
    setDbBusy(false);
  }

  return (
    <div className="settingsPage">
      <div className="settingsMainTabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "general"} className={tab === "general" ? "active" : ""} onClick={() => setTab("general")}>
          {tx(language, "Genel Ayarlar", "General Settings", "Mîhengên Giştî")}
        </button>
        <button type="button" role="tab" aria-selected={tab === "typography"} className={tab === "typography" ? "active" : ""} onClick={() => setTab("typography")}>
          {tx(language, "Yazı ve Renk Ayarları", "Typography & Color", "Mîhengên Nivîs û Rengê")}
        </button>
        <button type="button" role="tab" aria-selected={tab === "users"} className={tab === "users" ? "active" : ""} onClick={() => setTab("users")}>
          {tx(language, "Kullanıcı Ayarları", "User Settings", "Mîhengên Bikarhêner")}
        </button>
        {isSuperAdmin && (
          <button type="button" role="tab" aria-selected={tab === "view"} className={tab === "view" ? "active" : ""} onClick={() => setTab("view")}>
            {tx(language, "Görüntüle", "View", "Nîşandan")}
          </button>
        )}
        <button type="button" role="tab" aria-selected={tab === "database"} className={tab === "database" ? "active" : ""} onClick={() => setTab("database")}>
          {tx(language, "Veri (Database) Ayarları", "Database Settings", "Mîhengên Danegehê")}
        </button>
      </div>

      {tab === "general" && (
        <div className="settings">
          <div className="panel">
            <Title
              title={tx(
                language,
                "Genel Ayarlar",
                "General Settings",
                "Mîhengên Giştî",
              )}
              sub={tx(
                language,
                "Şirket, logo ve finans tercihleri",
                "Company, logo and finance preferences",
                "Vebijarkên pargîdanî, logo û darayî",
              )}
            />
            <div className="logoBox">
              <div>{logo ? <img src={logo} alt="Logo" /> : <img src={kbGroupLogo} alt="KB Group" />}</div>
              <span>
                <strong>
                  {tx(
                    language,
                    "Şirket Logosu",
                    "Company Logo",
                    "Logoya Pargîdaniyê",
                  )}
                </strong>
                {isSuperAdmin ? (
                  <>
                    <small>{tx(language, "PNG, JPG veya WEBP", "PNG, JPG or WEBP", "PNG, JPG an WEBP")}</small>
                    <label className="light">
                      {tx(language, "Logo Seç", "Choose Logo", "Logo Hilbijêre")}
                      <input
                        hidden
                        type="file"
                        accept="image/*"
                        onChange={(e) => uploadLogo(e.target.files?.[0])}
                      />
                    </label>
                    {logo && (
                      <button className="light redText" onClick={() => setLogo("")}>
                        {tx(language, "Kaldır", "Remove", "Rake")}
                      </button>
                    )}
                  </>
                ) : (
                  <small>
                    {tx(
                      language,
                      "Sadece süper admin değiştirebilir.",
                      "Only a super admin can change this.",
                      "Tenê super admin dikare vê biguherîne.",
                    )}
                  </small>
                )}
              </span>
            </div>
            <label className="settingLabel">
              {tx(
                language,
                "Program / Şirket Adı",
                "Program / Company Name",
                "Navê Bername / Pargîdaniyê",
              )}
              <input
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                disabled={!isSuperAdmin}
                title={
                  isSuperAdmin
                    ? undefined
                    : tx(language, "Sadece süper admin değiştirebilir.", "Only a super admin can change this.", "Tenê super admin dikare vê biguherîne.")
                }
              />
            </label>
            <label className="settingLabel">
              {tx(
                language,
                "Ana Para Birimi",
                "Main Currency",
                "Yekeya Pere ya Sereke",
              )}
              <select>
                <option>USD</option>
                <option>IQD</option>
                <option>TRY</option>
                <option>EUR</option>
              </select>
            </label>
            <button className="primary" disabled={saving} onClick={() => persistSettings({})}>
              {saved
                ? tx(language, "Kaydedildi ✓", "Saved ✓", "Hat Tomarkirin ✓")
                : tx(language, "Ayarları Kaydet", "Save Settings", "Mîhengan Tomar Bike")}
            </button>
          </div>
        </div>
      )}

      {tab === "typography" && (
        <div className="settings">
          <div className="panel appearancePanel">
            <Title
              title={tx(language, "Yazı ve Renk Ayarları", "Typography & Color", "Mîhengên Nivîs û Rengê")}
              sub={tx(language, "Projedeki her yazı kademesini ayrı düzenleyin", "Edit every text level separately", "Her asta nivîsê cuda sererast bikin")}
            />
            <div className="typeCategoryButtons" role="tablist" aria-label={tx(language, "Yazı kategorileri", "Text categories", "Kategoriyên nivîsê")}>
              {(Object.keys(typographyDraft) as TypographyKey[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={activeTypographyKey === key}
                  className={activeTypographyKey === key ? "active" : ""}
                  onClick={() => setActiveTypographyKey(key)}
                >
                  {tx(language, ...typographyNames[key])}
                </button>
              ))}
            </div>
            <div className="typeSettingsSelected">
              <TypographyControl
                language={language}
                typeKey={activeTypographyKey}
                value={typographyDraft[activeTypographyKey]}
                onChange={(next) => updateTypographyDraft(activeTypographyKey, next)}
              />
            </div>
            <div className="appearanceActions">
              <button className="light" onClick={() => { setTypographyDraft(defaultTypography); setTypographyApproved(false); }}>
                ↺ {tx(language, "Varsayılana Dön", "Reset Defaults", "Vegere Destpêkê")}
              </button>
              <label className={`appearanceApproval ${typographyApproved ? "approved" : ""}`}>
                <input type="checkbox" checked={typographyApproved} onChange={(event) => approveTypography(event.target.checked)} />
                <span>{tx(language, "Yapılan Değişiklikleri Uygula", "Apply Changes", "Guherînên Hatine Kirin Bisepîne")}</span>
              </label>
            </div>
          </div>
        </div>
      )}

      {tab === "users" && (
        <div className="settings">
          <div className="panel">
            <Title
              title={tx(language, "Engellenen IP Adresleri", "Blocked IP Addresses", "Navnîşanên IP yên Astengkirî")}
              sub={tx(
                language,
                "Üst üste başarısız giriş denemesi sonrası otomatik engellenen adresler",
                "Addresses auto-blocked after repeated failed login attempts",
                "Navnîşanên ku piştî hewldanên têketinê yên bêserûber bi xweber hatine astengkirin",
              )}
            />
            {!blockedIpsLoaded ? (
              <small>{tx(language, "Yükleniyor…", "Loading…", "Tê barkirin…")}</small>
            ) : blockedIps.length === 0 ? (
              <small>{tx(language, "Engellenen IP adresi yok.", "No blocked IP addresses.", "Navnîşana IP ya astengkirî tune.")}</small>
            ) : (
              <div className="blockedIpList">
                {blockedIps.map((row) => (
                  <div key={row.ip} className="blockedIpRow">
                    <span>
                      <strong>{row.ip}</strong>
                      <small>{row.reason || tx(language, "Sebep belirtilmedi", "No reason given", "Sedem nehatiye diyarkirin")}</small>
                    </span>
                    <button type="button" className="light" onClick={() => unblockIp(row.ip)}>
                      {tx(language, "Engeli Kaldır", "Unblock", "Astengiyê Rake")}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "view" && isSuperAdmin && (
        <div className="settings">
          <div className="panel">
            <Title
              title={tx(language, "Görüntüle", "View", "Nîşandan")}
              sub={tx(
                language,
                "Ana Sayfa'daki Toplam Gelir/Gider/Net/Bakiye sonuçlarına, işaretlediğiniz kullanıcıların kasa verileri de dahil edilir. İşaretlemezseniz Ana Sayfa yalnızca kendi verilerinizle sınırlı kalır.",
                "The Ana Sayfa Total Income/Expense/Net/Balance figures also include the kasa data of any users you check below. If you check none, Ana Sayfa stays limited to your own data.",
                "Encamên Ana Sayfayê yên Dahat/Mesref/Paqij/Bakiye ya Giştî, daneyên qaseyê yên bikarhênerên ku we nîşan kirine jî digire nav xwe. Heke hûn tu kesî nîşan nekin, Ana Sayfa tenê bi daneyên we yên xwe ve tê sînorkirin.",
              )}
            />
            {sharedOwners.length === 0 ? (
              <small className="viewTabEmptyNote">
                {tx(
                  language,
                  "Henüz sizinle veri paylaşan başka bir kullanıcı yok. Bir kullanıcının burada çıkması için, önce o kullanıcının kendi kasasında Kasalar sayfasında \"Paylaş\" düğmesini açıp \"Süper Admin'in Ana Sayfa'sında göster\" seçeneğini işaretlemesi gerekir — bu onayı vermeden bir kasa burada listelenmez.",
                  "No other user has shared data with you yet. For a user to appear here, they first need to open \"Paylaş\" on their own kasa in the Kasalar page and check \"Show in Super Admin's Ana Sayfa\" — without that consent, a kasa won't be listed here.",
                  "Hîn tu bikarhênerê din daneyên xwe bi we re parve nekiriye. Ji bo ku bikarhênerek li vir xuya bibe, divê ew pêşî li ser qaseya xwe ya di rûpela Kasalar de \"Paylaş\" veke û vebijarka \"Nîşandana li Ana Sayfaya Super Admin\" nîşan bike — bêyî vê destûrê, qase li vir nayê rêzkirin.",
                )}
              </small>
            ) : (
              <div className="userPermissionOptions">
                {sharedOwners.map((owner) => {
                  const checked = dashboardIncludedUserIds.includes(owner.id);
                  return (
                    <label key={owner.id} className="userPermissionOption">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          const next = e.target.checked
                            ? [...dashboardIncludedUserIds, owner.id]
                            : dashboardIncludedUserIds.filter((id) => id !== owner.id);
                          onDashboardIncludedUserIdsChange(next);
                        }}
                      />
                      {tx(
                        language,
                        `${owner.name}'nin sonuçlarını da göster`,
                        `Also show ${owner.name}'s results`,
                        `Encamên ${owner.name} jî nîşan bide`,
                      )}
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "database" && (
        <div className="settings">
          <div className="panel">
            <Title
              title={tx(language, "Veri (Database) Ayarları", "Database Settings", "Mîhengên Danegehê")}
              sub={tx(
                language,
                "Mali verileri (kayıt, arşiv, not, rapor) yedekleyin, geri yükleyin veya sıfırlayın",
                "Back up, restore, or reset financial data (records, archive, notes, reports)",
                "Daneyên darayî (qeyd, arşîv, nîşe, rapor) tomar bike, vegerîne, an ji nû ve saz bike",
              )}
            />
            <div className="databaseActions">
              <button type="button" className="light" disabled={dbBusy} onClick={exportDatabase}>
                ⇩ {tx(language, "Dışa Aktar", "Export", "Derxe")}
              </button>
              <label className="light fileButton">
                ⇧ {tx(language, "İçe Aktar", "Import", "Têxe")}
                <input
                  hidden
                  type="file"
                  accept=".json,application/json"
                  disabled={dbBusy}
                  onChange={(e) => {
                    importDatabase(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
            <small className="databaseHint">
              {tx(
                language,
                "İçe aktarma, mevcut tüm kayıt/arşiv/not/rapor verilerinin yerine geçer. Kullanıcı hesapları ve şifreler bu işlemlerden etkilenmez.",
                "Importing replaces all current record/archive/note/report data. User accounts and passwords are not affected by these operations.",
                "Têxistin şûna hemû daneyên qeyd/arşîv/nîşe/rapor ên heyî digire. Hesabên bikarhêner û şîfre ji van kiryaran bandor nabin.",
              )}
            </small>
          </div>
        </div>
      )}

    </div>
  );
}

function TypographyControl({ language, typeKey, value, onChange }: { language: Language; typeKey: TypographyKey; value: TypographyRule; onChange: (value: TypographyRule) => void }) {
  return <section className="typeSetting">
    <div className="typeSettingPreview" style={{ fontFamily: value.font, fontSize: value.size, color: value.color }}>{tx(language, ...typographyNames[typeKey])}</div>
    <div className="typeSettingControls">
      <label>{tx(language, "Boyut", "Size", "Mezinahî")}<input type="number" min="8" max="40" value={value.size} onChange={(e) => onChange({ ...value, size: Math.max(8, Math.min(40, Number(e.target.value) || 8)) })} /></label>
      <label>{tx(language, "Yazı Tipi", "Font", "Cureyê Nivîsê")}<select value={value.font} onChange={(e) => onChange({ ...value, font: e.target.value })}><option>Arial</option><option>Segoe UI</option><option>Tahoma</option><option>Verdana</option><option>Georgia</option><option>Trebuchet MS</option></select></label>
      <label className="colorControl">{tx(language, "Renk", "Color", "Reng")}<span><input type="color" value={value.color} onChange={(e) => onChange({ ...value, color: e.target.value })} /><input className="hexInput" value={value.color} maxLength={7} onChange={(e) => /^#[0-9a-fA-F]{0,6}$/.test(e.target.value) && onChange({ ...value, color: e.target.value })} onBlur={() => !/^#[0-9a-fA-F]{6}$/.test(value.color) && onChange({ ...value, color: "#20313b" })} /></span></label>
    </div>
    <div className="colorSwatches">{colorSwatches.map((color) => <button key={color} aria-label={color} title={color} className={value.color.toLowerCase() === color ? "active" : ""} style={{ background: color }} onClick={() => onChange({ ...value, color })} />)}</div>
  </section>;
}


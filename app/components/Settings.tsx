"use client";

import { useEffect, useState } from "react";
import { Title } from "./shared";
import { tx, kbGroupLogo } from "../lib/i18n";
import { defaultTypography, typographyNames, colorSwatches } from "../lib/typography";
import type { BlockedIp, KasaSection, Language, SectionScope, TypographyKey, TypographyRule, TypographySettings } from "../lib/types";

type SettingsTab = "general" | "typography" | "sections" | "users" | "access" | "database";

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
  sections,
  onSectionsChanged,
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
  sections: KasaSection[];
  onSectionsChanged: () => void;
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
        <button type="button" role="tab" aria-selected={tab === "sections"} className={tab === "sections" ? "active" : ""} onClick={() => setTab("sections")}>
          {tx(language, "Çalışma Alanları", "Workspaces", "Qadên Xebatê")}
        </button>
        <button type="button" role="tab" aria-selected={tab === "users"} className={tab === "users" ? "active" : ""} onClick={() => setTab("users")}>
          {tx(language, "Kullanıcı Ayarları", "User Settings", "Mîhengên Bikarhêner")}
        </button>
        {isSuperAdmin && (
          <button type="button" role="tab" aria-selected={tab === "access"} className={tab === "access" ? "active" : ""} onClick={() => setTab("access")}>
            {tx(language, "Kasa Erişimi", "Cash Access", "Gihîştina Qaseyê")}
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
              <option>SYP</option>
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

      {tab === "sections" && <SectionsPanel language={language} sections={sections} onChanged={onSectionsChanged} />}
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

      {tab === "access" && isSuperAdmin && <KasaAccessPanel language={language} />}

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


// Ayarlar > Bölümler: Genel Kasa / Liste Kasası / RJ-Kasası eksenlerine ek olarak yöneticinin kasa, gelir ve gider
// bölümleri oluşturması. Her bölüm ilgili sayfadaki kutu düzenine yeni bir kutu (satır) ekler.
const SECTION_COLORS = ["#7b52bf", "#1d9e75", "#d85a30", "#378add", "#ba7517", "#d4537e", "#0f6e56", "#5f5e5a"];

function SectionsPanel({ language, sections, onChanged }: { language: Language; sections: KasaSection[]; onChanged: () => void }) {
  const [drafts, setDrafts] = useState<Record<SectionScope, { name: string; color: string }>>({
    cash: { name: "", color: SECTION_COLORS[0] },
    income: { name: "", color: SECTION_COLORS[1] },
    expense: { name: "", color: SECTION_COLORS[2] },
  });
  const [error, setError] = useState("");
  const groups: [SectionScope, string, string][] = [
    ["cash", tx(language, "Çalışma alanları (ör. Projeler)", "Workspaces (e.g. Projects)", "Qadên xebatê (mînak Proje)"), tx(language, "Birden fazla kasayı bir başlık altında toplar: Kasalar sayfasına yeni bir kutu satırı, Gelir ve Gider sayfalarına birer çalışma alanı kutusu ekler. Kasa kaydında “Çalışma alanı” ile seçilir.", "Groups several cash accounts under one heading: adds a box row to the Kasalar page and a workspace box to the Income and Expense pages. Chosen with “Workspace” on a cash record.", "Çend qaseyan di bin yek sernavê de kom dike: li rûpela Qase rêzeke qutiyê û li rûpelên Dahat û Mesref qutiyeke qada xebatê zêde dike. Di tomara qaseyê de bi “Qada xebatê” tê hilbijartin.")],
    ["income", tx(language, "Gelir bölümleri", "Income sections", "Beşên dahatê"), tx(language, "Gelir sayfasına yeni bir kutu ekler; gelir kaydında “Bölüm” ile seçilir.", "Adds a new box to the Income page; chosen with “Section” on an income record.", "Qutiyeke nû li rûpela Dahat zêde dike; di tomara dahatê de bi “Beş” tê hilbijartin.")],
    ["expense", tx(language, "Gider bölümleri", "Expense sections", "Beşên mesrefê"), tx(language, "Gider sayfasına yeni bir kutu ekler; gider kaydında “Bölüm” ile seçilir.", "Adds a new box to the Expense page; chosen with “Section” on an expense record.", "Qutiyeke nû li rûpela Mesref zêde dike; di tomara mesrefê de bi “Beş” tê hilbijartin.")],
  ];
  async function call(url: string, method: string, body?: unknown) {
    const response = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(data?.error || "Hata");
      return false;
    }
    setError("");
    onChanged();
    return true;
  }
  return (
    <div className="panel sectionsPanel">
      <Title
        title={tx(language, "Çalışma Alanları", "Workspaces", "Qadên Xebatê")}
        sub={tx(language, "Genel Kasa, Liste Kasası ve RJ-Kasası eksenlerine ek bölümler oluşturun; her bölüm kutu sistemine yeni bir kutu ekler.", "Create sections in addition to the Main, List and RJ cash axes; each section adds a new box to the box system.", "Ji bilî tevgerên Qaseya Giştî, Lîste û RJ beşan çêkin; her beş qutiyeke nû li pergala qutiyan zêde dike.")}
      />
      {error && <p className="listsError">{error}</p>}
      {groups.map(([scope, title, hint]) => (
        <div key={scope} className="sectionGroup">
          <h4>{title}</h4>
          <small className="listMuted">{hint}</small>
          <div className="sectionChips">
            {sections.filter((x) => x.scope === scope).map((x) => (
              <span key={x.id} className="sectionChip" style={{ borderColor: x.color, background: `${x.color}18` }}>
                <i style={{ background: x.color }} />
                {x.name}
                <button
                  type="button"
                  title={tx(language, "Yeniden adlandır", "Rename", "Nav biguherîne")}
                  onClick={() => {
                    const next = prompt(tx(language, "Bölüm adı", "Section name", "Navê beşê"), x.name);
                    if (next && next.trim() && next.trim() !== x.name) call(`/api/sections/${x.id}`, "PUT", { name: next.trim() });
                  }}
                >✎</button>
                <button
                  type="button"
                  title={tx(language, "Sil", "Delete", "Jê bibe")}
                  onClick={() => confirm(tx(language, `“${x.name}” silinsin mi? Kasa/kayıtlar silinmez, bölümsüz kalır.`, `Delete “${x.name}”? Cash accounts/records are kept without a section.`, `“${x.name}” were jêbirin? Qase/tomar namînin, bê beş dimînin.`)) && call(`/api/sections/${x.id}`, "DELETE")}
                >×</button>
              </span>
            ))}
            {sections.filter((x) => x.scope === scope).length === 0 && <small className="listMuted">—</small>}
          </div>
          <form
            className="sectionForm"
            onSubmit={async (e) => {
              e.preventDefault();
              const d = drafts[scope];
              if (!d.name.trim()) return;
              if (await call("/api/sections", "POST", { scope, name: d.name.trim(), color: d.color })) setDrafts((prev) => ({ ...prev, [scope]: { ...prev[scope], name: "" } }));
            }}
          >
            <input value={drafts[scope].name} maxLength={80} placeholder={tx(language, "Yeni bölüm adı", "New section name", "Navê beşa nû")} onChange={(e) => setDrafts((prev) => ({ ...prev, [scope]: { ...prev[scope], name: e.target.value } }))} />
            <span className="sectionColors">
              {SECTION_COLORS.map((c) => (
                <button key={c} type="button" className={drafts[scope].color === c ? "active" : ""} style={{ background: c }} aria-label={c} onClick={() => setDrafts((prev) => ({ ...prev, [scope]: { ...prev[scope], color: c } }))} />
              ))}
            </span>
            <button className="primary compact" disabled={!drafts[scope].name.trim()}>＋ {tx(language, "Bölüm ekle", "Add section", "Beş zêde bike")}</button>
          </form>
        </div>
      ))}
    </div>
  );
}

// Süper yönetici: her kullanıcının hangi kasaları görebileceğini belirler.
function KasaAccessPanel({ language }: { language: Language }) {
  type AccessUser = { id: number; name: string; username: string; isSuperAdmin: boolean };
  type AccessKasa = { id: number; name: string; ownerUserId: number | null; ownerName?: string | null };
  const [users, setUsers] = useState<AccessUser[]>([]);
  const [kasas, setKasas] = useState<AccessKasa[]>([]);
  const [userId, setUserId] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/users").then((r) => (r.ok ? r.json() : { users: [] })),
      fetch("/api/cash-accounts").then((r) => (r.ok ? r.json() : { cashAccounts: [] })),
    ]).then(([u, k]) => {
      if (cancelled) return;
      const list = (u.users as AccessUser[]).filter((x) => !x.isSuperAdmin);
      setUsers(list);
      setKasas(k.cashAccounts as AccessKasa[]);
      if (list[0]) setUserId(list[0].id);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (userId === null) return;
    let cancelled = false;
    setMessage("");
    fetch(`/api/users/${userId}/cash-access`)
      .then((r) => (r.ok ? r.json() : { cashAccountIds: [] }))
      .then((d) => {
        if (!cancelled) setSelected(new Set(d.cashAccountIds as number[]));
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const ownedByUser = (k: AccessKasa) => k.ownerUserId === userId;
  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function save() {
    if (userId === null) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/users/${userId}/cash-access`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cashAccountIds: [...selected] }),
      });
      setMessage(
        response.ok
          ? tx(language, "Kaydedildi.", "Saved.", "Hate tomarkirin.")
          : tx(language, "Kaydedilemedi.", "Could not be saved.", "Nehat tomarkirin."),
      );
    } catch {
      setMessage(tx(language, "Kaydedilemedi.", "Could not be saved.", "Nehat tomarkirin."));
    } finally {
      setBusy(false);
    }
  }

  const visibleCount = kasas.filter((k) => selected.has(k.id) || ownedByUser(k)).length;

  return (
    <div className="settings">
      <div className="panel kasaAccessPanel">
        <Title
          title={tx(language, "Kasa Erişimi", "Cash Access", "Gihîştina Qaseyê")}
          sub={tx(
            language,
            "Her kullanıcının hangi kasaları görebileceğini belirleyin. Süper yöneticiler her şeyi görür; kullanıcı kendi oluşturduğu kasayı her zaman görür.",
            "Choose which cash accounts each user can see. Super admins see everything; a user always sees the cash accounts they created.",
            "Diyar bikin ku her bikarhêner kîjan qaseyan dibîne. Super admin her tiştî dibînin; bikarhêner qaseya ku çêkiriye her tim dibîne.",
          )}
        />
        {users.length === 0 ? (
          <small>{tx(language, "Kasa erişimi ayarlanacak başka kullanıcı yok.", "There are no other users to configure.", "Bikarhênerek din tune ye.")}</small>
        ) : (
          <>
            <label className="kasaAccessUser">
              {tx(language, "Kullanıcı", "User", "Bikarhêner")}
              <select value={userId ?? ""} onChange={(e) => setUserId(Number(e.target.value))}>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.name} ({u.username})</option>
                ))}
              </select>
            </label>
            <div className="kasaAccessBox">
              <div className="kasaAccessHead">
                <span>
                  👁 <b>{tx(language, "Hangi kasaları görebilir", "Which cash accounts can be seen", "Kîjan qaseyan dibîne")}</b>
                  <em className="kasaAccessCount">{visibleCount} / {kasas.length} {tx(language, "kasa", "accounts", "qase")}</em>
                </span>
                <span className="kasaAccessBtns">
                  <button type="button" className="light compact" onClick={() => setSelected(new Set(kasas.map((k) => k.id)))}>
                    {tx(language, "Tümünü işaretle", "Select all", "Hemûyan nîşan bike")}
                  </button>
                  <button type="button" className="light compact" onClick={() => setSelected(new Set())}>
                    {tx(language, "Tümünü kaldır", "Clear all", "Hemûyan rake")}
                  </button>
                </span>
              </div>
              <div className="kasaAccessGrid">
                {kasas.map((k) => {
                  const owned = ownedByUser(k);
                  return (
                    <label key={k.id} className={`kasaAccessItem${selected.has(k.id) || owned ? " on" : ""}`}>
                      <input type="checkbox" checked={selected.has(k.id) || owned} disabled={owned} onChange={() => toggle(k.id)} />
                      <b>{k.name}</b>
                      {k.ownerName && <small>{k.ownerName}</small>}
                    </label>
                  );
                })}
              </div>
            </div>
            <div className="kasaAccessFoot">
              {message && <small>{message}</small>}
              <button type="button" className="primary" disabled={busy} onClick={save}>
                {tx(language, "Değişiklikleri kaydet", "Save changes", "Guhertinan tomar bike")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

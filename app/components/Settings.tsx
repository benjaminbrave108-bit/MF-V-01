"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Title, DeleteConfirmModal } from "./shared";
import { parentWorkspaceOptions } from "./KasaManage";
import { tx, kbGroupLogo } from "../lib/i18n";
import { defaultTypography, typographyNames, colorSwatches } from "../lib/typography";
import type { BlockedIp, KasaSection, NoteColumn, Language, SectionScope, TypographyKey, TypographyRule, TypographySettings } from "../lib/types";

type SettingsTab = "general" | "typography" | "sections" | "rates" | "noteTasks" | "users" | "access" | "database";

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
  usersPanel,
  noteColumns = [],
  onNoteColumnsChanged,
  rateInfo = { manual: {}, auto: {}, date: null },
  onExchangeRatesChanged,
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
  usersPanel?: ReactNode;
  noteColumns?: NoteColumn[];
  onNoteColumnsChanged?: () => void;
  rateInfo?: { manual: Record<string, number>; auto: Record<string, number>; date: string | null };
  onExchangeRatesChanged?: () => void;
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
        <button type="button" role="tab" aria-selected={tab === "rates"} className={tab === "rates" ? "active" : ""} onClick={() => setTab("rates")}>
          {tx(language, "Döviz Kurları", "Exchange Rates", "Kurên Diravan")}
        </button>
        <button type="button" role="tab" aria-selected={tab === "noteTasks"} className={tab === "noteTasks" ? "active" : ""} onClick={() => setTab("noteTasks")}>
          {tx(language, "Not Görevleri", "Note Tasks", "Erkên Nîşeyan")}
        </button>
        <button type="button" role="tab" aria-selected={tab === "users"} className={tab === "users" ? "active" : ""} onClick={() => setTab("users")}>
          {tx(language, "Kullanıcı Ayarları", "User Settings", "Mîhengên Bikarhêner")}
        </button>
        {isSuperAdmin && (
          <button type="button" role="tab" aria-selected={tab === "access"} className={tab === "access" ? "active" : ""} onClick={() => setTab("access")}>
            {tx(language, "Kullanıcılar ve Yetkiler", "Users & Permissions", "Bikarhêner û Destûr")}
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

      {tab === "sections" && <SectionsPanel language={language} sections={sections} onChanged={onSectionsChanged} checkPassword={checkPassword} />}
      {tab === "rates" && <ExchangeRatesPanel language={language} info={rateInfo} onSaved={onExchangeRatesChanged} />}
      {tab === "noteTasks" && <NoteColumnsPanel language={language} columns={noteColumns} onChanged={onNoteColumnsChanged} />}
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

      {tab === "access" && isSuperAdmin && usersPanel}

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

// Ayarlar > Döviz Kurları: "1 USD = X birim". Kasalar/Gelir/Gider tablolarındaki "USD Karşılığı"
// sütunu USD dışındaki tutarları bu kurlarla otomatik çevirir (tutar / kur).
function ExchangeRatesPanel({ language, info, onSaved }: { language: Language; info: { manual: Record<string, number>; auto: Record<string, number>; date: string | null }; onSaved?: () => void }) {
  const rates = info.manual;
  const CODES: { code: string; name: [string, string, string] }[] = [
    { code: "EUR", name: ["Euro", "Euro", "Euro"] },
    { code: "TRY", name: ["Türk Lirası", "Turkish Lira", "Lîreya Tirkî"] },
    { code: "SYP", name: ["Suriye Lirası", "Syrian Pound", "Lîreya Sûrî"] },
    { code: "IQD", name: ["Irak Dinarı", "Iraqi Dinar", "Dînarê Iraqî"] },
  ];
  const toText = (r: Record<string, number>) => Object.fromEntries(CODES.map((c) => [c.code, r[c.code] ? String(r[c.code]) : ""]));
  const [draft, setDraft] = useState<Record<string, string>>(toText(rates));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!dirty) setDraft(toText(rates));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rates]);
  async function refreshNow() {
    setBusy(true);
    try {
      const response = await fetch("/api/exchange-rates?refresh=1");
      setMessage(response.ok ? tx(language, "Günlük kur güncellendi.", "Daily rates updated.", "Kurê rojane nû bû.") : tx(language, "Kur alınamadı.", "Could not fetch rates.", "Kur nehat girtin."));
      onSaved?.();
    } catch {
      setMessage(tx(language, "Kur alınamadı.", "Could not fetch rates.", "Kur nehat girtin."));
    }
    setBusy(false);
  }
  async function save() {
    const out: Record<string, number> = {};
    for (const c of CODES) {
      const raw = draft[c.code].trim().replace(",", ".");
      if (!raw) continue;
      const n = Number(raw);
      if (!Number.isFinite(n) || n <= 0) {
        setMessage(tx(language, c.code + " kuru geçerli bir sayı olmalı.", c.code + " rate must be a valid number.", "Kurê " + c.code + " divê jimarek rast be."));
        return;
      }
      out[c.code] = n;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/exchange-rates", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rates: out }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) setMessage(data.error || tx(language, "Kaydedilemedi.", "Could not be saved.", "Nehat tomarkirin."));
      else {
        setDirty(false);
        setMessage(tx(language, "Kaydedildi.", "Saved.", "Hat tomarkirin."));
        onSaved?.();
      }
    } catch {
      setMessage(tx(language, "Kaydedilemedi.", "Could not be saved.", "Nehat tomarkirin."));
    }
    setBusy(false);
  }
  return (
    <div className="settings">
      <div className="panel">
        <Title
          title={tx(language, "Döviz Kurları", "Exchange Rates", "Kurên Diravan")}
          sub={tx(language, "Kurlar her gün internetten otomatik alınır. Tablolarda USD dışı bir tutarın üzerine gelince o günün kuruyla USD karşılığı görünür. Elle kur girerseniz otomatik kurun yerine o kullanılır.", "Rates are fetched automatically every day. Hover a non-USD amount to see its USD value at the daily rate. A rate you enter overrides the automatic one.", "Kur her roj bixwe têne girtin. Li ser diravekî ne-USD bisekine, wekheva USD xuya dibe.")}
        />
        <div className="noteColumnsEditor">
          {CODES.map((c) => (
            <div className="noteColumnRow" key={c.code}>
              <b style={{ width: 150 }}>1 USD =</b>
              <input
                inputMode="decimal"
                value={draft[c.code]}
                placeholder={info.auto[c.code] ? String(info.auto[c.code]) : "—"}
                aria-label={c.code}
                onChange={(e) => { setDraft({ ...draft, [c.code]: e.target.value }); setDirty(true); setMessage(""); }}
              />
              <span style={{ width: 190 }}>{c.code} · {tx(language, ...c.name)}{!draft[c.code] && info.auto[c.code] ? " · " + tx(language, "otomatik", "auto", "xweber") : ""}</span>
            </div>
          ))}
        </div>
        <div className="noteColumnsActions">
          <button type="button" className="primary" disabled={!dirty || busy} onClick={save}>{tx(language, "Kaydet", "Save", "Tomar Bike")}</button>
          <button type="button" disabled={busy} onClick={refreshNow}>{tx(language, "Günlük kuru şimdi güncelle", "Update daily rates now", "Kurê rojane niha nû bike")}</button>
          <small>{info.date ? tx(language, "Son otomatik güncelleme: ", "Last automatic update: ", "Nûvekirina dawî: ") + info.date : tx(language, "Henüz otomatik kur alınmadı.", "No automatic rates yet.", "Hê kur nehatiye girtin.")}</small>
          {message && <small>{message}</small>}
        </div>
        <small className="listKasaHint">{tx(language, "Kuru tanımlı olmayan para birimlerinin karşılığı tabloda \"?\" görünür. USD tutarlar için dönüşüm gerekmez.", "Currencies without a rate show \"?\" in the table. USD amounts need no conversion.", "Diravên bê kur di tabloyê de \"?\" xuya dikin.")}</small>
      </div>
    </div>
  );
}

// Ayarlar > Not Görevleri: Notlar panosundaki sütunları (Önemli, Acil, Bekleyen, Tamamlanmış…)
// ekleme, yeniden adlandırma, renklendirme, sıralama ve silme. Silinen sütundaki notlar ilk sütuna taşınır.
function NoteColumnsPanel({ language, columns, onChanged }: { language: Language; columns: NoteColumn[]; onChanged?: () => void }) {
  type Draft = { key?: string; label: string; color: string };
  const toDraft = (cols: NoteColumn[]): Draft[] => cols.map((c) => ({ key: c.key, label: c.label, color: c.color }));
  const [draft, setDraft] = useState<Draft[]>(toDraft(columns));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!dirty) setDraft(toDraft(columns));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns]);
  const change = (next: Draft[]) => {
    setDraft(next);
    setDirty(true);
    setMessage("");
  };
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= draft.length) return;
    const next = [...draft];
    [next[i], next[j]] = [next[j], next[i]];
    change(next);
  };
  async function save() {
    if (draft.some((c) => !c.label.trim())) {
      setMessage(tx(language, "Her sütunun bir adı olmalı.", "Every column needs a name.", "Her stûnek divê nav hebe."));
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/note-columns", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ columns: draft.map((c) => ({ ...c, label: c.label.trim() })) }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(data.error || tx(language, "Kaydedilemedi.", "Could not be saved.", "Nehat tomarkirin."));
      } else {
        setDirty(false);
        setDraft(toDraft(data.columns ?? []));
        setMessage(tx(language, "Kaydedildi.", "Saved.", "Hat tomarkirin."));
        onChanged?.();
      }
    } catch {
      setMessage(tx(language, "Kaydedilemedi.", "Could not be saved.", "Nehat tomarkirin."));
    }
    setBusy(false);
  }
  return (
    <div className="settings">
      <div className="panel">
        <Title
          title={tx(language, "Not Görevleri", "Note Tasks", "Erkên Nîşeyan")}
          sub={tx(language, "Notlar sayfasındaki sütunları (Önemli, Acil, Bekleyen, Tamamlanmış…) ekleyin, düzenleyin veya silin.", "Add, edit or remove the columns on the Notes page (Important, Urgent, Pending, Completed…).", "Stûnên rûpela Nîşeyan lê zêde bike, biguherîne an jê bibe.")}
        />
        <div className="noteColumnsEditor">
          {draft.map((c, i) => (
            <div className="noteColumnRow" key={c.key ?? "new-" + i}>
              <input type="color" value={c.color} aria-label={tx(language, "Renk", "Color", "Reng")} onChange={(e) => change(draft.map((x, k) => (k === i ? { ...x, color: e.target.value } : x)))} />
              <input value={c.label} maxLength={60} aria-label={tx(language, "Sütun adı", "Column name", "Navê stûnê")} onChange={(e) => change(draft.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)))} />
              <button type="button" className="light compact" disabled={i === 0} onClick={() => move(i, -1)} title={tx(language, "Yukarı", "Up", "Jor")}>↑</button>
              <button type="button" className="light compact" disabled={i === draft.length - 1} onClick={() => move(i, 1)} title={tx(language, "Aşağı", "Down", "Jêr")}>↓</button>
              <button type="button" className="light compact redText" disabled={draft.length <= 1} onClick={() => change(draft.filter((_, k) => k !== i))} title={tx(language, "Sil", "Delete", "Jêbibe")}>🗑</button>
            </div>
          ))}
        </div>
        <div className="noteColumnsActions">
          <button type="button" className="light" disabled={draft.length >= 12} onClick={() => change([...draft, { label: "", color: "#7b52bf" }])}>
            ＋ {tx(language, "Yeni Sütun Ekle", "Add Column", "Stûna Nû Zêde Bike")}
          </button>
          <button type="button" className="primary" disabled={!dirty || busy} onClick={save}>
            {tx(language, "Kaydet", "Save", "Tomar Bike")}
          </button>
          {dirty && (
            <button type="button" className="light" onClick={() => { setDraft(toDraft(columns)); setDirty(false); setMessage(""); }}>
              {tx(language, "Vazgeç", "Cancel", "Betal Bike")}
            </button>
          )}
          {message && <small>{message}</small>}
        </div>
        <small className="listKasaHint">{tx(language, "Bir sütun silinirse içindeki notlar ilk sütuna taşınır.", "If a column is deleted, its notes move to the first column.", "Heke stûnek were jêbirin, nîşeyên wê diçin stûna yekem.")}</small>
      </div>
    </div>
  );
}

function SectionsPanel({ language, sections, onChanged, checkPassword }: { language: Language; sections: KasaSection[]; onChanged: () => void; checkPassword: (password: string) => Promise<boolean> }) {
  const [deleteTarget, setDeleteTarget] = useState<KasaSection | null>(null);
  const [drafts, setDrafts] = useState<Record<SectionScope, { name: string; color: string }>>({
    cash: { name: "", color: SECTION_COLORS[0] },
    income: { name: "", color: SECTION_COLORS[1] },
    expense: { name: "", color: SECTION_COLORS[2] },
  });
  const [error, setError] = useState("");
  // Kasa çalışma alanı eklerken doluysa yeni alan bu alanın içinde "bölüm" olur.
  const [cashParent, setCashParent] = useState("");
  const parentLabel = (x: KasaSection) => (x.parentKey ? parentWorkspaceOptions(sections, language).find((o) => o.key === x.parentKey)?.label : undefined);
  const groups: [SectionScope, string, string][] = [
    ["cash", tx(language, "Çalışma alanları (Proje Kasaları, Şirketler…)", "Workspaces (Project cash accounts, Companies…)", "Qadên xebatê (Qaseyên Projeyê, Şirket…)"), tx(language, "Kasalar sayfasında kasalar çalışma alanları başlığı altında görünür. Burada oluşturduğunuz her alan Kasalar sayfasına kendi renginde bir başlık ve kutu satırı ekler; kasa kaydında “Çalışma alanı” ile seçilir. Diğer, Liste Kasaları ve RJ-Kasaları hazır alanlardır.", "On the Kasalar page cash accounts appear under workspace headings. Each workspace created here adds a colored heading and box row; chosen with “Workspace” on a cash record. General, List and RJ cash accounts are built-in workspaces.", "Di rûpela Qase de qase di bin sernavên qadên xebatê de xuya dibin. Her qada ku li vir çêdikin sernavek û rêzeke qutiyê ya rengîn zêde dike; di tomara qaseyê de bi “Qada xebatê” tê hilbijartin. Qaseyên Giştî, Lîste û RJ qadên amade ne.")],
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
    <>
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
                {parentLabel(x) ? `${parentLabel(x)} › ${x.name}` : x.name}
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
                  onClick={() => setDeleteTarget(x)}
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
              if (await call("/api/sections", "POST", { scope, name: d.name.trim(), color: d.color, ...(scope === "cash" && cashParent ? { parentKey: cashParent } : {}) })) setDrafts((prev) => ({ ...prev, [scope]: { ...prev[scope], name: "" } }));
            }}
          >
            <input value={drafts[scope].name} maxLength={80} placeholder={tx(language, "Yeni bölüm adı", "New section name", "Navê beşa nû")} onChange={(e) => setDrafts((prev) => ({ ...prev, [scope]: { ...prev[scope], name: e.target.value } }))} />
            {scope === "cash" && (
              <select value={cashParent} onChange={(e) => setCashParent(e.target.value)} aria-label={tx(language, "Tür", "Type", "Cure")}>
                <option value="">{tx(language, "Çalışma alanı", "Workspace", "Qada xebatê")}</option>
                {parentWorkspaceOptions(sections, language).map((o) => (
                  <option key={o.key} value={o.key}>{tx(language, "Bölüm → ", "Section in → ", "Beş li → ")}{o.label}</option>
                ))}
              </select>
            )}
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
      {deleteTarget && (
        <DeleteConfirmModal
          language={language}
          itemLabel={deleteTarget.name}
          warningText={tx(language, "Kasa ve kayıtlar silinmez; bölümsüz (Diğer) kalır.", "Cash accounts and records are kept without a section.", "Qase û tomar nayên jêbirin; bê beş dimînin.")}
          checkPassword={checkPassword}
          onClose={() => setDeleteTarget(null)}
          onConfirm={(reason) => {
            const target = deleteTarget;
            setDeleteTarget(null);
            call(`/api/sections/${target.id}?reason=${encodeURIComponent(reason)}`, "DELETE");
          }}
        />
      )}
    </>
  );
}

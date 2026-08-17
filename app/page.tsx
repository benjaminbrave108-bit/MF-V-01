"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import ExcelJS from "exceljs";

type Kind = "cash" | "income" | "expense";
type Page =
  | "dashboard"
  | Kind
  | "reportBuilder"
  | "notes"
  | "archive"
  | "users"
  | "settings";
type RecordItem = {
  id: number;
  kind: Kind;
  date: string;
  source: string;
  detail: string;
  note: string;
  person: string;
  amount: number;
  currency: string;
  project: string;
  tags: string[];
  monthlyExpense: boolean;
  cashAccount: string;
  listName: string;
};
type ArchiveItem = {
  id: number;
  action: "Düzenlendi" | "Silindi";
  at: string;
  user: string;
  old: RecordItem;
};
type NoteStatus = "important" | "urgent" | "pending" | "completed";
type NoteRelation = "none" | "cash" | "income" | "expense" | "reports" | "archive" | "other";
type FinanceNote = {
  id: number;
  title: string;
  content: string;
  status: NoteStatus;
  relation: NoteRelation;
  relationDetail: string;
  createdAt: string;
  updatedAt: string;
};
type Language = "tr" | "en" | "ku";
type Profile = { name: string; username: string; role: string; avatar: string; isAdmin: boolean; permissions: Page[] };
type UserAccount = {
  id: number;
  name: string;
  username: string;
  roleLabel: string;
  isAdmin: boolean;
  permissions: Page[];
  locked: boolean;
  lockedAt: string | null;
  lockReason: string;
};
type BlockedIp = { ip: string; reason: string; createdAt: string };
const restrictablePages: Page[] = ["cash", "income", "expense", "reportBuilder", "notes", "archive"];
const adminOnlyPages: Page[] = ["users", "settings"];
type ReportLine = { date: string; title: string; detail: string; note: string; amount: number };
type PreparedReport = {
  id: string;
  createdAt: string;
  date: string;
  title: string;
  detail: string;
  presentedTo: string;
  cashAccount: string;
  signature: string;
  income: ReportLine[];
  expense: ReportLine[];
};
type TypographyKey = "pageTitle" | "sectionTitle" | "cardTitle" | "body" | "tableHeader" | "formText";
type TypographyRule = { size: number; font: string; color: string };
type TypographySettings = Record<TypographyKey, TypographyRule>;

const kbGroupLogo = "/kb-logo.png";

const defaultTypography: TypographySettings = {
  pageTitle: { size: 22, font: "Arial", color: "#20313b" },
  sectionTitle: { size: 17, font: "Arial", color: "#20313b" },
  cardTitle: { size: 12, font: "Arial", color: "#20313b" },
  body: { size: 11, font: "Arial", color: "#53676f" },
  tableHeader: { size: 9, font: "Arial", color: "#60736b" },
  formText: { size: 10, font: "Arial", color: "#586b72" },
};

const monthNames = ["ocak", "şubat", "mart", "nisan", "mayıs", "haziran", "temmuz", "ağustos", "eylül", "ekim", "kasım", "aralık"];

const seed: RecordItem[] = [];

const nav: { id: Page; label: Record<Language, string>; icon: string }[] = [
  {
    id: "dashboard",
    label: { tr: "Ana Sayfa", en: "Home", ku: "Rûpela Sereke" },
    icon: "⌂",
  },
  {
    id: "cash",
    label: { tr: "Kasalar", en: "Cash Accounts", ku: "Qasayên Pere" },
    icon: "▣",
  },
  {
    id: "income",
    label: { tr: "Gelir", en: "Income", ku: "Dahat" },
    icon: "↗",
  },
  {
    id: "expense",
    label: { tr: "Gider", en: "Expenses", ku: "Mesref" },
    icon: "↘",
  },
  {
    id: "reportBuilder",
    label: {
      tr: "Rapor Hazırla",
      en: "Prepare Report",
      ku: "Raporê Amade Bike",
    },
    icon: "▥",
  },
  {
    id: "notes",
    label: {
      tr: "Mali Özel Notları",
      en: "Private Finance Notes",
      ku: "Nîşeyên Darayî",
    },
    icon: "✎",
  },
  {
    id: "archive",
    label: { tr: "Arşiv", en: "Archive", ku: "Arşîv" },
    icon: "◴",
  },
  {
    id: "users",
    label: { tr: "Kullanıcılar", en: "Users", ku: "Bikarhêner" },
    icon: "♙",
  },
  {
    id: "settings",
    label: { tr: "Ayarlar", en: "Settings", ku: "Mîheng" },
    icon: "⚙",
  },
];

export default function Home() {
  const [signedIn, setSignedIn] = useState(false);
  const [page, setPage] = useState<Page>("dashboard");
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [archive, setArchive] = useState<ArchiveItem[]>([]);
  const [notes, setNotes] = useState<FinanceNote[]>([]);
  const [logo, setLogo] = useState("");
  const [company, setCompany] = useState("Maliye-Finans");
  const [modal, setModal] = useState<{ kind: Kind; item?: RecordItem } | null>(
    null,
  );
  const [language, setLanguage] = useState<Language>("tr");
  const [profile, setProfile] = useState<Profile>({
    name: "Admin",
    username: "admin",
    role: "Yönetici",
    avatar: "",
    isAdmin: true,
    permissions: [],
  });
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileModal, setProfileModal] = useState(false);
  const [preparedReports, setPreparedReports] = useState<PreparedReport[]>([]);
  const [typography, setTypography] = useState<TypographySettings>(defaultTypography);
  const [uiZoom, setUiZoom] = useState(100);
  const [sidebarCompact, setSidebarCompact] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/auth/session");
        if (cancelled) return;
        if (response.ok) {
          const data = await response.json();
          setProfile((current) => ({ ...current, ...data.profile }));
          setSignedIn(true);
        } else {
          setSignedIn(false);
        }
      } catch {
        if (!cancelled) setSignedIn(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/bootstrap");
        if (cancelled || !response.ok) return;
        const data = await response.json();
        setRecords((data.records ?? []).map(normalizeRecord));
        setArchive(
          (data.archive ?? []).map((x: ArchiveItem) => ({
            ...x,
            old: normalizeRecord(x.old),
          })),
        );
        setNotes((data.notes ?? []).map((note: FinanceNote | string, index: number) =>
          typeof note === "string"
            ? { id: Date.now() + index, title: "Mali Not", content: note, status: "important" as NoteStatus, relation: "none" as NoteRelation, relationDetail: "", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
            : { ...note, relation: note.relation ?? "none", relationDetail: note.relationDetail ?? "" },
        ));
        if (Array.isArray(data.preparedReports)) setPreparedReports(data.preparedReports);
        if (Array.isArray(data.users)) setUsers(data.users);
        if (data.settings) {
          setCompany(data.settings.company ?? "Maliye-Finans");
          setLogo(data.settings.logo ?? "");
          setLanguage(data.settings.language ?? "tr");
          setTypography({ ...defaultTypography, ...(data.settings.typography ?? {}) });
        }
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  useEffect(() => {
    const savedZoom = Number(localStorage.getItem("mf-ui-zoom") || "100");
    if ([80, 90, 100, 110, 125].includes(savedZoom)) setUiZoom(savedZoom);
  }, []);

  useEffect(() => {
    const syncCompact = () => setSidebarCompact(window.innerWidth <= 1050);
    syncCompact();
    window.addEventListener("resize", syncCompact);
    return () => window.removeEventListener("resize", syncCompact);
  }, []);

  useEffect(() => {
    localStorage.setItem("mf-ui-zoom", String(uiZoom));
    if (uiZoom === 100) {
      document.documentElement.style.removeProperty("zoom");
    } else {
      document.documentElement.style.setProperty("zoom", String(uiZoom / 100));
    }
    return () => document.documentElement.style.removeProperty("zoom");
  }, [uiZoom]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey) return;
      const levels = [80, 90, 100, 110, 125];
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        setUiZoom((current) => levels.find((level) => level > current) ?? 125);
      } else if (event.key === "-") {
        event.preventDefault();
        setUiZoom((current) => [...levels].reverse().find((level) => level < current) ?? 80);
      } else if (event.key === "0") {
        event.preventDefault();
        setUiZoom(100);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function canAccess(pageId: Page) {
    if (profile.isAdmin) return true;
    if (pageId === "dashboard") return true;
    if (adminOnlyPages.includes(pageId)) return false;
    return profile.permissions.includes(pageId);
  }

  useEffect(() => {
    if (signedIn && !canAccess(page)) setPage("dashboard");
  }, [signedIn, page, profile]);

  async function saveRecord(next: Omit<RecordItem, "id">, id?: number) {
    try {
      const response = await fetch(id ? `/api/records/${id}` : "/api/records", {
        method: id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!response.ok) {
        alert(tx(language, "Kayıt kaydedilemedi. Lütfen tekrar deneyin.", "The record could not be saved. Please try again.", "Qeyd nehat tomarkirin. Ji kerema xwe dîsa biceribîne."));
        return;
      }
      const data = await response.json();
      setRecords((r) => {
        const next = id ? r.map((x) => (x.id === id ? data.record : x)) : [data.record, ...r];
        return data.ensuredCash ? [data.ensuredCash, ...next] : next;
      });
      if (data.archiveEntry) setArchive((a) => [data.archiveEntry, ...a]);
      setModal(null);
    } catch {
      alert(tx(language, "Kayıt kaydedilemedi. Lütfen tekrar deneyin.", "The record could not be saved. Please try again.", "Qeyd nehat tomarkirin. Ji kerema xwe dîsa biceribîne."));
    }
  }
  async function checkPassword(password: string) {
    try {
      const response = await fetch("/api/auth/verify-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!response.ok) return false;
      const data = await response.json();
      return Boolean(data.valid);
    } catch {
      return false;
    }
  }
  async function removeRecord(item: RecordItem) {
    try {
      const response = await fetch(`/api/records/${item.id}`, { method: "DELETE" });
      if (!response.ok) {
        alert(tx(language, "Kayıt silinemedi. Lütfen tekrar deneyin.", "The record could not be deleted. Please try again.", "Qeyd nehat jêbirin. Ji kerema xwe dîsa biceribîne."));
        return;
      }
      const data = await response.json();
      if (data.archiveEntry) setArchive((a) => [data.archiveEntry, ...a]);
      setRecords((r) => r.filter((x) => x.id !== item.id));
    } catch {
      alert(tx(language, "Kayıt silinemedi. Lütfen tekrar deneyin.", "The record could not be deleted. Please try again.", "Qeyd nehat jêbirin. Ji kerema xwe dîsa biceribîne."));
    }
  }
  async function importRecords(items: Omit<RecordItem, "id">[]) {
    try {
      const response = await fetch("/api/records/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      if (!response.ok) {
        alert(tx(language, "Kayıtlar içe aktarılamadı. Lütfen tekrar deneyin.", "The records could not be imported. Please try again.", "Qeyd nehatin têxistin. Ji kerema xwe dîsa biceribîne."));
        return;
      }
      const data = await response.json();
      setRecords((r) => [...(data.records ?? []), ...r]);
    } catch {
      alert(tx(language, "Kayıtlar içe aktarılamadı. Lütfen tekrar deneyin.", "The records could not be imported. Please try again.", "Qeyd nehatin têxistin. Ji kerema xwe dîsa biceribîne."));
    }
  }
  function uploadLogo(file?: File) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setLogo(String(reader.result));
    reader.readAsDataURL(file);
  }

  const noteSaveError = tx(language, "Not kaydedilemedi.", "The note could not be saved.", "Nîşe nehat tomarkirin.");
  async function createNote(input: Omit<FinanceNote, "id" | "createdAt" | "updatedAt">) {
    try {
      const response = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!response.ok) return alert(noteSaveError);
      const data = await response.json();
      setNotes((n) => [data.note, ...n]);
    } catch {
      alert(noteSaveError);
    }
  }
  async function updateNote(note: FinanceNote) {
    try {
      const response = await fetch(`/api/notes/${note.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(note),
      });
      if (!response.ok) return alert(noteSaveError);
      const data = await response.json();
      setNotes((n) => n.map((x) => (x.id === note.id ? data.note : x)));
    } catch {
      alert(noteSaveError);
    }
  }
  async function deleteNote(id: number) {
    try {
      const response = await fetch(`/api/notes/${id}`, { method: "DELETE" });
      if (!response.ok) return alert(noteSaveError);
      setNotes((n) => n.filter((x) => x.id !== id));
    } catch {
      alert(noteSaveError);
    }
  }

  const reportSaveError = tx(language, "Rapor kaydedilemedi.", "The report could not be saved.", "Rapor nehat tomarkirin.");
  async function createPreparedReport(report: PreparedReport) {
    try {
      const response = await fetch("/api/prepared-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(report),
      });
      if (!response.ok) return alert(reportSaveError);
      const data = await response.json();
      setPreparedReports((current) => [data.preparedReport, ...current]);
    } catch {
      alert(reportSaveError);
    }
  }
  async function updatePreparedReport(report: PreparedReport) {
    try {
      const response = await fetch(`/api/prepared-reports/${report.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(report),
      });
      if (!response.ok) return alert(reportSaveError);
      const data = await response.json();
      setPreparedReports((current) => current.map((x) => (x.id === report.id ? data.preparedReport : x)));
    } catch {
      alert(reportSaveError);
    }
  }
  async function deletePreparedReport(id: string) {
    try {
      const response = await fetch(`/api/prepared-reports/${id}`, { method: "DELETE" });
      if (!response.ok) return alert(reportSaveError);
      setPreparedReports((current) => current.filter((x) => x.id !== id));
    } catch {
      alert(reportSaveError);
    }
  }

  async function signIn(username: string, password: string): Promise<string | null> {
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        return data.error || tx(language, "Kullanıcı adı veya şifre hatalı.", "Incorrect username or password.", "Navê bikarhêner an şîfre şaş e.");
      }
      setProfile((current) => ({ ...current, ...data.profile }));
      setSignedIn(true);
      return null;
    } catch {
      return tx(language, "Bağlantı hatası. Lütfen tekrar deneyin.", "Connection error. Please try again.", "Xeletiya girêdanê. Ji kerema xwe dîsa biceribîne.");
    }
  }
  async function signOut() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {}
    setProfileOpen(false);
    setSignedIn(false);
  }

  if (!signedIn)
    return (
      <Login language={language} setLanguage={setLanguage} onSignIn={signIn} />
    );

  return (
    <div className={`appShell ${sidebarCompact ? "sidebarCompact" : ""}`} style={typographyVariables(typography)}>
      <aside className="sidebar">
        <button
          type="button"
          className="sidebarToggle"
          onClick={() => setSidebarCompact((current) => !current)}
          title={tx(language, "Menüyü daralt / genişlet", "Collapse / expand menu", "Menûyê teng / fireh bike")}
          aria-label={tx(language, "Menüyü daralt / genişlet", "Collapse / expand menu", "Menûyê teng / fireh bike")}
        >
          {sidebarCompact ? "»" : "«"}
        </button>
        <div className="brand">
          {logo ? (
            <img src={logo} alt={tx(language, "Logo", "Logo", "Logo")} />
          ) : (
            <img src={kbGroupLogo} alt={tx(language, "KB Group logosu", "KB Group logo", "Logoya KB Group")} />
          )}
          <div>
            <strong>{company}</strong>
            <small>
              {tx(
                language,
                "Finans Yönetimi",
                "Finance Management",
                "Rêveberiya Darayî",
              )}
            </small>
          </div>
        </div>
        <nav>
          {nav.filter((n) => canAccess(n.id)).map((n) => (
            <div key={n.id}>
              <button
                className={page === n.id ? "active" : ""}
                onClick={() => setPage(n.id)}
              >
                <i>{n.icon}</i>
                <span>{n.label[language]}</span>
              </button>
            </div>
          ))}
        </nav>
        <div className="developerCredit">
          <img src={kbGroupLogo} alt={tx(language, "KB Group logosu", "KB Group logo", "Logoya KB Group")} />
          <small>
            {tx(
              language,
              "KB Group Tarafından Geliştirilmiştir.",
              "Developed by KB Group.",
              "Ji hêla KB Group ve hatiye pêşxistin.",
            )}
          </small>
        </div>
      </aside>
      <main>
        <header>
          <h1>
            {nav.find((n) => n.id === page)?.label[language]}
          </h1>
          <div className="headerActions">
            <div className="zoomControl" title={tx(language, "Ekran ölçeği (Ctrl + / Ctrl -)", "Interface zoom (Ctrl + / Ctrl -)", "Mezinahiya dîmenderê (Ctrl + / Ctrl -)")}>
              <button type="button" onClick={() => setUiZoom((current) => [125, 110, 100, 90, 80].find((level) => level < current) ?? 80)} aria-label={tx(language, "Küçült", "Zoom out", "Biçûk bike")}>−</button>
              <select value={uiZoom} onChange={(e) => setUiZoom(Number(e.target.value))} aria-label={tx(language, "Ekran ölçeği", "Interface zoom", "Mezinahiya dîmenderê")}>
                {[80, 90, 100, 110, 125].map((level) => <option key={level} value={level}>%{level}</option>)}
              </select>
              <button type="button" onClick={() => setUiZoom((current) => [80, 90, 100, 110, 125].find((level) => level > current) ?? 125)} aria-label={tx(language, "Büyüt", "Zoom in", "Mezin bike")}>+</button>
            </div>
            <label className="language">
              <span>◎</span>
              <select
                aria-label="Dil seçimi"
                value={language}
                onChange={(e) => setLanguage(e.target.value as Language)}
              >
                <option value="tr">Türkçe</option>
                <option value="en">English</option>
                <option value="ku">Kurdî</option>
              </select>
            </label>
            <div className="profileWrap">
              <button
                className="profile"
                onClick={() => setProfileOpen((x) => !x)}
                aria-expanded={profileOpen}
              >
                {profile.avatar ? (
                  <img
                    className="profilePhoto"
                    src={profile.avatar}
                    alt="Kullanıcı avatarı"
                  />
                ) : (
                  <b>
                    {localizedProfileName(profile.name, language)
                      .slice(0, 1)
                      .toUpperCase()}
                  </b>
                )}
                <div>
                  <strong>
                    {localizedProfileName(profile.name, language)}
                  </strong>
                  <small>{localizedRole(profile.role, language)}</small>
                </div>
                <i>⌄</i>
              </button>
              {profileOpen && (
                <div className="profileMenu">
                  <div>
                    <b>@{profile.username}</b>
                    <small>
                      {language === "tr"
                        ? "Oturum açan kullanıcı"
                        : language === "en"
                          ? "Signed-in user"
                          : "Bikarhênerê têketî"}
                    </small>
                  </div>
                  <button
                    onClick={() => {
                      setProfileModal(true);
                      setProfileOpen(false);
                    }}
                  >
                    ✎{" "}
                    {language === "tr"
                      ? "Bilgilerimi Düzenle"
                      : language === "en"
                        ? "Edit My Profile"
                        : "Profîla Min Biguherîne"}
                  </button>
                  <button className="signOut" onClick={signOut}>
                    ↪{" "}
                    {language === "tr"
                      ? "Oturumu Kapat"
                      : language === "en"
                        ? "Sign Out"
                        : "Derkeve"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        <section className="content">
          {page === "dashboard" && (
            <Dashboard records={records} language={language} goTo={setPage} />
          )}
          {(["cash", "income", "expense"] as Page[]).includes(page) && (
            <Records
              language={language}
              kind={page as Kind}
              records={records.filter(
                (x) =>
                  x.kind === page ||
                  (page === "income" && x.kind === "cash"),
              )}
              allRecords={records}
              onAdd={() => setModal({ kind: page as Kind })}
              onEdit={(item) => setModal({ kind: item.kind, item })}
              onDelete={removeRecord}
              onImport={importRecords}
              checkPassword={checkPassword}
            />
          )}
          {page === "reportBuilder" && (
            <ReportBuilder
              language={language}
              records={records}
              preparedReports={preparedReports}
              onCreateReport={createPreparedReport}
              onUpdateReport={updatePreparedReport}
              onDeleteReport={deletePreparedReport}
              profile={profile}
              checkPassword={checkPassword}
            />
          )}
          {page === "notes" && (
            <Notes language={language} notes={notes} onCreateNote={createNote} onUpdateNote={updateNote} onDeleteNote={deleteNote} />
          )}
          {page === "archive" && <Archive language={language} rows={archive} notes={notes} preparedReports={preparedReports} />}
          {page === "users" && (
            <Users
              language={language}
              users={users}
              setUsers={setUsers}
              currentUsername={profile.username}
              checkPassword={checkPassword}
            />
          )}
          {page === "settings" && (
            <Settings
              language={language}
              company={company}
              setCompany={setCompany}
              logo={logo}
              setLogo={setLogo}
              uploadLogo={uploadLogo}
              typography={typography}
              setTypography={setTypography}
            />
          )}
        </section>
      </main>
      {modal && (
        <RecordModal
          language={language}
          kind={modal.kind}
          initial={modal.item}
          records={records}
          onCreateNote={createNote}
          onClose={() => setModal(null)}
          onSave={saveRecord}
        />
      )}
      {profileModal && (
        <ProfileModal
          profile={profile}
          language={language}
          onClose={() => setProfileModal(false)}
          onSave={async (next) => {
            try {
              const response = await fetch("/api/profile", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: next.name, avatar: next.avatar }),
              });
              if (response.ok) {
                const data = await response.json();
                setProfile((current) => ({ ...current, ...data.profile }));
              }
            } catch {}
            setProfileModal(false);
          }}
        />
      )}
    </div>
  );
}

function LanguageSetup({ onChoose }: { onChoose: (language: Language) => void }) {
  return (
    <main className="languageSetupPage">
      <section className="languageSetupCard" aria-labelledby="language-setup-title">
        <img src={kbGroupLogo} alt="KB Group" />
        <div>
          <h1 id="language-setup-title">Choose your language · Dilinizi seçin · Zimanê xwe hilbijêrin</h1>
          <p>The selected language will be used throughout MF-V-01.</p>
          <p>Seçtiğiniz dil MF-V-01’in tamamında kullanılacaktır.</p>
          <p>Zimanê ku hûn hilbijêrin dê li seranserê MF-V-01 were bikaranîn.</p>
        </div>
        <div className="languageChoiceGrid">
          <button onClick={() => onChoose("en")}><b>English</b><small>Continue in English</small></button>
          <button onClick={() => onChoose("ku")}><b>Kurdî</b><small>Bi Kurdî bidomîne</small></button>
          <button onClick={() => onChoose("tr")}><b>Türkçe</b><small>Türkçe devam et</small></button>
        </div>
      </section>
    </main>
  );
}

function Login({
  language,
  setLanguage,
  onSignIn,
}: {
  language: Language;
  setLanguage: (x: Language) => void;
  onSignIn: (username: string, password: string) => Promise<string | null>;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const text =
    language === "tr"
      ? {
          title: "Maliye-Finans",
          sub: "Hesabınızla oturum açın",
          user: "Kullanıcı adı",
          pass: "Şifre",
          button: "Oturum Aç",
          error: "Kullanıcı adı veya şifre hatalı.",
        }
      : language === "en"
        ? {
            title: "Maliye-Finans",
            sub: "Sign in with your account",
            user: "Username",
            pass: "Password",
            button: "Sign In",
            error: "Incorrect username or password.",
          }
        : {
            title: "Maliye-Finans",
            sub: "Bi hesabê xwe têkevin",
            user: "Navê bikarhêner",
            pass: "Şîfre",
            button: "Têkeve",
            error: "Navê bikarhêner an şîfre şaş e.",
          };
  return (
    <main className="loginPage">
      <div className="loginCard">
        <div className="loginBrand">
          <img src={kbGroupLogo} alt="KB Group" />
          <div>
            <h1>{text.title}</h1>
            <p>{text.sub}</p>
          </div>
        </div>
        <label className="loginLanguage">
          ◎{" "}
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value as Language)}
          >
            <option value="tr">Türkçe</option>
            <option value="en">English</option>
            <option value="ku">Kurdî</option>
          </select>
        </label>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (submitting) return;
            setSubmitting(true);
            const errorMessage = await onSignIn(username, password);
            setSubmitting(false);
            setError(errorMessage);
          }}
        >
          <label>
            {text.user}
            <input
              autoFocus
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </label>
          <label>
            {text.pass}
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && <p className="loginError">{error}</p>}
          <button className="primary" disabled={submitting}>{text.button}</button>
        </form>
      </div>
    </main>
  );
}

function PasswordField({
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

function ProfileModal({
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

function Dashboard({
  records,
  language,
  goTo,
}: {
  records: RecordItem[];
  language: Language;
  goTo: (page: Page) => void;
}) {
  const cashIn = total(records.filter((x) => x.kind === "cash"));
  const income = total(records.filter((x) => x.kind === "income")) + cashIn,
    expense = total(records.filter((x) => x.kind === "expense"));
  const cashBalance = cashIn + total(records.filter((x) => x.kind === "income" && x.cashAccount)) - total(records.filter((x) => x.kind === "expense" && x.cashAccount));
  const recent = [...records]
    .filter((x) => x.kind !== "cash")
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);
  const labels =
    language === "tr"
      ? {
          income: "Toplam Gelir",
          expense: "Toplam Gider",
          net: "Net Sonuç",
          cash: "Mevcut Kasa Bakiyesi",
          all: "Tüm kayıtları gör",
          analysis: "Gelir – Gider Analizi",
          analysisSub: "Ana başlıklara göre karşılaştırma",
          barIncome: "Gelir",
          barExpense: "Gider",
          barNet: "Net",
          recent: "Son Hareketler",
          recentSub: "En güncel gelir ve gider kayıtları",
        }
      : language === "en"
        ? {
            income: "Total Income",
            expense: "Total Expenses",
            net: "Net Result",
            cash: "Current Cash Balance",
            all: "View all records",
            analysis: "Income – Expense Analysis",
            analysisSub: "Comparison by main categories",
            barIncome: "Income",
            barExpense: "Expenses",
            barNet: "Net",
            recent: "Recent Transactions",
            recentSub: "Latest income and expense records",
          }
        : {
            income: "Dahata Giştî",
            expense: "Mesrefa Giştî",
            net: "Encama Paqij",
            cash: "Balansa Qaseyê",
            all: "Hemû qeydan bibîne",
            analysis: "Analîza Dahat û Mesrefan",
            analysisSub: "Li gorî sernavên sereke berawird bike",
            barIncome: "Dahat",
            barExpense: "Mesref",
            barNet: "Paqij",
            recent: "Tevgerên Dawî",
            recentSub: "Qeydên herî dawî yên dahat û mesrefan",
          };
  return (
    <>
      <div className="stats">
        <Stat
          label={labels.income}
          linkLabel={labels.all}
          value={income}
          tone="green"
          icon="↗"
          onClick={() => goTo("income")}
        />
        <Stat
          label={labels.expense}
          linkLabel={labels.all}
          value={expense}
          tone="orange"
          icon="↘"
          onClick={() => goTo("expense")}
        />
        <Stat
          label={labels.net}
          linkLabel={labels.all}
          value={income - expense}
          tone="blue"
          icon="="
          onClick={() => goTo("reportBuilder")}
        />
        <Stat
          label={labels.cash}
          linkLabel={labels.all}
          value={cashBalance}
          tone="purple"
          icon="▣"
          onClick={() => goTo("cash")}
        />
      </div>
      <div className="twoCols">
        <div className="panel">
          <Title title={labels.analysis} sub={labels.analysisSub} />
          <div className="bars">
            <Bar
              label={labels.barIncome}
              value={income}
              max={Math.max(income, expense)}
            />
            <Bar
              label={labels.barExpense}
              value={expense}
              max={Math.max(income, expense)}
              expense
            />
            <Bar
              label={labels.barNet}
              value={income - expense}
              max={Math.max(income, expense)}
            />
          </div>
        </div>
        <div className="panel">
          <Title title={labels.recent} sub={labels.recentSub} />
          <div className="recent">
            {recent.map((x) => (
              <div key={x.id}>
                <i className={x.kind}></i>
                <span>
                  <b>{localizeData(x.source, language)}</b>
                  <small>
                    {date(x.date, language)} ·{" "}
                    {localizeData(x.person, language)}
                  </small>
                </span>
                <strong>
                  {x.kind === "income" ? "+" : "-"}
                  {money(x.amount)}
                </strong>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function Records({
  language,
  kind,
  records,
  allRecords,
  onAdd,
  onEdit,
  onDelete,
  onImport,
  checkPassword,
}: {
  language: Language;
  kind: Kind;
  records: RecordItem[];
  allRecords: RecordItem[];
  onAdd: () => void;
  onEdit: (x: RecordItem) => void;
  onDelete: (x: RecordItem) => void;
  onImport: (rows: Omit<RecordItem, "id">[]) => void;
  checkPassword: (password: string) => Promise<boolean>;
}) {
  const [deleteTarget, setDeleteTarget] = useState<RecordItem | null>(null);
  const [source, setSource] = useState("Tümü"),
    [search, setSearch] = useState("");
  const [showListColumn, setShowListColumn] = useState(false);
  const [activeList, setActiveList] = useState("");
  const [showAllLists, setShowAllLists] = useState(false);
  const openList = (name: string) => {
    setSource("Tümü");
    setSearch(name);
    setActiveList(name);
    setShowAllLists(false);
  };
  const openCardRecord = (
    field: "source" | "listName",
    value: string,
    matchKind?: Kind,
  ) => {
    const candidates = records.filter((x) =>
      field === "source"
        ? x.source === value && (!matchKind || x.kind === matchKind)
        : x.listName === value,
    );
    const rec = [...candidates].sort((a, b) => b.date.localeCompare(a.date))[0];
    if (rec) onEdit(rec);
  };
  const groups = useMemo(
    () =>
      [...new Set(records.map((x) => x.source))].map((name) => {
        const directAmount = total(records.filter((x) => x.source === name));
        const linkedIncome =
          kind === "cash"
            ? total(
                allRecords.filter(
                  (x) => x.kind === "income" && x.cashAccount === name,
                ),
              )
            : 0;
        const linkedExpense =
          kind === "cash"
            ? total(
                allRecords.filter(
                  (x) => x.kind === "expense" && x.cashAccount === name,
                ),
              )
            : 0;
        return {
          name,
          kind: records.find((x) => x.source === name)?.kind ?? kind,
          count: records.filter((x) => x.source === name).length,
          totalIn: directAmount + linkedIncome,
          totalOut: linkedExpense,
          total: directAmount + linkedIncome - linkedExpense,
        };
      }),
    [records, allRecords, kind],
  );
  const visibleGroups = groups.slice(0, 4);
  const overflowGroups = groups.slice(4);
  const listedRecords = records.filter((x) => x.listName);
  const listGroups = useMemo(
    () =>
      [...new Set(records.map((x) => x.listName).filter(Boolean))].map(
        (name) => {
          const directAmount = total(
            records.filter((x) => x.listName === name),
          );
          const linkedIncome =
            kind === "cash"
              ? total(
                  allRecords.filter(
                    (x) => x.kind === "income" && x.listName === name,
                  ),
                )
              : 0;
          const linkedExpense =
            kind === "cash"
              ? total(
                  allRecords.filter(
                    (x) => x.kind === "expense" && x.listName === name,
                  ),
                )
              : 0;
          return {
            name,
            count: records.filter((x) => x.listName === name).length,
            totalIn: directAmount + linkedIncome,
            totalOut: linkedExpense,
            total: directAmount + linkedIncome - linkedExpense,
          };
        },
      ),
    [records, allRecords, kind],
  );
  const visibleListGroups = listGroups.slice(0, 4);
  const overflowListGroups = listGroups.slice(4);
  const rows = records.filter(
    (x) =>
      (source === "Tümü" || x.source === source) &&
      (!showAllLists || x.listName) &&
      JSON.stringify(x).toLowerCase().includes(search.toLowerCase()),
  );
  const latestRows = [...records]
    .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)
    .slice(0, 5);
  const title =
    kind === "cash"
      ? tx(language, "Kasalar", "Cash Accounts", "Qasayên Pere")
      : kind === "income"
        ? tx(language, "Gelirler", "Income", "Dahat")
        : tx(language, "Giderler", "Expenses", "Mesref");
  const recordWord = tx(language, "kayıt", "records", "qeyd");
  async function exportExcel() {
    const columns = [
      tx(language, "Tarih", "Date", "Tarîx"),
      kind === "cash"
        ? tx(language, "Kasa Adı", "Cash Account", "Navê Qaseyê")
        : tx(language, "Ana Başlık", "Category", "Sernav"),
      tx(language, "Detay", "Detail", "Hûragahî"),
      tx(language, "Not", "Note", "Nîşe"),
      tx(language, "Kişi", "Person", "Kes"),
      tx(language, "Miktar", "Amount", "Meblağ"),
      tx(language, "Para Birimi", "Currency", "Yekeya Pere"),
      tx(language, "Proje / Birim", "Project / Unit", "Proje / Yekîne"),
      tx(language, "Etiketler", "Tags", "Etîket"),
    ];
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Kayitlar");
    sheet.addRow(columns);
    for (const x of rows) {
      sheet.addRow([
        date(x.date),
        x.source,
        x.detail,
        x.note,
        x.person,
        x.amount,
        x.currency,
        x.project,
        x.tags.join(", "),
      ]);
    }
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const safeName = (source === "Tümü" ? title : source).replace(/[\\/:*?"<>|]/g, "-");
    link.href = url;
    link.download = `${safeName}-${new Date().toISOString().slice(0, 10)}.xlsx`;
    link.click();
    URL.revokeObjectURL(url);
  }
  async function importExcel(file?: File) {
    if (!file) return;
    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(await file.arrayBuffer());
      const sheet = workbook.worksheets[0];
      if (!sheet) throw new Error();
      const headerRow = sheet.getRow(1);
      const headers: string[] = [];
      headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        headers[colNumber] = String(cell.value ?? "").trim();
      });
      const raw: Record<string, unknown>[] = [];
      sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const record: Record<string, unknown> = {};
        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          const header = headers[colNumber];
          if (!header) return;
          const value = cell.value;
          record[header] = value && typeof value === "object" && "text" in (value as object)
            ? (value as { text: string }).text
            : value ?? "";
        });
        raw.push(record);
      });
      const imported = raw
        .map((row): Omit<RecordItem, "id"> => {
          const values = Object.values(row);
          const get = (...names: string[]) => {
            for (const name of names)
              if (row[name] !== undefined && row[name] !== "") return row[name];
            return "";
          };
          const excelDate = get("Tarih", "Date", "Tarîx");
          const parsedDate = parseStoredDate(
            String(excelDate || values[0] || new Date().toISOString().slice(0, 10)),
          );
          const resolvedSource =
            source !== "Tümü"
              ? source
              : String(
                  get(
                    "Kasa Adı",
                    "Cash Account",
                    "Navê Qaseyê",
                    "Ana Başlık",
                    "Category",
                    "Sernav",
                  ) ||
                    values[1] ||
                    "Excel Aktarımı",
                );
          return {
            kind,
            date: parsedDate,
            source: resolvedSource,
            detail: String(
              get("Detay", "Detail", "Hûragahî") || values[2] || "",
            ),
            note: String(get("Not", "Note", "Nîşe") || ""),
            person: String(get("Kişi", "Person", "Kes") || ""),
            amount: Number(get("Miktar", "Amount", "Meblağ") || 0),
            currency: String(
              get("Para Birimi", "Currency", "Yekeya Pere") || "USD",
            ),
            project: String(
              get("Proje / Birim", "Project / Unit", "Proje / Yekîne") || "",
            ),
            tags: String(get("Etiketler", "Tags", "Etîket") || "")
              .split(",")
              .map((x) => x.trim())
              .filter(Boolean),
            monthlyExpense: false,
            cashAccount: kind === "cash" ? "" : resolvedSource,
            listName: "",
          };
        })
        .filter((x) => x.source && Number.isFinite(x.amount));
      if (!imported.length) throw new Error();
      onImport(imported);
      alert(
        tx(
          language,
          `${imported.length} kayıt Excel'den eklendi.`,
          `${imported.length} records imported from Excel.`,
          `${imported.length} qeyd ji Excelê hatin têxistin.`,
        ),
      );
    } catch {
      alert(
        tx(
          language,
          "Excel dosyası okunamadı. Lütfen ilk satırda sütun başlıkları bulunan .xlsx dosyası seçin.",
          "The Excel file could not be read. Choose an .xlsx file with column headers in the first row.",
          "Pelê Excelê nehat xwendin. Pelek .xlsx ku di rêza yekem de sernavên stûnan heye hilbijêre.",
        ),
      );
    }
  }
  return (
    <div className="panel">
      <div className="toolbar">
        <Title
          title={title}
          inline
          sub={
            kind === "cash"
              ? tx(
                  language,
                  "Kasa kartını seçerek o kasanın hareketlerini görün",
                  "Select a cash account card to view its transactions",
                  "Kartê qaseyê hilbijêre û tevgerên wê bibîne",
                )
              : tx(
                  language,
                  "Ana başlığı seçerek farklı tarihlerdeki hareketleri görün",
                  "Select a main category to view transactions on different dates",
                  "Sernavê sereke hilbijêre û tevgerên tarîxên cuda bibîne",
                )
          }
        />
        <div>
          <label className="light fileButton">
            ⇧ {tx(language, "Excel Ekle", "Import Excel", "Excel Têxe")}
            <input
              hidden
              type="file"
              accept=".xlsx"
              onChange={(e) => {
                importExcel(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
          <button className="light" onClick={exportExcel}>
            ⇩ {tx(language, "Excel'e Çıkar", "Export to Excel", "Derxe Excelê")}
          </button>
          <button className="primary" onClick={onAdd}>
            ＋ {tx(language, "Yeni Kayıt", "New Record", "Qeyda Nû")}
          </button>
        </div>
      </div>
      <div className="groups">
        <button
          className={source === "Tümü" && !showAllLists ? "selected" : ""}
          onClick={() => {
            setSource("Tümü");
            setShowAllLists(false);
          }}
        >
          <b>
            {kind === "cash"
              ? tx(language, "Tüm Kasalar", "All Cash Accounts", "Hemû Qase")
              : kind === "income"
                ? tx(language, "Tüm Gelirler", "All Income", "Hemû Dahat")
                : tx(language, "Tüm Giderler", "All Expenses", "Hemû Mesref")}
          </b>
          <small>
            {records.length} {recordWord}
          </small>
          <strong>
            {money(groups.reduce((sum, g) => sum + g.total, 0))}
          </strong>
        </button>
        {visibleGroups.map((g) => (
          <div className="groupCard" key={g.name}>
            <button
              className={source === g.name && !showAllLists ? "selected" : ""}
              onClick={() => {
                setSource(g.name);
                setShowAllLists(false);
              }}
            >
              <b>{localizeData(g.name, language)}</b>
              <small>
                {g.count}{" "}
                {tx(
                  language,
                  "tarihli kayıt",
                  "dated records",
                  "qeydên bi tarîx",
                )}
              </small>
              <strong>{money(g.total)}</strong>
            </button>
            {source === g.name && (
              <button
                className="cashEditIcon"
                title={tx(language, "Kaydı Düzenle", "Edit Record", "Qeydê Biguherîne")}
                aria-label={tx(language, "Kaydı Düzenle", "Edit Record", "Qeydê Biguherîne")}
                onClick={() => openCardRecord("source", g.name, g.kind)}
              >
                🗂
              </button>
            )}
            <div className="groupCardTooltip">
              {g.kind === "cash" ? (
                <>
                  <div>
                    <small>{tx(language, "Toplam Kasa", "Total In", "Giştî")}</small>
                    <strong>{money(g.totalIn)}</strong>
                  </div>
                  <div>
                    <small>{tx(language, "Gider", "Expense", "Mesref")}</small>
                    <strong className="negative">{money(g.totalOut)}</strong>
                  </div>
                  <div>
                    <small>{tx(language, "Sonuç", "Result", "Encam")}</small>
                    <strong>{money(g.total)}</strong>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <small>
                      {g.kind === "income"
                        ? tx(language, "Toplam Gelir", "Total Income", "Dahata Giştî")
                        : tx(language, "Toplam Gider", "Total Expense", "Mesrefa Giştî")}
                    </small>
                    <strong className={g.kind === "expense" ? "negative" : ""}>
                      {money(g.total)}
                    </strong>
                  </div>
                  <div>
                    <small>{tx(language, "Kayıt Sayısı", "Record Count", "Hejmara Qeydan")}</small>
                    <strong>{g.count}</strong>
                  </div>
                </>
              )}
            </div>
          </div>
        ))}
        {overflowGroups.length > 0 && (
          <div className="groupCard groupCardOverflow">
            <select
              value={overflowGroups.some((g) => g.name === source) ? source : ""}
              onChange={(e) => {
                if (e.target.value) {
                  setSource(e.target.value);
                  setShowAllLists(false);
                }
              }}
            >
              <option value="">
                {kind === "cash"
                  ? tx(language, "Diğer Kasalar", "Other Cash Accounts", "Qasên Din")
                  : tx(language, "Diğer Başlıklar", "Other Categories", "Sernavên Din")}{" "}
                ({overflowGroups.length})
              </option>
              {overflowGroups.map((g) => (
                <option key={g.name} value={g.name}>
                  {localizeData(g.name, language)} · {money(g.total)}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      {listGroups.length > 0 && (
        <div className="groups listGroups">
          <button
            className={showAllLists ? "selected" : ""}
            onClick={() => {
              setSource("Tümü");
              setSearch("");
              setActiveList("");
              setShowAllLists(true);
            }}
          >
            <b>
              {kind === "cash"
                ? tx(language, "Tüm Liste Kasaları", "All List Accounts", "Hemû Qaseyên Lîsteyê")
                : kind === "income"
                  ? tx(language, "Tüm Liste Gelirleri", "All List Income", "Hemû Dahatên Lîsteyê")
                  : tx(language, "Tüm Liste Giderleri", "All List Expenses", "Hemû Mesrefên Lîsteyê")}
            </b>
            <small>
              {listedRecords.length} {recordWord}
            </small>
            <strong>
              {money(listGroups.reduce((sum, g) => sum + g.total, 0))}
            </strong>
          </button>
          {visibleListGroups.map((g) => (
            <div className="groupCard" key={g.name}>
              <button
                className={activeList === g.name ? "selected" : ""}
                onClick={() => openList(g.name)}
              >
                <b>{localizeData(g.name, language)}</b>
                <small>
                  {g.count} {tx(language, "kayıt", "records", "qeyd")}
                </small>
                <strong>{money(g.total)}</strong>
              </button>
              {activeList === g.name && (
                <button
                  className="cashEditIcon"
                  title={tx(language, "Kaydı Düzenle", "Edit Record", "Qeydê Biguherîne")}
                  aria-label={tx(language, "Kaydı Düzenle", "Edit Record", "Qeydê Biguherîne")}
                  onClick={() => openCardRecord("listName", g.name)}
                >
                  🗂
                </button>
              )}
              {kind === "cash" && (
                <div className="groupCardTooltip">
                  <div>
                    <small>{tx(language, "Toplam Kasa", "Total In", "Giştî")}</small>
                    <strong>{money(g.totalIn)}</strong>
                  </div>
                  <div>
                    <small>{tx(language, "Gider", "Expense", "Mesref")}</small>
                    <strong className="negative">{money(g.totalOut)}</strong>
                  </div>
                  <div>
                    <small>{tx(language, "Sonuç", "Result", "Encam")}</small>
                    <strong>{money(g.total)}</strong>
                  </div>
                </div>
              )}
            </div>
          ))}
          {overflowListGroups.length > 0 && (
            <div className="groupCard groupCardOverflow">
              <select
                value={overflowListGroups.some((g) => g.name === activeList) ? activeList : ""}
                onChange={(e) => e.target.value && openList(e.target.value)}
              >
                <option value="">
                  {tx(language, "Diğer Listeler", "Other Lists", "Lîsteyên Din")}{" "}
                  ({overflowListGroups.length})
                </option>
                {overflowListGroups.map((g) => (
                  <option key={g.name} value={g.name}>
                    {localizeData(g.name, language)} · {money(g.total)}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}
      <div className="search">
        <span>⌕</span>
        <button
          type="button"
          className="light compact"
          onClick={() => setShowListColumn((v) => !v)}
        >
          {showListColumn
            ? tx(language, "Detay / Not Göster", "Show Detail / Note", "Hûragahî / Nîşe Nîşan Bide")
            : tx(language, "Liste Kaydı Göster", "Show List Record", "Qeyda Lîsteyê Nîşan Bide")}
        </button>
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setActiveList("");
          }}
          placeholder={tx(
            language,
            "Kayıtlarda ara…",
            "Search records…",
            "Di qeydan de bigere…",
          )}
        />
        <small>
          {rows.length} {recordWord}
        </small>
      </div>
      <div className={kind === "cash" ? "" : "recordsGrid"}>
        <div className="recordsTable">
          <table>
          <thead>
            <tr>
              <th>{tx(language, "Tarih", "Date", "Tarîx")}</th>
              <th>
                {kind === "cash"
                  ? tx(language, "Kasa Adı", "Cash Account", "Navê Qaseyê")
                  : tx(
                      language,
                      "Ana Başlık",
                      "Main Category",
                      "Sernavê Sereke",
                    )}
              </th>
              <th>
                {showListColumn
                  ? tx(language, "Liste Kaydı", "List Record", "Qeyda Lîsteyê")
                  : tx(
                      language,
                      "Detay / Not",
                      "Detail / Note",
                      "Hûragahî / Nîşe",
                    )}
              </th>
              <th>{tx(language, "Kişi", "Person", "Kes")}</th>
              <th>{tx(language, "Miktar", "Amount", "Meblağ")}</th>
              <th>
                {kind === "cash"
                  ? tx(language, "Kasa Yeri", "Cash Location", "Cihê Qaseyê")
                  : tx(
                      language,
                      "Proje / Birim",
                      "Project / Unit",
                      "Proje / Yekîne",
                    )}
              </th>
              <th>{tx(language, "Etiket", "Tag", "Etîket")}</th>
              <th>{tx(language, "İşlem", "Action", "Çalakî")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((x) => (
              <tr key={x.id}>
                <td>{date(x.date, language)}</td>
                <td>
                  <b className="cellTitle" title={localizeData(x.source, language)}>{localizeData(x.source, language)}</b>
                </td>
                <td>
                  {showListColumn ? (
                    x.listName ? (
                      <button
                        type="button"
                        className="linkButton"
                        onClick={() => openList(x.listName)}
                        title={tx(
                          language,
                          "Bu listeye ait tüm kayıtları göster",
                          "Show all records in this list",
                          "Hemû qeydên vê lîsteyê nîşan bide",
                        )}
                      >
                        {localizeData(x.listName, language)}
                      </button>
                    ) : (
                      "—"
                    )
                  ) : (
                    <>
                      {localizeData(x.detail || x.note, language)}
                      <small className="subNote">
                        {x.detail && localizeData(x.note, language)}
                      </small>
                    </>
                  )}
                </td>
                <td>{localizeData(x.person, language)}</td>
                <td className="amount">{money(x.amount)}</td>
                <td>{localizeData(x.project, language)}{x.cashAccount && <small className="subNote">▣ {localizeData(x.cashAccount, language)}</small>}</td>
                <td>
                  <div className="tagRow">
                    {(x.tags || []).map((t) => (
                      <span key={t}>{localizeData(t, language)}</span>
                    ))}
                  </div>
                </td>
                <td>
                  <button
                    className="icon edit"
                    title={tx(language, "Düzenle", "Edit", "Biguherîne")}
                    onClick={() => onEdit(x)}
                  >
                    ✎
                  </button>
                  <button
                    className="icon delete"
                    title={tx(language, "Sil", "Delete", "Jêbirin")}
                    onClick={() => setDeleteTarget(x)}
                  >
                    🗑
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          </table>
        </div>
        {kind !== "cash" && (
          <aside className={`latestRecords ${kind}`}>
            <div className="latestHead">
              <span>{kind === "income" ? "↗" : "↘"}</span>
              <div>
                <h3>
                  {kind === "income"
                    ? tx(language, "En Son Gelirler", "Latest Income", "Dahatên Dawî")
                    : tx(language, "En Son Giderler", "Latest Expenses", "Mesrefên Dawî")}
                </h3>
                <small>
                  {tx(language, "Son eklenen 5 kayıt", "5 most recent records", "5 qeydên herî dawî")}
                </small>
              </div>
            </div>
            <div className="latestList">
              {latestRows.map((x) => (
                <article key={x.id}>
                  <i />
                  <span>
                    <b>{localizeData(x.source, language)}</b>
                    <small>{date(x.date, language)} · {localizeData(x.person, language)}</small>
                  </span>
                  <strong>{kind === "income" ? "+" : "−"}{money(x.amount)}</strong>
                </article>
              ))}
            </div>
          </aside>
        )}
      </div>
      {deleteTarget && (
        <DeleteConfirmModal
          language={language}
          itemLabel={`${localizeData(deleteTarget.source, language)} · ${money(deleteTarget.amount)}`}
          checkPassword={checkPassword}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => {
            onDelete(deleteTarget);
            setDeleteTarget(null);
          }}
        />
      )}
    </div>
  );
}

function ConfirmModal({
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
function DeleteConfirmModal({
  language,
  itemLabel,
  checkPassword,
  onClose,
  onConfirm,
}: {
  language: Language;
  itemLabel: string;
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
            <h2>{tx(language, "Kaydı Sil", "Delete Record", "Qeydê Jêbibe")}</h2>
            <p>{itemLabel}</p>
          </div>
          <button type="button" onClick={onClose}>
            ×
          </button>
        </div>
        {step === 1 ? (
          <p className="deleteWarning">
            {tx(
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
              : tx(language, "Kalıcı Olarak Sil", "Delete Permanently", "Bi Domdarî Jêbibe")}
          </button>
        </div>
      </form>
    </div>
  );
}

function SuggestInput({
  value,
  onChange,
  options,
  placeholder,
  required,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const filtered = options
    .filter((o) => o.toLowerCase().includes(value.toLowerCase()))
    .slice(0, 8);
  return (
    <div className="suggestField">
      <input
        required={required}
        disabled={disabled}
        autoComplete="off"
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
      />
      {open && filtered.length > 0 && (
        <div className="suggestList">
          {filtered.map((o) => (
            <button
              type="button"
              key={o}
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(o);
                setOpen(false);
              }}
            >
              {o}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function RecordModal({
  language,
  kind,
  initial,
  records,
  onCreateNote,
  onClose,
  onSave,
}: {
  language: Language;
  kind: Kind;
  initial?: RecordItem;
  records: RecordItem[];
  onCreateNote: (input: Omit<FinanceNote, "id" | "createdAt" | "updatedAt">) => void;
  onClose: () => void;
  onSave: (x: Omit<RecordItem, "id">, id?: number) => void;
}) {
  const defaultNoteRelation: NoteRelation =
    kind === "cash" ? "cash" : kind === "income" ? "income" : "expense";
  const [financeNote, setFinanceNote] = useState("");
  const [duplicateConfirmOpen, setDuplicateConfirmOpen] = useState(false);
  const [financeNoteStatus, setFinanceNoteStatus] = useState<NoteStatus>("pending");
  const [financeNoteRelation, setFinanceNoteRelation] = useState<NoteRelation>(defaultNoteRelation);
  const [financeNoteRelationDetail, setFinanceNoteRelationDetail] = useState("");
  const financeNoteStatusOptions: { id: NoteStatus; label: string }[] = [
    { id: "important", label: tx(language, "Önemli Notlar", "Important Notes", "Nîşeyên Girîng") },
    { id: "urgent", label: tx(language, "Acil Notlar", "Urgent Notes", "Nîşeyên Acîl") },
    { id: "pending", label: tx(language, "Bekleyen Notlar", "Pending Notes", "Nîşeyên Li Bendê") },
    { id: "completed", label: tx(language, "Tamamlanmış Notlar", "Completed Notes", "Nîşeyên Qediyayî") },
  ];
  const financeNoteRelationOptions: NoteRelation[] = ["none", "cash", "income", "expense", "reports", "archive", "other"];
  const financeNoteTitleOptions = [
    ...new Set(
      records
        .filter(
          (x) =>
            x.kind === financeNoteRelation ||
            (financeNoteRelation === "income" && x.kind === "cash"),
        )
        .map((x) => x.source)
        .filter(Boolean),
    ),
  ];
  const base = initial
    ? normalizeRecord(initial)
    : {
        kind,
        date: new Date().toISOString().slice(0, 10),
        source: "",
        detail: "",
        note: "",
        person: "",
        amount: 0,
        currency: "USD",
        project: "",
        tags: [],
        monthlyExpense: false,
        cashAccount: "",
        listName: "",
      };
  const [form, setForm] = useState<Omit<RecordItem, "id">>(
    language === "ku"
      ? {
          ...base,
          source: localizeData(base.source, language),
          detail: localizeData(base.detail, language),
          note: localizeData(base.note, language),
          person: localizeData(base.person, language),
          project: localizeData(base.project, language),
          listName: localizeData(base.listName, language),
          tags: base.tags.map((x) => localizeData(x, language)),
        }
      : base,
  );
  const previous = (field: "source" | "person" | "project" | "listName") => [
    ...new Set(
      records
        .filter((x) => field !== "source" || x.kind === kind)
        .map((x) => localizeData(x[field], language))
        .filter(Boolean),
    ),
  ];
  function commitSave() {
    if (financeNote.trim()) {
      onCreateNote({
        title: form.source.trim() || tx(language, "Mali Özel Not", "Private Finance Note", "Nîşeya Darayî ya Taybet"),
        content: financeNote.trim(),
        status: financeNoteStatus,
        relation: financeNoteRelation,
        relationDetail: financeNoteRelation === "none" ? "" : (financeNoteRelationDetail.trim() || form.source),
      });
    }
    onSave(form, initial?.id);
  }
  return (
    <div className="overlay">
      <form
        className="modal"
        onSubmit={(e) => {
          e.preventDefault();
          const duplicate = records.find((x) => x.id !== initial?.id && x.kind === kind && x.date === form.date && x.amount === form.amount && x.currency === form.currency && (x.cashAccount || "") === (form.cashAccount || "") && x.source === form.source);
          if (duplicate) {
            setDuplicateConfirmOpen(true);
            return;
          }
          commitSave();
        }}
      >
        <div className="modalHead">
          <div>
            <h2>
              {initial
                ? tx(
                    language,
                    "Kaydı Düzenle",
                    "Edit Record",
                    "Qeydê Biguherîne",
                  )
                : tx(language, "Yeni Kayıt", "New Record", "Qeyda Nû")}
            </h2>
            <p>
              {initial
                ? tx(
                    language,
                    "Eski hali otomatik olarak Arşiv bölümünde saklanacaktır.",
                    "The previous version will be stored automatically in Archive.",
                    "Rewşa berê dê bixweber di Arşîvê de were parastin.",
                  )
                : tx(
                    language,
                    "Daha önce kullanılan bilgiler alanlarda öneri olarak görünür.",
                    "Previously used information appears as suggestions.",
                    "Agahiyên berê hatine bikaranîn wek pêşniyar xuya dibin.",
                  )}
            </p>
          </div>
          <button type="button" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="formGrid">
          <label>
            {tx(language, "Tarih", "Date", "Tarîx")}
            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
            />
          </label>
          <label>
            {kind === "cash"
              ? tx(language, "Kasa Adı", "Cash Account", "Navê Qaseyê")
              : kind === "income"
                ? tx(
                    language,
                    "Gelir Ana Başlığı",
                    "Income Category",
                    "Sernavê Dahatê",
                  )
                : tx(
                    language,
                    "Gider Ana Başlığı",
                    "Expense Category",
                    "Sernavê Mesrefê",
                  )}
            <SuggestInput
              required
              value={form.source}
              onChange={(v) => setForm({ ...form, source: v })}
              options={previous("source")}
            />
          </label>
          <label>
            {tx(language, "Kişi", "Person", "Kes")}
            <SuggestInput
              value={form.person}
              onChange={(v) => setForm({ ...form, person: v })}
              options={previous("person")}
            />
          </label>
          <label>
            {tx(language, "Liste Kaydı", "List Record", "Qeyda Lîsteyê")}
            <SuggestInput
              value={form.listName}
              onChange={(v) => setForm({ ...form, listName: v })}
              options={previous("listName")}
              placeholder={tx(
                language,
                "Örn. V Listesi",
                "E.g. List V",
                "Mînak: Lîsteya V",
              )}
            />
          </label>
          <label>
            {tx(language, "Miktar / Para Birimi", "Amount / Currency", "Meblağ / Yekeya Pere")}
            <div className="amountCurrency">
              <input
                type="number"
                min="0"
                value={form.amount}
                onChange={(e) =>
                  setForm({ ...form, amount: Number(e.target.value) })
                }
              />
              <select
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
              >
                <option>USD</option>
                <option>IQD</option>
                <option>TRY</option>
                <option>EUR</option>
              </select>
            </div>
          </label>
          <label>
            {tx(language, "Birim Adı", "Unit Name", "Navê Yekîneyê")}
            <SuggestInput
              value={form.project}
              onChange={(v) => setForm({ ...form, project: v })}
              options={previous("project")}
            />
          </label>
          {kind !== "cash" && (
            <label>
              {tx(language, "Kasa Seç", "Select Cash Account", "Qase Hilbijêre")}
              <select value={form.cashAccount || ""} onChange={(e) => setForm({ ...form, cashAccount: e.target.value })}>
                <option value="">
                  {kind === "expense"
                    ? tx(language, "Seçilmezse: Diğer Giderler", "If unset: Other Expenses", "Heke neyê hilbijartin: Mesrefên Din")
                    : tx(language, "Seçilmezse: Diğer", "If unset: Other", "Heke neyê hilbijartin: Yên Din")}
                </option>
                {[...new Set(records.filter((x) => x.kind === "cash").map((x) => x.source).filter(Boolean))].map((name) => <option key={name} value={name}>{localizeData(name, language)}</option>)}
              </select>
            </label>
          )}
          {kind === "expense" && (
            <label className="wide check">
              <input
                type="checkbox"
                checked={form.monthlyExpense}
                onChange={(e) =>
                  setForm({ ...form, monthlyExpense: e.target.checked })
                }
              />
              <span>
                <b>
                  {tx(
                    language,
                    "Aylık giderlere ekle",
                    "Add to monthly expenses",
                    "Li mesrefên mehane zêde bike",
                  )}
                </b>
                <small>
                  {tx(
                    language,
                    "Bu kayıt Arşiv'de aylık gider olarak işaretlenir.",
                    "This record is flagged as a monthly expense in Archive.",
                    "Ev qeyd di Arşîvê de wek mesrefeke mehane tê nîşankirin.",
                  )}
                </small>
              </span>
            </label>
          )}
          <label>
            {tx(language, "Detay", "Detail", "Hûragahî")}
            <input
              value={form.detail}
              onChange={(e) => setForm({ ...form, detail: e.target.value })}
            />
          </label>
          <label>
            {tx(language, "Etiketler", "Tags", "Etîket")}
            <input
              placeholder={tx(
                language,
                "Örn: maaş, sabit, solar",
                "E.g. salary, fixed, solar",
                "Mînak: mûçe, sabît, solar",
              )}
              value={form.tags.join(", ")}
              onChange={(e) =>
                setForm({
                  ...form,
                  tags: e.target.value
                    .split(",")
                    .map((x) => x.trim())
                    .filter(Boolean),
                })
              }
            />
          </label>
          <div className="wide notesRow">
            <label>
              {tx(language, "Not", "Note", "Nîşe")}
              <textarea
                rows={3}
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
              />
            </label>
            <label>
              {tx(language, "Mali Özel Not", "Private Finance Note", "Nîşeya Darayî ya Taybet")}
              <textarea
                rows={3}
                value={financeNote}
                onChange={(e) => setFinanceNote(e.target.value)}
                placeholder={tx(
                  language,
                  "Bu kayıtla ilişkili mali özel not…",
                  "A private finance note linked to this record…",
                  "Nîşeyeke darayî ya taybet a girêdayî vê qeydê…",
                )}
              />
            </label>
          </div>
          {financeNote.trim() && (
            <div className="wide notesRow noteExpand">
              <label>
                {tx(language, "Not Durumu", "Note Status", "Rewşa Nîşeyê")}
                <select
                  value={financeNoteStatus}
                  onChange={(e) => setFinanceNoteStatus(e.target.value as NoteStatus)}
                >
                  {financeNoteStatusOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {tx(language, "İlişkili Bölüm", "Linked Section", "Beşa Girêdayî")}
                <select
                  value={financeNoteRelation}
                  onChange={(e) => {
                    setFinanceNoteRelation(e.target.value as NoteRelation);
                    setFinanceNoteRelationDetail("");
                  }}
                >
                  {financeNoteRelationOptions.map((option) => (
                    <option key={option} value={option}>
                      {noteRelationLabel(option, language)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="wide">
                {tx(language, "İlişkili Başlık", "Linked Title", "Sernavê Girêdayî")}
                <SuggestInput
                  disabled={financeNoteRelation === "none"}
                  value={financeNoteRelationDetail}
                  onChange={setFinanceNoteRelationDetail}
                  options={financeNoteTitleOptions}
                  placeholder={
                    financeNoteRelation === "none"
                      ? ""
                      : form.source ||
                        tx(language, "Başlık seçin veya yazın", "Choose or type a title", "Sernav hilbijêre an binivîse")
                  }
                />
              </label>
            </div>
          )}
        </div>
        {kind === "cash" && initial && (
          <div className="cashHistory">
            <h3>
              {tx(language, "Kasa Hareketleri", "Cash Account History", "Tevgerên Qaseyê")}
            </h3>
            {(() => {
              const linkedIncome = total(
                records.filter(
                  (x) => x.kind === "income" && x.cashAccount === initial.source,
                ),
              );
              const linkedExpense = total(
                records.filter(
                  (x) => x.kind === "expense" && x.cashAccount === initial.source,
                ),
              );
              const totalIn = initial.amount + linkedIncome;
              const totalOut = linkedExpense;
              const net = totalIn - totalOut;
              const remainingPercent = totalIn
                ? Math.round((net / totalIn) * 100)
                : 0;
              return (
                <div className="cashHistoryStats">
                  <div>
                    <small>{tx(language, "Toplam Giriş", "Total In", "Giştî Têketin")}</small>
                    <strong>{money(totalIn)}</strong>
                  </div>
                  <div>
                    <small>{tx(language, "Toplam Gider", "Total Out", "Giştî Derketin")}</small>
                    <strong className="negative">{money(totalOut)}</strong>
                  </div>
                  <div>
                    <small>{tx(language, "Net Bakiye", "Net Balance", "Bakiya Paqij")}</small>
                    <strong>{money(net)}</strong>
                  </div>
                  <div>
                    <small>{tx(language, "Kalan %", "Remaining %", "% Mayî")}</small>
                    <strong>%{remainingPercent}</strong>
                  </div>
                </div>
              );
            })()}
            <div className="cashHistoryList">
              {records
                .filter((x) => x.kind !== "cash" && x.cashAccount === initial.source)
                .sort((a, b) => b.date.localeCompare(a.date))
                .map((x) => (
                  <div className="cashHistoryRow" key={x.id}>
                    <span>{date(x.date, language)}</span>
                    <span>
                      {x.kind === "income"
                        ? tx(language, "Gelir", "Income", "Dahat")
                        : tx(language, "Gider", "Expense", "Mesref")}
                    </span>
                    <span>{localizeData(x.source, language)}</span>
                    <strong className={x.kind === "expense" ? "negative" : ""}>
                      {x.kind === "income" ? "+" : "−"}
                      {money(x.amount)}
                    </strong>
                  </div>
                ))}
              {!records.some(
                (x) => x.kind !== "cash" && x.cashAccount === initial.source,
              ) && (
                <div className="cashHistoryEmpty">
                  {tx(
                    language,
                    "Bu kasaya bağlı hareket yok.",
                    "No transactions linked to this cash account.",
                    "Tevgerek girêdayî vê qaseyê tune.",
                  )}
                </div>
              )}
            </div>
          </div>
        )}
        <div className="modalActions">
          <button type="button" className="light" onClick={onClose}>
            {tx(language, "Vazgeç", "Cancel", "Betal")}
          </button>
          <button className="primary">
            {initial
              ? tx(
                  language,
                  "Değişiklikleri Kaydet",
                  "Save Changes",
                  "Guherînan Tomar Bike",
                )
              : tx(language, "Kaydet", "Save", "Tomar Bike")}
          </button>
        </div>
      </form>
      {duplicateConfirmOpen && (
        <ConfirmModal
          language={language}
          message={tx(
            language,
            `Aynı tarih ve tutarla benzer bir kayıt bulundu (${form.date} · ${money(form.amount)}). Bu kaydı yine de eklemek istediğinizden emin misiniz?`,
            `A similar record exists with the same date and amount (${form.date} · ${money(form.amount)}). Save anyway?`,
            `Qeydek mîna vê bi heman tarîx û meblağê heye. Dîsa tomar bike?`,
          )}
          onClose={() => setDuplicateConfirmOpen(false)}
          onConfirm={() => {
            setDuplicateConfirmOpen(false);
            commitSave();
          }}
        />
      )}
    </div>
  );
}

function Archive({
  language,
  rows,
  notes,
  preparedReports,
}: {
  language: Language;
  rows: ArchiveItem[];
  notes: FinanceNote[];
  preparedReports: PreparedReport[];
}) {
  const [year, setYear] = useState("Tümü"),
    [unit, setUnit] = useState("Tümü"),
    [cash, setCash] = useState("Tümü"),
    [monthly, setMonthly] = useState("Tümü"),
    [kind, setKind] = useState("Tümü"),
    [action, setAction] = useState("Tümü");
  const years = [...new Set(rows.map((x) => x.old.date.slice(0, 4)))],
    units = [...new Set(rows.map((x) => x.old.project).filter(Boolean))],
    cashes = [
      ...new Set(
        rows.filter((x) => x.old.kind === "cash").map((x) => x.old.source),
      ),
    ];
  const filtered = rows.filter(
    (x) =>
      (year === "Tümü" || x.old.date.startsWith(year)) &&
      (unit === "Tümü" || x.old.project === unit) &&
      (cash === "Tümü" || x.old.source === cash) &&
      (monthly === "Tümü" || (monthly === "Evet") === !!x.old.monthlyExpense) &&
      (kind === "Tümü" || x.old.kind === kind) &&
      (action === "Tümü" || x.action === action),
  );
  const archivedNotes = notes
    .filter((note) => note.status === "completed")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(4);
  const sortedReports = [...preparedReports].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
  return (
    <div className="panel">
      <div className="archiveIntro">
        <Title
          title={tx(
            language,
            "Arşiv",
            "Archive",
            "Arşîv",
          )}
          sub={tx(
            language,
            "Kasa kayıtları, aylık raporlar ve eski notlar tek yerde düzenli biçimde saklanır",
            "Cash records, monthly reports and older notes are organized in one place",
            "Qeydên qase, raporên mehane û nîşeyên kevn li cîhekî bi rêkûpêk tên parastin",
          )}
        />
      </div>
      <details className="archiveAccordion" open>
        <summary>
          <span><b>▣</b><strong>{tx(language, "Kasa Arşivi", "Cash Archive", "Arşîva Qase")}</strong></span>
          <em>{rows.length} {tx(language, "kayıt", "records", "qeyd")}</em>
        </summary>
        <div className="archiveAccordionBody">
          <p className="archiveDescription">{tx(language, "Düzenlenen veya silinen kasa ve mali kayıtların önceki halleri", "Previous versions of edited or deleted cash and finance records", "Guhertoyên berê yên qeydên qase û darayî")}</p>
      <div className="filters archiveFilters">
        <Filter
          language={language}
          label={tx(language, "Yıl", "Year", "Sal")}
          value={year}
          set={setYear}
          options={years}
        />
        <Filter
          language={language}
          label={tx(
            language,
            "Birim / Proje",
            "Unit / Project",
            "Yekîne / Proje",
          )}
          value={unit}
          set={setUnit}
          options={units}
        />
        <Filter
          language={language}
          label={tx(language, "Kasa", "Cash Account", "Qase")}
          value={cash}
          set={setCash}
          options={cashes}
        />
        <Filter
          language={language}
          label={tx(
            language,
            "Aylık Gider",
            "Monthly Expense",
            "Mesrefa Mehane",
          )}
          value={monthly}
          set={setMonthly}
          options={["Evet", "Hayır"]}
          names={{
            Evet: tx(language, "Evet", "Yes", "Erê"),
            Hayır: tx(language, "Hayır", "No", "Na"),
          }}
        />
        <Filter
          language={language}
          label={tx(language, "Bölüm", "Section", "Beş")}
          value={kind}
          set={setKind}
          options={["income", "expense", "cash"]}
          names={{
            income: tx(language, "Gelir", "Income", "Dahat"),
            expense: tx(language, "Gider", "Expense", "Mesref"),
            cash: tx(language, "Kasa", "Cash", "Qase"),
          }}
        />
        <Filter
          language={language}
          label={tx(language, "İşlem", "Action", "Çalakî")}
          value={action}
          set={setAction}
          options={["Düzenlendi", "Silindi"]}
          names={{
            Düzenlendi: tx(language, "Düzenlendi", "Edited", "Hat guherandin"),
            Silindi: tx(language, "Silindi", "Deleted", "Hat jêbirin"),
          }}
        />
      </div>
      <div className="recordsTable">
        <table>
          <thead>
            <tr>
              <th>
                {tx(language, "İşlem Tarihi", "Action Date", "Tarîxa Çalakiyê")}
              </th>
              <th>{tx(language, "Kayıt Yılı", "Record Year", "Sala Qeydê")}</th>
              <th>{tx(language, "Bölüm", "Section", "Beş")}</th>
              <th>{tx(language, "İşlem", "Action", "Çalakî")}</th>
              <th>
                {tx(
                  language,
                  "Eski Başlık",
                  "Previous Category",
                  "Sernavê Berê",
                )}
              </th>
              <th>
                {tx(language, "Birim / Kasa", "Unit / Cash", "Yekîne / Qase")}
              </th>
              <th>{tx(language, "Aylık", "Monthly", "Mehane")}</th>
              <th>
                {tx(language, "Eski Tutar", "Previous Amount", "Meblağa Berê")}
              </th>
              <th>{tx(language, "Kullanıcı", "User", "Bikarhêner")}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((x) => (
              <tr key={x.id}>
                <td>
                  {new Date(x.at).toLocaleString(
                    language === "ku"
                      ? "ku-TR"
                      : language === "en"
                        ? "en-GB"
                        : "tr-TR",
                  )}
                </td>
                <td>{x.old.date.slice(0, 4)}</td>
                <td>{kindName(x.old.kind, language)}</td>
                <td>
                  <span
                    className={`action ${x.action === "Silindi" ? "red" : ""}`}
                  >
                    {x.action === "Silindi"
                      ? tx(language, "Silindi", "Deleted", "Hat jêbirin")
                      : tx(language, "Düzenlendi", "Edited", "Hat guherandin")}
                  </span>
                </td>
                <td>
                  <b>{localizeData(x.old.source, language)}</b>
                </td>
                <td>
                  {localizeData(
                    x.old.kind === "cash" ? x.old.source : x.old.project,
                    language,
                  )}
                </td>
                <td>
                  {x.old.monthlyExpense
                    ? tx(language, "Evet", "Yes", "Erê")
                    : "—"}
                </td>
                <td className="amount">{money(x.old.amount)}</td>
                <td>{localizeData(x.user, language)}</td>
              </tr>
            ))}
            {!filtered.length && (
              <tr>
                <td colSpan={9} className="empty">
                  {tx(
                    language,
                    "Seçilen filtrelere uygun arşiv kaydı bulunamadı.",
                    "No archive records match the selected filters.",
                    "Qeyda arşîvê ya li gorî fîltreyên hilbijartî nehat dîtin.",
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
        </div>
      </details>

      <details className="archiveAccordion">
        <summary>
          <span><b>▥</b><strong>{tx(language, "Hazırlanan Raporlar Arşivi", "Prepared Reports Archive", "Arşîva Raporên Amadekirî")}</strong></span>
          <em>{sortedReports.length} {tx(language, "rapor", "reports", "rapor")}</em>
        </summary>
        <div className="archiveAccordionBody">
          <p className="archiveDescription">{tx(language, "Rapor Hazırla bölümünde oluşturulan raporlar tarih sırasıyla listelenir", "Reports created in Prepare Report are listed by date", "Raporên di beşa Raporê Amade Bike de hatine çêkirin li gorî tarîxê tên rêzkirin")}</p>
          <div className="archiveReportGrid">
            {sortedReports.map((report) => {
              const income = report.income.reduce((sum, line) => sum + line.amount, 0);
              const expense = report.expense.reduce((sum, line) => sum + line.amount, 0);
              return <article key={report.id}>
                <small>{date(report.date, language)}</small><h3>{report.title}</h3>
                <div><span>{tx(language, "Gelir", "Income", "Dahat")} <b>{money(income)}</b></span><span>{tx(language, "Gider", "Expense", "Mesref")} <b>{money(expense)}</b></span></div>
                <footer>{new Date(report.createdAt).toLocaleDateString(language === "en" ? "en-GB" : "tr-TR")}</footer>
              </article>;
            })}
            {!sortedReports.length && <div className="noteArchiveEmpty">{tx(language, "Henüz arşivlenmiş rapor bulunmuyor.", "There are no archived reports yet.", "Hêj rapora arşîvkirî tune.")}</div>}
          </div>
        </div>
      </details>

      <details className="archiveAccordion">
        <summary>
          <span><b>✎</b><strong>{tx(language, "Notlar Arşivi", "Notes Archive", "Arşîva Nîşeyan")}</strong></span>
          <em>{archivedNotes.length} {tx(language, "not", "notes", "nîşe")}</em>
        </summary>
        <div className="archiveAccordionBody">
          <p className="archiveDescription">{tx(language, "Tamamlanmış son dört nottan daha eski kayıtlar", "Completed notes older than the latest four", "Nîşeyên qediyayî yên ji çar qeydên dawî kevintir")}</p>
        <div className="archivedNoteGrid">
          {archivedNotes.map((note) => <article key={note.id}><small>{new Date(note.updatedAt).toLocaleDateString(language === "en" ? "en-GB" : "tr-TR")}</small><h3>{note.title}</h3><p>{note.content}</p></article>)}
          {!archivedNotes.length && <div className="noteArchiveEmpty">{tx(language, "Arşivlenmiş özel not bulunmuyor.", "There are no archived private notes.", "Nîşeya taybet a arşîvkirî tune.")}</div>}
        </div>
        </div>
      </details>
    </div>
  );
}
function Filter({
  language,
  label,
  value,
  set,
  options,
  names = {},
}: {
  language: Language;
  label: string;
  value: string;
  set: (x: string) => void;
  options: string[];
  names?: Record<string, string>;
}) {
  return (
    <label>
      {label}
      <select value={value} onChange={(e) => set(e.target.value)}>
        <option value="Tümü">{tx(language, "Tümü", "All", "Hemû")}</option>
        {options.map((x) => (
          <option key={x} value={x}>
            {names[x] || localizeData(x, language)}
          </option>
        ))}
      </select>
    </label>
  );
}
function ReportBuilder({
  language,
  records,
  preparedReports,
  onCreateReport,
  onUpdateReport,
  onDeleteReport,
  profile,
  checkPassword,
}: {
  language: Language;
  records: RecordItem[];
  preparedReports: PreparedReport[];
  onCreateReport: (report: PreparedReport) => void;
  onUpdateReport: (report: PreparedReport) => void;
  onDeleteReport: (id: string) => void;
  profile: Profile;
  checkPassword: (password: string) => Promise<boolean>;
}) {
  const [creating, setCreating] = useState(false);
  const [editingReport, setEditingReport] = useState<PreparedReport | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PreparedReport | null>(null);
  const sorted = [...preparedReports].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <div className="panel reportBuilderPage">
      <div className="toolbar">
        <Title
          title={tx(language, "Rapor Hazırla", "Prepare Report", "Raporê Amade Bike")}
          sub={tx(
            language,
            "Kasa, Gelir ve Gider kayıtlarından seçerek mali rapor oluşturun",
            "Create a financial report by selecting from Cash, Income and Expense records",
            "Ji qeydên Qase, Dahat û Mesrefê raporeke darayî çêbikin",
          )}
        />
        <button className="primary" onClick={() => setCreating(true)}>＋ {tx(language, "Yeni Rapor", "New Report", "Rapora Nû")}</button>
      </div>
      <div className="monthlyDocumentList">
        {sorted.map((report) => {
          const totalIncome = report.income.reduce((sum, line) => sum + line.amount, 0);
          const totalExpense = report.expense.reduce((sum, line) => sum + line.amount, 0);
          const open = openId === report.id;
          return (
            <article key={report.id} className={`monthlyDocument ${open ? "open" : ""}`}>
              <button className="monthlyDocumentSummary" onClick={() => setOpenId(open ? null : report.id)}>
                <span><b>{report.title}</b><small>{date(report.date, language)} · {report.presentedTo || tx(language, "Belirtilmedi", "Not specified", "Nehatiye diyarkirin")}</small></span>
                <strong className="typeIncome">{money(totalIncome)}</strong>
                <strong className="typeExpense">{money(totalExpense)}</strong>
                <strong>{money(totalIncome - totalExpense)}</strong>
                <i>{open ? "⌃" : "⌄"}</i>
              </button>
              {open && (
                <div className="monthlyDocumentBody reportTemplate">
                  <header className="templateHeading">
                    <b>{report.title}</b>
                    <span>{report.cashAccount ? `${report.cashAccount} · ` : ""}{date(report.date, language)}{report.presentedTo ? ` · ${report.presentedTo}` : ""}</span>
                  </header>
                  <div className="reportResultCards">
                    <div><small>{tx(language, "Toplam Gelir", "Total Income", "Dahata Giştî")}</small><b className="typeIncome">{money(totalIncome)}</b></div>
                    <div><small>{tx(language, "Toplam Gider", "Total Expense", "Mesrefa Giştî")}</small><b className="typeExpense">{money(totalExpense)}</b></div>
                    <div><small>{tx(language, "Sonuç", "Result", "Encam")}</small><b>{money(totalIncome - totalExpense)}</b></div>
                  </div>
                  {report.detail && <p className="reportBuilderDetail">{report.detail}</p>}
                  <TemplateTable title={tx(language, "Gelir", "Income", "Dahat")} kind="income" lines={report.income} total={totalIncome} language={language} />
                  <TemplateTable title={tx(language, "Gider", "Expense", "Mesref")} kind="expense" lines={report.expense} total={totalExpense} language={language} />
                  <div className="templateTotals">
                    <div><b>{tx(language, "Toplam Gelir", "Total Income", "Dahata Giştî")}</b><strong>{money(totalIncome)}</strong></div>
                    <div><b>{tx(language, "Toplam Gider", "Total Expense", "Mesrefa Giştî")}</b><strong>{money(totalExpense)}</strong></div>
                    <div className={totalIncome - totalExpense < 0 ? "debt" : ""}><b>{tx(language, "Sonuç", "Result", "Encam")}</b><strong>{money(totalIncome - totalExpense)}</strong></div>
                  </div>
                  <div className="reportSignatureRow">
                    <div><small>{tx(language, "Hazırlayan", "Prepared by", "Amade kir")}</small><b>{profile.name}</b></div>
                    <div><small>{tx(language, "Rapor İmzası", "Report Signature", "Îmzeya Raporê")}</small><b>{report.signature || "—"}</b></div>
                  </div>
                  <div className="builderFooter reportCardFooter">
                    <button type="button" className="light" onClick={() => setEditingReport(report)}>✎ {tx(language, "Düzenle", "Edit", "Biguherîne")}</button>
                    <button type="button" className="light" onClick={() => downloadPreparedReport(report, language)}>⇩ {tx(language, "İndir", "Download", "Dakêşe")}</button>
                    <button type="button" className="light redText" onClick={() => setDeleteTarget(report)}>🗑 {tx(language, "Sil", "Delete", "Jêbibe")}</button>
                  </div>
                </div>
              )}
            </article>
          );
        })}
        {!sorted.length && (
          <div className="empty reportEmpty">
            {tx(language, "Henüz oluşturulmuş rapor yok.", "No report created yet.", "Hêj rapor nehatiye çêkirin.")}
          </div>
        )}
      </div>
      {creating && (
        <ReportBuilderModal
          language={language}
          records={records}
          onClose={() => setCreating(false)}
          onSave={(report) => {
            onCreateReport(report);
            setOpenId(report.id);
            setCreating(false);
          }}
        />
      )}
      {editingReport && (
        <ReportBuilderModal
          language={language}
          records={records}
          initial={editingReport}
          onClose={() => setEditingReport(null)}
          onSave={(report) => {
            onUpdateReport(report);
            setOpenId(report.id);
            setEditingReport(null);
          }}
        />
      )}
      {deleteTarget && (
        <DeleteConfirmModal
          language={language}
          itemLabel={deleteTarget.title}
          checkPassword={checkPassword}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => {
            onDeleteReport(deleteTarget.id);
            if (openId === deleteTarget.id) setOpenId(null);
            setDeleteTarget(null);
          }}
        />
      )}
    </div>
  );
}

function ReportBuilderModal({
  language,
  records,
  initial,
  onClose,
  onSave,
}: {
  language: Language;
  records: RecordItem[];
  initial?: PreparedReport;
  onClose: () => void;
  onSave: (report: PreparedReport) => void;
}) {
  const knownCashAccounts = useMemo(() => [...new Set(records.filter((x) => x.kind === "cash").map((x) => x.source).filter(Boolean))], [records]);
  const incomeRecords = useMemo(() => records.filter((x) => x.kind === "income" || x.kind === "cash").sort((a, b) => b.date.localeCompare(a.date)), [records]);
  const expenseRecords = useMemo(() => records.filter((x) => x.kind === "expense").sort((a, b) => b.date.localeCompare(a.date)), [records]);
  const lineMatches = (line: ReportLine, record: RecordItem) => line.date === record.date && line.title === record.source && line.amount === record.amount;

  const [reportDate, setReportDate] = useState(initial?.date ?? new Date().toISOString().slice(0, 10));
  const [cashAccount, setCashAccount] = useState(initial?.cashAccount ?? "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [presentedTo, setPresentedTo] = useState(initial?.presentedTo ?? "");
  const [detail, setDetail] = useState(initial?.detail ?? "");
  const [signature, setSignature] = useState(initial?.signature ?? "");
  const [incomeIds, setIncomeIds] = useState<Set<number>>(
    () => new Set(initial ? incomeRecords.filter((r) => initial.income.some((line) => lineMatches(line, r))).map((r) => r.id) : []),
  );
  const [expenseIds, setExpenseIds] = useState<Set<number>>(
    () => new Set(initial ? expenseRecords.filter((r) => initial.expense.some((line) => lineMatches(line, r))).map((r) => r.id) : []),
  );
  const [manualExpenses, setManualExpenses] = useState<ReportLine[]>(
    () => initial ? initial.expense.filter((line) => !expenseRecords.some((r) => lineMatches(line, r))) : [],
  );
  const [addingManualExpense, setAddingManualExpense] = useState(false);
  const [meDate, setMeDate] = useState(new Date().toISOString().slice(0, 10));
  const [meTitle, setMeTitle] = useState("");
  const [meDetail, setMeDetail] = useState("");
  const [meNote, setMeNote] = useState("");
  const [meAmount, setMeAmount] = useState(0);

  const toggleIncome = (id: number) => setIncomeIds((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const toggleExpense = (id: number) => setExpenseIds((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const totalIncome = incomeRecords.filter((x) => incomeIds.has(x.id)).reduce((sum, x) => sum + x.amount, 0);
  const totalExpense = expenseRecords.filter((x) => expenseIds.has(x.id)).reduce((sum, x) => sum + x.amount, 0) + manualExpenses.reduce((sum, x) => sum + x.amount, 0);
  const valid = Boolean(title.trim()) && (incomeIds.size > 0 || expenseIds.size > 0 || manualExpenses.length > 0);
  const addManualExpense = () => {
    if (!meTitle.trim() || meAmount <= 0) return;
    setManualExpenses((current) => [...current, { date: meDate, title: meTitle.trim(), detail: meDetail.trim(), note: meNote.trim(), amount: meAmount }]);
    setMeDate(new Date().toISOString().slice(0, 10));
    setMeTitle("");
    setMeDetail("");
    setMeNote("");
    setMeAmount(0);
    setAddingManualExpense(false);
  };
  return (
    <div className="overlay">
      <form
        className="modal reportBuilderModal"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          onSave({
            id: initial?.id ?? `${Date.now()}`,
            createdAt: initial?.createdAt ?? new Date().toISOString(),
            date: reportDate,
            title: title.trim(),
            detail: detail.trim(),
            presentedTo: presentedTo.trim(),
            cashAccount,
            signature: signature.trim(),
            income: incomeRecords.filter((x) => incomeIds.has(x.id)).map((x) => ({ date: x.date, title: x.source, detail: x.detail, note: x.note, amount: x.amount })),
            expense: [...expenseRecords.filter((x) => expenseIds.has(x.id)).map((x) => ({ date: x.date, title: x.source, detail: x.detail, note: x.note, amount: x.amount })), ...manualExpenses],
          });
        }}
      >
        <div className="modalHead">
          <div>
            <h2>{initial ? tx(language, "Raporu Düzenle", "Edit Report", "Raporê Biguherîne") : tx(language, "Yeni Rapor Hazırla", "Prepare New Report", "Rapora Nû Amade Bike")}</h2>
            <p>{tx(language, "Mevcut Kasa, Gelir ve Gider kayıtlarından seçim yaparak rapor oluşturun.", "Create a report by selecting from existing Cash, Income and Expense records.", "Ji qeydên heyî yên Qase, Dahat û Mesrefê hilbijêre û raporê çêke.")}</p>
          </div>
          <button type="button" onClick={onClose}>×</button>
        </div>
        <div className="formGrid">
          <label>
            {tx(language, "Tarih Ekle", "Add Date", "Tarîxê Zêde Bike")}
            <input type="date" required value={reportDate} onChange={(e) => setReportDate(e.target.value)} />
          </label>
          <label>
            {tx(language, "Kasa Seç", "Select Cash Account", "Qase Hilbijêre")}
            <select value={cashAccount} onChange={(e) => setCashAccount(e.target.value)}>
              <option value="">{tx(language, "— Seçiniz —", "— Select —", "— Hilbijêre —")}</option>
              {knownCashAccounts.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
          <label className="wide">
            {tx(language, "Rapor Başlığı", "Report Title", "Sernavê Raporê")}
            <input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder={tx(language, "Örn. Temmuz 2026 Mali Durum Raporu", "e.g. July 2026 Financial Report", "Mînak: Rapora Darayî ya Tîrmeh 2026")} />
          </label>
          <label className="wide">
            {tx(language, "Rapor Sunulacak Yer", "Report Recipient", "Cîhê Rapor Lê Tê Pêşkêşkirin")}
            <input value={presentedTo} onChange={(e) => setPresentedTo(e.target.value)} placeholder={tx(language, "Örn. KB Group Yönetim Kurulu", "e.g. KB Group Board", "Mînak: Desteya Rêveberiya KB Group")} />
          </label>
          <label className="wide">
            {tx(language, "Detay Bilgi", "Detail Information", "Agahiya Hûrgulî")}
            <textarea rows={2} value={detail} onChange={(e) => setDetail(e.target.value)} />
          </label>
          <div className="wide reportBuilderPickerGrid">
            <div>
              <div className="reportBuilderPickerHead"><b>{tx(language, "Gelir Seç", "Select Income", "Dahat Hilbijêre")}</b><small>{money(totalIncome)}</small></div>
              <select
                value=""
                onChange={(e) => { if (e.target.value) toggleIncome(Number(e.target.value)); }}
              >
                <option value="">{tx(language, "— Gelirden seçin —", "— Select from income —", "— Ji dahatê hilbijêre —")}</option>
                {incomeRecords.filter((item) => !incomeIds.has(item.id)).map((item) => (
                  <option key={item.id} value={item.id}>{item.source || "—"} · {date(item.date, language)} · {money(item.amount)}</option>
                ))}
              </select>
              <div className="reportBuilderPickerList">
                {incomeRecords.filter((item) => incomeIds.has(item.id)).map((item) => (
                  <div key={item.id} className="reportBuilderPickerRow reportBuilderManualRow">
                    <span className="reportBuilderPickerInfo"><b>{item.source || "—"}</b><small>{date(item.date, language)}</small></span>
                    <span className="typeIncome">{money(item.amount)}</span>
                    <button type="button" aria-label={tx(language, "Satırı sil", "Remove row", "Rêzê jêbibe")} onClick={() => toggleIncome(item.id)}>×</button>
                  </div>
                ))}
                {!incomeIds.size && <div className="reportBuilderPickerEmpty">{tx(language, "Henüz gelir seçilmedi.", "No income selected yet.", "Hîn dahat nehatiye hilbijartin.")}</div>}
              </div>
            </div>
            <div>
              <div className="reportBuilderPickerHead"><b>{tx(language, "Gider Seç", "Select Expense", "Mesref Hilbijêre")}</b><small>{money(totalExpense)}</small></div>
              <select
                value=""
                onChange={(e) => { if (e.target.value) toggleExpense(Number(e.target.value)); }}
              >
                <option value="">{tx(language, "— Giderden seçin —", "— Select from expenses —", "— Ji mesrefê hilbijêre —")}</option>
                {expenseRecords.filter((item) => !expenseIds.has(item.id)).map((item) => (
                  <option key={item.id} value={item.id}>{item.source || "—"} · {date(item.date, language)} · {money(item.amount)}</option>
                ))}
              </select>
              <div className="reportBuilderPickerList">
                {expenseRecords.filter((item) => expenseIds.has(item.id)).map((item) => (
                  <div key={item.id} className="reportBuilderPickerRow reportBuilderManualRow">
                    <span className="reportBuilderPickerInfo"><b>{item.source || "—"}</b><small>{date(item.date, language)}</small></span>
                    <span className="typeExpense">{money(item.amount)}</span>
                    <button type="button" aria-label={tx(language, "Satırı sil", "Remove row", "Rêzê jêbibe")} onClick={() => toggleExpense(item.id)}>×</button>
                  </div>
                ))}
                {manualExpenses.map((line, index) => (
                  <div key={`manual-${index}`} className="reportBuilderPickerRow reportBuilderManualRow">
                    <span className="reportBuilderPickerInfo"><b>{line.title}</b><small>{date(line.date, language)}{line.detail ? ` · ${line.detail}` : ""}</small></span>
                    <span className="typeExpense">{money(line.amount)}</span>
                    <button type="button" aria-label={tx(language, "Satırı sil", "Remove row", "Rêzê jêbibe")} onClick={() => setManualExpenses((current) => current.filter((_, i) => i !== index))}>×</button>
                  </div>
                ))}
                {!expenseIds.size && !manualExpenses.length && <div className="reportBuilderPickerEmpty">{tx(language, "Henüz gider seçilmedi.", "No expense selected yet.", "Hîn mesref nehatiye hilbijartin.")}</div>}
                {addingManualExpense ? (
                  <div className="reportBuilderManualForm">
                    <input aria-label="Tarih" type="date" value={meDate} onChange={(e) => setMeDate(e.target.value)} />
                    <input aria-label="Gider" placeholder={tx(language, "Gider", "Expense", "Mesref")} value={meTitle} onChange={(e) => setMeTitle(e.target.value)} />
                    <input aria-label="Detay" placeholder={tx(language, "Detay", "Detail", "Hûragahî")} value={meDetail} onChange={(e) => setMeDetail(e.target.value)} />
                    <input aria-label="Not" placeholder={tx(language, "Not", "Note", "Nîşe")} value={meNote} onChange={(e) => setMeNote(e.target.value)} />
                    <input aria-label="Miktar" type="number" min="0" placeholder={tx(language, "Miktar", "Amount", "Meblağ")} value={meAmount || ""} onChange={(e) => setMeAmount(Number(e.target.value))} />
                    <div className="reportBuilderManualFormActions">
                      <button type="button" className="light" onClick={() => setAddingManualExpense(false)}>{tx(language, "Vazgeç", "Cancel", "Betal")}</button>
                      <button type="button" className="primary compact" onClick={addManualExpense}>{tx(language, "Ekle", "Add", "Zêde Bike")}</button>
                    </div>
                  </div>
                ) : (
                  <button type="button" className="light reportBuilderAddExpense" onClick={() => setAddingManualExpense(true)}>＋ {tx(language, "Gider Ekle", "Add Expense", "Mesref Zêde Bike")}</button>
                )}
              </div>
            </div>
          </div>
          <div className="wide reportResultCards reportBuilderResult">
            <div><small>{tx(language, "Toplam Gelir", "Total Income", "Dahata Giştî")}</small><b className="typeIncome">{money(totalIncome)}</b></div>
            <div><small>{tx(language, "Toplam Gider", "Total Expense", "Mesrefa Giştî")}</small><b className="typeExpense">{money(totalExpense)}</b></div>
            <div><small>{tx(language, "Sonuç", "Result", "Encam")}</small><b>{money(totalIncome - totalExpense)}</b></div>
          </div>
          <label className="wide">
            {tx(language, "Rapor İmzası", "Report Signature", "Îmzeya Raporê")}
            <input value={signature} onChange={(e) => setSignature(e.target.value)} placeholder={tx(language, "Örn. Ad Soyad, Unvan", "e.g. Name, Title", "Mînak: Nav, Payename")} />
          </label>
        </div>
        <div className="modalActions">
          <button type="button" className="light" onClick={onClose}>{tx(language, "Vazgeç", "Cancel", "Betal")}</button>
          <button className="primary" disabled={!valid}>{initial ? tx(language, "Değişiklikleri Kaydet", "Save Changes", "Guherînan Tomar Bike") : tx(language, "Raporu Oluştur", "Create Report", "Raporê Çêke")}</button>
        </div>
      </form>
    </div>
  );
}

async function downloadPreparedReport(report: PreparedReport, language: Language) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Maliye-Finans Online";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet(tx(language, "Rapor", "Report", "Rapor"), {
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
    views: [{ showGridLines: false }],
  });
  const totalIncome = report.income.reduce((sum, line) => sum + line.amount, 0);
  const totalExpense = report.expense.reduce((sum, line) => sum + line.amount, 0);
  const result = totalIncome - totalExpense;
  const thin = { style: "thin" as const, color: { argb: "FFD3DDDD" } };
  const border = { top: thin, left: thin, bottom: thin, right: thin };
  const moneyFormat = '$ #,##0.00;[Red]-$ #,##0.00';
  const setFill = (row: number, color: string) => { sheet.getRow(row).eachCell({ includeEmpty: true }, (cell) => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } }; }); };
  const mergeTitle = (row: number, value: string, color: string, size: number) => {
    sheet.mergeCells(row, 1, row, 5);
    const cell = sheet.getCell(row, 1);
    cell.value = value;
    cell.font = { name: "Arial", bold: true, size, color: { argb: "FF172B2F" } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
    cell.border = border;
  };
  const addHeader = (labels: string[]) => {
    const row = sheet.addRow(labels);
    row.height = 24;
    row.eachCell((cell) => { cell.font = { name: "Arial", bold: true, size: 10, color: { argb: "FFFFFFFF" } }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF5F9FAF" } }; cell.alignment = { vertical: "middle", horizontal: "left" }; cell.border = border; });
  };
  const addData = (values: (string | number)[]) => {
    const row = sheet.addRow(values);
    row.height = 23;
    row.eachCell({ includeEmpty: true }, (cell, col) => { cell.font = { name: "Arial", size: 10, color: { argb: "FF314750" } }; cell.alignment = { vertical: "middle", wrapText: true, horizontal: col === 5 ? "right" : "left" }; cell.border = border; });
    row.getCell(5).numFmt = moneyFormat;
    row.getCell(5).font = { name: "Arial", size: 10, bold: true, color: { argb: "FF314750" } };
  };

  sheet.columns = [{ width: 17 }, { width: 31 }, { width: 25 }, { width: 25 }, { width: 19 }];
  mergeTitle(1, report.title, "FFB9D3D5", 15);
  mergeTitle(2, `${date(report.date, "tr")}${report.presentedTo ? ` · ${report.presentedTo}` : ""}`, "FFB9D3D5", 12);
  sheet.getRow(1).height = 27;
  sheet.getRow(2).height = 23;

  if (report.detail) {
    const detailRow = sheet.addRow([report.detail]);
    sheet.mergeCells(detailRow.number, 1, detailRow.number, 5);
    detailRow.height = 22;
    detailRow.eachCell({ includeEmpty: true }, (cell) => { cell.border = border; cell.font = { name: "Arial", italic: true, size: 9, color: { argb: "FF60736B" } }; cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true }; });
  }

  const summaryRow1 = sheet.addRow(["", "", "", "", ""]);
  sheet.mergeCells(summaryRow1.number, 1, summaryRow1.number, 2); sheet.mergeCells(summaryRow1.number, 3, summaryRow1.number, 4);
  sheet.getCell(summaryRow1.number, 1).value = "Toplam Gelir"; sheet.getCell(summaryRow1.number, 3).value = "Toplam Gider"; sheet.getCell(summaryRow1.number, 5).value = "Sonuç";
  const summaryRow2 = sheet.addRow(["", "", "", "", ""]);
  sheet.mergeCells(summaryRow2.number, 1, summaryRow2.number, 2); sheet.mergeCells(summaryRow2.number, 3, summaryRow2.number, 4);
  sheet.getCell(summaryRow2.number, 1).value = totalIncome; sheet.getCell(summaryRow2.number, 3).value = totalExpense; sheet.getCell(summaryRow2.number, 5).value = result;
  [summaryRow1.number, summaryRow2.number].forEach((rowNumber) => {
    sheet.getRow(rowNumber).height = rowNumber === summaryRow1.number ? 21 : 29;
    sheet.getRow(rowNumber).eachCell({ includeEmpty: true }, (cell) => { cell.border = border; cell.alignment = { horizontal: "center", vertical: "middle" }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } }; });
  });
  [1, 3, 5].forEach((col) => { sheet.getCell(summaryRow1.number, col).font = { name: "Arial", size: 9, color: { argb: "FF73847D" } }; });
  sheet.getCell(summaryRow2.number, 1).font = { name: "Arial", size: 15, bold: true, color: { argb: "FF188263" } };
  sheet.getCell(summaryRow2.number, 3).font = { name: "Arial", size: 15, bold: true, color: { argb: "FFC74F4F" } };
  sheet.getCell(summaryRow2.number, 5).font = { name: "Arial", size: 15, bold: true, color: { argb: "FF172B2F" } };
  [1, 3, 5].forEach((col) => { sheet.getCell(summaryRow2.number, col).numFmt = moneyFormat; });

  mergeTitle(sheet.rowCount + 1, tx(language, "Gelir", "Income", "Dahat"), "FFEDF6F7", 12);
  addHeader(["Tarih", "Gelir", "Detay", "Not", "Miktar"]);
  report.income.forEach((line) => addData([date(line.date, "tr"), line.title, line.detail, line.note, line.amount]));
  const incomeTotalRow = sheet.addRow(["", "", "", "Toplam Gelir", totalIncome]);
  incomeTotalRow.height = 24; setFill(incomeTotalRow.number, "FFE7F4EF");
  incomeTotalRow.eachCell({ includeEmpty: true }, (cell) => { cell.border = border; cell.font = { name: "Arial", size: 10, bold: true, color: { argb: "FF314750" } }; cell.alignment = { vertical: "middle", horizontal: cell.col === 5 ? "right" : "left" }; });
  incomeTotalRow.getCell(5).numFmt = moneyFormat;

  mergeTitle(sheet.rowCount + 1, tx(language, "Gider", "Expense", "Mesref"), "FFEDF6F7", 12);
  addHeader(["Tarih", "Gider", "Detay", "Not", "Miktar"]);
  report.expense.forEach((line) => addData([date(line.date, "tr"), line.title, line.detail, line.note, line.amount]));
  const expenseTotalRow = sheet.addRow(["", "", "", "Toplam Gider", totalExpense]);
  expenseTotalRow.height = 24; setFill(expenseTotalRow.number, "FFE7F4EF");
  expenseTotalRow.eachCell({ includeEmpty: true }, (cell) => { cell.border = border; cell.font = { name: "Arial", size: 10, bold: true, color: { argb: "FF314750" } }; cell.alignment = { vertical: "middle", horizontal: cell.col === 5 ? "right" : "left" }; });
  expenseTotalRow.getCell(5).numFmt = moneyFormat;

  const totals = [[tx(language, "Toplam Gelir", "Total Income", "Dahata Giştî"), totalIncome], [tx(language, "Toplam Gider", "Total Expense", "Mesrefa Giştî"), totalExpense], [tx(language, "Sonuç", "Result", "Encam"), result]] as const;
  totals.forEach(([label, value]) => {
    const row = sheet.addRow([label, "", "", "", value]);
    sheet.mergeCells(row.number, 1, row.number, 4);
    row.height = 24;
    row.eachCell({ includeEmpty: true }, (cell) => { cell.border = border; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD8D8D8" } }; cell.font = { name: "Arial", size: 10, bold: true, color: { argb: value < 0 ? "FFBD3131" : "FF12191D" } }; cell.alignment = { vertical: "middle", horizontal: cell.col === 5 ? "right" : "left" }; });
    row.getCell(5).numFmt = moneyFormat;
  });

  const signRow = sheet.addRow([tx(language, "Hazırlayan", "Prepared by", "Amade kir"), "", tx(language, "Rapor İmzası", "Report Signature", "Îmzeya Raporê"), "", ""]);
  sheet.mergeCells(signRow.number, 1, signRow.number, 2); sheet.mergeCells(signRow.number, 3, signRow.number, 5);
  signRow.height = 30;
  signRow.eachCell({ includeEmpty: true }, (cell) => { cell.border = border; cell.font = { name: "Arial", size: 9, color: { argb: "FF73847D" } }; cell.alignment = { vertical: "middle", horizontal: "left" }; });
  const signValueRow = sheet.addRow(["", "", report.signature || "", "", ""]);
  sheet.mergeCells(signValueRow.number, 1, signValueRow.number, 2); sheet.mergeCells(signValueRow.number, 3, signValueRow.number, 5);
  signValueRow.height = 26;
  signValueRow.eachCell({ includeEmpty: true }, (cell) => { cell.border = border; cell.font = { name: "Arial", size: 11, bold: true, color: { argb: "FF12191D" } }; cell.alignment = { vertical: "middle", horizontal: "left" }; });

  sheet.pageMargins = { left: 0.3, right: 0.3, top: 0.45, bottom: 0.45, header: 0.2, footer: 0.2 };
  sheet.headerFooter.oddFooter = `&L${report.title}&RPage &P / &N`;
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const link = window.document.createElement("a");
  link.href = url;
  link.download = `${report.title.replaceAll(" ", "-")}.xlsx`;
  link.click();
  URL.revokeObjectURL(url);
}

function TemplateTable({ title, kind, lines, total, language }: { title: string; kind: "income" | "expense"; lines: ReportLine[]; total: number; language: Language }) {
  return <section className="templateSection">
    <h3>{title}</h3>
    <div className="templateTableScroll"><table><thead><tr><th>{tx(language, "Tarih", "Date", "Dîrok")}</th><th>{kind === "income" ? tx(language, "Gelir", "Income", "Dahat") : tx(language, "Gider", "Expense", "Mesref")}</th><th>{tx(language, "Detay", "Detail", "Hûrgulî")}</th><th>{tx(language, "Not", "Note", "Nîşe")}</th><th>{tx(language, "Miktar", "Amount", "Meblağ")}</th></tr></thead><tbody>{lines.map((line, index) => <tr key={`${line.title}-${index}`}><td>{date(line.date, language)}</td><td>{line.title}</td><td>{line.detail || ""}</td><td>{line.note || ""}</td><td className="amount">{money(line.amount)}</td></tr>)}{!lines.length && <tr><td colSpan={5}>—</td></tr>}<tr className="templateSubtotal"><td colSpan={3}></td><td>{kind === "income" ? tx(language, "Toplam Gelir", "Total Income", "Dahata Giştî") : tx(language, "Toplam Gider", "Total Expense", "Mesrefa Giştî")}</td><td className="amount">{money(total)}</td></tr></tbody></table></div>
  </section>;
}

function ReportLines({ lines, language }: { lines: ReportLine[]; language: Language }) {
  return <div className="recordsTable compactReportTable"><table><thead><tr><th>{tx(language, "Tarih", "Date", "Dîrok")}</th><th>{tx(language, "Başlık", "Category", "Sernav")}</th><th>{tx(language, "Detay / Not", "Detail / Note", "Hûrgulî / Nîşe")}</th><th>{tx(language, "Tutar", "Amount", "Meblağ")}</th></tr></thead><tbody>{lines.map((line, index) => <tr key={`${line.title}-${index}`}><td>{date(line.date, language)}</td><td>{line.title}</td><td>{line.detail || line.note || "—"}</td><td className="amount">{money(line.amount)}</td></tr>)}</tbody></table></div>;
}

function AnnualReports({
  language,
  records,
  kind,
}: {
  language: Language;
  records: RecordItem[];
  kind: "income" | "expense";
}) {
  const currentYear = new Date().getFullYear();
  const years = [...new Set([
    currentYear,
    currentYear - 1,
    currentYear - 2,
    ...records.map((x) => Number(x.date.slice(0, 4))),
  ])].sort((a, b) => b - a);
  const [year, setYear] = useState(currentYear);
  const yearCards = years.map((item) => {
    const items = records.filter(
      (x) => x.kind === kind && Number(x.date.slice(0, 4)) === item,
    );
    return { year: item, items, amount: total(items) };
  });
  const selectedItems = yearCards
    .find((item) => item.year === year)?.items
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date)) ?? [];
  const selectedTotal = total(selectedItems);
  return (
    <div className="panel monthly">
      <div className="toolbar">
        <Title
          title={tx(
            language,
            kind === "income" ? "Yıllık Gelirler" : "Yıllık Giderler",
            kind === "income" ? "Annual Income" : "Annual Expenses",
            kind === "income" ? "Dahata Salane" : "Mesrefa Salane",
          )}
          sub={tx(
            language,
            kind === "income" ? "Gelirleri yıllara göre inceleyin" : "Giderleri yıllara göre inceleyin",
            kind === "income" ? "Review income by year" : "Review expenses by year",
            kind === "income" ? "Dahatan li gorî salan bibînin" : "Mesrefan li gorî salan bibînin",
          )}
        />
      </div>
      <div className="yearCards" aria-label={tx(language, "Yıllık rapor kartları", "Annual report cards", "Kartên rapora salane") }>
        {yearCards.map((item) => (
          <button
            key={`${kind}-${item.year}`}
            className={`yearCard ${kind} ${year === item.year ? "active" : ""}`}
            onClick={() => setYear(item.year)}
          >
            <span>
              {kind === "income"
                ? tx(language, `${item.year} Yılı Gelirleri`, `${item.year} Income`, `Dahata Sala ${item.year}`)
                : tx(language, `${item.year} Yılı Giderleri`, `${item.year} Expenses`, `Mesrefa Sala ${item.year}`)}
            </span>
            <b>{money(item.amount)}</b>
            <small>
              {tx(language, `${item.items.length} kayıt`, `${item.items.length} records`, `${item.items.length} qeyd`)} · {tx(language, "Ayrıntıları göster", "Show details", "Hûrguliyan nîşan bide")}
            </small>
          </button>
        ))}
      </div>
      <div className="reportListHead">
        <div>
          <h3>
            {kind === "income"
              ? tx(language, `${year} Gelir Listesi`, `${year} Income List`, `Lîsteya Dahata ${year}`)
              : tx(language, `${year} Gider Listesi`, `${year} Expense List`, `Lîsteya Mesrefa ${year}`)}
          </h3>
          <p>{tx(language, "Seçilen yıla ait bütün kayıtlar", "All records for the selected year", "Hemû qeydên sala hilbijartî")}</p>
        </div>
        <strong>{money(selectedTotal)}</strong>
      </div>
      <div className="recordsTable">
        <table>
          <thead>
            <tr>
              <th>{tx(language, "Tarih", "Date", "Dîrok")}</th>
              <th>{tx(language, "Başlık", "Category", "Sernav")}</th>
              <th>{tx(language, "Açıklama", "Description", "Danasîn")}</th>
              <th>{tx(language, "Kişi", "Person", "Kes")}</th>
              <th>{tx(language, "Tutar", "Amount", "Meblağ")}</th>
            </tr>
          </thead>
          <tbody>
            {selectedItems.map((item) => (
              <tr key={item.id}>
                <td>{date(item.date, language)}</td>
                <td><b>{localizeData(item.source, language)}</b></td>
                <td>{localizeData(item.detail, language)}</td>
                <td>{localizeData(item.person, language)}</td>
                <td className="amount">{money(item.amount)} {item.currency}</td>
              </tr>
            ))}
            {!selectedItems.length && (
              <tr><td className="empty" colSpan={5}>{tx(language, "Bu yıla ait kayıt bulunmuyor.", "No records found for this year.", "Ji bo vê salê qeyd tune.")}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
function Notes({
  language,
  notes,
  onCreateNote,
  onUpdateNote,
  onDeleteNote,
}: {
  language: Language;
  notes: FinanceNote[];
  onCreateNote: (note: Omit<FinanceNote, "id" | "createdAt" | "updatedAt">) => void;
  onUpdateNote: (note: FinanceNote) => void;
  onDeleteNote: (id: number) => void;
}) {
  const [addingTo, setAddingTo] = useState<NoteStatus | null>(null);
  const [editingNote, setEditingNote] = useState<FinanceNote | null>(null);
  const [dragOver, setDragOver] = useState<NoteStatus | null>(null);
  const columns: { id: NoteStatus; label: string; color: string }[] = [
    { id: "important", label: tx(language, "Önemli Notlar", "Important Notes", "Nîşeyên Girîng"), color: "#d6a52b" },
    { id: "urgent", label: tx(language, "Acil Notlar", "Urgent Notes", "Nîşeyên Acîl"), color: "#df5b5b" },
    { id: "pending", label: tx(language, "Bekleyen Notlar", "Pending Notes", "Nîşeyên Li Bendê"), color: "#398db1" },
    { id: "completed", label: tx(language, "Tamamlanmış Notlar", "Completed Notes", "Nîşeyên Qediyayî"), color: "#38a477" },
  ];
  const visibleNotes = (status: NoteStatus) => notes
    .filter((note) => note.status === status)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, status === "completed" ? 4 : undefined);
  const moveNote = (id: number, status: NoteStatus) => {
    const note = notes.find((x) => x.id === id);
    if (note) onUpdateNote({ ...note, status, updatedAt: new Date().toISOString() });
  };
  return (
    <div className="panel">
      <div className="toolbar">
        <Title
          title={tx(
            language,
            "Mali Özel Notları",
            "Private Finance Notes",
            "Nîşeyên Taybet ên Darayî",
          )}
          sub={tx(
            language,
            "Kasa, gelir ve giderlerle ilgili özel açıklamalar",
            "Private notes about cash, income and expenses",
            "Daxuyaniyên taybet derbarê qase, dahat û mesrefan",
          )}
        />
      </div>
      <div className="noteBoard">
        {columns.map((column) => <section className={`noteColumn noteColumn-${column.id}${dragOver === column.id ? " noteColumnDrop" : ""}`} key={column.id} onDragOver={(event) => { event.preventDefault(); setDragOver(column.id); }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragOver(null); }} onDrop={(event) => { event.preventDefault(); const id = Number(event.dataTransfer.getData("text/plain")); if (id) moveNote(id, column.id); setDragOver(null); }}>
          <header><span className="noteColumnTitle"><i style={{ background: column.color }} />{column.label}</span><span className="noteColumnActions"><button aria-label={`${column.label} - ${tx(language, "Not Ekle", "Add Note", "Nîşe Zêde Bike")}`} onClick={() => setAddingTo(column.id)}>＋</button><b>{visibleNotes(column.id).length}</b></span></header>
          <div className="noteColumnBody">
            {visibleNotes(column.id).map((note) => <article className="noteCard" key={note.id} draggable onDragStart={(event) => { if ((event.target as HTMLElement).closest("button, select")) { event.preventDefault(); return; } event.dataTransfer.setData("text/plain", String(note.id)); event.dataTransfer.effectAllowed = "move"; }} onDragEnd={() => setDragOver(null)}>
              <div className="noteMeta"><small>{new Date(note.updatedAt).toLocaleDateString(language === "en" ? "en-GB" : "tr-TR")}</small>{note.relation !== "none" && <span className="noteRelation">↗ {noteRelationLabel(note.relation, language)}{note.relationDetail ? ` · ${note.relationDetail}` : ""}</span>}</div>
              <h3>{note.title}</h3><p>{note.content}</p>
              <label>{tx(language, "Durum", "Status", "Rewş")}<select value={note.status} onChange={(event) => moveNote(note.id, event.target.value as NoteStatus)}>{columns.map((option) => <option value={option.id} key={option.id}>{option.label}</option>)}</select></label>
              <button type="button" className="noteEdit" title={tx(language, "Notu Düzenle", "Edit Note", "Nîşeyê Biguherîne")} aria-label={tx(language, "Notu Düzenle", "Edit Note", "Nîşeyê Biguherîne")} onClick={() => setEditingNote(note)}>✎</button>
              <button className="noteDelete" title={tx(language, "Sil", "Delete", "Jêbirin")} onClick={() => onDeleteNote(note.id)}>×</button>
            </article>)}
            {!visibleNotes(column.id).length && <div className="noteColumnEmpty">{tx(language, "Not yok", "No notes", "Nîşe tune")}</div>}
          </div>
        </section>)}
      </div>
      {addingTo && <NoteModal language={language} initialStatus={addingTo} columns={columns} onClose={() => setAddingTo(null)} onSave={(note) => { onCreateNote(note); setAddingTo(null); }} />}
      {editingNote && <NoteModal language={language} initialStatus={editingNote.status} initialNote={editingNote} columns={columns} onClose={() => setEditingNote(null)} onSave={(updated) => { onUpdateNote(updated); setEditingNote(null); }} />}
    </div>
  );
}
function noteRelationLabel(relation: NoteRelation, language: Language) {
  const labels: Record<NoteRelation, [string, string, string]> = {
    none: ["İlişki Yok", "No Link", "Girêdan Tune"], cash: ["Kasa", "Cash", "Qase"], income: ["Gelir", "Income", "Dahat"], expense: ["Gider", "Expense", "Mesref"], reports: ["Rapor Hazırla", "Prepare Report", "Raporê Amade Bike"], archive: ["Arşiv", "Archive", "Arşîv"], other: ["Diğer", "Other", "Din"],
  };
  const value = labels[relation];
  return language === "en" ? value[1] : language === "ku" ? value[2] : value[0];
}
function NoteModal({ language, initialStatus, initialNote, initialRelation, initialRelationDetail, columns, onClose, onSave }: { language: Language; initialStatus: NoteStatus; initialNote?: FinanceNote; initialRelation?: NoteRelation; initialRelationDetail?: string; columns: { id: NoteStatus; label: string }[]; onClose: () => void; onSave: (note: FinanceNote) => void }) {
  const [title, setTitle] = useState(initialNote?.title ?? "");
  const [content, setContent] = useState(initialNote?.content ?? "");
  const [status, setStatus] = useState<NoteStatus>(initialStatus);
  const [relation, setRelation] = useState<NoteRelation>(initialNote?.relation ?? initialRelation ?? "none");
  const [relationDetail, setRelationDetail] = useState(initialNote?.relationDetail ?? initialRelationDetail ?? "");
  const relationOptions: NoteRelation[] = ["none", "cash", "income", "expense", "reports", "archive", "other"];
  return <div className="overlay"><form className="modal noteModal" onSubmit={(event) => { event.preventDefault(); const now = new Date().toISOString(); if (title.trim() && content.trim()) onSave({ id: initialNote?.id ?? Date.now(), title: title.trim(), content: content.trim(), status, relation, relationDetail: relation === "none" ? "" : relationDetail.trim(), createdAt: initialNote?.createdAt ?? now, updatedAt: now }); }}>
    <div className="modalHead"><div><h2>{initialNote ? tx(language, "Mali Notu Düzenle", "Edit Finance Note", "Nîşeya Darayî Biguherîne") : tx(language, "Yeni Mali Not", "New Finance Note", "Nîşeya Darayî ya Nû")}</h2><p>{tx(language, "Not bilgilerini ve bağlantılı olduğu bölümü belirleyin.", "Set the note details and its linked section.", "Agahiyên nîşeyê û beşa girêdayî diyar bikin.")}</p></div><button type="button" onClick={onClose}>×</button></div>
    <div className="formGrid"><label>{tx(language, "Not Başlığı", "Note Title", "Sernavê Nîşeyê")}<input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} /></label><label>{tx(language, "Not Durumu", "Note Status", "Rewşa Nîşeyê")}<select value={status} onChange={(event) => setStatus(event.target.value as NoteStatus)}>{columns.map((column) => <option key={column.id} value={column.id}>{column.label}</option>)}</select></label><label>{tx(language, "İlişkili Bölüm", "Linked Section", "Beşa Girêdayî")}<select value={relation} onChange={(event) => setRelation(event.target.value as NoteRelation)}>{relationOptions.map((option) => <option key={option} value={option}>{noteRelationLabel(option, language)}</option>)}</select></label><label>{tx(language, "İlişki Detayı", "Link Detail", "Hûrguliya Girêdanê")}<input value={relationDetail} disabled={relation === "none"} onChange={(event) => setRelationDetail(event.target.value)} placeholder={tx(language, "Örn. Ağustos 2026 veya kasa adı", "E.g. August 2026 or cash account", "Mînak: Tebax 2026 an navê qaseyê")} /></label><label className="wide">{tx(language, "İçerik", "Description", "Naverok")}<textarea rows={6} value={content} onChange={(event) => setContent(event.target.value)} placeholder={tx(language, "Notun ayrıntılarını yazın…", "Write the note details…", "Hûrguliyên nîşeyê binivîse…")} /></label></div>
    <div className="modalActions"><button type="button" className="light" onClick={onClose}>{tx(language, "Vazgeç", "Cancel", "Betal Bike")}</button><button className="primary" disabled={!title.trim() || !content.trim()}>{initialNote ? tx(language, "Değişiklikleri Kaydet", "Save Changes", "Guherînan Tomar Bike") : tx(language, "Notu Kaydet", "Save Note", "Nîşeyê Tomar Bike")}</button></div>
  </form></div>;
}
function Users({
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
function Settings({
  language,
  company,
  setCompany,
  logo,
  setLogo,
  uploadLogo,
  typography,
  setTypography,
}: {
  language: Language;
  company: string;
  setCompany: (x: string) => void;
  logo: string;
  setLogo: (x: string) => void;
  uploadLogo: (f?: File) => void;
  typography: TypographySettings;
  setTypography: (value: TypographySettings) => void;
}) {
  const [activeTypographyKey, setActiveTypographyKey] = useState<TypographyKey>("pageTitle");
  const [typographyDraft, setTypographyDraft] = useState<TypographySettings>(typography);
  const [typographyApproved, setTypographyApproved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [blockedIps, setBlockedIps] = useState<BlockedIp[]>([]);
  const [blockedIpsLoaded, setBlockedIpsLoaded] = useState(false);

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

  return (
    <div className="settingsPage">
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
          </span>
        </div>
        <label className="settingLabel">
          {tx(
            language,
            "Program / Şirket Adı",
            "Program / Company Name",
            "Navê Bername / Pargîdaniyê",
          )}
          <input value={company} onChange={(e) => setCompany(e.target.value)} />
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
    </div>
  );
}

const typographyNames: Record<TypographyKey, [string, string, string]> = {
  pageTitle: ["Ana Başlıklar", "Main Titles", "Sernavên Sereke"],
  sectionTitle: ["Bölüm Başlıkları", "Section Titles", "Sernavên Beşan"],
  cardTitle: ["İçerik Kutusu Başlıkları", "Content Card Titles", "Sernavên Kartan"],
  body: ["Normal İçerik Yazıları", "Body Text", "Nivîsa Naverokê"],
  tableHeader: ["Tablo Başlıkları", "Table Headers", "Sernavên Tabloyê"],
  formText: ["Form ve Alan Yazıları", "Form & Field Text", "Nivîsa Formê"],
};
const colorSwatches = ["#dc2626", "#ea580c", "#d97706", "#ca8a04", "#65a30d", "#16a34a", "#059669", "#0d9488", "#0891b2", "#0284c7", "#2563eb", "#4f46e5", "#7c3aed", "#9333ea", "#c026d3", "#db2777", "#e11d48", "#475569", "#525252", "#27272a"];

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

function typographyVariables(settings: TypographySettings): CSSProperties {
  return {
    "--page-title-size": `${settings.pageTitle.size}px`, "--page-title-font": settings.pageTitle.font, "--page-title-color": settings.pageTitle.color,
    "--section-title-size": `${settings.sectionTitle.size}px`, "--section-title-font": settings.sectionTitle.font, "--section-title-color": settings.sectionTitle.color,
    "--card-title-size": `${settings.cardTitle.size}px`, "--card-title-font": settings.cardTitle.font, "--card-title-color": settings.cardTitle.color,
    "--body-size": `${settings.body.size}px`, "--body-font": settings.body.font, "--body-color": settings.body.color,
    "--table-header-size": `${settings.tableHeader.size}px`, "--table-header-font": settings.tableHeader.font, "--table-header-color": settings.tableHeader.color,
    "--form-text-size": `${settings.formText.size}px`, "--form-text-font": settings.formText.font, "--form-text-color": settings.formText.color,
  } as CSSProperties;
}

function Stat({
  label,
  linkLabel,
  value,
  tone,
  icon,
  onClick,
}: {
  label: string;
  linkLabel: string;
  value: number;
  tone: string;
  icon: string;
  onClick: () => void;
}) {
  return (
    <button className={`stat ${tone}`} onClick={onClick} title={linkLabel}>
      <span>
        <small>{label}</small>
        <b>{money(value)}</b>
        <em>{linkLabel} →</em>
      </span>
      <i>{icon}</i>
    </button>
  );
}
function Title({
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
function Bar({
  label,
  value,
  max,
  expense,
}: {
  label: string;
  value: number;
  max: number;
  expense?: boolean;
}) {
  return (
    <div>
      <span>
        <b>{label}</b>
        <strong>{money(value)}</strong>
      </span>
      <i>
        <em
          className={expense ? "expense" : ""}
          style={{ width: `${Math.max(4, (Math.abs(value) / max) * 100)}%` }}
        ></em>
      </i>
    </div>
  );
}
function total(rows: RecordItem[]) {
  return rows.reduce((a, b) => a + b.amount, 0);
}
function money(v: number) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "USD",
  }).format(v);
}
function date(v: string, _language: Language = "tr") {
  const stored = parseStoredDate(v);
  const [year, month, day] = stored.split("-");
  return `${day}.${month}.${year}`;
}
function parseStoredDate(value: unknown) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const raw = String(value ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const match = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (match) {
    const [, day, month, year] = match;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  return new Date().toISOString().slice(0, 10);
}
function kindName(k: Kind, language: Language = "tr") {
  return k === "income"
    ? tx(language, "Gelir", "Income", "Dahat")
    : k === "expense"
      ? tx(language, "Gider", "Expense", "Mesref")
      : tx(language, "Kasa", "Cash", "Qase");
}
function normalizeRecord(x: RecordItem): RecordItem {
  return {
    ...x,
    detail: x.detail || "",
    tags: Array.isArray(x.tags) ? x.tags : [],
    monthlyExpense: !!x.monthlyExpense,
    cashAccount: x.cashAccount || "",
    listName: x.listName || "",
  };
}
function localizedProfileName(name: string, language: Language) {
  if (name !== "Admin") return name;
  return language === "tr"
    ? "Admin"
    : language === "en"
      ? "Administrator"
      : "Rêveber";
}
function localizedRole(role: string, language: Language) {
  if (role !== "Yönetici") return role;
  return language === "tr"
    ? "Yönetici"
    : language === "en"
      ? "Manager"
      : "Birêvebir";
}
function tx(language: Language, tr: string, en: string, ku: string) {
  return language === "ku" ? ku : language === "en" ? en : tr;
}
function localizeData(value: string, language: Language) {
  if (language !== "ku") return value;
  const ku: Record<string, string> = {
    "Panel satışı": "Firotina panelan",
    "Peşin tahsilat": "Wergirtina pêşîn",
    satış: "firotin",
    Montaj: "Sazkirin",
    "Montaj geliri": "Dahata sazkirinê",
    montaj: "sazkirin",
    "Havale Gelirleri": "Dahatên Veguhastinê",
    "Müşteri ödemesi": "Dayîna mişterî",
    "Banka havalesi": "Veguhastina bankê",
    havale: "veguhastin",
    "Market Satış Gelirleri": "Dahatên Firotina Marketê",
    "Günlük satış": "Firotina rojane",
    Kapanış: "Girtina rojê",
    market: "market",
    "Personel Giderleri": "Mesrefên Karmendan",
    "Ağustos maaşı": "Mûçeya Tebaxê",
    "Aylık ödeme": "Dayîna mehane",
    Finans: "Darayî",
    maaş: "mûçe",
    sabit: "sabît",
    "Nakliye Giderleri": "Mesrefên Veguhastinê",
    "Malzeme taşıma": "Veguhastina malzemeyan",
    "Solar saha": "Qada Solar",
    nakliye: "veguhastin",
    "Merkez USD Kasası": "Qaseya Navendê ya USD",
    "Nakit giriş": "Têketina pereyê destan",
    "Kasaya aktarım": "Veguhastina qaseyê",
    "Merkez Ofis": "Ofîsa Navendê",
    Merkez: "Navend",
    merkez: "navend",
    "Market Kasası": "Qaseya Marketê",
    "Günlük devir": "Veguhastina rojane",
    "Kasa kapanışı": "Girtina qaseyê",
    "Ağustos ayı Solar sözleşmelerini kontrol et.":
      "Peymanên Solar ên meha Tebaxê kontrol bike.",
    "Market kira ödemesi 15 Ağustos.": "Dayîna kirêya marketê 15ê Tebaxê ye.",
    Admin: "Rêveber",
    Yönetici: "Birêvebir",
    Düzenlendi: "Hat guherandin",
    Silindi: "Hat jêbirin",
  };
  return ku[value] || value;
}

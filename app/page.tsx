"use client";

import { useEffect, useState } from "react";
import { LanguageSetup, Login } from "./components/Login";
import { ProfileModal } from "./components/ProfileModal";
import { Dashboard } from "./components/Dashboard";
import { Records, RecordModal } from "./components/Records";
import { Archive } from "./components/Archive";
import { ReportBuilder } from "./components/ReportBuilder";
import { Notes } from "./components/Notes";
import { Users } from "./components/Users";
import { Settings } from "./components/Settings";
import { tx, localizedProfileName, localizedRole, kbGroupLogo, nav } from "./lib/i18n";
import { normalizeRecord } from "./lib/finance";
import { defaultTypography, typographyVariables } from "./lib/typography";
import { adminOnlyPages } from "./lib/types";
import type {
  ArchiveItem,
  FinanceNote,
  Kind,
  Language,
  NoteRelation,
  NoteStatus,
  Page,
  PreparedReport,
  Profile,
  RecordItem,
  TypographySettings,
  UserAccount,
} from "./lib/types";

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
  // Both start at a fixed, SSR-safe default and are corrected from
  // localStorage in an effect after mount (same pattern as uiZoom below) —
  // reading localStorage during the initial render would make the client's
  // first render disagree with the server-rendered HTML and break hydration.
  const [language, setLanguage] = useState<Language>("tr");
  // Gates the first-run LanguageSetup screen — shown once, before the first
  // sign-in, whenever this browser has never had a language chosen.
  const [languageChosen, setLanguageChosen] = useState(true);
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
    const saved = localStorage.getItem("mf-language");
    if (saved === "en" || saved === "ku" || saved === "tr") {
      setLanguage(saved);
      setLanguageChosen(true);
    } else {
      setLanguageChosen(false);
    }
  }, []);

  // Updates the active language, remembers it as this browser's pre-login
  // default, and — once signed in — persists it to the user's own account
  // so it follows them to any device (see PUT /api/profile below).
  function changeLanguage(next: Language) {
    setLanguage(next);
    setLanguageChosen(true);
    try {
      localStorage.setItem("mf-language", next);
    } catch {}
    if (signedIn) {
      fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: profile.name, avatar: profile.avatar, language: next }),
      }).catch(() => {});
    }
  }

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
          const savedLanguage = data.profile?.language;
          if (savedLanguage === "en" || savedLanguage === "ku" || savedLanguage === "tr") {
            setLanguage(savedLanguage);
            setLanguageChosen(true);
            try {
              localStorage.setItem("mf-language", savedLanguage);
            } catch {}
          }
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
          // Language is per-user now (applied at sign-in from
          // profile.language) — settings.language is only the pre-login
          // default and is intentionally not applied here.
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
    return () => {
      document.documentElement.style.removeProperty("zoom");
    };
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
        if (response.status === 409) {
          alert(tx(language, "Bu kayıt siz düzenlerken başka bir kullanıcı tarafından değiştirildi. Lütfen sayfayı yenileyip tekrar deneyin.", "This record was changed by another user while you were editing it. Please refresh and try again.", "Dema te ev qeyd sererast dikir, bikarhênerek din ew guherand. Ji kerema xwe rûpelê nûve bike û dîsa biceribîne."));
          return;
        }
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
      const savedLanguage = data.profile?.language;
      if (savedLanguage === "en" || savedLanguage === "ku" || savedLanguage === "tr") {
        setLanguage(savedLanguage);
        setLanguageChosen(true);
        try {
          localStorage.setItem("mf-language", savedLanguage);
        } catch {}
      }
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

  if (!signedIn && !languageChosen) {
    return <LanguageSetup onChoose={changeLanguage} />;
  }

  if (!signedIn)
    return (
      <Login language={language} setLanguage={changeLanguage} onSignIn={signIn} />
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
                onChange={(e) => changeLanguage(e.target.value as Language)}
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
              checkPassword={checkPassword}
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

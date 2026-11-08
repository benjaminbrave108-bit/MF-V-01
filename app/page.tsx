"use client";

import { useEffect, useMemo, useState } from "react";
import { LanguageSetup, Login } from "./components/Login";
import { ProfileModal } from "./components/ProfileModal";
import { Dashboard } from "./components/Dashboard";
import { Records, RecordModal } from "./components/Records";
import { useDraggableModals, DeleteConfirmModal } from "./components/shared";
import { Archive } from "./components/Archive";
import { Activity } from "./components/Activity";
import { ReportBuilder } from "./components/ReportBuilder";
import { Notes } from "./components/Notes";
import { Comments } from "./components/Comments";
import { Users } from "./components/Users";
import { Settings } from "./components/Settings";
import { Guide } from "./components/Guide";
import { Lists } from "./components/Lists";
import { tx, localizedProfileName, localizedRole, kbGroupLogo, nav } from "./lib/i18n";
import { normalizeRecord } from "./lib/finance";
import { defaultTypography, typographyVariables } from "./lib/typography";
import { adminOnlyPages } from "./lib/types";
import type {
  ArchiveItem,
  CashAccountSummary,
  CashTransfer,
  FinanceNote,
  Kind,
  Language,
  NoteRelation,
  NoteColumn,
  RecordAttachment,
  NoteStatus,
  Page,
  PreparedReport,
  Profile,
  RecordItem,
  TypographySettings,
  UserAccount,
  KasaSection,
} from "./lib/types";

export default function Home() {
  useDraggableModals();
  const [signedIn, setSignedIn] = useState(false);
  const [page, setPage] = useState<Page>("dashboard");
  const [pageHistory, setPageHistory] = useState<Page[]>([]);
  const [reportTab, setReportTab] = useState<"prepare" | "upload">("prepare");
  function goPage(next: Page) {
    if (next === page) return;
    setPageHistory((h) => [...h.slice(-29), page]);
    setPage(next);
  }
  function goBack() {
    const previous = pageHistory[pageHistory.length - 1];
    if (!previous) return;
    setPageHistory(pageHistory.slice(0, -1));
    setPage(previous);
  }
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [archive, setArchive] = useState<ArchiveItem[]>([]);
  const [notes, setNotes] = useState<FinanceNote[]>([]);
  const [noteColumns, setNoteColumns] = useState<NoteColumn[]>([]);
  const [exchangeRates, setExchangeRates] = useState<Record<string, number>>({});
  const [noteDeleteId, setNoteDeleteId] = useState<number | null>(null);
  const [logo, setLogo] = useState("");
  const [company, setCompany] = useState("Maliye-Finans");
  const [modal, setModal] = useState<{ kind: Kind; item?: RecordItem; cashAccount?: string } | null>(
    null,
  );
  const [recordsSearch, setRecordsSearch] = useState("");
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
    isSuperAdmin: false,
    permissions: [],
    dashboardIncludedUserIds: [],
  });
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [cashAccounts, setCashAccounts] = useState<CashAccountSummary[]>([]);
  // Ayarlar > Bölümler: yönetici tanımlı kasa/gelir/gider bölümleri (her biri sayfalarda yeni bir kutu ekler).
  const [sections, setSections] = useState<KasaSection[]>([]);
  const [cashTransfers, setCashTransfers] = useState<CashTransfer[]>([]);
  // Badge next to "Yorumlar" in the sidebar — comments on records this user
  // can see that they haven't opened yet (see app/api/comments/unread-count
  // and the per-record/read-all "mark read" endpoints Comments.tsx calls).
  const [unreadCommentsCount, setUnreadCommentsCount] = useState(0);
  async function refreshUnreadCommentsCount() {
    try {
      const response = await fetch("/api/comments/unread-count");
      const data = await response.json().catch(() => ({}));
      if (response.ok) setUnreadCommentsCount(data.count ?? 0);
    } catch {
      // Leave the last known count in place.
    }
  }
  useEffect(() => {
    if (!signedIn) return;
    refreshUnreadCommentsCount();
    const interval = setInterval(refreshUnreadCommentsCount, 45000);
    return () => clearInterval(interval);
  }, [signedIn]);
  // Badge next to "Mali Özel Notlar" — same idea as unreadCommentsCount, but
  // per-note (bkz. app/api/notes/unread-count, app/api/_lib/notes.ts).
  const [unreadNotesCount, setUnreadNotesCount] = useState(0);
  async function refreshUnreadNotesCount() {
    try {
      const response = await fetch("/api/notes/unread-count");
      const data = await response.json().catch(() => ({}));
      if (response.ok) setUnreadNotesCount(data.count ?? 0);
    } catch {
      // Leave the last known count in place.
    }
  }
  useEffect(() => {
    if (!signedIn) return;
    refreshUnreadNotesCount();
    const interval = setInterval(refreshUnreadNotesCount, 45000);
    return () => clearInterval(interval);
  }, [signedIn]);
  // Kullanıcılar sayfasındaki çevrimiçi noktası — admin için tüm o an aktif
  // kullanıcıları, herkes için sadece kendi id'sini döner (bkz.
  // /api/users/online). Aynı 45s ritmiyle yenilenir, bu istek zaten her
  // oturumun lastSeenAt'ini de güncelliyor (see getSessionUser).
  const [onlineUserIds, setOnlineUserIds] = useState<number[]>([]);
  async function refreshOnlineUsers() {
    try {
      const response = await fetch("/api/users/online");
      const data = await response.json().catch(() => ({}));
      if (response.ok) setOnlineUserIds(data.onlineUserIds ?? []);
    } catch {
      // Leave the last known set in place.
    }
  }
  useEffect(() => {
    if (!signedIn) return;
    refreshOnlineUsers();
    const interval = setInterval(refreshOnlineUsers, 45000);
    return () => clearInterval(interval);
  }, [signedIn]);
  // Kasa/Gelir/Gider/Ana Sayfa, kullanıcının görebildiği tüm kasaları birlikte gösterir
  // (kullanıcı başına hangi kasaların görüneceği Ayarlar > Kasa Erişimi'nden belirlenir).
  const contextRecords = records;
  const contextCashAccounts = cashAccounts;
  const dashboardRecords = records;
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
            ? { id: Date.now() + index, title: "Mali Not", content: note, status: "important" as NoteStatus, relation: "none" as NoteRelation, relationDetail: "", assignedUserIds: [], isArchived: false, archivedAt: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
            : { ...note, relation: note.relation ?? "none", relationDetail: note.relationDetail ?? "", assignedUserIds: note.assignedUserIds ?? [], isArchived: note.isArchived ?? false, archivedAt: note.archivedAt ?? null },
        ));
        if (Array.isArray(data.preparedReports)) setPreparedReports(data.preparedReports);
        if (Array.isArray(data.users)) setUsers(data.users);
        refreshCashAccounts();
        refreshSections();
        refreshCashTransfers();
        refreshNotes();
        if (Array.isArray(data.noteColumns)) setNoteColumns(data.noteColumns);
        if (data.settings) {
          setExchangeRates(data.settings.exchangeRates ?? {});
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
    // Every signed-in user may open Kullanıcılar to view/edit their own
    // account — Users.tsx itself limits a non-admin to just that.
    if (pageId === "users") return true;
    // Kullanım Kılavuzu is pure static help content, no real data — every
    // signed-in user can open it regardless of their page permissions.
    if (pageId === "guide") return true;
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
        if (response.status === 423) {
          const info = await response.json().catch(() => ({}));
          alert(info.error || tx(language, "Bu kayıt bir listeden otomatik oluşturuldu; Listeler sayfasından düzenleyin.", "This record was generated from a list; edit it on the Lists page.", "Ev qeyd ji lîsteyekê hate çêkirin; li rûpela Lîste biguherîne."));
          return;
        }
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
  async function refreshSections() {
    try {
      const response = await fetch("/api/sections");
      if (!response.ok) return;
      const data = await response.json();
      if (Array.isArray(data.sections)) setSections(data.sections);
    } catch {}
  }
  async function refreshCashAccounts() {
    try {
      const response = await fetch("/api/cash-accounts");
      if (!response.ok) return;
      const data = await response.json();
      if (Array.isArray(data.cashAccounts)) setCashAccounts(data.cashAccounts);
    } catch {}
  }
  async function refreshRecords() {
    try {
      const response = await fetch("/api/records");
      if (!response.ok) return;
      const data = await response.json();
      if (Array.isArray(data.records)) setRecords(data.records.map(normalizeRecord));
    } catch {}
  }
  async function refreshCashTransfers() {
    try {
      const response = await fetch("/api/cash-transfers");
      if (!response.ok) return;
      const data = await response.json();
      if (Array.isArray(data.cashTransfers)) setCashTransfers(data.cashTransfers);
    } catch {}
  }
  async function refreshAfterCashTransfer() {
    await Promise.all([refreshRecords(), refreshCashAccounts(), refreshCashTransfers()]);
  }
  async function refreshExchangeRates() {
    try {
      const response = await fetch("/api/exchange-rates");
      if (!response.ok) return;
      const data = await response.json();
      if (data.rates) setExchangeRates(data.rates);
    } catch {}
  }
  async function refreshNoteColumns() {
    try {
      const response = await fetch("/api/note-columns");
      if (!response.ok) return;
      const data = await response.json();
      if (Array.isArray(data.columns)) setNoteColumns(data.columns);
    } catch {}
  }
  async function refreshNotes() {
    try {
      const response = await fetch("/api/notes");
      if (!response.ok) return;
      const data = await response.json();
      if (Array.isArray(data.notes)) setNotes(data.notes);
    } catch {}
  }
  async function refreshArchive() {
    try {
      const response = await fetch("/api/archive");
      if (!response.ok) return;
      const data = await response.json();
      if (Array.isArray(data.archive)) {
        setArchive(data.archive.map((x: ArchiveItem) => ({ ...x, old: normalizeRecord(x.old) })));
      }
    } catch {}
  }
  // Başka bir kullanıcının yaptığı değişikliklerin manuel "yenile" olmadan
  // kendiliğinden görünmesi için: oturum açıkken ana veriler düzenli
  // aralıklarla arka planda yeniden çekilir. Zaten mevcut olan
  // refreshX() yardımcıları burada yeniden kullanılıyor — hepsi tam bir
  // state değişimi yapar, sayfa hiçbir zaman elle yenilenmek zorunda kalmaz.
  useEffect(() => {
    if (!signedIn) return;
    const sync = () => {
      if (document.hidden) return;
      refreshRecords();
      refreshCashAccounts();
      refreshCashTransfers();
      refreshSections();
      refreshNotes();
      refreshNoteColumns();
      refreshExchangeRates();
      refreshArchive();
    };
    const interval = setInterval(sync, 5000);
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("focus", sync);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("focus", sync);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn]);
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
  async function removeRecord(item: RecordItem, reason: string) {
    try {
      const response = await fetch(`/api/records/${item.id}?reason=${encodeURIComponent(reason)}`, { method: "DELETE" });
      if (!response.ok) {
        if (response.status === 423) {
          const info = await response.json().catch(() => ({}));
          alert(info.error || tx(language, "Bu kayıt bir listeden otomatik oluşturuldu; Listeler sayfasından silin.", "This record was generated from a list; delete it on the Lists page.", "Ev qeyd ji lîsteyekê hate çêkirin; li rûpela Lîste jê bibe."));
          return;
        }
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
  async function createNote(input: Partial<FinanceNote>) {
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
  async function updateNote(note: FinanceNote & { addAttachments?: RecordAttachment[]; removeAttachmentIndexes?: number[] }) {
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
  async function deleteNote(id: number, reason: string) {
    try {
      const response = await fetch(`/api/notes/${id}?reason=${encodeURIComponent(reason)}`, { method: "DELETE" });
      if (!response.ok) return alert(noteSaveError);
      setNotes((n) => n.filter((x) => x.id !== id));
    } catch {
      alert(noteSaveError);
    }
  }
  // "Arşivle" (Notes.tsx) / "Geri Al" (Archive.tsx) — aynı not, sadece
  // isArchived bayrağı değişiyor; updateNote'un mevcut PUT+state güncelleme
  // mantığını yeniden kullanıyor.
  async function archiveNote(id: number, archived: boolean) {
    const note = notes.find((x) => x.id === id);
    if (!note) return;
    await updateNote({ ...note, isArchived: archived });
  }
  // Notlar sayfası açılınca çağrılır — tüm (arşivlenmemiş) notları bu
  // kullanıcı için okundu işaretler ve rozeti günceller.
  async function markNotesRead() {
    try {
      const response = await fetch("/api/notes/read-all", { method: "POST" });
      if (response.ok) {
        setNotes((n) => n.map((x) => ({ ...x, isUnread: false })));
        refreshUnreadNotesCount();
      }
    } catch {}
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
  async function deletePreparedReport(id: string, reason: string) {
    try {
      const response = await fetch(`/api/prepared-reports/${id}?reason=${encodeURIComponent(reason)}`, { method: "DELETE" });
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
          {nav.filter((n) => n.id !== "lists" && n.id !== "income" && n.id !== "expense" && n.id !== "users" && canAccess(n.id)).map((n) => (
            <div key={n.id}>
              <button
                className={page === n.id ? "active" : ""}
                onClick={() => goPage(n.id)}
              >
                <i>{n.icon}</i>
                <span>{n.label[language]}</span>
                {n.id === "comments" && unreadCommentsCount > 0 && (
                  <b className="navBadge">{unreadCommentsCount}</b>
                )}
                {n.id === "notes" && unreadNotesCount > 0 && (
                  <b className="navBadge">{unreadNotesCount}</b>
                )}
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
          <div className="headerTitleRow">
            {pageHistory.length > 0 && (
              <button
                type="button"
                className="pageBack"
                onClick={goBack}
                title={tx(language, "Önceki sayfaya dön", "Back to the previous page", "Vegere rûpela berê")}
                aria-label={tx(language, "Önceki sayfaya dön", "Back to the previous page", "Vegere rûpela berê")}
              >
                ←
              </button>
            )}
            <h1>
              {nav.find((n) => n.id === page)?.label[language]}
            </h1>
            {page === "cash" && (
              <p className="pageHint">
                {tx(
                  language,
                  "Çalışma alanları içinde birden fazla kasa bulunabilir. Her kasa mutlaka bir çalışma alanına bağlıdır; kasayı seçip “⇄ Çalışma alanına taşı” ile başka bir alana taşıyabilirsiniz.",
                  "A workspace can contain several cash accounts. Every cash account belongs to a workspace; select a cash account and use “⇄ Move to workspace” to move it.",
                  "Di nav qada xebatê de çend qase hene. Her qase girêdayî qada xebatê ye; qaseyê hilbijêre û bi “⇄ Bibe qada xebatê” bibe cihekî din.",
                )}
              </p>
            )}
            {(page === "income" || page === "expense") && (
              <div className="headerSearch">
                <span>⌕</span>
                <input
                  value={recordsSearch}
                  onChange={(e) => setRecordsSearch(e.target.value)}
                  placeholder={tx(
                    language,
                    "Kayıtlarda ara…",
                    "Search records…",
                    "Di qeydan de bigere…",
                  )}
                />
              </div>
            )}
          </div>
          <div className="headerActions">
            {onlineUserIds.length > 0 && (
              <div className="headerOnlineUsers">
                {users
                  .filter((u) => onlineUserIds.includes(u.id))
                  .slice(0, 4)
                  .map((u) => (
                    <span
                      key={u.id}
                      className="headerOnlineAvatar"
                      title={`${u.name} — ${tx(language, "Çevrimiçi", "Online", "Girêdayî")}`}
                    >
                      {u.name.slice(0, 1).toUpperCase()}
                      <i className="headerOnlineDot" />
                    </span>
                  ))}
                {onlineUserIds.length > 4 && (
                  <span className="headerOnlineAvatar headerOnlineMore">+{onlineUserIds.length - 4}</span>
                )}
              </div>
            )}
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
            <Dashboard records={dashboardRecords} language={language} goTo={goPage} />
          )}
          {(["cash", "income", "expense"] as Page[]).includes(page) && (
            <Records
              language={language}
              kind={page as Kind}
              records={contextRecords.filter(
                (x) =>
                  x.kind === page ||
                  (page === "income" && x.kind === "cash"),
              )}
              allRecords={contextRecords}
              onAdd={(addKind, cashAccount) => setModal({ kind: addKind ?? (page as Kind), cashAccount })}
              onEdit={(item) => setModal({ kind: item.kind, item })}
              onDelete={removeRecord}
              onImport={importRecords}
              onRefreshData={() => { refreshRecords(); refreshCashAccounts(); refreshSections(); }}
              sections={sections}
              isSuperAdmin={profile.isSuperAdmin}
              onGoUpload={() => { setReportTab("upload"); goPage("reportBuilder"); }}
              checkPassword={checkPassword}
              cashAccounts={contextCashAccounts}
              users={users}
              onCashAccountsChange={setCashAccounts}
              search={recordsSearch}
              setSearch={setRecordsSearch}
              cashTransfers={cashTransfers}
              onTransfersChanged={refreshAfterCashTransfer}
              onCommentsRead={refreshUnreadCommentsCount}
              readOnly={false}
              notes={notes}
              exchangeRates={exchangeRates}
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
              cashAccounts={contextCashAccounts}
              sections={sections}
              tab={reportTab}
              onTabChange={setReportTab}
              onDataChanged={() => { refreshRecords(); refreshCashAccounts(); refreshSections(); }}
            />
          )}
          {page === "notes" && (
            <Notes
              language={language}
              notes={notes}
              noteColumns={noteColumns}
              currentUserId={users.find((u) => u.username === profile.username)?.id ?? 0}
              users={users}
              onCreateNote={createNote}
              onUpdateNote={updateNote}
              onDeleteNote={(id) => setNoteDeleteId(id)}
              onArchiveNote={archiveNote}
              onMarkAllRead={markNotesRead}
            />
          )}
          {page === "comments" && <Comments language={language} records={records} onRead={refreshUnreadCommentsCount} />}
          {page === "activity" && <Activity language={language} />}
          {page === "archive" && (
            <Archive language={language} rows={archive} notes={notes} preparedReports={preparedReports} onUnarchiveNote={(id) => archiveNote(id, false)} />
          )}
          {page === "users" && (
            <Users
              language={language}
              users={users}
              setUsers={setUsers}
              currentUsername={profile.username}
              currentUserIsAdmin={profile.isAdmin}
              currentUserIsSuperAdmin={profile.isSuperAdmin}
              checkPassword={checkPassword}
              onlineUserIds={onlineUserIds}
              sections={sections}
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
              isSuperAdmin={profile.isSuperAdmin}
              sections={sections}
              onSectionsChanged={() => { refreshSections(); refreshCashAccounts(); refreshRecords(); }}
              noteColumns={noteColumns}
              onNoteColumnsChanged={refreshNoteColumns}
              exchangeRates={exchangeRates}
              onExchangeRatesChanged={setExchangeRates}
              usersPanel={
                <Users
                  language={language}
                  users={users}
                  setUsers={setUsers}
                  currentUsername={profile.username}
                  currentUserIsAdmin={profile.isAdmin}
                  currentUserIsSuperAdmin={profile.isSuperAdmin}
                  checkPassword={checkPassword}
                  onlineUserIds={onlineUserIds}
                  sections={sections}
                />
              }
            />
          )}
          {page === "guide" && <Guide language={language} />}
          {page === "lists" && <Lists language={language} onDataChanged={() => { refreshRecords(); refreshCashAccounts(); }} />}
        </section>
      </main>
      {modal && (
        <RecordModal
          language={language}
          kind={modal.kind}
          initial={modal.item}
          prefillCashAccount={modal.cashAccount}
          records={records}
          onCreateNote={createNote}
          onClose={() => setModal(null)}
          onSave={saveRecord}
          cashAccounts={cashAccounts}
          sections={sections}
          users={users}
          onTransfersChanged={refreshAfterCashTransfer}
        />
      )}
      {noteDeleteId !== null && (
        <DeleteConfirmModal
          language={language}
          itemLabel={notes.find((n) => n.id === noteDeleteId)?.title || tx(language, "Not", "Note", "Nîşe")}
          checkPassword={checkPassword}
          onClose={() => setNoteDeleteId(null)}
          onConfirm={(reason) => {
            const id = noteDeleteId;
            setNoteDeleteId(null);
            deleteNote(id, reason);
          }}
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

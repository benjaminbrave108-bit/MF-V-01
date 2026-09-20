"use client";

import { useEffect, useMemo, useState } from "react";
import { LanguageSetup, Login } from "./components/Login";
import { ProfileModal } from "./components/ProfileModal";
import { Dashboard } from "./components/Dashboard";
import { Records, RecordModal } from "./components/Records";
import { CashExpenseSheet } from "./components/CashExpenseSheet";
import { Archive } from "./components/Archive";
import { ReportBuilder } from "./components/ReportBuilder";
import { Notes } from "./components/Notes";
import { Comments } from "./components/Comments";
import { Users } from "./components/Users";
import { Settings } from "./components/Settings";
import { tx, localizedProfileName, localizedRole, kbGroupLogo, nav } from "./lib/i18n";
import { normalizeRecord } from "./lib/finance";
import { defaultTypography, typographyVariables } from "./lib/typography";
import { adminOnlyPages } from "./lib/types";
import type {
  ArchiveItem,
  CashAccountSummary,
  CashExpenseSheetRow,
  CashTransfer,
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
  const [recordsSearch, setRecordsSearch] = useState("");
  // Gelir/Gider sayfalarındaki "Kayıtlar" / "{Gelir|Gider} Çizelgesi" alt
  // sekmesi — sayfa değişince (Kasalar'a veya başka bir menüye geçince)
  // "Kayıtlar"a döner, aksi halde Gelir'de kalan sekim Gider'e taşınıp
  // kafa karıştırmasın.
  const [recordsPageTab, setRecordsPageTab] = useState<"records" | "sheet">("records");
  useEffect(() => {
    setRecordsPageTab("records");
  }, [page]);
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
  // Which "workspace" Kasa/Gelir/Gider/Ana Sayfa currently show: null is the
  // signed-in user's own data, otherwise the id of a user who shared kasas
  // with them (read-only — see the Ana Sayfa sidebar submenu below).
  const [viewingUserId, setViewingUserId] = useState<number | null>(null);
  // Distinguishes the "Ana Sayfa" top-level nav click (home — merges in every
  // opted-in shared kasa the super admin has selected via Görüntüle) from the
  // "Kendi Verilerim" submenu entry (own-only — same viewingUserId===null as
  // home, but should show ONLY the signed-in user's own data, not the merge).
  // Reset to false whenever leaving the own-only view.
  const [dashboardOwnOnly, setDashboardOwnOnly] = useState(false);
  // One entry per person (other than yourself) who owns at least one kasa
  // you can see — populates the "R Verileri" / "S Verileri" rows.
  const sharedOwners = useMemo(() => {
    const byId = new Map<number, string>();
    for (const a of cashAccounts) {
      if (!a.isOwner && a.ownerUserId != null) byId.set(a.ownerUserId, a.ownerName || "");
    }
    return [...byId.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [cashAccounts]);
  // Same as sharedOwners, but narrowed to owners who have opted at least one
  // kasa in for dashboard sharing (Kasalar/Ayarlar > Paylaş's "Süper Admin'in
  // Ana Sayfa'sında göster" toggle) — this is what powers the Ayarlar >
  // Görüntüle checkbox list, since checking a user there is meaningless
  // unless they've actually consented to be merged.
  const dashboardShareableOwners = useMemo(
    () => sharedOwners.filter((owner) => cashAccounts.some((a) => a.ownerUserId === owner.id && a.dashboardShareEnabled)),
    [sharedOwners, cashAccounts],
  );
  // Kasa ids that belong to whichever workspace is active — "own" means
  // owned by the signed-in user, otherwise owned by the selected user.
  const contextCashAccountIds = useMemo(() => {
    const ownerId = viewingUserId;
    return new Set(
      cashAccounts.filter((a) => (ownerId === null ? a.isOwner : a.ownerUserId === ownerId)).map((a) => a.id),
    );
  }, [cashAccounts, viewingUserId]);
  // Records scoped to the active workspace: a record with no kasa link at
  // all only ever belongs to your own workspace, never a shared one.
  const contextRecords = useMemo(
    () =>
      records.filter((x) =>
        x.cashAccountId === null || x.cashAccountId === undefined
          ? viewingUserId === null
          : contextCashAccountIds.has(x.cashAccountId),
      ),
    [records, contextCashAccountIds, viewingUserId],
  );
  const contextCashAccounts = useMemo(
    () => cashAccounts.filter((a) => contextCashAccountIds.has(a.id)),
    [cashAccounts, contextCashAccountIds],
  );
  // Ana Sayfa's own totals, separate from contextRecords above: a super
  // admin can opt (Ayarlar > Görüntüle) to merge specific other users'
  // kasas into their own home totals — Kasa/Gelir/Gider stay per-workspace
  // as usual, only the dashboard aggregate reflects this. Browsing someone
  // else's workspace (viewingUserId set) shows just that person, same as
  // everywhere else — the merge only ever applies to "my own" Ana Sayfa.
  const dashboardCashAccountIds = useMemo(() => {
    if (viewingUserId !== null || dashboardOwnOnly) return contextCashAccountIds;
    const included = new Set(profile.dashboardIncludedUserIds);
    return new Set(
      cashAccounts
        .filter(
          (a) =>
            a.isOwner || (a.ownerUserId != null && included.has(a.ownerUserId) && a.dashboardShareEnabled),
        )
        .map((a) => a.id),
    );
  }, [cashAccounts, viewingUserId, dashboardOwnOnly, contextCashAccountIds, profile.dashboardIncludedUserIds]);
  const dashboardRecords = useMemo(
    () =>
      records.filter((x) =>
        x.cashAccountId === null || x.cashAccountId === undefined
          ? viewingUserId === null
          : dashboardCashAccountIds.has(x.cashAccountId),
      ),
    [records, dashboardCashAccountIds, viewingUserId],
  );
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileModal, setProfileModal] = useState(false);
  const [preparedReports, setPreparedReports] = useState<PreparedReport[]>([]);
  const [cashExpenseSheets, setCashExpenseSheets] = useState<CashExpenseSheetRow[]>([]);
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
        if (Array.isArray(data.cashExpenseSheets)) setCashExpenseSheets(data.cashExpenseSheets);
        if (Array.isArray(data.users)) setUsers(data.users);
        refreshCashAccounts();
        refreshCashTransfers();
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
    // Every signed-in user may open Kullanıcılar to view/edit their own
    // account — Users.tsx itself limits a non-admin to just that.
    if (pageId === "users") return true;
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
  async function updateDashboardScope(includedUserIds: number[]) {
    const previous = profile.dashboardIncludedUserIds;
    setProfile((p) => ({ ...p, dashboardIncludedUserIds: includedUserIds }));
    try {
      const response = await fetch("/api/profile/dashboard-scope", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ includedUserIds }),
      });
      if (!response.ok) {
        setProfile((p) => ({ ...p, dashboardIncludedUserIds: previous }));
        alert(tx(language, "Görüntüle ayarı kaydedilemedi.", "The view setting could not be saved.", "Mîhenga dîtinê nehat tomarkirin."));
        return;
      }
      const data = await response.json();
      if (Array.isArray(data.dashboardIncludedUserIds)) {
        setProfile((p) => ({ ...p, dashboardIncludedUserIds: data.dashboardIncludedUserIds }));
      }
    } catch {
      setProfile((p) => ({ ...p, dashboardIncludedUserIds: previous }));
      alert(tx(language, "Görüntüle ayarı kaydedilemedi.", "The view setting could not be saved.", "Mîhenga dîtinê nehat tomarkirin."));
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

  const sheetSaveError = tx(language, "Çizelge kaydedilemedi.", "The sheet could not be saved.", "Çîzelge nehat tomarkirin.");
  async function createCashExpenseSheet(input: Omit<CashExpenseSheetRow, "id" | "code" | "createdAt" | "updatedAt">) {
    try {
      const response = await fetch("/api/cash-expense-sheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!response.ok) return alert(sheetSaveError);
      const data = await response.json();
      setCashExpenseSheets((current) => [data.cashExpenseSheet, ...current]);
    } catch {
      alert(sheetSaveError);
    }
  }
  async function updateCashExpenseSheet(row: CashExpenseSheetRow) {
    try {
      const response = await fetch(`/api/cash-expense-sheets/${row.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(row),
      });
      if (!response.ok) return alert(sheetSaveError);
      const data = await response.json();
      setCashExpenseSheets((current) => current.map((x) => (x.id === row.id ? data.cashExpenseSheet : x)));
    } catch {
      alert(sheetSaveError);
    }
  }
  async function deleteCashExpenseSheet(id: number) {
    try {
      const response = await fetch(`/api/cash-expense-sheets/${id}`, { method: "DELETE" });
      if (!response.ok) return alert(sheetSaveError);
      setCashExpenseSheets((current) => current.filter((x) => x.id !== id));
    } catch {
      alert(sheetSaveError);
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
                onClick={() => {
                  setPage(n.id);
                  if (n.id === "dashboard") {
                    setViewingUserId(null);
                    setDashboardOwnOnly(false);
                  }
                }}
              >
                <i>{n.icon}</i>
                <span>{n.label[language]}</span>
                {n.id === "comments" && unreadCommentsCount > 0 && (
                  <b className="navBadge">{unreadCommentsCount}</b>
                )}
              </button>
              {n.id === "dashboard" && sharedOwners.length > 0 && (
                <div className="navSubmenu">
                  <button
                    type="button"
                    className={viewingUserId === null && dashboardOwnOnly ? "active" : ""}
                    onClick={() => {
                      setViewingUserId(null);
                      setDashboardOwnOnly(true);
                      setPage("dashboard");
                    }}
                  >
                    <i>◎</i>
                    <span>{tx(language, "Kendi Verilerim", "My Own Data", "Daneyên Min ên Xwe")}</span>
                  </button>
                  {sharedOwners.map((owner) => (
                    <button
                      type="button"
                      key={owner.id}
                      className={viewingUserId === owner.id ? "active" : ""}
                      onClick={() => {
                        setViewingUserId(owner.id);
                        setDashboardOwnOnly(false);
                        setPage("dashboard");
                      }}
                    >
                      <i>◈</i>
                      <span>
                        {tx(language, `${owner.name} Verileri`, `${owner.name}'s Data`, `Daneyên ${owner.name}`)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
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
            <h1>
              {nav.find((n) => n.id === page)?.label[language]}
            </h1>
            {viewingUserId !== null &&
              ["dashboard", "cash", "income", "expense"].includes(page) &&
              (() => {
                const owner = sharedOwners.find((o) => o.id === viewingUserId);
                return owner ? (
                  <span className="workspaceBadge">
                    👁 {tx(language, `${owner.name} Verileri`, `${owner.name}'s Data`, `Daneyên ${owner.name}`)}
                  </span>
                ) : null;
              })()}
            {viewingUserId === null && dashboardOwnOnly && page === "dashboard" && (
              <span className="workspaceBadge">
                ◎ {tx(language, "Kendi Verilerim", "My Own Data", "Daneyên Min ên Xwe")}
              </span>
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
            <Dashboard records={dashboardRecords} language={language} goTo={setPage} />
          )}
          {(["cash", "income", "expense"] as Page[]).includes(page) && (
            <>
              {(page === "income" || page === "expense") && (
                <div className="settingsMainTabs recordsPageTabs" role="tablist">
                  <button type="button" role="tab" aria-selected={recordsPageTab === "records"} className={recordsPageTab === "records" ? "active" : ""} onClick={() => setRecordsPageTab("records")}>
                    {tx(language, "Kayıtlar", "Records", "Qeyd")}
                  </button>
                  <button type="button" role="tab" aria-selected={recordsPageTab === "sheet"} className={recordsPageTab === "sheet" ? "active" : ""} onClick={() => setRecordsPageTab("sheet")}>
                    {page === "income"
                      ? tx(language, "Gelir Çizelgesi", "Income Sheet", "Çîzelgeya Dahatê")
                      : tx(language, "Gider Çizelgesi", "Expense Sheet", "Çîzelgeya Mesrefê")}
                  </button>
                </div>
              )}
              {(page === "cash" || recordsPageTab === "records") && (
                <Records
                  language={language}
                  kind={page as Kind}
                  records={contextRecords.filter(
                    (x) =>
                      x.kind === page ||
                      (page === "income" && x.kind === "cash"),
                  )}
                  allRecords={contextRecords}
                  onAdd={() => setModal({ kind: page as Kind })}
                  onEdit={(item) => setModal({ kind: item.kind, item })}
                  onDelete={removeRecord}
                  onImport={importRecords}
                  checkPassword={checkPassword}
                  cashAccounts={contextCashAccounts}
                  users={users}
                  onCashAccountsChange={setCashAccounts}
                  search={recordsSearch}
                  setSearch={setRecordsSearch}
                  cashTransfers={cashTransfers}
                  onTransfersChanged={refreshAfterCashTransfer}
                  onCommentsRead={refreshUnreadCommentsCount}
                  readOnly={viewingUserId !== null}
                />
              )}
              {(page === "income" || page === "expense") && recordsPageTab === "sheet" && (
                <CashExpenseSheet
                  language={language}
                  kind={page}
                  records={contextRecords}
                  rows={cashExpenseSheets.filter((row) => row.kind === page)}
                  onCreate={(input) => createCashExpenseSheet({ ...input, kind: page })}
                  onUpdate={updateCashExpenseSheet}
                  onDelete={deleteCashExpenseSheet}
                  checkPassword={checkPassword}
                />
              )}
            </>
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
          {page === "comments" && <Comments language={language} onRead={refreshUnreadCommentsCount} />}
          {page === "archive" && <Archive language={language} rows={archive} notes={notes} preparedReports={preparedReports} />}
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
              sharedOwners={dashboardShareableOwners}
              dashboardIncludedUserIds={profile.dashboardIncludedUserIds}
              onDashboardIncludedUserIdsChange={updateDashboardScope}
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
          cashAccounts={cashAccounts}
          users={users}
          onTransfersChanged={refreshAfterCashTransfer}
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

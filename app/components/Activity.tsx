"use client";

import { useEffect, useState } from "react";
import { tx } from "../lib/i18n";
import type { Language } from "../lib/types";

type Entry = { id: number; at: string; userId: number | null; userName: string; category: string; action: string; summary: string; kasa: string; workspace: string };
type Result = { entries: Entry[]; counts: Record<string, number>; users: { id: number; name: string }[]; workspaces: string[] };

const CATEGORIES: { id: string; icon: string; color: string; bg: string; label: [string, string, string] }[] = [
  { id: "income", icon: "↗", color: "#0f6e56", bg: "#e3f5ee", label: ["Gelir", "Income", "Dahat"] },
  { id: "expense", icon: "↘", color: "#b4481f", bg: "#fdebe3", label: ["Gider", "Expense", "Mesref"] },
  { id: "cash", icon: "▣", color: "#264b83", bg: "#e4eefa", label: ["Kasa", "Cash account", "Qase"] },
  { id: "workspace", icon: "◆", color: "#6a43a8", bg: "#efe8fa", label: ["Çalışma alanı", "Workspace", "Qada xebatê"] },
  { id: "report", icon: "▥", color: "#214172", bg: "#e0e8f5", label: ["Excel / Rapor", "Excel / Report", "Excel / Raport"] },
  { id: "user", icon: "♙", color: "#5b6370", bg: "#eceef2", label: ["Kullanıcı / Yetki", "User / Access", "Bikarhêner / Destûr"] },
  { id: "note", icon: "✎", color: "#8a6a10", bg: "#fbf1d3", label: ["Not", "Note", "Nîşe"] },
  { id: "auth", icon: "⏻", color: "#5b6370", bg: "#eceef2", label: ["Giriş", "Sign-in", "Têketin"] },
];

const pad = (n: number) => String(n).padStart(2, "0");
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dayLabel = (d: Date) => `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;

export function Activity({ language }: { language: Language }) {
  const [data, setData] = useState<Result | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [workspace, setWorkspace] = useState("");
  const [userId, setUserId] = useState("");
  const [limit, setLimit] = useState("100");
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [error, setError] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setQ(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const params = new URLSearchParams({ limit });
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (workspace) params.set("workspace", workspace);
      if (userId) params.set("userId", userId);
      if (category) params.set("category", category);
      if (q) params.set("q", q);
      try {
        const response = await fetch(`/api/activity?${params.toString()}`);
        if (!response.ok) throw new Error();
        const next = (await response.json()) as Result;
        if (!cancelled) {
          setData(next);
          setError(false);
        }
      } catch {
        if (!cancelled) setError(true);
      }
    };
    load();
    const interval = setInterval(load, 10000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [from, to, workspace, userId, limit, category, q]);

  const total = data ? Object.values(data.counts).reduce((a, b) => a + b, 0) : 0;
  const todayKey = dayKey(new Date());
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const groups: { key: string; date: Date; items: Entry[] }[] = [];
  for (const entry of data?.entries ?? []) {
    const d = new Date(entry.at);
    const key = dayKey(d);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(entry);
    else groups.push({ key, date: d, items: [entry] });
  }
  const categoryOf = (id: string) => CATEGORIES.find((c) => c.id === id);

  return (
    <div className="panel activityPage">
      <div className="activityHead">
        <div>
          <h2>{tx(language, "Son işlemler", "Recent activity", "Çalakiyên dawî")}</h2>
          <p>
            {total} · {tx(language, "Sistemde yapılan her işlemin kaydı, yeniden eskiye", "A record of every action taken in the system, newest first", "Tomara her çalakiyê di pergalê de, ji nûtirîn ber bi kevntirîn")}
          </p>
        </div>
        <label className="activitySearch">
          <span>⌕</span>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={tx(language, "İşlem, kasa veya kullanıcı ara…", "Search action, cash account or user…", "Çalakî, qase an bikarhêner bigere…")} />
        </label>
      </div>

      <div className="activityFilters">
        <label>
          {tx(language, "Başlangıç tarihi", "Start date", "Dîroka destpêkê")}
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          {tx(language, "Bitiş tarihi", "End date", "Dîroka dawî")}
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <select value={workspace} onChange={(e) => setWorkspace(e.target.value)} aria-label={tx(language, "Çalışma alanı", "Workspace", "Qada xebatê")}>
          <option value="">{tx(language, "Tüm çalışma alanları", "All workspaces", "Hemû qadên xebatê")}</option>
          {(data?.workspaces ?? []).map((w) => (
            <option key={w} value={w}>{w}</option>
          ))}
        </select>
        <select value={userId} onChange={(e) => setUserId(e.target.value)} aria-label={tx(language, "Kullanıcı", "User", "Bikarhêner")}>
          <option value="">{tx(language, "Tüm kullanıcılar", "All users", "Hemû bikarhêner")}</option>
          {(data?.users ?? []).map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>
        <select value={limit} onChange={(e) => setLimit(e.target.value)} aria-label={tx(language, "Kayıt sayısı", "Number of records", "Hejmara tomaran")}>
          {["100", "250", "500", "1000"].map((n) => (
            <option key={n} value={n}>{n} {tx(language, "kayıt", "records", "tomar")}</option>
          ))}
        </select>
      </div>

      <div className="activityChips">
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`activityChip${category === c.id ? " active" : ""}`}
            style={{ color: c.color, background: c.bg, borderColor: category === c.id ? c.color : "transparent" }}
            onClick={() => setCategory(category === c.id ? "" : c.id)}
          >
            <span>{c.icon}</span> {tx(language, ...c.label)} <b>{data?.counts[c.id] ?? 0}</b>
          </button>
        ))}
      </div>

      {error && <small className="formWarning">{tx(language, "İşlemler yüklenemedi.", "Could not load activity.", "Çalakî nehatin barkirin.")}</small>}
      {data && groups.length === 0 && <small className="activityEmpty">{tx(language, "Bu filtrelere uyan işlem yok.", "No activity matches these filters.", "Çalakiyek bi van parzûnan re nayê.")}</small>}

      {groups.map((g) => (
        <section key={g.key} className="activityDay">
          <div className="activityDayHead">
            <strong>
              {g.key === todayKey ? tx(language, "Bugün", "Today", "Îro") : g.key === dayKey(yesterday) ? tx(language, "Dün", "Yesterday", "Duh") : ""}
            </strong>{" "}
            <span>{dayLabel(g.date)}</span>
            <em>{g.items.length}</em>
          </div>
          <ul>
            {g.items.map((e) => {
              const cat = categoryOf(e.category);
              return (
                <li key={e.id}>
                  <time>{`${pad(new Date(e.at).getHours())}:${pad(new Date(e.at).getMinutes())}`}</time>
                  <span className="activityBadge" style={{ color: cat?.color ?? "#5b6370", background: cat?.bg ?? "#eceef2" }}>
                    {cat?.icon ?? "•"} {cat ? tx(language, ...cat.label) : e.category}
                  </span>
                  <span className="activityText">
                    {e.summary}
                    {(e.kasa || e.workspace) && (
                      <small>
                        {e.kasa && <>▣ {e.kasa}</>} {e.workspace && <>· ◆ {e.workspace}</>}
                      </small>
                    )}
                  </span>
                  <span className="activityUser" title={e.userName}>
                    <b>{e.userName.slice(0, 1).toUpperCase()}</b> {e.userName}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

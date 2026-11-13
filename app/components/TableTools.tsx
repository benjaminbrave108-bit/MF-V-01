"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { tx } from "../lib/i18n";
import type { Language } from "../lib/types";

// Tablo araçları (her bölümdeki tablolara uygulanır):
// 1) Sütun genişliği: başlığın sağ kenarındaki tutamaçtan sürükleyerek daraltma/genişletme (çift tıklama sıfırlar,
//    ayar tarayıcıda hatırlanır).
// 2) Hücre hesabı (Excel gibi): hücrelere tıklayıp sürükleyerek (Ctrl ile tek tek, Shift ile aralık) seçin; seçilen
//    sayısal hücrelerin Toplam / Ortalama / Sayı / En az / En çok değerleri altta görünür.
// DOM üzerinde çalışır; böylece mevcut tabloların işaretlemesine dokunmadan her yere takılabilir.
type Stats = { count: number; cells: number; sums: Record<string, number>; min: number; max: number; avg: number };

const NUMERIC_SKIP = "button, a, input, select, textarea, label, [draggable='true'], .rowDragHandle, .noCalc";

function currencyOf(text: string): string {
  if (/\$|USD/i.test(text)) return "$";
  if (/€|EUR/i.test(text)) return "€";
  if (/₺|TRY|TL\b/i.test(text)) return "₺";
  if (/IQD/i.test(text)) return "IQD";
  if (/SYP|L\.S/i.test(text)) return "SYP";
  return "";
}

function parseCell(text: string): number | null {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return null;
  if (/^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/.test(t) || /^\d{4}[./-]\d{1,2}[./-]\d{1,2}$/.test(t)) return null; // tarih
  const core = t.replace(/[$€₺]|USD|EUR|TRY|TL|IQD|SYP|L\.S/gi, "").replace(/\s/g, "");
  if (!/^[-+−]?[\d.,]+$/.test(core)) return null;
  let s = core.replace("−", "-");
  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  if (lastDot !== -1 && lastComma !== -1) s = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else if (lastComma !== -1) s = /,\d{1,2}$/.test(s) ? s.replace(",", ".") : s.replace(/,/g, "");
  else if (lastDot !== -1 && /^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function cellText(td: HTMLElement): string {
  const input = td.querySelector("input");
  return input ? input.value : td.innerText;
}

function setupResize(container: HTMLElement, id: string): () => void {
  const storeKey = (ti: number) => `tbw:${id}:${ti}`;
  const tables = () => [...container.querySelectorAll("table")] as HTMLTableElement[];
  const ths = (table: HTMLTableElement) => [...table.querySelectorAll("thead th")] as HTMLElement[];

  function applyStored(table: HTMLTableElement, ti: number) {
    let saved: number[] | null = null;
    try {
      saved = JSON.parse(localStorage.getItem(storeKey(ti)) || "null");
    } catch {}
    const heads = ths(table);
    if (!saved || saved.length !== heads.length) return;
    table.style.tableLayout = "fixed";
    table.style.width = `${saved.reduce((a, b) => a + b, 0)}px`;
    heads.forEach((th, i) => (th.style.width = `${saved![i]}px`));
  }

  function decorate() {
    tables().forEach((table, ti) => {
      const heads = ths(table);
      if (!heads.length) return;
      if (!table.dataset.tbInit) {
        table.dataset.tbInit = "1";
        applyStored(table, ti);
      }
      heads.forEach((th) => {
        if (th.querySelector(":scope > .tbGrip")) return;
        const grip = document.createElement("i");
        grip.className = "tbGrip";
        grip.title = "↔";
        grip.addEventListener("mousedown", (e) => startDrag(e, table, ti, th));
        grip.addEventListener("dblclick", () => reset(table, ti));
        th.style.position = th.style.position || "relative";
        th.appendChild(grip);
      });
    });
  }

  function reset(table: HTMLTableElement, ti: number) {
    try {
      localStorage.removeItem(storeKey(ti));
    } catch {}
    table.style.tableLayout = "";
    table.style.width = "";
    ths(table).forEach((th) => (th.style.width = ""));
  }

  function startDrag(e: MouseEvent, table: HTMLTableElement, ti: number, th: HTMLElement) {
    e.preventDefault();
    e.stopPropagation();
    const heads = ths(table);
    const widths = heads.map((h) => Math.round(h.getBoundingClientRect().width));
    table.style.tableLayout = "fixed";
    heads.forEach((h, i) => (h.style.width = `${widths[i]}px`));
    table.style.width = `${widths.reduce((a, b) => a + b, 0)}px`;
    const index = heads.indexOf(th);
    const startX = e.clientX;
    const base = widths[index];
    document.body.classList.add("noSelectDragging");
    const onMove = (ev: MouseEvent) => {
      widths[index] = Math.min(700, Math.max(48, Math.round(base + ev.clientX - startX)));
      th.style.width = `${widths[index]}px`;
      table.style.width = `${widths.reduce((a, b) => a + b, 0)}px`;
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.classList.remove("noSelectDragging");
      try {
        localStorage.setItem(storeKey(ti), JSON.stringify(widths));
      } catch {}
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  decorate();
  const observer = new MutationObserver(() => decorate());
  observer.observe(container, { childList: true, subtree: true });
  return () => observer.disconnect();
}

// Hücre seçimi, aynı sayfadaki TÜM tablolar arasında ortaktır (ör. Kasa sayfasında Gelir tablosundan bir tutar,
// Gider tablosundan bir başkası Ctrl+tıkla ile birlikte seçilip tek toplamda görülebilir). Hesap çubuğu, en son
// etkileşilen tablonun altında görünür.
const calcShared = {
  selected: new Set<HTMLElement>(),
  anchor: null as { table: HTMLTableElement; row: number; col: number } | null,
  containers: new Map<HTMLElement, (s: Stats | null) => void>(),
  owner: null as HTMLElement | null,
};

function calcStats(): Stats | null {
  const values: { n: number; cur: string }[] = [];
  calcShared.selected.forEach((td) => {
    if (!td.isConnected) {
      calcShared.selected.delete(td);
      return;
    }
    // Alt alta dizilmiş para birimi hücrelerinde (MoneyStack) her satır ayrı sayı olarak hesaplanır.
    const lines = [...td.querySelectorAll<HTMLElement>(".msLine")];
    const texts = lines.length ? lines.map((l) => l.innerText) : [cellText(td)];
    for (const text of texts) {
      const n = parseCell(text);
      if (n !== null) values.push({ n, cur: currencyOf(text) });
    }
  });
  // Tek hücre seçiliyken çubuk açılmaz ama seçim korunur: kullanıcı Ctrl/Shift ile devam edebilir.
  if (calcShared.selected.size < 2) return null;
  const sums: Record<string, number> = {};
  for (const v of values) sums[v.cur] = Math.round(((sums[v.cur] ?? 0) + v.n) * 100) / 100;
  const nums = values.map((v) => v.n);
  return {
    cells: calcShared.selected.size,
    count: nums.length,
    sums,
    min: nums.length ? Math.min(...nums) : 0,
    max: nums.length ? Math.max(...nums) : 0,
    avg: nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0,
  };
}

function calcRefresh() {
  const stats = calcStats();
  calcShared.containers.forEach((report, c) => report(c === calcShared.owner ? stats : null));
}

function calcClearAll() {
  calcShared.selected.forEach((td) => td.removeAttribute("data-calc-sel"));
  calcShared.selected.clear();
  calcShared.anchor = null;
  calcShared.owner = null;
  calcShared.containers.forEach((report) => report(null));
}

function setupCalc(container: HTMLElement, report: (s: Stats | null) => void): () => void {
  const shared = calcShared;
  shared.containers.set(container, report);
  let dragging = false;

  function mark(td: HTMLElement, on: boolean) {
    if (on) {
      td.setAttribute("data-calc-sel", "1");
      shared.selected.add(td);
    } else {
      td.removeAttribute("data-calc-sel");
      shared.selected.delete(td);
    }
  }
  function cellFrom(target: EventTarget | null): HTMLTableCellElement | null {
    const td = (target as HTMLElement | null)?.closest?.("td") as HTMLTableCellElement | null;
    if (!td || !container.contains(td) || !td.closest("tbody") || td.colSpan > 1) return null;
    return td;
  }
  // Aralık seçimi: additive=false ise önceki seçim (tüm tablolardaki) silinip yalnızca aralık kalır.
  function selectRange(table: HTMLTableElement, r1: number, c1: number, r2: number, c2: number, keep: Set<HTMLElement> | null) {
    shared.selected.forEach((td) => td.removeAttribute("data-calc-sel"));
    shared.selected.clear();
    keep?.forEach((td) => mark(td, true));
    const [ra, rb] = [Math.min(r1, r2), Math.max(r1, r2)];
    const [ca, cb] = [Math.min(c1, c2), Math.max(c1, c2)];
    for (let r = ra; r <= rb; r++) {
      const row = table.rows[r];
      if (!row) continue;
      for (let c = ca; c <= cb; c++) {
        const td = row.cells[c];
        if (td && td.tagName === "TD" && td.colSpan <= 1) mark(td, true);
      }
    }
  }
  // Sürükleme/Shift aralığının başlangıçta korunan (Ctrl ile önceden seçilmiş) hücreleri.
  let keepBase: Set<HTMLElement> | null = null;

  const onDown = (e: MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest(NUMERIC_SKIP)) return;
    const td = cellFrom(target);
    if (!td) return;
    const table = td.closest("table") as HTMLTableElement;
    const row = (td.parentElement as HTMLTableRowElement).rowIndex;
    const col = td.cellIndex;
    const additive = e.ctrlKey || e.metaKey;
    // Ctrl/Shift+tıklamada tarayıcının kendi metin seçimi devreye girmesin.
    if (additive || e.shiftKey) e.preventDefault();
    shared.owner = container;
    if (additive) {
      mark(td, !shared.selected.has(td));
      shared.anchor = { table, row, col };
      keepBase = new Set(shared.selected);
      // Ctrl basılıyken fareyi sürüklemek de seçimi genişletir.
      dragging = shared.selected.has(td);
      if (dragging) document.body.classList.add("noSelectDragging");
      calcRefresh();
      return;
    }
    if (e.shiftKey && shared.anchor && shared.anchor.table === table) {
      selectRange(table, shared.anchor.row, shared.anchor.col, row, col, null);
      calcRefresh();
      return;
    }
    shared.anchor = { table, row, col };
    keepBase = null;
    dragging = true;
    selectRange(table, row, col, row, col, null);
    document.body.classList.add("noSelectDragging");
    calcRefresh();
  };
  const onMove = (e: MouseEvent) => {
    if (!dragging || !shared.anchor || shared.owner !== container) return;
    const td = cellFrom(document.elementFromPoint(e.clientX, e.clientY));
    if (!td || td.closest("table") !== shared.anchor.table) return;
    selectRange(shared.anchor.table, shared.anchor.row, shared.anchor.col, (td.parentElement as HTMLTableRowElement).rowIndex, td.cellIndex, keepBase);
    calcRefresh();
  };
  const onUp = () => {
    if (dragging) document.body.classList.remove("noSelectDragging");
    dragging = false;
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") calcClearAll();
  };
  const onOutside = (e: MouseEvent) => {
    const t = e.target as HTMLElement;
    const inAny = [...shared.containers.keys()].some((c) => c.contains(t));
    if (!inAny && !t.closest(".tableCalcBar")) calcClearAll();
  };

  container.addEventListener("mousedown", onDown);
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
  window.addEventListener("keydown", onKey);
  window.addEventListener("mousedown", onOutside);
  return () => {
    container.removeEventListener("mousedown", onDown);
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
    window.removeEventListener("keydown", onKey);
    window.removeEventListener("mousedown", onOutside);
    // Bu tablodaki hücreler DOM'dan gidiyor: ortak seçimden çıkar, diğer tabloların seçimi korunur.
    shared.selected.forEach((td) => { if (container.contains(td)) { td.removeAttribute("data-calc-sel"); shared.selected.delete(td); } });
    shared.containers.delete(container);
    if (shared.owner === container) shared.owner = null;
    calcRefresh();
  };
}

export function TableTools({
  id,
  language,
  className,
  resize = true,
  calc = true,
  children,
}: {
  id: string;
  language: Language;
  className?: string;
  resize?: boolean;
  calc?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const cleanups: (() => void)[] = [];
    if (resize) cleanups.push(setupResize(el, id));
    if (calc) cleanups.push(setupCalc(el, setStats));
    return () => cleanups.forEach((fn) => fn());
  }, [id, resize, calc]);

  const fmtNum = (n: number) => new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(n);
  const sumText = stats
    ? Object.entries(stats.sums)
        .map(([cur, v]) => (cur === "$" || cur === "€" || cur === "₺" ? `${cur}${fmtNum(v)}` : cur ? `${fmtNum(v)} ${cur}` : fmtNum(v)))
        .join(" + ") || "—"
    : "";
  return (
    <div ref={ref} className={className}>
      {children}
      {stats && (
        <div className="tableCalcBar" role="status">
          <span className="tcbLabel">{tx(language, "Seçili", "Selected", "Hilbijartî")}: {stats.cells}</span>
          <span><small>{tx(language, "Toplam", "Sum", "Giştî")}</small><b>{sumText}</b></span>
          <span><small>{tx(language, "Ortalama", "Average", "Navîn")}</small><b>{stats.count ? fmtNum(stats.avg) : "—"}</b></span>
          <span><small>{tx(language, "Sayı", "Count", "Hejmar")}</small><b>{stats.count}</b></span>
          <span><small>{tx(language, "En az", "Min", "Kêmtirîn")}</small><b>{stats.count ? fmtNum(stats.min) : "—"}</b></span>
          <span><small>{tx(language, "En çok", "Max", "Zêdetirîn")}</small><b>{stats.count ? fmtNum(stats.max) : "—"}</b></span>
          <button
            type="button"
            className="tcbClose"
            title="Esc"
            onClick={() => calcClearAll()}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

// Excel aktarım sihirbazının saf mantığı (arayüzden bağımsız): çalışma kitabını okur, sayfalardaki gelir/gider tablo
// bloklarını (Kürtçe başlıklar dahil) tahmin eder, satırları kayıtlara dönüştürür. Hiçbir şey kaydetmez.
export type Cell = string | number | Date | null;
export type SheetData = { name: string; hidden: boolean; rows: Cell[][]; usedRows: number };
export type FieldKey = "date" | "title" | "qty" | "unit" | "amount" | "amountSyp" | "currency" | "invoice" | "person" | "project" | "note";
export type BlockKind = "income" | "expense" | "ignore";
export type Block = {
  id: string;
  sheet: string;
  kind: BlockKind;
  headerRow: number;
  dataStart: number;
  colStart: number;
  colEnd: number;
  headers: string[];
  mapping: Partial<Record<FieldKey, number>>;
  reason: string;
  include: boolean;
};
export type ImportRecord = {
  kind: "income" | "expense";
  date: string;
  source: string;
  detail: string;
  note: string;
  person: string;
  amount: number;
  currency: string;
  project: string;
  detailTable: string[][];
  importKey: string;
};
export type BuildOptions = { defaultCurrency: string; projectFromSheet: boolean; groupInvoices: boolean; fixDates: boolean; kasaName: string };
export type BuildResult = { records: ImportRecord[]; rows: number; skipped: number; suspicious: number; totals: Record<string, number> };

export const FIELD_LABELS: Record<FieldKey, [string, string, string]> = {
  date: ["Tarih", "Date", "Dîrok"],
  title: ["Başlık / ürün", "Title / item", "Sernav / berhem"],
  qty: ["Miktar", "Quantity", "Hejmar"],
  unit: ["Birim fiyat", "Unit price", "Bihayê yekê"],
  amount: ["Tutar (USD/genel)", "Amount (USD/general)", "Mîqdar (USD/giştî)"],
  amountSyp: ["Tutar (SYP)", "Amount (SYP)", "Mîqdar (SYP)"],
  currency: ["Para birimi", "Currency", "Dirav"],
  invoice: ["Fatura no", "Invoice no", "Hejmara fatûreyê"],
  person: ["Kişi / müşteri", "Person / customer", "Kes / mişterî"],
  project: ["Proje", "Project", "Proje"],
  note: ["Not", "Note", "Nîşe"],
};

// Harfleri sadeleştirip büyük harfe çevirir: "NIRXÊ YEKÊ" → "NIRXE YEKE".
export function norm(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/ı/g, "i")
    .toUpperCase()
    .replace(/[^A-Z0-9$]+/g, " ")
    .trim();
}

function plain(v: unknown): Cell {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v === "number" || typeof v === "string") return v;
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  const o = v as { result?: unknown; richText?: { text: string }[]; text?: unknown; error?: unknown };
  if (o.error) return null;
  if (o.result !== undefined) return plain(o.result);
  if (o.richText) return o.richText.map((t) => t.text).join("");
  if (o.text !== undefined) return plain(o.text);
  return null;
}

export async function readWorkbook(file: File): Promise<SheetData[]> {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const sheets: SheetData[] = [];
  for (const ws of workbook.worksheets) {
    const maxCol = Math.min(ws.columnCount || 1, 64);
    const rows: Cell[][] = [];
    let used = 0;
    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      const cells: Cell[] = [];
      for (let c = 1; c <= maxCol; c++) cells.push(plain(row.getCell(c).value));
      if (cells.some((x) => x !== null && String(x).trim() !== "")) {
        rows[rowNumber - 1] = cells;
        used++;
      }
    });
    for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
    sheets.push({ name: ws.name, hidden: ws.state !== "visible", rows, usedRows: used });
  }
  return sheets;
}

type Guess = { field: FieldKey; flavor?: "usd" | "syp" | "cost" | "sale" } | null;
function guessField(header: string): Guess {
  const n = norm(header);
  if (!n) return null;
  if (/^(DIROK|TARIH|DATE)\b/.test(n)) return { field: "date" };
  if (/FATOR|FATURA|INVOICE/.test(n)) return { field: "invoice" };
  if (/^PROJE/.test(n)) return { field: "project" };
  if (/^(NOT|NOTE|TEBINI)\b|^TEBINI/.test(n)) return { field: "note" };
  if (/C PERA|PARA BIRIMI|CURRENCY|^DIRAV/.test(n)) return { field: "currency" };
  if (/KUDERE|^KIRIN$|WERSE|AJOVAN|XWEDANE|MUSTERI|^ALAV$|^KISI$/.test(n)) return { field: "person" };
  const flavor: "usd" | "syp" | undefined = /\bSURI\b|\bL S\b|\bLS\b|\bSYP\b|SYRIA/.test(n) ? "syp" : /DOLAR|\$|\bUSD\b/.test(n) ? "usd" : undefined;
  if (/NIRXE YEKE|^N YEKE|FIYETA|BIRIM FIYAT|UNIT/.test(n)) return { field: "unit", flavor: /KIRIN/.test(n) ? "cost" : /FIROTIN/.test(n) ? "sale" : flavor };
  if (/NIRXE GISTI|MIQDARE PERE|^PERE\b|TUTAR|AMOUNT/.test(n)) return { field: flavor === "syp" ? "amountSyp" : "amount", flavor };
  if (/^(MIQDAR|HEJMAR|QTY|QUANTITY)( |$)/.test(n)) return { field: "qty" };
  if (/^(MADE|NAV|NAVE MADE|MESRUF|JIBO|HATI DAYIN|CUREYA MADE|KALA|BERHEM|WERGIRTIN)\b/.test(n)) return { field: "title" };
  return null;
}

function cellText(c: Cell): string {
  if (c === null || c === undefined) return "";
  if (c instanceof Date) return Number.isNaN(c.getTime()) ? "" : c.toISOString().slice(0, 10);
  return String(c).replace(/\s+/g, " ").trim();
}

function toNumber(c: Cell): number | null {
  if (c === null || c === undefined || c === "") return null;
  if (typeof c === "number") return Number.isFinite(c) ? c : null;
  if (c instanceof Date) return null;
  const m = String(c).replace(/,/g, ".").match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

export function parseDate(c: Cell): string | null {
  if (c === null || c === undefined || c === "") return null;
  if (c instanceof Date) return Number.isNaN(c.getTime()) ? null : c.toISOString().slice(0, 10);
  if (typeof c === "number") {
    if (c > 20000 && c < 80000) return new Date(Math.round((c - 25569) * 86400000)).toISOString().slice(0, 10);
    return null;
  }
  const t = String(c).trim();
  let m = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

const dayDiff = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86400000;

// Aktarım için blok tahmini: her sayfada başlık satırı bulunur, yan yana tablolar boşluk sütunlarıyla ayrılır.
export function analyzeSheets(sheets: SheetData[]): { blocks: Block[]; summaries: { sheet: string; numbers: number[] }[] } {
  const blocks: Block[] = [];
  const summaries: { sheet: string; numbers: number[] }[] = [];
  for (const sheet of sheets) {
    const sheetNorm = norm(sheet.name);
    // Başlık satırı: en çok tanınan başlığı olan satır (ilk 45 satır).
    let best = -1;
    let bestScore = 0;
    for (let r = 0; r < Math.min(sheet.rows.length, 45); r++) {
      const row = sheet.rows[r] ?? [];
      const fields = new Set(row.map((c) => guessField(cellText(c))?.field).filter(Boolean));
      if (fields.size > bestScore) {
        bestScore = fields.size;
        best = r;
      }
    }
    if (/GISTI ENCAM|GISTI MEHA|^GISTI /.test(sheetNorm) && bestScore < 4) {
      const numbers: number[] = [];
      for (const row of sheet.rows) for (const c of row ?? []) if (typeof c === "number" && Math.abs(c) > 0) numbers.push(Math.round(c * 100) / 100);
      summaries.push({ sheet: sheet.name, numbers: [...new Set(numbers)].slice(0, 16) });
      continue;
    }
    if (best < 0 || bestScore < 3) {
      blocks.push({ id: `${sheet.name}#0`, sheet: sheet.name, kind: "ignore", headerRow: -1, dataStart: 0, colStart: 0, colEnd: 0, headers: [], mapping: {}, reason: "Tablo başlığı bulunamadı", include: false });
      continue;
    }
    const headerRow = sheet.rows[best] ?? [];
    // İkinci başlık satırı ($ / L.S alt başlıkları) varsa birleştir.
    const nextRow = sheet.rows[best + 1] ?? [];
    const hasSub = nextRow.some((c) => /^(\$|L\.?S|SYP|USD)$/i.test(cellText(c)));
    const merged: string[] = headerRow.map((c, i) => {
      const base = cellText(c);
      const sub = hasSub ? cellText(nextRow[i]) : "";
      return sub && /^(\$|L\.?S|SYP|USD)$/i.test(sub) && base ? `${base} ${sub}` : base;
    });
    // Yan yana tablolar: boş başlıklı sütunlarla ayrılan gruplar.
    const groups: [number, number][] = [];
    let start = -1;
    for (let c = 0; c <= merged.length; c++) {
      const filled = c < merged.length && merged[c] !== "";
      if (filled && start < 0) start = c;
      if (!filled && start >= 0) {
        groups.push([start, c - 1]);
        start = -1;
      }
    }
    let gi = 0;
    for (const [c1, c2] of groups) {
      const headers = merged.slice(c1, c2 + 1);
      const mapping: Partial<Record<FieldKey, number>> = {};
      const prefer: { unit?: number; unitScore: number } = { unitScore: -1 };
      const kindHint = guessKind(sheet, best, c1, c2, sheetNorm);
      headers.forEach((h, i) => {
        const g = guessField(h);
        if (!g) return;
        const col = c1 + i;
        if (g.field === "unit") {
          const score = kindHint === "income" ? (g.flavor === "sale" ? 2 : g.flavor === "cost" ? 0 : 1) : kindHint === "expense" ? (g.flavor === "cost" ? 2 : g.flavor === "sale" ? 0 : 1) : 1;
          if (score > prefer.unitScore) {
            prefer.unit = col;
            prefer.unitScore = score;
          }
          return;
        }
        if (g.field === "amount" && mapping.amount !== undefined && g.flavor !== "usd" && /NIRXE GISTI/.test(norm(h)) === false) return;
        if (mapping[g.field] === undefined) mapping[g.field] = col;
      });
      if (prefer.unit !== undefined) mapping.unit = prefer.unit;
      const hasMoney = mapping.amount !== undefined || mapping.amountSyp !== undefined;
      const hasTitle = mapping.title !== undefined || mapping.invoice !== undefined;
      const recognized = Object.keys(mapping).length;
      if (recognized < 3) continue;
      let kind: BlockKind = kindHint;
      let reason = kind === "ignore" ? "Tür belirlenemedi" : `Tür: ${kind === "income" ? "gelir" : "gider"} (sayfa/başlık adından)`;
      if (!hasMoney) {
        kind = "ignore";
        reason = "Tutar sütunu bulunamadı";
      } else if (!hasTitle) {
        kind = "ignore";
        reason = "Başlık/ürün sütunu bulunamadı";
      }
      blocks.push({
        id: `${sheet.name}#${gi++}`,
        sheet: sheet.name,
        kind,
        headerRow: best,
        dataStart: best + 1 + (hasSub ? 1 : 0),
        colStart: c1,
        colEnd: c2,
        headers,
        mapping,
        reason,
        include: kind !== "ignore" && !sheet.hidden,
      });
    }
  }
  return { blocks, summaries };
}

function guessKind(sheet: SheetData, headerRow: number, c1: number, c2: number, sheetNorm: string): BlockKind {
  // 1) Sayfa adı açıksa o belirler (ör. "MESRÛF", "M.HATÎ KIRÎN" = alım gideri, "MADEYÊN MAYÎ" = stok).
  if (/MAYI|STOK/.test(sheetNorm)) return "ignore";
  if (/MESRUF|KIRIN|XERC|EXPENSE/.test(sheetNorm)) return "expense";
  if (/FIROTIN|INCOME|GELIR/.test(sheetNorm)) return "income";
  // 2) Başlığın üstündeki bölüm başlıkları (ör. "GIŞTÎ HATINÎ YÊ ..." / "GIŞTÎ ÇÛYÎ MESRÛFA ...").
  let text = "";
  for (let r = Math.max(0, headerRow - 8); r < headerRow; r++) {
    for (let c = c1; c <= c2; c++) text += ` ${norm(cellText(sheet.rows[r]?.[c] ?? null))}`;
  }
  if (/CUYI|MESRUF|XERC/.test(text)) return "expense";
  if (/HATINI|HATINE|FIROTIN/.test(text)) return "income";
  if (/HATI/.test(sheetNorm)) return "income";
  return "ignore";
}

export function detectCurrency(text: string): string | null {
  const n = norm(text);
  if (!n) return null;
  if (/\bSYP\b|\bL S\b|\bLS\b|\bSURI\b|LIRA/.test(n)) return "SYP";
  if (/\bUSD\b|\$|DOLAR/.test(n)) return "USD";
  if (/\bIQD\b|DINAR/.test(n)) return "IQD";
  if (/\bTRY\b|\bTL\b/.test(n)) return "TRY";
  if (/\bEUR\b|EURO/.test(n)) return "EUR";
  return null;
}

type Row = { index: number; title: string; invoice: string; date: string | null; qty: number | null; unit: number | null; amount: number; currency: string; person: string; project: string; note: string };

export function buildRecords(sheet: SheetData, block: Block, options: BuildOptions): BuildResult {
  const m = block.mapping;
  const get = (row: Cell[], f: FieldKey) => (m[f] === undefined ? null : row[m[f]!] ?? null);
  const rows: Row[] = [];
  let skipped = 0;
  for (let r = block.dataStart; r < sheet.rows.length; r++) {
    const row = sheet.rows[r];
    if (!row || !row.some((c) => c !== null && String(c).trim() !== "")) continue;
    const title = cellText(get(row, "title"));
    const invoice = cellText(get(row, "invoice"));
    if (/^(GISTI|TOPLAM|TOTAL|SUM)( DIKE| TOPLAM)?$/.test(norm(title)) && !cellText(get(row, "date"))) {
      skipped++;
      continue;
    }
    const usd = toNumber(get(row, "amount"));
    const syp = toNumber(get(row, "amountSyp"));
    const qty = toNumber(get(row, "qty"));
    const unit = toNumber(get(row, "unit"));
    let amount = 0;
    let currency = "";
    if (usd !== null && usd > 0) {
      amount = usd;
      currency = "USD";
    } else if (syp !== null && syp > 0) {
      amount = syp;
      currency = "SYP";
    } else if (qty !== null && unit !== null && qty * unit > 0) {
      amount = qty * unit;
    }
    if (!(amount > 0) || (!title && !invoice)) {
      skipped++;
      continue;
    }
    const colCurrency = m.currency !== undefined ? detectCurrency(cellText(get(row, "currency"))) : null;
    currency = colCurrency ?? (currency && m.amountSyp !== undefined ? currency : currency || options.defaultCurrency);
    if (!currency) currency = options.defaultCurrency;
    rows.push({
      index: r,
      title,
      invoice,
      date: parseDate(get(row, "date")),
      qty,
      unit,
      amount: Math.round(amount * 100) / 100,
      currency,
      person: cellText(get(row, "person")),
      project: m.project !== undefined ? cellText(get(row, "project")) : "",
      note: cellText(get(row, "note")),
    });
  }

  // Ay/gün ters okunmuş tarihleri bul (komşu satırlara göre).
  let suspicious = 0;
  const fixed: (string | null)[] = rows.map((r) => r.date);
  rows.forEach((r, i) => {
    if (!r.date) return;
    const [y, mo, d] = r.date.split("-").map(Number);
    if (d > 12 || mo === d) return;
    const swapped = `${y}-${String(d).padStart(2, "0")}-${String(mo).padStart(2, "0")}`;
    const neigh = [rows[i - 2]?.date, rows[i - 1]?.date, rows[i + 1]?.date, rows[i + 2]?.date].filter((x): x is string => !!x);
    if (neigh.length < 2) return;
    const ref = [...neigh].sort()[Math.floor(neigh.length / 2)];
    if (dayDiff(r.date, ref) > 45 && dayDiff(swapped, ref) <= 31) {
      suspicious++;
      if (options.fixDates) fixed[i] = swapped;
    }
  });
  rows.forEach((r, i) => (r.date = fixed[i]));

  const today = new Date().toISOString().slice(0, 10);
  const kind = block.kind === "income" ? "income" : "expense";
  const recordsOut: ImportRecord[] = [];
  const sheetProject = options.projectFromSheet ? sheet.name.trim() : "";
  const detailHeader = ["Ürün", "Adet", "Birim fiyat", "Tutar"];
  const fmt = (n: number | null) => (n === null ? "" : String(Math.round(n * 100) / 100));
  const detailRow = (r: Row) => [r.title.slice(0, 480), fmt(r.qty), fmt(r.unit), fmt(r.amount)];
  const baseKey = `${options.kasaName}|${sheet.name}|${kind}`;

  const single = (r: Row) => {
    const withDetail = r.qty !== null && r.qty > 1 && r.unit !== null && r.unit > 0;
    recordsOut.push({
      kind,
      date: r.date ?? today,
      source: (r.title || `Fatura ${r.invoice}`).slice(0, 200),
      detail: r.invoice ? `Fatura ${r.invoice}` : "",
      note: r.note.slice(0, 2000),
      person: r.person.slice(0, 200),
      amount: r.amount,
      currency: r.currency,
      project: (r.project || sheetProject).slice(0, 200),
      detailTable: withDetail ? [detailHeader, detailRow(r)] : [],
      importKey: `${baseKey}|r${r.index}|${r.amount}|${r.date ?? ""}`.slice(0, 240),
    });
  };

  if (!options.groupInvoices) {
    rows.forEach(single);
  } else {
    const groups = new Map<string, Row[]>();
    const order: string[] = [];
    for (const r of rows) {
      if (!r.invoice) {
        single(r);
        continue;
      }
      const key = `${r.invoice}|${r.currency}`;
      if (!groups.has(key)) {
        groups.set(key, []);
        order.push(key);
      }
      groups.get(key)!.push(r);
    }
    for (const key of order) {
      const g = groups.get(key)!;
      if (g.length === 1) {
        single(g[0]);
        continue;
      }
      if (g.length > 499) {
        g.forEach(single);
        continue;
      }
      const dates = g.map((x) => x.date).filter((x): x is string => !!x).sort();
      const titles = [...new Set(g.map((x) => x.title).filter(Boolean))];
      const persons = [...new Set(g.map((x) => x.person).filter(Boolean))];
      const notes = [...new Set(g.map((x) => x.note).filter(Boolean))];
      const projects = [...new Set(g.map((x) => x.project).filter(Boolean))];
      recordsOut.push({
        kind,
        date: dates[0] ?? today,
        source: (titles.length === 1 ? titles[0] : `Fatura ${g[0].invoice}`).slice(0, 200),
        detail: `Fatura ${g[0].invoice} · ${g.length} kalem`,
        note: notes.join(" · ").slice(0, 2000),
        person: persons.join(", ").slice(0, 200),
        amount: Math.round(g.reduce((a, x) => a + x.amount, 0) * 100) / 100,
        currency: g[0].currency,
        project: (projects[0] || sheetProject).slice(0, 200),
        detailTable: [detailHeader, ...g.map(detailRow)],
        importKey: `${baseKey}|inv${g[0].invoice}|${g[0].currency}`.slice(0, 240),
      });
    }
  }

  const totals: Record<string, number> = {};
  for (const r of rows) totals[r.currency] = Math.round(((totals[r.currency] ?? 0) + r.amount) * 100) / 100;
  return { records: recordsOut, rows: rows.length, skipped, suspicious, totals };
}

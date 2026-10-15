"use client";

import { useMemo, useState } from "react";
import { money } from "../lib/finance";
import { tx } from "../lib/i18n";
import type { Language } from "../lib/types";
import {
  analyzeSheets,
  buildRecords,
  FIELD_LABELS,
  readWorkbook,
  type Block,
  type BlockKind,
  type BuildOptions,
  type FieldKey,
  type ImportRecord,
  type SheetData,
} from "../lib/excelImport";

// "Excel'den Kasa Aktar" sihirbazı: dosya → kasa → sayfalar/sütunlar → önizleme → aktar. Dosya tarayıcıda okunur;
// onaydan önce hiçbir şey kaydedilmez. Aktarım bir numara taşır ve tek tıkla geri alınabilir.
const CURRENCIES = ["USD", "SYP", "IQD", "TRY", "EUR"];
const FIELD_ORDER: FieldKey[] = ["date", "title", "qty", "unit", "amount", "amountSyp", "currency", "invoice", "person", "project", "note"];

export function ExcelImportModal({
  language,
  kasaOptions,
  onClose,
  onDone,
}: {
  language: Language;
  kasaOptions: string[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [fileName, setFileName] = useState("");
  const [sheets, setSheets] = useState<SheetData[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [summaries, setSummaries] = useState<{ sheet: string; numbers: number[] }[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [kasaChoice, setKasaChoice] = useState<string>("");
  const [newKasa, setNewKasa] = useState("");
  const [listKasa, setListKasa] = useState(false);
  const [rjKasa, setRjKasa] = useState(false);
  const [groupInvoices, setGroupInvoices] = useState(true);
  const [projectFromSheet, setProjectFromSheet] = useState(true);
  const [fixDates, setFixDates] = useState(true);
  const [defaultCurrency, setDefaultCurrency] = useState("USD");
  const [openBlock, setOpenBlock] = useState<string | null>(null);
  const [result, setResult] = useState<{ inserted: number; skipped: number; batchId: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [undone, setUndone] = useState(false);

  const kasaName = (kasaChoice === "__new" ? newKasa : kasaChoice).trim();
  const options: BuildOptions = { defaultCurrency, projectFromSheet, groupInvoices, fixDates, kasaName };

  const built = useMemo(() => {
    const out = new Map<string, ReturnType<typeof buildRecords>>();
    for (const b of blocks) {
      if (b.kind === "ignore" || !b.include) continue;
      const sheet = sheets.find((s) => s.name === b.sheet);
      if (sheet) out.set(b.id, buildRecords(sheet, b, options));
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks, sheets, defaultCurrency, projectFromSheet, groupInvoices, fixDates, kasaName]);

  const allRecords: ImportRecord[] = useMemo(() => [...built.values()].flatMap((b) => b.records), [built]);
  const totalsBy = (kind: "income" | "expense") => {
    const t: Record<string, number> = {};
    for (const r of allRecords) if (r.kind === kind) t[r.currency] = Math.round(((t[r.currency] ?? 0) + r.amount) * 100) / 100;
    return t;
  };
  const fmt = (t: Record<string, number>) => {
    const parts = Object.entries(t).map(([cur, v]) => money(v, cur));
    return parts.length ? parts.join(" + ") : "—";
  };

  async function pickFile(file: File | undefined) {
    if (!file) return;
    setError("");
    setLoading(true);
    try {
      const data = await readWorkbook(file);
      const analysis = analyzeSheets(data);
      setSheets(data);
      setBlocks(analysis.blocks);
      setSummaries(analysis.summaries);
      setFileName(file.name);
      if (!kasaChoice && !newKasa) setNewKasa(file.name.replace(/\.xlsx$/i, "").replace(/[‎‏]/g, "").trim());
      if (!kasaChoice) setKasaChoice("__new");
    } catch {
      setError(tx(language, "Dosya okunamadı. Geçerli bir .xlsx dosyası seçin.", "Could not read the file. Choose a valid .xlsx file.", "Pel nehat xwendin. Pelekî .xlsx yê derbasdar hilbijêrin."));
    }
    setLoading(false);
  }

  const updateBlock = (id: string, patch: Partial<Block>) => setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  const setMapping = (block: Block, field: FieldKey, value: string) => {
    const mapping = { ...block.mapping };
    if (value === "") delete mapping[field];
    else mapping[field] = Number(value);
    updateBlock(block.id, { mapping });
  };

  async function runImport() {
    if (!kasaName) return;
    setBusy(true);
    setError("");
    const batchId = `xl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    let inserted = 0;
    let skipped = 0;
    try {
      for (let i = 0; i < allRecords.length; i += 150) {
        const chunk = allRecords.slice(i, i + 150);
        const response = await fetch("/api/records/import-excel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ batchId, kasaName, listKasa, rjKasa, items: chunk }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);
        inserted += data.inserted ?? 0;
        skipped += data.skipped ?? 0;
      }
      setResult({ inserted, skipped, batchId });
      setStep(4);
      onDone();
    } catch (e) {
      setError(`${tx(language, "Aktarım yarıda kaldı", "Import stopped midway", "Barkirin nîvco ma")}: ${(e as Error).message}. ${inserted ? tx(language, "Şu ana kadar eklenenleri 'Geri al' ile silebilirsiniz.", "You can remove what was added so far with 'Undo'.", "Hûn dikarin tiştên heta niha hatine zêdekirin bi 'Vegerîne' jê bibin.") : ""}`);
      if (inserted) setResult({ inserted, skipped, batchId });
    }
    setBusy(false);
  }

  async function undo() {
    if (!result) return;
    setBusy(true);
    const response = await fetch(`/api/records/import-excel?batchId=${encodeURIComponent(result.batchId)}`, { method: "DELETE" });
    setBusy(false);
    if (response.ok) {
      setUndone(true);
      onDone();
    } else alert(tx(language, "Geri alınamadı.", "Could not undo.", "Nehat vegerandin."));
  }

  const kindLabel = (k: BlockKind) => (k === "income" ? tx(language, "Gelir", "Income", "Dahat") : k === "expense" ? tx(language, "Gider", "Expense", "Mesref") : tx(language, "Yok say", "Ignore", "Paşguh bike"));
  const includedBlocks = blocks.filter((b) => b.include && b.kind !== "ignore");
  const suspiciousTotal = [...built.values()].reduce((a, b) => a + b.suspicious, 0);
  const canNext2 = !!kasaName && sheets.length > 0;

  return (
    <div className="overlay">
      <div className="modal xiModal" onClick={(e) => e.stopPropagation()}>
        <div className="modalHead">
          <div>
            <h2>{tx(language, "Excel'den Kasa Aktar", "Import a Cash Account from Excel", "Qaseyekê ji Excelê Têxe")}</h2>
            <p>
              {step === 1 && tx(language, "1/3 · Dosya ve kasa", "1/3 · File and cash account", "1/3 · Pel û qase")}
              {step === 2 && tx(language, "2/3 · Sayfalar ve sütunlar", "2/3 · Sheets and columns", "2/3 · Rûpel û stûn")}
              {step === 3 && tx(language, "3/3 · Önizleme ve aktarım", "3/3 · Preview and import", "3/3 · Pêşdîtin û barkirin")}
              {step === 4 && tx(language, "Aktarım tamamlandı", "Import finished", "Barkirin qediya")}
              {fileName && ` · ${fileName}`}
            </p>
          </div>
          <button type="button" onClick={onClose}>×</button>
        </div>

        {error && <p className="listsError">{error}</p>}

        {step === 1 && (
          <div className="formGrid">
            <label className="wide">
              {tx(language, "Excel dosyası (.xlsx)", "Excel file (.xlsx)", "Pela Excel (.xlsx)")}
              <input type="file" accept=".xlsx" onChange={(e) => pickFile(e.target.files?.[0])} />
            </label>
            {loading && <p className="listsHint wide">…</p>}
            {sheets.length > 0 && (
              <p className="listsHint wide">
                {sheets.length} {tx(language, "sayfa okundu", "sheets read", "rûpel hatin xwendin")}: {sheets.map((s) => `${s.name.trim()}${s.hidden ? " (gizli)" : ""}`).join(" · ")}
              </p>
            )}
            <label>
              {tx(language, "Hedef kasa", "Target cash account", "Qaseya armanc")}
              <select value={kasaChoice} onChange={(e) => setKasaChoice(e.target.value)}>
                <option value="">{tx(language, "Seçin", "Select", "Hilbijêre")}</option>
                <option value="__new">＋ {tx(language, "Yeni kasa", "New cash account", "Qaseya nû")}</option>
                {kasaOptions.map((k) => (<option key={k} value={k}>{k}</option>))}
              </select>
            </label>
            {kasaChoice === "__new" && (
              <label>
                {tx(language, "Yeni kasa adı", "New cash account name", "Navê qaseya nû")}
                <input value={newKasa} maxLength={200} onChange={(e) => setNewKasa(e.target.value)} />
              </label>
            )}
            <label>
              {tx(language, "Varsayılan para birimi", "Default currency", "Dîrava bingehîn")}
              <select value={defaultCurrency} onChange={(e) => setDefaultCurrency(e.target.value)}>
                {CURRENCIES.map((c) => (<option key={c}>{c}</option>))}
              </select>
            </label>
            <div className="wide xiOptions">
              <label className="checkField"><input type="checkbox" checked={listKasa} onChange={(e) => setListKasa(e.target.checked)} /> {tx(language, "Bu kasa bir Liste Kasasıdır (Listeler'de çalışma alanı olsun)", "This is a List cash account (make it a workspace on Lists)", "Ev qaseyek Lîsteyê ye (li Lîste bibe qada xebatê)")}</label>
              <label className="checkField"><input type="checkbox" checked={rjKasa} onChange={(e) => setRjKasa(e.target.checked)} /> {tx(language, "Bu kasa bir RJ-Kasasıdır (Kasalar sayfasında “RJ-Kasaları” bölümünde görünsün)", "This is an RJ cash account (show under “RJ Cash Accounts” on Kasalar)", "Ev qaseyek RJ ye (li Qase di “Qaseyên RJ” de xuya bibe)")}</label>
              <label className="checkField"><input type="checkbox" checked={groupInvoices} onChange={(e) => setGroupInvoices(e.target.checked)} /> {tx(language, "Aynı fatura numaralı satırları tek kayıtta topla (ürün satırları Detay tablosuna girer)", "Combine rows with the same invoice number into one record (items go to the Detail table)", "Rêzên bi heman hejmara fatûreyê di yek qeydê de bicivîne (berhem diçin tabloya Hûrgulî)")}</label>
              <label className="checkField"><input type="checkbox" checked={projectFromSheet} onChange={(e) => setProjectFromSheet(e.target.checked)} /> {tx(language, "Sayfa adını “Proje” olarak yaz (alt birimler/bölgeler için)", "Use the sheet name as “Project” (for sub-units/regions)", "Navê rûpelê wekî “Proje” binivîse (ji bo binbirim/herêman)")}</label>
              <label className="checkField"><input type="checkbox" checked={fixDates} onChange={(e) => setFixDates(e.target.checked)} /> {tx(language, "Ay/gün ters okunmuş şüpheli tarihleri düzelt", "Fix suspicious day/month-swapped dates", "Dîrokên bi guman ên roj/meh berevajî bi cih bike")}</label>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="xiBlocks">
            {summaries.map((s) => (
              <p key={s.sheet} className="listsHint">
                📋 {tx(language, "Özet sayfası", "Summary sheet", "Rûpela kurte")} “{s.sheet.trim()}” — {tx(language, "dosyadaki sayılar (kontrol için)", "numbers in the file (for checking)", "hejmarên di pelê de (ji bo kontrolê)")}: {s.numbers.join(" · ")}
              </p>
            ))}
            {blocks.map((b) => {
              const r = built.get(b.id);
              return (
                <div key={b.id} className={`xiBlock${b.include && b.kind !== "ignore" ? "" : " off"}`}>
                  <div className="xiBlockHead">
                    <label className="checkField">
                      <input type="checkbox" checked={b.include && b.kind !== "ignore"} disabled={b.kind === "ignore"} onChange={(e) => updateBlock(b.id, { include: e.target.checked })} />
                      <strong>{b.sheet.trim()}</strong>
                      {sheets.find((s) => s.name === b.sheet)?.hidden && <em className="xiTag">{tx(language, "gizli", "hidden", "veşartî")}</em>}
                    </label>
                    <select
                      value={b.kind}
                      onChange={(e) => updateBlock(b.id, { kind: e.target.value as BlockKind, include: e.target.value !== "ignore" })}
                      aria-label="kind"
                    >
                      {(["income", "expense", "ignore"] as BlockKind[]).map((k) => (<option key={k} value={k}>{kindLabel(k)}</option>))}
                    </select>
                    <small className="listMuted">{b.reason}</small>
                    {r && (
                      <small className="xiStats">
                        {r.rows} {tx(language, "satır", "rows", "rêz")} → {r.records.length} {tx(language, "kayıt", "records", "qeyd")} · {fmt(r.totals)}
                        {r.suspicious > 0 && ` · ⚠ ${r.suspicious} ${tx(language, "şüpheli tarih", "suspicious dates", "dîrokên bi guman")}`}
                      </small>
                    )}
                    {b.headers.length > 0 && (
                      <button type="button" className="light compact" onClick={() => setOpenBlock(openBlock === b.id ? null : b.id)}>
                        {openBlock === b.id ? "▾" : "▸"} {tx(language, "Sütunlar", "Columns", "Stûn")}
                      </button>
                    )}
                  </div>
                  {openBlock === b.id && (
                    <div className="xiMapping">
                      {FIELD_ORDER.map((f) => (
                        <label key={f}>
                          <span>{tx(language, FIELD_LABELS[f][0], FIELD_LABELS[f][1], FIELD_LABELS[f][2])}</span>
                          <select value={b.mapping[f] === undefined ? "" : String(b.mapping[f])} onChange={(e) => setMapping(b, f, e.target.value)}>
                            <option value="">—</option>
                            {b.headers.map((h, i) => (<option key={i} value={b.colStart + i}>{h}</option>))}
                          </select>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {step === 3 && (
          <div>
            <div className="listMetrics">
              <div><small>{tx(language, "Hedef kasa", "Target cash account", "Qaseya armanc")}</small><b>{kasaName}</b></div>
              <div><small>{tx(language, "Aktarılacak kayıt", "Records to import", "Qeyd ji bo barkirinê")}</small><b>{allRecords.length}</b></div>
              <div className="metricBlue"><small>{tx(language, "Gelir", "Income", "Dahat")}</small><b>{fmt(totalsBy("income"))}</b></div>
              <div><small>{tx(language, "Gider", "Expense", "Mesref")}</small><b>{fmt(totalsBy("expense"))}</b></div>
            </div>
            {suspiciousTotal > 0 && (
              <p className="listsHint">
                ⚠ {suspiciousTotal} {fixDates ? tx(language, "şüpheli tarih düzeltilecek (ay/gün ters).", "suspicious dates will be fixed (day/month swapped).", "dîrokên bi guman dê werin rastkirin (roj/meh berevajî).") : tx(language, "şüpheli tarih var; düzeltme kapalı.", "suspicious dates exist; fixing is off.", "dîrokên bi guman hene; rastkirin girtî ye.")}
              </p>
            )}
            <p className="listsHint">{tx(language, "İlk 10 kayıt:", "First 10 records:", "10 qeydên pêşîn:")}</p>
            <div className="listMatrixScroll">
              <table className="listTable">
                <thead><tr><th>{tx(language, "Tür", "Type", "Cure")}</th><th>{tx(language, "Tarih", "Date", "Dîrok")}</th><th>{tx(language, "Başlık", "Title", "Sernav")}</th><th>{tx(language, "Kişi", "Person", "Kes")}</th><th>{tx(language, "Proje", "Project", "Proje")}</th><th className="r">{tx(language, "Tutar", "Amount", "Mîqdar")}</th></tr></thead>
                <tbody>
                  {allRecords.slice(0, 10).map((r, i) => (
                    <tr key={i}>
                      <td>{r.kind === "income" ? kindLabel("income") : kindLabel("expense")}</td>
                      <td>{r.date}</td>
                      <td>{r.source}{r.detailTable.length > 1 && <em className="xiTag">▦ {r.detailTable.length - 1}</em>}</td>
                      <td>{r.person || "—"}</td>
                      <td>{r.project || "—"}</td>
                      <td className="r">{money(r.amount, r.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="listsHint">
              {tx(language, "Aynı dosya tekrar yüklenirse daha önce aktarılan satırlar atlanır. Aktarım numarasıyla tümü geri alınabilir.", "If the same file is uploaded again, rows already imported are skipped. The whole import can be undone.", "Heke heman pel dîsa were barkirin, rêzên berê hatine barkirin têne bihurandin. Hemû barkirin dikare were vegerandin.")}
            </p>
          </div>
        )}

        {step === 4 && result && (
          <div>
            <div className="listMetrics">
              <div className="metricBlue"><small>{tx(language, "Eklenen kayıt", "Records added", "Qeyd hatin zêdekirin")}</small><b>{undone ? 0 : result.inserted}</b></div>
              <div><small>{tx(language, "Atlanan (zaten vardı)", "Skipped (already existed)", "Hatin bihurandin (berê hebûn)")}</small><b>{result.skipped}</b></div>
            </div>
            <p className="listsHint">
              {undone
                ? tx(language, "Aktarım geri alındı.", "The import was undone.", "Barkirin hate vegerandin.")
                : tx(language, `Kayıtlar “${kasaName}” kasasına eklendi. Kasalar, Gelir ve Gider sayfalarında görebilirsiniz.`, `Records were added to “${kasaName}”. See them on the Kasalar, Income and Expense pages.`, `Qeyd li qaseya “${kasaName}” hatin zêdekirin. Hûn dikarin li rûpelên Qase, Dahat û Mesref bibînin.`)}
            </p>
          </div>
        )}

        <div className="modalActions">
          {step === 1 && <button type="button" className="light" onClick={onClose}>{tx(language, "Vazgeç", "Cancel", "Betal")}</button>}
          {step === 2 && <button type="button" className="light" onClick={() => setStep(1)}>← {tx(language, "Geri", "Back", "Paş")}</button>}
          {step === 3 && <button type="button" className="light" onClick={() => setStep(2)} disabled={busy}>← {tx(language, "Geri", "Back", "Paş")}</button>}
          {step === 1 && <button type="button" className="primary" disabled={!canNext2} onClick={() => setStep(2)}>{tx(language, "İleri", "Next", "Pêş")} →</button>}
          {step === 2 && <button type="button" className="primary" disabled={includedBlocks.length === 0} onClick={() => setStep(3)}>{tx(language, "Önizle", "Preview", "Pêşdîtin")} →</button>}
          {step === 3 && (
            <button type="button" className="primary" disabled={busy || allRecords.length === 0 || !kasaName} onClick={runImport}>
              {busy ? "…" : `⇧ ${tx(language, "Aktar", "Import", "Bar bike")} (${allRecords.length})`}
            </button>
          )}
          {step === 4 && !undone && <button type="button" className="light danger" disabled={busy} onClick={undo}>↶ {tx(language, "Geri al", "Undo", "Vegerîne")}</button>}
          {step === 4 && <button type="button" className="primary" onClick={onClose}>{tx(language, "Kapat", "Close", "Bigire")}</button>}
        </div>
      </div>
    </div>
  );
}

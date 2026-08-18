"use client";

import { useMemo, useState } from "react";
import ExcelJS from "exceljs";
import { Title, ConfirmModal, DeleteConfirmModal } from "./shared";
import { tx, localizeData, noteRelationLabel } from "../lib/i18n";
import { combineByCurrency, date, money, moneyBreakdown, normalizeRecord, parseImportDate, total } from "../lib/finance";
import type { FinanceNote, Kind, Language, NoteRelation, NoteStatus, RecordItem } from "../lib/types";

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

export function Records({
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
        const directRows = records.filter((x) => x.source === name);
        const linkedIncomeRows =
          kind === "cash"
            ? allRecords.filter((x) => x.kind === "income" && x.cashAccount === name)
            : [];
        const linkedExpenseRows =
          kind === "cash"
            ? allRecords.filter((x) => x.kind === "expense" && x.cashAccount === name)
            : [];
        const directAmount = total(directRows);
        const linkedIncome = total(linkedIncomeRows);
        const linkedExpense = total(linkedExpenseRows);
        return {
          name,
          kind: records.find((x) => x.source === name)?.kind ?? kind,
          count: records.filter((x) => x.source === name).length,
          totalIn: directAmount + linkedIncome,
          totalOut: linkedExpense,
          total: directAmount + linkedIncome - linkedExpense,
          totalInByCurrency: combineByCurrency([{ rows: directRows }, { rows: linkedIncomeRows }]),
          totalOutByCurrency: combineByCurrency([{ rows: linkedExpenseRows }]),
          totalByCurrency: combineByCurrency([
            { rows: directRows },
            { rows: linkedIncomeRows },
            { rows: linkedExpenseRows, sign: -1 },
          ]),
        };
      }),
    [records, allRecords, kind],
  );
  const visibleGroups = groups.slice(0, 4);
  const overflowGroups = groups.slice(4);
  // Overall pill total, computed per currency directly from the record
  // arrays (not by summing groups' already-blended totals) so mixed
  // currencies show as separate amounts instead of one wrong number.
  const overallByCurrency = useMemo(
    () =>
      combineByCurrency([
        { rows: records },
        { rows: kind === "cash" ? allRecords.filter((x) => x.kind === "income" && x.cashAccount) : [] },
        { rows: kind === "cash" ? allRecords.filter((x) => x.kind === "expense" && x.cashAccount) : [], sign: -1 },
      ]),
    [records, allRecords, kind],
  );
  const listedRecords = records.filter((x) => x.listName);
  const listGroups = useMemo(
    () =>
      [...new Set(records.map((x) => x.listName).filter(Boolean))].map(
        (name) => {
          const directRows = records.filter((x) => x.listName === name);
          const linkedIncomeRows =
            kind === "cash"
              ? allRecords.filter((x) => x.kind === "income" && x.listName === name)
              : [];
          const linkedExpenseRows =
            kind === "cash"
              ? allRecords.filter((x) => x.kind === "expense" && x.listName === name)
              : [];
          const directAmount = total(directRows);
          const linkedIncome = total(linkedIncomeRows);
          const linkedExpense = total(linkedExpenseRows);
          return {
            name,
            count: records.filter((x) => x.listName === name).length,
            totalIn: directAmount + linkedIncome,
            totalOut: linkedExpense,
            total: directAmount + linkedIncome - linkedExpense,
            totalInByCurrency: combineByCurrency([{ rows: directRows }, { rows: linkedIncomeRows }]),
            totalOutByCurrency: combineByCurrency([{ rows: linkedExpenseRows }]),
            totalByCurrency: combineByCurrency([
              { rows: directRows },
              { rows: linkedIncomeRows },
              { rows: linkedExpenseRows, sign: -1 },
            ]),
          };
        },
      ),
    [records, allRecords, kind],
  );
  const visibleListGroups = listGroups.slice(0, 4);
  const overflowListGroups = listGroups.slice(4);
  const overallListByCurrency = useMemo(
    () =>
      combineByCurrency([
        { rows: listedRecords },
        { rows: kind === "cash" ? allRecords.filter((x) => x.kind === "income" && x.listName) : [] },
        { rows: kind === "cash" ? allRecords.filter((x) => x.kind === "expense" && x.listName) : [], sign: -1 },
      ]),
    [listedRecords, allRecords, kind],
  );
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
      const raw: { rowNumber: number; row: Record<string, unknown> }[] = [];
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
        raw.push({ rowNumber, row: record });
      });
      const invalidDateRows: number[] = [];
      const imported = raw
        .map(({ rowNumber, row }): (Omit<RecordItem, "id"> & { rowNumber: number }) | null => {
          const values = Object.values(row);
          const get = (...names: string[]) => {
            for (const name of names)
              if (row[name] !== undefined && row[name] !== "") return row[name];
            return "";
          };
          const excelDate = get("Tarih", "Date", "Tarîx");
          // Import is the one place a bad date shouldn't silently become
          // "today" — that would misfile a transaction under the wrong day
          // without anyone noticing. Reject the row instead.
          const parsedDate = parseImportDate(excelDate || values[0]);
          if (!parsedDate) {
            invalidDateRows.push(rowNumber);
            return null;
          }
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
            rowNumber,
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
        .filter((x): x is Omit<RecordItem, "id"> & { rowNumber: number } => x !== null && Boolean(x.source) && Number.isFinite(x.amount))
        .map(({ rowNumber: _rowNumber, ...record }) => record);
      if (!imported.length && !invalidDateRows.length) throw new Error();

      const duplicateCount = imported.filter((x) =>
        records.some((existing) => existing.date === x.date && existing.amount === x.amount && existing.currency === x.currency && existing.source === x.source),
      ).length;
      if (duplicateCount > 0) {
        const proceed = window.confirm(
          tx(
            language,
            `İçe aktarılacak ${imported.length} kayıttan ${duplicateCount} tanesi mevcut kayıtlarla aynı tarih, tutar ve başlığa sahip. Yine de içe aktarmak istiyor musunuz?`,
            `${duplicateCount} of the ${imported.length} rows to import match an existing record's date, amount and title. Import anyway?`,
            `${duplicateCount} ji ${imported.length} rêzên ku dê werin têxistin, bi heman tarîx, meblağ û sernavê qeydek heyî re li hev in. Dîsa jî têxistin?`,
          ),
        );
        if (!proceed) return;
      }

      if (imported.length) onImport(imported);
      const skippedNote = invalidDateRows.length
        ? tx(
            language,
            ` (${invalidDateRows.length} satır geçersiz tarih nedeniyle atlandı: satır ${invalidDateRows.join(", ")})`,
            ` (${invalidDateRows.length} row(s) skipped for invalid dates: row ${invalidDateRows.join(", ")})`,
            ` (${invalidDateRows.length} rêz ji ber tarîxa nederbasdar hatin derbasqilkirin: rêz ${invalidDateRows.join(", ")})`,
          )
        : "";
      alert(
        tx(
          language,
          `${imported.length} kayıt Excel'den eklendi.${skippedNote}`,
          `${imported.length} records imported from Excel.${skippedNote}`,
          `${imported.length} qeyd ji Excelê hatin têxistin.${skippedNote}`,
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
            {moneyBreakdown(overallByCurrency)}
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
              <strong>{moneyBreakdown(g.totalByCurrency)}</strong>
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
                    <strong>{moneyBreakdown(g.totalInByCurrency)}</strong>
                  </div>
                  <div>
                    <small>{tx(language, "Gider", "Expense", "Mesref")}</small>
                    <strong className="negative">{moneyBreakdown(g.totalOutByCurrency)}</strong>
                  </div>
                  <div>
                    <small>{tx(language, "Sonuç", "Result", "Encam")}</small>
                    <strong>{moneyBreakdown(g.totalByCurrency)}</strong>
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
                      {moneyBreakdown(g.totalByCurrency)}
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
                  {localizeData(g.name, language)} · {moneyBreakdown(g.totalByCurrency)}
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
              {moneyBreakdown(overallListByCurrency)}
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
                <strong>{moneyBreakdown(g.totalByCurrency)}</strong>
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
                    <strong>{moneyBreakdown(g.totalInByCurrency)}</strong>
                  </div>
                  <div>
                    <small>{tx(language, "Gider", "Expense", "Mesref")}</small>
                    <strong className="negative">{moneyBreakdown(g.totalOutByCurrency)}</strong>
                  </div>
                  <div>
                    <small>{tx(language, "Sonuç", "Result", "Encam")}</small>
                    <strong>{moneyBreakdown(g.totalByCurrency)}</strong>
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
                    {localizeData(g.name, language)} · {moneyBreakdown(g.totalByCurrency)}
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
                <td className="amount">{money(x.amount, x.currency)}</td>
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
                  <strong>{kind === "income" ? "+" : "−"}{money(x.amount, x.currency)}</strong>
                </article>
              ))}
            </div>
          </aside>
        )}
      </div>
      {deleteTarget && (
        <DeleteConfirmModal
          language={language}
          itemLabel={`${localizeData(deleteTarget.source, language)} · ${money(deleteTarget.amount, deleteTarget.currency)}`}
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

export function RecordModal({
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
  // Always seed the form with the raw stored values, never the display-only
  // Kurdish demo translations — otherwise saving without touching a field
  // (or picking a translated autocomplete suggestion below) would write the
  // translated string back to the database, breaking cashAccount name
  // matching and silently corrupting data across languages.
  const [form, setForm] = useState<Omit<RecordItem, "id">>(base);
  const previous = (field: "source" | "person" | "project" | "listName") => [
    ...new Set(
      records
        .filter((x) => field !== "source" || x.kind === kind)
        .map((x) => x[field])
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
                      {money(x.amount, x.currency)}
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
            `Aynı tarih ve tutarla benzer bir kayıt bulundu (${form.date} · ${money(form.amount, form.currency)}). Bu kaydı yine de eklemek istediğinizden emin misiniz?`,
            `A similar record exists with the same date and amount (${form.date} · ${money(form.amount, form.currency)}). Save anyway?`,
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

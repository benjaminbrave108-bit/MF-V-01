"use client";

import { useState } from "react";
import { Title } from "./shared";
import { tx, localizeData, kindName } from "../lib/i18n";
import { date, money } from "../lib/finance";
import type { ArchiveItem, FinanceNote, Language, PreparedReport } from "../lib/types";

// Silinenler/Düzenlenenler alt-başlıklarının ikisi de aynı kolonları
// kullanıyor — tek yerden render edip iki kez çağırıyoruz.
function ArchiveRecordsTable({ language, rows }: { language: Language; rows: ArchiveItem[] }) {
  return (
    <div className="recordsTable">
      <table>
        <thead>
          <tr>
            <th>{tx(language, "İşlem Tarihi", "Action Date", "Tarîxa Çalakiyê")}</th>
            <th>{tx(language, "Kayıt Yılı", "Record Year", "Sala Qeydê")}</th>
            <th>{tx(language, "Bölüm", "Section", "Beş")}</th>
            <th>{tx(language, "İşlem", "Action", "Çalakî")}</th>
            <th>{tx(language, "Eski Başlık", "Previous Category", "Sernavê Berê")}</th>
            <th>{tx(language, "Birim / Kasa", "Unit / Cash", "Yekîne / Qase")}</th>
            <th>{tx(language, "Eski Tutar", "Previous Amount", "Meblağa Berê")}</th>
            <th>{tx(language, "Kullanıcı", "User", "Bikarhêner")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((x) => (
            <tr key={x.id}>
              <td>
                {new Date(x.at).toLocaleString(language === "ku" ? "ku-TR" : language === "en" ? "en-GB" : "tr-TR")}
              </td>
              <td>{x.old.date.slice(0, 4)}</td>
              <td>{kindName(x.old.kind, language)}</td>
              <td>
                <span className={`action ${x.action === "Silindi" ? "red" : ""}`}>
                  {x.action === "Silindi"
                    ? tx(language, "Silindi", "Deleted", "Hat jêbirin")
                    : tx(language, "Düzenlendi", "Edited", "Hat guherandin")}
                </span>
              </td>
              <td>
                <b>{localizeData(x.old.source, language)}</b>
              </td>
              <td>{localizeData(x.old.kind === "cash" ? x.old.source : x.old.project, language)}</td>
              <td className="amount">{money(x.old.amount)}</td>
              <td>{localizeData(x.user, language)}</td>
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td colSpan={8} className="empty">
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

export function Archive({
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
    [kind, setKind] = useState("Tümü");
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
      (kind === "Tümü" || x.old.kind === kind),
  );
  // Silinenler/Düzenlenenler kendi başlıkları altında ayrı ayrı, varsayılan
  // olarak kapalı gruplanır — İşlem filtresi artık gereksiz, kategori onun
  // yerini alıyor.
  const deletedRows = filtered.filter((x) => x.action === "Silindi");
  const editedRows = filtered.filter((x) => x.action === "Düzenlendi");
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
            "Kasa kayıtları, hazırlanan raporlar ve eski notlar tek yerde düzenli biçimde saklanır",
            "Cash records, prepared reports and older notes are organized in one place",
            "Qeydên qase, raporên amadekirî û nîşeyên kevn li cîhekî bi rêkûpêk tên parastin",
          )}
        />
      </div>

      <div className="filters archiveFilters archiveFiltersStandalone">
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
      </div>

      <details className="archiveAccordion" open>
        <summary>
          <span><b>▣</b><strong>{tx(language, "Kasa Arşivi", "Cash Archive", "Arşîva Qase")}</strong></span>
          <em>{rows.length} {tx(language, "kayıt", "records", "qeyd")}</em>
        </summary>
        <div className="archiveAccordionBody">
          <p className="archiveDescription">{tx(language, "Düzenlenen veya silinen kasa ve mali kayıtların önceki halleri", "Previous versions of edited or deleted cash and finance records", "Guhertoyên berê yên qeydên qase û darayî")}</p>

      <details className="archiveAccordion archiveSubAccordion">
        <summary>
          <span><b>🗑</b><strong>{tx(language, "Silinenler", "Deleted", "Hatine Jêbirin")}</strong></span>
          <em>{deletedRows.length} {tx(language, "kayıt", "records", "qeyd")}</em>
        </summary>
        <div className="archiveAccordionBody">
          <ArchiveRecordsTable language={language} rows={deletedRows} />
        </div>
      </details>

      <details className="archiveAccordion archiveSubAccordion">
        <summary>
          <span><b>✎</b><strong>{tx(language, "Düzenlenenler", "Edited", "Hatine Guherandin")}</strong></span>
          <em>{editedRows.length} {tx(language, "kayıt", "records", "qeyd")}</em>
        </summary>
        <div className="archiveAccordionBody">
          <ArchiveRecordsTable language={language} rows={editedRows} />
        </div>
      </details>
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

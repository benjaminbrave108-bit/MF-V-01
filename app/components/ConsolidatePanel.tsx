"use client";

import { useEffect, useState } from "react";
import { money } from "../lib/finance";
import { tx } from "../lib/i18n";
import type { Language } from "../lib/types";

type Batch = { batchId: string; kasa: string; income: number; expense: number; months: string[] };
type Group = { key: string; kasa: string; kind: "income" | "expense"; month: string; currency: string; amount: number; sourceCount: number; detailRows: number; skipped: boolean };

// Önceki Excel aktarımlarını aylık tek kalem hâline getirir: önce "Önizle" (hiçbir şey değişmez), sonra "Aylığa topla".
export function ConsolidatePanel({ language, onDone }: { language: Language; onDone: () => void }) {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [preview, setPreview] = useState<Group[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const load = () =>
    fetch("/api/records/consolidate")
      .then((r) => (r.ok ? r.json() : { batches: [] }))
      .then((d: { batches: Batch[] }) => setBatches(d.batches));
  useEffect(() => {
    load();
  }, []);

  async function run(batchId: string, dryRun: boolean) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/records/consolidate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ batchId, dryRun }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(data?.error || `HTTP ${response.status}`);
        return;
      }
      setPreview(data.groups as Group[]);
      setOpen(batchId);
      if (!dryRun) {
        setMessage(tx(language, `${data.created} aylık kayıt oluşturuldu, ${data.removed} satır Arşiv'e alındı.`, `${data.created} monthly records created, ${data.removed} rows moved to the Archive.`, `${data.created} qeydên mehane hatin çêkirin, ${data.removed} rêz çûn Arşîvê.`));
        setOpen(null);
        await load();
        onDone();
      }
    } finally {
      setBusy(false);
    }
  }

  if (batches.length === 0) return null;
  return (
    <section className="consolidatePanel">
      <h3>{tx(language, "Önceki yüklemeleri aylığa topla", "Consolidate earlier uploads into monthly items", "Barkirinên berê bike mehane")}</h3>
      <p className="listsHint">
        {tx(
          language,
          "Eskiden satır satır yüklenen Excel'ler her ay için tek gelir/gider kalemi olur; satırların hepsi o kalemin Detay'ında durur. Önce Önizle ile sonucu görün; eski satırlar silinmez, Arşiv'e alınır.",
          "Excel files uploaded row by row earlier become one income/expense item per month; every row stays in that item's Detail. Preview first; old rows are not lost, they go to the Archive.",
          "Excelên berê rêz bi rêz hatine barkirin ji bo her mehê dibin yek kalem; hemû rêz di Hûrguliyê de dimînin. Pêşî Pêşdîtin bike; rêzên kevn naçin, diçin Arşîvê.",
        )}
      </p>
      {message && <p className="listsHint">{message}</p>}
      <table className="listTable">
        <thead>
          <tr>
            <th>{tx(language, "Kasa", "Cash account", "Qase")}</th>
            <th>{tx(language, "Aktarım", "Upload", "Barkirin")}</th>
            <th>{tx(language, "Gelir satırı", "Income rows", "Rêzên dahatê")}</th>
            <th>{tx(language, "Gider satırı", "Expense rows", "Rêzên mesrefê")}</th>
            <th>{tx(language, "Aylar", "Months", "Meh")}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {batches.map((b) => (
            <tr key={b.batchId}>
              <td>{b.kasa}</td>
              <td><small>{b.batchId}</small></td>
              <td>{b.income}</td>
              <td>{b.expense}</td>
              <td>{b.months.join(", ")}</td>
              <td>
                <button type="button" className="light compact" disabled={busy} onClick={() => run(b.batchId, true)}>{tx(language, "Önizle", "Preview", "Pêşdîtin")}</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {open && preview.length > 0 && (
        <div className="consolidatePreview">
          <h4>{open}</h4>
          <table className="listTable">
            <thead>
              <tr>
                <th>{tx(language, "Ay", "Month", "Meh")}</th>
                <th>{tx(language, "Tür", "Type", "Cure")}</th>
                <th>{tx(language, "Kasa", "Cash account", "Qase")}</th>
                <th>{tx(language, "Satır", "Rows", "Rêz")}</th>
                <th className="r">{tx(language, "Aylık tutar", "Monthly amount", "Mîqdara mehane")}</th>
                <th>{tx(language, "Durum", "Status", "Rewş")}</th>
              </tr>
            </thead>
            <tbody>
              {preview.map((g) => (
                <tr key={g.key}>
                  <td>{g.month}</td>
                  <td>{g.kind === "income" ? tx(language, "Gelir", "Income", "Dahat") : tx(language, "Gider", "Expense", "Mesref")}</td>
                  <td>{g.kasa}</td>
                  <td>{g.sourceCount}</td>
                  <td className="r">{money(g.amount, g.currency)}</td>
                  <td>{g.skipped ? tx(language, "Çok satır: olduğu gibi kalır", "Too many rows: left as is", "Gelek rêz: wekî xwe dimîne") : tx(language, "Aylığa toplanacak", "Will be consolidated", "Dê bê berhevkirin")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" className="primary" disabled={busy} onClick={() => run(open, false)}>
            {tx(language, "Aylığa topla", "Consolidate", "Bike mehane")}
          </button>
        </div>
      )}
    </section>
  );
}

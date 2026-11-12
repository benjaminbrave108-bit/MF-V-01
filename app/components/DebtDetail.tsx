"use client";

import { TableTools } from "./TableTools";
import { Fragment, useMemo, useState } from "react";
import { Title } from "./shared";
import { localizeData, tx } from "../lib/i18n";
import { date, money } from "../lib/finance";
import { debtPairs } from "../lib/debts";
import type { Language, RecordItem } from "../lib/types";

// Borç Detay: Gider eklerken "borç" işaretiyle oluşan borçların kasa çiftlerine göre özeti. Ödemeler Gider eklerken
// "Borç ödemesi" işaretiyle yapılır; burası yalnızca okunur bir dökümdür.
export function DebtDetail({ records, language }: { records: RecordItem[]; language: Language }) {
  const pairs = useMemo(() => debtPairs(records), [records]);
  const [showClosed, setShowClosed] = useState(false);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const shown = pairs.filter((p) => showClosed || p.outstanding > 0.004);
  const totals = useMemo(() => {
    const out: Record<string, number> = {};
    for (const p of pairs) if (p.outstanding > 0.004) out[p.currency] = (out[p.currency] ?? 0) + p.outstanding;
    return out;
  }, [pairs]);

  const roleLabel = (r?: string) =>
    r === "lent" ? tx(language, "Borç verildi", "Lent", "Deyn hat dayîn")
    : r === "borrowed" ? tx(language, "Borç alındı", "Borrowed", "Deyn hat girtin")
    : tx(language, "Borç ödemesi", "Repayment", "Dravdana deynê");

  return (
    <div className="panel debtDetail">
      <Title
        title={tx(language, "Borç Detay", "Debt Details", "Hûrguliyên Deynê")}
        sub={tx(language, "Gider eklerken “Borç” işaretiyle verilen borçlar ve yapılan ödemeler.", "Debts lent and repayments made via the “Debt” option when adding an expense.", "Deynên bi vebijêrka “Deyn” li dema zêdekirina mesrefê hatine dayîn û dravdanan.")}
      />
      <div className="debtSummary">
        <div>
          <small>{tx(language, "Toplam kalan borç", "Total outstanding debt", "Giştî deynê mayî")}</small>
          <b>{Object.keys(totals).length ? Object.entries(totals).map(([c, v]) => money(v, c)).join(" · ") : "—"}</b>
        </div>
        <label className="checkField"><input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} />{tx(language, "Kapanan borçları göster", "Show closed debts", "Deynên girtî nîşan bide")}</label>
      </div>
      {shown.length === 0 && <p className="debtEmpty">{tx(language, "Açık borç yok. Bir kasadan Gider eklerken “Borç” seçeneğini işaretleyerek borç verebilirsiniz.", "No open debts. Tick “Debt” when adding an expense from a kasa to lend money.", "Deynê vekirî tune. Dema mesrefê zêde dikî “Deyn” hilbijêre.")}</p>}
      {shown.length > 0 && (
        <TableTools id="debt-detail" language={language} className="debtTableWrap" resize={false}>
          <table className="lpTable debtTable">
            <thead>
              <tr>
                <th>{tx(language, "Tarih", "Date", "Dîrok")}</th>
                <th>{tx(language, "Borcu Alan Kasa", "Borrowing kasa", "Qaseya deyndar")}</th>
                <th>{tx(language, "Borcun Alındığı / Ödeneceği Kasa", "Lending / repay-to kasa", "Qaseya deyndêr")}</th>
                <th className="num">{tx(language, "Alınan Borç", "Borrowed", "Deynê hatî girtin")}</th>
                <th className="num">{tx(language, "Ödenen", "Repaid", "Hatî dayîn")}</th>
                <th className="num">{tx(language, "Kalan", "Remaining", "Mayî")}</th>
                <th>{tx(language, "Son Ödeme", "Last payment", "Dravdana dawî")}</th>
                <th>{tx(language, "Durum", "Status", "Rewş")}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => {
                const open = p.outstanding > 0.004;
                const dates = p.movements.map((x) => x.date).sort();
                const lastRepay = p.movements.filter((x) => x.debtRole === "repay").map((x) => x.date).sort().pop();
                const pct = p.borrowed > 0 ? Math.min(100, Math.round((p.repaid / p.borrowed) * 100)) : 0;
                return (
                  <Fragment key={p.key}>
                    <tr className="debtRow" onClick={() => setOpenKey(openKey === p.key ? null : p.key)}>
                      <td>{dates[0] ? date(dates[0], language) : "—"}</td>
                      <td><b>{localizeData(p.debtorName || "—", language)}</b></td>
                      <td>{localizeData(p.creditorName || "—", language)}</td>
                      <td className="num">{money(p.borrowed, p.currency)}</td>
                      <td className="num positive">{money(p.repaid, p.currency)}</td>
                      <td className={`num${open ? " negative" : ""}`}>{money(p.outstanding, p.currency)}</td>
                      <td>{lastRepay ? date(lastRepay, language) : "—"}</td>
                      <td>
                        <span className={`lpBadge ${open ? "warn" : "ok"}`}>{open ? `${tx(language, "Açık", "Open", "Vekirî")} · %${pct}` : tx(language, "Kapandı", "Closed", "Girtî")}</span>
                      </td>
                    </tr>
                    {openKey === p.key && (
                      <tr className="debtMoveRow">
                        <td colSpan={8}>
                          <table className="debtMoves">
                            <thead>
                              <tr>
                                <th>{tx(language, "Tarih", "Date", "Dîrok")}</th>
                                <th>{tx(language, "İşlem", "Type", "Cure")}</th>
                                <th>{tx(language, "Kasa", "Kasa", "Qase")}</th>
                                <th>{tx(language, "Açıklama", "Description", "Ravekirin")}</th>
                                <th className="num">{tx(language, "Tutar", "Amount", "Mîqdar")}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {p.movements.map((x) => (
                                <tr key={x.id}>
                                  <td>{date(x.date, language)}</td>
                                  <td>{roleLabel(x.debtRole)}</td>
                                  <td>{localizeData(x.cashAccount, language)}</td>
                                  <td>{x.detail || x.source || "—"}</td>
                                  <td className="num">{money(x.amount, x.currency)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </TableTools>
      )}
    </div>
  );
}

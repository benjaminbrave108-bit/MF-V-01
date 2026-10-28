import type { Language } from "./types";

// Excel'den gelen Kürtçe (Kurmancî) ve Arapça tanımlar için sözlük. Veri olduğu gibi saklanır; ekranda arayüz diline göre
// çevrilir (Türkçe → tr, İngilizce → en, Kürtçe → ku). Kürtçe kaynak metin Kürtçe arayüzde olduğu gibi kalır.
// Yer adları, kişi adları ve markalar çevrilmez. Sözlükte olmayan kelime olduğu gibi gösterilir.
// Girdi: [kaynak ifade, Türkçe, İngilizce, Kürtçe (yoksa kaynak korunur)]. Eşleşme büyük/küçük harf ve aksan duyarsızdır;
// çok kelimeli ifadeler tek kelimelerden önce eşleşir.
type Entry = [src: string, tr: string, en: string, ku?: string];

const ENTRIES: Entry[] = [
  // --- başlıklar / sütunlar ---
  ["giştî encam", "Genel Sonuç", "Overall Result"],
  ["encamê giştî", "Genel Sonuç", "Overall Result"],
  ["giştî meha", "Aylık Toplam", "Monthly Total"],
  ["giştî hatinî", "Toplam Gelir", "Total Income"],
  ["giştî çûyî", "Toplam Gider", "Total Expense"],
  ["giştî fayîde", "Toplam Kâr", "Total Profit"],
  ["giştî miqdarê mêga", "Toplam Mega Miktarı", "Total Mega Quantity"],
  ["giştî çûyî mesrûfa", "Toplam Gider", "Total Expense"],
  ["çûyî mesrûfa", "Gider", "Expense"],
  ["çûyî mesrûf", "Gider", "Expense"],
  ["madeyên hatî firotin", "Satılan Malzemeler", "Sold Materials"],
  ["madeyên hatî kirîn", "Satın Alınan Malzemeler", "Purchased Materials"],
  ["madeyên hatî kirin", "Satın Alınan Malzemeler", "Purchased Materials"],
  ["giştî", "Toplam", "Total"],
  ["encam", "Sonuç", "Result"],
  ["encamê", "Sonuç", "Result"],
  ["fayîde", "Kâr", "Profit"],
  ["fayide", "Kâr", "Profit"],
  ["hatinî", "Gelir", "Income"],
  ["hatini", "Gelir", "Income"],
  ["wergirtin", "Tahsilat", "Receipt"],
  ["çûyî", "Gider", "Expense"],
  ["mesrûfa", "Giderleri", "Expenses"],
  ["mesrûf", "Gider", "Expense"],
  ["mesrûfê", "Gider", "Expense"],
  ["hatî dayin", "Ödenen", "Paid"],
  ["hatî firotin", "Satılan", "Sold"],
  ["hatî kirîn", "Satın Alınan", "Purchased"],
  ["hatî kirin", "Satın Alınan", "Purchased"],
  ["firotin", "Satış", "Sale"],
  ["kirîn", "Alış", "Purchase"],
  ["madeyên mayî", "Kalan Malzemeler", "Remaining Materials"],
  ["madeyên", "Malzemeler", "Materials"],
  ["mayî", "Kalan", "Remaining"],
  ["cûreya madê", "Malzeme Türü", "Material Type"],
  ["pereyên dolar", "Dolar", "Dollar"],
  ["pereyên sûrî", "Suriye Lirası", "Syrian Pound"],
  ["miqdarê pere", "Para Miktarı", "Amount of Money"],
  ["miqdarê mêga", "Mega Miktarı", "Mega Quantity"],
  ["miqdar mêga", "Mega Miktarı", "Mega Quantity"],
  ["fiyeta mêga", "Mega Fiyatı", "Mega Price"],
  ["fiyeta mêgê", "Mega Fiyatı", "Mega Price"],
  ["pere dolar", "Dolar", "Dollar"],
  ["pere sûrî", "Suriye Lirası", "Syrian Pound"],
  ["sûrî", "Suriye Lirası", "Syrian Pound"],
  ["suri", "Suriye Lirası", "Syrian Pound"],
  ["dolar", "Dolar", "Dollar"],
  ["pereyên", "Paralar", "Funds"],
  ["pere", "Para", "Money"],
  ["pera", "Para", "Money"],
  ["dîrok", "Tarih", "Date"],
  ["miqdar", "Miktar", "Quantity"],
  ["hejmar", "Adet", "Count"],
  ["numreya fatorê", "Fatura No", "Invoice No"],
  ["numreya fatore", "Fatura No", "Invoice No"],
  ["nirxê yekê", "Birim Fiyat", "Unit Price"],
  ["nirxê giştî", "Toplam Fiyat", "Total Price"],
  ["nirxê", "Fiyat", "Price"],
  ["birîm", "Birim", "Unit"],
  ["têbînî", "Not", "Note"],
  ["tebînî", "Not", "Note"],
  ["navê ajovan", "Şoför Adı", "Driver Name"],
  ["ajovan", "Şoför", "Driver"],
  ["navê", "Adı", "Name"],
  ["nav", "Ad", "Name"],
  ["jibo", "için", "for"],
  ["ji bo", "için", "for"],
  ["hatî dayîn", "Ödenen", "Paid"],
  ["serfa dolar", "Dolar Kuru", "Dollar Rate"],
  ["karê rojane", "Günlük İş", "Daily Work"],
  ["karmendê", "Çalışan", "Employee"],
  ["fonê karmend", "Çalışan Fonu", "Employee Fund"],
  ["giştî dike", "Toplamı Yapar", "Sums Up"],
  ["meha", "Ay", "Month"],
  ["hezîran", "Haziran", "June"],
  ["sivîl", "Sivil", "Civilian"],
  ["proje", "Proje", "Project"],
  ["barkirina", "Yükleme", "Loading"],
  ["barkirin", "Yükleme", "Loading"],
  // --- işletme / yer türleri ---
  ["kargeha", "Atölye", "Workshop"],
  ["kargeha biloka", "Blok Atölyesi", "Block Workshop"],
  ["biloka", "Blok", "Block"],
  ["bilok", "Blok", "Block"],
  ["qada futbolê", "Futbol Sahası", "Football Field"],
  ["saha futbolê", "Futbol Sahası", "Football Field"],
  ["saha fotbolê", "Futbol Sahası", "Football Field"],
  ["futbolê", "Futbol", "Football"],
  ["kafîteriya", "Kafeterya", "Cafeteria"],
  ["kefîteriya", "Kafeterya", "Cafeteria"],
  ["kafîterya", "Kafeterya", "Cafeteria"],
  ["bilyardo", "Bilardo", "Billiards"],
  ["biliyardo", "Bilardo", "Billiards"],
  ["qada", "Saha", "Field"],
  ["internêta", "İnternet", "Internet"],
  ["inertênêtê", "İnternet", "Internet"],
  ["internêt", "İnternet", "Internet"],
  ["inertênêt", "İnternet", "Internet"],
  ["dikanê", "Dükkân", "Shop"],
  ["dikan", "Dükkân", "Shop"],
  ["embêrê", "Ambar", "Warehouse"],
  ["kehreba", "Elektrik", "Electricity"],
  ["kehrebê", "Elektrik", "Electricity"],
  ["mektebe", "Okul", "School"],
  ["mekteba", "Okul", "School"],
  ["kirîya", "Kirası", "Rent"],
  ["kirya", "Kirası", "Rent"],
  ["depo", "Depo", "Warehouse"],
  // --- malzemeler ---
  ["çimento", "Çimento", "Cement"],
  ["çemento", "Çimento", "Cement"],
  ["remil", "Kum", "Sand"],
  ["kîs", "Çuval", "Sack"],
  ["ton", "Ton", "Ton"],
  ["lenpe", "Lamba", "Lamp"],
  ["zawyê hesin", "Demir Köşebent", "Iron Angle"],
  ["hesin", "Demir", "Iron"],
  ["betarîyê", "Akü", "Battery"],
  ["cîhazê", "Cihaz", "Device"],
  ["invirter", "İnverter", "Inverter"],
  ["rawterê", "Router", "Router"],
  ["guhertina", "Değişimi", "Replacement"],
  ["temîrkirin", "Tamir", "Repair"],
  ["û", "ve", "and"],
  ["filterê avê", "Su Filtresi", "Water Filter"],
  ["filterê", "Filtre", "Filter"],
  ["avê", "Su", "Water"],
  // --- Arapça ---
  ["بطارية", "Akü", "Battery", "Batarî"],
  ["سولار", "Solar", "Solar", "Solar"],
  ["لوح", "Panel", "Panel", "Panel"],
  ["جهاز", "Cihaz", "Device", "Cîhaz"],
  ["تابلو حماية", "Koruma Panosu", "Protection Panel", "Tabloya Parastinê"],
  ["قواطع", "Şalterler", "Breakers", "Qutkerên Elektrîkê"],
  ["كبل", "Kablo", "Cable", "Kabl"],
  ["قواعد حديد", "Demir Ayaklar", "Iron Bases", "Bingehên Hesin"],
  ["كهربا", "Elektrik", "Electricity", "Kehreb"],
  // --- sistemin kendi ürettiği (Türkçe kaynak) ifadeler ---
  ["aylık gelir", "Aylık Gelir", "Monthly Income", "Dahata Mehane"],
  ["aylık gider", "Aylık Gider", "Monthly Expense", "Mesrefa Mehane"],
  ["excel özeti", "Excel özeti", "Excel summary", "Kurteya Excel"],
  ["satır", "Satır", "Rows", "Rêz"],
  ["başlık", "Başlık", "Title", "Sernav"],
  ["toplam", "Toplam", "Total", "Giştî"],
  ["tutar", "Tutar", "Amount", "Mîqdar"],
];

// Cümle içi bağlayıcılar (ya/yê/yên): çeviride düşürülür.
const DROP_WORDS = ["ya", "yê", "yên", "ji"];

const norm = (s: string) =>
  s
    .replace(/[ً-ٰٟ]/g, "")
    .toLowerCase()
    .replace(/ı/g, "i")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

const DROP = new Set(DROP_WORDS.map((w) => norm(w)));

type Compiled = { tr: string; en: string; ku?: string; len: number };
const MAP = new Map<string, Compiled>();
let MAX_LEN = 1;
for (const [src, tr, en, ku] of ENTRIES) {
  const words = norm(src).split(/\s+/).filter(Boolean);
  MAX_LEN = Math.max(MAX_LEN, words.length);
  const key = words.join(" ");
  if (!MAP.has(key)) MAP.set(key, { tr, en, ku, len: words.length });
}

const WORD = /[\p{L}\p{M}\p{N}]+/gu;

function matchCase(original: string, out: string, language: Language) {
  if (/[\u0600-\u06FF]/.test(original)) return out;
  const letters = original.replace(/[^\p{L}]/gu, "");
  const locale = language === "tr" ? "tr" : language === "ku" ? "ku" : "en";
  if (letters.length > 1 && letters === letters.toLocaleUpperCase("tr")) return out.toLocaleUpperCase(locale);
  if (letters.length > 0 && letters === letters.toLocaleLowerCase("tr") && !/[؀-ۿ]/.test(original)) return out.toLocaleLowerCase(locale);
  return out;
}

// Sözlükte bulunan Kürtçe/Arapça kelime ve ifadeleri arayüz diline çevirir; geri kalan metin aynen kalır.
export function translateGlossary(text: string, language: Language): string {
  if (!text || !/[\p{L}]/u.test(text)) return text;
  const tokens: { word: boolean; text: string }[] = [];
  let last = 0;
  for (const m of text.matchAll(WORD)) {
    if (m.index! > last) tokens.push({ word: false, text: text.slice(last, m.index) });
    tokens.push({ word: true, text: m[0] });
    last = m.index! + m[0].length;
  }
  if (last < text.length) tokens.push({ word: false, text: text.slice(last) });

  const out: string[] = [];
  const drops = new Set<number>();
  let changed = false;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (!t.word) {
      out.push(t.text);
      continue;
    }
    // En uzun eşleşme: sonraki kelimeler yalnızca tek boşlukla ayrılmış olmalı.
    let matched: { entry: Compiled; end: number } | null = null;
    for (let len = Math.min(MAX_LEN, 4); len >= 1 && !matched; len--) {
      const parts: string[] = [norm(t.text)];
      let end = i;
      let ok = true;
      for (let k = 1; k < len; k++) {
        const sep = tokens[end + 1];
        const nxt = tokens[end + 2];
        if (!sep || sep.word || !/^\s+$/.test(sep.text) || !nxt || !nxt.word) {
          ok = false;
          break;
        }
        parts.push(norm(nxt.text));
        end += 2;
      }
      if (!ok) continue;
      const entry = MAP.get(parts.join(" "));
      if (entry && entry.len === len) matched = { entry, end };
    }
    if (matched) {
      const { entry, end } = matched;
      const translated = language === "tr" ? entry.tr : language === "en" ? entry.en : entry.ku;
      const original = tokens.slice(i, end + 1).map((x) => x.text).join("");
      if (translated === undefined) out.push(original);
      else {
        out.push(matchCase(original, translated, language));
        changed = true;
      }
      i = end;
    } else if (DROP.has(norm(t.text)) && language !== "ku") {
      // Bağlaç yalnızca metinde sözlükten çevrilen başka kelime varsa düşürülür ("ya da" gibi Türkçe kullanımlar bozulmasın).
      drops.add(out.length);
      out.push(t.text);
    } else {
      out.push(t.text);
    }
  }
  if (!changed) return text;
  return out
    .filter((_, idx) => !drops.has(idx))
    .join("")
    .replace(/\s{2,}/g, " ")
    .trim();
}

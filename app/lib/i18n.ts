import type { Kind, Language, NoteRelation, Page } from "./types";

export const kbGroupLogo = "/kb-logo.png";

export const monthNames = ["ocak", "şubat", "mart", "nisan", "mayıs", "haziran", "temmuz", "ağustos", "eylül", "ekim", "kasım", "aralık"];

export const nav: { id: Page; label: Record<Language, string>; icon: string }[] = [
  {
    id: "dashboard",
    label: { tr: "Ana Sayfa", en: "Home", ku: "Rûpela Sereke" },
    icon: "⌂",
  },
  {
    id: "cash",
    label: { tr: "Kasalar", en: "Cash Accounts", ku: "Qasayên Pere" },
    icon: "▣",
  },
  {
    id: "income",
    label: { tr: "Gelir", en: "Income", ku: "Dahat" },
    icon: "↗",
  },
  {
    id: "expense",
    label: { tr: "Gider", en: "Expenses", ku: "Mesref" },
    icon: "↘",
  },
  {
    id: "reportBuilder",
    label: {
      tr: "Rapor Hazırla",
      en: "Prepare Report",
      ku: "Raporê Amade Bike",
    },
    icon: "▥",
  },
  {
    id: "notes",
    label: {
      tr: "Mali Özel Notları",
      en: "Private Finance Notes",
      ku: "Nîşeyên Darayî",
    },
    icon: "✎",
  },
  {
    id: "archive",
    label: { tr: "Arşiv", en: "Archive", ku: "Arşîv" },
    icon: "◴",
  },
  {
    id: "users",
    label: { tr: "Kullanıcılar", en: "Users", ku: "Bikarhêner" },
    icon: "♙",
  },
  {
    id: "settings",
    label: { tr: "Ayarlar", en: "Settings", ku: "Mîheng" },
    icon: "⚙",
  },
];

export function kindName(k: Kind, language: Language = "tr") {
  return k === "income"
    ? tx(language, "Gelir", "Income", "Dahat")
    : k === "expense"
      ? tx(language, "Gider", "Expense", "Mesref")
      : tx(language, "Kasa", "Cash", "Qase");
}

export function localizedProfileName(name: string, language: Language) {
  if (name !== "Admin") return name;
  return language === "tr"
    ? "Admin"
    : language === "en"
      ? "Administrator"
      : "Rêveber";
}
export function localizedRole(role: string, language: Language) {
  if (role !== "Yönetici") return role;
  return language === "tr"
    ? "Yönetici"
    : language === "en"
      ? "Manager"
      : "Birêvebir";
}
export function tx(language: Language, tr: string, en: string, ku: string) {
  return language === "ku" ? ku : language === "en" ? en : tr;
}
export function noteRelationLabel(relation: NoteRelation, language: Language) {
  const labels: Record<NoteRelation, [string, string, string]> = {
    none: ["İlişki Yok", "No Link", "Girêdan Tune"], cash: ["Kasa", "Cash", "Qase"], income: ["Gelir", "Income", "Dahat"], expense: ["Gider", "Expense", "Mesref"], reports: ["Rapor Hazırla", "Prepare Report", "Raporê Amade Bike"], archive: ["Arşiv", "Archive", "Arşîv"], other: ["Diğer", "Other", "Din"],
  };
  const value = labels[relation];
  return language === "en" ? value[1] : language === "ku" ? value[2] : value[0];
}
export function localizeData(value: string, language: Language) {
  if (language !== "ku") return value;
  const ku: Record<string, string> = {
    "Panel satışı": "Firotina panelan",
    "Peşin tahsilat": "Wergirtina pêşîn",
    satış: "firotin",
    Montaj: "Sazkirin",
    "Montaj geliri": "Dahata sazkirinê",
    montaj: "sazkirin",
    "Havale Gelirleri": "Dahatên Veguhastinê",
    "Müşteri ödemesi": "Dayîna mişterî",
    "Banka havalesi": "Veguhastina bankê",
    havale: "veguhastin",
    "Market Satış Gelirleri": "Dahatên Firotina Marketê",
    "Günlük satış": "Firotina rojane",
    Kapanış: "Girtina rojê",
    market: "market",
    "Personel Giderleri": "Mesrefên Karmendan",
    "Ağustos maaşı": "Mûçeya Tebaxê",
    "Aylık ödeme": "Dayîna mehane",
    Finans: "Darayî",
    maaş: "mûçe",
    sabit: "sabît",
    "Nakliye Giderleri": "Mesrefên Veguhastinê",
    "Malzeme taşıma": "Veguhastina malzemeyan",
    "Solar saha": "Qada Solar",
    nakliye: "veguhastin",
    "Merkez USD Kasası": "Qaseya Navendê ya USD",
    "Nakit giriş": "Têketina pereyê destan",
    "Kasaya aktarım": "Veguhastina qaseyê",
    "Merkez Ofis": "Ofîsa Navendê",
    Merkez: "Navend",
    merkez: "navend",
    "Market Kasası": "Qaseya Marketê",
    "Günlük devir": "Veguhastina rojane",
    "Kasa kapanışı": "Girtina qaseyê",
    "Ağustos ayı Solar sözleşmelerini kontrol et.":
      "Peymanên Solar ên meha Tebaxê kontrol bike.",
    "Market kira ödemesi 15 Ağustos.": "Dayîna kirêya marketê 15ê Tebaxê ye.",
    Admin: "Rêveber",
    Yönetici: "Birêvebir",
    Düzenlendi: "Hat guherandin",
    Silindi: "Hat jêbirin",
  };
  return ku[value] || value;
}

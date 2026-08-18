import type { CSSProperties } from "react";
import type { TypographyKey, TypographySettings } from "./types";

export const defaultTypography: TypographySettings = {
  pageTitle: { size: 22, font: "Arial", color: "#20313b" },
  sectionTitle: { size: 17, font: "Arial", color: "#20313b" },
  cardTitle: { size: 12, font: "Arial", color: "#20313b" },
  body: { size: 11, font: "Arial", color: "#53676f" },
  tableHeader: { size: 9, font: "Arial", color: "#60736b" },
  formText: { size: 10, font: "Arial", color: "#586b72" },
};

export const typographyNames: Record<TypographyKey, [string, string, string]> = {
  pageTitle: ["Ana Başlıklar", "Main Titles", "Sernavên Sereke"],
  sectionTitle: ["Bölüm Başlıkları", "Section Titles", "Sernavên Beşan"],
  cardTitle: ["İçerik Kutusu Başlıkları", "Content Card Titles", "Sernavên Kartan"],
  body: ["Normal İçerik Yazıları", "Body Text", "Nivîsa Naverokê"],
  tableHeader: ["Tablo Başlıkları", "Table Headers", "Sernavên Tabloyê"],
  formText: ["Form ve Alan Yazıları", "Form & Field Text", "Nivîsa Formê"],
};
export const colorSwatches = ["#dc2626", "#ea580c", "#d97706", "#ca8a04", "#65a30d", "#16a34a", "#059669", "#0d9488", "#0891b2", "#0284c7", "#2563eb", "#4f46e5", "#7c3aed", "#9333ea", "#c026d3", "#db2777", "#e11d48", "#475569", "#525252", "#27272a"];

export function typographyVariables(settings: TypographySettings): CSSProperties {
  return {
    "--page-title-size": `${settings.pageTitle.size}px`, "--page-title-font": settings.pageTitle.font, "--page-title-color": settings.pageTitle.color,
    "--section-title-size": `${settings.sectionTitle.size}px`, "--section-title-font": settings.sectionTitle.font, "--section-title-color": settings.sectionTitle.color,
    "--card-title-size": `${settings.cardTitle.size}px`, "--card-title-font": settings.cardTitle.font, "--card-title-color": settings.cardTitle.color,
    "--body-size": `${settings.body.size}px`, "--body-font": settings.body.font, "--body-color": settings.body.color,
    "--table-header-size": `${settings.tableHeader.size}px`, "--table-header-font": settings.tableHeader.font, "--table-header-color": settings.tableHeader.color,
    "--form-text-size": `${settings.formText.size}px`, "--form-text-font": settings.formText.font, "--form-text-color": settings.formText.color,
  } as CSSProperties;
}

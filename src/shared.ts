export type LowestPriceSnapshot = {
  sameLanguagePrice: number | null;
  globalLowestPrice: number | null;
  globalLowestLanguage: string | null;
};

export const KNOWN_LANGUAGES = new Set([
  "English",
  "French",
  "German",
  "Spanish",
  "Italian",
  "Japanese",
  "Portuguese",
  "Russian",
  "Korean",
  "Dutch",
  "Polish",
  "Czech",
  "Hungarian",
  "S-Chinese",
  "T-Chinese",
  "Indonesian",
  "Thai"
]);

export function stripHtml(value: string): string {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function extractLanguageLabelFromIcon(icon: HTMLElement): string | null {
  const candidates = [
    icon.getAttribute("aria-label"),
    icon.getAttribute("data-bs-original-title"),
    icon.getAttribute("data-original-title"),
    icon.getAttribute("title")
  ];

  const onmouseover = icon.getAttribute("onmouseover") || "";
  const showMsgBoxMatch = onmouseover.match(/showMsgBox\(this,`([^`]+)`\)/);
  if (showMsgBoxMatch?.[1]) {
    candidates.push(showMsgBoxMatch[1]);
  }

  for (const raw of candidates) {
    if (!raw) continue;
    const cleaned = stripHtml(raw);
    for (const language of KNOWN_LANGUAGES) {
      if (cleaned === language || cleaned.includes(language)) {
        return language;
      }
    }
  }

  return null;
}

export function toNumber(priceText: string): number | null {
  const raw = priceText.trim();
  if (!/[0-9]/.test(raw)) return null;

  const normalized = raw
    .replace(/\s/g, "")
    .replace(/€/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

export function toPriceText(value: number): string {
  return value.toFixed(2).replace(".", ",");
}

export function detectLanguage(container: ParentNode): string {
  const icons = Array.from(
    container.querySelectorAll<HTMLElement>(".product-attributes .icon[aria-label]")
  );

  if (!icons.length) {
    const fallbackIcons = Array.from(
      container.querySelectorAll<HTMLElement>(".product-attributes .icon")
    );
    for (const icon of fallbackIcons) {
      const label = extractLanguageLabelFromIcon(icon);
      if (label) return label;
    }
    return "English";
  }

  for (const icon of icons) {
    const label = extractLanguageLabelFromIcon(icon);
    if (label) return label;
  }
  return "English";
}

export function extractLowestFromDocument(
  doc: Document,
  language: string,
  debugUrl = ""
): LowestPriceSnapshot {
  const rows = Array.from(
    doc.querySelectorAll<HTMLElement>("#table .table-body .article-row")
  );

  let sameLanguagePrice: number | null = null;
  let globalLowestPrice: number | null = null;
  let globalLowestLanguage: string | null = null;

  for (const row of rows) {
    const rowLanguage = detectLanguage(row);

    const priceTextEl =
      row.querySelector<HTMLElement>(".col-offer .price-container .color-primary") ||
      row.querySelector<HTMLElement>(".mobile-offer-container .color-primary");
    if (!priceTextEl) continue;

    const numeric = toNumber(priceTextEl.textContent || "");
    if (numeric === null) continue;

    if (globalLowestPrice === null || numeric < globalLowestPrice) {
      globalLowestPrice = numeric;
      globalLowestLanguage = rowLanguage || null;
    }

    if (rowLanguage !== language) continue;

    if (sameLanguagePrice === null || numeric < sameLanguagePrice) {
      sameLanguagePrice = numeric;
    }
  }

  console.log("[CMPU] extractLowestFromDocument", {
    url: debugUrl || doc.location?.href,
    language,
    sameLanguagePrice,
    globalLowestPrice,
    globalLowestLanguage,
    rowCount: rows.length
  });

  return { sameLanguagePrice, globalLowestPrice, globalLowestLanguage };
}

/**
 * Scraper content script — injected into Cardmarket product pages.
 * Runs silently; responds only when the background requests a price scrape.
 */

import { extractLowestFromDocument } from "../shared";

type ScrapeMessage = {
  action: "scrapePrice";
  language: string;
};

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  const msg = message as ScrapeMessage;

  if (msg.action === "scrapePrice") {
    try {
      const snapshot = extractLowestFromDocument(document, msg.language, location.href);
      sendResponse({ ok: true, snapshot });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      sendResponse({ ok: false, error: errMsg });
    }
    return true;
  }
});

# Cardmarket Price Updater

⚠️ **Disclaimer**

This is a **personal automation tool** for your own Cardmarket account. Use at your own risk. The author assumes no liability for account suspension, data loss, or other consequences. This tool automates actions that may not be permitted by Cardmarket's Terms of Service. Review their terms before use.

---

A browser extension that scans your Cardmarket "Stock → Offers → Singles" page and suggests the lowest same-language price for each listing. Prices are shown inline with a hover tooltip that also shows the global cheapest offer (any language), so you can make informed pricing decisions without leaving your offers page.

## Features

- **Per-row scan** — click ⟳ Scan on any individual offer to fetch the current lowest price.
- **Batch scan** — the floating button scans all visible offers concurrently (2 workers).
- **Accept** — one-click auto-submit that opens the edit modal and sets the suggested price.
- **24-hour cache** — prices are cached per card + language so re-runs are instant.
- **Tooltip** — hover the price chip to see:
  - Lowest same-language price with language label
  - Global cheapest price (any language) with its language label
- **Abort** — click the floating button again mid-scan to stop immediately.
- **Anti-bot fallback** — if Cardmarket blocks the direct fetch with 403, the extension falls back to a hidden iframe that loads the page as a real browser navigation.

## Browser support

| Browser | Manifest | Package |
|---------|----------|---------|
| Chrome  | MV3      | `dist-chrome/` (load unpacked), `exports/cardmarket-price-updater-chrome.zip` |
| Firefox | MV2      | `exports/cardmarket-price-updater-firefox.xpi` |

## Development

```bash
npm install

# Chrome (loads from dist-chrome/)
npm run build

# Firefox + Chrome packages in exports/
npm run package:firefox
npm run package:chrome

# Clean build outputs
npm run clean
```

Load in Firefox:
1. Open `about:debugging` → This Firefox → Load Temporary Add-on
2. Select the generated `cardmarket-price-updater-firefox.xpi`

Load in Chrome:
1. Open `chrome://extensions` → Enable Developer mode
2. Load unpacked → select the `dist-chrome/` folder

## How it works

1. Content script (`src/content/main.ts`) injects buttons into `#UserOffersTable` rows on `Stock/Offers/Singles` pages.
2. When a scan runs, it fetches the corresponding product page, parses `#table .article-row` entries, and finds the lowest price for the matching language as well as the global cheapest.
3. Both prices are stored in `chrome.storage.local` (proxied through the background script on Firefox MV2) with a 24-hour TTL.
4. A price chip appears on the row showing the same-language lowest price. Hovering reveals both same-language and global lowest with their languages.
5. Clicking Accept opens the Cardmarket edit modal and auto-fills + submits the suggested price.

## Next steps

### 1. Reliable page scraping
The biggest current limitation is that Cardmarket returns **403** on programmatic fetch requests from the extension context. The hidden iframe fallback works around this but can be slow (15 s timeout) and is fragile. Better alternatives:

- **Background tab scraping** — use the `tabs` permission to open the product URL in a real hidden tab, inject a content script to read the DOM, then close the tab. Fully first-party traffic that cannot be blocked.
- **Relay via page context** — inject a `<script>` tag into the page to run fetch from page scope (bypasses extension header fingerprinting).

### 2. Multi-page batch scan
The current scan only covers offers visible on the current page. Add pagination support:

- Detect the `Page X of N` control.
- Auto-navigate through pages, scan each, accumulate results.
- Show a final summary.

### 3. Filter and sort results
After a scan, let the user filter rows by:

- Price delta (e.g. only show offers where you can lower by > 10%).
- Cards where same-language offer exists vs. not.
- Bulk-accept all below a threshold.

### 4. Chrome MV3 service worker storage
The Chrome build currently has no background proxy (MV3 service workers are stateless). Ensure caching works correctly across service worker restarts by validating chrome.storage.local reads in the content script directly (MV3 content scripts *can* access storage).

### 5. Automatic re-scan on page navigation
Cardmarket is a SPA-style site. Add a `MutationObserver` on the table container so that navigating to a different page of offers or changing filters re-runs the init and attaches buttons without a full page reload.

### 6. Popup improvements
The popup (`src/popup/main.ts`) currently shows only the last run stats. Extend it to:

- Display a scan summary table (card name, language, suggested price, delta).
- Add a "Clear cache" button.
- Show cache hit ratio.

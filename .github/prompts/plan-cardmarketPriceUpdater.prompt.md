## Plan: Cardmarket Lowest-Price Updater MVP

Build a Chrome-first browser extension (TypeScript, MV3) that runs on Cardmarket offers pages, reads each listed card, opens the product page for that card, finds the lowest offer in the same language (English for your current flow), and pre-fills your offer price input without auto-submitting. Persist scan/update history in localStorage first for MVP, with a clean storage adapter so IndexedDB/cloud can be added later.

**Steps**
1. Define extension skeleton and build pipeline
   - Initialize a TypeScript extension project using npm.
   - Add manifest, background service worker, content script injection, and a minimal popup.
   - Add shared types for OfferRow, ProductScanResult, PriceUpdateRecord, and language enums.
2. Build robust DOM selectors for offers page parsing (depends on 1)
   - Parse user offer rows from #UserOffersTable and fallback selectors for the same row shape.
   - Extract per-row card name link, current language icon/label, current price display/input, article id, and edit affordance.
   - Add defensive parsing and skip reasons when required elements are missing.
3. Implement product-page scanner (parallel with 2 after shared types)
   - Fetch product page HTML from card link URL.
   - Parse product offers table under #table .table-body .article-row.
   - Filter rows by target language and select lowest numeric price.
   - Return normalized currency value + source row metadata.
4. Implement update engine and UI actions (depends on 2 and 3)
   - Add one injected button on offers page: “Scan lowest (EN) and prefill”.
   - For each visible row: scan product page, compute lowest same-language price, set row price input value in-place, and mark row status.
   - Do not submit forms automatically; leave final confirmation to user.
   - Add throttling and concurrency caps to avoid rate spikes and reduce page load pressure.
5. Add persistence adapter using localStorage (depends on 4)
   - Store run summaries keyed by timestamp: scanned rows, changed rows, old/new prices, errors, source URL.
   - Store per-card last-seen lowest price cache with ttl to speed repeat scans.
   - Add popup view for latest run stats and clear-history action.
6. Add compatibility and safety handling (depends on 4)
   - Handle locale price formats (comma decimal, euro symbol, spaces).
   - Handle missing language rows on product page (status: no-match).
   - Handle network failures/timeouts with per-row retries and final error badges.
   - Ensure extension runs only on Cardmarket domains and relevant routes.
7. Verification and packaging (depends on 1-6)
   - Manual QA on current page with mixed-language examples.
   - Validate no auto-submit behavior.
   - Validate persistence records and clear-history behavior.
   - Package unpacked extension build for Chrome; smoke-check Firefox compatibility path.

**Relevant files**
- /home/red/sites/cardmarket-price-updater/examples/offers.html — source for offers-page row parsing and editable offer controls.
- /home/red/sites/cardmarket-price-updater/examples/card-price.html — source for product-page language + price extraction rules.
- /home/red/sites/cardmarket-price-updater (new extension source tree) — manifest, content scripts, background worker, popup, shared parser/storage modules.

**Verification**
1. Load unpacked extension in Chrome and open a Cardmarket stock offers page with English offers.
2. Click the injected scan/prefill button and confirm only visible page rows are processed.
3. Confirm each updated row now contains the lowest same-language price from the linked product page.
4. Confirm rows with no same-language offers are skipped with explicit status.
5. Confirm no edit submit is triggered automatically.
6. Confirm localStorage has run history and per-card cache entries.
7. Confirm rerun uses cache where valid and still refreshes stale/missing items.
8. Smoke-check Firefox install path (without committing to full MV2/MV3 divergence for MVP).

**Decisions**
- Included scope: visible current page rows only.
- Included scope: prefill only, no auto-submit.
- Included scope: Chrome first, keep architecture portable for Firefox.
- Excluded from MVP: full multi-page crawling, remote database, account-level sync, auto-click edit submit.

**Further Considerations**
1. Language source strategy: force EN only (current) vs derive from each row language icon. Recommendation: derive from row by default, with EN quick-toggle in popup.
2. Price strategy: exact lowest vs lowest-minus-step (e.g., 0.01). Recommendation: exact lowest first; configurable undercut later.
3. Fetch strategy: direct fetch with credentials include vs opening hidden tabs. Recommendation: direct fetch first, hidden-tab fallback only if CORS/anti-bot blocks appear.

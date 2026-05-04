type RowStatus = "updated" | "cached" | "no-match" | "error" | "missing-data";
import {
  type LowestPriceSnapshot,
  detectLanguage,
  toNumber,
  toPriceText,
  extractLowestFromDocument
} from "../shared";


type ScanRowResult = {
  articleId: string;
  cardName: string;
  cardUrl: string;
  language: string;
  currentPrice: number | null;
  suggestedPrice: number | null;
  status: RowStatus;
  reason?: string;
};

type ScanRunRecord = {
  id: string;
  startedAt: string;
  finishedAt: string;
  totalRows: number;
  changedRows: number;
  errorRows: number;
  rows: ScanRowResult[];
};

type PriceCacheRecord = {
  value: number;
  timestamp: number;
  language?: string;
};

type OfferRow = {
  articleId: string;
  cardName: string;
  cardUrl: string;
  language: string;
  currentPrice: number | null;
  rowEl: HTMLElement;
};

const HISTORY_KEY = "cmpu.history";
const CACHE_KEY = "cmpu.cache";
const CACHE_TTL_MS = 1000 * 60 * 60 * 24; // 24 hours
const RUNNER_ID = "cmpu-runner";
const DEBUG_KEY = "cmpu.debug";

let abortScan = false;

function debugLog(message: string, data?: unknown): void {
  if (data !== undefined) {
    console.log("[CMPU]", message, data);
    return;
  }
  console.log("[CMPU]", message);
}

function parseArticleId(rowEl: HTMLElement): string | null {
  const editLink = rowEl.querySelector<HTMLAnchorElement>('a[data-modal*="idArticle="]');
  if (!editLink) {
    return null;
  }
  const modalPath = editLink.getAttribute("data-modal") ?? "";
  const match = modalPath.match(/idArticle=(\d+)/);
  return match?.[1] ?? null;
}

function findVisibleOfferRows(): OfferRow[] {
  const rowEls = Array.from(
    document.querySelectorAll<HTMLElement>("#UserOffersTable .table-body .article-row")
  );

  return rowEls
    .map((rowEl) => {
      const articleId = parseArticleId(rowEl);
      const linkEl = rowEl.querySelector<HTMLAnchorElement>(".col-seller a[href*='/Products/Singles/']");
      if (!articleId || !linkEl) {
        return null;
      }

      const cardName = linkEl.textContent?.trim() || "Unknown";
      const cardUrl = new URL(linkEl.getAttribute("href") || "", location.origin).toString();
      const language = detectLanguage(rowEl);

      const priceTextEl =
        rowEl.querySelector<HTMLElement>(".col-offer .price-container .color-primary") ||
        rowEl.querySelector<HTMLElement>(".mobile-offer-container .color-primary");
      const currentPrice = priceTextEl ? toNumber(priceTextEl.textContent || "") : null;

      return {
        articleId,
        cardName,
        cardUrl,
        language,
        currentPrice,
        rowEl
      } satisfies OfferRow;
    })
    .filter((row): row is OfferRow => Boolean(row));
}

function setRowStatus(
  rowEl: HTMLElement,
  text: string,
  tone: "ok" | "warn" | "err",
  options?: { tooltip?: string; visiblePrice?: number | null }
): void {
  const existingBadge = rowEl.querySelector<HTMLElement>(".cmpu-badge");
  if (existingBadge) {
    existingBadge.remove();
  }

  // Keep row layout clean; expose status via native hover tooltip.
  const tooltipText = options?.tooltip ?? text;
  rowEl.setAttribute("data-cmpu-tone", tone);
  rowEl.title = `CMPU: ${tooltipText}`;

  const scanBtn = rowEl.querySelector<HTMLButtonElement>(".cmpu-scan-btn");
  if (scanBtn) {
    scanBtn.title = tooltipText;
  }

  const acceptBtn = rowEl.querySelector<HTMLButtonElement>(".cmpu-accept-btn");
  if (acceptBtn) {
    acceptBtn.title = tooltipText;
  }

  const existingInlinePrice = rowEl.querySelector<HTMLElement>(".cmpu-inline-price");
  const visiblePrice = options?.visiblePrice;

  if (visiblePrice === null || visiblePrice === undefined) {
    existingInlinePrice?.remove();
    return;
  }

  let inlinePrice = existingInlinePrice;
  if (!inlinePrice) {
    inlinePrice = document.createElement("span");
    inlinePrice.className = "cmpu-inline-price";
    inlinePrice.style.display = "inline-block";
    inlinePrice.style.padding = "2px 6px";
    inlinePrice.style.borderRadius = "999px";
    inlinePrice.style.fontSize = "10px";
    inlinePrice.style.fontWeight = "700";
    inlinePrice.style.whiteSpace = "nowrap";
    ensureActionGroup(rowEl).appendChild(inlinePrice);
  }

  inlinePrice.textContent = `${toPriceText(visiblePrice)} EUR`;
  inlinePrice.title = `CMPU: ${tooltipText}`;
  inlinePrice.style.background = tone === "ok" ? "#d5f5e3" : tone === "warn" ? "#fff3cd" : "#f8d7da";
  inlinePrice.style.color = tone === "ok" ? "#0f5132" : tone === "warn" ? "#664d03" : "#842029";
}

function ensureActionGroup(rowEl: HTMLElement): HTMLElement {
  let group = rowEl.querySelector<HTMLElement>(".cmpu-actions");
  if (group) {
    return group;
  }

  group = document.createElement("div");
  group.className = "cmpu-actions";
  group.style.display = "flex";
  group.style.alignItems = "center";
  group.style.flexWrap = "wrap";
  group.style.gap = "4px";
  group.style.marginBottom = "4px";
  group.style.maxWidth = "100%";

  const anchor =
    rowEl.querySelector(".col-product") ||
    rowEl.querySelector(".col-seller") ||
    rowEl.querySelector(".col-offer") ||
    rowEl.querySelector(".mobile-offer-container") ||
    rowEl;
  anchor.appendChild(group);

  return group;
}

function addAcceptButton(rowEl: HTMLElement, articleId: string, suggestedPrice: number): void {
  let acceptBtn = rowEl.querySelector<HTMLButtonElement>(".cmpu-accept-btn");
  if (acceptBtn) {
    return;
  }

  acceptBtn = document.createElement("button");
  acceptBtn.className = "cmpu-accept-btn";
  acceptBtn.type = "button";
  acceptBtn.textContent = "Accept";
  acceptBtn.style.padding = "3px 7px";
  acceptBtn.style.borderRadius = "4px";
  acceptBtn.style.fontSize = "10px";
  acceptBtn.style.fontWeight = "700";
  acceptBtn.style.background = "#28a745";
  acceptBtn.style.color = "#fff";
  acceptBtn.style.border = "none";
  acceptBtn.style.cursor = "pointer";
  acceptBtn.title = `Accept ${toPriceText(suggestedPrice)} EUR`;

  const group = ensureActionGroup(rowEl);
  group.appendChild(acceptBtn);

  acceptBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    debugLog("Accept button clicked", { articleId, suggestedPrice });
    await autoSubmitPrice(articleId, suggestedPrice);
  });
}

function addScanButton(rowEl: HTMLElement, articleId: string, cardUrl: string, language: string): void {
  let scanBtn = rowEl.querySelector<HTMLButtonElement>(".cmpu-scan-btn");
  if (scanBtn) {
    return;
  }

  scanBtn = document.createElement("button");
  scanBtn.className = "cmpu-scan-btn";
  scanBtn.type = "button";
  scanBtn.textContent = "⟳ Scan";
  scanBtn.style.padding = "3px 7px";
  scanBtn.style.borderRadius = "4px";
  scanBtn.style.fontSize = "10px";
  scanBtn.style.fontWeight = "700";
  scanBtn.style.background = "#0d6efd";
  scanBtn.style.color = "#fff";
  scanBtn.style.border = "none";
  scanBtn.style.cursor = "pointer";
  scanBtn.title = "Scan lowest same-language price";

  const group = ensureActionGroup(rowEl);
  group.appendChild(scanBtn);

  scanBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    debugLog("Individual row scan clicked", { articleId });
    scanBtn.disabled = true;
    scanBtn.textContent = "⟳ Scanning...";
    scanBtn.title = "Scanning...";
    try {
      await scanSingleRow(articleId, cardUrl, language, rowEl);
    } finally {
      scanBtn.disabled = false;
      scanBtn.textContent = "⟳ Scan";
      if (!scanBtn.title || scanBtn.title === "Scanning...") {
        scanBtn.title = "Scan lowest same-language price";
      }
    }
  });
}

async function autoSubmitPrice(articleId: string, suggestedPrice: number): Promise<void> {
  // Find and click the edit link to open the modal
  const editLink = document.querySelector<HTMLAnchorElement>(
    `a[data-modal*="idArticle=${articleId}"]`
  );
  if (!editLink) {
    debugLog("Edit link not found", { articleId });
    return;
  }

  editLink.click();

  // Wait for modal to appear and locate the form
  const maxRetries = 20;
  for (let retry = 0; retry < maxRetries; retry++) {
    const form = document.querySelector<HTMLFormElement>(`#Edit${articleId}`);
    if (!form) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      continue;
    }

    debugLog("Form found, filling price", { articleId, suggestedPrice });
    const priceInput = form.querySelector<HTMLInputElement>('input[name="price"]');
    if (priceInput) {
      priceInput.value = toPriceText(suggestedPrice);
      priceInput.dispatchEvent(new Event("input", { bubbles: true }));
      priceInput.dispatchEvent(new Event("change", { bubbles: true }));
    }

    // Submit the form
    await new Promise((resolve) => setTimeout(resolve, 200));
    const submitBtn = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (submitBtn) {
      debugLog("Submitting form", { articleId });
      submitBtn.click();
    }
    return;
  }

  debugLog("Form did not appear in time", { articleId });
}

async function scanSingleRow(articleId: string, cardUrl: string, language: string, rowEl: HTMLElement): Promise<void> {
  try {
    const cache = await readCache();
    const ck = cacheKey(cardUrl, language);
    const gk = cacheKeyGlobal(cardUrl);
    const cachedSame = fromCache(cache, ck);
    const cachedGlobal = fromCache(cache, gk);

    let sameLanguageLowest = cachedSame;
    let globalLowest = cachedGlobal;
    let globalLowestLanguage = cache[gk]?.language ?? null;

    if (sameLanguageLowest === null || globalLowest === null) {
      const snapshot = await fetchLowestSnapshot(cardUrl, language);
      sameLanguageLowest = snapshot.sameLanguagePrice;
      globalLowest = snapshot.globalLowestPrice;
      globalLowestLanguage = snapshot.globalLowestLanguage;

      if (sameLanguageLowest !== null) {
        cache[ck] = { value: sameLanguageLowest, timestamp: Date.now(), language };
      }
      if (globalLowest !== null) {
        cache[gk] = {
          value: globalLowest,
          timestamp: Date.now(),
          language: globalLowestLanguage ?? undefined
        };
      }
      await writeCache(cache);
    }

    const tooltip = [
      `Same language (${language}): ${sameLanguageLowest !== null ? `${toPriceText(sameLanguageLowest)} EUR` : "no offer"}`,
      `Global lowest (${globalLowestLanguage ?? "unknown"}): ${globalLowest !== null ? `${toPriceText(globalLowest)} EUR` : "no offer"}`
    ].join("\n");

    if (sameLanguageLowest === null) {
      setRowStatus(rowEl, "No same-language offer", "warn", { tooltip, visiblePrice: null });
      debugLog("No matching offer found for single row", { articleId });
      return;
    }

    prefillExistingInlineInput(articleId, sameLanguageLowest);

    setRowStatus(rowEl, `${toPriceText(sameLanguageLowest)} EUR`, "ok", {
      tooltip,
      visiblePrice: sameLanguageLowest
    });
    addAcceptButton(rowEl, articleId, sameLanguageLowest);
    debugLog("Single row scan complete", {
      articleId,
      sameLanguageLowest,
      globalLowest,
      globalLowestLanguage
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    setRowStatus(rowEl, "Scan failed", "err", { tooltip: message, visiblePrice: null });
    debugLog("Single row scan error", { articleId, error: message });
  }
}

async function getStore<T>(key: string, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(
        { action: key === HISTORY_KEY ? "getHistory" : "getCache" },
        (response: unknown) => {
          if (chrome.runtime.lastError) {
            debugLog("Runtime message error", { key, error: chrome.runtime.lastError.message });
            resolve(fallback);
            return;
          }
          resolve((response as T | undefined) ?? fallback);
        }
      );
    } catch (e) {
      debugLog("Runtime message exception", { key, error: String(e) });
      resolve(fallback);
    }
  });
}

async function setStore<T>(key: string, value: T): Promise<void> {
  return new Promise((resolve) => {
    try {
      const action = key === HISTORY_KEY ? "setHistory" : "setCache";
      chrome.runtime.sendMessage(
        { action, value },
        (response: unknown) => {
          if (chrome.runtime.lastError) {
            debugLog("Runtime message error", { key, action, error: chrome.runtime.lastError.message });
          } else {
            debugLog("Storage message sent", { key, action });
          }
          resolve();
        }
      );
    } catch (e) {
      debugLog("Runtime message exception", { key, error: String(e) });
      resolve();
    }
  });
}

async function readCache(): Promise<Record<string, PriceCacheRecord>> {
  return getStore<Record<string, PriceCacheRecord>>(CACHE_KEY, {});
}

async function writeCache(cache: Record<string, PriceCacheRecord>): Promise<void> {
  await setStore(CACHE_KEY, cache);
}

async function pushHistory(run: ScanRunRecord): Promise<void> {
  const history = await getStore<ScanRunRecord[]>(HISTORY_KEY, []);
  history.unshift(run);
  const trimmed = history.slice(0, 20);
  await setStore(HISTORY_KEY, trimmed);
}

function cacheKey(cardUrl: string, language: string): string {
  return `${cardUrl}::${language}`;
}

function cacheKeyGlobal(cardUrl: string): string {
  return `${cardUrl}::*`;
}

function fromCache(cache: Record<string, PriceCacheRecord>, key: string): number | null {
  const record = cache[key];
  if (!record) {
    debugLog("Cache miss (no record)", { key });
    return null;
  }
  if (Date.now() - record.timestamp > CACHE_TTL_MS) {
    debugLog("Cache expired", { key, ageMs: Date.now() - record.timestamp });
    return null;
  }
  debugLog("Cache hit", { key, value: record.value });
  return record.value;
}

async function fetchLowestViaHiddenIframe(cardUrl: string, language: string): Promise<LowestPriceSnapshot> {
  debugLog("Attempting hidden iframe fallback", { cardUrl, language });

  return new Promise((resolve, reject) => {
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.left = "-99999px";
    iframe.style.top = "0";
    iframe.style.width = "1px";
    iframe.style.height = "1px";
    iframe.style.opacity = "0";
    iframe.setAttribute("aria-hidden", "true");

    let settled = false;

    const cleanup = (): void => {
      iframe.onload = null;
      iframe.onerror = null;
      window.clearTimeout(timeoutId);
      iframe.remove();
    };

    const settleResolve = (value: LowestPriceSnapshot): void => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve(value);
    };

    const settleReject = (error: Error): void => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(error);
    };

    const timeoutId = window.setTimeout(() => {
      settleReject(new Error("Hidden iframe load timeout"));
    }, 15000);

    iframe.onload = () => {
      if (abortScan) {
        settleReject(new Error("Scan aborted"));
        return;
      }

      try {
        const doc = iframe.contentDocument;
        if (!doc) {
          settleReject(new Error("Hidden iframe has no document"));
          return;
        }

        const snapshot = extractLowestFromDocument(doc, language, cardUrl);
        debugLog("Hidden iframe fallback success", { cardUrl, language, snapshot });
        settleResolve(snapshot);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        settleReject(new Error(`Hidden iframe parse failed: ${message}`));
      }
    };

    iframe.onerror = () => {
      settleReject(new Error("Hidden iframe load error"));
    };

    iframe.src = cardUrl;
    document.body.appendChild(iframe);
  });
}

async function fetchLowestSnapshot(cardUrl: string, language: string): Promise<LowestPriceSnapshot> {
  debugLog("Fetching product snapshot", { cardUrl, language });

  // 1. Primary: ask background to open a real browser tab and scrape.
  try {
    const tabResult = await new Promise<{ ok: boolean; snapshot?: LowestPriceSnapshot; error?: string }>(
      (resolve, reject) => {
        chrome.runtime.sendMessage(
          { action: "scrapeTab", cardUrl, language },
          (response) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(response as { ok: boolean; snapshot?: LowestPriceSnapshot; error?: string });
            }
          }
        );
      }
    );

    if (tabResult.ok && tabResult.snapshot) {
      debugLog("Background tab scrape success", { cardUrl, snapshot: tabResult.snapshot });
      return tabResult.snapshot;
    }

    debugLog("Background tab scrape failed, falling back", { cardUrl, error: tabResult.error });
  } catch (tabError) {
    debugLog("Background tab scrape exception, falling back", {
      cardUrl,
      error: tabError instanceof Error ? tabError.message : String(tabError)
    });
  }

  if (abortScan) throw new Error("Scan aborted");

  // 2. Fallback: direct fetch with retry + hidden iframe.

  // Retry with exponential backoff for 403 and network errors
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (abortScan) {
      throw new Error("Scan aborted");
    }

    try {
      const response = await fetch(cardUrl, {
        method: "GET",
        credentials: "include",
        headers: {
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.5",
          "Accept-Encoding": "gzip, deflate",
          "DNT": "1",
          "Connection": "keep-alive",
          "Upgrade-Insecure-Requests": "1"
        }
      });

      if (!response.ok) {
        throw new Error(`[${response.status}] ${response.statusText}`);
      }

      const html = await response.text();
      const parsed = new DOMParser().parseFromString(html, "text/html");
      return extractLowestFromDocument(parsed, language, cardUrl);
    } catch (error) {
      if (abortScan) {
        throw error;
      }

      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      debugLog("Fetch attempt failed", { attempt, cardUrl, error: message });

      if (attempt < 2) {
        const backoffMs = Math.pow(2, attempt) * 500;
        debugLog("Retrying after backoff", { backoffMs });

        // Check abort during backoff with frequent checks
        let elapsed = 0;
        while (elapsed < backoffMs && !abortScan) {
          await new Promise((resolve) => setTimeout(resolve, 100));
          elapsed += 100;
        }

        if (abortScan) {
          throw new Error("Scan aborted during retry backoff");
        }
      }

      if (attempt === 2) {
        try {
          return await fetchLowestViaHiddenIframe(cardUrl, language);
        } catch (iframeError) {
          const iframeMessage = iframeError instanceof Error ? iframeError.message : String(iframeError);
          debugLog("Hidden iframe fallback failed", { cardUrl, error: iframeMessage });
        }
      }
    }
  }

  throw lastError;
}

async function fetchLowestSameLanguage(cardUrl: string, language: string): Promise<number | null> {
  const snapshot = await fetchLowestSnapshot(cardUrl, language);
  return snapshot.sameLanguagePrice;
}

function prefillExistingInlineInput(articleId: string, value: number): boolean {
  const input = document.querySelector<HTMLInputElement>(`#Edit${articleId} input[name='price']`);
  if (!input) {
    return false;
  }
  input.value = toPriceText(value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

function installModalPrefillBridge(priceMap: Map<string, number>): void {
  document.addEventListener(
    "click",
    (event) => {
      const target = event.target as HTMLElement;
      const editAnchor = target.closest<HTMLAnchorElement>('a[data-modal*="Article_EditArticleModal"][data-modal*="idArticle="]');
      if (!editAnchor) {
        return;
      }

      const modalPath = editAnchor.getAttribute("data-modal") || "";
      const match = modalPath.match(/idArticle=(\d+)/);
      const articleId = match?.[1];
      if (!articleId) {
        return;
      }

      const suggested = priceMap.get(articleId);
      if (suggested === undefined) {
        return;
      }

      const observer = new MutationObserver(() => {
        const modalInput = document.querySelector<HTMLInputElement>("#modal input[name='price']");
        if (!modalInput) {
          return;
        }

        modalInput.value = toPriceText(suggested);
        modalInput.dispatchEvent(new Event("input", { bubbles: true }));
        modalInput.dispatchEvent(new Event("change", { bubbles: true }));
        observer.disconnect();
      });

      observer.observe(document.body, { childList: true, subtree: true });
      window.setTimeout(() => observer.disconnect(), 4000);
    },
    true
  );
}

async function processRows(rows: OfferRow[]): Promise<ScanRowResult[]> {
  debugLog("Processing offer rows", { total: rows.length });
  const cache = await readCache();
  debugLog("Cache loaded", { cacheSize: Object.keys(cache).length });
  const priceMap = new Map<string, number>();
  const results: ScanRowResult[] = [];

  const concurrency = 2;
  let cursor = 0;
  let consecutiveFailures = 0;
  const MAX_CONSECUTIVE_FAILURES = 5;

  // Helper to check abort and wait with frequent interruption checks
  const delayWithAbortCheck = async (ms: number): Promise<boolean> => {
    const checkInterval = 100;
    let elapsed = 0;
    while (elapsed < ms && !abortScan) {
      await new Promise((resolve) => setTimeout(resolve, Math.min(checkInterval, ms - elapsed)));
      elapsed += checkInterval;
    }
    return abortScan;
  };

  const workers = Array.from({ length: concurrency }, async () => {
    while (cursor < rows.length && !abortScan) {
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        debugLog("Stopping scan: too many consecutive failures", { consecutiveFailures });
        break;
      }

      const row = rows[cursor++];
      if (abortScan) break;

      const ck = cacheKey(row.cardUrl, row.language);
      const gk = cacheKeyGlobal(row.cardUrl);

      // Add a small delay between fetches to avoid hammering Cardmarket
      if (await delayWithAbortCheck(300)) {
        break;
      }

      try {
        const cachedSame = fromCache(cache, ck);
        const cachedGlobal = fromCache(cache, gk);

        let sameLanguageLowest = cachedSame;
        let globalLowest = cachedGlobal;
        let globalLowestLanguage = cache[gk]?.language ?? null;

        if (sameLanguageLowest === null || globalLowest === null) {
          const snapshot = await fetchLowestSnapshot(row.cardUrl, row.language);
          sameLanguageLowest = snapshot.sameLanguagePrice;
          globalLowest = snapshot.globalLowestPrice;
          globalLowestLanguage = snapshot.globalLowestLanguage;

          if (sameLanguageLowest !== null) {
            cache[ck] = { value: sameLanguageLowest, timestamp: Date.now(), language: row.language };
          }
          if (globalLowest !== null) {
            cache[gk] = {
              value: globalLowest,
              timestamp: Date.now(),
              language: globalLowestLanguage ?? undefined
            };
          }
        }

        const tooltip = [
          `Same language (${row.language}): ${sameLanguageLowest !== null ? `${toPriceText(sameLanguageLowest)} EUR` : "no offer"}`,
          `Global lowest (${globalLowestLanguage ?? "unknown"}): ${globalLowest !== null ? `${toPriceText(globalLowest)} EUR` : "no offer"}`
        ].join("\n");

        // Reset consecutive failures on success
        consecutiveFailures = 0;

        if (sameLanguageLowest === null) {
          setRowStatus(row.rowEl, "No same-language offer", "warn", {
            tooltip,
            visiblePrice: null
          });
          debugLog("No matching offer found", {
            articleId: row.articleId,
            cardName: row.cardName,
            language: row.language,
            cardUrl: row.cardUrl
          });
          results.push({
            articleId: row.articleId,
            cardName: row.cardName,
            cardUrl: row.cardUrl,
            language: row.language,
            currentPrice: row.currentPrice,
            suggestedPrice: null,
            status: "no-match"
          });
          continue;
        }

        priceMap.set(row.articleId, sameLanguageLowest);
        prefillExistingInlineInput(row.articleId, sameLanguageLowest);

        setRowStatus(row.rowEl, `${toPriceText(sameLanguageLowest)} EUR`, "ok", {
          tooltip,
          visiblePrice: sameLanguageLowest
        });
        addAcceptButton(row.rowEl, row.articleId, sameLanguageLowest);
        debugLog("Suggested price", {
          articleId: row.articleId,
          cardName: row.cardName,
          language: row.language,
          currentPrice: row.currentPrice,
          suggestedPrice: sameLanguageLowest,
          globalLowest,
          globalLowestLanguage
        });
        results.push({
          articleId: row.articleId,
          cardName: row.cardName,
          cardUrl: row.cardUrl,
          language: row.language,
          currentPrice: row.currentPrice,
          suggestedPrice: sameLanguageLowest,
          status: cachedSame !== null && cachedGlobal !== null ? "cached" : "updated"
        });
      } catch (error) {
        consecutiveFailures++;
        const message = error instanceof Error ? error.message : "Unknown fetch error";
        setRowStatus(row.rowEl, "Failed to fetch product", "err", {
          tooltip: message,
          visiblePrice: null
        });
        debugLog("Row processing error", {
          articleId: row.articleId,
          cardName: row.cardName,
          language: row.language,
          cardUrl: row.cardUrl,
          error: message,
          consecutiveFailures
        });
        results.push({
          articleId: row.articleId,
          cardName: row.cardName,
          cardUrl: row.cardUrl,
          language: row.language,
          currentPrice: row.currentPrice,
          suggestedPrice: null,
          status: "error",
          reason: message
        });

        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          debugLog("Stopping scan due to repeated failures", { consecutiveFailures });
          break;
        }
      }
    }
  });

  await Promise.all(workers);
  abortScan = false;
  await writeCache(cache);
  installModalPrefillBridge(priceMap);
  return results;
}

function renderRunnerButton(): HTMLButtonElement | null {
  if (document.getElementById(RUNNER_ID)) {
    return null;
  }

  const button = document.createElement("button");
  button.id = RUNNER_ID;
  button.type = "button";
  button.textContent = "Scan lowest and prefill";
  button.style.position = "fixed";
  button.style.right = "16px";
  button.style.bottom = "16px";
  button.style.zIndex = "99999";
  button.style.border = "0";
  button.style.borderRadius = "8px";
  button.style.padding = "10px 14px";
  button.style.fontWeight = "700";
  button.style.background = "#0d6efd";
  button.style.color = "#fff";
  button.style.boxShadow = "0 4px 18px rgba(0,0,0,0.25)";
  document.body.appendChild(button);
  return button;
}

function setRunnerState(button: HTMLButtonElement, isBusy: boolean): void {
  button.disabled = isBusy;
  button.style.opacity = isBusy ? "0.7" : "1";
  button.textContent = isBusy ? "Scanning... (click to stop)" : "Scan lowest and prefill";
}

async function runScan(): Promise<void> {
  const rows = findVisibleOfferRows();
  if (!rows.length) {
    alert("No offer rows found on this page.");
    return;
  }

  const startedAt = new Date().toISOString();
  const results = await processRows(rows);
  const finishedAt = new Date().toISOString();

  const changedRows = results.filter((r) => r.suggestedPrice !== null && r.suggestedPrice !== r.currentPrice).length;
  const errorRows = results.filter((r) => r.status === "error").length;

  const runRecord: ScanRunRecord = {
    id: `${Date.now()}`,
    startedAt,
    finishedAt,
    totalRows: results.length,
    changedRows,
    errorRows,
    rows: results
  };

  await pushHistory(runRecord);
  alert(`Scan complete. Processed ${results.length} rows, changed ${changedRows}, errors ${errorRows}.`);
}

function init(): void {
  debugLog("Content script initialized", { url: location.href });
  
  // Add scan buttons to all visible rows
  const offerRows = Array.from(
    document.querySelectorAll<HTMLElement>("#UserOffersTable .table-body .article-row")
  );
  for (const rowEl of offerRows) {
    const articleId = parseArticleId(rowEl);
    const linkEl = rowEl.querySelector<HTMLAnchorElement>(".col-seller a[href*='/Products/Singles/']");
    if (articleId && linkEl) {
      const cardUrl = new URL(linkEl.getAttribute("href") || "", location.origin).toString();
      const language = detectLanguage(rowEl);
      addScanButton(rowEl, articleId, cardUrl, language);
    }
  }

  const button = renderRunnerButton();
  if (!button) {
    return;
  }

  let isScanning = false;

  button.addEventListener("click", async () => {
    if (isScanning) {
      // Second click: stop the scan
      debugLog("Stop button clicked");
      abortScan = true;
      return;
    }

    try {
      isScanning = true;
      setRunnerState(button, true);
      await runScan();
    } finally {
      isScanning = false;
      setRunnerState(button, false);
    }
  });
}

init();

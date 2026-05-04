import type { LowestPriceSnapshot } from "./shared";

chrome.runtime.onInstalled.addListener(() => {
  // Reserved for future cross-tab orchestration.
});

const CACHE_KEY = "cmpu.cache";
const HISTORY_KEY = "cmpu.history";

type StorageMessage = {
  action: "getCache" | "setCache" | "getHistory" | "setHistory";
  key?: string;
  value?: unknown;
};

type ScrapeTabMessage = {
  action: "scrapeTab";
  cardUrl: string;
  language: string;
};

type ScrapeTabResponse =
  | { ok: true; snapshot: LowestPriceSnapshot }
  | { ok: false; error: string };

function scrapeTab(
  cardUrl: string,
  language: string,
  sendResponse: (response: ScrapeTabResponse) => void
): void {
  let responded = false;

  const respond = (res: ScrapeTabResponse): void => {
    if (responded) return;
    responded = true;
    sendResponse(res);
  };

  chrome.tabs.create({ url: cardUrl, active: false }, (tab) => {
    if (!tab.id) {
      respond({ ok: false, error: "Tab creation failed" });
      return;
    }

    const tabId = tab.id;

    // Safety timeout: close tab and report failure after 20 s.
    const safetyTimer = globalThis.setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.tabs.remove(tabId, () => {});
      respond({ ok: false, error: "Tab load timeout" });
    }, 20000);

    const onUpdated = (
      id: number,
      info: chrome.tabs.TabChangeInfo
    ): void => {
      if (id !== tabId || info.status !== "complete") return;

      chrome.tabs.onUpdated.removeListener(onUpdated);

      // Small settle delay so content script listeners are registered.
      setTimeout(() => {
        chrome.tabs.sendMessage(
          tabId,
          { action: "scrapePrice", language },
          (response: { ok: boolean; snapshot?: LowestPriceSnapshot; error?: string } | undefined) => {
            globalThis.clearTimeout(safetyTimer);
            chrome.tabs.remove(tabId, () => {});

            if (chrome.runtime.lastError || !response?.ok || !response.snapshot) {
              respond({
                ok: false,
                error: chrome.runtime.lastError?.message ?? response?.error ?? "No scrape response"
              });
              return;
            }

            respond({ ok: true, snapshot: response.snapshot });
          }
        );
      }, 600);
    };

    chrome.tabs.onUpdated.addListener(onUpdated);
  });
}

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  const msg = message as StorageMessage & ScrapeTabMessage;

  if (msg.action === "scrapeTab") {
    scrapeTab(msg.cardUrl, msg.language, sendResponse);
    return true;
  }

  if (msg.action === "getCache") {
    chrome.storage.local.get([CACHE_KEY], (items) => {
      sendResponse((items[CACHE_KEY] as Record<string, unknown>) ?? {});
    });
    return true;
  }

  if (msg.action === "setCache") {
    chrome.storage.local.set({ [CACHE_KEY]: msg.value }, () => {
      sendResponse({ ok: true });
    });
    return true;
  }

  if (msg.action === "getHistory") {
    chrome.storage.local.get([HISTORY_KEY], (items) => {
      sendResponse((items[HISTORY_KEY] as unknown[]) ?? []);
    });
    return true;
  }

  if (msg.action === "setHistory") {
    chrome.storage.local.set({ [HISTORY_KEY]: msg.value }, () => {
      sendResponse({ ok: true });
    });
    return true;
  }
});


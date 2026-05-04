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

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  const msg = message as StorageMessage;

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


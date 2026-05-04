type ScanRunRecord = {
  id: string;
  startedAt: string;
  finishedAt: string;
  totalRows: number;
  changedRows: number;
  errorRows: number;
};

const HISTORY_KEY = "cmpu.history";
const CACHE_KEY = "cmpu.cache";

function getStore<T>(key: string, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    try {
      const action = key === HISTORY_KEY ? "getHistory" : "getCache";
      chrome.runtime.sendMessage(
        { action },
        (response: unknown) => {
          if (chrome.runtime.lastError) {
            console.error("[CMPU-POPUP] Message error:", chrome.runtime.lastError.message);
            resolve(fallback);
            return;
          }
          resolve((response as T | undefined) ?? fallback);
        }
      );
    } catch (e) {
      console.error("[CMPU-POPUP] Message exception:", e);
      resolve(fallback);
    }
  });
}

function setStore<T>(key: string, value: T): Promise<void> {
  return new Promise((resolve) => {
    try {
      const action = key === HISTORY_KEY ? "setHistory" : "setCache";
      chrome.runtime.sendMessage(
        { action, value },
        (_response: unknown) => {
          if (chrome.runtime.lastError) {
            console.error("[CMPU-POPUP] Message error:", chrome.runtime.lastError.message);
          }
          resolve();
        }
      );
    } catch (e) {
      console.error("[CMPU-POPUP] Message exception:", e);
      resolve();
    }
  });
}

function fmt(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
}

async function render(): Promise<void> {
  const summary = document.getElementById("summary");
  if (!summary) {
    return;
  }

  const history = await getStore<ScanRunRecord[]>(HISTORY_KEY, []);
  const run = history[0];
  if (!run) {
    summary.textContent = "No runs yet.";
    return;
  }

  summary.innerHTML = [
    `Started: ${fmt(run.startedAt)}`,
    `Finished: ${fmt(run.finishedAt)}`,
    `Rows scanned: ${run.totalRows}`,
    `Rows changed: ${run.changedRows}`,
    `Rows with errors: ${run.errorRows}`
  ].join("<br>");
}

function bind(): void {
  const clear = document.getElementById("clear");
  if (!clear) {
    return;
  }

  clear.addEventListener("click", async () => {
    await setStore(HISTORY_KEY, []);
    await setStore(CACHE_KEY, {});
    await render();
  });
}

void render();
bind();

const recordCount = document.getElementById("record-count");
const lastUpdated = document.getElementById("last-updated");
const enableToggle = document.getElementById("enable-scrape");
const exportJson = document.getElementById("export-json");
const exportCsv = document.getElementById("export-csv");
const clearData = document.getElementById("clear-data");
const scrapeDom = document.getElementById("scrape-dom");

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function updateStats() {
  const { records = [] } = await chrome.storage.local.get({ records: [] });
  recordCount.textContent = String(records.length);
  if (records.length) {
    const last = records[records.length - 1];
    lastUpdated.textContent = new Date(last.capturedAt).toLocaleString();
  } else {
    lastUpdated.textContent = "--";
  }
}

async function setEnabledState(enabled) {
  enableToggle.checked = enabled;
  await chrome.storage.local.set({ scrapeEnabled: enabled });
  const tab = await getActiveTab();
  if (tab?.id) {
    chrome.tabs.sendMessage(tab.id, {
      type: "591_SCRAPER_ENABLE",
      enabled,
    });
  }
}

async function exportData(format) {
  const { records = [] } = await chrome.storage.local.get({ records: [] });
  if (!records.length) return;
  const payload = format === "csv" ? toCsv(records) : JSON.stringify(records, null, 2);
  const blob = new Blob([payload], {
    type: format === "csv" ? "text/csv" : "application/json",
  });
  const url = URL.createObjectURL(blob);
  const filename = `591-listings-${new Date().toISOString()}.${format}`;
  chrome.downloads.download({ url, filename, saveAs: true }, () => {
    URL.revokeObjectURL(url);
  });
}

function toCsv(records) {
  const headers = ["title", "price", "area", "address", "contact", "url", "source", "capturedAt"];
  const rows = records.map((record) =>
    headers.map((header) => escapeCsv(record[header] || "")).join(",")
  );
  return [headers.join(","), ...rows].join("\n");
}

function escapeCsv(value) {
  const text = String(value ?? "");
  if (text.includes(",") || text.includes("\n") || text.includes('"')) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

async function clearRecords() {
  await chrome.storage.local.set({ records: [] });
  await updateStats();
}

async function captureDomNow() {
  const tab = await getActiveTab();
  if (tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: "591_SCRAPER_SCRAPE_DOM" });
  }
}

enableToggle.addEventListener("change", (event) => {
  setEnabledState(event.target.checked);
});

exportJson.addEventListener("click", () => exportData("json"));
exportCsv.addEventListener("click", () => exportData("csv"));
clearData.addEventListener("click", clearRecords);
scrapeDom.addEventListener("click", captureDomNow);

(async () => {
  const { scrapeEnabled = false } = await chrome.storage.local.get({
    scrapeEnabled: false,
  });
  enableToggle.checked = scrapeEnabled;
  await updateStats();
  chrome.storage.onChanged.addListener(updateStats);
})();

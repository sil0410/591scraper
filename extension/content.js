const STATE = {
  active: false,
  enabled: false,
  hasUserInteracted: false,
  lastCaptureAt: 0,
  minIntervalMs: 1500,
  maxRecords: 500,
};

const LISTING_KEYS = {
  price: ["price", "rent", "money"],
  address: ["address", "addr", "location"],
  area: ["area", "ping", "size"],
  contact: ["phone", "tel", "mobile", "contact", "owner"],
};

const ACTIVATE_EVENTS = ["click", "keydown", "scroll", "touchstart"];

function now() {
  return Date.now();
}

function normalizeText(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value.trim();
  return JSON.stringify(value);
}

function getTextFromElement(element, selectors) {
  for (const selector of selectors) {
    const found = element.querySelector(selector);
    if (found && found.textContent) return found.textContent.trim();
  }
  return "";
}

function extractFromDom() {
  const cards = Array.from(
    document.querySelectorAll(
      "[data-houseid], [data-id], .item, .item-info, .list-item, .house-list-item"
    )
  );

  const listings = [];
  for (const card of cards) {
    const link = card.querySelector('a[href*="rent.591.com.tw"]');
    const title = getTextFromElement(card, [
      ".title",
      ".item-title",
      ".house-title",
      "h3",
      "h2",
    ]);
    const price = getTextFromElement(card, [".price", ".item-price", ".money"]);
    const area = getTextFromElement(card, [".area", ".ping", ".size"]);
    const address = getTextFromElement(card, [".address", ".addr", ".item-address"]);

    if (title || price || address || area) {
      listings.push({
        title,
        price,
        area,
        address,
        url: link ? link.href : "",
        source: "dom",
        capturedAt: new Date().toISOString(),
      });
    }
  }
  return listings;
}

function objectMatchesListing(obj) {
  const keys = Object.keys(obj || {});
  let hits = 0;
  for (const [field, candidates] of Object.entries(LISTING_KEYS)) {
    if (candidates.some((candidate) => keys.includes(candidate))) {
      hits += 1;
    }
  }
  return hits >= 2;
}

function pickListingFields(obj) {
  const result = { source: "network", capturedAt: new Date().toISOString() };
  for (const [field, candidates] of Object.entries(LISTING_KEYS)) {
    for (const candidate of candidates) {
      if (Object.prototype.hasOwnProperty.call(obj, candidate)) {
        result[field] = normalizeText(obj[candidate]);
        break;
      }
    }
  }
  if (obj.title) result.title = normalizeText(obj.title);
  if (obj.url) result.url = normalizeText(obj.url);
  return result;
}

function collectListingsFromJson(payload) {
  const listings = [];
  const stack = [payload];
  const visited = new Set();

  while (stack.length) {
    const current = stack.pop();
    if (!current || typeof current !== "object") continue;
    if (visited.has(current)) continue;
    visited.add(current);

    if (Array.isArray(current)) {
      for (const item of current) stack.push(item);
      continue;
    }

    if (objectMatchesListing(current)) {
      listings.push(pickListingFields(current));
    }

    for (const value of Object.values(current)) {
      if (value && typeof value === "object") stack.push(value);
    }
  }

  return listings;
}

function shouldCapture() {
  if (!STATE.enabled || !STATE.active) return false;
  const elapsed = now() - STATE.lastCaptureAt;
  if (elapsed < STATE.minIntervalMs) return false;
  STATE.lastCaptureAt = now();
  return true;
}

async function storeListings(listings, meta = {}) {
  if (!listings.length) return;
  const { records = [] } = await chrome.storage.local.get({ records: [] });
  const updated = records.concat(
    listings.map((listing) => ({ ...listing, ...meta }))
  );
  if (updated.length > STATE.maxRecords) {
    updated.splice(0, updated.length - STATE.maxRecords);
  }
  await chrome.storage.local.set({ records: updated });
}

function handleNetworkPayload(payload) {
  if (!shouldCapture()) return;

  try {
    const parsed = JSON.parse(payload.body);
    const listings = collectListingsFromJson(parsed);
    storeListings(listings, { url: payload.url, method: payload.method });
  } catch (error) {
    // Ignore invalid JSON payloads.
  }
}

function injectScript() {
  const script = document.createElement("script");
  script.src = chrome.runtime.getURL("inject.js");
  script.dataset.extension = "591-scraper-helper";
  document.documentElement.appendChild(script);
  script.remove();
}

function enableScraping() {
  if (!STATE.enabled || STATE.active) return;
  STATE.active = true;
  extractAndStoreDom();
}

async function extractAndStoreDom(force = false) {
  if (!force && !shouldCapture()) return;
  const listings = extractFromDom();
  await storeListings(listings, { url: location.href });
}

function handleActivationEvent() {
  STATE.hasUserInteracted = true;
  enableScraping();
  ACTIVATE_EVENTS.forEach((eventName) =>
    window.removeEventListener(eventName, handleActivationEvent)
  );
}

ACTIVATE_EVENTS.forEach((eventName) =>
  window.addEventListener(eventName, handleActivationEvent, { once: true })
);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "591_SCRAPER_ENABLE") {
    STATE.enabled = message.enabled;
    if (STATE.enabled && STATE.hasUserInteracted) {
      enableScraping();
    }
    sendResponse({ ok: true });
  }
  if (message?.type === "591_SCRAPER_SCRAPE_DOM") {
    extractAndStoreDom(true);
    sendResponse({ ok: true });
  }
});

window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  if (!event.data || event.data.type !== "591_SCRAPER_NETWORK") return;
  handleNetworkPayload(event.data.payload);
});

injectScript();

chrome.storage.local.get({ scrapeEnabled: false }).then(({ scrapeEnabled }) => {
  STATE.enabled = scrapeEnabled;
  if (STATE.enabled && STATE.hasUserInteracted) {
    enableScraping();
  }
});

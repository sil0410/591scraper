(() => {
  const KEYWORDS = [
    "price",
    "money",
    "rent",
    "address",
    "addr",
    "location",
    "area",
    "ping",
    "size",
    "phone",
    "tel",
    "contact",
  ];

  function shouldPost(bodyText) {
    if (!bodyText) return false;
    return KEYWORDS.some((keyword) => bodyText.includes(keyword));
  }

  function postPayload(payload) {
    window.postMessage(
      {
        type: "591_SCRAPER_NETWORK",
        payload,
      },
      "*"
    );
  }

  const originalFetch = window.fetch;
  window.fetch = async (...args) => {
    const response = await originalFetch(...args);
    try {
      const clone = response.clone();
      const text = await clone.text();
      if (shouldPost(text)) {
        postPayload({
          url: response.url,
          method: (args[1] && args[1].method) || "GET",
          body: text,
        });
      }
    } catch (error) {
      // Ignore fetch interception errors.
    }
    return response;
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function open(method, url, ...rest) {
    this.__scraperMeta = { method, url };
    return originalOpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function send(...args) {
    this.addEventListener("load", () => {
      try {
        const text = this.responseText;
        if (shouldPost(text)) {
          postPayload({
            url: this.__scraperMeta?.url || "",
            method: this.__scraperMeta?.method || "GET",
            body: text,
          });
        }
      } catch (error) {
        // Ignore XHR interception errors.
      }
    });
    return originalSend.apply(this, args);
  };
})();

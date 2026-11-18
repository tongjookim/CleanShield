/** Content-script entry point. */
(() => {
  const NS = globalThis.CleanShield;
  if (!NS) return;

  const BASE_STYLE_ID = "cs-base-style";
  const pending = Object.create(null);
  let flushTimer = null;
  let currentConfig = null;
  let disposed = false;

  NS.Keywords = new NS.KeywordFilter({
    report: (key, value) => report(key, value),
  });

  function report(key, value = 1) {
    if (disposed) return;
    pending[key] = (pending[key] || 0) + value;
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      const stats = { ...pending };
      for (const keyName of Object.keys(pending)) delete pending[keyName];
      chrome.runtime.sendMessage({ type: "stats:inc", stats }).catch(() => {});
    }, 700);
  }
  NS.report = report;

  function ensureBaseStyle() {
    if (document.getElementById(BASE_STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = BASE_STYLE_ID;
    style.textContent = `
      .cs-keyword-hidden { display: none !important; }
      .cs-short-hidden { display: none !important; }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function removeBaseStyle() {
    document.getElementById(BASE_STYLE_ID)?.remove();
  }

  function teardown() {
    NS.Cosmetic.apply({ enabled: false });
    NS.Shortform.apply(null);
    NS.Keywords.configure({ enabled: false, items: [] });
    removeBaseStyle();
  }

  function apply(config) {
    currentConfig = config;
    if (!config || !config.enabled) {
      teardown();
      return;
    }
    ensureBaseStyle();
    NS.Cosmetic.apply(config.cosmetic);
    NS.Keywords.configure(config.keyword, location.hostname);
    NS.Shortform.apply(config.shortform, location.hostname);
  }

  async function loadConfig() {
    if (disposed) return;
    try {
      const config = await chrome.runtime.sendMessage({
        type: "cs:config",
        host: location.hostname,
      });
      if (config && config.enabled === false) {
        apply(config);
        return;
      }
      apply(config);
    } catch (error) {
      // The extension was reloaded or the worker is unavailable; retry once.
      if (disposed) return;
      setTimeout(loadConfig, 800);
    }
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (!message || typeof message !== "object") return;
    if (message.type === "cs:config-updated") loadConfig();
    if (message.type === "cs:toast" && typeof message.text === "string") showToast(message.text);
  });

  function showToast(text) {
    const existing = document.getElementById("cs-toast");
    existing?.remove();
    const host = document.createElement("div");
    host.id = "cs-toast";
    host.style.cssText =
      "position:fixed;right:18px;bottom:18px;z-index:2147483647;pointer-events:none;";
    const shadow = host.attachShadow({ mode: "closed" });
    shadow.innerHTML = `
      <style>
        .toast {
          font: 600 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", "Apple SD Gothic Neo", sans-serif;
          color: #eafffb; background: linear-gradient(135deg, #0f766e, #115e59);
          padding: 12px 16px; border-radius: 12px;
          box-shadow: 0 12px 34px rgba(6, 40, 37, .4);
          border: 1px solid rgba(94, 234, 212, .3);
          max-width: 320px;
        }
      </style>
      <div class="toast"></div>`;
    shadow.querySelector(".toast").textContent = text;
    (document.body || document.documentElement).appendChild(host);
    setTimeout(() => host.remove(), 2800);
  }

  loadConfig();
})();

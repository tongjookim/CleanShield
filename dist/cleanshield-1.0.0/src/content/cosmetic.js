/** Element hiding filters (EasyList / List-KR stylesheets). */
(() => {
  const NS = globalThis.CleanShield;
  if (!NS) return;

  const STYLE_ID = "cs-cosmetic-style";
  const GENERIC_STYLE_ID = "cs-generic-style";
  let genericCssRequested = false;
  const counted = new WeakSet();
  const MAX_SELECTORS = 1200;

  function ensureStyle() {
    let style = document.getElementById(STYLE_ID);
    if (style) return style;
    style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = "";
    (document.head || document.documentElement).appendChild(style);
    return style;
  }

  function removeAll() {
    document.getElementById(STYLE_ID)?.remove();
    document.getElementById(GENERIC_STYLE_ID)?.remove();
  }

  async function loadGenericCss() {
    if (genericCssRequested) return;
    genericCssRequested = true;
    try {
      const response = await chrome.runtime.sendMessage({ type: "cs:generic-css" });
      if (!response?.ok || !response.css) return;
      const style = document.createElement("style");
      style.id = GENERIC_STYLE_ID;
      style.textContent = response.css;
      (document.head || document.documentElement).appendChild(style);
    } catch (error) {
      console.warn("[CleanShield] generic css unavailable", error);
      genericCssRequested = false;
    }
  }

  function buildCss(selectors) {
    const seen = new Set();
    const rules = [];
    for (const selector of selectors) {
      if (typeof selector !== "string" || !selector || seen.has(selector)) continue;
      if (/[{};@]/.test(selector)) continue;
      seen.add(selector);
      rules.push(`${selector}{display:none!important}`);
      if (rules.length >= MAX_SELECTORS) break;
    }
    return rules.join("\n");
  }

  function countMatches(selectors) {
    const usable = selectors
      .filter((selector) => typeof selector === "string" && selector && !selector.includes("::"))
      .slice(0, MAX_SELECTORS);
    let total = 0;
    for (let index = 0; index < usable.length; index += 120) {
      const chunk = usable.slice(index, index + 120);
      try {
        const nodes = document.querySelectorAll(`:is(${chunk.join(",")})`);
        for (const node of nodes) {
          if (counted.has(node)) continue;
          counted.add(node);
          total += 1;
        }
      } catch {
        // A single unsupported selector invalidates the whole :is() group.
        // Fall back to individual queries for this small chunk.
        for (const selector of chunk) {
          try {
            const nodes = document.querySelectorAll(selector);
            for (const node of nodes) {
              if (counted.has(node)) continue;
              counted.add(node);
              total += 1;
            }
          } catch {
            // Ignore selectors Chrome cannot parse.
          }
        }
      }
    }
    return total;
  }

  NS.Cosmetic = {
    apply(config) {
      if (!config || !config.enabled) {
        removeAll();
        return;
      }
      const style = ensureStyle();
      style.textContent = buildCss(config.selectors || []);

      if (!document.getElementById(GENERIC_STYLE_ID)) genericCssRequested = false;
      loadGenericCss();

      const runCount = () => {
        if (!config.enabled) return;
        const total = countMatches([...(config.selectors || [])]);
        if (total > 0) NS.report?.("elements", total);
      };
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", runCount, { once: true });
      } else {
        setTimeout(runCount, 0);
      }
      setTimeout(runCount, 1800);
    },
  };
})();

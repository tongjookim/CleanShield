/** Small helpers shared by the service worker and extension pages. */

export function hostFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

export function isSameOrSubdomain(host, parent) {
  if (!host || !parent) return false;
  return host === parent || host.endsWith(`.${parent}`);
}

export function findBlockingSite(settings, host) {
  if (!host) return null;
  const allowed = settings.sites.allowed.some((domain) => isSameOrSubdomain(host, domain));
  if (allowed) return null;
  return (
    settings.sites.blocked.find((site) => site.enabled && isSameOrSubdomain(host, site.domain)) || null
  );
}

export function isSiteAllowed(settings, host) {
  return settings.sites.allowed.some((domain) => isSameOrSubdomain(host, domain));
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function formatNumber(value) {
  const number = Number(value) || 0;
  if (number >= 1_000_000) return `${(number / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (number >= 10_000) return `${(number / 1000).toFixed(0)}K`;
  return number.toLocaleString("ko-KR");
}

export function uid(prefix = "id") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function debounce(fn, delay) {
  let timer = null;
  return (...args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, delay);
  };
}

export function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function chromeCall(fn) {
  return new Promise((resolve, reject) => {
    fn((result) => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve(result);
    });
  });
}

/**
 * Shared state schema and default values.
 *
 * Everything lives in chrome.storage.local: filter lists can be large and the
 * extension deliberately does not sync personal block lists to a Google
 * account. Settings and statistics use separate storage keys so a statistics
 * write can never clobber a settings change (and vice versa).
 */

export const STATE_VERSION = 2;
export const SETTINGS_KEY = "settings";
export const STATS_KEY = "stats";
export const STORAGE_KEY = "state"; // legacy key, read once for migration

export function todayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function createDefaultStats() {
  return {
    date: todayKey(),
    network: 0,
    elements: 0,
    posts: 0,
    shorts: 0,
    sites: 0,
  };
}

export function createDefaultSettings() {
  return {
    version: STATE_VERSION,
    enabled: true,
    ads: true,
    tracking: true,
    korean: true,
    cosmetic: true,
    keyword: {
      enabled: true,
      items: [],
    },
    shortform: {
      enabled: true,
      platforms: {
        youtube: { hide: true, redirect: false },
        instagram: { hide: true, redirect: false },
        facebook: { hide: true, redirect: false },
        tiktok: { hide: true, block: false },
        naver: { hide: true, redirect: false },
      },
    },
    sites: {
      blocked: [],
      allowed: [],
    },
    google: {
      keywords: [],
      blocked: [],
      enabled: true,
    },
    customFilters: "",
    ui: {
      theme: "auto",
      onboardingDone: false,
    },
    meta: {
      installedAt: Date.now(),
    },
  };
}

export function createDefaultState() {
  return { ...createDefaultSettings(), stats: createDefaultStats() };
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function normalizeKeyword(raw) {
  if (!raw || typeof raw !== "object") return null;
  const text = typeof raw.text === "string" ? raw.text.trim() : "";
  if (!text || text.length > 200) return null;
  const match = ["contains", "word", "regex"].includes(raw.match) ? raw.match : "contains";
  const scopes = Array.isArray(raw.scopes)
    ? raw.scopes.filter((scope) => typeof scope === "string" && scope.length < 40).slice(0, 20)
    : [];
  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : `k_${Math.random().toString(36).slice(2, 10)}`,
    text,
    match,
    scopes,
    caseSensitive: raw.caseSensitive === true,
    createdAt: Number(raw.createdAt) || Date.now(),
  };
}

export function normalizeDomain(raw) {
  if (typeof raw !== "string") return null;
  let value = raw.trim().toLowerCase();
  if (!value) return null;
  if (value.includes("://")) {
    try {
      value = new URL(value).hostname;
    } catch {
      return null;
    }
  }
  value = value.replace(/^\*\./, "").replace(/\.$/, "").split("/")[0].split("?")[0];
  if (value.startsWith("www.")) value = value.slice(4);
  if (!value || value.length > 253) return null;
  try {
    value = new URL(`http://${value}`).hostname;
  } catch {
    return null;
  }
  if (value === "localhost") return value;
  if (!value.includes(".") || !/^[a-z0-9.-]+$/.test(value) || value.includes("..")) return null;
  return value;
}

export function normalizeSiteEntry(raw) {
  if (!raw || typeof raw !== "object") return null;
  const domain = normalizeDomain(raw.domain);
  if (!domain) return null;
  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : `s_${Math.random().toString(36).slice(2, 10)}`,
    domain,
    enabled: raw.enabled !== false,
    note: typeof raw.note === "string" ? raw.note.slice(0, 120) : "",
    createdAt: Number(raw.createdAt) || Date.now(),
  };
}

/**
 * Merge stored settings over defaults and discard malformed values. This keeps
 * old installations working after a schema change without a migration script.
 */
export function normalizeSettings(raw) {
  const defaults = createDefaultSettings();
  if (!isObject(raw)) return defaults;
  const output = { ...defaults };

  for (const key of ["enabled", "ads", "tracking", "korean", "cosmetic"]) {
    if (typeof raw[key] === "boolean") output[key] = raw[key];
  }

  if (isObject(raw.keyword)) {
    output.keyword.enabled = raw.keyword.enabled !== false;
    if (Array.isArray(raw.keyword.items)) {
      const seen = new Set();
      output.keyword.items = raw.keyword.items
        .map(normalizeKeyword)
        .filter(Boolean)
        .filter((item) => {
          const key = item.text.toLowerCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .slice(0, 2000);
    }
  }

  if (isObject(raw.shortform)) {
    output.shortform.enabled = raw.shortform.enabled !== false;
    if (isObject(raw.shortform.platforms)) {
      for (const platform of Object.keys(defaults.shortform.platforms)) {
        const stored = raw.shortform.platforms[platform];
        if (!isObject(stored)) continue;
        const target = output.shortform.platforms[platform];
        if (typeof stored.hide === "boolean") target.hide = stored.hide;
        if (typeof stored.redirect === "boolean") target.redirect = stored.redirect;
        if (typeof stored.block === "boolean") target.block = stored.block;
      }
    }
  }

  if (isObject(raw.sites)) {
    if (Array.isArray(raw.sites.blocked)) {
      const seen = new Set();
      output.sites.blocked = raw.sites.blocked
        .map(normalizeSiteEntry)
        .filter(Boolean)
        .filter((site) => {
          if (seen.has(site.domain)) return false;
          seen.add(site.domain);
          return true;
        })
        .slice(0, 500);
    }
    if (Array.isArray(raw.sites.allowed)) {
      output.sites.allowed = [...new Set(raw.sites.allowed.map(normalizeDomain).filter(Boolean))].slice(0, 1000);
    }
  }

  if (isObject(raw.google)) {
    if (Array.isArray(raw.google.keywords)) {
      output.google = output.google || createDefaultSettings().google;
      const seen = new Set();
      output.google.keywords = raw.google.keywords
        .map((kw) => ({
          id: typeof kw.id === "string" && kw.id ? kw.id : `gk_${Math.random().toString(36).slice(2, 10)}`,
          text: typeof kw.text === "string" ? kw.text.slice(0, 200) : "",
          match: ["contains", "word", "regex"].includes(kw.match) ? kw.match : "contains",
          scopes: Array.isArray(kw.scopes) ? kw.scopes.slice(0, 20) : [],
          caseSensitive: kw.caseSensitive === true,
          createdAt: Number(kw.createdAt) || Date.now(),
        }))
        .filter((item) => {
          const key = `${item.text.toLowerCase()}|${item.match}|${(item.scopes || []).join(",")}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
    }
    if (Array.isArray(raw.google.blocked)) {
      output.google = output.google || createDefaultSettings().google;
      output.google.blocked = raw.google.blocked
        .map((domain) => {
          const d = normalizeDomain(domain);
          return d ? { id: `gs_${Date.now().toString(36)}`, domain: d, enabled: true, note: "", createdAt: Date.now() } : null;
        })
        .filter(Boolean);
    }
    // Ensure enabled defaults to true
    if (typeof raw.google.enabled === "boolean") output.google.enabled = raw.google.enabled;
    else output.google.enabled = true;
  }

  if (typeof raw.customFilters === "string") {
    output.customFilters = raw.customFilters.slice(0, 120000);
  }
  if (isObject(raw.ui)) {
    if (["auto", "light", "dark"].includes(raw.ui.theme)) output.ui.theme = raw.ui.theme;
    output.ui.onboardingDone = raw.ui.onboardingDone === true;
  }
  if (isObject(raw.meta)) {
    output.meta.installedAt = Number(raw.meta.installedAt) || defaults.meta.installedAt;
  }
  output.version = STATE_VERSION;
  return output;
}

export function normalizeStats(raw) {
  const fresh = createDefaultStats();
  if (!isObject(raw) || raw.date !== fresh.date) return fresh;
  for (const key of ["network", "elements", "posts", "shorts", "sites"]) {
    const value = Number(raw[key]);
    fresh[key] = Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
  }
  return fresh;
}

export function normalizeState(raw) {
  if (!isObject(raw)) return createDefaultState();
  return {
    ...normalizeSettings(raw),
    stats: normalizeStats(raw.stats),
  };
}

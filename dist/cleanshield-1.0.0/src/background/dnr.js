/**
 * Declarative Net Request orchestration.
 *
 * Dynamic rule id ranges:
 *   100-199  short-form redirects / blocks
 *   1000-1499 user site block list
 *   3000-3799 user supplied filters
 * Session rules (temporary "allow for 5 minutes") use 10000-14999.
 */

import { parseFilterList } from "../shared/filter-parser.js";
import { escapeRegExp, isSameOrSubdomain } from "../shared/util.js";

export const RULE_RANGES = {
  shortform: [100, 199],
  site: [1000, 1499],
  custom: [3000, 3799],
};

const BLOCKED_PAGE = "src/ui/blocked.html";
const MAX_SITES = 500;
const MAX_CUSTOM_RULES = 800;
const MAX_SHORTFORM_RULES = 10;

let cosmeticDataPromise = null;
let genericCssPromise = null;
let customCosmeticCache = { source: null, entries: [], warnings: [] };
let selectorsCache = new Map();

export function getBlockedPageUrl() {
  return chrome.runtime.getURL(BLOCKED_PAGE);
}

async function loadCosmeticData() {
  if (!cosmeticDataPromise) {
    cosmeticDataPromise = fetch(chrome.runtime.getURL("data/cosmetic.json"))
      .then((response) => {
        if (!response.ok) throw new Error(`cosmetic.json: ${response.status}`);
        return response.json();
      })
      .catch((error) => {
        console.warn("[CleanShield] cosmetic data unavailable", error);
        return { generic: [], domains: {} };
      });
  }
  return cosmeticDataPromise;
}

export async function getGenericCss() {
  if (!genericCssPromise) {
    genericCssPromise = fetch(chrome.runtime.getURL("rules/cosmetic-generic.css"))
      .then((response) => (response.ok ? response.text() : ""))
      .catch((error) => {
        console.warn("[CleanShield] generic cosmetic css unavailable", error);
        return "";
      });
  }
  return genericCssPromise;
}

export function parseCustomFilters(source) {
  if (customCosmeticCache.source === source) return customCosmeticCache;
  const parsed = parseFilterList(source || "", {
    maxRules: MAX_CUSTOM_RULES,
    maxCosmetic: 400,
  });
  customCosmeticCache = {
    source,
    entries: parsed.cosmetic,
    warnings: parsed.warnings,
    rules: parsed.rules,
  };
  selectorsCache = new Map();
  return customCosmeticCache;
}

export async function selectorsForHost(settings, host) {
  if (!host) return [];
  const custom = parseCustomFilters(settings.customFilters);
  const cacheKey = host;
  if (selectorsCache.has(cacheKey)) return selectorsCache.get(cacheKey);

  const data = await loadCosmeticData();
  const selectors = new Set();
  const parts = host.split(".");
  for (let index = 0; index < parts.length; index += 1) {
    const candidate = parts.slice(index).join(".");
    const list = data.domains?.[candidate];
    if (Array.isArray(list)) {
      for (const selector of list) selectors.add(selector);
    }
  }
  for (const entry of custom.entries) {
    if (!entry.domains.length || entry.domains.some((domain) => isSameOrSubdomain(host, domain))) {
      selectors.add(entry.selector);
    }
  }
  const result = [...selectors].slice(0, 1200);
  if (selectorsCache.size > 60) selectorsCache.clear();
  selectorsCache.set(cacheKey, result);
  return result;
}

function siteRule(entry, allowedDomains, id) {
  const domain = entry.domain;
  const regex = new RegExp(`^(https?)://([^/?#]*\\.)?${escapeRegExp(domain)}(?::(\\d+))?(?:[/?#].*)?$`);
  const condition = {
    regexFilter: regex.source,
    resourceTypes: ["main_frame"],
  };
  if (allowedDomains.length) condition.excludedRequestDomains = allowedDomains;
  return {
    id,
    priority: 500,
    action: {
      type: "redirect",
      redirect: {
        regexSubstitution: `${getBlockedPageUrl()}?scheme=\\1&host=\\2${domain}&port=\\3&kind=site`,
      },
    },
    condition,
  };
}

function shortformRules(settings) {
  if (!settings.shortform.enabled) return [];
  const rules = [];
  const platform = settings.shortform.platforms;
  let id = RULE_RANGES.shortform[0];

  if (platform.youtube?.redirect) {
    rules.push({
      id: id++,
      priority: 200,
      action: {
        type: "redirect",
        redirect: { regexSubstitution: "https://www.youtube.com/watch?v=\\1" },
      },
      condition: {
        regexFilter: "^https?://(?:[^/?#]+\\.)?youtube\\.com/shorts/([A-Za-z0-9_-]{5,})(?:[?#].*)?$",
        resourceTypes: ["main_frame"],
      },
    });
  }

  if (platform.instagram?.redirect) {
    rules.push({
      id: id++,
      priority: 200,
      action: {
        type: "redirect",
        redirect: { regexSubstitution: "https://www.instagram.com/" },
      },
      condition: {
        regexFilter: "^https?://(?:[^/?#]+\\.)?instagram\\.com/reels?(?:[/?#].*)?$",
        resourceTypes: ["main_frame"],
      },
    });
  }

  if (platform.facebook?.redirect) {
    rules.push({
      id: id++,
      priority: 200,
      action: {
        type: "redirect",
        redirect: { regexSubstitution: "https://www.facebook.com/" },
      },
      condition: {
        regexFilter: "^https?://(?:[^/?#]+\\.)?facebook\\.com/reel(?:[/?#].*)?$",
        resourceTypes: ["main_frame"],
      },
    });
  }

  if (platform.tiktok?.block) {
    rules.push({
      id: id++,
      priority: 400,
      action: {
        type: "redirect",
        redirect: {
          regexSubstitution: `${getBlockedPageUrl()}?host=tiktok.com&kind=shortform`,
        },
      },
      condition: {
        regexFilter: "^https?://(?:[^/?#]+\\.)?tiktok\\.com(?:[:/?#].*)?$",
        resourceTypes: ["main_frame"],
      },
    });
  }

  return rules.slice(0, MAX_SHORTFORM_RULES);
}

function customRules(settings) {
  const parsed = parseCustomFilters(settings.customFilters || "");
  return parsed.rules.slice(0, MAX_CUSTOM_RULES).map((rule, index) => ({
    ...rule,
    id: RULE_RANGES.custom[0] + index,
  }));
}

export async function syncDynamicRules(settings) {
  const allowed = settings.sites.allowed || [];
  const rules = [];

  rules.push(...shortformRules(settings));

  const enabledSites = settings.sites.blocked.filter((site) => site.enabled).slice(0, MAX_SITES);
  enabledSites.forEach((entry, index) => {
    rules.push(siteRule(entry, allowed, RULE_RANGES.site[0] + index));
  });

  rules.push(...customRules(settings));

  const ids = new Set();
  for (const rule of rules) {
    if (ids.has(rule.id)) throw new Error(`Duplicate DNR rule id ${rule.id}`);
    ids.add(rule.id);
  }
  if (rules.length > 5000) throw new Error("DNR dynamic rule budget exceeded");

  let existing = [];
  try {
    existing = await chrome.declarativeNetRequest.getDynamicRules();
  } catch (error) {
    console.warn("[CleanShield] unable to read dynamic rules", error);
  }
  const removeRuleIds = existing
    .filter((rule) => rule.id >= 100 && rule.id < 8000)
    .map((rule) => rule.id);

  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules: rules });
  return {
    total: rules.length,
    sites: enabledSites.length,
    custom: rules.length - enabledSites.length - shortformRules(settings).length,
    warnings: parseCustomFilters(settings.customFilters || "").warnings,
  };
}

export async function syncRulesets(settings) {
  try {
    const desired = {
      ads: settings.ads,
      privacy: settings.tracking,
      kr: settings.korean,
    };
    const current = new Set(await chrome.declarativeNetRequest.getEnabledRulesets());
    const enableRulesetIds = [];
    const disableRulesetIds = [];
    for (const [id, enabled] of Object.entries(desired)) {
      if (enabled && !current.has(id)) enableRulesetIds.push(id);
      if (!enabled && current.has(id)) disableRulesetIds.push(id);
    }
    if (enableRulesetIds.length || disableRulesetIds.length) {
      await chrome.declarativeNetRequest.updateEnabledRulesets({
        enableRulesetIds,
        disableRulesetIds,
      });
    }
  } catch (error) {
    console.warn("[CleanShield] unable to update rulesets", error);
  }
}

export async function syncAll(settings) {
  const dynamic = await syncDynamicRules(settings);
  await syncRulesets(settings);
  return dynamic;
}

function hashHost(host) {
  let hash = 0;
  for (let index = 0; index < host.length; index += 1) {
    hash = (hash * 31 + host.charCodeAt(index)) >>> 0;
  }
  return 10000 + (hash % 5000);
}

export async function allowTemporarily(host, minutes = 5) {
  const id = hashHost(host);
  const expires = Date.now() + Math.max(1, Math.min(minutes, 60)) * 60_000;
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [id],
    addRules: [
      {
        id,
        priority: 5000,
        action: { type: "allow" },
        condition: { requestDomains: [host], resourceTypes: ["main_frame"] },
      },
    ],
  });
  const stored = await chrome.storage.session.get("temporaryAllows");
  const entries = (stored.temporaryAllows || []).filter((entry) => entry.host !== host);
  entries.push({ host, id, expires });
  await chrome.storage.session.set({ temporaryAllows: entries });
  chrome.alarms.create(`temp-allow:${host}`, { when: expires });
  return { host, expires };
}

export async function removeTemporaryAllow(host) {
  const stored = await chrome.storage.session.get("temporaryAllows");
  const entries = stored.temporaryAllows || [];
  const entry = entries.find((item) => item.host === host);
  if (!entry) return;
  await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [entry.id] });
  await chrome.storage.session.set({
    temporaryAllows: entries.filter((item) => item.host !== host),
  });
}

export async function cleanupTemporaryAllows() {
  const stored = await chrome.storage.session.get("temporaryAllows");
  const entries = stored.temporaryAllows || [];
  const valid = [];
  const expiredIds = [];
  for (const entry of entries) {
    if (entry.expires > Date.now()) valid.push(entry);
    else expiredIds.push(entry.id);
  }
  if (expiredIds.length) {
    await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: expiredIds });
    await chrome.storage.session.set({ temporaryAllows: valid });
  }
}

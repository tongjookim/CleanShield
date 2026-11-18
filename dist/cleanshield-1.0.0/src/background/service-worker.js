/**
 * CleanShield service worker.
 *
 * Responsibilities:
 *  - keep the DNR rulesets and dynamic rules in sync with stored settings
 *  - provide the small per-page configuration payload to content scripts
 *  - count blocked requests when Chrome exposes the debug feedback API
 *  - own the context menu shortcuts and the temporary "allow for 5 minutes"
 *    session rules used by the block page
 */

import {
  readSettings,
  readStats,
  readState,
  updateSettings,
} from "../shared/storage.js";
import { normalizeDomain } from "../shared/defaults.js";
import { hostFromUrl, isSameOrSubdomain } from "../shared/util.js";
import {
  allowTemporarily,
  cleanupTemporaryAllows,
  removeTemporaryAllow,
  getGenericCss,
  selectorsForHost,
  syncAll,
} from "./dnr.js";
import { getStats, queueStat, refreshBadge, scheduleBadge } from "./stats.js";

const STATIC_RULESETS = new Set(["ads", "privacy", "kr"]);
let syncTimer = null;
let lastBroadcast = 0;

function sanitizeHostname(value) {
  if (typeof value !== "string") return "";
  const host = value.trim().toLowerCase().replace(/\.$/, "");
  if (!host || host.length > 253) return "";
  if (!/^[a-z0-9._-]+$/.test(host) || host.includes("..")) return "";
  return host;
}

async function configForHost(rawHost) {
  const host = sanitizeHostname(rawHost);
  const settings = await readSettings();
  if (!settings.enabled) return { enabled: false, host };
  const selectors = settings.cosmetic ? await selectorsForHost(settings, host) : [];
  return {
    enabled: true,
    host,
    version: chrome.runtime.getManifest().version,
    cosmetic: {
      enabled: settings.cosmetic,
      selectors,
    },
    keyword: {
      enabled: settings.keyword.enabled,
      items: settings.keyword.items,
    },
    shortform: settings.shortform,
  };
}

async function broadcastConfig() {
  const now = Date.now();
  if (now - lastBroadcast < 250) return;
  lastBroadcast = now;
  const tabs = await chrome.tabs.query({});
  await Promise.all(
    tabs.map(async (tab) => {
      if (!tab.id || !tab.url || !/^https?:/i.test(tab.url)) return;
      try {
        await chrome.tabs.sendMessage(tab.id, { type: "cs:config-updated" });
      } catch {
        // No content script in this tab (chrome://, store pages, discarded tab).
      }
    }),
  );
}

async function syncNow() {
  const settings = await readSettings();
  try {
    await syncAll(settings);
  } catch (error) {
    console.error("[CleanShield] rule sync failed", error);
  }
  await broadcastConfig();
  scheduleBadge();
}

function scheduleSync() {
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncTimer = null;
    syncNow().catch((error) => console.error("[CleanShield] delayed sync failed", error));
  }, 120);
}

function createMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "cs-block-selection",
      title: 'CleanShield: 선택한 텍스트 "%s" 차단',
      contexts: ["selection"],
    });
    chrome.contextMenus.create({
      id: "cs-block-site",
      title: "CleanShield: 이 사이트 차단",
      contexts: ["page"],
    });
  });
}

async function addKeyword(text) {
  const keyword = String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  if (keyword.length < 2) return { ok: false, error: "키워드가 너무 짧습니다." };
  const settings = await updateSettings((current) => {
    const exists = current.keyword.items.some(
      (item) => item.text.toLowerCase() === keyword.toLowerCase(),
    );
    if (!exists) {
      current.keyword.items.unshift({
        id: `k_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        text: keyword,
        match: "contains",
        scopes: [],
        caseSensitive: false,
        createdAt: Date.now(),
      });
    }
    current.keyword.enabled = true;
    return { exists };
  });
  return { ok: true, keyword, existed: settings.exists };
}

async function blockSite(rawHost) {
  const domain = normalizeDomain(rawHost);
  if (!domain) return { ok: false, error: "올바른 도메인이 아닙니다." };
  await updateSettings((current) => {
    current.sites.allowed = current.sites.allowed.filter((item) => item !== domain);
    if (!current.sites.blocked.some((site) => site.domain === domain)) {
      current.sites.blocked.unshift({
        id: `s_${Date.now().toString(36)}`,
        domain,
        enabled: true,
        note: "",
        createdAt: Date.now(),
      });
    }
  });
  await syncNow();
  return { ok: true, domain };
}

async function unblockSite(rawHost) {
  const host = normalizeDomain(rawHost);
  if (!host) return { ok: false, error: "올바른 도메인이 아닙니다." };
  await updateSettings((current) => {
    current.sites.blocked = current.sites.blocked.filter(
      (site) => !isSameOrSubdomain(host, site.domain) && !isSameOrSubdomain(site.domain, host),
    );
  });
  await syncNow();
  return { ok: true };
}

async function allowSite(rawHost) {
  const host = normalizeDomain(rawHost);
  if (!host) return { ok: false, error: "올바른 도메인이 아닙니다." };
  await updateSettings((current) => {
    current.sites.blocked = current.sites.blocked.filter(
      (site) => !isSameOrSubdomain(host, site.domain),
    );
    if (!current.sites.allowed.includes(host)) current.sites.allowed.unshift(host);
    current.sites.allowed = current.sites.allowed.slice(0, 1000);
  });
  await syncNow();
  return { ok: true, host };
}

async function siteState(rawHost) {
  const host = sanitizeHostname(rawHost);
  const settings = await readSettings();
  if (!host) return { blocked: null, allowed: false, tiktokBlocked: false };
  const allowed = settings.sites.allowed.some((domain) => isSameOrSubdomain(host, domain));
  const blocked = settings.sites.blocked.find(
    (site) => site.enabled && isSameOrSubdomain(host, site.domain),
  );
  return {
    blocked: blocked ? { domain: blocked.domain } : null,
    allowed,
    tiktokBlocked: Boolean(
      settings.shortform.enabled && settings.shortform.platforms.tiktok?.block,
    ),
  };
}

async function handleMessage(message, sender) {
  if (!message || typeof message !== "object" || typeof message.type !== "string") {
    return { ok: false, error: "잘못된 메시지" };
  }

  switch (message.type) {
    case "cs:config":
      return configForHost(message.host);

    case "cs:generic-css":
      return { ok: true, css: await getGenericCss() };

    case "stats:inc": {
      if (!message.stats || typeof message.stats !== "object") return { ok: true };
      for (const [key, value] of Object.entries(message.stats)) queueStat(key, value);
      return { ok: true };
    }

    case "stats:get":
      return { ok: true, stats: await getStats() };

    case "ui:state":
      return { ok: true, state: await readState() };

    case "site:state":
      return { ok: true, ...(await siteState(message.host)) };

    case "site:block":
      return blockSite(message.host);

    case "site:unblock":
      return unblockSite(message.host);

    case "site:allow":
      return allowSite(message.host);

    case "site:temp-allow": {
      const host = sanitizeHostname(message.host);
      if (!host) return { ok: false, error: "올바른 도메인이 아닙니다." };
      const result = await allowTemporarily(host, message.minutes || 5);
      return { ok: true, ...result };
    }

    case "shortform:disable": {
      if (message.platform === "tiktok") {
        await updateSettings((current) => {
          current.shortform.platforms.tiktok.block = false;
        });
        scheduleSync();
      } else {
        await updateSettings((current) => {
          current.shortform.enabled = false;
        });
        scheduleSync();
      }
      return { ok: true };
    }

    case "keyword:add": {
      const result = await addKeyword(message.text);
      if (result.ok) await broadcastConfig();
      return result;
    }

    case "options:open":
      await chrome.runtime.openOptionsPage();
      return { ok: true };

    case "tab:reload":
      if (sender?.tab?.id) await chrome.tabs.reload(sender.tab.id);
      return { ok: true };

    default:
      return { ok: false, error: `알 수 없는 메시지: ${message.type}` };
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then(sendResponse)
    .catch((error) => {
      console.error("[CleanShield] message handler failed", error);
      sendResponse({ ok: false, error: error.message });
    });
  return true;
});

chrome.runtime.onInstalled.addListener(() => {
  createMenus();
  chrome.alarms.create("stats-rollover", { periodInMinutes: 30 });
  syncNow().catch((error) => console.error("[CleanShield] install sync failed", error));
  refreshBadge().catch(() => {});
});

chrome.runtime.onStartup.addListener(() => {
  createMenus();
  chrome.alarms.create("stats-rollover", { periodInMinutes: 30 });
  cleanupTemporaryAllows().catch(() => {});
  syncNow().catch((error) => console.error("[CleanShield] startup sync failed", error));
  refreshBadge().catch(() => {});
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.settings) scheduleSync();
  if (changes.stats) scheduleBadge();
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "cs-block-selection") {
    const result = await addKeyword(info.selectionText);
    if (result.ok) {
      await broadcastConfig();
      if (tab?.id) {
        chrome.tabs
          .sendMessage(tab.id, { type: "cs:toast", text: `키워드 차단: ${result.keyword}` })
          .catch(() => {});
      }
    }
    return;
  }
  if (info.menuItemId === "cs-block-site") {
    const host = hostFromUrl(info.pageUrl || tab?.url || "");
    if (!host) return;
    const result = await blockSite(host);
    if (result.ok && tab?.id) chrome.tabs.reload(tab.id).catch(() => {});
  }
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name.startsWith("temp-allow:")) {
    await removeTemporaryAllow(alarm.name.slice("temp-allow:".length));
    return;
  }
  if (alarm.name === "stats-rollover") {
    await readStats();
    await refreshBadge();
  }
});

// Newer Chrome versions expose matched-rule feedback for unpacked extensions.
// On packaged builds where the permission is stripped this listener is absent.
if (chrome.declarativeNetRequest?.onRuleMatchedDebug) {
  const seenRequests = new Map();
  chrome.declarativeNetRequest.onRuleMatchedDebug.addListener((info) => {
    const request = info?.request;
    const rule = info?.rule;
    if (!request || !rule) return;
    if (request.type === "main_frame") return;
    if (!STATIC_RULESETS.has(rule.rulesetId) && rule.ruleId < 3000) return;
    if (request.requestId) {
      if (seenRequests.has(request.requestId)) return;
      seenRequests.set(request.requestId, Date.now());
      if (seenRequests.size > 800) {
        const cutoff = Date.now() - 30_000;
        for (const [id, timestamp] of seenRequests) {
          if (timestamp < cutoff) seenRequests.delete(id);
        }
      }
    }
    queueStat("network", 1);
  });
}

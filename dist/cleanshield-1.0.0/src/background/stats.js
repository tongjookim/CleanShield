/** Batched statistics so content scripts can report cheaply. */

import { readStats, updateStats } from "../shared/storage.js";
import { formatNumber } from "../shared/util.js";

const STAT_KEYS = new Set(["network", "elements", "posts", "shorts", "sites"]);
const pending = Object.create(null);
let flushTimer = null;
let badgeTimer = null;

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flush().catch((error) => console.warn("[CleanShield] stats flush failed", error));
  }, 600);
}

export function queueStat(key, amount = 1) {
  if (!STAT_KEYS.has(key)) return;
  const value = Math.max(0, Math.min(500, Math.floor(Number(amount) || 0)));
  if (!value) return;
  pending[key] = (pending[key] || 0) + value;
  scheduleFlush();
}

export async function flush() {
  const increments = { ...pending };
  for (const key of Object.keys(pending)) delete pending[key];
  if (!Object.keys(increments).length) return null;
  const stats = await updateStats((current) => {
    for (const [key, amount] of Object.entries(increments)) {
      current[key] = (current[key] || 0) + amount;
    }
  });
  scheduleBadge();
  return stats;
}

export async function getStats() {
  await flush();
  return readStats();
}

export function scheduleBadge() {
  if (badgeTimer) return;
  badgeTimer = setTimeout(() => {
    badgeTimer = null;
    refreshBadge().catch(() => {});
  }, 400);
}

export async function refreshBadge() {
  try {
    const stats = await readStats();
    const total = stats.network + stats.elements + stats.posts + stats.shorts + stats.sites;
    await chrome.action.setBadgeBackgroundColor({ color: "#0f766e" });
    await chrome.action.setBadgeText({ text: total > 0 ? formatNumber(total) : "" });
    await chrome.action.setTitle({
      title: total > 0 ? `CleanShield — 오늘 ${formatNumber(total)}개 차단` : "CleanShield",
    });
  } catch (error) {
    console.warn("[CleanShield] badge update failed", error);
  }
}

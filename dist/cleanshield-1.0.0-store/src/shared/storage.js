/**
 * chrome.storage helpers used by the background worker and the extension pages.
 *
 * Settings and stats are stored under separate keys. A content script sending a
 * burst of statistics updates therefore cannot race with the options page
 * saving a keyword list, even though both write to chrome.storage.local.
 */

import {
  SETTINGS_KEY,
  STATS_KEY,
  STORAGE_KEY,
  createDefaultSettings,
  createDefaultStats,
  normalizeSettings,
  normalizeStats,
} from "./defaults.js";

let migrationPromise = null;
let settingsQueue = Promise.resolve();
let statsQueue = Promise.resolve();

function enqueue(queue, task) {
  const run = queue.then(task, task);
  return { run, next: run.catch(() => {}) };
}

async function migrate() {
  const stored = await chrome.storage.local.get([SETTINGS_KEY, STATS_KEY, STORAGE_KEY]);
  if (stored[SETTINGS_KEY] || stored[STATS_KEY]) {
    if (stored[STORAGE_KEY]) await chrome.storage.local.remove(STORAGE_KEY);
    if (!stored[SETTINGS_KEY]) await chrome.storage.local.set({ [SETTINGS_KEY]: createDefaultSettings() });
    if (!stored[STATS_KEY]) await chrome.storage.local.set({ [STATS_KEY]: createDefaultStats() });
    return;
  }
  if (stored[STORAGE_KEY]) {
    const legacy = stored[STORAGE_KEY] || {};
    const settings = normalizeSettings(legacy);
    const stats = normalizeStats(legacy.stats);
    await chrome.storage.local.set({ [SETTINGS_KEY]: settings, [STATS_KEY]: stats });
    await chrome.storage.local.remove(STORAGE_KEY);
    return;
  }
  await chrome.storage.local.set({
    [SETTINGS_KEY]: createDefaultSettings(),
    [STATS_KEY]: createDefaultStats(),
  });
}

export function ensureStorageReady() {
  if (!migrationPromise) migrationPromise = migrate();
  return migrationPromise;
}

export async function readSettings() {
  await ensureStorageReady();
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  return normalizeSettings(stored[SETTINGS_KEY]);
}

export async function readStats() {
  await ensureStorageReady();
  const stored = await chrome.storage.local.get(STATS_KEY);
  const stats = normalizeStats(stored[STATS_KEY]);
  // normalizeStats starts a fresh day automatically; persist that rollover.
  if (!stored[STATS_KEY] || stored[STATS_KEY].date !== stats.date) {
    await chrome.storage.local.set({ [STATS_KEY]: stats });
  }
  return stats;
}

export async function readState() {
  const [settings, stats] = await Promise.all([readSettings(), readStats()]);
  return { ...settings, stats };
}

export async function writeSettings(settings) {
  await chrome.storage.local.set({ [SETTINGS_KEY]: normalizeSettings(settings) });
}

export async function updateSettings(mutator) {
  const { run, next } = enqueue(settingsQueue, async () => {
    const settings = await readSettings();
    const result = await mutator(settings);
    await writeSettings(settings);
    return result ?? settings;
  });
  settingsQueue = next;
  return run;
}

export async function updateStats(mutator) {
  const { run, next } = enqueue(statsQueue, async () => {
    const stats = await readStats();
    await mutator(stats);
    await chrome.storage.local.set({ [STATS_KEY]: stats });
    return stats;
  });
  statsQueue = next;
  return run;
}

export async function resetStats() {
  const stats = createDefaultStats();
  await chrome.storage.local.set({ [STATS_KEY]: stats });
  return stats;
}

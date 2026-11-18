import { readState, updateSettings } from "../shared/storage.js";
import { formatNumber, hostFromUrl } from "../shared/util.js";

const $ = (id) => document.getElementById(id);
let currentTab = null;
let currentHost = "";
let site = { blocked: null, allowed: false };

function toast(text) {
  let element = document.querySelector(".toast");
  if (!element) {
    element = document.createElement("div");
    element.className = "toast";
    document.body.appendChild(element);
  }
  element.textContent = text;
  requestAnimationFrame(() => element.classList.add("show"));
  clearTimeout(element._timer);
  element._timer = setTimeout(() => element.classList.remove("show"), 1900);
}

async function send(message) {
  try {
    const response = await chrome.runtime.sendMessage(message);
    if (!response) throw new Error("응답이 없습니다.");
    return response;
  } catch (error) {
    console.warn("[CleanShield]", error);
    return { ok: false, error: error.message };
  }
}

function renderStats(stats) {
  $("stat-network").textContent = formatNumber(stats.network);
  $("stat-posts").textContent = formatNumber(stats.posts);
  $("stat-shorts").textContent = formatNumber(stats.shorts);
  $("stat-sites").textContent = formatNumber(stats.sites);
  const total = stats.network + stats.elements + stats.posts + stats.shorts + stats.sites;
  $("total-label").textContent = formatNumber(total);
}

function renderToggles(settings) {
  $("master").checked = settings.enabled;
  $("toggle-ads").checked = settings.ads;
  $("toggle-tracking").checked = settings.tracking;
  $("toggle-keyword").checked = settings.keyword.enabled;
  $("toggle-shortform").checked = settings.shortform.enabled;
  $("protection-label").textContent = settings.enabled ? "실시간 보호 중" : "보호가 일시 중지됨";
  document.querySelector(".popup").classList.toggle("disabled", !settings.enabled);
  $("toggles").classList.toggle("paused", !settings.enabled);
}

function renderSite() {
  const dot = $("site-dot");
  dot.className = "dot";
  if (!currentHost) {
    $("site-host").textContent = "이 페이지에서는 사용할 수 없음";
    $("site-status").textContent = "웹페이지에서 다시 시도해 주세요";
    $("site-block").disabled = true;
    $("site-allow").disabled = true;
    dot.classList.add("allowed");
    return;
  }

  $("site-host").textContent = currentHost;
  $("site-block").disabled = false;

  if (site.blocked) {
    $("site-status").textContent = "차단 목록에 있는 사이트";
    dot.classList.add("blocked");
    $("site-block").textContent = "차단 해제";
    $("site-allow").classList.remove("hidden");
    $("site-allow").textContent = "허용 목록에 추가";
  } else if (site.allowed) {
    $("site-status").textContent = "허용된 사이트";
    dot.classList.add("allowed");
    $("site-block").textContent = "이 사이트 차단";
    $("site-allow").classList.add("hidden");
  } else {
    $("site-status").textContent = "보호 중";
    $("site-block").textContent = "이 사이트 차단";
    $("site-allow").classList.add("hidden");
  }
  $("site-allow").disabled = false;
}

async function refreshSite() {
  const state = await readState();
  renderToggles(state);
  renderStats(state.stats);
  if (!currentHost) {
    renderSite();
    return;
  }
  const response = await send({ type: "site:state", host: currentHost });
  if (response.ok) {
    site = { blocked: response.blocked, allowed: response.allowed };
  }
  renderSite();
}

async function reloadTab() {
  if (currentTab?.id) {
    try {
      await chrome.tabs.reload(currentTab.id);
    } catch {
      // Tab closed while the popup was open.
    }
  }
}

async function init() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tabs[0] || null;
  const url = currentTab?.url || "";
  currentHost = /^https?:/i.test(url) ? hostFromUrl(url) : "";
  $("version").textContent = `v${chrome.runtime.getManifest().version}`;

  const state = await readState();
  renderToggles(state);
  renderStats(state.stats);
  await refreshSite();
}

$("master").addEventListener("change", async () => {
  const enabled = $("master").checked;
  await updateSettings((settings) => {
    settings.enabled = enabled;
  });
  const state = await readState();
  renderToggles(state);
  toast(enabled ? "보호를 다시 켰습니다" : "모든 차단을 잠시 껐습니다");
});

$("toggle-ads").addEventListener("change", async (event) => {
  await updateSettings((settings) => {
    settings.ads = event.target.checked;
  });
  toast(event.target.checked ? "광고 차단 켜짐" : "광고 차단 꺼짐");
});

$("toggle-tracking").addEventListener("change", async (event) => {
  await updateSettings((settings) => {
    settings.tracking = event.target.checked;
  });
  toast(event.target.checked ? "추적기 차단 켜짐" : "추적기 차단 꺼짐");
});

$("toggle-keyword").addEventListener("change", async (event) => {
  await updateSettings((settings) => {
    settings.keyword.enabled = event.target.checked;
  });
  toast(event.target.checked ? "키워드 필터 켜짐" : "키워드 필터 꺼짐");
});

$("toggle-shortform").addEventListener("change", async (event) => {
  await updateSettings((settings) => {
    settings.shortform.enabled = event.target.checked;
  });
  toast(event.target.checked ? "숏폼 차단 켜짐" : "숏폼 차단 꺼짐");
});

$("site-block").addEventListener("click", async () => {
  if (!currentHost) return;
  const blocking = !site.blocked;
  const response = await send({
    type: blocking ? "site:block" : "site:unblock",
    host: currentHost,
  });
  if (!response.ok) {
    toast(response.error || "사이트 설정을 변경하지 못했습니다");
    return;
  }
  toast(blocking ? `${currentHost} 차단` : `${currentHost} 차단 해제`);
  await refreshSite();
  await reloadTab();
});

$("site-allow").addEventListener("click", async () => {
  if (!currentHost) return;
  const response = await send({ type: "site:allow", host: currentHost });
  if (!response.ok) {
    toast(response.error || "허용 목록에 추가하지 못했습니다");
    return;
  }
  toast(`${currentHost} 허용 목록에 추가`);
  await refreshSite();
  await reloadTab();
});

$("open-options").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

$("open-keywords").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("src/ui/options.html#keywords") });
});

init().catch((error) => {
  console.error("[CleanShield] popup init failed", error);
  toast("설정을 불러오지 못했습니다");
});

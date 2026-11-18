const params = new URLSearchParams(location.search);
const rawHost = (params.get("host") || "").trim().toLowerCase();
const host = rawHost.replace(/^www\./, "");
const scheme = params.get("scheme") === "http" ? "http" : "https";
const rawPort = params.get("port") || "";
const port = /^\d{1,5}$/.test(rawPort) ? rawPort : "";
const kind = params.get("kind") === "shortform" ? "shortform" : "site";

const $ = (id) => document.getElementById(id);

function showError(message) {
  const element = $("error");
  element.textContent = message;
  element.classList.toggle("hidden", !message);
}

function targetUrl() {
  return host ? `${scheme}://${host}${port ? `:${port}` : ""}/` : "";
}

async function send(message) {
  try {
    const response = await chrome.runtime.sendMessage(message);
    if (!response) throw new Error("응답이 없습니다.");
    return response;
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

async function init() {
  $("version").textContent = `v${chrome.runtime.getManifest().version}`;
  if (host) $("host").textContent = host;

  if (kind === "shortform") {
    $("title").textContent = "숏폼 차단이 켜져 있습니다";
    $("reason").textContent =
      "틱톡은 대부분의 화면이 숏폼 피드라서 차단 설정에 따라 접속을 막았습니다. 5분간 잠시 보거나 설정에서 차단을 해제할 수 있습니다.";
    $("unblock").textContent = "틱톡 차단 해제";
  }

  chrome.runtime.sendMessage({ type: "stats:inc", stats: { sites: 1 } }).catch(() => {});

  $("temp-allow").addEventListener("click", async () => {
    if (!host) return;
    const buttons = document.querySelectorAll(".btn");
    buttons.forEach((button) => (button.disabled = true));
    const response = await send({ type: "site:temp-allow", host, minutes: 5 });
    if (!response.ok) {
      buttons.forEach((button) => (button.disabled = false));
      showError(response.error || "잠시 허용을 적용하지 못했습니다.");
      return;
    }
    location.replace(targetUrl());
  });

  $("unblock").addEventListener("click", async () => {
    if (!host) {
      showError("차단 대상 주소를 확인할 수 없습니다. 설정에서 직접 해제해 주세요.");
      return;
    }
    const response =
      kind === "shortform"
        ? await send({ type: "shortform:disable", platform: "tiktok" })
        : await send({ type: "site:unblock", host });
    if (!response.ok) {
      showError(response.error || "차단을 해제하지 못했습니다.");
      return;
    }
    location.replace(targetUrl());
  });

  $("settings").addEventListener("click", async () => {
    await send({ type: "options:open" });
  });

  $("back").addEventListener("click", () => {
    if (history.length > 1) history.back();
    else location.replace("about:blank");
  });
}

init().catch((error) => {
  console.error("[CleanShield] blocked page failed", error);
  showError("차단 화면을 불러오지 못했습니다.");
});

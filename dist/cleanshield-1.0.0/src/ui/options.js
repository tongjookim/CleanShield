import {
  readSettings,
  readStats,
  resetStats,
  updateSettings,
  writeSettings,
} from "../shared/storage.js";
import {
  createDefaultSettings,
  createDefaultStats,
  normalizeDomain,
  normalizeSettings,
  normalizeState,
} from "../shared/defaults.js";
import { formatNumber } from "../shared/util.js";
import { KEYWORD_PLATFORMS, platformLabel } from "../shared/platforms.js";
import { parseFilterList } from "../shared/filter-parser.js";

const $ = (id) => document.getElementById(id);

const TABS = {
  general: ["일반", "광고·추적기 차단 상태와 필터 정보를 확인합니다."],
  sites: ["사이트 차단", "특정 웹사이트를 차단하고 예외를 관리합니다."],
  keywords: ["키워드 필터", "SNS와 커뮤니티에서 원치 않는 게시글을 숨깁니다."],
  google: ["구글 검색", "구글 검색 결과에서 키워드와 도메인을 필터링합니다."],
  shortform: ["숏폼 차단", "쇼츠·릴스·틱톡 같은 짧은 영상 콘텐츠를 차단합니다."],
  advanced: ["고급", "사용자 필터, 데이터 백업, 엔진 정보를 관리합니다."],
};

let settings = null;
let stats = null;
let buildInfo = null;
let toastTimer = null;
let customInitialized = false;

const PLATFORM_META = {
  youtube: {
    mark: "▶",
    title: "유튜브 쇼츠",
    note: "홈·검색의 쇼츠 선반과 사이드바 링크를 숨깁니다.",
    redirectNote: "/shorts/ 주소를 일반 시청 페이지로 돌립니다.",
  },
  instagram: {
    mark: "◎",
    title: "인스타그램 릴스",
    note: "피드와 탐색의 릴스 항목을 숨깁니다.",
    redirectNote: "/reels/ 주소를 인스타그램 홈으로 돌립니다.",
  },
  facebook: {
    mark: "f",
    title: "페이스북 릴스",
    note: "피드와 탐색의 릴스 카드를 숨깁니다.",
    redirectNote: "/reel/ 주소를 페이스북 홈으로 돌립니다.",
  },
  tiktok: {
    mark: "♪",
    title: "틱톡",
    note: "숏폼 피드 요소를 숨깁니다.",
    blockNote: "틱톡 전체에 휴식 화면을 표시합니다.",
  },
  naver: {
    mark: "N",
    title: "네이버 숏폼",
    note: "네이버의 숏폼 클립 영역과 링크를 숨깁니다.",
  },
};

function toast(text) {
  const element = $("toast");
  element.textContent = text;
  element.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove("show"), 2200);
}

function markSaved() {
  const pill = $("save-state");
  pill.textContent = "저장됨";
  clearTimeout(markSaved._timer);
  markSaved._timer = setTimeout(() => {
    pill.textContent = "자동 저장";
  }, 1600);
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium" }).format(date);
}

function el(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function makeSwitch(checked, onChange, title = "") {
  const label = el("label", "switch");
  if (title) label.title = title;
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = checked;
  input.addEventListener("change", () => onChange(input.checked));
  label.append(input, el("span"));
  return label;
}

function activateTab(tabName, updateHash = true) {
  if (!TABS[tabName]) tabName = "general";
  for (const button of document.querySelectorAll(".nav-item")) {
    const active = button.dataset.tab === tabName;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  }
  for (const panel of document.querySelectorAll(".panel")) {
    panel.classList.toggle("hidden", panel.id !== `panel-${tabName}`);
  }
  const [title, description] = TABS[tabName];
  $("page-title").textContent = title;
  $("page-desc").textContent = description;
  if (updateHash) history.replaceState(null, "", `#${tabName}`);
}

async function save(mutator, message) {
  settings = await updateSettings(mutator);
  markSaved();
  if (message) toast(message);
  return settings;
}

function renderMaster() {
  $("master").checked = settings.enabled;
  $("master-label").textContent = settings.enabled ? "켜짐" : "일시 중지";
}

async function renderGeneral() {
  $("set-ads").checked = settings.ads;
  $("set-tracking").checked = settings.tracking;
  $("set-korean").checked = settings.korean;
  $("set-cosmetic").checked = settings.cosmetic;
  $("set-shortform").checked = settings.shortform.enabled;
  $("keyword-enabled").checked = settings.keyword.enabled;

  stats = await readStats();
  $("hero-network").textContent = formatNumber(stats.network);
  $("hero-elements").textContent = formatNumber(stats.elements);
  $("hero-posts").textContent = formatNumber(stats.posts);
  $("hero-shorts").textContent = formatNumber(stats.shorts);
  const total = stats.network + stats.elements + stats.posts + stats.shorts + stats.sites;
  $("hero-total").textContent = `${formatNumber(total)}개 차단`;

  if (buildInfo) {
    const byName = Object.fromEntries((buildInfo.rulesets || []).map((item) => [item.name, item]));
    $("count-ads").textContent = `${formatNumber(byName.ads?.rules || 0)}개 규칙`;
    $("count-privacy").textContent = `${formatNumber(byName.privacy?.rules || 0)}개 규칙`;
    $("count-kr").textContent = `${formatNumber(byName.kr?.rules || 0)}개 규칙`;
    $("count-cosmetic").textContent = `${formatNumber(buildInfo.cosmetic?.generic || 0)}개 기본 선택자`;
    $("build-date").textContent = formatDate(buildInfo.generated);
    $("build-summary").textContent = `네트워크 규칙 ${formatNumber(
      buildInfo.total_network_rules,
    )}개와 숨김 선택자 ${formatNumber(
      (buildInfo.cosmetic?.generic || 0) + (buildInfo.cosmetic?.domain_selectors || 0),
    )}개를 번들로 제공합니다. 마지막 빌드: ${formatDate(buildInfo.generated)}`;
    $("engine-version").textContent = `v${chrome.runtime.getManifest().version}`;
    $("engine-network").textContent = `${formatNumber(buildInfo.total_network_rules)}개`;
    $("engine-cosmetic").textContent = `${formatNumber(
      (buildInfo.cosmetic?.generic || 0) + (buildInfo.cosmetic?.domain_selectors || 0),
    )}개`;
    $("engine-date").textContent = formatDate(buildInfo.generated);
  } else {
    for (const id of ["count-ads", "count-privacy", "count-kr", "count-cosmetic"]) {
      $(id).textContent = "빌드 정보 없음";
    }
  }
  $("engine-custom").textContent = `${formatNumber(
    parseFilterList(settings.customFilters || "", { maxRules: 800, maxCosmetic: 400 }).rules.length,
  )}개`;
}

function renderSites() {
  $("site-count").textContent = String(settings.sites.blocked.length);
  $("allow-count").textContent = String(settings.sites.allowed.length);

  const list = $("site-list");
  list.textContent = "";
  if (!settings.sites.blocked.length) {
    list.append(el("div", "empty", "차단한 사이트가 없습니다. 위에서 도메인을 추가해 보세요."));
  }
  for (const site of settings.sites.blocked) {
    const row = el("div", "row");
    row.dataset.id = site.id;
    const main = el("div", "row-main");
    main.append(el("div", "row-title", site.domain));
    const sub = el("div", "row-sub");
    sub.append(el("span", "pill", site.enabled ? "활성" : "비활성"));
    if (site.note) sub.append(el("span", "", site.note));
    sub.append(el("span", "", formatDate(new Date(site.createdAt).toISOString())));
    main.append(sub);

    const actions = el("div", "row-actions");
    actions.append(
      makeSwitch(site.enabled, async (checked) => {
        await save((current) => {
          const target = current.sites.blocked.find((entry) => entry.id === site.id);
          if (target) target.enabled = checked;
        }, checked ? `${site.domain} 차단 켜짐` : `${site.domain} 차단 꺼짐`);
        renderSites();
      }, "사이트 차단 활성화"),
    );
    const remove = el("button", "icon-btn", "✕");
    remove.type = "button";
    remove.title = "차단 목록에서 삭제";
    remove.dataset.action = "delete-site";
    actions.append(remove);
    row.append(main, actions);
    list.append(row);
  }

  const allowList = $("allow-list");
  allowList.textContent = "";
  if (!settings.sites.allowed.length) {
    allowList.append(el("div", "empty", "허용한 사이트가 없습니다."));
  }
  for (const domain of settings.sites.allowed) {
    const row = el("div", "row");
    row.dataset.domain = domain;
    const main = el("div", "row-main");
    main.append(el("div", "row-title", domain));
    const actions = el("div", "row-actions");
    const remove = el("button", "icon-btn", "✕");
    remove.type = "button";
    remove.dataset.action = "delete-allow";
    remove.title = "허용 목록에서 삭제";
    actions.append(remove);
    row.append(main, actions);
    allowList.append(row);
  }
}

function renderScopeChips() {
  const container = $("scope-chips");
  container.textContent = "";
  for (const platform of KEYWORD_PLATFORMS) {
    const label = el("label", "chip-check");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = platform.id;
    input.dataset.scope = platform.id;
    label.append(input, el("span", "", platform.label));
    container.append(label);
  }
  const staticList = $("platform-list");
  staticList.textContent = "";
  for (const platform of KEYWORD_PLATFORMS) {
    staticList.append(el("span", "", platform.label));
  }
}

function renderKeywords() {
  $("keyword-count").textContent = String(settings.keyword.items.length);
  const list = $("keyword-list");
  list.textContent = "";
  if (!settings.keyword.items.length) {
    list.append(
      el(
        "div",
        "empty",
        "등록된 키워드가 없습니다. 스포일러, 관심 없는 주제, 특정 문구를 추가해 보세요.",
      ),
    );
    return;
  }
  for (const item of settings.keyword.items) {
    const row = el("div", "row");
    row.dataset.id = item.id;
    const main = el("div", "row-main");
    main.append(el("div", "keyword-text", item.text));
    const sub = el("div", "row-sub");
    const modeLabel = item.match === "word" ? "단어" : item.match === "regex" ? "정규식" : "포함";
    sub.append(el("span", "pill", modeLabel));
    if (item.scopes?.length) {
      const labels = item.scopes.slice(0, 3).map(platformLabel);
      if (item.scopes.length > 3) labels.push(`+${item.scopes.length - 3}`);
      sub.append(el("span", "", labels.join(", ")));
    } else {
      sub.append(el("span", "pill accent", "모든 사이트"));
    }
    main.append(sub);
    const actions = el("div", "row-actions");
    const remove = el("button", "icon-btn", "✕");
    remove.type = "button";
    remove.dataset.action = "delete-keyword";
    remove.title = "키워드 삭제";
    actions.append(remove);
    row.append(main, actions);
    list.append(row);
  }
}

function renderGoogle() {
  const google = settings.google || createDefaultSettings().google;
  $("google-keyword-count").textContent = String(google.keywords.length);
  $("google-site-count").textContent = String(google.blocked.length);

  // Render keywords list
  const keywordList = $("google-keyword-list");
  keywordList.textContent = "";
  if (!google.keywords.length) {
    keywordList.append(
      el("div", "empty", "등록된 구글 키워드가 없습니다. 차단할 단어를 입력해 보세요."),
    );
  } else {
    for (const item of google.keywords) {
      const row = el("div", "row");
      row.dataset.id = item.id;
      const main = el("div", "row-main");
      main.append(el("div", "keyword-text", item.text));
      const sub = el("div", "row-sub");
      const modeLabel = item.match === "word" ? "단어" : item.match === "regex" ? "정규식" : "포함";
      sub.append(el("span", "pill", modeLabel));
      if (item.scopes?.length) {
        const labels = item.scopes.slice(0, 3).map(platformLabel);
        if (item.scopes.length > 3) labels.push(`+${item.scopes.length - 3}`);
        sub.append(el("span", "", labels.join(", ")));
      } else {
        sub.append(el("span", "pill accent", "모든 사이트"));
      }
      main.append(sub);
      const actions = el("div", "row-actions");
      const remove = el("button", "icon-btn", "✕");
      remove.type = "button";
      remove.dataset.action = "delete-google-keyword";
      remove.title = "키워드 삭제";
      actions.append(remove);
      row.append(main, actions);
      keywordList.append(row);
    }
  }

  // Render sites list
  const siteList = $("google-site-list");
  siteList.textContent = "";
  if (!google.blocked.length) {
    siteList.append(
      el("div", "empty", "등록된 차단 도메인이 없습니다. 도메인을 입력해 보세요."),
    );
  } else {
    for (const item of google.blocked) {
      const row = el("div", "row");
      row.dataset.id = item.id;
      const main = el("div", "row-main");
      main.append(el("div", "row-title", item.domain));
      const sub = el("div", "row-sub");
      sub.append(el("span", "pill", item.enabled ? "활성" : "비활성"));
      if (item.note) sub.append(el("span", "", item.note));
      main.append(sub);
      const actions = el("div", "row-actions");
      actions.append(
        makeSwitch(item.enabled, async (checked) => {
          await save((current) => {
            const target = current.google.keywords.find((entry) => entry.id === item.id);
            if (target) target.enabled = checked;
          }, `${item.domain} 활성화`);
          renderGoogle();
        }, "사이트 차단 활성화"),
      );
      const remove = el("button", "icon-btn", "✕");
      remove.type = "button";
      remove.dataset.action = "delete-google-site";
      remove.title = "차단 목록에서 삭제";
      actions.append(remove);
      row.append(main, actions);
      siteList.append(row);
    }
  }
}

function renderGoogleScopeChips() {
  const container = $("google-scope-chips");
  container.textContent = "";
  const chips = [
    { value: "all", label: "전체", default: true },
    { value: "google", label: "구글만" },
  ];
  for (const chip of chips) {
    const label = el("label", "chip-check");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = chip.value;
    input.checked = chip.default;
    label.append(input, el("span", "", chip.label));
    container.append(label);
  }
}

function renderPlatforms() {
  const container = $("platform-cards");
  container.textContent = "";
  for (const [id, meta] of Object.entries(PLATFORM_META)) {
    const config = settings.shortform.platforms[id];
    if (!config) continue;
    const card = el("article", "card platform-card");
    const head = el("div", "platform-head");
    head.append(el("div", "platform-mark", meta.mark));
    const copy = el("div");
    copy.append(el("strong", "", meta.title), el("small", "", meta.note));
    head.append(copy);
    card.append(head);

    const addToggle = (key, labelText, note, disabled = false) => {
      const row = el("div", "platform-toggle");
      const span = el("span");
      span.append(el("b", "", labelText));
      if (note) span.append(el("small", "", note));
      const toggle = makeSwitch(
        Boolean(config[key]),
        async (checked) => {
          await save((current) => {
            current.shortform.platforms[id][key] = checked;
          }, `${meta.title}: ${labelText} ${checked ? "켜짐" : "꺼짐"}`);
          renderPlatforms();
        },
        labelText,
      );
      if (disabled) toggle.querySelector("input").disabled = true;
      row.append(span, toggle);
      card.append(row);
    };

    addToggle("hide", "숏폼 숨기기", "피드와 탐색에서 관련 요소를 감춥니다.");
    if (config.redirect !== undefined) {
      addToggle("redirect", "일반 페이지로 돌리기", meta.redirectNote || "");
    }
    if (config.block !== undefined) {
      addToggle("block", "틱톡 차단 화면", meta.blockNote || "");
    }
    container.append(card);
  }
}

function renderCustom() {
  if (!customInitialized) {
    $("custom-filters").value = settings.customFilters || "";
    customInitialized = true;
  }
  $("engine-custom").textContent = `${formatNumber(
    parseFilterList(settings.customFilters || "", { maxRules: 800, maxCosmetic: 400 }).rules.length,
  )}개`;
}

function renderAll() {
  renderMaster();
  renderGeneral();
  renderSites();
  renderKeywords();
  renderGoogle();
  renderPlatforms();
  renderCustom();
}

async function addSite(domain) {
  const normalized = normalizeDomain(domain);
  if (!normalized) throw new Error("올바른 도메인을 입력하세요. 예: example.com");
  if (settings.sites.blocked.some((site) => site.domain === normalized)) {
    throw new Error("이미 차단 목록에 있습니다.");
  }
  await save((current) => {
    current.sites.blocked.unshift({
      id: `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      domain: normalized,
      enabled: true,
      note: "",
      createdAt: Date.now(),
    });
    current.sites.allowed = current.sites.allowed.filter((item) => item !== normalized);
  });
  renderSites();
  return normalized;
}

async function addAllow(domain) {
  const normalized = normalizeDomain(domain);
  if (!normalized) throw new Error("올바른 도메인을 입력하세요. 예: example.com");
  if (settings.sites.allowed.includes(normalized)) throw new Error("이미 허용 목록에 있습니다.");
  await save((current) => {
    if (!current.sites.allowed.includes(normalized)) current.sites.allowed.unshift(normalized);
    current.sites.blocked = current.sites.blocked.filter((site) => site.domain !== normalized);
  });
  renderSites();
  return normalized;
}

function showError(id, message) {
  const element = $(id);
  element.textContent = message || "";
  element.classList.toggle("hidden", !message);
}

function bindEvents() {
  for (const button of document.querySelectorAll(".nav-item")) {
    button.addEventListener("click", () => activateTab(button.dataset.tab));
  }
  window.addEventListener("hashchange", () => activateTab(location.hash.slice(1), false));

  $("master").addEventListener("change", async (event) => {
    await save((current) => {
      current.enabled = event.target.checked;
    }, event.target.checked ? "전체 보호를 켰습니다" : "전체 보호를 잠시 껐습니다");
    renderMaster();
  });

  const toggleMap = {
    "set-ads": ["ads", "광고 차단"],
    "set-tracking": ["tracking", "추적기 차단"],
    "set-korean": ["korean", "한국 사이트 필터"],
    "set-cosmetic": ["cosmetic", "광고 요소 숨김"],
  };
  for (const [id, [key, label]] of Object.entries(toggleMap)) {
    $(id).addEventListener("change", async (event) => {
      await save((current) => {
        current[key] = event.target.checked;
      }, `${label} ${event.target.checked ? "켜짐" : "꺼짐"}`);
      renderGeneral();
    });
  }

  $("set-shortform").addEventListener("change", async (event) => {
    await save((current) => {
      current.shortform.enabled = event.target.checked;
    }, `숏폼 차단 ${event.target.checked ? "켜짐" : "꺼짐"}`);
    renderGeneral();
    renderPlatforms();
  });

  $("keyword-enabled").addEventListener("change", async (event) => {
    await save((current) => {
      current.keyword.enabled = event.target.checked;
    }, `키워드 필터 ${event.target.checked ? "켜짐" : "꺼짐"}`);
    renderGeneral();
  });

  $("site-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const domain = await addSite($("site-input").value);
      $("site-input").value = "";
      showError("site-error", "");
      toast(`${domain} 차단 목록에 추가`);
    } catch (error) {
      showError("site-error", error.message);
    }
  });

  $("allow-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const domain = await addAllow($("allow-input").value);
      $("allow-input").value = "";
      showError("allow-error", "");
      toast(`${domain} 허용 목록에 추가`);
    } catch (error) {
      showError("allow-error", error.message);
    }
  });

  const presets = {
    sns: ["facebook.com", "instagram.com", "x.com", "tiktok.com", "threads.net"],
    shortform: ["tiktok.com"],
    community: [
      "dcinside.com",
      "clien.net",
      "ruliweb.com",
      "theqoo.net",
      "instiz.net",
      "fmkorea.com",
      "dogdrip.net",
      "todayhumor.co.kr",
      "ppomppu.co.kr",
      "arca.live",
      "bobaedream.co.kr",
      "pann.nate.com",
    ],
  };
  for (const button of document.querySelectorAll("[data-preset]")) {
    button.addEventListener("click", async () => {
      const domains = presets[button.dataset.preset] || [];
      let added = 0;
      await save((current) => {
        for (const domain of domains) {
          if (current.sites.blocked.some((site) => site.domain === domain)) continue;
          current.sites.blocked.push({
            id: `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
            domain,
            enabled: true,
            note: "빠른 추가",
            createdAt: Date.now(),
          });
          added += 1;
        }
      });
      renderSites();
      toast(added ? `${added}개 사이트 추가` : "이미 모두 추가되어 있습니다");
    });
  }

  $("site-list").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-action='delete-site']");
    if (!button) return;
    const row = button.closest(".row");
    const site = settings.sites.blocked.find((item) => item.id === row?.dataset.id);
    if (!site) return;
    await save((current) => {
      current.sites.blocked = current.sites.blocked.filter((item) => item.id !== site.id);
    }, `${site.domain} 삭제`);
    renderSites();
  });

  $("allow-list").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-action='delete-allow']");
    if (!button) return;
    const domain = button.closest(".row")?.dataset.domain;
    if (!domain) return;
    await save((current) => {
      current.sites.allowed = current.sites.allowed.filter((item) => item !== domain);
    }, `${domain} 허용 해제`);
    renderSites();
  });

  $("keyword-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = $("keyword-input").value.trim();
    const match = $("keyword-match").value;
    if (!text) return;
    if (text.length > 200) {
      showError("keyword-error", "키워드는 200자 이내로 입력하세요.");
      return;
    }
    if (match === "regex") {
      try {
        new RegExp(text);
      } catch {
        showError("keyword-error", "정규식 문법이 올바르지 않습니다.");
        return;
      }
    }
    const scopes = [...document.querySelectorAll("#scope-chips input:checked")].map(
      (input) => input.value,
    );
    const duplicate = settings.keyword.items.some(
      (item) =>
        item.text.toLowerCase() === text.toLowerCase() &&
        item.match === match &&
        (item.scopes || []).join(",") === scopes.join(","),
    );
    if (duplicate) {
      showError("keyword-error", "같은 조건의 키워드가 이미 있습니다.");
      return;
    }
    await save((current) => {
      current.keyword.items.unshift({
        id: `k_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        text,
        match,
        scopes,
        caseSensitive: false,
        createdAt: Date.now(),
      });
      current.keyword.enabled = true;
    }, `"${text}" 키워드 추가`);
    $("keyword-input").value = "";
    showError("keyword-error", "");
    for (const input of document.querySelectorAll("#scope-chips input")) input.checked = false;
    renderKeywords();
    renderGeneral();
  });

  $("keyword-list").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-action='delete-keyword']");
    if (!button) return;
    const id = button.closest(".row")?.dataset.id;
    const item = settings.keyword.items.find((entry) => entry.id === id);
    if (!item) return;
    await save((current) => {
      current.keyword.items = current.keyword.items.filter((entry) => entry.id !== id);
    }, `"${item.text}" 키워드 삭제`);
    renderKeywords();
  });

  // Google keyword form
  $("google-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const keywordText = $("google-keyword-input").value.trim();
    const match = $("google-keyword-match").value;
    if (!keywordText) return;
    if (keywordText.length > 200) {
      showError("google-error", "키워드는 200자 이내로 입력하세요.");
      return;
    }
    if (match === "regex") {
      try {
        new RegExp(keywordText);
      } catch {
        showError("google-error", "정규식 문법이 올바르지 않습니다.");
        return;
      }
    }
    const scopes = [...document.querySelectorAll("#google-scope-chips input:checked")].map(
      (input) => input.value,
    );
    const duplicate = (settings.google?.keywords || []).some(
      (item) =>
        item.text.toLowerCase() === keywordText.toLowerCase() &&
        item.match === match &&
        (item.scopes || []).join(",") === scopes.join(","),
    );
    if (duplicate) {
      showError("google-error", "같은 조건의 키워드가 이미 있습니다.");
      return;
    }
    await save((current) => {
      current.google = current.google || createDefaultSettings().google;
      current.google.keywords = current.google.keywords || [];
      current.google.keywords.unshift({
        id: `gk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        text: keywordText,
        match,
        scopes,
        caseSensitive: false,
        createdAt: Date.now(),
      });
      current.google.enabled = true;
    }, `"${keywordText}" 구글 키워드 추가`);
    $("google-keyword-input").value = "";
    showError("google-error", "");
    for (const input of document.querySelectorAll("#google-scope-chips input")) input.checked = false;
    renderGoogle();
    renderGeneral();
  });

  $("keyword-list").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-action='delete-keyword']");
    if (!button) return;
    const id = button.closest(".row")?.dataset.id;
    const item = settings.keyword.items.find((entry) => entry.id === id);
    if (!item) return;
    await save((current) => {
      current.keyword.items = current.keyword.items.filter((entry) => entry.id !== id);
    }, `"${item.text}" 키워드 삭제`);
    renderKeywords();
  });

  // Google site delete
  $("google-site-list").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-action='delete-google-site']");
    if (!button) return;
    const id = button.closest(".row")?.dataset.id;
    const item = (settings.google?.blocked || []).find((entry) => entry.id === id);
    if (!item) return;
    await save((current) => {
      current.google = current.google || createDefaultSettings().google;
      current.google.blocked = current.google.blocked.filter((entry) => entry.id !== id);
    }, `${item.domain} 삭제`);
    renderGoogle();
  });

  $("google-bulk-add").addEventListener("click", async () => {
    const lines = $("keyword-bulk")
      .value.split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("!"))
      .slice(0, 200);
    if (!lines.length) {
      toast("추가할 키워드가 없습니다");
      return;
    }
    const existing = new Set(settings.keyword.items.map((item) => item.text.toLowerCase()));
    let added = 0;
    await save((current) => {
      for (const line of lines) {
        if (existing.has(line.toLowerCase())) continue;
        existing.add(line.toLowerCase());
        current.keyword.items.push({
          id: `k_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
          text: line.slice(0, 200),
          match: "contains",
          scopes: [],
          caseSensitive: false,
          createdAt: Date.now(),
        });
        added += 1;
      }
      current.keyword.enabled = true;
    }, `${added}개 키워드 추가`);
    $("keyword-bulk").value = "";
    renderKeywords();
    renderGeneral();
  });

  $("keyword-export").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(settings.keyword.items, null, 2)], {
      type: "application/json",
    });
    downloadBlob(blob, "cleanshield-keywords.json");
    toast("키워드 목록을 내보냈습니다");
  });

  $("custom-save").addEventListener("click", async () => {
    const text = $("custom-filters").value;
    const parsed = parseFilterList(text, { maxRules: 800, maxCosmetic: 400 });
    await save((current) => {
      current.customFilters = text;
    }, "사용자 필터를 저장했습니다");
    renderCustomResult(parsed, "저장");
    renderGeneral();
  });

  $("custom-check").addEventListener("click", () => {
    const parsed = parseFilterList($("custom-filters").value, {
      maxRules: 800,
      maxCosmetic: 400,
    });
    renderCustomResult(parsed, "검사");
  });

  $("export-data").addEventListener("click", async () => {
    const snapshot = {
      app: "CleanShield",
      version: chrome.runtime.getManifest().version,
      exportedAt: new Date().toISOString(),
      settings,
      stats: await readStats(),
    };
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
    downloadBlob(blob, `cleanshield-backup-${new Date().toISOString().slice(0, 10)}.json`);
    toast("설정을 내보냈습니다");
  });

  $("import-file").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const rawSettings = parsed.settings || parsed;
      const imported = normalizeSettings(rawSettings);
      await writeSettings(imported);
      if (parsed.stats) {
        const importedStats = normalizeState({ stats: parsed.stats }).stats;
        await chrome.storage.local.set({ stats: importedStats });
      }
      settings = imported;
      customInitialized = false;
      renderAll();
      toast("설정을 가져왔습니다");
      event.target.value = "";
    } catch (error) {
      console.error(error);
      toast("가져오기에 실패했습니다. JSON 파일을 확인하세요.");
    }
  });

  $("reset-stats").addEventListener("click", async () => {
    if (!confirm("오늘의 차단 통계를 초기화할까요?")) return;
    await resetStats();
    await renderGeneral();
    toast("오늘 통계를 초기화했습니다");
  });

  $("reset-all").addEventListener("click", async () => {
    if (!confirm("모든 설정과 차단 목록, 키워드, 통계를 삭제할까요?")) return;
    await writeSettings(createDefaultSettings());
    await chrome.storage.local.set({ stats: createDefaultStats() });
    location.reload();
  });

  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area !== "local" || !changes.settings) return;
    settings = normalizeSettings(changes.settings.newValue);
    if (document.activeElement !== $("custom-filters")) {
      $("custom-filters").value = settings.customFilters || "";
    }
    renderMaster();
    renderGeneral();
    renderSites();
    renderKeywords();
    renderPlatforms();
  });
}

function renderCustomResult(parsed, action) {
  const warning = parsed.warnings.length ? ` · 경고 ${parsed.warnings.length}개` : "";
  $("custom-result").textContent = `${action}: 네트워크 ${parsed.rules.length}개, 숨김 ${parsed.cosmetic.length}개${warning}`;
  if (parsed.warnings.length) {
    toast(parsed.warnings[0]);
  } else {
    toast(action === "저장" ? "사용자 필터를 적용했습니다" : "사용 가능한 필터입니다");
  }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function init() {
  settings = await readSettings();
  stats = await readStats();
  try {
    const response = await fetch(chrome.runtime.getURL("data/build-info.json"));
    if (response.ok) buildInfo = await response.json();
  } catch (error) {
    console.warn("[CleanShield] build info unavailable", error);
  }

  $("side-version").textContent = `v${chrome.runtime.getManifest().version}`;
  bindEvents();
  renderScopeChips();
  renderGoogleScopeChips();
  renderAll();
  activateTab(location.hash.slice(1) || "general", false);
}

init().catch((error) => {
  console.error("[CleanShield] options init failed", error);
  toast("설정을 불러오지 못했습니다");
});

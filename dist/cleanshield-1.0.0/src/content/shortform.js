/** Short-form video blocking: YouTube Shorts, Reels, TikTok and Naver clips. */
(() => {
  const NS = globalThis.CleanShield;
  if (!NS) return;

  const STYLE_ID = "cs-shortform-style";
  const OVERLAY_ID = "cs-tiktok-overlay";
  const HIDDEN_CLASS = "cs-short-hidden";
  const SNOOZE_KEY = "cs_tiktok_snooze_until";
  const counted = new WeakSet();

  const PLATFORMS = {
    youtube: {
      label: "유튜브 쇼츠",
      host: /(^|\.)youtube\.com$/,
      css: [
        "ytd-reel-shelf-renderer",
        "ytd-rich-shelf-renderer[is-shorts]",
        "ytd-rich-section-renderer:has(ytd-reel-shelf-renderer)",
        "ytd-guide-entry-renderer:has(a[href^=\"/shorts\"])",
        "ytd-mini-guide-entry-renderer[aria-label*=\"Short\"]",
        "ytd-video-renderer:has(a[href^=\"/shorts/\"])",
        "ytd-grid-video-renderer:has(a[href^=\"/shorts/\"])",
        "ytd-rich-item-renderer:has(a[href^=\"/shorts/\"])",
        "ytd-compact-video-renderer:has(a[href^=\"/shorts/\"])",
        "ytd-reel-item-renderer",
        "ytd-shorts",
        "ytm-reel-shelf-renderer",
        "ytm-shorts-lockup-view-model",
        "ytm-shorts-lockup-view-model-v2",
      ],
      links: ['a[href^="/shorts/"]', 'a[href="/shorts"]'],
      closest: [
        "ytd-guide-entry-renderer",
        "ytd-mini-guide-entry-renderer",
        "ytd-rich-item-renderer",
        "ytd-video-renderer",
        "ytd-grid-video-renderer",
        "ytd-compact-video-renderer",
        "ytd-reel-item-renderer",
        "li",
        'div[role="listitem"]',
      ],
    },
    instagram: {
      label: "인스타그램 릴스",
      host: /(^|\.)instagram\.com$/,
      css: [
        "article:has(a[href*=\"/reel/\"])",
        "div[role=\"dialog\"]:has(a[href*=\"/reel/\"])",
        "a[href^=\"/reels/\"] svg",
      ],
      links: ['a[href^="/reels/"]', 'a[href^="/reel/"]'],
      closest: ["li", 'div[role="listitem"]', 'div[role="navigation"] > div', "nav div"],
    },
    facebook: {
      label: "페이스북 릴스",
      host: /(^|\.)facebook\.com$/,
      css: [
        'div[data-pagelet="Reels"]',
        'div[aria-label="Reels"]',
        'div[aria-label*="Reels"]',
        'div[role="article"]:has(a[href*="/reel/"])',
      ],
      links: ['a[href*="/reel/"]'],
      closest: [
        'div[role="article"]',
        "li",
        'div[role="navigation"] > div',
        'div[data-pagelet^="FeedUnit"]',
      ],
    },
    tiktok: {
      label: "틱톡",
      host: /(^|\.)tiktok\.com$/,
      css: [
        'div[data-e2e="recommend-list-item-container"]',
        'div[data-e2e="feed-video"]',
        'div[data-e2e="recommend-list"]',
      ],
      links: [],
      closest: [],
    },
    naver: {
      label: "네이버 숏폼",
      host: /(^|\.)naver\.com$/,
      css: ['div[class*="shorts"]', 'section[class*="shorts"]'],
      links: ['a[href*="/shorts/"]'],
      closest: ["li", "div[class*=\"short\"]", "section"],
    },
  };

  function platformForHost(host) {
    const normalized = String(host || "").toLowerCase();
    return Object.entries(PLATFORMS).find(([, platform]) => platform.host.test(normalized)) || null;
  }

  function removeStyle() {
    document.getElementById(STYLE_ID)?.remove();
  }

  function applyStyle(platform, config) {
    removeStyle();
    const rules = [];
    if (config.hide) {
      for (const selector of platform.css) rules.push(`${selector}{display:none!important}`);
      rules.push(`.${HIDDEN_CLASS}{display:none!important}`);
    }
    if (!rules.length) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = rules.join("\n");
    (document.head || document.documentElement).appendChild(style);
  }

  function unhideAll() {
    for (const element of document.querySelectorAll(`.${HIDDEN_CLASS}`)) {
      element.classList.remove(HIDDEN_CLASS);
      if (element.dataset.csHidden === "shortform") delete element.dataset.csHidden;
    }
  }

  function hideLinks(platform, report) {
    if (!platform.links.length) return;
    const closestSelector = platform.closest.join(",");
    for (const anchor of document.querySelectorAll(platform.links.join(","))) {
      let target = anchor;
      if (closestSelector) {
        const closest = anchor.closest(closestSelector);
        if (closest) target = closest;
      }
      if (!target || target.classList.contains(HIDDEN_CLASS)) continue;
      target.classList.add(HIDDEN_CLASS);
      target.dataset.csHidden = "shortform";
      report("shorts", 1);
    }
  }

  function countCssMatches(platform, report) {
    const seen = new Set();
    let total = 0;
    for (const selector of platform.css) {
      try {
        const nodes = document.querySelectorAll(selector);
        for (const node of nodes) {
          if (counted.has(node) || seen.has(node)) continue;
          seen.add(node);
          counted.add(node);
          total += 1;
        }
      } catch {
        // Unsupported selector: skip counting it, the stylesheet still applies
        // other selectors.
      }
    }
    if (total) report("shorts", total);
  }

  function getSnoozeUntil() {
    try {
      return Number(sessionStorage.getItem(SNOOZE_KEY)) || 0;
    } catch {
      return 0;
    }
  }

  function setSnooze(minutes) {
    try {
      sessionStorage.setItem(SNOOZE_KEY, String(Date.now() + minutes * 60_000));
    } catch {
      // Storage can be disabled on some pages; the overlay simply stays.
    }
  }

  function removeOverlay() {
    document.getElementById(OVERLAY_ID)?.remove();
  }

  function showTikTokOverlay(onSnooze) {
    if (document.getElementById(OVERLAY_ID)) return;
    if (getSnoozeUntil() > Date.now()) return;

    const host = document.createElement("div");
    host.id = OVERLAY_ID;
    host.style.cssText =
      "position:fixed;inset:0;z-index:2147483647;display:block;background:rgba(8,15,23,.94);";
    const shadow = host.attachShadow({ mode: "closed" });
    shadow.innerHTML = `
      <style>
        :host { all: initial; }
        .wrap {
          position: fixed; inset: 0; display: grid; place-items: center;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Apple SD Gothic Neo", sans-serif;
          color: #e6f4f1; background: radial-gradient(circle at 30% 20%, #123c38, #07110f 70%);
          padding: 24px; box-sizing: border-box;
        }
        .card { max-width: 440px; text-align: center; }
        .badge {
          width: 68px; height: 68px; border-radius: 22px; margin: 0 auto 22px;
          display: grid; place-items: center; font-size: 32px;
          background: linear-gradient(135deg, #14b8a6, #0f766e);
          box-shadow: 0 18px 50px rgba(20,184,166,.35);
        }
        h1 { font-size: 22px; margin: 0 0 10px; letter-spacing: -.02em; }
        p { font-size: 14px; line-height: 1.65; color: #9db8b3; margin: 0 0 24px; }
        .row { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; }
        button {
          font: inherit; font-size: 13px; font-weight: 600; cursor: pointer;
          padding: 11px 16px; border-radius: 12px; border: 1px solid #2b4a45;
          background: #12211f; color: #cfe8e3;
        }
        button.primary { background: #14b8a6; border-color: #14b8a6; color: #04211d; }
        button:hover { filter: brightness(1.1); }
        small { display: block; margin-top: 20px; font-size: 11px; color: #5f7a75; }
      </style>
      <div class="wrap">
        <div class="card">
          <div class="badge">⏳</div>
          <h1>숏폼은 잠시 쉬어가요</h1>
          <p>틱톡은 전부 숏폼 콘텐츠라서 CleanShield가 화면을 가리고 있어요.<br>정말 필요할 때만 잠깐 열어보세요.</p>
          <div class="row">
            <button class="primary" id="snooze">5분간 보기</button>
            <button id="settings">차단 설정</button>
            <button id="back">뒤로 가기</button>
          </div>
          <small>CleanShield · 숏폼 차단</small>
        </div>
      </div>`;
    shadow.getElementById("snooze").addEventListener("click", () => {
      setSnooze(5);
      removeOverlay();
      onSnooze?.(5);
    });
    shadow.getElementById("settings").addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "options:open" }).catch(() => {});
    });
    shadow.getElementById("back").addEventListener("click", () => history.back());
    (document.documentElement || document.body).appendChild(host);
  }

  function redirectShortform(host, settings) {
    const platform = platformForHost(host);
    if (!platform) return;
    const [id, config] = platform;
    if (!config.redirect) return;

    if (id === "youtube" && location.pathname.startsWith("/shorts")) {
      const match = location.pathname.match(/^\/shorts\/([A-Za-z0-9_-]{5,})/);
      const target = match ? `/watch?v=${match[1]}` : "/";
      if (location.pathname + location.search !== target) location.replace(target);
      return;
    }
    if (id === "instagram" && /^\/(reels?)(\/|$)/.test(location.pathname)) {
      location.replace("/");
      return;
    }
    if (id === "facebook" && /^\/reel(\/|$)/.test(location.pathname)) {
      location.replace("/");
    }
  }

  NS.Shortform = {
    active: false,
    platform: null,
    observer: null,
    timer: null,
    redirectTimer: null,
    countTimer: null,
    readyHandler: null,
    popstateHandler: null,

    stop() {
      this.active = false;
      this.observer?.disconnect();
      this.observer = null;
      if (this.timer) clearTimeout(this.timer);
      if (this.redirectTimer) clearInterval(this.redirectTimer);
      if (this.countTimer) clearTimeout(this.countTimer);
      if (this.readyHandler) document.removeEventListener("DOMContentLoaded", this.readyHandler);
      if (this.popstateHandler) window.removeEventListener("popstate", this.popstateHandler);
      this.timer = null;
      this.redirectTimer = null;
      this.countTimer = null;
      this.readyHandler = null;
      this.popstateHandler = null;
      removeStyle();
      removeOverlay();
      unhideAll();
    },

    apply(settings, host) {
      this.stop();
      if (!settings?.enabled) return;
      const match = platformForHost(host);
      if (!match) return;
      const [id, platform] = match;
      const config = settings.platforms?.[id] || {};
      const report = (key, value) => NS.report?.(key, value);
      this.active = true;
      this.platform = id;

      applyStyle(platform, config);

      if (config.hide && (platform.links.length || platform.css.length)) {
        const scan = () => {
          if (!this.active) return;
          hideLinks(platform, report);
        };
        this.observer = new MutationObserver(() => {
          if (this.timer) return;
          this.timer = setTimeout(() => {
            this.timer = null;
            scan();
          }, 180);
        });
        this.observer.observe(document.documentElement, { childList: true, subtree: true });
        if (document.readyState === "loading") {
          this.readyHandler = () => scan();
          document.addEventListener("DOMContentLoaded", this.readyHandler, { once: true });
        } else {
          scan();
        }
        this.countTimer = setTimeout(() => countCssMatches(platform, report), 2000);
      }

      if (id === "tiktok" && config.block) {
        const ensureOverlay = () => {
          if (!this.active) return;
          if (getSnoozeUntil() > Date.now()) {
            removeOverlay();
            return;
          }
          showTikTokOverlay((minutes) => {
            setTimeout(ensureOverlay, minutes * 60_000 + 500);
          });
        };
        ensureOverlay();
        // Some sites replace the body during hydration. Re-add the overlay if
        // it gets detached, but do not fight a page that removes it repeatedly.
        this.redirectTimer = setInterval(() => {
          if (!this.active) return;
          if (getSnoozeUntil() > Date.now()) {
            removeOverlay();
            return;
          }
          if (!document.getElementById(OVERLAY_ID)) ensureOverlay();
          redirectShortform(host, settings);
        }, 1500);
      } else if (config.redirect) {
        redirectShortform(host, settings);
        this.redirectTimer = setInterval(() => redirectShortform(host, settings), 1500);
        this.popstateHandler = () => redirectShortform(host, settings);
        window.addEventListener("popstate", this.popstateHandler);
      }
    },
  };
})();

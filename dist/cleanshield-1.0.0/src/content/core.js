/**
 * Content-script shared primitives: site adapters, text normalization and
 * keyword matchers. This file has no chrome.* dependency so it can be tested
 * with jsdom outside the browser.
 */
(() => {
  const NS = (globalThis.CleanShield = globalThis.CleanShield || {});

  const ADAPTERS = [
    {
      id: "x",
      label: "X (트위터)",
      patterns: [/(^|\.)x\.com$/, /(^|\.)twitter\.com$/],
      items: ['article[data-testid="tweet"]'],
      textSelectors: ['[data-testid="tweetText"]'],
      minText: 2,
    },
    {
      id: "facebook",
      label: "페이스북",
      patterns: [/(^|\.)facebook\.com$/],
      items: ['div[role="article"]', 'div[data-pagelet^="FeedUnit"]'],
      textSelectors: [],
      minText: 5,
    },
    {
      id: "instagram",
      label: "인스타그램",
      patterns: [/(^|\.)instagram\.com$/],
      items: ["article", 'div[role="dialog"] article'],
      textSelectors: [],
      minText: 3,
    },
    {
      id: "threads",
      label: "스레드",
      patterns: [/(^|\.)threads\.(net|com)$/],
      items: ["article", 'div[role="article"]'],
      textSelectors: [],
      minText: 2,
    },
    {
      id: "youtube",
      label: "유튜브",
      patterns: [/(^|\.)youtube\.com$/, /(^|\.)youtu\.be$/],
      items: [
        "ytd-comment-view-model",
        "ytd-video-renderer",
        "ytd-rich-item-renderer",
        "ytd-compact-video-renderer",
        "ytd-grid-video-renderer",
        "ytd-playlist-video-renderer",
        "ytd-post-renderer",
      ],
      textSelectors: ["#content-text", "#video-title", ".yt-core-attributed-string"],
      minText: 2,
    },
    {
      id: "reddit",
      label: "레딧",
      patterns: [/(^|\.)reddit\.com$/],
      items: ["shreddit-post", 'div[data-testid="post-container"]'],
      textSelectors: [],
      minText: 2,
    },
    {
      id: "naver",
      label: "네이버",
      patterns: [/(^|\.)naver\.com$/],
      items: [
        'li[class*="comment"]',
        'div[class*="comment"]',
        'li[class*="post"]',
        'div[class*="post"]',
        'li[class*="article"]',
      ],
      textSelectors: [],
      minText: 10,
    },
    {
      id: "daum",
      label: "다음",
      patterns: [/(^|\.)daum\.net$/, /(^|\.)daum\.com$/],
      items: ['.list_item', 'li[class*="comment"]', 'div[class*="comment"]'],
      textSelectors: [],
      minText: 8,
    },
    {
      id: "dcinside",
      label: "디시인사이드",
      patterns: [/(^|\.)dcinside\.com$/],
      items: ["tr.ub-content", "li.ub-content", 'li[id^="comment_li_"]'],
      textSelectors: [],
      minText: 2,
    },
    {
      id: "clien",
      label: "클리앙",
      patterns: [/(^|\.)clien\.net$/],
      items: [".list_item", ".comment_row"],
      textSelectors: [],
      minText: 2,
    },
    {
      id: "ruliweb",
      label: "루리웹",
      patterns: [/(^|\.)ruliweb\.com$/],
      items: [".list-item", ".comment"],
      textSelectors: [],
      minText: 2,
    },
    {
      id: "theqoo",
      label: "더쿠",
      patterns: [/(^|\.)theqoo\.net$/],
      items: [".list-item", ".comment"],
      textSelectors: [],
      minText: 2,
    },
    {
      id: "instiz",
      label: "인스티즈",
      patterns: [/(^|\.)instiz\.net$/],
      items: [".list_item", ".comment"],
      textSelectors: [],
      minText: 2,
    },
    {
      id: "fmkorea",
      label: "에펨코리아",
      patterns: [/(^|\.)fmkorea\.com$/],
      items: [".li", ".comment"],
      textSelectors: [],
      minText: 2,
    },
    {
      id: "dogdrip",
      label: "개드립",
      patterns: [/(^|\.)dogdrip\.net$/],
      items: [".list-item", ".comment"],
      textSelectors: [],
      minText: 2,
    },
    {
      id: "todayhumor",
      label: "오늘의유머",
      patterns: [/(^|\.)todayhumor\.co\.kr$/],
      items: [".list-item", ".comment"],
      textSelectors: [],
      minText: 2,
    },
    {
      id: "ppomppu",
      label: "뽐뿌",
      patterns: [/(^|\.)ppomppu\.co\.kr$/],
      items: [".list-item", ".comment"],
      textSelectors: [],
      minText: 2,
    },
    {
      id: "arca",
      label: "아카라이브",
      patterns: [/(^|\.)arca\.live$/],
      items: [".article-list-item", ".comment"],
      textSelectors: [],
      minText: 2,
    },
    {
      id: "bobaedream",
      label: "보배드림",
      patterns: [/(^|\.)bobaedream\.co\.kr$/],
      items: [".list-item", ".comment"],
      textSelectors: [],
      minText: 2,
    },
    {
      id: "pann",
      label: "네이트판",
      patterns: [/(^|\.)pann\.nate\.com$/],
      items: [".list-item", ".comment"],
      textSelectors: [],
      minText: 2,
    },
    {
      id: "google",
      label: "구글 검색",
      patterns: [/(^|\.)google\.com$/],
      items: [".g", ".g-bloks"],
      textSelectors: ["h3", ".VwiXrf", ".yXK7lf"],
      minText: 3,
    },
  ];

  const ZERO_WIDTH = /[\u00ad\u200b-\u200f\u202a-\u202e\u2060\ufeff]/g;

  function normalizeText(value) {
    return String(value || "")
      .normalize("NFKC")
      .replace(ZERO_WIDTH, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function adapterForHost(host) {
    const normalized = String(host || "").toLowerCase();
    return ADAPTERS.find((adapter) => adapter.patterns.some((pattern) => pattern.test(normalized))) || null;
  }

  function compileKeywords(items, adapterId) {
    const output = [];
    for (const item of items || []) {
      if (!item || !item.text) continue;
      if (Array.isArray(item.scopes) && item.scopes.length && !item.scopes.includes(adapterId)) {
        continue;
      }
      const caseSensitive = item.caseSensitive === true;
      const mode = item.match || "contains";
      try {
        if (mode === "regex") {
          const flags = caseSensitive ? "u" : "iu";
          output.push({ item, test: (text) => new RegExp(item.text, flags).test(text) });
          continue;
        }
        const needle = normalizeText(item.text);
        if (!needle) continue;
        if (mode === "word") {
          const flags = caseSensitive ? "gu" : "giu";
          const pattern = new RegExp(
            `(?<![\\p{L}\\p{N}_])${escapeRegExp(needle)}(?![\\p{L}\\p{N}_])`,
            flags,
          );
          output.push({ item, test: (text) => pattern.test(text) });
          continue;
        }
        const target = caseSensitive ? String(item.text) : needle.toLocaleLowerCase("ko-KR");
        output.push({
          item,
          test: (text) => {
            const haystack = caseSensitive ? normalizeText(text) : normalizeText(text).toLocaleLowerCase("ko-KR");
            return haystack.includes(target);
          },
        });
      } catch (error) {
        console.warn("[CleanShield] invalid keyword", item.text, error);
      }
    }
    return output;
  }

  function matchKeyword(text, compiled) {
    const normalized = normalizeText(text);
    if (!normalized) return null;
    for (const entry of compiled) {
      if (entry.test(normalized)) return entry.item;
    }
    return null;
  }

  function extractText(element, adapter) {
    if (!element) return "";
    let text = "";
    if (adapter && adapter.textSelectors.length) {
      const chunks = [];
      for (const selector of adapter.textSelectors) {
        const nodes = element.querySelectorAll(selector);
        for (const node of nodes) {
          const value = node.innerText || node.textContent || "";
          if (value) chunks.push(value);
          if (chunks.length > 20) break;
        }
      }
      text = chunks.join("\n");
    }
    if (!text.trim()) text = element.innerText || element.textContent || "";
    return normalizeText(text).slice(0, 8000);
  }

  function isHiddenByUs(element) {
    let current = element;
    while (current && current !== document.documentElement) {
      if (current.dataset && current.dataset.csHidden) return true;
      current = current.parentElement;
    }
    return false;
  }

  NS.ADAPTERS = ADAPTERS;
  NS.adapterForHost = adapterForHost;
  NS.normalizeText = normalizeText;
  NS.escapeRegExp = escapeRegExp;
  NS.compileKeywords = compileKeywords;
  NS.matchKeyword = matchKeyword;
  NS.extractText = extractText;
  NS.isHiddenByUs = isHiddenByUs;
})();

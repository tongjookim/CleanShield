/**
 * A deliberately small Adblock Plus compatible parser for user-supplied
 * filters. It supports the same subset as the build-time converter so that a
 * custom filter behaves identically to a bundled one:
 *
 *   ||ads.example.com^$script,third-party,domain=example.com
 *   @@||example.com^$document
 *   example.com##.ad-slot
 *   ##.sponsored-post
 *
 * Procedural cosmetics, CSP, redirect, removeparam and regex rules are rejected
 * with a warning instead of being approximated.
 */

import { normalizeDomain } from "./defaults.js";

const RESOURCE_TYPES = new Set([
  "main_frame",
  "sub_frame",
  "stylesheet",
  "script",
  "image",
  "font",
  "object",
  "xmlhttprequest",
  "ping",
  "csp_report",
  "media",
  "websocket",
  "webtransport",
  "webbundle",
  "other",
]);

const TYPE_MAP = {
  script: "script",
  image: "image",
  stylesheet: "stylesheet",
  css: "stylesheet",
  object: "object",
  xmlhttprequest: "xmlhttprequest",
  xhr: "xmlhttprequest",
  subdocument: "sub_frame",
  frame: "sub_frame",
  websocket: "websocket",
  media: "media",
  font: "font",
  ping: "ping",
  other: "other",
  document: "main_frame",
};

const UNSUPPORTED = new Set([
  "popup",
  "csp",
  "removeparam",
  "queryprune",
  "redirect",
  "redirect-rule",
  "rewrite",
  "elemhide",
  "generichide",
  "specifichide",
  "genericblock",
  "inline-script",
  "inline-font",
  "empty",
  "mp4",
  "webrtc",
  "method",
  "header",
  "permissions",
  "denyallow",
  "to",
  "from",
  "uritransform",
  "replace",
  "badfilter",
]);

const BAD_SELECTOR_SNIPPETS = [
  ":xpath(",
  ":style(",
  ":remove(",
  ":matches-",
  ":matches-path(",
  ":upward(",
  ":watch-attr(",
  ":if(",
  ":if-not(",
  ":has-text(",
  ":min-text-length(",
  ":others(",
  "+js(",
];

function isPlainOption(token) {
  return /^~?[a-zA-Z0-9_-]+(?:=[^,]*)?$/.test(token);
}

function splitOptions(line) {
  const index = line.lastIndexOf("$");
  if (index <= 0) return { pattern: line, optionsText: "" };
  const pattern = line.slice(0, index);
  const optionsText = line.slice(index + 1);
  if (!optionsText) return { pattern: line, optionsText: "" };
  const tokens = optionsText.split(",");
  if (!tokens.every(isPlainOption)) return { pattern: line, optionsText: "" };
  return { pattern, optionsText };
}

function parseDomains(value) {
  const included = [];
  const excluded = [];
  for (const part of value.split("|")) {
    const negated = part.trim().startsWith("~");
    const normalized = normalizeDomain(negated ? part.trim().slice(1) : part);
    if (!normalized) continue;
    if (negated) excluded.push(normalized);
    else included.push(normalized);
  }
  return { included, excluded };
}

function buildCondition(pattern, options, exception) {
  const condition = { urlFilter: pattern };
  if (options.matchCase) condition.isUrlFilterCaseSensitive = true;
  if (options.includedDomains.length) condition.initiatorDomains = options.includedDomains;
  if (options.excludedDomains.length) condition.excludedInitiatorDomains = options.excludedDomains;

  if (options.thirdParty && options.firstParty) return null;
  if (options.thirdParty) condition.domainType = "thirdParty";
  if (options.firstParty) condition.domainType = "firstParty";

  const types = [...options.types];
  const excludedTypes = [...options.excludedTypes];
  if (types.length && excludedTypes.length) {
    if (types.some((type) => excludedTypes.includes(type))) return null;
    condition.resourceTypes = types.sort();
    const remaining = [...RESOURCE_TYPES].filter(
      (type) => !types.includes(type) && !excludedTypes.includes(type),
    );
    if (remaining.length) condition.excludedResourceTypes = remaining.sort();
  } else if (types.length) {
    condition.resourceTypes = types.sort();
  } else if (excludedTypes.length) {
    condition.excludedResourceTypes = excludedTypes.sort();
  } else if (!exception) {
    condition.excludedResourceTypes = ["main_frame"];
  }
  return condition;
}

function parseNetwork(body) {
  const exception = body.startsWith("@@");
  const line = exception ? body.slice(2) : body;
  const { pattern, optionsText } = splitOptions(line);
  if (!pattern || pattern.length > 1900 || /\s/.test(pattern)) return { error: "잘못된 패턴" };
  if (pattern.startsWith("/") && pattern.endsWith("/")) return { error: "정규식 필터는 지원하지 않습니다" };
  if (!/^[\x20-\x7e]+$/.test(pattern)) return { error: "ASCII가 아닌 패턴" };

  const options = {
    types: new Set(),
    excludedTypes: new Set(),
    includedDomains: [],
    excludedDomains: [],
    thirdParty: false,
    firstParty: false,
    important: false,
    matchCase: false,
  };

  if (optionsText) {
    for (const raw of optionsText.split(",")) {
      if (!raw) continue;
      const negated = raw.startsWith("~");
      const token = raw.slice(negated ? 1 : 0);
      const separator = token.indexOf("=");
      const name = (separator === -1 ? token : token.slice(0, separator)).toLowerCase();
      const value = separator === -1 ? "" : token.slice(separator + 1);

      if (name === "important") {
        if (negated) return { error: "잘못된 important 옵션" };
        options.important = true;
      } else if (name === "match-case") {
        options.matchCase = !negated;
      } else if (name === "third-party" || name === "3p") {
        options.thirdParty = !negated;
      } else if (name === "first-party" || name === "1p") {
        options.firstParty = !negated;
      } else if (name === "domain") {
        const domains = parseDomains(value);
        if (!domains.included.length && !domains.excluded.length) {
          return { error: "잘못된 domain 옵션" };
        }
        options.includedDomains = domains.included;
        options.excludedDomains = domains.excluded;
      } else if (name === "all") {
        if (!negated) {
          options.types = new Set(RESOURCE_TYPES);
        }
      } else if (TYPE_MAP[name]) {
        const mapped = TYPE_MAP[name];
        if (negated) options.excludedTypes.add(mapped);
        else options.types.add(mapped);
      } else if (UNSUPPORTED.has(name)) {
        return { error: `지원하지 않는 옵션: ${name}` };
      } else {
        return { error: `알 수 없는 옵션: ${name}` };
      }
    }
  }

  const condition = buildCondition(pattern, options, exception);
  if (!condition) return { error: "모순된 옵션" };
  return {
    rule: {
      priority: options.important ? (exception ? 1000 : 900) : exception ? 100 : 1,
      action: { type: exception ? "allow" : "block" },
      condition,
    },
  };
}

function validSelector(selector) {
  const value = selector.trim();
  if (!value || value.length > 500) return false;
  if (!/^[\x20-\x7e]+$/.test(value)) return false;
  if (value.startsWith("^") || value.startsWith("+js(")) return false;
  if (/[{};@]/.test(value)) return false;
  if (BAD_SELECTOR_SNIPPETS.some((snippet) => value.includes(snippet))) return false;
  if (["*", "html", "body", "div", "span", "iframe", "a"].includes(value)) return false;
  if (!/[.#[>:\]]/.test(value) && !value.startsWith("amp-")) return false;
  return true;
}

function parseCosmetic(line, markerIndex, marker) {
  if (marker !== "##") return { error: "지원하지 않는 숨김 필터 형식" };
  const domainsText = line.slice(0, markerIndex).trim();
  const selector = line.slice(markerIndex + 2).trim();
  if (!validSelector(selector)) return { error: "지원하지 않거나 위험한 선택자" };

  if (!domainsText) return { cosmetic: { domains: [], selector } };
  const domains = [];
  for (const part of domainsText.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("~")) return { error: "부정 도메인 숨김 필터는 지원하지 않습니다" };
    const domain = normalizeDomain(trimmed);
    if (!domain) return { error: "잘못된 도메인" };
    domains.push(domain);
  }
  if (!domains.length) return { error: "도메인이 없습니다" };
  return { cosmetic: { domains, selector } };
}

export function parseFilterList(text, { maxRules = 800, maxCosmetic = 300 } = {}) {
  const rules = [];
  const cosmetic = [];
  const warnings = [];
  const seenRules = new Set();
  const seenCosmetic = new Set();

  if (typeof text !== "string" || !text.trim()) return { rules, cosmetic, warnings };

  const lines = text.split(/\r?\n/);
  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line || line.startsWith("!") || line.startsWith("[")) return;
    if (line.length > 4000) {
      warnings.push(`${index + 1}: 너무 긴 줄`);
      return;
    }

    const markerMatch = line.match(/(#@#|#\?#|#\$#|##)/);
    if (markerMatch) {
      if (cosmetic.length >= maxCosmetic) {
        warnings.push(`${index + 1}: 숨김 필터 개수 제한(${maxCosmetic}) 초과`);
        return;
      }
      const result = parseCosmetic(line, markerMatch.index, markerMatch[1]);
      if (result.error) {
        warnings.push(`${index + 1}: ${result.error}`);
        return;
      }
      const key = `${result.cosmetic.domains.join(",")}##${result.cosmetic.selector}`;
      if (seenCosmetic.has(key)) return;
      seenCosmetic.add(key);
      cosmetic.push(result.cosmetic);
      return;
    }

    if (rules.length >= maxRules) {
      warnings.push(`${index + 1}: 네트워크 필터 개수 제한(${maxRules}) 초과`);
      return;
    }
    const result = parseNetwork(line);
    if (result.error) {
      warnings.push(`${index + 1}: ${result.error}`);
      return;
    }
    const key = JSON.stringify(result.rule);
    if (seenRules.has(key)) return;
    seenRules.add(key);
    rules.push(result.rule);
  });

  return { rules, cosmetic, warnings };
}

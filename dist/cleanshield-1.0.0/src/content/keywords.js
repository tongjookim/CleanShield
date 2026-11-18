/** SNS / community post filtering by keyword. */
(() => {
  const NS = globalThis.CleanShield;
  if (!NS) return;

  const HIDDEN_CLASS = "cs-keyword-hidden";

  NS.KeywordFilter = class KeywordFilter {
    constructor({ report }) {
      this.report = report || (() => {});
      this.adapter = null;
      this.enabled = false;
      this.compiled = [];
      this.observer = null;
      this.queue = new Set();
      this.seen = new WeakSet();
      this.timer = null;
      this.readyHandler = null;
      this.active = false;
    }

    configure(settings, host) {
      this.adapter = NS.adapterForHost(host);
      const items = settings?.items || [];
      const enabled = Boolean(settings?.enabled && this.adapter && items.length);
      this.compiled = enabled ? NS.compileKeywords(items, this.adapter.id) : [];
      this.enabled = enabled && this.compiled.length > 0;

      if (!this.enabled) {
        this.stop();
        return;
      }
      if (!this.active) this.start();
      else this.rescan();
    }

    start() {
      if (this.active) return;
      this.active = true;
      this.observer = new MutationObserver((records) => this.onMutations(records));
      this.observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        characterData: true,
      });
      if (document.readyState === "loading") {
        this.readyHandler = () => this.scanDocument();
        document.addEventListener("DOMContentLoaded", this.readyHandler, { once: true });
      } else {
        this.scanDocument();
      }
    }

    stop() {
      this.active = false;
      if (this.observer) {
        this.observer.disconnect();
        this.observer = null;
      }
      if (this.timer) {
        clearTimeout(this.timer);
        this.timer = null;
      }
      if (this.readyHandler) {
        document.removeEventListener("DOMContentLoaded", this.readyHandler);
        this.readyHandler = null;
      }
      this.queue.clear();
      this.seen = new WeakSet();
      this.unhideAll();
    }

    rescan() {
      this.seen = new WeakSet();
      this.unhideAll();
      this.scanDocument();
    }

    unhideAll() {
      const hidden = document.querySelectorAll(`.${HIDDEN_CLASS}`);
      for (const element of hidden) {
        element.classList.remove(HIDDEN_CLASS);
        if (element.dataset.csHidden === "keyword") delete element.dataset.csHidden;
      }
    }

    scanDocument() {
      if (!this.active) return;
      this.enqueue(document.body || document.documentElement);
    }

    onMutations(records) {
      if (!this.active) return;
      let added = 0;
      for (const record of records) {
        if (record.type === "characterData") {
          const parent = record.target.parentElement;
          if (parent) this.enqueue(parent);
          continue;
        }
        for (const node of record.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          this.enqueue(node);
          added += 1;
          if (added > 400) break;
        }
        if (added > 400) break;
      }
      this.schedule();
    }

    enqueue(node) {
      if (!node || node.nodeType !== Node.ELEMENT_NODE) return;
      this.queue.add(node);
      if (this.queue.size > 3000) {
        // Keep the newest nodes; old detached nodes are not useful.
        const iterator = this.queue.values();
        for (let index = 0; index < 1000; index += 1) {
          const value = iterator.next().value;
          if (value) this.queue.delete(value);
        }
      }
      this.schedule();
    }

    schedule() {
      if (this.timer || !this.active) return;
      this.timer = setTimeout(() => {
        this.timer = null;
        this.processQueue();
      }, 120);
    }

    processQueue() {
      if (!this.active) return;
      const selector = this.adapter.items.join(",");
      let processed = 0;
      const limit = 600;
      while (this.queue.size && processed < limit) {
        const element = this.queue.values().next().value;
        this.queue.delete(element);
        processed += 1;
        if (!element.isConnected) continue;

        const candidates = new Set();
        if (element.matches?.(selector)) candidates.add(element);
        for (const selectorPart of this.adapter.items) {
          if (element.matches?.(selectorPart)) candidates.add(element);
          if (element.closest) {
            const closest = element.closest(selectorPart);
            if (closest) candidates.add(closest);
          }
        }
        let found = 0;
        for (const node of element.querySelectorAll(selector)) {
          candidates.add(node);
          found += 1;
          if (found > 250) break;
        }
        for (const candidate of candidates) this.consider(candidate);
      }
      if (this.queue.size) this.schedule();
    }

    consider(element) {
      if (!this.enabled || this.seen.has(element)) return;
      this.seen.add(element);
      if (!element.isConnected) return;
      if (NS.isHiddenByUs(element)) return;
      const text = NS.extractText(element, this.adapter);
      if (text.length < (this.adapter.minText || 2)) return;
      const keyword = NS.matchKeyword(text, this.compiled);
      if (!keyword) return;
      this.hide(element, keyword);
    }

    hide(element, keyword) {
      element.classList.add(HIDDEN_CLASS);
      element.dataset.csHidden = "keyword";
      element.dataset.csKeywordId = keyword.id || "";
      this.report("posts", 1);
    }
  };
})();

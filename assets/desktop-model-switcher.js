(function () {
  if (window.__codexNexusModelSwitcherLoaded) return;
  window.__codexNexusModelSwitcherLoaded = true;

  const DASHBOARD_URL = "http://127.0.0.1:4321";
  const WIDGET_ID = "codex-nexus-model-switcher-widget";

  const style = document.createElement("style");
  style.id = "codex-nexus-widget-styles";
  style.textContent = `
    #${WIDGET_ID} {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 2147483647;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Vazirmatn", sans-serif;
      user-select: none;
      direction: ltr;
      pointer-events: none !important;
      -webkit-app-region: no-drag !important;
      app-region: no-drag !important;
      margin: 0;
      padding: 0;
      box-sizing: border-box;
      line-height: 1;
    }
    #${WIDGET_ID} * {
      box-sizing: border-box;
      -webkit-app-region: no-drag !important;
      app-region: no-drag !important;
    }
    .cn-pill {
      display: inline-flex;
      align-items: center;
      -webkit-app-region: no-drag !important;
      app-region: no-drag !important;
      gap: 7px;
      padding: 7px 14px;
      background: #1e2023;
      border: 1.5px solid rgba(255, 255, 255, 0.18);
      border-radius: 9999px;
      color: #FCFCFA;
      font-size: 12px;
      font-weight: 600;
      line-height: 1;
      cursor: pointer;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.45);
      transition: background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
      pointer-events: auto !important;
      user-select: none;
      white-space: nowrap;
    }
    .cn-pill:hover {
      background: #282a2e;
      border-color: #8ecdff;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(142, 205, 255, 0.35);
    }
    .cn-pill:active {
      background: #32353a;
    }
    .cn-drag-handle {
      opacity: 0.5;
      font-size: 12px;
      margin-right: 1px;
      letter-spacing: -1px;
      cursor: grab;
      display: inline-block;
      line-height: 1;
    }
    .cn-drag-handle:active {
      cursor: grabbing;
    }
    .cn-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #A9DC76;
      box-shadow: 0 0 6px #A9DC76;
      display: inline-block;
      flex-shrink: 0;
      transition: background 0.3s ease, box-shadow 0.3s ease;
    }
    .cn-dot.offline {
      background: #FF5C57;
      box-shadow: 0 0 6px rgba(255, 92, 87, 0.7);
    }
    .cn-pill-text {
      display: inline-block;
      line-height: 1.2;
    }
    .cn-arrow {
      font-size: 9px;
      opacity: 0.75;
      margin-left: 1px;
    }
    .cn-popover {
      display: none;
      position: absolute;
      -webkit-app-region: no-drag !important;
      app-region: no-drag !important;
      bottom: calc(100% + 8px);
      right: 0;
      width: 320px;
      background: #1e2023;
      border: 1px solid #43474e;
      border-radius: 12px;
      padding: 16px;
      box-shadow: 0 12px 36px rgba(0, 0, 0, 0.65);
      color: #e2e2e5;
      flex-direction: column;
      gap: 12px;
      pointer-events: auto !important;
    }
    .cn-popover.open { display: flex; }
    .cn-popover-title {
      font-size: 13px;
      font-weight: 700;
      display: flex;
      justify-content: space-between;
      align-items: center;
      color: #8ecdff;
      border-bottom: 1px solid #43474e;
      padding-bottom: 8px;
    }
    .cn-field {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .cn-field label {
      font-size: 11px;
      font-weight: 600;
      color: #8c9199;
    }
    .cn-field select, .cn-field input {
      background: #121316;
      border: 1px solid #43474e;
      border-radius: 6px;
      padding: 6px 10px;
      color: #FCFCFA;
      font-size: 12px;
      outline: none;
    }
    .cn-field select:focus, .cn-field input:focus {
      border-color: #8ecdff;
    }
    .cn-btn-row {
      display: flex;
      gap: 6px;
      margin-top: 4px;
    }
    .cn-btn {
      flex: 1;
      padding: 6px 10px;
      border-radius: 6px;
      font-size: 11.5px;
      font-weight: 600;
      border: 1px solid transparent;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
    }
    .cn-btn-primary {
      background: #8ecdff;
      color: #00344f;
    }
    .cn-btn-primary:hover { opacity: 0.9; }
    .cn-btn-secondary {
      background: transparent;
      border-color: #43474e;
      color: #e2e2e5;
    }
    .cn-btn-secondary:hover { background: rgba(255, 255, 255, 0.05); }
    .cn-status-msg {
      font-size: 10.5px;
      padding: 4px 6px;
      border-radius: 4px;
      display: none;
    }
    .cn-status-err { background: rgba(255, 100, 100, 0.15); color: #ffb4ab; }
    .cn-status-ok { background: rgba(100, 255, 100, 0.15); color: #81c784; }
  `;
  document.head.appendChild(style);

  const container = document.createElement("div");
  container.id = WIDGET_ID;
  container.innerHTML = `
    <div class="cn-pill" id="cnPill" title="Drag to reposition • Click to switch model">
      <span class="cn-drag-handle" title="Drag to reposition">⠿</span>
      <span class="cn-dot"></span>
      <span class="cn-pill-text" id="cnPillLabel">Codex Model</span>
      <span class="cn-arrow">▼</span>
    </div>
    <div class="cn-popover" id="cnPopover">
      <div class="cn-popover-title">
        <span>⚡ Quick Model Switcher</span>
        <button id="cnBtnClose" style="background:none;border:none;color:#8c9199;cursor:pointer;font-size:14px;">✕</button>
      </div>
      <div class="cn-status-msg" id="cnStatusMsg"></div>
      
      <div id="cnOfflineBanner" style="display: none; background: rgba(255, 92, 87, 0.15); border: 1px solid rgba(255, 92, 87, 0.3); border-radius: 8px; padding: 10px; font-size: 11px; line-height: 1.5; color: #ffb4ab;">
        <div style="font-weight: 700; margin-bottom: 4px; display: flex; align-items: center; gap: 4px;">
          <span>⚠️</span> <span>داشبورد محلی غیرفعال است</span>
        </div>
        <div style="color: #e2e2e5; font-size: 10.5px;">برای اتصال و انتخاب مدل، سرویس پس‌زمینه را در ترمینال اجرا کنید:</div>
        <code style="display: block; margin: 6px 0; padding: 5px 8px; background: rgba(0,0,0,0.4); border-radius: 4px; color: #8ecdff; font-family: monospace; font-size: 10.5px; user-select: all;">codex-desktop-nexus dashboard</code>
        <div style="color: #8c9199; font-size: 10px; margin-bottom: 6px;">یا سرویس دائم: <code>codex-desktop-nexus service install</code></div>
        <button class="cn-btn cn-btn-secondary" id="cnBtnRetry" style="width: 100%; font-size: 11px;">🔄 تلاش مجدد برای اتصال</button>
      </div>

      <div id="cnFormControls" style="display: flex; flex-direction: column; gap: 12px;">
        <div class="cn-field">
          <label>Active Provider</label>
          <select id="cnProviderSelect"></select>
        </div>
        <div class="cn-field">
          <div style="display: flex; justify-content: space-between; align-items: baseline;">
            <label>Active Model</label>
            <span id="cnModelCount" style="font-size: 10px; color: #8c9199;"></span>
          </div>
          <input type="text" id="cnModelFilter" placeholder="🔍 Filter 800+ models..." style="margin-bottom: 5px; font-size: 11px;" />
          <select id="cnModelSelect"></select>
        </div>
        <div class="cn-btn-row">
          <button class="cn-btn cn-btn-primary" id="cnBtnApply">Apply & Reload</button>
          <button class="cn-btn cn-btn-secondary" id="cnBtnOpenDash" title="Open Full Web Dashboard">🌐 Dashboard</button>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #33363b; padding-top: 8px; margin-top: 2px;">
          <span style="font-size: 10px; color: #8c9199;">📍 موقعیت دکمه</span>
          <button id="cnBtnResetPos" style="background: none; border: none; color: #8ecdff; font-size: 10.5px; cursor: pointer; text-decoration: underline;">بازنشانی به گوشه پایین</button>
        </div>
      </div>
    </div>
  `;

  function initWidget() {
    if (!document.body) {
      setTimeout(initWidget, 100);
      return;
    }
    document.body.appendChild(container);
    restorePosition();
    setupEvents();
    refreshWidgetState();
    setupRtlEngine();
  }

  // ── Persian & Arabic Dynamic RTL Engine (High Performance) ──
  const FLOW_ATTR = "data-vazirmatn-flow";
  const FLOW_SELECTOR = [
    "[data-testid=\"exploration-accordion-body\"]",
    "[data-selected-text-overlay-target]",
    ".vscode-markdown",
    ".markdown-body",
    ".inline-markdown",
    ".rendered-markdown",
    "[class*=\"markdown-surface\"]",
    "[class*=\"_markdownContent_\"]"
  ].join(",");
  const PROSE_BLOCK_SELECTOR = "p,li,blockquote,h1,h2,h3,h4,h5,h6,table,[data-markdown-table]";
  const TECHNICAL_SELECTOR = [
    "pre", "code", "kbd", "samp", "tt", ".hljs", ".xterm",
    "[data-markdown-copy=\"code-block\"]", "[data-markdown-copy=\"inline-code\"]",
    "[class*=\"_codeBlock_\"]", "[class*=\"_CodeBlock_\"]", "[class*=\"_codeblock_\"]",
    "[class*=\"_codeBlockPlaceholder_\"]", "[class*=\"code-block\"]", "[class*=\"codeBlock\"]",
    "[class*=\"language-\"]", ".monaco-editor", ".cm-editor", "diffs-container",
    "[data-diff]", "[data-file][data-diff-type]", "[data-code]", "[data-line-index]",
    "[data-codex-terminal]", "[class*=\"code-snippet\"]", "[class*=\"code-editor\"]",
    "[class*=\"diff_\"]", "[class*=\"diff-view\"]", "[class*=\"patch-view\"]"
  ].join(",");
  const PERSIAN_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

  function isTechnicalSurface(el) {
    return !!(el && el.closest && el.closest(TECHNICAL_SELECTOR));
  }

  function isEditableSurface(el) {
    if (!el) return false;
    const target = el.nodeType === 3 ? el.parentElement : el;
    if (!target || target.nodeType !== 1) return false;
    return !!(
      (target.matches && target.matches("input,textarea,[contenteditable=\"true\"],[data-codex-composer-root],[data-codex-composer=\"true\"],.composer-input,.ProseMirror")) ||
      (target.closest && target.closest("input,textarea,[contenteditable=\"true\"],[data-codex-composer-root],[data-codex-composer=\"true\"],.composer-input,.ProseMirror"))
    );
  }

  function detectFlowDir(text) {
    if (!text) return null;
    const value = text.trim();
    if (!value) return null;
    const sample = value.length > 300 ? value.slice(0, 300) : value;
    return PERSIAN_RE.test(sample) ? "rtl" : "ltr";
  }

  function markFlow(el, textHint) {
    if (!el || el.nodeType !== 1 || isTechnicalSurface(el) || isEditableSurface(el)) return;
    const hintedDir = detectFlowDir(textHint);
    const dir = hintedDir || detectFlowDir(el.textContent);
    if (!dir) return;
    if (el.getAttribute(FLOW_ATTR) !== dir) el.setAttribute(FLOW_ATTR, dir);
    if (el.getAttribute("dir") !== dir) el.setAttribute("dir", dir);
    if (el.matches && el.matches("[data-markdown-table]")) {
      const tbl = el.querySelector("table");
      if (tbl && tbl.getAttribute("dir") !== dir) tbl.setAttribute("dir", dir);
    }
  }

  function markNearestFlow(root) {
    const el = root && root.nodeType === 3 ? root.parentElement : root;
    if (!el || el.nodeType !== 1 || isTechnicalSurface(el) || isEditableSurface(el)) return;
    const textHint = root && root.nodeType === 3 ? root.data : null;
    const container = el.matches && el.matches(FLOW_SELECTOR)
      ? el
      : (el.closest ? el.closest(FLOW_SELECTOR) : null);
    if (!container || isEditableSurface(container)) return;
    const block = el.closest ? el.closest(PROSE_BLOCK_SELECTOR) : null;
    if (block && container.contains(block) && !isTechnicalSurface(block) && !isEditableSurface(block)) {
      markFlow(block, textHint);
    }
    markFlow(container, textHint);
  }

  function scanConversationFlow(root) {
    const scope = root && root.nodeType === 1 ? root : document;
    if (!scope.querySelectorAll) return;
    const nodes = scope.querySelectorAll(FLOW_SELECTOR);
    for (let i = 0; i < nodes.length; i++) {
      if (isEditableSurface(nodes[i])) continue;
      markFlow(nodes[i]);
      const blocks = nodes[i].querySelectorAll(PROSE_BLOCK_SELECTOR);
      for (let j = 0; j < blocks.length; j++) {
        if (!isEditableSurface(blocks[j])) markFlow(blocks[j]);
      }
    }
  }

  function setupRtlEngine() {
    scanConversationFlow(document.body);

    const observer = new MutationObserver((records) => {
      for (let i = 0; i < records.length; i++) {
        const record = records[i];
        if (isEditableSurface(record.target)) continue;
        if (record.type === "characterData") {
          markNearestFlow(record.target);
          continue;
        }
        markNearestFlow(record.target);
        for (let j = 0; j < record.addedNodes.length; j++) {
          const added = record.addedNodes[j];
          if (isEditableSurface(added)) continue;
          markNearestFlow(added);
          if (added.nodeType === 1 && added.querySelectorAll) {
            const flows = added.matches && added.matches(FLOW_SELECTOR)
              ? [added]
              : added.querySelectorAll(FLOW_SELECTOR);
            for (let k = 0; k < flows.length; k++) {
              if (!isEditableSurface(flows[k])) markFlow(flows[k]);
            }
          }
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });

    // Composer Input Direction & Toggle Support
    function findComposerInput() {
      return (
        document.querySelector("[data-codex-composer-root] [contenteditable=\"true\"]") ||
        document.querySelector("[data-codex-composer=\"true\"] [contenteditable=\"true\"]") ||
        document.querySelector(".ProseMirror[contenteditable=\"true\"]") ||
        document.querySelector("[contenteditable=\"true\"]") ||
        document.querySelector("textarea")
      );
    }

    function ensureComposerToggle() {
      const existing = document.getElementById("vazirmatn-dir-toggle");
      if (existing && existing.isConnected) return;
      const box = document.querySelector("[data-codex-composer-root], [data-codex-composer=\"true\"], .composer-input, form");
      if (!box) return;
      const btns = Array.from(box.querySelectorAll("button"));
      const send = btns.find(b => {
        const l = (b.getAttribute("aria-label") || b.getAttribute("title") || "").toLowerCase();
        return l.includes("send") || l.includes("submit") || b.querySelector("svg");
      });
      if (!send || !send.parentElement) return;

      const btn = document.createElement("button");
      btn.id = "vazirmatn-dir-toggle";
      btn.type = "button";
      btn.title = "تغییر جهت نوشتار فارسی / انگلیسی (Ctrl+Shift+X)";
      btn.textContent = "فا";
      btn.style.cssText = "display:inline-flex;align-items:center;justify-content:center;height:24px;padding:0 8px;margin-inline:4px;border-radius:6px;border:1px solid rgba(169,220,118,0.4);background:rgba(169,220,118,0.1);color:#A9DC76;font-size:11px;font-weight:700;cursor:pointer;user-select:none;font-family:Vazirmatn,sans-serif;line-height:1;transition:all 0.15s ease;";

      function updateToggle(dir) {
        const isRtl = dir === "rtl";
        btn.textContent = isRtl ? "فا" : "EN";
        btn.style.color = isRtl ? "#A9DC76" : "#8c9199";
        btn.style.borderColor = isRtl ? "rgba(169,220,118,0.4)" : "rgba(255,255,255,0.18)";
        btn.style.background = isRtl ? "rgba(169,220,118,0.1)" : "transparent";
      }

      btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const inp = findComposerInput();
        if (!inp) return;
        const cur = inp.getAttribute("dir") || "ltr";
        const next = cur === "rtl" ? "ltr" : "rtl";
        inp.setAttribute("dir", next);
        inp.setAttribute("data-vazirmatn-dir", next);
        updateToggle(next);
        try { inp.focus(); } catch {}
      };

      send.parentElement.insertBefore(btn, send);
    }

    setInterval(ensureComposerToggle, 2500);

    // Keyboard shortcut: Ctrl + Shift + X
    document.addEventListener("keydown", (e) => {
      if (e.ctrlKey && e.shiftKey && (e.key === "X" || e.key === "x")) {
        const active = document.activeElement;
        const target = (active && active.matches && active.matches("input,textarea,[contenteditable=\"true\"]"))
          ? active
          : (active && active.closest ? active.closest("[contenteditable=\"true\"]") : null) || findComposerInput();
        if (target) {
          const cur = target.getAttribute("dir") || "ltr";
          const next = cur === "rtl" ? "ltr" : "rtl";
          target.setAttribute("dir", next);
          target.setAttribute("data-vazirmatn-dir", next);
          const btn = document.getElementById("vazirmatn-dir-toggle");
          if (btn) {
            btn.textContent = next === "rtl" ? "فا" : "EN";
            btn.style.color = next === "rtl" ? "#A9DC76" : "#8c9199";
          }
        }
      }
    });

    // High performance input observer for composer (frame-debounced, zero lag)
    let inputDebounceTimer = null;
    document.addEventListener("input", (e) => {
      const active = e.target;
      if (!active) return;
      const target = (active.matches && active.matches("input,textarea,[contenteditable=\"true\"]"))
        ? active
        : (active.closest ? active.closest("input,textarea,[contenteditable=\"true\"]") : null);
      if (!target) return;

      if (inputDebounceTimer) return;
      inputDebounceTimer = requestAnimationFrame(() => {
        inputDebounceTimer = null;
        const raw = target.value !== undefined ? target.value : (target.innerText || target.textContent || "");
        const text = raw.slice(0, 200).trim();
        if (!text) return;
        const isRtl = PERSIAN_RE.test(text);
        const dir = isRtl ? "rtl" : "ltr";
        if (target.getAttribute("dir") !== dir) target.setAttribute("dir", dir);
        if (target.getAttribute("data-vazirmatn-dir") !== dir) target.setAttribute("data-vazirmatn-dir", dir);
        const btn = document.getElementById("vazirmatn-dir-toggle");
        if (btn) {
          const nextText = isRtl ? "فا" : "EN";
          if (btn.textContent !== nextText) {
            btn.textContent = nextText;
            btn.style.color = isRtl ? "#A9DC76" : "#8c9199";
          }
        }
      });
    }, true);
  }

  let widgetState = null;

  function restorePosition() {
    try {
      const saved = localStorage.getItem("codex_nexus_widget_pos");
      if (saved) {
        const { left, top } = JSON.parse(saved);
        if (typeof left === "number" && typeof top === "number") {
          // If the position is within the top window drag header zone (top < 70), safely reposition it
          if (top < 70) {
            container.style.left = "auto";
            container.style.top = "auto";
            container.style.right = "24px";
            container.style.bottom = "24px";
            localStorage.removeItem("codex_nexus_widget_pos");
            return;
          }

          const maxLeft = Math.max(10, window.innerWidth - 160);
          const maxTop = Math.max(10, window.innerHeight - 50);
          const clampedX = Math.min(Math.max(10, left), maxLeft);
          const clampedY = Math.min(Math.max(70, top), maxTop);
          container.style.left = `${clampedX}px`;
          container.style.top = `${clampedY}px`;
          container.style.right = "auto";
          container.style.bottom = "auto";
        }
      }
    } catch {}
  }

  function adjustPopoverPlacement() {
    const popover = document.getElementById("cnPopover");
    if (!popover) return;
    const rect = container.getBoundingClientRect();

    // Vertical alignment: open upwards if in lower half
    if (rect.top > window.innerHeight / 2) {
      popover.style.bottom = "calc(100% + 8px)";
      popover.style.top = "auto";
    } else {
      popover.style.top = "calc(100% + 8px)";
      popover.style.bottom = "auto";
    }

    // Horizontal alignment: align right if in right half
    if (rect.left > window.innerWidth / 2) {
      popover.style.right = "0px";
      popover.style.left = "auto";
    } else {
      popover.style.left = "0px";
      popover.style.right = "auto";
    }
  }

  function showMessage(text, isError) {
    const el = document.getElementById("cnStatusMsg");
    if (!el) return;
    el.textContent = text;
    el.className = "cn-status-msg " + (isError ? "cn-status-err" : "cn-status-ok");
    el.style.display = "block";
    setTimeout(() => { el.style.display = "none"; }, 3500);
  }

  function setPillStatus(online, labelText = "") {
    const pill = document.getElementById("cnPill");
    if (!pill) return;
    const dot = pill.querySelector(".cn-dot");
    const label = document.getElementById("cnPillLabel");
    if (online) {
      if (dot) dot.classList.remove("offline");
      if (label && labelText) label.textContent = labelText;
    } else {
      if (dot) dot.classList.add("offline");
      if (label) label.textContent = labelText || "Nexus (Dashboard Offline)";
    }
  }

  const modelsCache = new Map();

  async function refreshWidgetState(loadModelsIfOpen = false) {
    const offlineBanner = document.getElementById("cnOfflineBanner");
    const formControls = document.getElementById("cnFormControls");

    try {
      const res = await fetch(`${DASHBOARD_URL}/api/status`, { mode: "cors" });
      const data = await res.json();
      if (!data.ok || !data.config) throw new Error("Invalid status response");
      widgetState = data;

      const cfg = data.config;
      const shortModel = (cfg.model || "default").split("/").pop();
      setPillStatus(true, `${cfg.modelProvider || "openai"}: ${shortModel}`);

      if (offlineBanner) offlineBanner.style.display = "none";
      if (formControls) formControls.style.display = "flex";

      const popover = document.getElementById("cnPopover");
      const isPopoverOpen = popover && popover.classList.contains("open");

      // Only populate and fetch models when popover is open or specifically requested
      if (isPopoverOpen || loadModelsIfOpen) {
        const provSelect = document.getElementById("cnProviderSelect");
        if (provSelect) {
          provSelect.innerHTML = "";
          (cfg.providers || []).forEach(p => {
            const opt = document.createElement("option");
            opt.value = p.id;
            opt.textContent = p.name || p.id;
            if (p.id === cfg.modelProvider) opt.selected = true;
            provSelect.appendChild(opt);
          });
        }
        await loadProviderModels(cfg.modelProvider, cfg.model);
      }
    } catch {
      setPillStatus(false, "Nexus (Dashboard Offline)");
      if (offlineBanner) offlineBanner.style.display = "block";
      if (formControls) formControls.style.display = "none";
    }
  }

  let currentLoadedModels = [];
  let selectedModelValue = "";

  function renderModelOptions(filterTerm = "") {
    const modelSelect = document.getElementById("cnModelSelect");
    const countBadge = document.getElementById("cnModelCount");
    if (!modelSelect) return;
    const term = (filterTerm || "").trim().toLowerCase();

    const filtered = term
      ? currentLoadedModels.filter(m => m.toLowerCase().includes(term))
      : currentLoadedModels;

    if (countBadge) {
      countBadge.textContent = currentLoadedModels.length > 0
        ? `${currentLoadedModels.length} models`
        : "";
    }

    modelSelect.innerHTML = "";
    if (filtered.length === 0) {
      const opt = document.createElement("option");
      opt.value = selectedModelValue || "";
      opt.textContent = selectedModelValue ? `${selectedModelValue} (Current)` : (term ? "No matching models" : "No models found");
      opt.selected = true;
      modelSelect.appendChild(opt);
      return;
    }

    const frag = document.createDocumentFragment();
    filtered.forEach(m => {
      const opt = document.createElement("option");
      opt.value = m;
      opt.textContent = m;
      if (m === selectedModelValue) opt.selected = true;
      frag.appendChild(opt);
    });
    modelSelect.appendChild(frag);
  }

  async function loadProviderModels(providerId, currentModel = null, forceRefresh = false) {
    if (currentModel) selectedModelValue = currentModel;
    const modelSelect = document.getElementById("cnModelSelect");
    if (!modelSelect) return;

    if (!forceRefresh && modelsCache.has(providerId)) {
      currentLoadedModels = modelsCache.get(providerId);
      if (selectedModelValue && !currentLoadedModels.includes(selectedModelValue)) {
        currentLoadedModels.unshift(selectedModelValue);
      }
      renderModelOptions();
      return;
    }

    modelSelect.innerHTML = "<option>Loading models...</option>";

    try {
      const res = await fetch(`${DASHBOARD_URL}/api/provider/models?id=${encodeURIComponent(providerId)}&providerId=${encodeURIComponent(providerId)}`, { mode: "cors" });
      const data = await res.json();
      if (data.ok && data.models && data.models.length > 0) {
        currentLoadedModels = data.models;
        modelsCache.set(providerId, currentLoadedModels);
        if (selectedModelValue && !currentLoadedModels.includes(selectedModelValue)) {
          currentLoadedModels.unshift(selectedModelValue);
        }
      } else if (selectedModelValue) {
        currentLoadedModels = [selectedModelValue];
      }
    } catch {
      if (selectedModelValue) {
        currentLoadedModels = [selectedModelValue];
      }
    }

    renderModelOptions();
  }

  function setupEvents() {
    const pill = document.getElementById("cnPill");
    const popover = document.getElementById("cnPopover");
    const btnClose = document.getElementById("cnBtnClose");
    const provSelect = document.getElementById("cnProviderSelect");
    const btnApply = document.getElementById("cnBtnApply");
    const btnOpenDash = document.getElementById("cnBtnOpenDash");
    const btnRetry = document.getElementById("cnBtnRetry");
    const btnResetPos = document.getElementById("cnBtnResetPos");

    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let initialLeft = 0;
    let initialTop = 0;
    let hasMoved = false;

    pill.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      isDragging = true;
      hasMoved = false;
      startX = e.clientX;
      startY = e.clientY;

      const rect = container.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;

      const onPointerMove = (moveEvent) => {
        if (!isDragging) return;
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;

        if (!hasMoved && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
          hasMoved = true;
          if (popover) popover.classList.remove("open");
          container.style.left = `${initialLeft}px`;
          container.style.top = `${initialTop}px`;
          container.style.right = "auto";
          container.style.bottom = "auto";
        }

        if (hasMoved) {
          const newLeft = Math.min(Math.max(10, initialLeft + dx), window.innerWidth - container.offsetWidth - 10);
          const newTop = Math.min(Math.max(70, initialTop + dy), window.innerHeight - container.offsetHeight - 10);
          container.style.left = `${newLeft}px`;
          container.style.top = `${newTop}px`;
        }
      };

      const onPointerUp = () => {
        if (!isDragging) return;
        isDragging = false;
        document.removeEventListener("pointermove", onPointerMove);
        document.removeEventListener("pointerup", onPointerUp);

        if (hasMoved) {
          const rect = container.getBoundingClientRect();
          try {
            localStorage.setItem("codex_nexus_widget_pos", JSON.stringify({ left: rect.left, top: rect.top }));
          } catch {}
          adjustPopoverPlacement();
        } else {
          // Normal click -> toggle popover
          popover.classList.toggle("open");
          if (popover.classList.contains("open")) {
            adjustPopoverPlacement();
            refreshWidgetState(true);
          }
        }
      };

      document.addEventListener("pointermove", onPointerMove);
      document.addEventListener("pointerup", onPointerUp);
    });

    btnClose.onclick = () => { popover.classList.remove("open"); };

    if (btnResetPos) {
      btnResetPos.onclick = () => {
        try { localStorage.removeItem("codex_nexus_widget_pos"); } catch {}
        container.style.left = "auto";
        container.style.top = "auto";
        container.style.right = "24px";
        container.style.bottom = "24px";
        adjustPopoverPlacement();
      };
    }

    if (btnRetry) {
      btnRetry.onclick = () => {
        if (provSelect && provSelect.value) {
          loadProviderModels(provSelect.value, null, true);
        } else {
          refreshWidgetState(true);
        }
      };
    }

    provSelect.onchange = (e) => {
      selectedModelValue = "";
      loadProviderModels(e.target.value, null, false);
    };

    const filterInput = document.getElementById("cnModelFilter");
    if (filterInput) {
      filterInput.oninput = (e) => {
        renderModelOptions(e.target.value);
      };
    }

    btnApply.onclick = async () => {
      const providerId = provSelect.value;
      const model = document.getElementById("cnModelSelect").value;
      if (!providerId || !model) return;

      btnApply.textContent = "Saving...";
      btnApply.disabled = true;

      try {
        const res = await fetch(`${DASHBOARD_URL}/api/provider/set-active`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ providerId, model })
        });
        const data = await res.json();
        if (data.ok) {
          showMessage("✓ Saved! Reloading app...", false);
          setTimeout(() => {
            window.location.reload();
          }, 400);
        } else {
          showMessage(data.error || "Save failed", true);
          btnApply.textContent = "Apply & Reload";
          btnApply.disabled = false;
        }
      } catch (err) {
        showMessage("Error: " + err.message, true);
        btnApply.textContent = "Apply & Reload";
        btnApply.disabled = false;
      }
    };

    btnOpenDash.onclick = () => {
      window.open(DASHBOARD_URL, "_blank");
    };

    window.addEventListener("focus", () => {
      refreshWidgetState(false);
    });

    setInterval(() => {
      refreshWidgetState(false);
    }, 30000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initWidget);
  } else {
    initWidget();
  }
})();

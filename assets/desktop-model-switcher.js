(function () {
  if (window.__codexNexusModelSwitcherLoaded) return;
  window.__codexNexusModelSwitcherLoaded = true;

  const DASHBOARD_URL = "http://127.0.0.1:4321";
  const WIDGET_DIAGNOSTICS_URL = `${DASHBOARD_URL}/api/widget-diagnostics`;
  const WIDGET_ID = "codex-nexus-model-switcher-widget";
  let lastDiagnosticSignature = "";
  const CHAT_HEADER_SELECTORS = [
    '[data-testid="conversation-header"]',
    '[data-testid="thread-header"]',
    '[data-testid="chat-header"]',
    '[data-testid*="conversation-header"]',
    '[data-testid*="thread-header"]',
    '[data-testid*="chat-header"]',
  ];
  const COMPOSER_HEADER_SELECTORS = [
    '[data-testid="composer-header"]',
    '[data-testid="composer-utility-bar"]',
    '[data-testid*="composer"][data-testid*="utility"]',
    '[class*="composer"] [class*="utility"]',
    '[class*="composer"] [class*="branch"]',
    '[class*="composer"] [class*="worktree"]',
    ".conversation-footer .composer-wrap",
    ".conversation-footer",
    ".composer-wrap",
  ];

  const style = document.createElement("style");
  style.id = "codex-nexus-widget-styles";
  style.textContent = `
    #${WIDGET_ID} {
      position: relative;
      display: none;
      z-index: 20;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Vazirmatn", sans-serif;
      user-select: none;
      direction: ltr;
      pointer-events: auto !important;
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
    .cn-model-trigger {
      display: inline-flex;
      align-items: center;
      -webkit-app-region: no-drag !important;
      app-region: no-drag !important;
      gap: 5px;
      padding: 5px 8px;
      background: transparent;
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 7px;
      color: #FCFCFA;
      font-size: 11px;
      font-weight: 600;
      line-height: 1;
      cursor: pointer;
      pointer-events: auto !important;
      white-space: nowrap;
    }
    .cn-model-trigger:hover, .cn-model-trigger[aria-expanded="true"] {
      background: rgba(255, 255, 255, 0.08);
      border-color: rgba(142, 205, 255, 0.65);
    }
    .cn-trigger-label { max-width: 160px; overflow: hidden; text-overflow: ellipsis; }
    .cn-trigger-chevron { opacity: 0.7; font-size: 9px; }
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
    .cn-model-menu {
      display: none;
      position: absolute;
      top: calc(100% + 6px);
      right: 0;
      width: min(320px, calc(100vw - 24px));
      padding: 10px;
      background: #1e2023;
      border: 1px solid #43474e;
      border-radius: 10px;
      box-shadow: 0 12px 30px rgba(0, 0, 0, 0.52);
      flex-direction: column;
      gap: 9px;
    }
    .cn-model-menu.open { display: flex; }
    .cn-field {
      display: flex;
      flex-direction: column;
      gap: 3px;
      min-width: 0;
    }
    .cn-field label {
      font-size: 9px;
      font-weight: 600;
      color: #8c9199;
    }
    .cn-field select, .cn-field input {
      background: #121316;
      border: 1px solid #43474e;
      border-radius: 5px;
      padding: 5px 7px;
      color: #FCFCFA;
      font-size: 11px;
      outline: none;
    }
    .cn-field select:focus, .cn-field input:focus {
      border-color: #8ecdff;
    }
    .cn-btn-row {
      display: flex;
      gap: 6px;
      margin-top: 0;
    }
    .cn-btn {
      flex: 1;
      padding: 6px 8px;
      border-radius: 5px;
      font-size: 10px;
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
    .cn-status-msg { max-width: 100%; }
    .cn-model-trigger.offline { border-color: rgba(255, 92, 87, 0.55); }
    @media (max-width: 900px) {
      .cn-trigger-label { max-width: 110px; }
      .cn-model-menu { right: auto; left: 0; }
    }
  `;
  document.head.appendChild(style);

  const container = document.createElement("div");
  container.id = WIDGET_ID;
  container.innerHTML = `
    <button class="cn-model-trigger" id="cnDropdownToggle" type="button" aria-expanded="false" aria-controls="cnModelMenu">
      <span class="cn-dot"></span>
      <span class="cn-trigger-label" id="cnTriggerLabel">Model</span>
      <span class="cn-trigger-chevron">▼</span>
    </button>
    <div class="cn-model-menu" id="cnModelMenu">
      <div class="cn-status-msg" id="cnStatusMsg"></div>
      <div class="cn-field">
        <label for="cnProfileSelect">Profile</label>
        <select id="cnProfileSelect"><option value="">Profiles…</option></select>
      </div>
      <div class="cn-field">
        <label for="cnProviderSelect">Provider</label>
        <select id="cnProviderSelect"></select>
      </div>
      <div class="cn-field" style="min-width: 170px;">
        <label for="cnModelSelect">Model <span id="cnModelCount"></span></label>
        <input type="text" id="cnModelFilter" placeholder="Filter models…" style="margin-bottom: 3px;" />
        <select id="cnModelSelect"></select>
      </div>
      <div class="cn-btn-row">
        <button class="cn-btn cn-btn-secondary" id="cnBtnSaveProfile" title="Save this provider-model pair as a profile">Save profile</button>
        <button class="cn-btn cn-btn-primary" id="cnBtnApply">Apply & Reload</button>
        <button class="cn-btn cn-btn-secondary" id="cnBtnOpenDash" title="Open Full Web Dashboard">Dashboard</button>
        <button class="cn-btn cn-btn-secondary" id="cnBtnRetry" title="Retry local dashboard connection">Retry</button>
      </div>
    </div>
  `;

  function getMountTargetName(header) {
    if (!header) return "none";
    if (header.matches(".conversation-footer, .composer-wrap") || header.closest(".conversation-footer")) {
      return "conversation-footer";
    }
    if (header.matches(COMPOSER_HEADER_SELECTORS.join(","))) return "composer-header";
    if (header.matches(CHAT_HEADER_SELECTORS.join(","))) return "chat-header";
    return "other";
  }

  function reportWidgetDiagnostic(header) {
    const attached = Boolean(header && container.parentElement === header);
    const snapshot = {
      stage: attached ? "attached" : "unattached",
      scriptLoaded: true,
      attached,
      target: getMountTargetName(header),
      editorCount: document.querySelectorAll('textarea, [contenteditable="true"]').length,
      shadowRootCount: Array.from(document.querySelectorAll("*")).filter((element) => element.shadowRoot).length,
    };
    const signature = JSON.stringify(snapshot);
    if (signature === lastDiagnosticSignature) return;
    lastDiagnosticSignature = signature;
    fetch(WIDGET_DIAGNOSTICS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: signature,
    }).catch(() => {});
  }

  function findComposerHeader() {
    for (let index = 0; index < COMPOSER_HEADER_SELECTORS.length; index++) {
      const header = document.querySelector(COMPOSER_HEADER_SELECTORS[index]);
      if (header) return header;
    }

    // Codex Desktop's utility bar currently has no stable test id. Start from
    // the active composer rather than falling back to a viewport-level widget.
    const editors = document.querySelectorAll('textarea, [contenteditable="true"]');
    for (let index = 0; index < editors.length; index++) {
      const form = editors[index].closest("form");
      if (!form) continue;
      const toolbar = form.querySelector('[role="toolbar"]');
      if (toolbar) return toolbar;
      const button = form.querySelector("button");
      if (button && button.parentElement && button.parentElement !== form) {
        return button.parentElement;
      }
      return form;
    }
    return null;
  }

  function findChatHeader() {
    for (let index = 0; index < CHAT_HEADER_SELECTORS.length; index++) {
      const header = document.querySelector(CHAT_HEADER_SELECTORS[index]);
      if (header) return header;
    }
    const candidates = document.querySelectorAll("header, [role=toolbar], [data-testid]");
    for (let index = 0; index < candidates.length; index++) {
      const text = (candidates[index].textContent || "").toLowerCase();
      if (text.includes("project") && text.includes("branch")) return candidates[index];
    }
    return findComposerHeader();
  }

  function attachToChatHeader() {
    const header = findChatHeader();
    if (!header) {
      container.style.display = "none";
      reportWidgetDiagnostic(null);
      return false;
    }
    if (container.parentElement !== header) {
      const isComposerHost = header.matches(".conversation-footer, .composer-wrap")
        || Boolean(header.closest(".conversation-footer"));
      if (isComposerHost) header.prepend(container);
      else header.appendChild(container);
    }
    container.style.display = "block";
    reportWidgetDiagnostic(header);
    return true;
  }

  function initWidget() {
    if (!document.body) {
      setTimeout(initWidget, 100);
      return;
    }
    attachToChatHeader();
    setupEvents();
    refreshWidgetState(false);
    setupRtlEngine();
    setInterval(attachToChatHeader, 1500);
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

  function showMessage(text, isError) {
    const el = document.getElementById("cnStatusMsg");
    if (!el) return;
    el.textContent = text;
    el.className = "cn-status-msg " + (isError ? "cn-status-err" : "cn-status-ok");
    el.style.display = "block";
    setTimeout(() => { el.style.display = "none"; }, 3500);
  }

  function setToolbarStatus(online, labelText = "") {
    const trigger = document.getElementById("cnDropdownToggle");
    if (!trigger) return;
    const dot = trigger.querySelector(".cn-dot");
    if (online) {
      trigger.classList.remove("offline");
      if (dot) dot.classList.remove("offline");
    } else {
      trigger.classList.add("offline");
      if (dot) dot.classList.add("offline");
      showMessage(labelText || "Nexus dashboard is offline", true);
    }
  }

  const modelsCache = new Map();

  async function refreshWidgetState(loadModels = false) {
    try {
      const res = await fetch(`${DASHBOARD_URL}/api/status`, { mode: "cors" });
      const data = await res.json();
      if (!data.ok || !data.config) throw new Error("Invalid status response");
      widgetState = data;

      const cfg = data.config;
      setToolbarStatus(true);
      const shortModel = (cfg.model || "default").split("/").pop();
      const triggerLabel = document.getElementById("cnTriggerLabel");
      if (triggerLabel) triggerLabel.textContent = `${cfg.modelProvider || "openai"}: ${shortModel}`;
      const provSelect = document.getElementById("cnProviderSelect");
      if (provSelect) {
        const priorValue = provSelect.value;
        provSelect.innerHTML = "";
        (cfg.providers || []).forEach(p => {
          const opt = document.createElement("option");
          opt.value = p.id;
          opt.textContent = p.name || p.id;
          if (p.id === cfg.modelProvider) opt.selected = true;
          provSelect.appendChild(opt);
        });
        if (!provSelect.options.length) {
          const opt = document.createElement("option");
          opt.value = "openai";
          opt.textContent = "OpenAI";
          provSelect.appendChild(opt);
        }
        if (priorValue && [...provSelect.options].some(opt => opt.value === priorValue)) {
          provSelect.value = priorValue;
        }
      }
      await loadProfiles();
      if (loadModels || !currentLoadedModels.length) await loadProviderModels(provSelect.value, cfg.model);
    } catch {
      setToolbarStatus(false, "Nexus dashboard is offline");
    }
  }

  async function loadProfiles() {
    const select = document.getElementById("cnProfileSelect");
    if (!select) return;
    try {
      const res = await fetch(`${DASHBOARD_URL}/api/profiles`, { mode: "cors" });
      const data = await res.json();
      if (!data.ok) throw new Error("Invalid profiles response");
      const selected = select.value;
      select.innerHTML = '<option value="">Profiles…</option>';
      (data.profiles || []).forEach(profile => {
        const option = document.createElement("option");
        option.value = profile.id;
        option.textContent = `${profile.name} — ${profile.providerId}: ${profile.model}`;
        select.appendChild(option);
      });
      select.value = selected;
    } catch {
      select.innerHTML = '<option value="">Profiles unavailable</option>';
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
    const dropdownToggle = document.getElementById("cnDropdownToggle");
    const modelMenu = document.getElementById("cnModelMenu");
    const provSelect = document.getElementById("cnProviderSelect");
    const btnApply = document.getElementById("cnBtnApply");
    const btnOpenDash = document.getElementById("cnBtnOpenDash");
    const btnRetry = document.getElementById("cnBtnRetry");
    const btnSaveProfile = document.getElementById("cnBtnSaveProfile");
    const profileSelect = document.getElementById("cnProfileSelect");

    function setMenuOpen(isOpen, restoreFocus = false) {
      if (!dropdownToggle || !modelMenu) return;
      modelMenu.classList.toggle("open", isOpen);
      dropdownToggle.setAttribute("aria-expanded", String(isOpen));
      if (isOpen) refreshWidgetState(true);
      if (restoreFocus) dropdownToggle.focus();
    }

    if (dropdownToggle && modelMenu) {
      dropdownToggle.onclick = () => {
        setMenuOpen(!modelMenu.classList.contains("open"));
      };

      document.addEventListener("click", (event) => {
        if (!container.contains(event.target)) setMenuOpen(false);
      });

      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && modelMenu.classList.contains("open")) {
          setMenuOpen(false, true);
        }
      });
    }

    if (btnRetry) {
      btnRetry.onclick = () => refreshWidgetState(true);
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

    btnSaveProfile.onclick = async () => {
      const providerId = provSelect.value;
      const model = document.getElementById("cnModelSelect").value;
      const name = window.prompt("Profile name", `${providerId}: ${model}`);
      if (!name || !providerId || !model) return;
      try {
        const res = await fetch(`${DASHBOARD_URL}/api/profiles`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, providerId, model })
        });
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || "Could not save profile");
        await loadProfiles();
        profileSelect.value = data.profile.id;
        showMessage("Profile saved", false);
      } catch (error) {
        showMessage(error.message || "Could not save profile", true);
      }
    };

    profileSelect.onchange = async (event) => {
      const profileId = event.target.value;
      if (!profileId) return;
      try {
        const res = await fetch(`${DASHBOARD_URL}/api/profiles/activate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ profileId })
        });
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || "Could not activate profile");
        showMessage("Profile applied. Reloading app…", false);
        setTimeout(() => window.location.reload(), 400);
      } catch (error) {
        showMessage(error.message || "Could not activate profile", true);
      }
    };

    btnOpenDash.onclick = () => {
      window.open(DASHBOARD_URL, "_blank");
    };

    window.addEventListener("focus", () => {
      refreshWidgetState(true);
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

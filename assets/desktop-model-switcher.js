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
      top: 10px;
      left: 70px;
      z-index: 999999;
      font-family: -apple-system, BlinkMacSystemFont, "Vazirmatn", "Segoe UI", Roboto, sans-serif;
      user-select: none;
      direction: ltr;
    }
    .cn-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 5px 12px;
      background: rgba(30, 32, 35, 0.85);
      backdrop-filter: blur(8px);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 9999px;
      color: #FCFCFA;
      font-size: 11.5px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.25);
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .cn-pill:hover {
      background: rgba(45, 48, 53, 0.95);
      border-color: #8ecdff;
      transform: translateY(-1px);
    }
    .cn-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #A9DC76;
      box-shadow: 0 0 6px #A9DC76;
    }
    .cn-arrow {
      font-size: 8px;
      opacity: 0.7;
    }
    .cn-popover {
      display: none;
      position: absolute;
      top: calc(100% + 8px);
      left: 0;
      width: 310px;
      background: #1e2023;
      border: 1px solid #43474e;
      border-radius: 12px;
      padding: 16px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
      color: #e2e2e5;
      flex-direction: column;
      gap: 12px;
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
    <div class="cn-pill" id="cnPill" title="Codex Nexus — Model Switcher">
      <span class="cn-dot"></span>
      <span id="cnPillLabel">Codex Model</span>
      <span class="cn-arrow">▼</span>
    </div>
    <div class="cn-popover" id="cnPopover">
      <div class="cn-popover-title">
        <span>⚡ Quick Model Switcher</span>
        <button id="cnBtnClose" style="background:none;border:none;color:#8c9199;cursor:pointer;font-size:14px;">✕</button>
      </div>
      <div class="cn-status-msg" id="cnStatusMsg"></div>
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
    </div>
  `;

  function initWidget() {
    if (!document.body) {
      setTimeout(initWidget, 100);
      return;
    }
    document.body.appendChild(container);
    setupEvents();
    refreshWidgetState();
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

  async function refreshWidgetState() {
    try {
      const res = await fetch(`${DASHBOARD_URL}/api/status`, { mode: "cors" });
      const data = await res.json();
      if (!data.ok || !data.config) return;
      widgetState = data;

      const cfg = data.config;
      const pillLabel = document.getElementById("cnPillLabel");
      const shortModel = (cfg.model || "default").split("/").pop();
      pillLabel.textContent = `${cfg.modelProvider || "openai"}: ${shortModel}`;

      const provSelect = document.getElementById("cnProviderSelect");
      provSelect.innerHTML = "";
      (cfg.providers || []).forEach(p => {
        const opt = document.createElement("option");
        opt.value = p.id;
        opt.textContent = p.name || p.id;
        if (p.id === cfg.modelProvider) opt.selected = true;
        provSelect.appendChild(opt);
      });

      await loadProviderModels(cfg.modelProvider, cfg.model);
    } catch {
      const pillLabel = document.getElementById("cnPillLabel");
      pillLabel.textContent = "Nexus (Dashboard Offline)";
    }
  }

  let currentLoadedModels = [];
  let selectedModelValue = "";

  function renderModelOptions(filterTerm = "") {
    const modelSelect = document.getElementById("cnModelSelect");
    const countBadge = document.getElementById("cnModelCount");
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
    if (selectedModelValue && !filtered.includes(selectedModelValue) && !term) {
      filtered.unshift(selectedModelValue);
    }

    filtered.forEach(m => {
      const opt = document.createElement("option");
      opt.value = m;
      opt.textContent = m;
      if (m === selectedModelValue) opt.selected = true;
      modelSelect.appendChild(opt);
    });

    if (filtered.length === 0 && term) {
      const opt = document.createElement("option");
      opt.value = filterTerm.trim();
      opt.textContent = `Custom: ${filterTerm.trim()}`;
      opt.selected = true;
      modelSelect.appendChild(opt);
    }
  }

  async function loadProviderModels(providerId, currentModel) {
    selectedModelValue = currentModel || selectedModelValue || "";
    currentLoadedModels = [selectedModelValue].filter(Boolean);
    renderModelOptions();

    const filterInput = document.getElementById("cnModelFilter");
    if (filterInput) filterInput.value = "";

    try {
      const res = await fetch(`${DASHBOARD_URL}/api/provider/models?id=${encodeURIComponent(providerId)}`);
      const data = await res.json();
      if (data.ok && data.models && data.models.length > 0) {
        currentLoadedModels = data.models;
        if (selectedModelValue && !currentLoadedModels.includes(selectedModelValue)) {
          currentLoadedModels.unshift(selectedModelValue);
        }
      }
    } catch {}

    renderModelOptions();
  }

  function setupEvents() {
    const pill = document.getElementById("cnPill");
    const popover = document.getElementById("cnPopover");
    const btnClose = document.getElementById("cnBtnClose");
    const provSelect = document.getElementById("cnProviderSelect");
    const btnApply = document.getElementById("cnBtnApply");
    const btnOpenDash = document.getElementById("cnBtnOpenDash");

    pill.onclick = () => {
      popover.classList.toggle("open");
      if (popover.classList.contains("open")) {
        refreshWidgetState();
      }
    };

    btnClose.onclick = () => { popover.classList.remove("open"); };

    provSelect.onchange = (e) => {
      loadProviderModels(e.target.value);
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
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initWidget);
  } else {
    initWidget();
  }
})();

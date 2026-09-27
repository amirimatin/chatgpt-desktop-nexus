#!/usr/bin/env node
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");

const {
  deleteModelProvider,
  fetchModelsForProvider,
  fetchProviderModelsFromConfig,
  readCodexModelConfig,
  saveProviderToken,
  setActiveModelProvider,
  upsertModelProvider,
  writeCodexModelConfig
} = require("../lib/codex-config-core");

const {
  applyDesktopTheme,
  findCodexDesktopInstallation,
  inspectDesktopThemeStatus,
  restoreDesktopTheme
} = require("../lib/desktop-patch-core");

const DEFAULT_PORT = 4321;

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        req.destroy(new Error("Request body too large"));
      }
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-cache, no-store, must-revalidate"
  });
  res.end(JSON.stringify(data));
}

function sendError(res, statusCode, message, extra = {}) {
  sendJson(res, statusCode, { ok: false, error: message, ...extra });
}

function getDesktopStatus() {
  const target = findCodexDesktopInstallation();
  if (!target) {
    return { found: false, asarPath: null, patched: false, writable: false };
  }
  const status = inspectDesktopThemeStatus(target);
  return {
    found: status.found,
    asarPath: target.asarPath,
    patched: status.patched,
    hasBackup: status.hasBackup,
    writable: status.writable
  };
}

function renderHtml() {
  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Codex Nexus — Dashboard</title>
  <style>
    :root {
      --md-sys-color-primary: #006495;
      --md-sys-color-on-primary: #ffffff;
      --md-sys-color-primary-container: #cbe6ff;
      --md-sys-color-on-primary-container: #001e30;
      --md-sys-color-surface: #f8f9fa;
      --md-sys-color-surface-container: #ffffff;
      --md-sys-color-on-surface: #191c1e;
      --md-sys-color-outline: #73777f;
      --md-sys-color-outline-variant: #c3c7cf;
      --md-sys-color-error: #ba1a1a;
      --md-sys-color-error-container: #ffdad6;
      --md-sys-color-success: #2e7d32;
      --md-sys-color-success-container: #d4edda;
      --radius-sm: 8px;
      --radius-md: 12px;
      --radius-lg: 16px;
      --radius-full: 9999px;
      --font-stack: "Vazirmatn", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }

    [data-theme="dark"] {
      --md-sys-color-primary: #8ecdff;
      --md-sys-color-on-primary: #00344f;
      --md-sys-color-primary-container: #004b71;
      --md-sys-color-on-primary-container: #cbe6ff;
      --md-sys-color-surface: #121316;
      --md-sys-color-surface-container: #1e2023;
      --md-sys-color-on-surface: #e2e2e5;
      --md-sys-color-outline: #8c9199;
      --md-sys-color-outline-variant: #43474e;
      --md-sys-color-error: #ffb4ab;
      --md-sys-color-error-container: #93000a;
      --md-sys-color-success: #81c784;
      --md-sys-color-success-container: #1b5e20;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--font-stack);
      background-color: var(--md-sys-color-surface);
      color: var(--md-sys-color-on-surface);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 24px 16px;
      transition: background-color 0.2s, color 0.2s;
    }

    .container {
      width: 100%;
      max-width: 900px;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 20px;
      background: var(--md-sys-color-surface-container);
      border-radius: var(--radius-lg);
      border: 1px solid var(--md-sys-color-outline-variant);
    }
    .header-title {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .header-title h1 {
      font-size: 1.3rem;
      font-weight: 700;
    }
    .header-title span {
      font-size: 0.8rem;
      padding: 2px 8px;
      border-radius: var(--radius-full);
      background: var(--md-sys-color-primary-container);
      color: var(--md-sys-color-on-primary-container);
      font-weight: 600;
    }
    .header-actions {
      display: flex;
      gap: 8px;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 8px 16px;
      border-radius: var(--radius-full);
      font-family: inherit;
      font-size: 0.875rem;
      font-weight: 600;
      border: 1px solid transparent;
      cursor: pointer;
      transition: all 0.15s ease;
      text-decoration: none;
    }
    .btn-primary {
      background: var(--md-sys-color-primary);
      color: var(--md-sys-color-on-primary);
    }
    .btn-primary:hover { opacity: 0.92; }
    .btn-secondary {
      background: transparent;
      border-color: var(--md-sys-color-outline);
      color: var(--md-sys-color-on-surface);
    }
    .btn-secondary:hover { background: rgba(128,128,128,0.08); }
    .btn-danger {
      background: var(--md-sys-color-error-container);
      color: var(--md-sys-color-error);
    }
    .btn-danger:hover { opacity: 0.85; }

    .card {
      background: var(--md-sys-color-surface-container);
      border: 1px solid var(--md-sys-color-outline-variant);
      border-radius: var(--radius-lg);
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .card-title {
      font-size: 1.1rem;
      font-weight: 700;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    /* Active Model Selector */
    .active-bar {
      display: grid;
      grid-template-columns: 1fr 1fr auto;
      gap: 12px;
      align-items: flex-end;
    }
    @media (max-width: 650px) {
      .active-bar { grid-template-columns: 1fr; }
    }
    .field {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .field label {
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--md-sys-color-outline);
    }
    .field input, .field select {
      padding: 10px 14px;
      border-radius: var(--radius-sm);
      border: 1px solid var(--md-sys-color-outline-variant);
      background: var(--md-sys-color-surface);
      color: var(--md-sys-color-on-surface);
      font-family: inherit;
      font-size: 0.95rem;
      outline: none;
    }
    .field input:focus, .field select:focus {
      border-color: var(--md-sys-color-primary);
    }

    /* Providers Grid */
    .provider-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: 14px;
    }
    .provider-card {
      background: var(--md-sys-color-surface);
      border: 1px solid var(--md-sys-color-outline-variant);
      border-radius: var(--radius-md);
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      position: relative;
    }
    .provider-card.active {
      border-color: var(--md-sys-color-primary);
      box-shadow: 0 0 0 2px var(--md-sys-color-primary-container);
    }
    .provider-card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .provider-name {
      font-weight: 700;
      font-size: 1rem;
    }
    .provider-badge {
      font-size: 0.72rem;
      padding: 2px 6px;
      border-radius: var(--radius-full);
      background: var(--md-sys-color-success-container);
      color: var(--md-sys-color-success);
      font-weight: 700;
    }
    .provider-url {
      font-size: 0.8rem;
      color: var(--md-sys-color-outline);
      word-break: break-all;
    }
    .provider-actions {
      display: flex;
      gap: 6px;
      margin-top: auto;
      padding-top: 8px;
    }

    /* Modal / Drawer */
    .modal-backdrop {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
      z-index: 100;
      justify-content: center;
      align-items: center;
      padding: 16px;
    }
    .modal-backdrop.open { display: flex; }
    .modal {
      background: var(--md-sys-color-surface-container);
      border-radius: var(--radius-lg);
      width: 100%;
      max-width: 500px;
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      border: 1px solid var(--md-sys-color-outline-variant);
      box-shadow: 0 8px 30px rgba(0,0,0,0.25);
    }

    /* Desktop Theme Card */
    .theme-status-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      background: var(--md-sys-color-surface);
      border-radius: var(--radius-md);
      border: 1px solid var(--md-sys-color-outline-variant);
    }
    .badge {
      padding: 4px 10px;
      border-radius: var(--radius-full);
      font-size: 0.8rem;
      font-weight: 700;
    }
    .badge-ok { background: var(--md-sys-color-success-container); color: var(--md-sys-color-success); }
    .badge-warn { background: var(--md-sys-color-error-container); color: var(--md-sys-color-error); }

    /* Live Preview */
    .preview-box {
      background: var(--md-sys-color-surface);
      border-radius: var(--radius-md);
      padding: 16px;
      border: 1px solid var(--md-sys-color-outline-variant);
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .preview-h1 { color: #FF6188; font-weight: 800; font-size: 1.3rem; }
    .preview-h2 { color: #FC9867; font-weight: 800; font-size: 1.15rem; }
    .preview-h3 { color: #FFD866; font-weight: 700; font-size: 1.05rem; }
    .preview-code { color: #FFD866; background: #221F22; padding: 2px 6px; border-radius: 4px; font-family: monospace; }
    .preview-quote { border-inline-start: 4px solid #A9DC76; background: rgba(169, 220, 118, 0.08); padding: 8px 12px; border-radius: 4px; }

    /* Toast */
    #toast {
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%) translateY(100px);
      background: #323232;
      color: #fff;
      padding: 10px 20px;
      border-radius: var(--radius-full);
      font-size: 0.9rem;
      font-weight: 600;
      opacity: 0;
      transition: all 0.25s ease;
      z-index: 1000;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    }
    #toast.show {
      transform: translateX(-50%) translateY(0);
      opacity: 1;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="header-title">
        <h1 data-i18n="appTitle">Codex Nexus</h1>
        <span>Desktop & CLI</span>
      </div>
      <div class="header-actions">
        <button id="themeToggle" class="btn btn-secondary" title="Theme">🌓</button>
        <button id="langToggle" class="btn btn-secondary">English</button>
      </div>
    </header>

    <!-- Active Model & Provider -->
    <div class="card">
      <div class="card-title">
        <span data-i18n="activeModelCardTitle">مدل و پرووایدر فعال</span>
        <button id="btnRefreshModels" class="btn btn-secondary" style="font-size: 0.8rem; padding: 4px 12px;">🔄 <span data-i18n="refreshModels">بروزرسانی مدل‌ها</span></button>
      </div>
      <div class="active-bar">
        <div class="field">
          <label data-i18n="providerLabel">پرووایدر هوش مصنوعی</label>
          <select id="activeProviderSelect"></select>
        </div>
        <div class="field" style="flex: 2;">
          <div style="display: flex; justify-content: space-between; align-items: baseline;">
            <label data-i18n="modelLabel">مدل فعال</label>
            <span id="modelsCountBadge" style="font-size: 0.75rem; color: var(--md-sys-color-primary); font-weight: 500;"></span>
          </div>
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            <input type="text" id="modelFilterInput" placeholder="🔍 فیلتر و جستجوی بین ۸۰۰+ مدل..." style="flex: 1; min-width: 140px; padding: 10px 12px; border-radius: 8px; border: 1px solid var(--md-sys-color-outline-variant); background: var(--md-sys-color-surface-container-high); color: var(--md-sys-color-on-surface); font-family: inherit; font-size: 0.85rem;" />
            <select id="activeModelSelect" style="flex: 2; min-width: 220px;"></select>
          </div>
        </div>
        <button id="btnSaveActive" class="btn btn-primary" data-i18n="saveAndApply">ذخیره و فعال‌سازی</button>
      </div>
    </div>

    <!-- Providers Manager -->
    <div class="card">
      <div class="card-title">
        <span data-i18n="manageProvidersTitle">مدیریت پرووایدرها</span>
        <button id="btnAddProvider" class="btn btn-primary" style="font-size: 0.8rem; padding: 6px 14px;">➕ <span data-i18n="addProvider">افزودن پرووایدر جدید</span></button>
      </div>
      <div id="providersGrid" class="provider-grid"></div>
    </div>

    <!-- Desktop Markdown Theme -->
    <div class="card">
      <div class="card-title">
        <span data-i18n="markdownThemeTitle">تم رنگی مارک‌داون دسکتاپ (Monokai)</span>
      </div>
      <p style="font-size: 0.85rem; color: var(--md-sys-color-outline);" data-i18n="markdownThemeDesc">
        اعمال پالت رنگی مونوکای روی متون، هدینگ‌ها، کدها و جداول در برنامه دسکتاپ Codex (بدون دستکاری فونت یا دایرکشن).
      </p>

      <div class="theme-status-row">
        <div>
          <strong data-i18n="desktopStatusLabel">وضعیت اپلیکیشن دسکتاپ:</strong>
          <span id="desktopAppPath" style="font-size: 0.8rem; display: block; color: var(--md-sys-color-outline); font-family: monospace;"></span>
        </div>
        <span id="desktopThemeBadge" class="badge">بررسی...</span>
      </div>

      <div style="display: flex; gap: 10px; flex-wrap: wrap;">
        <button id="btnApplyTheme" class="btn btn-primary" data-i18n="applyThemeBtn">اعمال تم به دسکتاپ</button>
        <button id="btnRestoreTheme" class="btn btn-secondary" data-i18n="restoreThemeBtn">بازگردانی استایل اولیه</button>
      </div>

      <div class="preview-box">
        <div style="font-size: 0.8rem; font-weight: 700; color: var(--md-sys-color-outline);" data-i18n="previewTitle">پیش‌نمایش زنده پالت مونوکای:</div>
        <div class="preview-h1"># هدینگ سطح ۱ ( صورتی Monokai )</div>
        <div class="preview-h2">## هدینگ سطح ۲ ( نارنجی Monokai )</div>
        <div class="preview-h3">### هدینگ سطح ۳ ( طلایی Monokai )</div>
        <div>یک متن با <span class="preview-code">کد اینلاین زرد</span> و <strong>متن بولد برجسته</strong> همراه با لینک.</div>
        <div class="preview-quote">نقل قول با حاشیه سبز Monokai و پس‌زمینه محو سازگار.</div>
      </div>
    </div>
  </div>

  <!-- Modal for Add/Edit Provider -->
  <div id="providerModal" class="modal-backdrop">
    <div class="modal">
      <h2 id="modalTitle" style="font-size: 1.15rem; font-weight: 700;">ثبت پرووایدر جدید</h2>
      <div class="field">
        <label>شناسه پرووایدر (ID)*</label>
        <input type="text" id="modalProviderId" placeholder="e.g. omniroute, deepseek, openrouter">
      </div>
      <div class="field">
        <label>نام نمایشی (Display Name)</label>
        <input type="text" id="modalProviderName" placeholder="e.g. Enterprise AI Gateway">
      </div>
      <div class="field">
        <label>آدرس پایه (Base URL)*</label>
        <input type="text" id="modalBaseUrl" placeholder="https://api.example.com/v1">
      </div>
      <div class="field">
        <label>نوع رابط (Wire API)</label>
        <select id="modalWireApi">
          <option value="responses">responses (Codex Native)</option>
          <option value="chat">chat (Standard OpenAI /v1/chat/completions)</option>
        </select>
      </div>
      <div class="field">
        <label>کلید دسترسی (API Key / Bearer Token)</label>
        <input type="password" id="modalApiKey" placeholder="sk-...">
      </div>
      <div style="display: flex; gap: 8px; justify-content: flex-end; margin-top: 10px;">
        <button id="modalBtnCancel" class="btn btn-secondary">انصراف</button>
        <button id="modalBtnSave" class="btn btn-primary">ذخیره پرووایدر</button>
      </div>
    </div>
  </div>

  <div id="toast">پیام سیستم</div>

  <script>
    let appState = null;
    let currentLang = 'fa';

    const I18N = {
      fa: {
        appTitle: "Codex Nexus",
        activeModelCardTitle: "مدل و پرووایدر فعال",
        refreshModels: "بروزرسانی مدل‌ها",
        providerLabel: "پرووایدر هوش مصنوعی",
        modelLabel: "مدل فعال",
        saveAndApply: "ذخیره و فعال‌سازی",
        manageProvidersTitle: "مدیریت پرووایدرها",
        addProvider: "افزودن پرووایدر جدید",
        markdownThemeTitle: "تم رنگی مارک‌داون دسکتاپ (Monokai)",
        markdownThemeDesc: "اعمال پالت رنگی مونوکای روی متون، هدینگ‌ها، کدها و جداول در برنامه دسکتاپ Codex (بدون دستکاری فونت یا دایرکشن).",
        desktopStatusLabel: "وضعیت اپلیکیشن دسکتاپ:",
        applyThemeBtn: "اعمال تم به دسکتاپ",
        restoreThemeBtn: "بازگردانی استایل اولیه",
        previewTitle: "پیش‌نمایش زنده پالت مونوکای:",
        activeBadge: "فعال",
        modelFilterPlaceholder: "🔍 فیلتر و جستجوی مدل...",
        modelsCount: "مدل دریافت شد",
        editBtn: "ویرایش",
        deleteBtn: "حذف",
        setActiveBtn: "انتخاب فعال",
        langToggle: "English"
      },
      en: {
        appTitle: "Codex Nexus",
        activeModelCardTitle: "Active Model & Provider",
        refreshModels: "Refresh Models",
        providerLabel: "AI Model Provider",
        modelLabel: "Active Model",
        saveAndApply: "Save & Apply",
        manageProvidersTitle: "Manage Model Providers",
        addProvider: "Add New Provider",
        markdownThemeTitle: "Desktop Markdown Color Theme (Monokai)",
        markdownThemeDesc: "Applies the Monokai color palette to text, headings, code, and tables in Codex Desktop (preserves native font and direction).",
        desktopStatusLabel: "Codex Desktop Status:",
        applyThemeBtn: "Apply Theme to Desktop",
        restoreThemeBtn: "Restore Default Styling",
        previewTitle: "Live Monokai Palette Preview:",
        activeBadge: "Active",
        modelFilterPlaceholder: "🔍 Filter models...",
        modelsCount: "models loaded",
        editBtn: "Edit",
        deleteBtn: "Delete",
        setActiveBtn: "Set Active",
        langToggle: "فارسی"
      }
    };

    function showToast(msg) {
      const t = document.getElementById("toast");
      t.textContent = msg;
      t.classList.add("show");
      setTimeout(() => t.classList.remove("show"), 3200);
    }

    async function fetchState() {
      try {
        const res = await fetch("/api/status");
        appState = await res.json();
        renderState();
        if (appState && appState.config && appState.config.modelProvider && (!appState.models || appState.models.length === 0)) {
          fetchModels(appState.config.modelProvider);
        }
      } catch (err) {
        showToast("خطا در بارگذاری اطلاعات: " + err.message);
      }
    }

    function renderState() {
      if (!appState || !appState.config) return;
      const { config, desktopTheme } = appState;

      // Render Providers Dropdown
      const provSelect = document.getElementById("activeProviderSelect");
      provSelect.innerHTML = "";
      (config.providers || []).forEach(p => {
        const opt = document.createElement("option");
        opt.value = p.id;
        opt.textContent = p.name || p.id;
        if (p.id === config.modelProvider) opt.selected = true;
        provSelect.appendChild(opt);
      });

      renderModelsDropdown();

      // Render Providers Grid
      const grid = document.getElementById("providersGrid");
      grid.innerHTML = "";
      (config.providers || []).forEach(p => {
        const isActive = p.id === config.modelProvider;
        const card = document.createElement("div");
        card.className = "provider-card" + (isActive ? " active" : "");
        card.innerHTML = \`
          <div class="provider-card-header">
            <span class="provider-name">\${p.name || p.id}</span>
            \${isActive ? \`<span class="provider-badge">\${I18N[currentLang].activeBadge}</span>\` : ""}
          </div>
          <div class="provider-url">\${p.baseUrl || "—"}</div>
          <div style="font-size: 0.75rem; color: var(--md-sys-color-outline);">Wire: \${p.wireApi || "responses"}</div>
          <div class="provider-actions">
            \${!isActive ? \`<button class="btn btn-secondary" style="font-size: 0.75rem; padding: 4px 10px;" onclick="setActiveProvider('\${p.id}')">\${I18N[currentLang].setActiveBtn}</button>\` : ""}
            <button class="btn btn-secondary" style="font-size: 0.75rem; padding: 4px 10px;" onclick="editProvider('\${p.id}')">\${I18N[currentLang].editBtn}</button>
            \${!isActive ? \`<button class="btn btn-danger" style="font-size: 0.75rem; padding: 4px 10px;" onclick="deleteProvider('\${p.id}')">\${I18N[currentLang].deleteBtn}</button>\` : ""}
          </div>
        \`;
        grid.appendChild(card);
      });

      // Render Desktop Theme Status
      const pathEl = document.getElementById("desktopAppPath");
      const badgeEl = document.getElementById("desktopThemeBadge");
      if (desktopTheme && desktopTheme.found) {
        pathEl.textContent = desktopTheme.asarPath;
        if (desktopTheme.patched) {
          badgeEl.textContent = "✓ تم مونوکای فعال است";
          badgeEl.className = "badge badge-ok";
        } else {
          badgeEl.textContent = "تم پیش‌فرض دسکتاپ";
          badgeEl.className = "badge badge-warn";
        }
      } else {
        pathEl.textContent = "اپلیکیشن دسکتاپ شناسایی نشد";
        badgeEl.textContent = "یافت نشد";
        badgeEl.className = "badge badge-warn";
      }
    }

    async function setActiveProvider(providerId) {
      try {
        const res = await fetch("/api/provider/set-active", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ providerId })
        });
        const data = await res.json();
        if (data.ok) {
          showToast("پرووایدر فعال شد");
          await fetchModels(providerId);
          await fetchState();
        } else {
          showToast(data.error);
        }
      } catch (err) {
        showToast(err.message);
      }
    }

    function renderModelsDropdown(searchTerm = "") {
      const modelSelect = document.getElementById("activeModelSelect");
      const countBadge = document.getElementById("modelsCountBadge");
      const currentModel = (appState && appState.config && appState.config.model) || "";
      const allModels = (appState && appState.models && appState.models.length > 0)
        ? appState.models
        : [currentModel].filter(Boolean);

      const term = (searchTerm || "").trim().toLowerCase();
      let filtered = term
        ? allModels.filter(m => m.toLowerCase().includes(term))
        : allModels;

      if (countBadge) {
        countBadge.textContent = allModels.length > 0
          ? "(" + allModels.length + " " + (I18N[currentLang].modelsCount || "مدل") + ")"
          : "";
      }

      modelSelect.innerHTML = "";
      if (currentModel && !filtered.includes(currentModel) && !term) {
        filtered = [currentModel, ...filtered];
      }

      filtered.forEach(m => {
        const opt = document.createElement("option");
        opt.value = m;
        opt.textContent = m;
        if (m === currentModel) opt.selected = true;
        modelSelect.appendChild(opt);
      });

      if (filtered.length === 0 && term) {
        const opt = document.createElement("option");
        opt.value = searchTerm.trim();
        opt.textContent = "مدل دستی: " + searchTerm.trim();
        opt.selected = true;
        modelSelect.appendChild(opt);
      }
    }

    async function fetchModels(providerId) {
      const btnRefresh = document.getElementById("btnRefreshModels");
      if (btnRefresh) {
        btnRefresh.textContent = currentLang === "fa" ? "⏳ در حال دریافت..." : "⏳ Fetching...";
        btnRefresh.disabled = true;
      }
      try {
        const res = await fetch("/api/provider/models?id=" + encodeURIComponent(providerId));
        const data = await res.json();
        if (data.ok) {
          appState.models = data.models || [];
          renderModelsDropdown(document.getElementById("modelFilterInput")?.value || "");
          showToast(currentLang === "fa" ? ("✓ " + appState.models.length + " مدل از " + providerId + " دریافت شد") : ("✓ " + appState.models.length + " models loaded for " + providerId));
        } else {
          showToast("خطا در دریافت مدل‌ها: " + (data.error || "نامشخص"));
        }
      } catch (err) {
        showToast("خطا در ارتباط: " + err.message);
      } finally {
        if (btnRefresh) {
          btnRefresh.innerHTML = "🔄 <span data-i18n=\"refreshModels\">" + I18N[currentLang].refreshModels + "</span>";
          btnRefresh.disabled = false;
        }
      }
    }

    async function deleteProvider(providerId) {
      if (!confirm("آیا از حذف این پرووایدر اطمینان دارید؟")) return;
      try {
        const res = await fetch("/api/provider/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ providerId })
        });
        const data = await res.json();
        if (data.ok) {
          showToast("پرووایدر حذف شد");
          fetchState();
        } else {
          showToast(data.error);
        }
      } catch (err) {
        showToast(err.message);
      }
    }

    function editProvider(providerId) {
      const p = (appState.config.providers || []).find(item => item.id === providerId);
      if (!p) return;
      document.getElementById("modalProviderId").value = p.id;
      document.getElementById("modalProviderId").disabled = true;
      document.getElementById("modalProviderName").value = p.name || "";
      document.getElementById("modalBaseUrl").value = p.baseUrl || "";
      document.getElementById("modalWireApi").value = p.wireApi || "responses";
      document.getElementById("modalApiKey").value = "";
      document.getElementById("modalTitle").textContent = "ویرایش پرووایدر: " + p.id;
      document.getElementById("providerModal").classList.add("open");
    }

    document.getElementById("btnAddProvider").onclick = () => {
      document.getElementById("modalProviderId").value = "";
      document.getElementById("modalProviderId").disabled = false;
      document.getElementById("modalProviderName").value = "";
      document.getElementById("modalBaseUrl").value = "";
      document.getElementById("modalWireApi").value = "responses";
      document.getElementById("modalApiKey").value = "";
      document.getElementById("modalTitle").textContent = "ثبت پرووایدر جدید";
      document.getElementById("providerModal").classList.add("open");
    };

    document.getElementById("modalBtnCancel").onclick = () => {
      document.getElementById("providerModal").classList.remove("open");
    };

    document.getElementById("modalBtnSave").onclick = async () => {
      const providerId = document.getElementById("modalProviderId").value.trim();
      const name = document.getElementById("modalProviderName").value.trim();
      const baseUrl = document.getElementById("modalBaseUrl").value.trim();
      const wireApi = document.getElementById("modalWireApi").value;
      const apiKey = document.getElementById("modalApiKey").value.trim();

      if (!providerId) return showToast("شناسه پرووایدر الزامی است");

      try {
        const res = await fetch("/api/provider/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            providerId,
            data: { name, baseUrl, wireApi, apiKey }
          })
        });
        const data = await res.json();
        if (data.ok) {
          showToast("پرووایدر ذخیره شد");
          document.getElementById("providerModal").classList.remove("open");
          fetchState();
        } else {
          showToast(data.error);
        }
      } catch (err) {
        showToast(err.message);
      }
    };

    document.getElementById("btnSaveActive").onclick = async () => {
      const providerId = document.getElementById("activeProviderSelect").value;
      const model = document.getElementById("activeModelSelect").value;
      try {
        const res = await fetch("/api/provider/set-active", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ providerId, model })
        });
        const data = await res.json();
        if (data.ok) {
          showToast("مدل و پرووایدر فعال ذخیره شدند");
          fetchState();
        } else {
          showToast(data.error);
        }
      } catch (err) {
        showToast(err.message);
      }
    };

    const filterInput = document.getElementById("modelFilterInput");
    if (filterInput) {
      filterInput.oninput = (e) => renderModelsDropdown(e.target.value);
    }

    document.getElementById("btnRefreshModels").onclick = () => {
      const prov = document.getElementById("activeProviderSelect").value;
      if (prov) {
        showToast("در حال دریافت مدل‌ها...");
        fetchModels(prov);
      }
    };

    document.getElementById("activeProviderSelect").onchange = (e) => {
      fetchModels(e.target.value);
    };

    document.getElementById("btnApplyTheme").onclick = async () => {
      try {
        const res = await fetch("/api/theme/apply", { method: "POST" });
        const data = await res.json();
        if (data.ok) {
          showToast("✓ تم مونوکای با موفقیت اعمال شد. برنامه دسکتاپ را ریستارت کنید.");
          fetchState();
        } else {
          showToast("خطا: " + data.error);
        }
      } catch (err) {
        showToast(err.message);
      }
    };

    document.getElementById("btnRestoreTheme").onclick = async () => {
      try {
        const res = await fetch("/api/theme/restore", { method: "POST" });
        const data = await res.json();
        if (data.ok) {
          showToast("✓ استایل اولیه بازگردانی شد. برنامه دسکتاپ را ریستارت کنید.");
          fetchState();
        } else {
          showToast("خطا: " + data.error);
        }
      } catch (err) {
        showToast(err.message);
      }
    };

    // Theme & Lang
    document.getElementById("themeToggle").onclick = () => {
      const current = document.documentElement.getAttribute("data-theme");
      document.documentElement.setAttribute("data-theme", current === "dark" ? "light" : "dark");
    };

    document.getElementById("langToggle").onclick = () => {
      currentLang = currentLang === "fa" ? "en" : "fa";
      document.documentElement.dir = currentLang === "fa" ? "rtl" : "ltr";
      document.documentElement.lang = currentLang;
      document.getElementById("langToggle").textContent = I18N[currentLang].langToggle;
      document.querySelectorAll("[data-i18n]").forEach(el => {
        const key = el.getAttribute("data-i18n");
        if (I18N[currentLang][key]) el.textContent = I18N[currentLang][key];
      });
      renderState();
    };

    fetchState();
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      document.documentElement.setAttribute("data-theme", "dark");
    }
  </script>
</body>
</html>`;
}

function createServer() {
  return http.createServer(async (req, res) => {
    const parsed = url.parse(req.url, true);
    const { pathname, query } = parsed;

    // CORS & Options
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      // ── API: Status ──
      if (pathname === "/api/status" && req.method === "GET") {
        const config = readCodexModelConfig();
        const desktopTheme = getDesktopStatus();
        return sendJson(res, 200, { ok: true, config, desktopTheme });
      }

      // ── API: Set Active Model ──
      if (pathname === "/api/model/set" && req.method === "POST") {
        const body = await parseJsonBody(req);
        if (!body.model) return sendError(res, 400, "Model name is required");
        const saved = writeCodexModelConfig(body.model);
        return sendJson(res, 200, { ok: true, model: saved.model });
      }

      // ── API: Set Active Provider ──
      if (pathname === "/api/provider/set-active" && req.method === "POST") {
        const body = await parseJsonBody(req);
        if (!body.providerId) return sendError(res, 400, "Provider ID is required");
        setActiveModelProvider(body.providerId);
        if (body.model) {
          writeCodexModelConfig(body.model);
        }
        return sendJson(res, 200, { ok: true, providerId: body.providerId });
      }

      // ── API: Save/Upsert Provider ──
      if (pathname === "/api/provider/save" && req.method === "POST") {
        const body = await parseJsonBody(req);
        if (!body.providerId) return sendError(res, 400, "Provider ID is required");
        const data = body.data || {};
        upsertModelProvider(body.providerId, data);
        if (data.apiKey) {
          saveProviderToken(body.providerId, data.apiKey);
        }
        if (data.activate) {
          setActiveModelProvider(body.providerId);
        }
        return sendJson(res, 200, { ok: true, providerId: body.providerId });
      }

      // ── API: Delete Provider ──
      if (pathname === "/api/provider/delete" && req.method === "POST") {
        const body = await parseJsonBody(req);
        if (!body.providerId) return sendError(res, 400, "Provider ID is required");
        deleteModelProvider(body.providerId);
        return sendJson(res, 200, { ok: true, providerId: body.providerId });
      }

      // ── API: Fetch Provider Models ──
      if (pathname === "/api/provider/models" && req.method === "GET") {
        const providerId = query.id;
        if (!providerId) return sendError(res, 400, "Provider ID parameter is required");
        try {
          const models = await fetchModelsForProvider(providerId);
          return sendJson(res, 200, { ok: true, providerId, models: models || [] });
        } catch (err) {
          return sendError(res, 500, `Could not load provider models: ${err.message}`);
        }
      }

      // ── API: Apply Theme to Desktop ──
      if (pathname === "/api/theme/apply" && req.method === "POST") {
        const target = findCodexDesktopInstallation();
        if (!target) return sendError(res, 404, "Codex Desktop installation was not found.");
        try {
          const result = applyDesktopTheme(target);
          return sendJson(res, 200, { ok: true, ...result });
        } catch (err) {
          const isPerm = err.code === "EACCES";
          return sendError(res, isPerm ? 403 : 500, err.message, { permissionDenied: isPerm });
        }
      }

      // ── API: Restore Theme on Desktop ──
      if (pathname === "/api/theme/restore" && req.method === "POST") {
        const target = findCodexDesktopInstallation();
        if (!target) return sendError(res, 404, "Codex Desktop installation was not found.");
        try {
          const result = restoreDesktopTheme(target);
          return sendJson(res, 200, { ok: true, ...result });
        } catch (err) {
          const isPerm = err.code === "EACCES";
          return sendError(res, isPerm ? 403 : 500, err.message, { permissionDenied: isPerm });
        }
      }

      // ── Root / Dashboard Page ──
      if (pathname === "/" || pathname === "/dashboard") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(renderHtml());
        return;
      }

      // 404 Not Found
      sendError(res, 404, "Not Found");
    } catch (err) {
      sendError(res, 500, err.message);
    }
  });
}

function startServer(port = DEFAULT_PORT) {
  const server = createServer();
  server.listen(port, "127.0.0.1", () => {
    console.log(`\n═════════════════════════════════════════════════════════`);
    console.log(`  Codex Nexus — Local Web Dashboard is running at:`);
    console.log(`  🔗 http://127.0.0.1:${port}`);
    console.log(`═════════════════════════════════════════════════════════\n`);
  });
  return server;
}

if (require.main === module) {
  const portArgIdx = process.argv.indexOf("--port");
  const port = portArgIdx !== -1 && process.argv[portArgIdx + 1]
    ? parseInt(process.argv[portArgIdx + 1], 10)
    : (parseInt(process.env.PORT, 10) || DEFAULT_PORT);

  startServer(port);
}

module.exports = {
  createServer,
  startServer
};

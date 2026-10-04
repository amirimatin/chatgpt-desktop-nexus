"use strict";

const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const THEME_STYLE_ID = "codex-nexus-markdown-theme";
const WIDGET_SCRIPT_ID = "codex-nexus-model-switcher";
const NATIVE_MENU_MARKER = "__codexNexusNativeMenuInjected";
const DEFAULT_THEME_CSS_PATH = path.join(__dirname, "..", "assets", "markdown-monokai-theme.css");
const DEFAULT_WIDGET_JS_PATH = path.join(__dirname, "..", "assets", "desktop-model-switcher.js");

function findCodexDesktopInstallation(customPath = null) {
  if (customPath && fs.existsSync(customPath)) {
    return resolveInstallationTarget(customPath);
  }

  const candidates = [];
  const home = os.homedir();

  if (process.platform === "linux") {
    candidates.push(
      "/usr/lib/chatgpt/resources/app.asar",
      "/opt/ChatGPT/resources/app.asar",
      "/opt/Codex/resources/app.asar",
      path.join(home, ".local", "share", "chatgpt", "resources", "app.asar"),
      path.join(home, ".local", "share", "Codex", "resources", "app.asar")
    );
  } else if (process.platform === "darwin") {
    candidates.push(
      "/Applications/Codex.app/Contents/Resources/app.asar",
      "/Applications/ChatGPT.app/Contents/Resources/app.asar",
      path.join(home, "Applications", "Codex.app", "Contents", "Resources", "app.asar"),
      path.join(home, "Applications", "ChatGPT.app", "Contents", "Resources", "app.asar")
    );
  } else if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA || path.join(home, "AppData", "Local");
    const programFiles = process.env.ProgramFiles || "C:\\Program Files";
    candidates.push(
      path.join(localAppData, "Programs", "Codex", "resources", "app.asar"),
      path.join(localAppData, "Programs", "ChatGPT", "resources", "app.asar"),
      path.join(programFiles, "Codex", "resources", "app.asar"),
      path.join(programFiles, "ChatGPT", "resources", "app.asar")
    );
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return resolveInstallationTarget(candidate);
    }
  }

  return null;
}

function resolveInstallationTarget(asarPath) {
  const resourcesDir = path.dirname(asarPath);
  const backupPath = `${asarPath}.${THEME_STYLE_ID}.bak`;
  return {
    asarPath,
    resourcesDir,
    backupPath,
    exists: true
  };
}

function readAsarHeader(archivePath) {
  const fd = fs.openSync(archivePath, "r");
  try {
    const sizeBuf = Buffer.alloc(16);
    fs.readSync(fd, sizeBuf, 0, 16, 0);
    const headerPayloadSize = sizeBuf.readUInt32LE(8) - 4;
    const jsonLen = sizeBuf.readUInt32LE(12);
    const jsonBuf = Buffer.alloc(jsonLen);
    fs.readSync(fd, jsonBuf, 0, jsonLen, 16);
    const header = JSON.parse(jsonBuf.toString("utf8"));
    const payloadOffset = 16 + headerPayloadSize;
    return { header, payloadOffset, jsonLen, headerPayloadSize };
  } finally {
    fs.closeSync(fd);
  }
}

function extractFileFromAsar(archivePath, relativePath) {
  const { header, payloadOffset } = readAsarHeader(archivePath);
  const parts = relativePath.split("/");
  let cur = header;
  for (const p of parts) {
    if (!cur.files || !cur.files[p]) return null;
    cur = cur.files[p];
  }
  if (!cur || cur.size === undefined || cur.offset === undefined) return null;

  const fd = fs.openSync(archivePath, "r");
  try {
    const offset = payloadOffset + parseInt(cur.offset, 10);
    const buf = Buffer.alloc(cur.size);
    fs.readSync(fd, buf, 0, cur.size, offset);
    return buf.toString("utf8");
  } finally {
    fs.closeSync(fd);
  }
}

function findElectronMainScript(asarPath) {
  try {
    const { header } = readAsarHeader(asarPath);
    if (!header.files || !header.files[".vite"] || !header.files[".vite"].files || !header.files[".vite"].files["build"]) {
      return null;
    }
    const buildFiles = header.files[".vite"].files["build"].files || {};
    for (const filename of Object.keys(buildFiles)) {
      if (filename.startsWith("main-") && filename.endsWith(".js")) {
        return ".vite/build/" + filename;
      }
    }
    if (buildFiles["main.js"]) {
      return ".vite/build/main.js";
    }
    return null;
  } catch {
    return null;
  }
}

function inspectDesktopThemeStatus(target) {
  if (!target || !target.exists || !fs.existsSync(target.asarPath)) {
    return {
      found: false,
      patched: false,
      writable: false,
      reasons: ["Codex Desktop app.asar was not found."]
    };
  }

  let writable = false;
  try {
    fs.accessSync(target.asarPath, fs.constants.W_OK);
    fs.accessSync(target.resourcesDir, fs.constants.W_OK);
    writable = true;
  } catch {
    writable = false;
  }

  try {
    const indexHtml = extractFileFromAsar(target.asarPath, "webview/index.html");
    if (!indexHtml) {
      return {
        found: true,
        patched: false,
        writable,
        reasons: ["webview/index.html was not found in app.asar."]
      };
    }

    const themePatched = indexHtml.includes(`id="${THEME_STYLE_ID}"`);
    const widgetPatched = indexHtml.includes(`id="${WIDGET_SCRIPT_ID}"`);
    
    const mainScriptPath = findElectronMainScript(target.asarPath);
    let nativeMenuPatched = false;
    if (mainScriptPath) {
      const mainJs = extractFileFromAsar(target.asarPath, mainScriptPath);
      if (mainJs && mainJs.includes(NATIVE_MENU_MARKER)) {
        nativeMenuPatched = true;
      }
    }

    const cspCorrupted =
      indexHtml.includes("script-src &#39 &#39;unsafe-inline&#39;;") ||
      indexHtml.includes(";;self&#39;");
    const patched = themePatched && widgetPatched && !cspCorrupted && !nativeMenuPatched;

    return {
      found: true,
      patched,
      themePatched,
      widgetPatched,
      nativeMenuPatched,
      cspCorrupted,
      writable,
      hasBackup: fs.existsSync(target.backupPath),
      reasons: []
    };
  } catch (error) {
    return {
      found: true,
      patched: false,
      writable,
      reasons: [error instanceof Error ? error.message : String(error)]
    };
  }
}

function patchAsarSingleFile(srcAsar, destAsar, targetRelativePath, newContentBuffer) {
  const srcFd = fs.openSync(srcAsar, "r");
  try {
    const sizeBuf = Buffer.alloc(16);
    fs.readSync(srcFd, sizeBuf, 0, 16, 0);
    const headerPayloadSize = sizeBuf.readUInt32LE(8) - 4;
    const jsonLen = sizeBuf.readUInt32LE(12);
    const jsonBuf = Buffer.alloc(jsonLen);
    fs.readSync(srcFd, jsonBuf, 0, jsonLen, 16);
    const header = JSON.parse(jsonBuf.toString("utf8"));
    const srcPayloadOffset = 16 + headerPayloadSize;

    // Locate target file in JSON header
    const parts = targetRelativePath.split("/");
    let cur = header;
    for (const p of parts) {
      if (!cur.files || !cur.files[p]) {
        throw new Error(`File ${targetRelativePath} not found in ASAR header`);
      }
      cur = cur.files[p];
    }

    const oldTargetOffset = parseInt(cur.offset, 10);
    const oldTargetSize = cur.size;
    const newTargetSize = newContentBuffer.length;
    const sizeDiff = newTargetSize - oldTargetSize;

    // Shift offsets of all files that come AFTER targetRelativePath in the payload
    function adjustOffsets(node) {
      if (!node.files) return;
      for (const [name, child] of Object.entries(node.files)) {
        if (child.files) {
          adjustOffsets(child);
        } else if (child.offset !== undefined) {
          const off = parseInt(child.offset, 10);
          if (off > oldTargetOffset) {
            child.offset = (off + sizeDiff).toString();
          }
        }
      }
    }

    adjustOffsets(header);
    cur.size = newTargetSize;

    const newJsonStr = JSON.stringify(header);
    const newJsonBuf = Buffer.from(newJsonStr, "utf8");
    const newJsonLen = newJsonBuf.length;
    const padding = (4 - (newJsonLen % 4)) % 4;
    const newTotalHeaderPayload = newJsonLen + padding;

    const newHeaderBuf = Buffer.alloc(16 + newTotalHeaderPayload);
    newHeaderBuf.writeUInt32LE(4, 0);
    newHeaderBuf.writeUInt32LE(newTotalHeaderPayload + 8, 4);
    newHeaderBuf.writeUInt32LE(newTotalHeaderPayload + 4, 8);
    newHeaderBuf.writeUInt32LE(newJsonLen, 12);
    newJsonBuf.copy(newHeaderBuf, 16);

    const destFd = fs.openSync(destAsar, "w");
    try {
      fs.writeSync(destFd, newHeaderBuf);

      const CHUNK_SIZE = 1024 * 1024; // 1MB chunks
      const chunkBuf = Buffer.alloc(CHUNK_SIZE);

      // 1. Copy payload before target file
      let bytesLeft = oldTargetOffset;
      let readPos = srcPayloadOffset;
      while (bytesLeft > 0) {
        const toRead = Math.min(bytesLeft, CHUNK_SIZE);
        const bytesRead = fs.readSync(srcFd, chunkBuf, 0, toRead, readPos);
        if (bytesRead === 0) break;
        fs.writeSync(destFd, chunkBuf, 0, bytesRead);
        readPos += bytesRead;
        bytesLeft -= bytesRead;
      }

      // 2. Write new target file
      fs.writeSync(destFd, newContentBuffer);

      // 3. Copy payload after target file
      const oldTargetEnd = srcPayloadOffset + oldTargetOffset + oldTargetSize;
      const srcStats = fs.fstatSync(srcFd);
      bytesLeft = srcStats.size - oldTargetEnd;
      readPos = oldTargetEnd;
      while (bytesLeft > 0) {
        const toRead = Math.min(bytesLeft, CHUNK_SIZE);
        const bytesRead = fs.readSync(srcFd, chunkBuf, 0, toRead, readPos);
        if (bytesRead === 0) break;
        fs.writeSync(destFd, chunkBuf, 0, bytesRead);
        readPos += bytesRead;
        bytesLeft -= bytesRead;
      }
    } finally {
      fs.closeSync(destFd);
    }
  } finally {
    fs.closeSync(srcFd);
  }
}

function patchHtmlContentSecurityPolicy(html, widgetJsContent = "") {
  return html.replace(
    /(<meta\s+[^>]*http-equiv=["']Content-Security-Policy["'][^>]*content=["'])([^"']+)(["'][^>]*>)/i,
    (full, prefix, cspContent, suffix) => {
      // Directives are separated by semicolons NOT part of HTML entities like &#39; or &apos; or &#x27;
      const rawDirectives = cspContent.split(/(?<!&\w{1,8}|&#\d{1,5}|&#x[0-9a-f]{1,5});\s*/i).filter(Boolean);

      let scriptSrcFound = false;
      let connectSrcFound = false;

      const updatedDirectives = rawDirectives.map((directive) => {
        let trimmed = directive.trim();
        const firstSpace = trimmed.indexOf(" ");
        const name = (firstSpace === -1 ? trimmed : trimmed.slice(0, firstSpace)).toLowerCase();
        let values = firstSpace === -1 ? "" : trimmed.slice(firstSpace + 1).trim();

        if (name === "script-src") {
          scriptSrcFound = true;
          const q = values.includes("&#39;") ? "&#39;" : "'";
          if (!values.includes("unsafe-inline")) {
            values += ` ${q}unsafe-inline${q}`;
          }
          if (widgetJsContent) {
            const trimmedWidget = widgetJsContent.trim();
            const hash = crypto.createHash("sha256").update(trimmedWidget, "utf8").digest("base64");
            if (!values.includes(hash)) {
              values += ` ${q}sha256-${hash}${q}`;
            }
          }
          return `script-src ${values}`;
        }

        if (name === "connect-src") {
          connectSrcFound = true;
          const needed = [
            "http://127.0.0.1:*",
            "http://localhost:*",
            "http://127.0.0.1:4321",
            "http://localhost:4321",
            "ws://127.0.0.1:*",
            "ws://localhost:*"
          ];
          for (const item of needed) {
            if (!values.includes(item)) {
              values += ` ${item}`;
            }
          }
          return `connect-src ${values}`;
        }

        return trimmed;
      });

      if (!scriptSrcFound) {
        const q = cspContent.includes("&#39;") ? "&#39;" : "'";
        let val = `${q}self${q} ${q}unsafe-inline${q}`;
        if (widgetJsContent) {
          const hash = crypto.createHash("sha256").update(widgetJsContent.trim(), "utf8").digest("base64");
          val += ` ${q}sha256-${hash}${q}`;
        }
        updatedDirectives.push(`script-src ${val}`);
      }

      if (!connectSrcFound) {
        const q = cspContent.includes("&#39;") ? "&#39;" : "'";
        updatedDirectives.push(`connect-src ${q}self${q} http://127.0.0.1:* http://localhost:* ws://127.0.0.1:* ws://localhost:*`);
      }

      return `${prefix}${updatedDirectives.join("; ")};${suffix}`;
    }
  );
}

function restoreHtmlContentSecurityPolicy(html) {
  return html.replace(
    /(<meta\s+[^>]*http-equiv=["']Content-Security-Policy["'][^>]*content=["'])([^"']+)(["'][^>]*>)/i,
    (full, prefix, cspContent, suffix) => {
      const rawDirectives = cspContent.split(/(?<!&\w{1,8}|&#\d{1,5}|&#x[0-9a-f]{1,5});\s*/i).filter(Boolean);
      const updatedDirectives = rawDirectives.map((directive) => {
        let trimmed = directive.trim();
        const firstSpace = trimmed.indexOf(" ");
        const name = (firstSpace === -1 ? trimmed : trimmed.slice(0, firstSpace)).toLowerCase();
        let values = firstSpace === -1 ? "" : trimmed.slice(firstSpace + 1).trim();

        if (name === "script-src") {
          values = values.replace(/\s*(?:&#39;|['"])unsafe-inline(?:&#39;|['"])/g, "");
          values = values.replace(/\s*(?:&#39;|['"])sha256-[A-Za-z0-9+/=]+(?:&#39;|['"])/g, (match) => {
            if (match.includes("Z2/iFzh9VMlVkEOar1f/oSHWwQk3ve1qk/C2WdsC4Xk=")) return match;
            return "";
          });
          return `script-src ${values.trim()}`;
        }

        if (name === "connect-src") {
          values = values.replace(/\s*(?:http|ws):\/\/(?:127\.0\.0\.1|localhost):[0-9*]+/g, "");
          return `connect-src ${values.trim()}`;
        }

        return trimmed;
      });
      return `${prefix}${updatedDirectives.join("; ")};${suffix}`;
    }
  );
}

function patchElectronMainScript(originalJs) {
  if (originalJs.includes(NATIVE_MENU_MARKER)) {
    return originalJs;
  }

  const NATIVE_MENU_CODE = `
// [Codex Nexus] Native Toolbar Menu Integration
var ${NATIVE_MENU_MARKER} = true;

function __readCodexConfig() {
  const fs = require("fs");
  const path = require("path");
  const os = require("os");
  const home = os.homedir();
  const configPath = path.join(home, ".codex", "config.toml");
  if (!fs.existsSync(configPath)) {
    return { modelProvider: "openai", model: "default", providers: [] };
  }
  const toml = fs.readFileSync(configPath, "utf8");
  const modelMatch = toml.match(/^\\s*model\\s*=\\s*["']([^"']+)["']/m);
  const model = modelMatch ? modelMatch[1] : "default";

  const provMatch = toml.match(/^\\s*model_provider\\s*=\\s*["']([^"']+)["']/m);
  const modelProvider = provMatch ? provMatch[1] : "openai";

  const providers = [];
  const providerRegex = /\\[model_providers\\.([a-zA-Z0-9_-]+)\\]([\\s\\S]*?)(?=\\n\\[|$)/g;
  let match;
  while ((match = providerRegex.exec(toml)) !== null) {
    const id = match[1];
    const block = match[2];
    const nameMatch = block.match(/^\\s*name\\s*=\\s*["']([^"']+)["']/m);
    const baseUrlMatch = block.match(/^\\s*base_url\\s*=\\s*["']([^"']+)["']/m);
    providers.push({
      id,
      name: nameMatch ? nameMatch[1] : id,
      baseUrl: baseUrlMatch ? baseUrlMatch[1] : ""
    });
  }
  if (!providers.some(p => p.id === "openai")) {
    providers.unshift({ id: "openai", name: "OpenAI (Default)", baseUrl: "https://api.openai.com/v1" });
  }
  return { modelProvider, model, providers };
}

function __writeCodexConfig(newProvider, newModel) {
  const fs = require("fs");
  const path = require("path");
  const os = require("os");
  const home = os.homedir();
  const configPath = path.join(home, ".codex", "config.toml");
  if (!fs.existsSync(configPath)) return;
  let toml = fs.readFileSync(configPath, "utf8");

  if (newProvider) {
    if (toml.includes("model_provider =")) {
      toml = toml.replace(/^\\s*model_provider\\s*=\\s*["'][^"']*["']/m, 'model_provider = "' + newProvider + '"');
    } else {
      toml = 'model_provider = "' + newProvider + '"\\n' + toml;
    }
  }
  if (newModel) {
    if (toml.includes("model =")) {
      toml = toml.replace(/^\\s*model\\s*=\\s*["'][^"']*["']/m, 'model = "' + newModel + '"');
    } else {
      toml = 'model = "' + newModel + '"\\n' + toml;
    }
  }
  fs.writeFileSync(configPath, toml, "utf8");
}

function __getNexusNativeMenu(p) {
  const cfg = __readCodexConfig();
  const currentProviderId = cfg.modelProvider || "openai";
  const currentModel = cfg.model || "default";

  const defaultModelsMap = {
    omniroute: [
      "antigravity/gemini-3.8-flash-high",
      "antigravity/gemini-3.8-pro-high",
      "antigravity/claude-3-7-sonnet",
      "antigravity/claude-3-5-sonnet",
      "antigravity/deepseek-r1",
      "antigravity/gpt-4o"
    ],
    openai: [
      "gpt-4o",
      "gpt-4o-mini",
      "o3-mini",
      "o1",
      "gpt-4.5-preview"
    ]
  };

  const providerItems = cfg.providers.map(prov => ({
    label: prov.name || prov.id,
    type: "radio",
    checked: prov.id === currentProviderId,
    click: (item, focusedWindow) => {
      __writeCodexConfig(prov.id, null);
      if (typeof globalThis.__refreshCodexAppMenu === "function") {
        globalThis.__refreshCodexAppMenu();
      }
      if (focusedWindow) focusedWindow.reload();
    }
  }));

  const modelCandidates = [...(defaultModelsMap[currentProviderId] || [])];
  if (currentModel && !modelCandidates.includes(currentModel) && currentModel !== "default") {
    modelCandidates.unshift(currentModel);
  }

  const modelItems = modelCandidates.map(m => ({
    label: m,
    type: "radio",
    checked: m === currentModel,
    click: (item, focusedWindow) => {
      __writeCodexConfig(null, m);
      if (typeof globalThis.__refreshCodexAppMenu === "function") {
        globalThis.__refreshCodexAppMenu();
      }
      if (focusedWindow) focusedWindow.reload();
    }
  }));

  return {
    label: "⚡ Nexus",
    id: "codex-nexus-native-menu",
    submenu: [
      {
        label: "Active: " + currentProviderId + " / " + currentModel.split("/").pop(),
        enabled: false
      },
      { type: "separator" },
      {
        label: "Select Provider",
        submenu: providerItems.length > 0 ? providerItems : [{ label: "No providers configured", enabled: false }]
      },
      {
        label: "Select Model",
        submenu: modelItems.length > 0 ? modelItems : [{ label: "No presets available", enabled: false }]
      },
      { type: "separator" },
      {
        label: "🌐 Open Web Dashboard...",
        accelerator: "CmdOrCtrl+Alt+D",
        click: () => {
          if (p && p.shell) p.shell.openExternal("http://127.0.0.1:4321");
        }
      },
      {
        label: "🔄 Reload Window",
        accelerator: "CmdOrCtrl+R",
        click: (item, win) => {
          if (win) win.reload();
        }
      },
      { type: "separator" },
      {
        label: "🎨 Monokai Markdown Theme (Active)",
        enabled: false
      }
    ]
  };
}
`;

  let patched = NATIVE_MENU_CODE + "\n" + originalJs;

  // Wire up global menu refresh
  patched = patched.replace(
    /j\s*=\s*\(\)\s*=>\s*\{\s*A\.refresh\(\)\s*\}/,
    "j=()=>{A.refresh()};globalThis.__refreshCodexAppMenu=j;"
  );

  // Add Nexus menu item after Help in template array It
  const helpMarker = ",Ee]]}],Lt=p.Menu.buildFromTemplate(It)";
  const replacement = ",Ee]]},__getNexusNativeMenu(p)],Lt=p.Menu.buildFromTemplate(It)";
  patched = patched.replace(helpMarker, replacement);

  // Keep menu bar visible in toolbar on Linux/Windows
  patched = patched.replace(
    /process\.platform\s*===\s*[`"x27]win32[`"x27]\s*\|\|\s*process\.platform\s*===\s*[`"x27]linux[`"x27]\s*\?\s*\{\s*autoHideMenuBar:\s*!0\s*\}\s*:\s*\{\}/,
    "process.platform===`win32`||process.platform===`linux`?{autoHideMenuBar:!1}:{}"
  );

  // Prevent Electron from removing the window menu on Linux/Windows, and explicitly attach and show it
  patched = patched.replace(
    "(process.platform===`win32`||process.platform===`linux`)&&R.removeMenu()",
    "(process.platform===`win32`||process.platform===`linux`)&&(R.setMenu(p.Menu.getApplicationMenu()),R.setMenuBarVisibility(!0),R.setAutoHideMenuBar(!1))"
  );

  // On Linux, titleBarStyle: 'hidden' suppresses the native menu bar and window frame.
  // Switch Linux to standard decorated window frame so the native menu bar is rendered.
  patched = patched.replace(
    "n===`win32`||n===`linux`?{titleBarStyle:`hidden`,titleBarOverlay:A9(r)",
    "n===`win32`?{titleBarStyle:`hidden`,titleBarOverlay:A9(r)"
  );

  return patched;
}

function applyDesktopTheme(
  target,
  customCssPath = DEFAULT_THEME_CSS_PATH,
  widgetJsPath = DEFAULT_WIDGET_JS_PATH,
  options = {}
) {
  const force = Boolean(options && options.force);
  const includeFloatingWidget = options.floatingWidget !== false;

  const status = inspectDesktopThemeStatus(target);
  if (!status.found) {
    throw new Error(status.reasons.join("\n") || "Codex Desktop installation not found.");
  }
  if (!status.writable) {
    const error = new Error("Permission denied: Cannot write to Codex Desktop installation directory.");
    error.code = "EACCES";
    error.targetPath = target.asarPath;
    throw error;
  }
  if (status.patched && !force && !status.cspCorrupted) {
    return { changed: false, alreadyPatched: true };
  }

  // 1. Check version in target.asarPath vs backupPath
  let asarPkg = null;
  try {
    const pkgStr = extractFileFromAsar(target.asarPath, "package.json");
    if (pkgStr) asarPkg = JSON.parse(pkgStr);
  } catch {}

  let backupPkg = null;
  if (fs.existsSync(target.backupPath)) {
    try {
      const bPkgStr = extractFileFromAsar(target.backupPath, "package.json");
      if (bPkgStr) backupPkg = JSON.parse(bPkgStr);
    } catch {}
  }

  const backupMatchesVersion = Boolean(
    asarPkg && backupPkg && asarPkg.version === backupPkg.version
  );

  let indexHtml = null;
  // If clean official deb archive is available and matches target version
  const cleanDebAsar = "/tmp/clean-deb/usr/lib/chatgpt/resources/app.asar";
  if (fs.existsSync(cleanDebAsar)) {
    try {
      const debPkg = JSON.parse(extractFileFromAsar(cleanDebAsar, "package.json"));
      if (asarPkg && debPkg && asarPkg.version === debPkg.version) {
        indexHtml = extractFileFromAsar(cleanDebAsar, "webview/index.html");
      }
    } catch {}
  }

  // Next, try backup if it matches the current app version
  if (!indexHtml && fs.existsSync(target.backupPath) && backupMatchesVersion) {
    indexHtml = extractFileFromAsar(target.backupPath, "webview/index.html");
  }

  // Next, read directly from current asarPath
  if (!indexHtml) {
    indexHtml = extractFileFromAsar(target.asarPath, "webview/index.html");
  }

  if (!indexHtml) {
    throw new Error("webview/index.html not found inside app.asar");
  }

  // Clean any previous injected theme style and widget script tags
  indexHtml = indexHtml.replace(
    new RegExp(`\\s*<style id="${THEME_STYLE_ID}">[\\s\\S]*?<\\/style>\\s*`, "i"),
    "\n"
  );
  indexHtml = indexHtml.replace(
    new RegExp(`\\s*<script id="${WIDGET_SCRIPT_ID}">[\\s\\S]*?<\\/script>\\s*`, "i"),
    "\n"
  );
  indexHtml = restoreHtmlContentSecurityPolicy(indexHtml);

  // Validate that the entry script referenced in index.html actually exists in target asar!
  const scriptMatch = indexHtml.match(/src=["']\.\/assets\/(index-[^"']+\.js)["']/);
  if (scriptMatch) {
    const entryFile = "webview/assets/" + scriptMatch[1];
    const entryContent = extractFileFromAsar(target.asarPath, entryFile);
    if (!entryContent) {
      try {
        const { header } = readAsarHeader(target.asarPath);
        const assets = Object.keys(header.files?.["webview"]?.files?.["assets"]?.files || {});
        const candidates = assets
          .filter(f => f.startsWith("index-") && f.endsWith(".js") && !f.includes(".map"))
          .map(f => ({ name: f, size: parseInt(header.files["webview"].files["assets"].files[f].size, 10) }))
          .sort((a, b) => a.size - b.size);
        if (candidates.length > 0) {
          indexHtml = indexHtml.replace(scriptMatch[1], candidates[0].name);
        }
      } catch {}
    }
  }

  const themeCss = fs.readFileSync(customCssPath, "utf8");
  const widgetJs = (includeFloatingWidget && fs.existsSync(widgetJsPath)) ? fs.readFileSync(widgetJsPath, "utf8") : "";

  const themeTag = `\n    <style id="${THEME_STYLE_ID}">\n${themeCss}\n    </style>\n`;
  const widgetContent = widgetJs ? widgetJs.trim() : "";
  const widgetTag = widgetContent
    ? `\n    <script id="${WIDGET_SCRIPT_ID}">${widgetContent}</script>\n`
    : "";

  let patchedHtml = indexHtml;

  // Clean out any existing partial style or widget tags
  if (patchedHtml.includes(THEME_STYLE_ID)) {
    patchedHtml = patchedHtml.replace(
      new RegExp(`\\s*<style id="${THEME_STYLE_ID}">[\\s\\S]*?<\\/style>\\s*`, "i"),
      "\n"
    );
  }
  if (patchedHtml.includes(WIDGET_SCRIPT_ID)) {
    patchedHtml = patchedHtml.replace(
      new RegExp(`\\s*<script id="${WIDGET_SCRIPT_ID}">[\\s\\S]*?<\\/script>\\s*`, "i"),
      "\n"
    );
  }

  // Safely update CSP
  patchedHtml = patchHtmlContentSecurityPolicy(patchedHtml, widgetContent);

  // Inject CSS in head
  if (patchedHtml.includes("</head>")) {
    patchedHtml = patchedHtml.replace("</head>", `${themeTag}</head>`);
  } else {
    patchedHtml = `${themeTag}${patchedHtml}`;
  }

  // Inject bottom-right draggable widget
  if (widgetTag) {
    if (patchedHtml.includes("</body>")) {
      patchedHtml = patchedHtml.replace("</body>", `${widgetTag}</body>`);
    } else {
      patchedHtml = `${patchedHtml}${widgetTag}`;
    }
  }

  // 2. Ensure main script is clean (revert to original unpatched backup if needed)
  const mainScriptPath = findElectronMainScript(target.asarPath);
  let cleanMainJs = null;
  if (mainScriptPath && fs.existsSync(target.backupPath)) {
    const backupMain = extractFileFromAsar(target.backupPath, mainScriptPath);
    const currentMain = extractFileFromAsar(target.asarPath, mainScriptPath);
    if (backupMain && currentMain && currentMain.includes(NATIVE_MENU_MARKER)) {
      cleanMainJs = backupMain;
    }
  }

  // Backup original if not yet backed up
  if (!fs.existsSync(target.backupPath)) {
    fs.copyFileSync(target.asarPath, target.backupPath);
  }

  const tmpAsar1 = `${target.asarPath}.tmp1-${Date.now()}`;
  const tmpAsar2 = `${target.asarPath}.tmp2-${Date.now()}`;
  try {
    patchAsarSingleFile(target.asarPath, tmpAsar1, "webview/index.html", Buffer.from(patchedHtml, "utf8"));
    if (mainScriptPath && cleanMainJs) {
      patchAsarSingleFile(tmpAsar1, tmpAsar2, mainScriptPath, Buffer.from(cleanMainJs, "utf8"));
      fs.renameSync(tmpAsar2, target.asarPath);
      try { fs.unlinkSync(tmpAsar1); } catch {}
    } else {
      fs.renameSync(tmpAsar1, target.asarPath);
    }
    return {
      changed: true,
      backupCreated: !status.hasBackup,
      restoredMainScript: Boolean(mainScriptPath && cleanMainJs)
    };
  } catch (error) {
    try { if (fs.existsSync(tmpAsar1)) fs.unlinkSync(tmpAsar1); } catch {}
    try { if (fs.existsSync(tmpAsar2)) fs.unlinkSync(tmpAsar2); } catch {}
    throw error;
  }
}

function restoreDesktopTheme(target) {
  const status = inspectDesktopThemeStatus(target);
  if (!status.found) {
    throw new Error(status.reasons.join("\n") || "Codex Desktop installation not found.");
  }
  if (!status.writable) {
    const error = new Error("Permission denied: Cannot restore Codex Desktop installation directory.");
    error.code = "EACCES";
    error.targetPath = target.asarPath;
    throw error;
  }

  if (fs.existsSync(target.backupPath)) {
    fs.copyFileSync(target.backupPath, target.asarPath);
    fs.unlinkSync(target.backupPath);
    return { changed: true, restoredFromBackup: true };
  }

  let indexHtml = extractFileFromAsar(target.asarPath, "webview/index.html");
  if (!indexHtml) {
    return { changed: false, notPatched: true };
  }

  const hadTheme = indexHtml.includes(THEME_STYLE_ID);
  const hadWidget = indexHtml.includes(WIDGET_SCRIPT_ID);

  if (hadTheme || hadWidget || status.cspCorrupted) {
    indexHtml = indexHtml.replace(
      new RegExp(`\\s*<style id="${THEME_STYLE_ID}">[\\s\\S]*?<\\/style>\\s*`, "i"),
      "\n"
    );
    indexHtml = indexHtml.replace(
      new RegExp(`\\s*<script id="${WIDGET_SCRIPT_ID}">[\\s\\S]*?<\\/script>\\s*`, "i"),
      "\n"
    );
    indexHtml = restoreHtmlContentSecurityPolicy(indexHtml);

    const tmpAsar = `${target.asarPath}.tmp-${Date.now()}`;
    try {
      patchAsarSingleFile(target.asarPath, tmpAsar, "webview/index.html", Buffer.from(indexHtml, "utf8"));
      fs.renameSync(tmpAsar, target.asarPath);
      return { changed: true, restoredFromBackup: false };
    } catch (error) {
      if (fs.existsSync(tmpAsar)) {
        try { fs.unlinkSync(tmpAsar); } catch {}
      }
      throw error;
    }
  }

  return { changed: false, notPatched: true };
}

module.exports = {
  THEME_STYLE_ID,
  WIDGET_SCRIPT_ID,
  NATIVE_MENU_MARKER,
  DEFAULT_THEME_CSS_PATH,
  DEFAULT_WIDGET_JS_PATH,
  applyDesktopTheme,
  extractFileFromAsar,
  findCodexDesktopInstallation,
  findElectronMainScript,
  inspectDesktopThemeStatus,
  patchAsarSingleFile,
  patchElectronMainScript,
  patchHtmlContentSecurityPolicy,
  readAsarHeader,
  resolveInstallationTarget,
  restoreDesktopTheme,
  restoreHtmlContentSecurityPolicy
};

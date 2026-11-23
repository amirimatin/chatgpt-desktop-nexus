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

const CSP_META_RE = /<meta\s+[^>]*http-equiv=(["'])Content-Security-Policy\1[^>]*>/i;

function locateCspMeta(html) {
  const metaMatch = html.match(CSP_META_RE);
  if (!metaMatch) return null;
  const metaTag = metaMatch[0];
  const contentMatch = metaTag.match(/\scontent=(["'])([\s\S]*?)\1/i);
  if (!contentMatch) return null;
  return {
    metaTag,
    metaIndex: metaMatch.index,
    quote: contentMatch[1],
    content: contentMatch[2],
    contentPrefix: metaTag.slice(0, contentMatch.index + contentMatch[0].indexOf(contentMatch[2])),
    contentSuffix: metaTag.slice(contentMatch.index + contentMatch[0].length - 1)
  };
}

function replaceCspContent(html, located, newContent) {
  const rebuilt = `${located.contentPrefix}${newContent}${located.contentSuffix}`;
  return html.slice(0, located.metaIndex) + rebuilt + html.slice(located.metaIndex + located.metaTag.length);
}

function splitCspDirectives(cspContent) {
  return cspContent
    .split(/(?<!&\w{1,8}|&#\d{1,5}|&#x[0-9a-f]{1,5});/i)
    .map((directive) => directive.trim())
    .filter(Boolean);
}

function directiveName(directive) {
  const firstSpace = directive.indexOf(" ");
  return (firstSpace === -1 ? directive : directive.slice(0, firstSpace)).toLowerCase();
}

function directiveValues(directive) {
  const firstSpace = directive.indexOf(" ");
  return firstSpace === -1 ? "" : directive.slice(firstSpace + 1).trim();
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
    // Newer builds declare the entry point in package.json (for example
    // ".vite/build/early-bootstrap.js") instead of shipping a main-*.js file.
    try {
      const pkgRaw = extractFileFromAsar(asarPath, "package.json");
      const main = pkgRaw ? JSON.parse(pkgRaw).main : null;
      if (typeof main === "string") {
        const normalized = main.replace(/^\.\//, "");
        const parts = normalized.split("/");
        let node = header;
        for (const part of parts) {
          if (!node.files || !node.files[part]) return null;
          node = node.files[part];
        }
        if (node.size !== undefined) return normalized;
      }
    } catch {}
    return null;
  } catch {
    return null;
  }
}

function listElectronBuildScripts(asarPath) {
  try {
    const { header } = readAsarHeader(asarPath);
    const buildFiles = header.files?.[".vite"]?.files?.["build"]?.files || {};
    return Object.keys(buildFiles)
      .filter((name) => name.endsWith(".js"))
      .map((name) => ".vite/build/" + name);
  } catch {
    return [];
  }
}

function findLegacyNativeMenuScripts(asarPath) {
  // Earlier releases injected a native menu into the Electron main script.
  // Newer Desktop builds split that bundle into several chunks, so every
  // build script is checked for the legacy marker.
  const hits = [];
  for (const relativePath of listElectronBuildScripts(asarPath)) {
    const content = extractFileFromAsar(asarPath, relativePath);
    if (content && content.includes(NATIVE_MENU_MARKER)) {
      hits.push(relativePath);
    }
  }
  return hits;
}

function detectCspCorruption(html) {
  const located = locateCspMeta(html);
  if (!located) return false;

  const directives = splitCspDirectives(located.content);
  const seen = new Set();
  for (const directive of directives) {
    const name = directiveName(directive);
    if (!name) continue;
    // A directive value that leaked out of its own directive, e.g. "'none'".
    if (name.startsWith("&#39;") || name.startsWith("'")) return true;
    // A known directive that lost its value, e.g. a bare "default-src".
    if (name.endsWith("-src") && directiveValues(directive) === "") return true;
    // The browser only honours the first occurrence of a directive, so a
    // duplicate means injected sources are silently ignored.
    if (seen.has(name)) return true;
    seen.add(name);
  }
  return false;
}

function computeAsarFileIntegrity(buffer) {
  const BLOCK_SIZE = 4 * 1024 * 1024;
  const blocks = [];
  for (let offset = 0; offset < buffer.length; offset += BLOCK_SIZE) {
    blocks.push(
      crypto.createHash("sha256").update(buffer.subarray(offset, offset + BLOCK_SIZE)).digest("hex")
    );
  }
  if (blocks.length === 0) {
    blocks.push(crypto.createHash("sha256").update(Buffer.alloc(0)).digest("hex"));
  }
  return {
    algorithm: "SHA256",
    hash: crypto.createHash("sha256").update(buffer).digest("hex"),
    blockSize: BLOCK_SIZE,
    blocks
  };
}

function isAsarIntegrityStale(asarPath, relativePath) {
  try {
    const { header } = readAsarHeader(asarPath);
    let node = header;
    for (const part of relativePath.split("/")) {
      if (!node.files || !node.files[part]) return false;
      node = node.files[part];
    }
    if (!node.integrity || !node.integrity.hash) return false;
    const content = extractFileFromAsar(asarPath, relativePath);
    if (content === null) return false;
    const actual = crypto.createHash("sha256").update(Buffer.from(content, "utf8")).digest("hex");
    return actual !== node.integrity.hash;
  } catch {
    return false;
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
    
    const nativeMenuPatched = findLegacyNativeMenuScripts(target.asarPath).length > 0;

    const cspCorrupted = detectCspCorruption(indexHtml);
    const integrityStale = isAsarIntegrityStale(target.asarPath, "webview/index.html");
    const patched =
      themePatched && widgetPatched && !cspCorrupted && !integrityStale;

    return {
      found: true,
      patched,
      themePatched,
      widgetPatched,
      nativeMenuPatched,
      cspCorrupted,
      integrityStale,
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
    // Electron validates app.asar with the embedded SHA256 integrity entries
    // (enableEmbeddedAsarIntegrityValidation fuse). A stale hash makes the app
    // refuse the patched file, so recompute it for the replaced content.
    if (cur.integrity) {
      cur.integrity = computeAsarFileIntegrity(newContentBuffer);
    }

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

function mergeCspDirectives(cspContent, quote) {
  const merged = [];
  const indexByName = new Map();
  const orphans = [];

  for (const directive of splitCspDirectives(cspContent)) {
    const name = directiveName(directive);
    if (!name) continue;
    if (name.startsWith("&#39;") || name.startsWith("'") || !/^[a-z][a-z0-9-]*$/.test(name)) {
      // A value fragment that an earlier broken patch separated from its
      // directive, e.g. a stray "'none'" left behind by a truncated capture.
      orphans.push(directive);
      continue;
    }
    if (indexByName.has(name)) {
      const target = merged[indexByName.get(name)];
      for (const token of directiveValues(directive).split(/\s+/).filter(Boolean)) {
        if (!target.values.includes(token)) {
          target.values = target.values ? `${target.values} ${token}` : token;
        }
      }
      continue;
    }
    indexByName.set(name, merged.length);
    merged.push({ name, values: directiveValues(directive) });
  }

  // Reattach orphaned values to the directive that lost them. The previous
  // patcher truncated a directive's value and appended the remainder after its
  // own injected directives, so the only value-less directive owns the orphan.
  for (const orphan of orphans) {
    const victim = merged.find((entry) => entry.values === "");
    if (victim) {
      victim.values = orphan.trim();
    }
  }

  return { merged, indexByName };
}

function patchHtmlContentSecurityPolicy(html, widgetJsContent = "") {
  const located = locateCspMeta(html);
  if (!located) return html;

  const entityQuoted = located.content.includes("&#39;");
  const q = entityQuoted ? "&#39;" : "'";
  const localConnectSources = [
    "http://127.0.0.1:*",
    "http://localhost:*",
    "ws://127.0.0.1:*",
    "ws://localhost:*"
  ];

  let widgetHash = "";
  if (widgetJsContent) {
    widgetHash = crypto.createHash("sha256").update(widgetJsContent.trim(), "utf8").digest("base64");
  }

  // Only the first occurrence of a directive is enforced by the browser, so
  // duplicates must be merged before any source is injected.
  const { merged, indexByName } = mergeCspDirectives(located.content, q);

  const ensureDirective = (name, fallbackValues) => {
    if (indexByName.has(name)) return merged[indexByName.get(name)];
    const entry = { name, values: fallbackValues };
    indexByName.set(name, merged.length);
    merged.push(entry);
    return entry;
  };

  const addToken = (entry, token) => {
    if (!entry.values.includes(token)) {
      entry.values = entry.values ? `${entry.values} ${token}` : token;
    }
  };

  const scriptSrc = ensureDirective("script-src", `${q}self${q}`);
  if (widgetHash) {
    addToken(scriptSrc, `${q}sha256-${widgetHash}${q}`);
  } else if (!scriptSrc.values.includes("unsafe-inline")) {
    addToken(scriptSrc, `${q}unsafe-inline${q}`);
  }

  const connectSrc = ensureDirective("connect-src", `${q}self${q}`);
  for (const source of localConnectSources) {
    addToken(connectSrc, source);
  }

  const rebuilt = merged
    .map((entry) => (entry.values ? `${entry.name} ${entry.values}` : entry.name))
    .join("; ") + ";";

  return replaceCspContent(html, located, rebuilt);
}

function restoreHtmlContentSecurityPolicy(html) {
  const located = locateCspMeta(html);
  if (!located) return html;

  const entityQuoted = located.content.includes("&#39;");
  const q = entityQuoted ? "&#39;" : "'";
  const { merged } = mergeCspDirectives(located.content, q);

  for (const entry of merged) {
    if (entry.name === "script-src") {
      entry.values = entry.values.replace(/\s*(?:&#39;|['"])unsafe-inline(?:&#39;|['"])/g, "");
      entry.values = entry.values.replace(
        /\s*(?:&#39;|['"])sha256-[A-Za-z0-9+/=]+(?:&#39;|['"])/g,
        (match) => (match.includes("Z2/iFzh9VMlVkEOar1f/oSHWwQk3ve1qk/C2WdsC4Xk=") ? match : "")
      );
      entry.values = entry.values.trim();
    }
    if (entry.name === "connect-src") {
      entry.values = entry.values
        .replace(/\s*(?:http|ws):\/\/(?:127\.0\.0\.1|localhost):[0-9*]+/g, "")
        .trim();
    }
  }

  const rebuilt = merged
    .map((entry) => (entry.values ? `${entry.name} ${entry.values}` : entry.name))
    .join("; ") + ";";

  return replaceCspContent(html, located, rebuilt);
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

function __readNexusCatalog() {
  const fs = require("fs");
  const path = require("path");
  const os = require("os");
  const catalogPath = path.join(os.homedir(), ".codex", "model_catalog.json");
  try {
    const parsed = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
    if (!parsed || !Array.isArray(parsed.models)) return [];
    return parsed.models
      .filter(m => m && typeof m.slug === "string" && m.visibility !== "hide")
      .map(m => ({ slug: m.slug, label: typeof m.display_name === "string" ? m.display_name : m.slug }));
  } catch (err) {
    return [];
  }
}

function __syncNexusCatalog(callback) {
  const http = require("http");
  const req = http.request({
    host: "127.0.0.1",
    port: 4321,
    path: "/api/catalog/sync",
    method: "POST",
    headers: { "Content-Type": "application/json", "Content-Length": 2 },
    timeout: 30000
  }, res => {
    let body = "";
    res.setEncoding("utf8");
    res.on("data", chunk => { body += chunk; });
    res.on("end", () => {
      let parsed = null;
      try { parsed = JSON.parse(body); } catch (err) { parsed = null; }
      if (res.statusCode >= 200 && res.statusCode < 300 && parsed && parsed.ok) {
        callback(null, parsed);
      } else {
        callback(new Error(parsed && parsed.error ? parsed.error : "Catalog sync failed with HTTP " + res.statusCode));
      }
    });
  });
  req.on("timeout", () => req.destroy(new Error("Catalog sync timed out.")));
  req.on("error", err => callback(err));
  req.end("{}");
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

function __chunkMenuItems(items, size) {
  const limit = size || 24;
  if (items.length <= limit) return items;
  const groups = [];
  for (let i = 0; i < items.length; i += limit) {
    const slice = items.slice(i, i + limit);
    groups.push({
      label: slice[0].label.split("  —  ").pop() + "  …  " + slice[slice.length - 1].label.split("  —  ").pop(),
      submenu: slice
    });
  }
  return groups;
}

function __getNexusNativeMenu(p) {
  const cfg = __readCodexConfig();
  const currentProviderId = cfg.modelProvider || "openai";
  const currentModel = cfg.model || "default";

  const catalogModels = __readNexusCatalog();

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

  const modelCandidates = catalogModels.slice();
  if (currentModel && currentModel !== "default" && !modelCandidates.some(m => m.slug === currentModel)) {
    modelCandidates.unshift({ slug: currentModel, label: currentModel });
  }

  const modelItems = modelCandidates.map(m => ({
    label: m.label === m.slug ? m.slug : m.label + "  —  " + m.slug,
    type: "radio",
    checked: m.slug === currentModel,
    click: (item, focusedWindow) => {
      __writeCodexConfig(null, m.slug);
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
        label: "Select Model (" + catalogModels.length + " in catalog)",
        submenu: modelItems.length > 0
          ? __chunkMenuItems(modelItems)
          : [{ label: "Catalog is empty — run Rebuild Model Catalog", enabled: false }]
      },
      {
        label: "♻️ Rebuild Model Catalog from Provider",
        click: (item, focusedWindow) => {
          __syncNexusCatalog((err, result) => {
            if (p && p.dialog) {
              if (err) {
                p.dialog.showMessageBox({
                  type: "error",
                  message: "Could not rebuild the model catalog.",
                  detail: err.message + "\n\nMake sure the Nexus dashboard is running on 127.0.0.1:4321."
                });
                return;
              }
              p.dialog.showMessageBox({
                type: "info",
                message: "Model catalog rebuilt from provider \"" + result.providerId + "\".",
                detail: result.modelCount + " models written to the Desktop catalog.\n\nRestart Codex Desktop so the chat box picks up the new list."
              });
            }
            if (!err && typeof globalThis.__refreshCodexAppMenu === "function") {
              globalThis.__refreshCodexAppMenu();
            }
          });
        }
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
  if (status.patched && !force && !status.cspCorrupted && !status.integrityStale) {
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
  const pristineIndexHtml = indexHtml;

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
  const legacyMenuScripts = findLegacyNativeMenuScripts(target.asarPath);
  const mainScriptRepairs = [];
  if (legacyMenuScripts.length > 0 && fs.existsSync(target.backupPath) && backupMatchesVersion) {
    for (const relativePath of legacyMenuScripts) {
      const backupScript = extractFileFromAsar(target.backupPath, relativePath);
      if (backupScript && !backupScript.includes(NATIVE_MENU_MARKER)) {
        mainScriptRepairs.push({ relativePath, content: backupScript });
      }
    }
  }

  // Backup original if not yet backed up. A backup taken from a previous
  // Desktop version cannot restore this install, so it is re-taken after an
  // app update (the current archive is already reverted to pristine CSP and
  // markup above before any new injection happens).
  let backupCreated = false;
  let backupRefreshed = false;
  const needsBackup = !fs.existsSync(target.backupPath);
  const backupIsStale = !needsBackup && !backupMatchesVersion;
  if (needsBackup || backupIsStale) {
    if (backupIsStale) {
      const staleVersion = backupPkg && backupPkg.version ? backupPkg.version : "unknown";
      const stalePath = `${target.backupPath}.stale-${staleVersion}`;
      try {
        fs.rmSync(stalePath, { force: true });
        fs.renameSync(target.backupPath, stalePath);
      } catch {
        try { fs.rmSync(target.backupPath, { force: true }); } catch {}
      }
      backupRefreshed = true;
    }
    // The live archive may already carry an older injection, so the backup is
    // written from the reverted markup instead of copying the patched file.
    const tmpBackup = `${target.backupPath}.tmp-${Date.now()}`;
    try {
      patchAsarSingleFile(
        target.asarPath,
        tmpBackup,
        "webview/index.html",
        Buffer.from(pristineIndexHtml, "utf8")
      );
      fs.renameSync(tmpBackup, target.backupPath);
      backupCreated = true;
    } catch (error) {
      try { fs.rmSync(tmpBackup, { force: true }); } catch {}
      throw error;
    }
  }

  const writes = [
    { relativePath: "webview/index.html", content: patchedHtml },
    ...mainScriptRepairs
  ];

  const tmpFiles = [];
  try {
    let source = target.asarPath;
    for (let i = 0; i < writes.length; i++) {
      const tmpPath = `${target.asarPath}.tmp${i + 1}-${Date.now()}`;
      tmpFiles.push(tmpPath);
      patchAsarSingleFile(source, tmpPath, writes[i].relativePath, Buffer.from(writes[i].content, "utf8"));
      source = tmpPath;
    }
    const finalTmp = tmpFiles[tmpFiles.length - 1];
    fs.renameSync(finalTmp, target.asarPath);
    for (const tmpPath of tmpFiles.slice(0, -1)) {
      try { fs.rmSync(tmpPath, { force: true }); } catch {}
    }
    return {
      changed: true,
      backupCreated,
      backupRefreshed,
      restoredMainScript: mainScriptRepairs.length > 0,
      repairedScripts: mainScriptRepairs.map((entry) => entry.relativePath)
    };
  } catch (error) {
    for (const tmpPath of tmpFiles) {
      try { fs.rmSync(tmpPath, { force: true }); } catch {}
    }
    throw error;
  }
}

function backupMatchesInstalledVersion(target) {
  try {
    const installed = JSON.parse(extractFileFromAsar(target.asarPath, "package.json"));
    const backup = JSON.parse(extractFileFromAsar(target.backupPath, "package.json"));
    return Boolean(installed && backup && installed.version === backup.version);
  } catch {
    return false;
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

  if (fs.existsSync(target.backupPath) && backupMatchesInstalledVersion(target)) {
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

  if (hadTheme || hadWidget || status.cspCorrupted || status.integrityStale) {
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
  computeAsarFileIntegrity,
  detectCspCorruption,
  extractFileFromAsar,
  findCodexDesktopInstallation,
  findElectronMainScript,
  findLegacyNativeMenuScripts,
  isAsarIntegrityStale,
  inspectDesktopThemeStatus,
  patchAsarSingleFile,
  patchElectronMainScript,
  patchHtmlContentSecurityPolicy,
  readAsarHeader,
  resolveInstallationTarget,
  restoreDesktopTheme,
  restoreHtmlContentSecurityPolicy
};

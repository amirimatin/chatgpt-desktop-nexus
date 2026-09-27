"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const THEME_STYLE_ID = "codex-nexus-markdown-theme";
const WIDGET_SCRIPT_ID = "codex-nexus-model-switcher";
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
    const patched = themePatched && widgetPatched;
    return {
      found: true,
      patched,
      themePatched,
      widgetPatched,
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
    const srcHeaderPayload = sizeBuf.readUInt32LE(8) - 4;
    const srcJsonLen = sizeBuf.readUInt32LE(12);
    const jsonBuf = Buffer.alloc(srcJsonLen);
    fs.readSync(srcFd, jsonBuf, 0, srcJsonLen, 16);
    const header = JSON.parse(jsonBuf.toString("utf8"));
    const srcPayloadOffset = 16 + srcHeaderPayload;

    // Traverse to locate target node
    const parts = targetRelativePath.split("/");
    let cur = header;
    for (const p of parts) {
      if (!cur.files || !cur.files[p]) {
        throw new Error(`File ${targetRelativePath} not found in asar`);
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

function applyDesktopTheme(target, customCssPath = DEFAULT_THEME_CSS_PATH, widgetJsPath = DEFAULT_WIDGET_JS_PATH) {
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
  if (status.patched) {
    return { changed: false, alreadyPatched: true };
  }

  const indexHtml = extractFileFromAsar(target.asarPath, "webview/index.html");
  if (!indexHtml) {
    throw new Error("webview/index.html not found inside app.asar");
  }

  const themeCss = fs.readFileSync(customCssPath, "utf8");
  const widgetJs = fs.existsSync(widgetJsPath) ? fs.readFileSync(widgetJsPath, "utf8") : "";

  const themeTag = `\n    <style id="${THEME_STYLE_ID}">\n${themeCss}\n    </style>\n`;
  const widgetTag = widgetJs
    ? `\n    <script id="${WIDGET_SCRIPT_ID}">\n${widgetJs}\n    </script>\n`
    : "";

    let patchedHtml = indexHtml;

  // Clean out any existing partial style or widget tags to ensure clean re-injection
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

  // Update script-src in CSP so inline switcher widget can execute
  if (patchedHtml.includes("script-src")) {
    patchedHtml = patchedHtml.replace(
      /script-src\s+([^;]+);/i,
      (match, sources) => {
        if (!sources.includes("unsafe-inline")) {
          return `script-src ${sources} &#39;unsafe-inline&#39;;`;
        }
        return match;
      }
    );
  }

  // Add localhost/127.0.0.1 to connect-src in CSP so widget can communicate with dashboard server
  if (patchedHtml.includes("connect-src")) {
    patchedHtml = patchedHtml.replace(
      /connect-src\s+([^;]+);/i,
      (match, origins) => {
        if (!origins.includes("127.0.0.1") && !origins.includes("localhost")) {
          return `connect-src ${origins} http://127.0.0.1:* http://localhost:* ws://127.0.0.1:* ws://localhost:*;;`;
        }
        return match;
      }
    );
  }

  // Inject CSS in head
  if (patchedHtml.includes("</head>")) {
    patchedHtml = patchedHtml.replace("</head>", `${themeTag}</head>`);
  } else {
    patchedHtml = `${themeTag}${patchedHtml}`;
  }

  // Inject widget before body close
  if (patchedHtml.includes("</body>")) {
    patchedHtml = patchedHtml.replace("</body>", `${widgetTag}</body>`);
  } else {
    patchedHtml = `${patchedHtml}${widgetTag}`;
  }

  // Backup original if not yet backed up
  if (!fs.existsSync(target.backupPath)) {
    fs.copyFileSync(target.asarPath, target.backupPath);
  }

  const tmpAsar = `${target.asarPath}.tmp-${Date.now()}`;
  try {
    patchAsarSingleFile(target.asarPath, tmpAsar, "webview/index.html", Buffer.from(patchedHtml, "utf8"));
    fs.renameSync(tmpAsar, target.asarPath);
    return { changed: true, backupCreated: !status.hasBackup };
  } catch (error) {
    if (fs.existsSync(tmpAsar)) {
      try { fs.unlinkSync(tmpAsar); } catch {}
    }
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

  if (status.patched) {
    let indexHtml = extractFileFromAsar(target.asarPath, "webview/index.html");
    indexHtml = indexHtml.replace(
      new RegExp(`\\s*<style id="${THEME_STYLE_ID}">[\\s\\S]*?<\\/style>\\s*`, "i"),
      "\n"
    );
    indexHtml = indexHtml.replace(
      new RegExp(`\\s*<script id="${WIDGET_SCRIPT_ID}">[\\s\\S]*?<\\/script>\\s*`, "i"),
      "\n"
    );
    indexHtml = indexHtml.replace(
      /\s*http:\/\/127\.0\.0\.1:\*\s*http:\/\/localhost:\*/g,
      ""
    );

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
  DEFAULT_THEME_CSS_PATH,
  DEFAULT_WIDGET_JS_PATH,
  applyDesktopTheme,
  extractFileFromAsar,
  findCodexDesktopInstallation,
  inspectDesktopThemeStatus,
  patchAsarSingleFile,
  readAsarHeader,
  resolveInstallationTarget,
  restoreDesktopTheme
};

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  THEME_STYLE_ID,
  WIDGET_SCRIPT_ID,
  NATIVE_MENU_MARKER,
  DEFAULT_THEME_CSS_PATH,
  DEFAULT_WIDGET_JS_PATH,
  applyDesktopTheme,
  extractFileFromAsar,
  findElectronMainScript,
  inspectDesktopThemeStatus,
  patchAsarSingleFile,
  patchElectronMainScript,
  patchHtmlContentSecurityPolicy,
  resolveInstallationTarget,
  restoreDesktopTheme,
  restoreHtmlContentSecurityPolicy
} = require("../lib/desktop-patch-core");

function createMockAsar(filesMap, outPath) {
  const header = { files: {} };
  let currentOffset = 0;
  const fileBuffers = [];

  for (const [filePath, content] of Object.entries(filesMap)) {
    const buf = Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8");
    const parts = filePath.split("/");
    let cur = header.files;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!cur[parts[i]]) cur[parts[i]] = { files: {} };
      cur = cur[parts[i]].files;
    }
    const fileName = parts[parts.length - 1];
    cur[fileName] = {
      size: buf.length,
      offset: currentOffset.toString()
    };
    currentOffset += buf.length;
    fileBuffers.push(buf);
  }

  const jsonStr = JSON.stringify(header);
  const jsonBuf = Buffer.from(jsonStr, "utf8");
  const jsonLen = jsonBuf.length;
  const padding = (4 - (jsonLen % 4)) % 4;
  const totalHeaderPayload = jsonLen + padding;

  const headerBuf = Buffer.alloc(16 + totalHeaderPayload);
  headerBuf.writeUInt32LE(4, 0);
  headerBuf.writeUInt32LE(totalHeaderPayload + 8, 4);
  headerBuf.writeUInt32LE(totalHeaderPayload + 4, 8);
  headerBuf.writeUInt32LE(jsonLen, 12);
  jsonBuf.copy(headerBuf, 16);

  const fd = fs.openSync(outPath, "w");
  fs.writeSync(fd, headerBuf);
  for (const buf of fileBuffers) {
    fs.writeSync(fd, buf);
  }
  fs.closeSync(fd);
}

test("desktop theme stylesheet exists and contains Monokai markdown tokens and RTL rules with code protection", () => {
  assert.ok(fs.existsSync(DEFAULT_THEME_CSS_PATH), "Default theme CSS must exist");
  const css = fs.readFileSync(DEFAULT_THEME_CSS_PATH, "utf8");
  assert.ok(css.includes("--mk-h1: #FF6188"), "Must contain Dark theme H1 token");
  assert.ok(css.includes("--mk-h1: #D81B60"), "Must contain Light theme H1 token");
  assert.ok(css.includes("--mk-inline-code-text: #FFD866"), "Must contain inline code token");
  assert.ok(css.includes('data-thread-find-target="conversation"'), "Must target conversation markdown");
  // RTL and Vazirmatn support
  assert.ok(css.includes('[data-vazirmatn-flow="rtl"]'), "Must support RTL data flow");
  assert.ok(css.includes("font-family: Vazirmatn"), "Must include Vazirmatn font for Persian text");
  // Strict LTR guard for code blocks
  assert.ok(css.includes("pre, pre *, code, code *"), "Must guard pre and code");
  assert.ok(css.includes("direction: ltr !important"), "Must enforce direction ltr for technical surfaces");
});

test("desktop model selector is an inline chat-header dropdown with named profile controls", () => {
  const widget = fs.readFileSync(DEFAULT_WIDGET_JS_PATH, "utf8");
  assert.ok(widget.includes("CHAT_HEADER_SELECTORS"), "Model control must locate the chat header before rendering");
  assert.ok(widget.includes('class="cn-model-trigger"'), "Model control must expose a compact dropdown trigger");
  assert.ok(widget.includes('class="cn-model-menu"'), "Model controls must be contained in the dropdown menu");
  assert.ok(widget.includes('id="cnProfileSelect"'), "Dropdown must expose named provider-model profiles");
  assert.ok(widget.includes("/api/profiles"), "Dropdown must load and save named profiles");
  assert.ok(!widget.includes("position: fixed"), "Model control must not be attached to the viewport");
  assert.ok(!widget.includes('class="cn-toolbar"'), "Large permanent toolbar markup must be removed");
});

test("patchHtmlContentSecurityPolicy preserves all original directives with HTML entities", () => {
  const htmlWithCsp = `<!doctype html><html><head>
    <meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; script-src &#39;self&#39; &#39;sha256-Z2/iFzh9VMlVkEOar1f/oSHWwQk3ve1qk/C2WdsC4Xk=&#39; https://cdn.plaid.com; connect-src &#39;self&#39; https://ab.chatgpt.com wss://chatgpt.com;">
  </head><body><div id="root"></div></body></html>`;

  const widgetJs = "console.log('widget');";
  const patched = patchHtmlContentSecurityPolicy(htmlWithCsp, widgetJs);

  // Must retain 'self' in script-src (not truncated by &#39; entity)
  assert.ok(patched.includes("script-src &#39;self&#39;"), "script-src must retain &#39;self&#39;");
  assert.ok(patched.includes("unsafe-inline"), "script-src must include unsafe-inline");
  assert.ok(patched.includes("sha256-"), "script-src must include widget sha256");
  assert.ok(patched.includes("https://cdn.plaid.com"), "script-src must retain plaid url");

  // Must retain 'self' in connect-src
  assert.ok(patched.includes("connect-src &#39;self&#39;"), "connect-src must retain &#39;self&#39;");
  assert.ok(patched.includes("https://ab.chatgpt.com"), "connect-src must retain ab.chatgpt.com");
  assert.ok(patched.includes("http://127.0.0.1:*"), "connect-src must include localhost");
  assert.ok(!patched.includes("*;;") && !patched.includes(";;self"), "Must not produce corrupted semicolons");

  // Idempotence: patching again should not duplicate
  const patchedAgain = patchHtmlContentSecurityPolicy(patched, widgetJs);
  assert.equal(patched, patchedAgain);

  // Clean restore
  const restored = restoreHtmlContentSecurityPolicy(patched);
  assert.ok(restored.includes("script-src &#39;self&#39;"));
  assert.ok(restored.includes("connect-src &#39;self&#39;"));
  assert.ok(!restored.includes("http://127.0.0.1:*"));
});

test("findElectronMainScript locates main script in asar", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-main-test-"));
  const asarPath = path.join(tmpDir, "test.asar");

  // Case 1: hashed main script
  createMockAsar({
    "package.json": "{}",
    ".vite/build/main-C5425b_s.js": "console.log('main');"
  }, asarPath);
  assert.equal(findElectronMainScript(asarPath), ".vite/build/main-C5425b_s.js");

  // Case 2: standard main.js
  createMockAsar({
    "package.json": "{}",
    ".vite/build/main.js": "console.log('main');"
  }, asarPath);
  assert.equal(findElectronMainScript(asarPath), ".vite/build/main.js");

  // Case 3: no main script
  createMockAsar({
    "package.json": "{}"
  }, asarPath);
  assert.equal(findElectronMainScript(asarPath), null);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("patchElectronMainScript injects native menu into Electron main template", () => {
  const originalJs = `
function setupMenu(p) {
  const It = [{ label: "File" }, { label: "Help", submenu: [,Ee]]}];
  const Lt = p.Menu.buildFromTemplate(It);
  const j = () => { A.refresh() };
  return Lt;
}
`;

  const patched = patchElectronMainScript(originalJs);
  assert.ok(patched.includes(NATIVE_MENU_MARKER), "Must include native menu marker");
  assert.ok(patched.includes("__getNexusNativeMenu(p)"), "Must hook native menu after help");
  assert.ok(patched.includes("globalThis.__refreshCodexAppMenu=j;"), "Must hook menu refresh");
  assert.ok(patched.includes("⚡ Nexus"), "Must have Nexus menu label");

  // Idempotent
  const repatched = patchElectronMainScript(patched);
  assert.equal(repatched, patched, "Must be idempotent");
});

test("mock asar can be read, patched with the chat-header dropdown, and safely restored", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-desktop-test-"));
  const mockAsarPath = path.join(tmpDir, "app.asar");
  const originalHtml = `<!doctype html><html><head>
    <meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; script-src &#39;self&#39; &#39;sha256-Z2/iFzh9VMlVkEOar1f/oSHWwQk3ve1qk/C2WdsC4Xk=&#39;; connect-src &#39;self&#39; https://ab.chatgpt.com;">
    <title>Test</title>
  </head><body><div id="root"></div></body></html>`;

  const originalMain = "console.log('clean main script');";

  createMockAsar({
    "package.json": JSON.stringify({ name: "mock-app" }),
    "webview/index.html": originalHtml,
    ".vite/build/main-C5425b_s.js": originalMain
  }, mockAsarPath);

  const target = resolveInstallationTarget(mockAsarPath);
  const initialStatus = inspectDesktopThemeStatus(target);
  assert.equal(initialStatus.found, true);
  assert.equal(initialStatus.patched, false);
  assert.equal(initialStatus.writable, true);

  // Apply default patch: theme + inline chat-header dropdown
  const applyResult = applyDesktopTheme(target);
  assert.equal(applyResult.changed, true);
  assert.ok(fs.existsSync(target.backupPath), "Backup must be created");

  const patchedStatus = inspectDesktopThemeStatus(target);
  assert.equal(patchedStatus.patched, true);
  assert.equal(patchedStatus.themePatched, true);
  assert.equal(patchedStatus.widgetPatched, true);
  assert.equal(patchedStatus.nativeMenuPatched, false);
  assert.equal(patchedStatus.cspCorrupted, false);

  const extractedPatchedHtml = extractFileFromAsar(target.asarPath, "webview/index.html");
  assert.ok(extractedPatchedHtml.includes(THEME_STYLE_ID), "Style tag must be present in index.html");
  assert.ok(extractedPatchedHtml.includes(WIDGET_SCRIPT_ID), "Widget script must be present in index.html");
  assert.ok(extractedPatchedHtml.includes("script-src &#39;self&#39;"), "Must retain 'self' in script-src");
  assert.ok(extractedPatchedHtml.includes("connect-src &#39;self&#39;"), "Must retain 'self' in connect-src");

  // Re-applying must be a no-op without force
  const reapplyResult = applyDesktopTheme(target);
  assert.equal(reapplyResult.changed, false);
  assert.equal(reapplyResult.alreadyPatched, true);

  // Force re-applying must succeed
  const forceResult = applyDesktopTheme(target, undefined, undefined, { force: true });
  assert.equal(forceResult.changed, true);

  // If main script had previously been patched with native menu, applyDesktopTheme should revert it
  const corruptedMain = originalMain + "\nvar " + NATIVE_MENU_MARKER + " = true;";
  const tmpCorrupted = path.join(tmpDir, "corrupted.asar");
  patchAsarSingleFile(target.asarPath, tmpCorrupted, ".vite/build/main-C5425b_s.js", Buffer.from(corruptedMain, "utf8"));
  fs.renameSync(tmpCorrupted, target.asarPath);

  const corruptedStatus = inspectDesktopThemeStatus(target);
  assert.equal(corruptedStatus.nativeMenuPatched, true);

  const repairResult = applyDesktopTheme(target, undefined, undefined, { force: true });
  assert.equal(repairResult.changed, true);
  assert.equal(repairResult.restoredMainScript, true);

  const repairedStatus = inspectDesktopThemeStatus(target);
  assert.equal(repairedStatus.nativeMenuPatched, false);
  const repairedMain = extractFileFromAsar(target.asarPath, ".vite/build/main-C5425b_s.js");
  assert.equal(repairedMain, originalMain);

  // Restore theme
  const restoreResult = restoreDesktopTheme(target);
  assert.equal(restoreResult.changed, true);

  const restoredStatus = inspectDesktopThemeStatus(target);
  assert.equal(restoredStatus.patched, false);
  assert.equal(restoredStatus.themePatched, false);
  assert.equal(restoredStatus.widgetPatched, false);
  assert.equal(fs.existsSync(target.backupPath), false, "Backup must be removed on clean restore");

  const extractedRestoredHtml = extractFileFromAsar(target.asarPath, "webview/index.html");
  assert.equal(extractedRestoredHtml, originalHtml);

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

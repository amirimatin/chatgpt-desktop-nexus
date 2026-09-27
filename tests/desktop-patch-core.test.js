const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  THEME_STYLE_ID,
  DEFAULT_THEME_CSS_PATH,
  applyDesktopTheme,
  extractFileFromAsar,
  inspectDesktopThemeStatus,
  patchAsarSingleFile,
  resolveInstallationTarget,
  restoreDesktopTheme
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

test("desktop theme stylesheet exists and contains Monokai markdown tokens", () => {
  assert.ok(fs.existsSync(DEFAULT_THEME_CSS_PATH), "Default theme CSS must exist");
  const css = fs.readFileSync(DEFAULT_THEME_CSS_PATH, "utf8");
  assert.ok(css.includes("--mk-h1: #FF6188"), "Must contain Dark theme H1 token");
  assert.ok(css.includes("--mk-h1: #D81B60"), "Must contain Light theme H1 token");
  assert.ok(css.includes("--mk-inline-code-text: #FFD866"), "Must contain inline code token");
  assert.ok(css.includes("data-thread-find-target=\"conversation\""), "Must target conversation markdown");
  // Ensure font/direction are not overridden
  assert.ok(!css.includes("direction: rtl"), "Must not force direction rtl");
  assert.ok(!css.includes("font-family: Vazirmatn"), "Must not override user native font");
});

test("mock asar can be read, patched, and restored", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-desktop-test-"));
  const mockAsarPath = path.join(tmpDir, "app.asar");
  const originalHtml = "<!doctype html><html><head><title>Test</title></head><body>Hello</body></html>";

  createMockAsar({
    "package.json": JSON.stringify({ name: "mock-app" }),
    "webview/index.html": originalHtml
  }, mockAsarPath);

  const target = resolveInstallationTarget(mockAsarPath);
  const initialStatus = inspectDesktopThemeStatus(target);
  assert.equal(initialStatus.found, true);
  assert.equal(initialStatus.patched, false);
  assert.equal(initialStatus.writable, true);

  // Apply theme
  const applyResult = applyDesktopTheme(target);
  assert.equal(applyResult.changed, true);
  assert.ok(fs.existsSync(target.backupPath), "Backup must be created");

  const patchedStatus = inspectDesktopThemeStatus(target);
  assert.equal(patchedStatus.patched, true);

  const extractedPatchedHtml = extractFileFromAsar(target.asarPath, "webview/index.html");
  assert.ok(extractedPatchedHtml.includes(THEME_STYLE_ID), "Style tag must be present in index.html");
  assert.ok(extractedPatchedHtml.includes("--mk-h1"), "Monokai tokens must be in index.html");

  // Re-applying must be a no-op
  const reapplyResult = applyDesktopTheme(target);
  assert.equal(reapplyResult.changed, false);
  assert.equal(reapplyResult.alreadyPatched, true);

  // Restore theme
  const restoreResult = restoreDesktopTheme(target);
  assert.equal(restoreResult.changed, true);

  const restoredStatus = inspectDesktopThemeStatus(target);
  assert.equal(restoredStatus.patched, false);
  assert.equal(fs.existsSync(target.backupPath), false, "Backup must be removed on clean restore");

  const extractedRestoredHtml = extractFileFromAsar(target.asarPath, "webview/index.html");
  assert.equal(extractedRestoredHtml, originalHtml);

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

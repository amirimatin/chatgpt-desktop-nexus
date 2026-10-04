#!/usr/bin/env node
"use strict";

const {
  applyDesktopTheme,
  findCodexDesktopInstallation,
  inspectDesktopThemeStatus,
  restoreDesktopTheme
} = require("../lib/desktop-patch-core");

function printHelp() {
  console.log(`
Codex Nexus — Codex Desktop Markdown Theme Patcher

Usage:
  node scripts/patch-desktop-theme.js [options]

Options:
  --apply, -a     Apply the Monokai markdown theme to Codex Desktop (default)
  --restore, -r   Restore original Codex Desktop files from backup
  --status, -s    Inspect installation and patch status
  --floating-widget, -w  Also inject floating switcher pill in webview (default: native menu only)
  --force, -f     Force re-applying patch even if already detected as patched
  --help, -h      Show this help message
`);
}

function main() {
  const args = process.argv.slice(2);
  const isRestore = args.includes("--restore") || args.includes("-r");
  const isStatus = args.includes("--status") || args.includes("-s");
  const isForce = args.includes("--force") || args.includes("-f");
  const isFloatingWidget = args.includes("--floating-widget") || args.includes("-w");
  const isHelp = args.includes("--help") || args.includes("-h");

  if (isHelp) {
    printHelp();
    return;
  }

  const target = findCodexDesktopInstallation();
  if (!target) {
    console.error("Error: Could not locate Codex Desktop (ChatGPT) installation on this system.");
    process.exit(1);
  }

  const status = inspectDesktopThemeStatus(target);
  console.log(`Found Codex Desktop at: ${target.asarPath}`);

  if (isStatus) {
    console.log(`- Patched: ${status.patched ? "✓ Yes" : "✗ No"}`);
    console.log(`  • Monokai Markdown Theme: ${status.themePatched ? "✓ Active" : "✗ Inactive"}`);
    console.log(`  • Model Switcher Widget: ${status.widgetPatched ? "✓ Active (Bottom-Right, Draggable)" : "✗ Inactive"}`);
    if (status.nativeMenuPatched) {
      console.log(`  • Warning: Legacy native main script patch detected. Run with --force to restore clean main script.`);
    }
    if (status.cspCorrupted) {
      console.log(`- Warning: Corrupted CSP detected from prior patch. Run with --force to repair.`);
    }
    console.log(`- Backup exists: ${status.hasBackup ? "✓ Yes" : "✗ No"}`);
    console.log(`- Installation writable: ${status.writable ? "✓ Yes" : "✗ No (requires sudo/admin)"}`);
    return;
  }

  if (isRestore) {
    console.log("\nRestoring original Codex Desktop styling...");
    try {
      const result = restoreDesktopTheme(target);
      if (result.changed) {
        console.log("✓ Original Codex Desktop files restored successfully.");
        console.log("Please restart Codex Desktop to see the changes.");
      } else {
        console.log("Codex Desktop is already unpatched.");
      }
    } catch (error) {
      if (error.code === "EACCES") {
        console.error("\nPermission denied: Cannot write to Codex Desktop installation files.");
        console.error("Please run this command with sudo:");
        console.error(`  sudo node ${__filename} --restore`);
        process.exit(2);
      }
      console.error(`\nFailed to restore: ${error.message}`);
      process.exit(1);
    }
    return;
  }

  // Apply patch
  console.log("\nApplying Monokai Markdown Color Theme & Model Switcher to Codex Desktop...");
  try {
    const result = applyDesktopTheme(target, undefined, undefined, { force: isForce });
    if (result.changed) {
      console.log("✓ Monokai Markdown Theme & Bottom-Right Model Switcher applied to Codex Desktop!");
      if (result.restoredMainScript) {
        console.log("  • Restored clean, crash-free Electron main script.");
      }
      console.log("  • Model Switcher positioned at bottom-right (draggable, leaves top-left menu completely free).");
      console.log("Please restart Codex Desktop to activate changes.");
    } else {
      console.log("✓ Codex Desktop is already patched cleanly.");
      console.log("  (Use --force to force re-patching)");
    }
  } catch (error) {
    if (error.code === "EACCES") {
      console.error("\nPermission denied: Cannot write to Codex Desktop installation files.");
      console.error("Please run this command with sudo:");
      console.error(`  sudo node ${__filename} --apply${isForce ? " --force" : ""}`);
      process.exit(2);
    }
    console.error(`\nFailed to apply patch: ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

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
  --help, -h      Show this help message
`);
}

function main() {
  const args = process.argv.slice(2);
  const isRestore = args.includes("--restore") || args.includes("-r");
  const isStatus = args.includes("--status") || args.includes("-s");
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

  // Apply path
  console.log("\nApplying Monokai Markdown Color Theme to Codex Desktop...");
  try {
    const result = applyDesktopTheme(target);
    if (result.changed) {
      console.log("✓ Monokai Markdown Color Theme successfully applied to Codex Desktop!");
      console.log("Please restart Codex Desktop to activate the new colors.");
    } else {
      console.log("✓ Codex Desktop is already patched with the Monokai Markdown Theme.");
    }
  } catch (error) {
    if (error.code === "EACCES") {
      console.error("\nPermission denied: Cannot write to Codex Desktop installation files.");
      console.error("Please run this command with sudo:");
      console.error(`  sudo node ${__filename} --apply`);
      process.exit(2);
    }
    console.error(`\nFailed to apply patch: ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

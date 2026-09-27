#!/usr/bin/env node
"use strict";

const { fork } = require("child_process");
const path = require("path");

function printHelp() {
  console.log(`
Codex Desktop Nexus — Standalone Model/Provider Manager & Monokai Theme Patcher

Usage:
  codex-desktop-nexus <command> [options]

Commands:
  dashboard                 Start the local web dashboard (default)
  patch                     Apply Monokai Markdown color theme to Codex Desktop
  restore                   Restore original Codex Desktop styles
  status                    Check Codex Desktop installation and theme status
  provider list             List all configured model providers
  provider use <id> [model] Switch the active model provider
  help                      Show this help message

Options:
  --port <number>           Port to run the dashboard on (default: 4321)
  --help, -h                Show help

Examples:
  codex-desktop-nexus dashboard --port 4321
  codex-desktop-nexus patch
  codex-desktop-nexus status
  codex-desktop-nexus provider use omniroute
`);
}

const args = process.argv.slice(2);
const command = args[0] || "dashboard";

switch (command) {
  case "dashboard":
  case "serve": {
    const child = fork(path.join(__dirname, "../scripts/serve-dashboard.js"), args.slice(1), { stdio: "inherit" });
    child.on("exit", (code) => process.exit(code || 0));
    break;
  }
  case "patch": {
    const child = fork(path.join(__dirname, "../scripts/patch-desktop-theme.js"), ["--apply", ...args.slice(1)], { stdio: "inherit" });
    child.on("exit", (code) => process.exit(code || 0));
    break;
  }
  case "restore": {
    const child = fork(path.join(__dirname, "../scripts/patch-desktop-theme.js"), ["--restore", ...args.slice(1)], { stdio: "inherit" });
    child.on("exit", (code) => process.exit(code || 0));
    break;
  }
  case "status": {
    const child = fork(path.join(__dirname, "../scripts/patch-desktop-theme.js"), ["--status", ...args.slice(1)], { stdio: "inherit" });
    child.on("exit", (code) => process.exit(code || 0));
    break;
  }
  case "provider": {
    const sub = args[1];
    const core = require("../lib/codex-config-core");
    if (sub === "list") {
      const cfg = core.readCodexModelConfig();
      console.log(`Active Provider: ${cfg.modelProvider || "default (OpenAI)"}`);
      console.log(`Active Model:    ${cfg.model || "—"}\n`);
      console.log("Configured Providers:");
      (cfg.providers || []).forEach(p => {
        const activeMarker = p.id === cfg.modelProvider ? " (ACTIVE)" : "";
        console.log(`  - [${p.id}] ${p.name || p.id} -> ${p.baseUrl || "—"}${activeMarker}`);
      });
    } else if (sub === "use") {
      const providerId = args[2];
      const model = args[3];
      if (!providerId) {
        console.error("Error: Provider ID is required. Example: codex-desktop-nexus provider use omniroute");
        process.exit(1);
      }
      core.setActiveModelProvider(providerId);
      if (model) {
        core.writeCodexModelConfig(model);
      }
      console.log(`✓ Active provider set to "${providerId}"${model ? ` with model "${model}"` : ""}`);
    } else {
      printHelp();
    }
    break;
  }
  case "--help":
  case "-h":
  case "help":
    printHelp();
    break;
  default:
    console.error(`Unknown command: "${command}"\n`);
    printHelp();
    process.exit(1);
}

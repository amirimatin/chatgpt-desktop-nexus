#!/usr/bin/env node
"use strict";

const { fork, spawnSync } = require("child_process");
const path = require("path");

function printHelp() {
  console.log(`
Codex Desktop Nexus — Standalone Model/Provider Manager & Monokai Theme Patcher

Usage:
  codex-desktop-nexus <command> [options]

Commands:
  dashboard                 Start the local web dashboard in foreground
  service <install|remove>  Install or remove background systemd service for dashboard
  patch                     Apply Monokai Markdown theme & In-App Model Switcher to Desktop
  restore                   Restore original Codex Desktop files
  status                    Check Codex Desktop installation and patch status
  provider list             List all configured model providers
  provider use <id> [model] Switch the active model provider
  catalog sync              Rebuild the Desktop model catalog from the active provider
  catalog status            Show the generated catalog and its filters
  help                      Show this help message

Options:
  --port <number>           Port to run the dashboard on (default: 4321)
  --help, -h                Show help

Examples:
  codex-desktop-nexus patch
  codex-desktop-nexus service install
  codex-desktop-nexus provider use omniroute antigravity/gemini-3.8-flash-high
  codex-desktop-nexus catalog sync
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
  case "service": {
    const action = args[1] || "install";
    const res = spawnSync("bash", [path.join(__dirname, "../scripts/install-systemd-service.sh"), action], { stdio: "inherit" });
    process.exit(res.status || 0);
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
  case "catalog": {
    const sub = args[1] || "status";
    const catalog = require("../lib/model-catalog-core");
    if (sub === "sync") {
      catalog.syncModelCatalog().then((result) => {
        console.log(`\u2713 Catalog rebuilt from provider "${result.providerId}"`);
        console.log(`  provider models seen: ${result.providerModelCount}`);
        console.log(`  catalog models:       ${result.modelCount}`);
        console.log(`  catalog file:         ${result.catalogPath}`);
        console.log(`  config updated:       ${result.configChanged ? "yes" : "already set"}`);
        console.log(`  models cache cleared: ${result.cacheCleared ? "yes" : "nothing to clear"}`);
        if (result.missingPins && result.missingPins.length > 0) {
          console.log(`\n! Pinned models the provider does not offer: ${result.missingPins.join(", ")}`);
        }
        console.log("\nRestart Codex Desktop to pick up the new catalog.");
      }).catch((error) => {
        console.error(`Error: ${error.message}`);
        process.exit(1);
      });
    } else if (sub === "status") {
      const state = catalog.catalogStatus();
      console.log(`Catalog file:  ${state.catalogPath}`);
      console.log(`Exists:        ${state.exists ? "yes" : "no"}`);
      console.log(`Configured:    ${state.configured ? "yes" : "no"}`);
      console.log(`Models:        ${state.modelCount}`);
      console.log(`First slugs:   ${state.slugs.slice(0, 8).join(", ") || "—"}`);
      console.log(`Filters:       ${JSON.stringify(state.settings)}`);
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

"use strict";

const codexConfigCore = require("./lib/codex-config-core");
const desktopPatchCore = require("./lib/desktop-patch-core");
const dashboardServer = require("./scripts/serve-dashboard");

module.exports = {
  ...codexConfigCore,
  ...desktopPatchCore,
  startDashboardServer: dashboardServer.startServer,
  createDashboardServer: dashboardServer.createServer
};

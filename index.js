"use strict";

const codexConfigCore = require("./lib/codex-config-core");
const desktopPatchCore = require("./lib/desktop-patch-core");
const modelCatalogCore = require("./lib/model-catalog-core");
const dashboardServer = require("./scripts/serve-dashboard");

module.exports = {
  ...codexConfigCore,
  ...desktopPatchCore,
  ...modelCatalogCore,
  startDashboardServer: dashboardServer.startServer,
  createDashboardServer: dashboardServer.createServer
};

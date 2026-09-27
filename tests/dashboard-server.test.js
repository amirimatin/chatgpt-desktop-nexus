const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { createServer } = require("../scripts/serve-dashboard");

function request(port, options, bodyData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request({ port, host: "127.0.0.1", ...options }, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        let json = null;
        try { json = JSON.parse(data); } catch {}
        resolve({ status: res.statusCode, headers: res.headers, text: data, json });
      });
    });
    req.on("error", reject);
    if (bodyData) {
      req.write(typeof bodyData === "string" ? bodyData : JSON.stringify(bodyData));
    }
    req.end();
  });
}

test("dashboard server responds with HTML and handles status API", async () => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;

  try {
    // 1. GET /
    const rootRes = await request(port, { path: "/", method: "GET" });
    assert.equal(rootRes.status, 200);
    assert.ok(rootRes.headers["content-type"].includes("text/html"));
    assert.ok(rootRes.text.includes("Codex Nexus"));
    assert.ok(rootRes.text.includes("Monokai"));

    // 2. GET /api/status
    const statusRes = await request(port, { path: "/api/status", method: "GET" });
    assert.equal(statusRes.status, 200);
    assert.equal(statusRes.json.ok, true);
    assert.ok(statusRes.json.config !== undefined);
    assert.ok(statusRes.json.desktopTheme !== undefined);

    // 3. 404 for unknown route
    const notFoundRes = await request(port, { path: "/unknown-endpoint", method: "GET" });
    assert.equal(notFoundRes.status, 404);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

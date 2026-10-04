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
  let port;
  try {
    await new Promise((resolve, reject) => {
      server.listen(0, "127.0.0.1", resolve);
      server.once("error", reject);
    });
    port = server.address().port;
  } catch (err) {
    if (err.code === "EPERM") {
      // Restricted sandbox without network bind permission
      return;
    }
    throw err;
  }

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

    // 4. GET /api/provider/models?id=openai
    const modelsRes = await request(port, { path: "/api/provider/models?id=openai", method: "GET" });
    assert.equal(modelsRes.status, 200);
    assert.equal(modelsRes.json.ok, true);
    assert.equal(modelsRes.json.providerId, "openai");
    assert.ok(Array.isArray(modelsRes.json.models));
    assert.ok(modelsRes.json.models.length > 0);

    // 4b. GET /api/provider/models?providerId=openai
    const provRes = await request(port, { path: "/api/provider/models?providerId=openai", method: "GET" });
    assert.equal(provRes.status, 200);
    assert.equal(provRes.json.ok, true);
    assert.equal(provRes.json.providerId, "openai");

    // 5. GET /api/provider/models without id returns 400
    const errRes = await request(port, { path: "/api/provider/models", method: "GET" });
    assert.equal(errRes.status, 400);

  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

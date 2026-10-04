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

test("dashboard saves and activates provider-model profiles without storing credentials", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-dashboard-profiles-"));
  const configPath = path.join(directory, "config.toml");
  const profilesPath = path.join(directory, "nexus-model-profiles.json");
  fs.writeFileSync(configPath, [
    'model = "gpt-5.5"',
    'model_provider = "router"',
    "",
    "[model_providers.router]",
    'name = "Router"',
    'base_url = "https://router.example.test/v1"',
    "",
    "[model_providers.local]",
    'name = "Local"',
    'base_url = "http://127.0.0.1:11434/v1"',
    "",
  ].join("\n"));

  const server = createServer({ configPath, profilesPath });
  await new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", resolve);
    server.once("error", reject);
  });
  const port = server.address().port;

  try {
    const saved = await request(port, { path: "/api/profiles", method: "POST", headers: { "Content-Type": "application/json" } }, {
      name: "Fast local",
      providerId: "local",
      model: "qwen2.5-coder:7b",
    });
    assert.equal(saved.status, 201);
    assert.equal(saved.json.profile.name, "Fast local");

    const listed = await request(port, { path: "/api/profiles", method: "GET" });
    assert.deepEqual(listed.json.profiles, [saved.json.profile]);

    const activated = await request(port, { path: "/api/profiles/activate", method: "POST", headers: { "Content-Type": "application/json" } }, {
      profileId: saved.json.profile.id,
    });
    assert.equal(activated.status, 200);
    assert.equal(activated.json.profile.model, "qwen2.5-coder:7b");
    assert.match(fs.readFileSync(configPath, "utf8"), /model_provider = "local"/);
    assert.match(fs.readFileSync(configPath, "utf8"), /model = "qwen2\.5-coder:7b"/);
    assert.doesNotMatch(fs.readFileSync(profilesPath, "utf8"), /token|secret|api[_-]?key/i);

    const status = await request(port, { path: "/api/status", method: "GET" });
    assert.equal(status.json.config.modelProvider, "local");
    assert.equal(status.json.config.model, "qwen2.5-coder:7b");

    const untrustedList = await request(port, {
      path: "/api/profiles",
      method: "GET",
      headers: { Origin: "https://untrusted.example" },
    });
    assert.equal(untrustedList.status, 403);

    const untrustedActivation = await request(port, {
      path: "/api/profiles/activate",
      method: "POST",
      headers: { Origin: "https://untrusted.example", "Content-Type": "application/json" },
    }, { profileId: saved.json.profile.id });
    assert.equal(untrustedActivation.status, 403);

    const appOriginList = await request(port, {
      path: "/api/profiles",
      method: "GET",
      headers: { Origin: "app://codex" },
    });
    assert.equal(appOriginList.status, 200);
    assert.equal(appOriginList.headers["access-control-allow-origin"], "app://codex");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

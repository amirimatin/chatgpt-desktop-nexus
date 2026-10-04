const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  activateModelProfile,
  deleteModelProfile,
  readModelProfiles,
  saveModelProfile,
} = require("../lib/nexus-profile-core");
const { readCodexModelConfig } = require("../lib/codex-config-core");

test("model profiles persist only a named provider and model, then activate that preset", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-profiles-"));
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

  const saved = saveModelProfile({
    name: "Fast local",
    providerId: "local",
    model: "qwen2.5-coder:7b",
  }, profilesPath);

  assert.equal(saved.name, "Fast local");
  assert.equal(saved.providerId, "local");
  assert.equal(saved.model, "qwen2.5-coder:7b");
  assert.deepEqual(readModelProfiles(profilesPath), [saved]);
  assert.doesNotMatch(fs.readFileSync(profilesPath, "utf8"), /api[_-]?key|token|secret/i);

  const activated = activateModelProfile(saved.id, { profilesPath, configPath });
  assert.equal(activated.profile.id, saved.id);
  assert.deepEqual(readCodexModelConfig(configPath).modelProvider, "local");
  assert.deepEqual(readCodexModelConfig(configPath).model, "qwen2.5-coder:7b");

  assert.deepEqual(deleteModelProfile(saved.id, profilesPath), []);
  fs.rmSync(directory, { recursive: true, force: true });
});

test("model profiles reject blank names and unknown profile IDs", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-profiles-"));
  const profilesPath = path.join(directory, "nexus-model-profiles.json");

  assert.throws(
    () => saveModelProfile({ name: "", providerId: "router", model: "gpt-5.5" }, profilesPath),
    /Profile name/,
  );
  assert.throws(
    () => activateModelProfile("missing", { profilesPath }),
    /not found/,
  );

  fs.rmSync(directory, { recursive: true, force: true });
});

test("model profiles cannot activate a provider that is no longer configured", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-profiles-"));
  const configPath = path.join(directory, "config.toml");
  const profilesPath = path.join(directory, "nexus-model-profiles.json");
  fs.writeFileSync(configPath, 'model = "gpt-5.5"\n');
  const profile = saveModelProfile({
    name: "Removed provider",
    providerId: "gone",
    model: "gpt-5.5",
  }, profilesPath);

  assert.throws(
    () => activateModelProfile(profile.id, { profilesPath, configPath }),
    /not configured/,
  );
  fs.rmSync(directory, { recursive: true, force: true });
});

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  DEFAULT_SETTINGS,
  buildCatalog,
  buildCatalogEntry,
  catalogStatus,
  clearModelsCache,
  displayNameForSlug,
  ensureCatalogConfigured,
  normalizeCatalogSettings,
  readCatalogFile,
  readCatalogSettings,
  isUsableChatModel,
  selectProviderModels,
  syncModelCatalog,
  trimModelMessages,
  writeCatalogFile,
  writeCatalogSettings,
} = require("../lib/model-catalog-core");

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "nexus-catalog-"));
}

const TEMPLATE = {
  slug: "gpt-6.2-sol",
  display_name: "GPT-6.2-Sol",
  description: "built-in",
  context_window: 500000,
  max_context_window: 872000,
  input_modalities: ["text", "image"],
  prefer_websockets: true,
  visibility: "list",
  minimal_client_version: "0.166.0",
  priority: 1,
  upgrade: null,
  availability_nux: null,
  model_specialty: null,
  auto_review_model_override: null,
};

test("catalog settings normalize unknown and invalid input", () => {
  const settings = normalizeCatalogSettings({
    providerId: "  omni  ",
    includeBuiltins: false,
    ownedBy: ["combo", 7],
    include: ["cx/*"],
    exclude: null,
    maxModels: -3,
    pinned: ["tsco", ""],
  });
  assert.equal(settings.providerId, "omni");
  assert.equal(settings.includeBuiltins, false);
  assert.deepEqual(settings.ownedBy, ["combo"]);
  assert.deepEqual(settings.include, ["cx/*"]);
  assert.deepEqual(settings.exclude, []);
  assert.equal(settings.maxModels, DEFAULT_SETTINGS.maxModels);
  assert.deepEqual(settings.pinned, ["tsco"]);
});

test("catalog settings round-trip through disk", () => {
  const file = path.join(tempDir(), "nexus-catalog.json");
  writeCatalogSettings({ providerId: "omni", ownedBy: ["combo"], pinned: ["tsco"] }, file);
  const loaded = readCatalogSettings(file);
  assert.equal(loaded.providerId, "omni");
  assert.deepEqual(loaded.pinned, ["tsco"]);
});

test("missing settings file falls back to defaults", () => {
  const loaded = readCatalogSettings(path.join(tempDir(), "absent.json"));
  assert.equal(loaded.includeBuiltins, true);
  assert.deepEqual(loaded.ownedBy, ["*"], "no family is excluded by default");
  assert.equal(loaded.requireToolCalling, true);
  assert.equal(loaded.trimInstructions, true);
});

test("provider models are selected by owner, glob, regex and pins", () => {
  const chat = { capabilities: { tool_calling: true } };
  const items = [
    { id: "tsco", owned_by: "combo", ...chat },
    { id: "development", owned_by: "combo", ...chat },
    { id: "cx/gpt-6-sol", owned_by: "codex", ...chat },
    { id: "openai/gpt-image-2", owned_by: "openai", ...chat },
    { id: "openrouter/zz", owned_by: "openrouter", ...chat },
    { id: "pcb/manual-pick", owned_by: "pcb", ...chat },
  ];
  const selected = selectProviderModels(items, {
    ownedBy: ["combo"],
    include: ["cx/*", "/^openai\\/gpt-image/"],
    exclude: ["*image*"],
    pinned: ["pcb/manual-pick", "tsco"],
  });
  assert.deepEqual(selected.map((item) => item.id), ["pcb/manual-pick", "tsco", "development", "cx/gpt-6-sol"]);
});

test("pinned models survive exclusion rules", () => {
  const selected = selectProviderModels(
    [{ id: "keep-image", owned_by: "other" }],
    { ownedBy: [], include: [], exclude: ["*image*"], pinned: ["keep-image"] }
  );
  assert.deepEqual(selected.map((item) => item.id), ["keep-image"]);
});

test("selection drops duplicates, invalid slugs and respects maxModels", () => {
  const selected = selectProviderModels(
    [
      { id: "tsco", owned_by: "combo", capabilities: { tool_calling: true } },
      { id: "TSCO", owned_by: "combo", capabilities: { tool_calling: true } },
      { id: "bad model!", owned_by: "combo", capabilities: { tool_calling: true } },
      { id: "another", owned_by: "combo", capabilities: { tool_calling: true } },
    ],
    { ownedBy: ["combo"], maxModels: 2 }
  );
  assert.deepEqual(selected.map((item) => item.id), ["another", "tsco"]);
});

test("catalog entry copies provider context window and filters modalities", () => {
  const entry = buildCatalogEntry(
    { id: "tsco", context_length: 258300, input_modalities: ["text", "image", "pdf"] },
    TEMPLATE,
    "omni"
  );
  assert.equal(entry.slug, "tsco");
  assert.equal(entry.context_window, 258300);
  assert.equal(entry.max_context_window, 258300);
  assert.deepEqual(entry.input_modalities, ["text", "image"]);
  assert.equal(entry.prefer_websockets, false);
  assert.equal(entry.visibility, "list");
  assert.equal(TEMPLATE.context_window, 500000, "template must not be mutated");
});

test("catalog entry falls back to template modalities when provider gives none usable", () => {
  const entry = buildCatalogEntry({ id: "x", input_modalities: ["pdf"] }, TEMPLATE, "omni");
  assert.deepEqual(entry.input_modalities, ["text", "image"]);
});

test("display names keep the provider namespace readable", () => {
  assert.equal(displayNameForSlug("tsco"), "Tsco");
  assert.equal(displayNameForSlug("cx/gpt-6-luna"), "Gpt-6-luna (cx)");
});

test("catalog places provider models before built-ins with unique priorities", () => {
  const catalog = buildCatalog({
    providerModels: [
      { id: "tsco", owned_by: "combo", capabilities: { tool_calling: true } },
      { id: "development", owned_by: "combo", capabilities: { tool_calling: true } },
    ],
    builtinModels: [TEMPLATE, { ...TEMPLATE, slug: "gpt-6-sol", priority: 6 }],
    settings: { ownedBy: ["combo"], pinned: ["tsco"] },
    providerId: "omni",
  });
  assert.deepEqual(catalog.models.map((model) => model.slug), ["tsco", "development", "gpt-6.2-sol", "gpt-6-sol"]);
  assert.deepEqual(catalog.models.map((model) => model.priority), [1, 2, 3, 4]);
});

test("catalog can omit built-ins and never duplicates a provider slug", () => {
  const catalog = buildCatalog({
    providerModels: [{ id: "gpt-6.2-sol", owned_by: "combo", capabilities: { tool_calling: true } }],
    builtinModels: [TEMPLATE],
    settings: { ownedBy: ["combo"], includeBuiltins: false },
    providerId: "omni",
  });
  assert.deepEqual(catalog.models.map((model) => model.slug), ["gpt-6.2-sol"]);
});

test("catalog build fails when filters match nothing", () => {
  assert.throws(
    () => buildCatalog({
      providerModels: [{ id: "a", owned_by: "openrouter", capabilities: { tool_calling: true } }],
      builtinModels: [TEMPLATE],
      settings: { ownedBy: ["combo"], include: [] },
      providerId: "omni",
    }),
    /No provider model matched/
  );
});

test("writing a catalog rejects empty and duplicate slugs", () => {
  const file = path.join(tempDir(), "model_catalog.json");
  assert.throws(() => writeCatalogFile({ models: [] }, file), /empty model catalog/);
  assert.throws(
    () => writeCatalogFile({ models: [{ slug: "a" }, { slug: "A" }] }, file),
    /unique and non-empty/
  );
});

test("written catalog is valid JSON with the expected slugs", () => {
  const file = path.join(tempDir(), "model_catalog.json");
  const result = writeCatalogFile({ models: [{ slug: "tsco" }, { slug: "development" }] }, file);
  assert.equal(result.modelCount, 2);
  assert.deepEqual(readCatalogFile(file).models.map((model) => model.slug), ["tsco", "development"]);
  assert.equal(fs.existsSync(`${file}.tmp`), false);
});

test("config gains model_catalog_json above existing sections and is updated in place", () => {
  const dir = tempDir();
  const config = path.join(dir, "config.toml");
  fs.writeFileSync(config, 'model = "tsco"\n\n[model_providers.omni]\nname = "OmniRoute"\n');
  const first = ensureCatalogConfigured("/tmp/a.json", config);
  assert.equal(first.changed, true);
  let raw = fs.readFileSync(config, "utf8");
  assert.ok(raw.indexOf('model_catalog_json = "/tmp/a.json"') < raw.indexOf("[model_providers.omni]"));

  assert.equal(ensureCatalogConfigured("/tmp/a.json", config).changed, false);
  assert.equal(ensureCatalogConfigured("/tmp/b.json", config).changed, true);
  raw = fs.readFileSync(config, "utf8");
  assert.ok(raw.includes('model_catalog_json = "/tmp/b.json"'));
  assert.equal(raw.match(/model_catalog_json/g).length, 1);
  assert.ok(raw.includes('model = "tsco"'));
});

test("clearing the models cache is idempotent", () => {
  const file = path.join(tempDir(), "models_cache.json");
  fs.writeFileSync(file, "{}");
  assert.equal(clearModelsCache(file), true);
  assert.equal(clearModelsCache(file), false);
});

test("sync builds the catalog, wires the config and clears the cache", async () => {
  const dir = tempDir();
  const config = path.join(dir, "config.toml");
  const catalogPath = path.join(dir, "model_catalog.json");
  const settingsPath = path.join(dir, "nexus-catalog.json");
  const cachePath = path.join(dir, "models_cache.json");
  const tokens = path.join(dir, "provider-tokens.json");

  fs.writeFileSync(config, [
    'model = "tsco"',
    'model_provider = "omni"',
    "[model_providers.omni]",
    'name = "OmniRoute"',
    'base_url = "https://example.invalid/v1"',
    "",
  ].join("\n"));
  fs.writeFileSync(tokens, JSON.stringify({ version: 1, tokens: { omni: "test-token" } }));
  fs.writeFileSync(cachePath, "{}");
  writeCatalogSettings({ providerId: "omni", ownedBy: ["combo"], pinned: ["tsco"] }, settingsPath);

  const binary = path.join(dir, "codex");
  fs.writeFileSync(binary, Buffer.concat([
    Buffer.from("noise"),
    Buffer.from(`{\n  "models": [${JSON.stringify(TEMPLATE)}]}`),
    Buffer.from("tail"),
  ]));

  const requested = [];
  const result = await syncModelCatalog({
    configPath: config,
    catalogPath,
    settingsPath,
    cachePath,
    env: { CODEX_HOME: dir },
    appServerBinaryPath: binary,
    request: async (url) => {
      requested.push(url);
      return {
        data: [
          { id: "tsco", owned_by: "combo", context_length: 258300, capabilities: { tool_calling: true } },
          { id: "skipme", owned_by: "openrouter", capabilities: { tool_calling: true } },
        ],
      };
    },
  });

  assert.deepEqual(requested, ["https://example.invalid/v1/models"]);
  assert.equal(result.providerId, "omni");
  assert.equal(result.providerModelCount, 2);
  assert.equal(result.cacheCleared, true);
  assert.equal(result.configChanged, true);

  const written = readCatalogFile(catalogPath);
  assert.deepEqual(written.models.map((model) => model.slug), ["tsco", "gpt-6.2-sol"]);
  assert.equal(written.models[0].context_window, 258300);
  assert.ok(fs.readFileSync(config, "utf8").includes(`model_catalog_json = "${catalogPath}"`));

  const status = catalogStatus({ configPath: config, catalogPath, settingsPath });
  assert.equal(status.configured, true);
  assert.equal(status.modelCount, 2);
});

test("sync fails loudly when no provider is configured", async () => {
  const dir = tempDir();
  const config = path.join(dir, "config.toml");
  fs.writeFileSync(config, 'model = "tsco"\n');
  await assert.rejects(
    syncModelCatalog({
      configPath: config,
      catalogPath: path.join(dir, "model_catalog.json"),
      settingsPath: path.join(dir, "nexus-catalog.json"),
      cachePath: path.join(dir, "models_cache.json"),
      env: { CODEX_HOME: dir },
      settings: { providerId: null },
      request: async () => ({ data: [] }),
    }),
    /No model provider is configured/
  );
});

test("every provider family is eligible by default, not just ChatGPT models", () => {
  const settings = normalizeCatalogSettings({});
  assert.deepEqual(settings.ownedBy, ["*"]);
  const items = [
    { id: "antigravity/gemini-3.8-flash-low", owned_by: "antigravity", capabilities: { tool_calling: true } },
    { id: "cc/claude-haiku-5-5", owned_by: "claude", capabilities: { tool_calling: true } },
    { id: "pcb/auto/best-coding", owned_by: "pcb", capabilities: { tool_calling: true } },
    { id: "openrouter/some/model", owned_by: "openrouter", capabilities: { tool_calling: true } },
  ];
  const selected = selectProviderModels(items, settings).map((item) => item.id);
  for (const item of items) {
    assert.ok(selected.includes(item.id), `${item.id} must be selectable by default`);
  }
});

test("models without tool calling or text output are rejected as chat models", () => {
  const settings = normalizeCatalogSettings({});
  assert.equal(isUsableChatModel({ capabilities: { tool_calling: true } }, settings), true);
  assert.equal(isUsableChatModel({ capabilities: { tool_calling: false } }, settings), false);
  assert.equal(isUsableChatModel({}, settings), false);
  assert.equal(
    isUsableChatModel({ capabilities: { tool_calling: true }, output_modalities: ["image"] }, settings),
    false
  );
  const relaxed = normalizeCatalogSettings({ requireToolCalling: false, requireTextOutput: false });
  assert.equal(isUsableChatModel({}, relaxed), true);
});

test("capability gates are bypassed for pinned models", () => {
  const selected = selectProviderModels(
    [{ id: "weird/model", owned_by: "x", output_modalities: ["image"] }],
    normalizeCatalogSettings({ pinned: ["weird/model"] })
  );
  assert.deepEqual(selected.map((item) => item.id), ["weird/model"]);
});

test("the model budget is shared round-robin so no family starves", () => {
  const items = [];
  for (let index = 0; index < 300; index += 1) {
    items.push({ id: `pcb/m${index}`, owned_by: "pcb", capabilities: { tool_calling: true } });
  }
  for (let index = 0; index < 5; index += 1) {
    items.push({ id: `antigravity/g${index}`, owned_by: "antigravity", capabilities: { tool_calling: true } });
  }
  items.push({ id: "tsco", owned_by: "combo", capabilities: { tool_calling: true } });

  const selected = selectProviderModels(items, normalizeCatalogSettings({ pinned: ["tsco"], maxModels: 12 }));
  assert.equal(selected.length, 12);
  assert.equal(selected[0].id, "tsco");
  const families = selected.reduce((counts, item) => {
    counts[item.owned_by] = (counts[item.owned_by] || 0) + 1;
    return counts;
  }, {});
  assert.equal(families.antigravity, 5, "the small family must not be starved by the large one");
  assert.ok(families.pcb > 0 && families.pcb < 300);
});

test("instruction trimming keeps the required template and drops the rest", () => {
  const entry = trimModelMessages({
    slug: "x",
    model_messages: { instructions_template: "keep me", confirmation_policies: { big: "x".repeat(100) } },
  });
  assert.deepEqual(entry.model_messages, { instructions_template: "keep me" });

  const untouched = trimModelMessages({ slug: "y", model_messages: { confirmation_policies: {} } });
  assert.deepEqual(untouched.model_messages, { confirmation_policies: {} }, "never drop the only instructions source");
  assert.deepEqual(trimModelMessages({ slug: "z" }).model_messages, undefined);
});

test("built catalog entries keep an instructions template after trimming", () => {
  const catalog = buildCatalog({
    providerModels: [{ id: "tsco", owned_by: "combo", capabilities: { tool_calling: true } }],
    builtinModels: [{
      ...TEMPLATE,
      model_messages: { instructions_template: "T", confirmation_policies: { a: 1 } },
    }],
    settings: { pinned: ["tsco"] },
    providerId: "omni",
  });
  for (const model of catalog.models) {
    assert.deepEqual(model.model_messages, { instructions_template: "T" });
  }
});

test("sync reports pinned models the provider does not offer", () => {
  const catalog = buildCatalog({
    providerModels: [{ id: "tsco", owned_by: "combo", capabilities: { tool_calling: true } }],
    builtinModels: [TEMPLATE],
    settings: { pinned: ["tsco", "antigravity/does-not-exist"] },
    providerId: "omni",
  });
  assert.deepEqual(catalog.missingPins, ["antigravity/does-not-exist"]);
  assert.ok(catalog.models.some((model) => model.slug === "tsco"));
});

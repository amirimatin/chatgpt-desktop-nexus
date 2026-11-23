"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  buildModelsUrl,
  defaultCodexConfigPath,
  httpRequestJson,
  readAllModelProviders,
  readCodexModelConfig,
  resolveProviderToken
} = require("./codex-config-core");

const CATALOG_FILE = "model_catalog.json";
const CATALOG_SETTINGS_FILE = "nexus-catalog.json";
const CATALOG_CONFIG_KEY = "model_catalog_json";
const MODELS_CACHE_FILE = "models_cache.json";
const SLUG_RE = /^[A-Za-z0-9][A-Za-z0-9._:/+-]{0,159}$/;
const SUPPORTED_INPUT_MODALITIES = new Set(["text", "image", "audio"]);

const DEFAULT_SETTINGS = {
  providerId: null,
  includeBuiltins: true,
  ownedBy: ["*"],
  include: [],
  exclude: [],
  requireToolCalling: true,
  requireTextOutput: true,
  trimInstructions: true,
  maxModels: 400,
  pinned: []
};

function codexHome(env = process.env) {
  return env.CODEX_HOME && path.isAbsolute(env.CODEX_HOME)
    ? env.CODEX_HOME
    : path.join(os.homedir(), ".codex");
}

function defaultCatalogPath(env = process.env) {
  return path.join(codexHome(env), CATALOG_FILE);
}

function defaultCatalogSettingsPath(env = process.env) {
  return path.join(codexHome(env), CATALOG_SETTINGS_FILE);
}

function defaultModelsCachePath(env = process.env) {
  return path.join(codexHome(env), MODELS_CACHE_FILE);
}

function readCatalogSettings(settingsPath = defaultCatalogSettingsPath()) {
  try {
    const parsed = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    return normalizeCatalogSettings(parsed);
  } catch (error) {
    if (error && error.code === "ENOENT") return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS };
  }
}

function normalizeCatalogSettings(input) {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const list = (value) => (Array.isArray(value) ? value.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim()) : []);
  const max = Number(source.maxModels);
  return {
    providerId: typeof source.providerId === "string" && source.providerId.trim() ? source.providerId.trim() : null,
    includeBuiltins: source.includeBuiltins !== false,
    ownedBy: Array.isArray(source.ownedBy) ? list(source.ownedBy) : [...DEFAULT_SETTINGS.ownedBy],
    include: list(source.include),
    exclude: list(source.exclude),
    requireToolCalling: source.requireToolCalling !== false,
    requireTextOutput: source.requireTextOutput !== false,
    trimInstructions: source.trimInstructions !== false,
    maxModels: Number.isFinite(max) && max > 0 ? Math.min(Math.floor(max), 5000) : DEFAULT_SETTINGS.maxModels,
    pinned: list(source.pinned)
  };
}

function writeCatalogSettings(settings, settingsPath = defaultCatalogSettingsPath()) {
  const normalized = normalizeCatalogSettings(settings);
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, `${JSON.stringify(normalized, null, 2)}\n`, { mode: 0o600 });
  return normalized;
}

function compileMatchers(patterns) {
  return patterns.map((pattern) => {
    if (pattern.length > 2 && pattern.startsWith("/") && pattern.lastIndexOf("/") > 0) {
      const end = pattern.lastIndexOf("/");
      try {
        return new RegExp(pattern.slice(1, end), pattern.slice(end + 1) || undefined);
      } catch {
        /* fall through to glob handling */
      }
    }
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
    return new RegExp(`^${escaped}$`, "i");
  });
}

function matchesAny(matchers, value) {
  return matchers.some((matcher) => matcher.test(value));
}

function isUsableChatModel(entry, settings) {
  if (settings.requireTextOutput) {
    const outputs = Array.isArray(entry.output_modalities) ? entry.output_modalities : ["text"];
    if (!outputs.includes("text")) return false;
  }
  if (settings.requireToolCalling) {
    const capabilities = entry.capabilities;
    if (!capabilities || typeof capabilities !== "object") return false;
    if (capabilities.tool_calling !== true) return false;
  }
  return true;
}

function selectProviderModels(items, settings) {
  const normalized = normalizeCatalogSettings(settings);
  const includeMatchers = compileMatchers(normalized.include);
  const excludeMatchers = compileMatchers(normalized.exclude);
  const ownedList = normalized.ownedBy.map((value) => value.toLowerCase());
  const allOwners = ownedList.includes("*");
  const owned = new Set(ownedList);
  const pinnedOrder = new Map(normalized.pinned.map((slug, index) => [slug.toLowerCase(), index]));
  const seen = new Set();
  const selected = [];

  for (const item of Array.isArray(items) ? items : []) {
    const slug = typeof item === "string" ? item : item?.id || item?.slug || item?.model;
    if (typeof slug !== "string") continue;
    const trimmed = slug.trim();
    if (!SLUG_RE.test(trimmed)) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;

    const entry = typeof item === "string" ? { id: trimmed } : item;
    const ownedBy = typeof entry.owned_by === "string" ? entry.owned_by.toLowerCase() : "";
    const pinned = pinnedOrder.has(key);
    const byOwner = allOwners || (owned.size > 0 && owned.has(ownedBy));
    const byInclude = includeMatchers.length > 0 && matchesAny(includeMatchers, trimmed);

    if (!pinned && !byOwner && !byInclude) continue;
    if (!pinned && excludeMatchers.length > 0 && matchesAny(excludeMatchers, trimmed)) continue;
    if (!pinned && !isUsableChatModel(entry, normalized)) continue;

    const ownerRank = allOwners ? ownedList.indexOf(ownedBy) : ownedList.indexOf(ownedBy);
    seen.add(key);
    selected.push({
      entry,
      slug: trimmed,
      owner: ownedBy,
      ownerRank: ownerRank === -1 ? Number.MAX_SAFE_INTEGER : ownerRank,
      pinnedIndex: pinned ? pinnedOrder.get(key) : Number.MAX_SAFE_INTEGER
    });
  }

  selected.sort((a, b) => {
    if (a.pinnedIndex !== b.pinnedIndex) return a.pinnedIndex - b.pinnedIndex;
    if (a.ownerRank !== b.ownerRank) return a.ownerRank - b.ownerRank;
    if (a.owner !== b.owner) return a.owner.localeCompare(b.owner);
    return a.slug.localeCompare(b.slug);
  });

  if (selected.length <= normalized.maxModels) {
    return selected.map((item) => item.entry);
  }

  // Keep every family represented instead of letting the largest one consume
  // the whole budget: take models round-robin across owners, in owner order.
  const pinnedFirst = selected.filter((item) => item.pinnedIndex !== Number.MAX_SAFE_INTEGER);
  const rest = selected.filter((item) => item.pinnedIndex === Number.MAX_SAFE_INTEGER);
  const buckets = new Map();
  for (const item of rest) {
    if (!buckets.has(item.owner)) buckets.set(item.owner, []);
    buckets.get(item.owner).push(item);
  }

  const result = pinnedFirst.slice(0, normalized.maxModels);
  const queues = [...buckets.values()];
  let exhausted = false;
  while (result.length < normalized.maxModels && !exhausted) {
    exhausted = true;
    for (const queue of queues) {
      if (queue.length === 0) continue;
      exhausted = false;
      result.push(queue.shift());
      if (result.length >= normalized.maxModels) break;
    }
  }

  return result.map((item) => item.entry);
}

function readBuiltinCatalog(binaryPath) {
  const buffer = fs.readFileSync(binaryPath);
  const marker = Buffer.from('{\n  "models": [');
  const start = buffer.indexOf(marker);
  if (start === -1) throw new Error("Built-in model catalog was not found in the app-server binary.");

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < buffer.length; index += 1) {
    const char = buffer[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === 0x5c) escaped = true;
      else if (char === 0x22) inString = false;
      continue;
    }
    if (char === 0x22) inString = true;
    else if (char === 0x7b) depth += 1;
    else if (char === 0x7d) {
      depth -= 1;
      if (depth === 0) {
        const parsed = JSON.parse(buffer.slice(start, index + 1).toString("utf8"));
        if (!Array.isArray(parsed.models) || parsed.models.length === 0) {
          throw new Error("Built-in model catalog contains no models.");
        }
        return parsed.models;
      }
    }
  }
  throw new Error("Built-in model catalog is truncated in the app-server binary.");
}

function findAppServerBinaries(env = process.env, explicitPath = null) {
  const candidates = [];
  const managed = path.join(codexHome(env), "packages", "app-server-daemon", "current", "codex");
  const desktop = "/usr/lib/chatgpt/resources/codex";
  const override = explicitPath || env.CODEX_NEXUS_APP_SERVER_BINARY || null;
  const search = override ? [override] : [managed, desktop];
  for (const candidate of search) {
    try {
      if (fs.statSync(candidate).isFile()) candidates.push(candidate);
    } catch {
      /* binary is absent on this host */
    }
  }
  return candidates;
}

function loadBuiltinModels(env = process.env, explicitPath = null) {
  const errors = [];
  for (const binary of findAppServerBinaries(env, explicitPath)) {
    try {
      return { models: readBuiltinCatalog(binary), source: binary };
    } catch (error) {
      errors.push(`${binary}: ${error.message}`);
    }
  }
  const detail = errors.length > 0 ? ` (${errors.join("; ")})` : "";
  throw new Error(`No app-server binary exposed a built-in model catalog${detail}.`);
}

function displayNameForSlug(slug) {
  const trimmed = String(slug).trim();
  const namespaceIndex = trimmed.lastIndexOf("/");
  const base = namespaceIndex === -1 ? trimmed : trimmed.slice(namespaceIndex + 1);
  const namespace = namespaceIndex === -1 ? "" : trimmed.slice(0, namespaceIndex);
  const label = base.length <= 3 ? base.toUpperCase() : base.charAt(0).toUpperCase() + base.slice(1);
  return namespace ? `${label} (${namespace})` : label;
}

function trimModelMessages(entry) {
  const messages = entry.model_messages;
  if (!messages || typeof messages !== "object") return entry;
  const template = messages.instructions_template;
  if (typeof template !== "string" || template.length === 0) return entry;
  entry.model_messages = { instructions_template: template };
  return entry;
}

function buildCatalogEntry(providerModel, template, providerId) {
  const slug = typeof providerModel === "string" ? providerModel : providerModel.id || providerModel.slug || providerModel.model;
  const entry = JSON.parse(JSON.stringify(template));
  const source = typeof providerModel === "string" ? {} : providerModel;
  const contextLength = Number(source.context_length || source.max_input_tokens || template.context_window);
  const contextWindow = Number.isFinite(contextLength) && contextLength > 0 ? Math.floor(contextLength) : template.context_window;
  const providerModalities = Array.isArray(source.input_modalities)
    ? source.input_modalities.filter((item) => typeof item === "string" && SUPPORTED_INPUT_MODALITIES.has(item))
    : [];
  const modalities = providerModalities.length > 0 ? providerModalities : template.input_modalities;

  entry.slug = slug;
  entry.display_name = displayNameForSlug(slug);
  entry.description = `${providerId} model (${slug})`;
  entry.context_window = contextWindow;
  entry.max_context_window = contextWindow;
  entry.input_modalities = modalities;
  entry.prefer_websockets = false;
  entry.visibility = "list";
  entry.minimal_client_version = "0.124.0";
  entry.upgrade = null;
  entry.availability_nux = null;
  entry.model_specialty = null;
  entry.auto_review_model_override = null;
  return entry;
}

function buildCatalog({ providerModels, builtinModels, settings, providerId }) {
  const normalized = normalizeCatalogSettings(settings);
  const template = builtinModels.find((model) => model.slug === "gpt-6.2-sol") || builtinModels[0];
  if (!template) throw new Error("No built-in model is available to use as a catalog template.");

  const selected = selectProviderModels(providerModels, normalized);
  if (selected.length === 0) {
    throw new Error("No provider model matched the catalog filters; the Desktop picker would be empty.");
  }

  const selectedSlugs = new Set(selected.map((item) => {
    const slug = typeof item === "string" ? item : item.id || item.slug || item.model;
    return String(slug).toLowerCase();
  }));
  const missingPins = normalized.pinned.filter((slug) => !selectedSlugs.has(slug.toLowerCase()));

  const models = [];
  const used = new Set();
  let priority = 1;
  for (const providerModel of selected) {
    const entry = buildCatalogEntry(providerModel, template, providerId || "provider");
    const key = entry.slug.toLowerCase();
    if (used.has(key)) continue;
    used.add(key);
    entry.priority = priority;
    priority += 1;
    models.push(normalized.trimInstructions ? trimModelMessages(entry) : entry);
  }

  if (normalized.includeBuiltins) {
    for (const builtin of builtinModels) {
      const key = String(builtin.slug).toLowerCase();
      if (used.has(key)) continue;
      used.add(key);
      const entry = JSON.parse(JSON.stringify(builtin));
      entry.priority = priority;
      priority += 1;
      models.push(normalized.trimInstructions ? trimModelMessages(entry) : entry);
    }
  }

  return { models, missingPins };
}

function writeCatalogFile(catalog, catalogPath = defaultCatalogPath()) {
  const slugs = (catalog?.models || []).map((model) => model.slug);
  if (slugs.length === 0) throw new Error("Refusing to write an empty model catalog.");
  const unique = new Set(slugs.map((slug) => String(slug).toLowerCase()));
  if (unique.size !== slugs.length) throw new Error("Model catalog slugs must be unique and non-empty.");

  fs.mkdirSync(path.dirname(catalogPath), { recursive: true });
  const tempPath = `${catalogPath}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
  fs.renameSync(tempPath, catalogPath);
  return { catalogPath, modelCount: slugs.length, slugs };
}

function readCatalogFile(catalogPath = defaultCatalogPath()) {
  try {
    const parsed = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
    return Array.isArray(parsed?.models) ? parsed : null;
  } catch {
    return null;
  }
}

function ensureCatalogConfigured(catalogPath = defaultCatalogPath(), configPath = defaultCodexConfigPath()) {
  let raw = "";
  try {
    raw = fs.readFileSync(configPath, "utf8");
  } catch (error) {
    if (!error || error.code !== "ENOENT") throw error;
  }

  const line = `${CATALOG_CONFIG_KEY} = "${catalogPath.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  const keyRe = new RegExp(`^\\s*${CATALOG_CONFIG_KEY}\\s*=.*$`, "m");
  if (keyRe.test(raw)) {
    const updated = raw.replace(keyRe, line);
    if (updated === raw) return { configPath, changed: false };
    fs.writeFileSync(configPath, updated, "utf8");
    return { configPath, changed: true };
  }

  const sectionMatch = raw.match(/^\s*\[/m);
  const headEnd = sectionMatch ? sectionMatch.index : raw.length;
  const head = raw.slice(0, headEnd);
  const tail = raw.slice(headEnd);
  const separator = head.length === 0 || head.endsWith("\n") ? "" : "\n";
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, `${head}${separator}${line}\n${tail}`, "utf8");
  return { configPath, changed: true };
}

function clearModelsCache(cachePath = defaultModelsCachePath()) {
  try {
    fs.unlinkSync(cachePath);
    return true;
  } catch (error) {
    if (error && error.code === "ENOENT") return false;
    throw error;
  }
}

function resolveCatalogProviderId(settings, configPath = defaultCodexConfigPath()) {
  if (settings.providerId) return settings.providerId;
  const config = readCodexModelConfig(configPath);
  if (config.provider && config.provider.id) return config.provider.id;
  const providers = readAllModelProviders(configPath);
  return providers.length > 0 ? providers[0].id : null;
}

async function fetchProviderModelEntries(
  providerId,
  configPath = defaultCodexConfigPath(),
  env = process.env,
  request = httpRequestJson
) {
  const providers = readAllModelProviders(configPath);
  let provider = providers.find((item) => item.id === providerId);
  if (!provider) {
    const config = readCodexModelConfig(configPath);
    if (config.provider && config.provider.id === providerId) provider = config.provider;
  }
  if (!provider || !provider.baseUrl) {
    throw new Error(`Provider "${providerId}" has no valid base URL configured.`);
  }

  const token = resolveProviderToken(configPath, provider.envKey, env, provider.id);
  const payload = await request(buildModelsUrl(provider.baseUrl), token);
  const items = Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload?.models)
      ? payload.models
      : [];
  if (items.length === 0) throw new Error(`Provider "${providerId}" returned no models.`);
  return items;
}

async function syncModelCatalog({
  configPath = defaultCodexConfigPath(),
  catalogPath = defaultCatalogPath(),
  settingsPath = defaultCatalogSettingsPath(),
  cachePath = defaultModelsCachePath(),
  env = process.env,
  request = httpRequestJson,
  settings: settingsOverride = null,
  appServerBinaryPath = null
} = {}) {
  const settings = settingsOverride
    ? normalizeCatalogSettings(settingsOverride)
    : readCatalogSettings(settingsPath);
  const providerId = resolveCatalogProviderId(settings, configPath);
  if (!providerId) throw new Error("No model provider is configured; add a provider before syncing the catalog.");

  const providerModels = await fetchProviderModelEntries(providerId, configPath, env, request);
  const builtin = loadBuiltinModels(env, appServerBinaryPath);
  const catalog = buildCatalog({
    providerModels,
    builtinModels: builtin.models,
    settings,
    providerId
  });

  const written = writeCatalogFile(catalog, catalogPath);
  const missingPins = catalog.missingPins || [];
  const configured = ensureCatalogConfigured(catalogPath, configPath);
  const cacheCleared = clearModelsCache(cachePath);

  return {
    providerId,
    providerModelCount: providerModels.length,
    builtinSource: builtin.source,
    configChanged: configured.changed,
    cacheCleared,
    missingPins,
    ...written
  };
}

function catalogStatus({
  configPath = defaultCodexConfigPath(),
  catalogPath = defaultCatalogPath(),
  settingsPath = defaultCatalogSettingsPath()
} = {}) {
  const catalog = readCatalogFile(catalogPath);
  let configured = false;
  try {
    configured = new RegExp(`^\\s*${CATALOG_CONFIG_KEY}\\s*=`, "m").test(fs.readFileSync(configPath, "utf8"));
  } catch {
    configured = false;
  }
  return {
    catalogPath,
    configPath,
    configured,
    exists: Boolean(catalog),
    modelCount: catalog ? catalog.models.length : 0,
    slugs: catalog ? catalog.models.map((model) => model.slug) : [],
    settings: readCatalogSettings(settingsPath)
  };
}

module.exports = {
  CATALOG_CONFIG_KEY,
  DEFAULT_SETTINGS,
  buildCatalog,
  buildCatalogEntry,
  displayNameForSlug,
  catalogStatus,
  clearModelsCache,
  isUsableChatModel,
  defaultCatalogPath,
  defaultCatalogSettingsPath,
  defaultModelsCachePath,
  ensureCatalogConfigured,
  fetchProviderModelEntries,
  loadBuiltinModels,
  normalizeCatalogSettings,
  readBuiltinCatalog,
  readCatalogFile,
  readCatalogSettings,
  resolveCatalogProviderId,
  selectProviderModels,
  trimModelMessages,
  syncModelCatalog,
  writeCatalogFile,
  writeCatalogSettings
};

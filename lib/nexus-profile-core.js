const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  defaultCodexConfigPath,
  normalizeCodexModelName,
  readCodexModelConfig,
  setActiveModelProvider,
  writeCodexModelConfig,
} = require("./codex-config-core");

const PROFILES_FILE = "nexus-model-profiles.json";
const PROFILE_NAME_RE = /^[^\u0000-\u001f]{1,80}$/;
const PROVIDER_ID_RE = /^(?:openai|default|[A-Za-z0-9_-]{1,80})$/i;

function defaultModelProfilesPath(env = process.env) {
  const home = env.CODEX_HOME && path.isAbsolute(env.CODEX_HOME)
    ? env.CODEX_HOME
    : path.join(os.homedir(), ".codex");
  return path.join(home, PROFILES_FILE);
}

function normalizeProfileName(value) {
  if (typeof value !== "string") throw new TypeError("Profile name must be text.");
  const name = value.trim();
  if (!PROFILE_NAME_RE.test(name)) {
    throw new TypeError("Profile name must be 1 to 80 printable characters.");
  }
  return name;
}

function normalizeProviderId(value) {
  if (typeof value !== "string") throw new TypeError("Provider ID must be text.");
  const providerId = value.trim();
  if (!PROVIDER_ID_RE.test(providerId)) {
    throw new TypeError("Provider ID contains unsupported characters.");
  }
  return providerId;
}

function readModelProfiles(profilesPath = defaultModelProfilesPath()) {
  try {
    const raw = JSON.parse(fs.readFileSync(profilesPath, "utf8"));
    if (!raw || typeof raw !== "object" || !Array.isArray(raw.profiles)) return [];
    return raw.profiles
      .filter((profile) => profile && typeof profile === "object")
      .map((profile) => ({
        id: typeof profile.id === "string" ? profile.id : "",
        name: typeof profile.name === "string" ? profile.name : "",
        providerId: typeof profile.providerId === "string" ? profile.providerId : "",
        model: typeof profile.model === "string" ? profile.model : "",
      }))
      .filter((profile) => {
        try {
          normalizeProfileName(profile.name);
          normalizeProviderId(profile.providerId);
          normalizeCodexModelName(profile.model);
          return Boolean(profile.id);
        } catch {
          return false;
        }
      });
  } catch (error) {
    if (error && error.code === "ENOENT") return [];
    return [];
  }
}

function writeModelProfiles(profiles, profilesPath = defaultModelProfilesPath()) {
  const safeProfiles = profiles.map((profile) => ({
    id: profile.id,
    name: normalizeProfileName(profile.name),
    providerId: normalizeProviderId(profile.providerId),
    model: normalizeCodexModelName(profile.model),
  }));
  fs.mkdirSync(path.dirname(profilesPath), { recursive: true });
  fs.writeFileSync(
    profilesPath,
    JSON.stringify({ version: 1, profiles: safeProfiles }, null, 2) + "\n",
    { encoding: "utf8", mode: 0o600 },
  );
  return safeProfiles;
}

function saveModelProfile(data, profilesPath = defaultModelProfilesPath()) {
  const profile = {
    id: typeof data?.id === "string" && data.id.trim() ? data.id.trim() : crypto.randomUUID(),
    name: normalizeProfileName(data?.name),
    providerId: normalizeProviderId(data?.providerId),
    model: normalizeCodexModelName(data?.model),
  };
  const profiles = readModelProfiles(profilesPath);
  const index = profiles.findIndex((item) => item.id === profile.id);
  if (index === -1) profiles.push(profile);
  else profiles[index] = profile;
  writeModelProfiles(profiles, profilesPath);
  return profile;
}

function deleteModelProfile(profileId, profilesPath = defaultModelProfilesPath()) {
  const profiles = readModelProfiles(profilesPath);
  const remaining = profiles.filter((profile) => profile.id !== profileId);
  if (remaining.length !== profiles.length) writeModelProfiles(remaining, profilesPath);
  return remaining;
}

function activateModelProfile(profileId, {
  profilesPath = defaultModelProfilesPath(),
  configPath = defaultCodexConfigPath(),
} = {}) {
  const profile = readModelProfiles(profilesPath).find((item) => item.id === profileId);
  if (!profile) throw new Error("Model profile was not found.");
  const isOpenAi = profile.providerId.toLowerCase() === "openai" || profile.providerId.toLowerCase() === "default";
  const configuredProviders = readCodexModelConfig(configPath).providers;
  if (!isOpenAi && !configuredProviders.some((provider) => provider.id === profile.providerId)) {
    throw new Error("Profile provider is not configured.");
  }
  setActiveModelProvider(profile.providerId, configPath);
  writeCodexModelConfig(profile.model, configPath);
  return { profile };
}

module.exports = {
  activateModelProfile,
  defaultModelProfilesPath,
  deleteModelProfile,
  readModelProfiles,
  saveModelProfile,
};

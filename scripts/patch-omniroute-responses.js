#!/usr/bin/env node
// Offline, version-specific repair of OmniRoute 3.8.51. It never deploys or
// reads credentials. The caller builds a derivative image from the output.
const fs = require("node:fs");
const { createResponsesStreamResponse, enrichClaudeLiveCatalog } = require("../lib/omniroute-responses-compat");

function patchOmniRouteResponsesBundle(source) {
  const marker = "/* nexus-responses-fallback-v1 */";
  if (source.includes(marker)) return source;
  const original = "function g(a){let{clientRequestedResponsesStream:b,body:c,headers:g}=a;";
  if (source.split(original).length !== 2) {
    throw new Error("Unsupported OmniRoute bundle: expected exactly one Responses fallback function. No output written.");
  }
  const replacement = original + marker +
    `if(b&&c?.object==="response"&&Array.isArray(c.output))return (${createResponsesStreamResponse.toString()})(c,g);`;
  return source.replace(original, replacement);
}

function patchOmniRouteCatalogBundle(source, advertisedEfforts) {
  const marker = "/* nexus-claude-catalog-v1 */";
  if (source.includes(marker)) return source;
  const original = "q=m.models,{modelId:r,effort:s}=function(a,b,c){";
  if (!source.includes(original)) throw new Error("Unsupported OmniRoute catalog bundle. No output written.");
  const replacement = `q=${marker}(${enrichClaudeLiveCatalog.toString()})(a,m.models,${JSON.stringify(advertisedEfforts)}),{modelId:r,effort:s}=function(a,b,c){`;
  return source.split(original).join(replacement);
}

if (require.main === module) {
  const catalog = process.argv[2] === "--catalog";
  const [input, output, effortsFile] = process.argv.slice(catalog ? 3 : 2);
  if (!input || !output || input === output) {
    throw new Error("Usage: node scripts/patch-omniroute-responses.js INPUT_BUNDLE OUTPUT_BUNDLE");
  }
  const source = fs.readFileSync(input, "utf8");
  const patched = catalog
    ? patchOmniRouteCatalogBundle(source, JSON.parse(fs.readFileSync(effortsFile, "utf8")))
    : patchOmniRouteResponsesBundle(source);
  fs.writeFileSync(output, patched);
  console.log("Prepared OmniRoute Responses fallback repair:", output);
}

module.exports = { patchOmniRouteResponsesBundle, patchOmniRouteCatalogBundle };

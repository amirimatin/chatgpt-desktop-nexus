const assert = require("node:assert/strict");
const test = require("node:test");
const vm = require("node:vm");
const { createResponsesStreamResponse, enrichClaudeLiveCatalog } = require("../lib/omniroute-responses-compat");
const { patchOmniRouteResponsesBundle, patchOmniRouteCatalogBundle } = require("../scripts/patch-omniroute-responses");

async function eventsFor(body, headers = {}) {
  const response = createResponsesStreamResponse(body, headers);
  assert.match(response.headers.get("content-type"), /text\/event-stream/);
  assert.equal(response.headers.get("content-length"), null);
  const events = (await response.text()).trim().split("\n\n").map(frame => {
    const event = frame.split("\n").find(line => line.startsWith("event: ")).slice(7);
    const data = JSON.parse(frame.split("\n").find(line => line.startsWith("data: ")).slice(6));
    assert.equal(event, data.type);
    return data;
  });
  assert.deepEqual(events.map(event => event.sequence_number), events.map((_, index) => index + 1));
  return { response, events };
}

test("Claude web-search fallback emits text and a completed Responses event", async () => {
  const body = {
    id: "resp_claude", object: "response", status: "completed", model: "claude-sonnet-5",
    output: [{ id: "msg_1", type: "message", role: "assistant", content: [{ type: "output_text", text: "OK", annotations: [] }] }],
    usage: { input_tokens: 12, input_tokens_details: { cached_tokens: 0 }, output_tokens: 2, output_tokens_details: { reasoning_tokens: 0 }, total_tokens: 14 },
  };
  const { response, events } = await eventsFor(body, { "Content-Type": "application/json", "content-length": "123", "X-Request-Id": "test" });
  assert.equal(response.headers.get("X-Request-Id"), "test");
  assert.equal(events[0].type, "response.created");
  assert.equal(events.find(event => event.type === "response.output_text.delta").delta, "OK");
  assert.deepEqual(events.at(-1).response, body);
  assert.equal(events.at(-1).type, "response.completed");
});

test("Codex receives required usage detail fields without losing cache and reasoning counts", async () => {
  const body = { id: "resp_usage", object: "response", status: "completed", output: [], usage: {
    input_tokens: 100, output_tokens: 20, total_tokens: 120,
    input_tokens_details: { cache_read_tokens: 80 }, output_tokens_details: { reasoning_tokens: 7 },
  } };
  const { events } = await eventsFor(body);
  const usage = events.at(-1).response.usage;
  assert.equal(usage.input_tokens_details.cached_tokens, 80);
  assert.equal(usage.output_tokens_details.reasoning_tokens, 7);
  assert.equal(usage.input_tokens_details.cache_read_tokens, 80);
  const plain = await eventsFor({ ...body, usage: { input_tokens: 10, output_tokens: 2, total_tokens: 12 } });
  assert.equal(plain.events.at(-1).response.usage.input_tokens_details.cached_tokens, 0);
  assert.equal(plain.events.at(-1).response.usage.output_tokens_details.reasoning_tokens, 0);
});

test("synthetic Responses stream preserves function, custom, and namespaced tool calls", async () => {
  const output = [
    { id: "fc_1", type: "function_call", call_id: "call_1", name: "exec_command", namespace: "functions", arguments: '{"cmd":"pwd","empty":""}', status: "completed" },
    { id: "fc_2", type: "custom_tool_call", call_id: "call_2", name: "apply_patch", input: "*** Begin Patch\n*** End Patch", status: "completed" },
  ];
  const { events } = await eventsFor({ id: "resp_tools", object: "response", status: "completed", output });
  assert.equal(events.find(event => event.type === "response.function_call_arguments.done").arguments, '{"cmd":"pwd","empty":""}');
  assert.equal(events.find(event => event.type === "response.custom_tool_call_input.done").input, "*** Begin Patch\n*** End Patch");
  assert.deepEqual(events.filter(event => event.type === "response.output_item.done").map(event => event.item), output);
  assert.deepEqual(events.at(-1).response.output, output);
});

test("reasoning, refusal, and incomplete status survive the Responses fallback", async () => {
  const body = { id: "resp_incomplete", object: "response", status: "incomplete", incomplete_details: { reason: "max_output_tokens" }, output: [
    { id: "rs_1", type: "reasoning", summary: [{ type: "summary_text", text: "Checking" }], encrypted_content: "opaque" },
    { id: "msg_2", type: "message", role: "assistant", content: [{ type: "refusal", refusal: "Declined" }] },
  ] };
  const { events } = await eventsFor(body);
  assert.equal(events.find(event => event.type === "response.reasoning_summary_text.done").text, "Checking");
  assert.equal(events.find(event => event.type === "response.refusal.done").refusal, "Declined");
  assert.equal(events.at(-1).type, "response.incomplete");
  assert.deepEqual(events.at(-1).response, body);
});

test("failed upstream responses remain failed rather than becoming completed", async () => {
  const body = { id: "resp_failed", object: "response", status: "failed", error: { code: "upstream_error", message: "Rejected" }, output: [] };
  const { events } = await eventsFor(body);
  assert.equal(events.at(-1).type, "response.failed");
  assert.deepEqual(events.at(-1).response.error, body.error);
});

test("bundle repair fixes Responses fallback while preserving JSON requests and chat completions", async () => {
  const source = 'function g(a){let{clientRequestedResponsesStream:b,body:c,headers:g}=a;return new Response(JSON.stringify(c),{headers:g});}';
  const patched = patchOmniRouteResponsesBundle(source);
  const fallback = vm.runInNewContext(patched + ";g", { Response, Headers });
  const body = { id: "resp_1", object: "response", status: "completed", output: [] };
  const stream = fallback({ clientRequestedResponsesStream: true, body, headers: { "content-type": "application/json" } });
  assert.match(stream.headers.get("content-type"), /text\/event-stream/);
  assert.match(await stream.text(), /event: response.completed/);
  const json = fallback({ clientRequestedResponsesStream: false, body, headers: { "content-type": "application/json" } });
  assert.deepEqual(await json.json(), body);
  const chat = { object: "chat.completion", choices: [] };
  assert.deepEqual(await fallback({ clientRequestedResponsesStream: true, body: chat }).json(), chat);
  assert.equal(patchOmniRouteResponsesBundle(patched), patched);
  assert.throws(() => patchOmniRouteResponsesBundle("other version"), /Unsupported OmniRoute bundle/);
  assert.throws(() => patchOmniRouteResponsesBundle(source + source), /Unsupported OmniRoute bundle/);
});

test("refreshed Claude live models retain advertised effort metadata without expanding availability", () => {
  const live = [{ id: "claude-sonnet-5", source: "imported" }, { id: "claude-new", source: "live" }];
  const efforts = { "claude-sonnet-5": ["low", "medium", "high"], "claude-unavailable": ["high"] };
  const enriched = enrichClaudeLiveCatalog("claude", live, efforts);
  assert.deepEqual(enriched, [
    { id: "claude-sonnet-5", source: "imported", supportedThinkingEfforts: ["low", "medium", "high"] },
    { id: "claude-new", source: "live" },
  ]);
  assert.deepEqual(live, [{ id: "claude-sonnet-5", source: "imported" }, { id: "claude-new", source: "live" }]);
  assert.equal(enrichClaudeLiveCatalog("codex", live, efforts), live);
  const narrowed = [{ id: "claude-sonnet-5", supportedThinkingEfforts: ["low"] }];
  assert.equal(enrichClaudeLiveCatalog("claude", narrowed, efforts)[0], narrowed[0]);
});

test("catalog bundle repair enriches a fresh runtime read before effort normalization", () => {
  const source = 'function resolve(a,m){let q=m.models,{modelId:r,effort:s}=function(a,b,c){return {modelId:c[0].id,effort:c[0].supportedThinkingEfforts};}(a,"model",q);return {r,s};}';
  const patched = patchOmniRouteCatalogBundle(source, { "claude-sonnet-5": ["low", "high"] });
  const resolve = vm.runInNewContext(patched + ";resolve");
  const result = resolve("claude", { models: [{ id: "claude-sonnet-5" }] });
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { r: "claude-sonnet-5", s: ["low", "high"] });
  assert.equal(patchOmniRouteCatalogBundle(patched, {}), patched);
  assert.throws(() => patchOmniRouteCatalogBundle("other version", {}), /Unsupported OmniRoute catalog/);
});

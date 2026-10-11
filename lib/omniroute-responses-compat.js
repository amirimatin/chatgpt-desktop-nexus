function createResponsesStreamResponse(body, headers = {}) {
  // This function is also embedded into OmniRoute's compiled fallback module.
  // Keep it self-contained and preserve the final response and tool identities.
  if (body.usage) {
    const usage = body.usage;
    const input = usage.input_tokens_details || {};
    const output = usage.output_tokens_details || {};
    body = { ...body, usage: {
      ...usage,
      input_tokens_details: { ...input, cached_tokens: input.cached_tokens ?? input.cache_read_tokens ?? usage.cache_read_input_tokens ?? 0 },
      output_tokens_details: { ...output, reasoning_tokens: output.reasoning_tokens ?? usage.reasoning_tokens ?? 0 },
    } };
  }
  const events = [];
  let sequence = 0;
  const emit = (type, data) => events.push(`event: ${type}\ndata: ${JSON.stringify({ type, ...data, sequence_number: ++sequence })}\n\n`);
  const started = { ...body, status: "in_progress", output: [] };
  emit("response.created", { response: started });
  emit("response.in_progress", { response: started });

  for (const [output_index, item] of body.output.entries()) {
    const added = { ...item, status: "in_progress" };
    if (item.type === "message") added.content = [];
    if (item.type === "reasoning") added.summary = [];
    if (item.type === "function_call") added.arguments = "";
    if (item.type === "custom_tool_call") added.input = "";
    emit("response.output_item.added", { output_index, item: added });
    const position = { item_id: item.id, output_index };

    if (item.type === "message") {
      for (const [content_index, part] of (item.content || []).entries()) {
        const where = { ...position, content_index };
        const empty = { ...part };
        if (part.type === "output_text") empty.text = "";
        if (part.type === "refusal") empty.refusal = "";
        emit("response.content_part.added", { ...where, part: empty });
        if (part.type === "output_text") {
          emit("response.output_text.delta", { ...where, delta: part.text, logprobs: [] });
          emit("response.output_text.done", { ...where, text: part.text, logprobs: [] });
        } else if (part.type === "refusal") {
          emit("response.refusal.delta", { ...where, delta: part.refusal });
          emit("response.refusal.done", { ...where, refusal: part.refusal });
        }
        emit("response.content_part.done", { ...where, part });
      }
    } else if (item.type === "reasoning") {
      for (const [summary_index, part] of (item.summary || []).entries()) {
        const where = { ...position, summary_index };
        emit("response.reasoning_summary_part.added", { ...where, part: { ...part, text: "" } });
        emit("response.reasoning_summary_text.delta", { ...where, delta: part.text });
        emit("response.reasoning_summary_text.done", { ...where, text: part.text });
        emit("response.reasoning_summary_part.done", { ...where, part });
      }
    } else if (item.type === "function_call") {
      emit("response.function_call_arguments.delta", { ...position, delta: item.arguments });
      emit("response.function_call_arguments.done", { ...position, arguments: item.arguments });
    } else if (item.type === "custom_tool_call") {
      emit("response.custom_tool_call_input.delta", { ...position, delta: item.input });
      emit("response.custom_tool_call_input.done", { ...position, input: item.input });
    }
    emit("response.output_item.done", { output_index, item });
  }

  const status = ["failed", "incomplete"].includes(body.status) ? body.status : "completed";
  emit(`response.${status}`, { response: body });
  const responseHeaders = new Headers(headers);
  responseHeaders.delete("content-length");
  responseHeaders.delete("content-encoding");
  responseHeaders.set("content-type", "text/event-stream");
  responseHeaders.set("cache-control", "no-cache");
  return new Response(events.join(""), { status: 200, headers: responseHeaders });
}

function enrichClaudeLiveCatalog(provider, models, advertisedEfforts) {
  if (provider !== "claude" || !Array.isArray(models)) return models;
  return models.map(model => {
    const efforts = advertisedEfforts[model.id];
    if (!Array.isArray(efforts) || !efforts.length || Array.isArray(model.supportedThinkingEfforts)) return model;
    return { ...model, supportedThinkingEfforts: efforts.slice() };
  });
}

module.exports = { createResponsesStreamResponse, enrichClaudeLiveCatalog };

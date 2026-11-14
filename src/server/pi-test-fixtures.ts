// Synthetic OpenAI-compatible SSE transport for exercising the real pi adapters.
export function toolResponse(name: string, args: unknown) {
  const events = [
    {
      id: 'chatcmpl-fixture',
      object: 'chat.completion.chunk',
      created: 1,
      model: 'fixture',
      choices: [
        {
          index: 0,
          delta: {
            role: 'assistant',
            tool_calls: [
              {
                index: 0,
                id: 'call-fixture',
                type: 'function',
                function: { name, arguments: JSON.stringify(args) },
              },
            ],
          },
          finish_reason: null,
        },
      ],
    },
    {
      id: 'chatcmpl-fixture',
      object: 'chat.completion.chunk',
      created: 1,
      model: 'fixture',
      choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }],
      usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
    },
  ]
  return new Response(
    events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('') +
      'data: [DONE]\n\n',
    { headers: { 'Content-Type': 'text/event-stream' } },
  )
}
export function responsesToolResponse(name: string, args: unknown) {
  const item = {
    id: 'fc-fixture',
    type: 'function_call',
    call_id: 'call-fixture',
    name,
    arguments: JSON.stringify(args),
    status: 'completed',
  }
  const events = [
    { type: 'response.created', response: { id: 'resp-fixture' } },
    {
      type: 'response.output_item.added',
      output_index: 0,
      item: { ...item, arguments: '' },
    },
    { type: 'response.output_item.done', output_index: 0, item },
    {
      type: 'response.completed',
      response: {
        id: 'resp-fixture',
        status: 'completed',
        output: [item],
        usage: { input_tokens: 10, output_tokens: 10, total_tokens: 20 },
      },
    },
  ]
  return new Response(
    events
      .map(
        (event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
      )
      .join(''),
    { headers: { 'Content-Type': 'text/event-stream' } },
  )
}
export const testModelConfig = {
  AI_BASE_URL: 'https://model.example/v1/',
  AI_API_KEY: 'fixture-only',
  AI_MODEL: 'fixture',
  AI_API: 'openai-completions',
  AI_REASONING_EFFORT: 'off',
  AI_MODEL_REASONING: 'true',
  AI_CONTEXT_WINDOW: '128000',
  AI_MAX_OUTPUT_TOKENS: '12000',
  AGENT_TIMEOUT_MS: '45000',
}

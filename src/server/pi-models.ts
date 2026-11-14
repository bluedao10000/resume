import { createModels, createProvider } from '@earendil-works/pi-ai/models'
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy'
import { openAIResponsesApi } from '@earendil-works/pi-ai/api/openai-responses.lazy'
import type { Model, ThinkingLevel } from '@earendil-works/pi-ai'

export function createResumeModels(
  config: Record<string, string>,
  fetchModel?: typeof fetch,
) {
  const model: Model<'openai-completions' | 'openai-responses'> = {
    id: config.AI_MODEL,
    name: config.AI_MODEL,
    provider: 'folio',
    api:
      config.AI_API === 'openai-responses'
        ? 'openai-responses'
        : 'openai-completions',
    baseUrl: config.AI_BASE_URL.replace(/\/$/, ''),
    reasoning: config.AI_MODEL_REASONING === 'true',
    input: ['text'],
    // No price catalog is configured; these are not presented as a cost estimate.
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: Number(config.AI_CONTEXT_WINDOW),
    maxTokens: Number(config.AI_MAX_OUTPUT_TOKENS),
    compat: {
      supportsStore: false,
      supportsDeveloperRole: false,
      supportsReasoningEffort:
        !!config.AI_REASONING_EFFORT && config.AI_REASONING_EFFORT !== 'off',
      maxTokensField: 'max_completion_tokens',
    },
  }
  const models = createModels({
    authContext: {
      env: async (name) => config[name],
      fileExists: async () => false,
    },
  })
  const api =
    model.api === 'openai-responses'
      ? openAIResponsesApi()
      : openAICompletionsApi()
  models.setProvider(
    createProvider({
      id: 'folio',
      auth: {
        apiKey: {
          name: 'Folio',
          resolve: async () => ({ auth: { apiKey: config.AI_API_KEY } }),
        },
      },
      models: [model],
      api: {
        stream: (model, context, options) => {
          const configured = {
            ...options,
            ...(fetchModel && { fetch: fetchModel }),
            reasoningEffort:
              config.AI_REASONING_EFFORT === 'off'
                ? undefined
                : config.AI_REASONING_EFFORT,
          }
          return api.stream(model, context, configured)
        },
        streamSimple: (model, context, options) =>
          api.streamSimple(model, context, {
            ...options,
            ...(fetchModel && { fetch: fetchModel }),
            reasoning: (config.AI_REASONING_EFFORT ?? 'off') as ThinkingLevel,
          }),
      },
    }),
  )
  return { models, model }
}

import { z } from 'zod'
import type { Message } from '@earendil-works/pi-ai'
import { AgentRequestSchema } from '../domain/resume'
import { createResumeModels } from './pi-models'
import type { TokenUsage } from '../domain/billing'
import {
  agentInstructions,
  agentPrompt,
  executeResumeTool,
  resumeTools,
} from './resume-tools'

export class AgentError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 502,
    public providerStatus?: number,
  ) {
    super(message)
  }
}
export async function generateResume(
  raw: z.input<typeof AgentRequestSchema>,
  config: Record<string, string>,
  fetchModel: typeof fetch = fetch,
  signal?: AbortSignal,
  meter?: {
    onUsage: (usage: TokenUsage) => void
    preparePayload: (payload: unknown) => Promise<unknown>
  },
) {
  const input = AgentRequestSchema.parse(raw)
  const { models, model } = createResumeModels(
    config,
    undefined,
    meter?.preparePayload,
  )
  const messages: Message[] =
    input.intent === 'import'
      ? []
      : input.history.map((m) =>
          m.role === 'user'
            ? { role: 'user', content: m.content, timestamp: Date.now() }
            : {
                role: 'assistant',
                content: [{ type: 'text', text: m.content }],
                api: model.api,
                provider: model.provider,
                model: model.id,
                usage: {
                  input: 0,
                  output: 0,
                  cacheRead: 0,
                  cacheWrite: 0,
                  totalTokens: 0,
                  cost: {
                    input: 0,
                    output: 0,
                    cacheRead: 0,
                    cacheWrite: 0,
                    total: 0,
                  },
                },
                stopReason: 'stop',
                timestamp: Date.now(),
              },
        )
  messages.push({
    role: 'user',
    content: agentPrompt(input),
    timestamp: Date.now(),
  })
  let providerStatus: number | undefined
  const timeout = AbortSignal.timeout(Number(config.AGENT_TIMEOUT_MS))
  const response = await models.complete(
    model,
    {
      systemPrompt: agentInstructions,
      messages,
      tools: resumeTools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        parameters: z.toJSONSchema(tool.schema),
      })),
    },
    {
      fetch: async (resource, init) => {
        const response = await fetchModel(resource, init)
        providerStatus = response.status
        return response
      },
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      toolChoice: 'required',
      maxTokens: Number(config.AI_MAX_OUTPUT_TOKENS),
      onResponse: (response) => {
        providerStatus = response.status
      },
      // A single tool is the atomic operation for this UI turn.
      onPayload: (payload) => ({
        ...(payload as object),
        parallel_tool_calls: false,
      }),
    },
  )
  meter?.onUsage(response.usage)
  if (timeout.aborted)
    throw new AgentError(
      'MODEL_TIMEOUT',
      '生成超时，请稍后重试。当前简历已保留。',
    )
  if (response.stopReason === 'error' || response.stopReason === 'aborted') {
    if (providerStatus === 429)
      throw new AgentError(
        'MODEL_LIMIT',
        '模型服务暂时受限，请稍后重试。',
        503,
        429,
      )
    throw new AgentError(
      'MODEL_REQUEST_FAILED',
      '模型服务调用失败。当前简历已保留。',
      502,
      providerStatus,
    )
  }
  if (response.stopReason === 'length')
    throw new AgentError(
      'MODEL_TRUNCATED',
      '生成内容未完成，请缩短输入后重试。当前简历已保留。',
    )
  const calls = response.content.filter((part) => part.type === 'toolCall')
  if (calls.length !== 1 || calls[0].argumentsError)
    throw new AgentError(
      'INVALID_MODEL_RESULT',
      'Agent 未返回有效的操作，未修改简历，请重试。',
    )
  try {
    return executeResumeTool(calls[0].name, calls[0].arguments, input)
  } catch {
    throw new AgentError(
      'INVALID_TOOL_ARGUMENTS',
      'Agent 操作参数无效，未修改简历，请重试。',
    )
  }
}

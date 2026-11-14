import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context'
import { unsafe } from '@earendil-works/pi-schema'
import {
  Harness,
  GenerationTask,
  createRegistry,
  defineDoc,
  defineExtension,
  defineTool,
  hook,
  type Storage,
  type Wake,
} from '@earendil-works/pi-durable'
import { z } from 'zod'
import { AgentRequestSchema, AgentResultSchema } from '../domain/resume'
import { createResumeModels } from './pi-models'
import type { TokenUsage } from '../domain/billing'
import {
  agentInstructions,
  agentPrompt,
  executeResumeTool,
  resumeTools,
  type AgentInput,
} from './resume-tools'

const context = BACKGROUND_CONTEXT
// One durable actor per authenticated user/thread/request. Input is immutable.
export const TurnDoc = defineDoc({
  kind: 'folio.turn.v1',
  version: 1,
  scope: 'conversation',
  history: 'latest',
  fork: 'initial',
  initial: () => ({ input: '', fingerprint: '' }),
  checkpointWhen: () => true,
})
export async function openResumeHarness(
  storage: Storage,
  config: Record<string, string>,
  onWake?: (wake: Wake) => void,
  fetchModel?: typeof fetch,
  preparePayload?: (payload: unknown) => Promise<unknown>,
) {
  const { models } = createResumeModels(config, fetchModel, preparePayload)
  const registry = createRegistry()
  const tools = resumeTools.map((tool) =>
    defineTool({
      name: tool.name,
      description: tool.description,
      parameters: unsafe<Record<string, unknown>>(z.toJSONSchema(tool.schema)),
      // Pure proposal transformation, stable request-derived identity; no external writes.
      replay: 'safe' as const,
      execute: async (args, api, ctx) => {
        const root = await harness.root(ctx)
        const view = await root.context(ctx)
        const assistant = [...view.messages]
          .reverse()
          .find((message) => message.role === 'assistant')
        const calls = assistant?.content.filter(
          (part) => part.type === 'toolCall',
        )
        if (
          assistant?.stopReason !== 'toolUse' ||
          calls?.length !== 1 ||
          calls[0].argumentsError
        )
          throw new Error('Agent must return one valid resume tool call')
        const doc = await api.snapshot(TurnDoc, api.conversationId, ctx)
        const input = AgentRequestSchema.parse(JSON.parse(doc?.input ?? ''))
        const result = executeResumeTool(tool.name, args, input)
        return {
          output: [{ type: 'text' as const, text: JSON.stringify(result) }],
          details: JSON.parse(JSON.stringify(result)),
          control: { terminate: true },
        }
      },
    }),
  )
  registry.install(
    defineExtension({
      name: 'folio-resume-v1',
      tools,
      hooks: [
        hook(GenerationTask, {
          beforeProviderRequest: ({ payload }) => ({
            payload: {
              ...(payload as object),
              tool_choice: 'required',
              parallel_tool_calls: false,
            },
          }),
        }),
      ],
    }),
  )
  const harness = await Harness.open(
    storage,
    {
      models,
      registry,
      onWake,
      settings: {
        stream: { timeoutMs: Number(config.AGENT_TIMEOUT_MS), maxRetries: 0 },
        retry: { enabled: false, maxRetries: 0 },
        compaction: { enabled: false },
        toolExecution: 'sequential',
      },
      onReport: (report) =>
        console.error('pi_durable_report', { kind: report.kind }),
    },
    context,
  )
  setHarnessModel(harness, config.AI_MODEL)
  return harness
}
export async function submitResumeTurn(harness: Harness, input: AgentInput) {
  const root = await harness.root(context, {
    agent: {
      model: { provider: 'folio', modelId: inputModel(harness) },
      instructions: agentInstructions,
      maxTurns: 1,
    },
  })
  const fingerprint = JSON.stringify(input)
  await root.commit(async (tx) => {
    const doc = await tx.doc(TurnDoc, root.id)
    if (doc.fingerprint && doc.fingerprint !== fingerprint)
      throw new Error('REQUEST_CONFLICT')
    doc.input = fingerprint
    doc.fingerprint = fingerprint
  }, context)
  return root.submit(
    {
      type: 'input',
      requestId: input.requestId,
      content: JSON.stringify({
        request: JSON.parse(agentPrompt(input)),
        history: input.intent === 'import' ? [] : input.history,
      }),
      whenBusy: 'reject',
    },
    context,
  )
}
// Model identity is provided by the host, kept out of secrets and client input.
const harnessModels = new WeakMap<Harness, string>()
export function setHarnessModel(harness: Harness, modelId: string) {
  harnessModels.set(harness, modelId)
}
function inputModel(harness: Harness) {
  const model = harnessModels.get(harness)
  if (!model) throw new Error('Harness model is not configured')
  return model
}
export async function resumeTurnSnapshot(harness: Harness) {
  const root = await harness.root(context)
  const view = await root.context(context)
  const result = [...view.messages]
    .reverse()
    .find((m) => m.role === 'toolResult' && !m.isError)
  if (result?.role === 'toolResult') {
    const parsed = AgentResultSchema.safeParse(result.details)
    if (parsed.success)
      return { status: 'completed' as const, result: parsed.data }
  }
  const inspection = await harness.inspect(context)
  if (inspection.tasks.length) return { status: 'running' as const }
  return {
    status: 'failed' as const,
    error: 'Agent 未能完成有效操作，当前简历已保留。',
  }
}
export async function resumeTurnUsage(harness: Harness): Promise<TokenUsage> {
  const root = await harness.root(context)
  const view = await root.context(context)
  return view.messages.reduce<TokenUsage>(
    (usage, message) => {
      if (message.role === 'assistant') {
        usage.input += message.usage.input
        usage.output += message.usage.output
        usage.cacheRead += message.usage.cacheRead
        usage.cacheWrite += message.usage.cacheWrite
      }
      return usage
    },
    { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  )
}

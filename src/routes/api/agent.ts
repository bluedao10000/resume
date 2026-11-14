import { runtimeConfig } from '../../config/runtime-defaults.mjs'
import { createFileRoute } from '@tanstack/react-router'
import { env } from 'cloudflare:workers'
import { AgentRequestSchema, demoAgent } from '../../domain/resume'
import { getAuth } from '../../server/auth'
import { AgentError, generateResume } from '../../server/resume-agent'
import { z } from 'zod'
import {
  BillingError,
  prepareBilledPayload,
  reserveRun,
  releaseRun,
  settleRun,
  type BillingEnv,
} from '../../server/billing'
import { AgentResultSchema } from '../../domain/resume'
import type { TokenUsage } from '../../domain/billing'
const IdentitySchema = z.object({
  threadId: z.string().min(1).max(120),
  requestId: z.string().min(1).max(120),
})
function durableStub(userId: string, identity: z.infer<typeof IdentitySchema>) {
  const namespace = (env as unknown as { RESUME_AGENT: DurableObjectNamespace })
    .RESUME_AGENT
  // Ownership comes exclusively from the verified session.
  return namespace.get(
    namespace.idFromName(
      JSON.stringify([userId, identity.threadId, identity.requestId]),
    ),
  )
}
async function durableStatus(request: Request) {
  const session = await getAuth().api.getSession({ headers: request.headers })
  if (!session)
    return Response.json({ error: '请先登录后使用 Agent。' }, { status: 401 })
  const identity = IdentitySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  )
  if (!identity.success)
    return Response.json({ error: '会话或请求标识无效' }, { status: 400 })
  return durableStub(session.user.id, identity.data).fetch(
    new Request('https://resume-agent.internal/', { method: request.method }),
  )
}
export const Route = createFileRoute('/api/agent')({
  server: {
    handlers: {
      GET: ({ request }) => durableStatus(request),
      DELETE: ({ request }) => durableStatus(request),
      POST: async ({ request }) => {
        const config = runtimeConfig(env) as unknown as BillingEnv
        if (Number(request.headers.get('content-length') ?? 0) > 100000)
          return Response.json(
            { error: '内容过长，请缩减到 20,000 字以内。' },
            { status: 413 },
          )
        let raw: string
        try {
          raw = await request.text()
        } catch {
          return Response.json({ error: '无法读取请求' }, { status: 400 })
        }
        if (raw.length > 100000)
          return Response.json({ error: '请求过大' }, { status: 413 })
        let parsed
        try {
          parsed = AgentRequestSchema.safeParse(JSON.parse(raw))
        } catch {
          return Response.json({ error: '无效的 JSON 请求' }, { status: 400 })
        }
        if (!parsed.success)
          return Response.json({ error: '简历或输入格式无效' }, { status: 400 })
        if (config.APP_MODE !== 'live')
          return Response.json(demoAgent(parsed.data))
        try {
          const session = await getAuth().api.getSession({
            headers: request.headers,
          })
          if (!session)
            return Response.json(
              { error: '请先登录后使用 Agent。' },
              { status: 401 },
            )
          if (!config.AI_API_KEY || !config.AI_MODEL || !config.AI_BASE_URL)
            return Response.json(
              { error: '模型未配置，请联系管理员。' },
              { status: 503 },
            )
          const admission = await reserveRun(
            config,
            session.user.id,
            parsed.data,
          )
          if (config.AGENT_RUNTIME === 'pi-durable') {
            const identity = IdentitySchema.safeParse(parsed.data)
            if (!identity.success)
              return Response.json(
                { error: '会话或请求标识无效，请刷新后重试。' },
                { status: 400 },
              )
            return durableStub(session.user.id, identity.data).fetch(
              new Request('https://resume-agent.internal/', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'x-folio-billing-run': admission.run.id,
                },
                body: JSON.stringify(parsed.data),
              }),
            )
          }
          if (!admission.fresh) {
            if (admission.run.result_json)
              return Response.json(
                AgentResultSchema.parse(JSON.parse(admission.run.result_json)),
              )
            throw new BillingError(
              '该请求正在执行或已经结束，请查看历史对话。',
              409,
            )
          }
          let usage: TokenUsage | undefined
          try {
            const result = await generateResume(
              parsed.data,
              {
                ...config,
                AI_MAX_OUTPUT_TOKENS: String(admission.run.max_output_tokens),
              } as unknown as Record<string, string>,
              fetch,
              request.signal,
              {
                onUsage: (value) => {
                  usage = value
                },
                preparePayload: async (payload) =>
                  prepareBilledPayload(payload, admission.run, config.AI_API),
              },
            )
            await settleRun(config, admission.run.id, usage!, result)
            return Response.json(result)
          } catch (error) {
            if (usage) await settleRun(config, admission.run.id, usage)
            else await releaseRun(config, admission.run.id)
            throw error
          }
        } catch (error) {
          const reference = crypto.randomUUID()
          const timeout =
            error instanceof Error && error.name === 'TimeoutError'
          // Log metadata only, never provider bodies, prompts, tokens or cookies.
          console.error('agent_failed', {
            reference,
            code:
              error instanceof AgentError
                ? error.code
                : timeout
                  ? 'MODEL_TIMEOUT'
                  : 'AGENT_FAILURE',
            ...(error instanceof AgentError && {
              providerStatus: error.providerStatus,
            }),
          })
          return Response.json(
            {
              error: `${
                error instanceof AgentError || error instanceof BillingError
                  ? error.message
                  : timeout
                    ? '生成超时，请稍后重试。当前简历已保留。'
                    : 'Agent 暂时无法完成，请稍后重试。当前简历已保留。'
              } 参考编号：${reference}`,
            },
            {
              status:
                error instanceof AgentError || error instanceof BillingError
                  ? error.status
                  : 502,
            },
          )
        }
      },
    },
  },
})

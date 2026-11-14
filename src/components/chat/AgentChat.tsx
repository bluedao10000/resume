import { useEffect, useMemo, useRef, useState } from 'react'
import { Popover } from '@astryxdesign/core/Popover'
import {
  AssistantRuntimeProvider,
  AuiIf,
  useLocalRuntime,
  ThreadPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
  type ChatModelAdapter,
} from '@assistant-ui/react'
import {
  ArrowUp,
  ArrowRight,
  Check,
  FileText,
  Plus,
  Sparkles,
  Square,
  Target,
} from 'lucide-react'
import {
  AgentResultSchema,
  inferIntent,
  isExampleResume,
  type AgentResult,
  type Resume,
  type AgentRequestSchema,
} from '../../domain/resume'
import type { z } from 'zod'
import {
  boundedHistory,
  type ChatThread,
  type SavedChatMessage,
} from '../../lib/chat-storage'
export type Intent = 'polish' | 'tailor' | 'import'
type Props = {
  thread: ChatThread
  runtimeMode: 'pi-ai' | 'pi-durable'
  onMessages: (messages: SavedChatMessage[], running: boolean) => void
  onRequest: (request: z.infer<typeof AgentRequestSchema> | null) => void
  resume: Resume
  hasResume: boolean
  library: Resume[]
  intent: Intent
  onResult: (r: AgentResult) => void
  onImport: () => void
  onJD: () => void
  onBusy: (b: boolean) => void
  onPolish: () => void
  result: AgentResult | null
  command: { id: number; text: string } | null
  onCommandConsumed: (id: number) => void
}
export function AgentChat(props: Props) {
  const [toolsOpen, setToolsOpen] = useState(false)
  const needsImport = !props.library.some((resume) => !isExampleResume(resume))
  const current = useRef(props)
  current.current = props
  const adapter = useMemo<ChatModelAdapter>(
    () => ({
      async *run({ messages, abortSignal }) {
        const p = current.current
        const text =
          messages[messages.length - 1]?.content
            .filter((c) => c.type === 'text')
            .map((c) => (c.type === 'text' ? c.text : ''))
            .join('\n') ?? ''
        p.onBusy(true)
        const latest = messages[messages.length - 1]
        const input =
          p.thread.pendingRequest?.requestId === latest?.id
            ? p.thread.pendingRequest
            : {
                intent: inferIntent(text, p.intent),
                text,
                resume: p.resume,
                library: p.library.slice(0, 20),
                history: boundedHistory(
                  messages.slice(0, -1).flatMap((m) => {
                    if (m.role !== 'user' && m.role !== 'assistant') return []
                    const content = m.content
                      .filter((c) => c.type === 'text')
                      .map((c) => (c.type === 'text' ? c.text : ''))
                      .join('\n')
                    return content ? [{ role: m.role, content }] : []
                  }),
                ),
                threadId: p.thread.id,
                requestId: latest?.id ?? crypto.randomUUID(),
              }
        p.onRequest(input)
        const query = new URLSearchParams({
          threadId: input.threadId!,
          requestId: input.requestId!,
        })
        let durable = p.runtimeMode === 'pi-durable'
        try {
          let response = await fetch('/api/agent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(input),
            signal: abortSignal,
          })
          let data: unknown = await response.json()
          if (response.status === 202) {
            durable = true
            while (response.status === 202) {
              await new Promise<void>((resolve, reject) => {
                const done = () => {
                  clearTimeout(timer)
                  abortSignal.removeEventListener('abort', abort)
                }
                const abort = () => {
                  done()
                  reject(abortSignal.reason)
                }
                const timer = setTimeout(() => {
                  done()
                  resolve()
                }, 750)
                abortSignal.addEventListener('abort', abort, { once: true })
                if (abortSignal.aborted) abort()
              })
              response = await fetch(`/api/agent?${query}`, {
                signal: abortSignal,
              })
              data = await response.json()
            }
            const snapshot = data as {
              status?: string
              result?: unknown
              error?: string
            }
            if (snapshot.status !== 'completed')
              throw new Error(
                snapshot.error ?? 'Agent 未完成操作，当前简历已保留。',
              )
            data = snapshot.result
          }
          if (!response.ok)
            throw new Error((data as { error?: string }).error ?? '请求失败')
          const parsed = AgentResultSchema.safeParse(data)
          if (!parsed.success) throw new Error('返回的简历格式不完整，请重试。')
          const result = parsed.data
          if (abortSignal.aborted) return
          p.onResult(result)
          yield { content: [{ type: 'text', text: result.message }] }
        } catch (error) {
          if (abortSignal.aborted) {
            if (durable && !unmounted.current)
              await fetch(`/api/agent?${query}`, { method: 'DELETE' }).catch(
                () => {},
              )
            return
          }
          yield {
            content: [
              {
                type: 'text',
                text:
                  error instanceof Error
                    ? error.message
                    : '连接出现问题，请重试。',
              },
            ],
          }
        } finally {
          if (!unmounted.current) p.onBusy(false)
        }
      },
    }),
    [],
  )
  const unmounted = useRef(false)
  useEffect(() => {
    unmounted.current = false
    return () => {
      unmounted.current = true
    }
  }, [])
  const [restoreRequest] = useState(() => props.thread.pendingRequest)
  const [initialMessages] = useState(() =>
    props.thread.messages.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
    })),
  )
  const runtime = useLocalRuntime(adapter, { initialMessages })
  useEffect(() => {
    return runtime.thread.subscribe(() => {
      const state = runtime.thread.getState()
      const messages: SavedChatMessage[] = state.messages.flatMap((message) => {
        if (message.role !== 'user' && message.role !== 'assistant') return []
        const content = message.content
          .filter((c) => c.type === 'text')
          .map((c) => (c.type === 'text' ? c.text : ''))
          .join('\n')
        return content
          ? [
              {
                id: message.id,
                role: message.role,
                content: content.slice(0, 20000),
              },
            ]
          : []
      })
      current.current.onMessages(messages, state.isRunning)
    })
  }, [runtime])
  const resumed = useRef(false)
  useEffect(() => {
    if (resumed.current || !restoreRequest) return
    resumed.current = true
    if (props.runtimeMode === 'pi-durable') {
      const last = props.thread.messages.at(-1)
      if (last?.role === 'user') runtime.thread.startRun({ parentId: last.id })
    } else {
      current.current.onRequest(null)
      runtime.thread.append({
        role: 'assistant',
        content: [{ type: 'text', text: '上次生成已中断，请重新发送要求。' }],
      })
    }
  }, [props.runtimeMode, restoreRequest, runtime])
  const sent = useRef<number | null>(null)
  useEffect(() => {
    const command = props.command
    if (command && command.id !== sent.current) {
      sent.current = command.id
      runtime.thread.append({
        role: 'user',
        content: [{ type: 'text', text: command.text }],
      })
      props.onCommandConsumed(command.id)
    }
  }, [props.command, props.onCommandConsumed, runtime])
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadPrimitive.Root className="chat-root">
        <ThreadPrimitive.Viewport className="chat-scroll">
          <ThreadPrimitive.Messages
            components={{ UserMessage, AssistantMessage }}
          />
          {props.result ? (
            <div className="change-card">
              <details key={props.result.resume.id}>
                <summary>
                  <Check size={14} />
                  <strong>本次草稿更新</strong>
                  <span>{props.result.changes.length} 项</span>
                </summary>
                <div className="change-details">
                  <ul>
                    {props.result.changes.map((change) => (
                      <li key={change}>{change}</li>
                    ))}
                  </ul>
                  {props.result.keywords.length ? (
                    <p>关键词：{props.result.keywords.join('、')}</p>
                  ) : null}
                </div>
              </details>
              {props.result.missing.length ? (
                <p className="missing-note">
                  待补充事实：{props.result.missing.join('、')}
                </p>
              ) : null}
            </div>
          ) : null}
        </ThreadPrimitive.Viewport>
        <div className="composer-container">
          {needsImport ? (
            <AuiIf condition={(s) => s.thread.isEmpty && !s.thread.isRunning}>
              <button
                type="button"
                className="import-prompt"
                onClick={props.onImport}
              >
                <FileText size={17} aria-hidden="true" />
                <span>
                  <strong>导入简历</strong>
                  <span>粘贴原文或选择文本文件</span>
                </span>
                <ArrowRight size={16} aria-hidden="true" />
              </button>
            </AuiIf>
          ) : null}
          <ComposerPrimitive.Root className="composer">
            <ComposerPrimitive.Input
              aria-label="发送给 Folio"
              placeholder={
                props.intent === 'tailor'
                  ? '粘贴岗位描述…'
                  : props.intent === 'import'
                    ? '粘贴你的简历或经历…'
                    : '输入修改要求…'
              }
              rows={2}
              maxLength={20000}
            />
            <div className="composer-bottom">
              <div className="composer-source">
                <Popover
                  label="简历操作"
                  placement="above"
                  padding={1}
                  isOpen={toolsOpen}
                  onOpenChange={setToolsOpen}
                  content={
                    <div className="composer-actions">
                      <button
                        type="button"
                        onClick={() => {
                          setToolsOpen(false)
                          props.onImport()
                        }}
                      >
                        <FileText size={15} />
                        导入简历
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setToolsOpen(false)
                          props.onJD()
                        }}
                      >
                        <Target size={15} />
                        按岗位定制
                      </button>
                      {props.hasResume ? (
                        <button
                          type="button"
                          onClick={() => {
                            setToolsOpen(false)
                            props.onPolish()
                          }}
                        >
                          <Sparkles size={15} />
                          润色简历
                        </button>
                      ) : null}
                    </div>
                  }
                >
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="简历操作"
                    title="简历操作"
                  >
                    <Plus size={18} />
                  </button>
                </Popover>
                {props.hasResume ? (
                  <span
                    className="composer-context"
                    title={`${props.resume.label} · ${props.resume.name}`}
                  >
                    {props.resume.name} · {props.resume.label}
                  </span>
                ) : null}
              </div>
              <div>
                <span className="enter-hint">Enter 发送</span>
                <ThreadPrimitive.If running={false}>
                  <ComposerPrimitive.Send
                    className="send-button"
                    aria-label="发送消息"
                  >
                    <ArrowUp size={19} />
                  </ComposerPrimitive.Send>
                </ThreadPrimitive.If>
                <ThreadPrimitive.If running>
                  <ComposerPrimitive.Cancel
                    className="send-button"
                    aria-label="停止生成"
                  >
                    <Square size={14} />
                  </ComposerPrimitive.Cancel>
                </ThreadPrimitive.If>
              </div>
            </div>
          </ComposerPrimitive.Root>
        </div>
      </ThreadPrimitive.Root>
    </AssistantRuntimeProvider>
  )
}
function UserMessage() {
  return (
    <MessagePrimitive.Root className="user-message">
      <MessagePrimitive.Content />
    </MessagePrimitive.Root>
  )
}
function AssistantMessage() {
  return (
    <AuiIf
      condition={(s) =>
        s.message.parts.length > 0 || s.message.status?.type === 'running'
      }
    >
      <MessagePrimitive.Root className="assistant-message">
        <span className="agent-avatar small">F</span>
        <div>
          <div className="message-byline">Folio</div>
          <div className="message-text">
            <AuiIf condition={(s) => s.message.parts.length > 0}>
              <MessagePrimitive.Content />
            </AuiIf>
            <AuiIf
              condition={(s) =>
                s.message.parts.length === 0 &&
                s.message.status?.type === 'running'
              }
            >
              <span className="thinking" role="status">
                <span className="pulse-dot" aria-hidden="true" />
                正在生成…
              </span>
            </AuiIf>
          </div>
        </div>
      </MessagePrimitive.Root>
    </AuiIf>
  )
}

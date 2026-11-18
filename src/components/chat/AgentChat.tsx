import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  Check,
  FileText,
  Plus,
  Sparkles,
  Square,
  Target,
} from 'lucide-react'
import {
  AgentResultSchema,
  ResumeSchema,
  inferIntent,
  resumeRequestContext,
  isExampleResume,
  type AgentResult,
  type Resume,
  type AgentRequestSchema,
} from '../../domain/resume'
import { z } from 'zod'
import { htmlToMarkdown } from '../../lib/html-to-markdown'
import { ChatWelcome } from './ChatWelcome'
import type { ChatThread, SavedChatMessage } from '../../lib/chat-storage'
export type Intent = 'polish' | 'tailor' | 'import'
type Props = {
  thread: ChatThread
  runtimeMode: 'pi-ai' | 'pi-durable'
  live: boolean
  onMessages: (messages: SavedChatMessage[], running: boolean) => void
  onRequest: (request: z.infer<typeof AgentRequestSchema> | null) => void
  resume: Resume
  hasResume: boolean
  busy: boolean
  library: Resume[]
  onResult: (r: AgentResult) => void
  onImport: () => void
  onJD: () => void
  onBusy: (b: boolean) => void
  onPolish: () => void
  result: AgentResult | null
  command: { id: number; intent: Intent; text: string } | null
  onCommandConsumed: (id: number) => void
}
export function AgentChat(props: Props) {
  const [toolsOpen, setToolsOpen] = useState(false)
  const [pasteError, setPasteError] = useState('')
  const [stop, setStop] = useState<{ query: string; failed: boolean } | null>(
    null,
  )
  const requestStop = useCallback(async (query: string) => {
    setStop({ query, failed: false })
    try {
      const response = await fetch(`/api/agent?${query}`, {
        method: 'DELETE',
        signal: AbortSignal.timeout(15000),
      })
      if (
        !response.ok ||
        !z
          .object({ status: z.literal('cancelled') })
          .safeParse(await response.json()).success
      )
        throw new Error('Stop unconfirmed')
      setStop((current) => (current?.query === query ? null : current))
    } catch {
      setStop((current) =>
        current?.query === query ? { query, failed: true } : current,
      )
    }
  }, [])
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const needsImport = !props.library.some((resume) => !isExampleResume(resume))
  const current = useRef(props)
  current.current = props
  const adapter = useMemo<ChatModelAdapter>(
    () => ({
      async *run({ messages, abortSignal, runConfig }) {
        const p = current.current
        const text =
          messages[messages.length - 1]?.content
            .filter((c) => c.type === 'text')
            .map((c) => (c.type === 'text' ? c.text : ''))
            .join('\n') ?? ''
        const latest = messages.at(-1)
        const pending = p.thread.pendingRequest
        const explicit = runConfig.custom?.intent
        const intent =
          explicit === 'tailor' ||
          explicit === 'import' ||
          explicit === 'polish'
            ? explicit
            : inferIntent(text, p.hasResume ? 'polish' : 'import')
        const input =
          pending && pending.requestId === latest?.id
            ? pending
            : {
                intent,
                text,
                ...resumeRequestContext(
                  intent,
                  p.resume,
                  p.library,
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
        if (!p.hasResume && input.intent !== 'import') {
          yield {
            content: [{ type: 'text', text: '请先导入简历，再按岗位定制。' }],
          }
          return
        }
        // A different tab can edit the same id while this run is in flight.
        // Normalize field order so restored requests compare like fresh ones.
        const sourceChanged = () => {
          if (input.intent !== 'polish') return false
          const selected = current.current.library.find(
            (r) => r.id === input.resume.id,
          )
          return (
            !selected ||
            JSON.stringify(ResumeSchema.parse(selected)) !==
              JSON.stringify(ResumeSchema.parse(input.resume))
          )
        }
        const conflict =
          '简历已在其他位置更改，本次修改未应用。请核对当前简历后重新发送。'
        if (pending && sourceChanged()) {
          yield { content: [{ type: 'text', text: conflict }] }
          return
        }
        p.onBusy(true)
        p.onRequest(input)
        const query = new URLSearchParams({
          threadId: input.threadId!,
          requestId: input.requestId!,
        })
        let durable = p.live && p.runtimeMode === 'pi-durable'
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
                snapshot.error ?? '本次生成未完成，当前简历没有改动。',
              )
            data = snapshot.result
          }
          if (!response.ok)
            throw new Error((data as { error?: string }).error ?? '请求失败')
          const parsed = AgentResultSchema.safeParse(data)
          if (!parsed.success) throw new Error('返回结果无法识别，请重试。')
          const result = parsed.data
          if (abortSignal.aborted || unmounted.current) return
          if (result.applied && sourceChanged()) {
            yield { content: [{ type: 'text', text: conflict }] }
            return
          }
          p.onResult(result)
          yield { content: [{ type: 'text', text: result.message }] }
        } catch (error) {
          if (abortSignal.aborted) return
          yield {
            content: [
              {
                type: 'text',
                text:
                  error instanceof Error
                    ? error.message
                    : '网络连接中断，请稍后重试。',
              },
            ],
          }
        } finally {
          if (abortSignal.aborted && durable && !unmounted.current)
            await requestStop(query.toString())
          if (!unmounted.current) p.onBusy(false)
        }
      },
    }),
    [requestStop],
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
        content: [
          {
            type: 'text',
            text: '上一次生成已中断，请重新发送要求。',
          },
        ],
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
        runConfig: { custom: { intent: command.intent } },
      })
      props.onCommandConsumed(command.id)
    }
  }, [props.command, props.onCommandConsumed, runtime])
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadPrimitive.Root className="chat-root">
        <ThreadPrimitive.Viewport className="chat-scroll">
          <AuiIf
            condition={(s) =>
              (!props.hasResume || s.thread.isEmpty) && !s.thread.isRunning
            }
          >
            <ChatWelcome
              needsImport={needsImport}
              hasResume={props.hasResume}
              onImport={props.onImport}
              onJD={props.onJD}
              onEdit={() => {
                if (!runtime.thread.composer.getState().text.trim())
                  runtime.thread.composer.setText(
                    '帮我精简个人简介，保留真实经历和核心优势。',
                  )
                inputRef.current?.focus()
              }}
            />
          </AuiIf>
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
                    <p>命中关键词：{props.result.keywords.join('、')}</p>
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
          {stop?.failed ? (
            <div role="alert">
              服务端尚未确认停止，任务可能仍在运行。
              <button
                className="outline-button"
                onClick={() => void requestStop(stop.query)}
              >
                重试停止
              </button>
            </div>
          ) : stop ? (
            <p role="status">正在确认停止请求…</p>
          ) : null}
          {pasteError ? <p role="alert">{pasteError}</p> : null}
          <ComposerPrimitive.Root className="composer">
            <ComposerPrimitive.Input
              ref={inputRef}
              aria-label="发送给 Folio"
              placeholder={
                props.hasResume
                  ? '说明想怎么改，或直接粘贴岗位描述（JD）…'
                  : '直接粘贴你的简历或工作经历…'
              }
              rows={2}
              maxLength={20000}
              onPaste={(event) => {
                const html = event.clipboardData.getData('text/html')
                if (!html) return
                event.preventDefault()
                const input = event.currentTarget
                const value =
                  input.value.slice(0, input.selectionStart) +
                  htmlToMarkdown(html) +
                  input.value.slice(input.selectionEnd)
                if (value.length > 20000) {
                  setPasteError('粘贴内容超过 20,000 字符，请分段导入。')
                  return
                }
                setPasteError('')
                runtime.thread.composer.setText(value)
              }}
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
                {props.hasResume ? (
                  <button
                    type="button"
                    className="composer-jd"
                    onClick={props.onJD}
                    disabled={props.busy}
                  >
                    <Target size={14} aria-hidden="true" />按 JD 定制
                  </button>
                ) : null}
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

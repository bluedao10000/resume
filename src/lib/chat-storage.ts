import { z } from 'zod'
import { AgentRequestSchema, AgentResultSchema } from '../domain/resume'
export const ChatMessageSchema = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(20000),
})
export type SavedChatMessage = z.infer<typeof ChatMessageSchema>
export const ChatThreadSchema = z.object({
  id: z.string(),
  resumeId: z.string().nullable(),
  title: z.string(),
  messages: z.array(ChatMessageSchema),
  pendingRequest: AgentRequestSchema.nullable(),
  result: AgentResultSchema.nullable(),
  updatedAt: z.string(),
})
export type ChatThread = z.infer<typeof ChatThreadSchema>
const StoreSchema = z.object({
  activeId: z.string(),
  threads: z.array(ChatThreadSchema),
})
export type ChatStore = z.infer<typeof StoreSchema>
export function newChatThread(resumeId: string | null): ChatThread {
  return {
    id: crypto.randomUUID(),
    resumeId,
    title: '新对话',
    messages: [],
    pendingRequest: null,
    result: null,
    updatedAt: new Date().toISOString(),
  }
}
export function loadChats(scope: string): ChatStore | null {
  const value = localStorage.getItem(`folio:chats:v1:${scope}`)
  if (!value) return null
  const result = StoreSchema.safeParse(JSON.parse(value))
  if (!result.success) throw new Error('无法读取历史对话，原始记录已保留。')
  return result.data
}
export function saveChats(scope: string, store: ChatStore) {
  localStorage.setItem(`folio:chats:v1:${scope}`, JSON.stringify(store))
}
export { boundedHistory } from '../domain/chat-context'

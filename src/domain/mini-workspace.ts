import { z } from 'zod'
import { restoreResumeLibrary } from './resume-library'
import {
  AgentRequestSchema,
  AgentResultSchema,
  ResumeSchema,
  emptyResume,
  resumeRequestContext,
  sampleResume,
  type AgentResult,
} from './resume'
export const MiniWorkspaceSchema = z.object({
  resumes: z.array(ResumeSchema).max(100).transform(restoreResumeLibrary),
  selectedId: z.string(),
  threadId: z.string(),
  messages: z.array(
    z.object({
      role: z.enum(['user', 'assistant']),
      content: z.string(),
      missing: z.array(z.string()).optional(),
    }),
  ),
  pending: AgentRequestSchema.nullable(),
})
export type MiniWorkspace = z.infer<typeof MiniWorkspaceSchema>
export function initialMiniWorkspace(
  threadId: string,
  demo: boolean,
): MiniWorkspace {
  return {
    resumes: demo ? [sampleResume] : [],
    selectedId: demo ? sampleResume.id : '',
    threadId,
    messages: [],
    pending: null,
  }
}
export function miniRequest(
  state: MiniWorkspace,
  intent: 'import' | 'polish' | 'tailor',
  text: string,
  requestId: string,
) {
  const selected = state.resumes.find((r) => r.id === state.selectedId)
  if (state.pending) throw new Error('请先恢复或停止当前任务。')
  if (intent !== 'import' && !selected) throw new Error('请先导入简历。')
  if (intent !== 'polish' && state.resumes.length >= 100)
    throw new Error('本机简历库已满，请先备份并删除不需要的简历。')
  return AgentRequestSchema.parse({
    intent,
    text,
    ...resumeRequestContext(
      intent,
      selected ?? emptyResume,
      state.resumes,
      state.messages,
    ),
    threadId: state.threadId,
    requestId,
  })
}
export function applyMiniResult(
  state: MiniWorkspace,
  raw: AgentResult,
): MiniWorkspace {
  const result = AgentResultSchema.parse(raw)
  if (!state.pending) throw new Error('没有待完成的任务。')
  const resumes = [...state.resumes]
  if (result.applied) {
    const index = resumes.findIndex((r) => r.id === result.resume.id)
    if (index < 0) resumes.push(result.resume)
    else resumes[index] = result.resume
  }
  return {
    ...state,
    resumes,
    selectedId: result.applied ? result.resume.id : state.selectedId,
    pending: null,
    messages: [
      ...state.messages,
      { role: 'assistant', content: result.message, missing: result.missing },
    ],
  }
}

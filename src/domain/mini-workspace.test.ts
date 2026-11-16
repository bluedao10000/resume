import { expect, it } from 'vitest'
import {
  initialMiniWorkspace,
  miniRequest,
  applyMiniResult,
  MiniWorkspaceSchema,
} from './mini-workspace'
import { demoAgent, sampleResume } from './resume'
it('imports without example facts, preserves polish identity and creates separate JD versions', () => {
  let state = initialMiniWorkspace('thread', true)
  const pending = miniRequest(
    state,
    'import',
    '测试人物\n开发工程师\n熟悉 React',
    'import-1',
  )
  expect(pending.resume.experience).toEqual([])
  expect(pending.history).toEqual([])
  state = applyMiniResult({ ...state, pending }, demoAgent(pending, 'import-1'))
  expect(state.resumes[1]).toMatchObject({
    id: 'import-1',
    name: '测试人物',
    isExample: false,
    experience: [],
  })
  const polish = miniRequest(state, 'polish', '润色', 'polish-1')
  state = applyMiniResult(
    { ...state, pending: polish },
    demoAgent(polish, 'unused'),
  )
  expect(state.resumes.map((r) => r.id)).toEqual([sampleResume.id, 'import-1'])
  const tailor = miniRequest(
    state,
    'tailor',
    '要求 React 和 Python',
    'tailor-1',
  )
  state = applyMiniResult(
    { ...state, pending: tailor },
    demoAgent(tailor, 'tailor-1'),
  )
  expect(state.resumes).toHaveLength(3)
  expect(state.resumes[2].skills).not.toContain('Python')
  expect(state.messages.at(-1)?.missing).toContain('Python')
})
it('keeps empty libraries empty and persists the exact pending request', () => {
  const state = initialMiniWorkspace('thread', false)
  expect(
    MiniWorkspaceSchema.parse(JSON.parse(JSON.stringify(state))).resumes,
  ).toEqual([])
  expect(() => miniRequest(state, 'polish', '润色', 'id')).toThrow('导入')
  const pending = miniRequest(state, 'import', '测试人物\n设计师', 'request')
  const saved = MiniWorkspaceSchema.parse(
    JSON.parse(JSON.stringify({ ...state, pending })),
  )
  expect(saved.pending).toEqual(pending)
  expect(() => miniRequest(saved, 'import', '新人物', 'new')).toThrow('恢复')
})

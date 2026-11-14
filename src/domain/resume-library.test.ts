import { describe, expect, it } from 'vitest'
import {
  deduplicateResumes,
  removeResume,
  restoreResumeLibrary,
} from './resume-library'
import { sampleResume } from './resume'

describe('重复副本清理', () => {
  const duplicate = {
    ...sampleResume,
    id: 'duplicate',
    updatedAt: '2026-11-15',
  }

  it('只忽略 id 和日期，优先保留当前选中的副本', () => {
    expect(deduplicateResumes([sampleResume, duplicate], duplicate.id)).toEqual(
      [duplicate],
    )
    expect(
      deduplicateResumes([duplicate, sampleResume], sampleResume.id),
    ).toEqual([sampleResume])
  })

  it('未选中的重复组保留列表中第一份，不修改原数组', () => {
    const input = [duplicate, structuredClone(sampleResume)]
    const original = structuredClone(input)
    expect(deduplicateResumes(input, 'other')).toEqual([duplicate])
    expect(input).toEqual(original)
  })

  it('正文、版本名、模板或事实不同的简历均保留', () => {
    const versions = [
      sampleResume,
      { ...duplicate, label: '另一个投递版本' },
      { ...duplicate, template: 'minimal' as const },
      { ...duplicate, summary: '不同内容' },
      { ...duplicate, skills: ['React'] },
      {
        ...duplicate,
        experience: [
          { ...duplicate.experience[0], bullets: ['不同的经历事实'] },
        ],
      },
    ]
    expect(deduplicateResumes(versions, sampleResume.id)).toEqual(versions)
  })

  it('不受 JSON 属性顺序影响', () => {
    const reordered = {
      ...Object.fromEntries(Object.entries(duplicate).reverse()),
      experience: duplicate.experience.map((job) =>
        Object.fromEntries(Object.entries(job).reverse()),
      ),
    } as typeof sampleResume
    expect(
      deduplicateResumes([sampleResume, reordered], sampleResume.id),
    ).toEqual([sampleResume])
  })

  it('空简历库保持为空', () => {
    expect(deduplicateResumes([], '')).toEqual([])
  })
})

describe('示例恢复与删除', () => {
  it('仅首次访问预置示例，已保存的空库不会重新插入示例', () => {
    expect(restoreResumeLibrary(null)).toEqual([sampleResume])
    expect(restoreResumeLibrary([])).toEqual([])
  })

  it('为旧版原始示例补充标识，不按姓名标记用户简历', () => {
    const { isExample: _, ...legacy } = sampleResume
    const restored = restoreResumeLibrary([
      { ...legacy, label: '我的基础简历' },
      { ...legacy, id: 'real-user-resume' },
      { ...legacy, name: '修改后的真实姓名' },
    ])
    expect(restored[0]).toMatchObject({
      isExample: true,
      label: '示例简历',
    })
    expect(restored[1].isExample).toBeUndefined()
    expect(restored[2].isExample).toBeUndefined()
  })

  it('删除选中项后选择剩余简历，不修改原集合', () => {
    const other = { ...sampleResume, id: 'other' }
    const resumes = [sampleResume, other]
    expect(removeResume(resumes, sampleResume.id, sampleResume.id)).toEqual({
      resumes: [other],
      selectedId: 'other',
    })
    expect(resumes).toHaveLength(2)
  })

  it('删除非选中项保持当前选择，删除最后一份返回空库', () => {
    const other = { ...sampleResume, id: 'other' }
    expect(
      removeResume([sampleResume, other], other.id, sampleResume.id),
    ).toEqual({ resumes: [sampleResume], selectedId: sampleResume.id })
    expect(
      removeResume([sampleResume], sampleResume.id, sampleResume.id),
    ).toEqual({ resumes: [], selectedId: '' })
  })
})

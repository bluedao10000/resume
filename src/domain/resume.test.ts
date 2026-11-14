import { describe, expect, it } from 'vitest'
import {
  AgentRequestSchema,
  AgentResultSchema,
  demoAgent,
  inferIntent,
  matchJD,
  retrieveResume,
  sampleJD,
  sampleResume,
} from './resume'
describe('事实约束与版本隔离', () => {
  it('显式 JD 定制不因招聘联系邮箱而误判为导入简历', () => {
    expect(
      inferIntent(
        '前端工程师\nReact / TypeScript\n投递邮箱：talent@example.invalid',
        'tailor',
      ),
    ).toBe('tailor')
  })
  it('润色保留当前身份且不修改输入、不添加数字', () => {
    const original = structuredClone(sampleResume)
    const result = demoAgent({
      intent: 'polish',
      text: '润色',
      resume: original,
    })
    expect(result.resume.id).toBe(original.id)
    expect(result.resume.label).toBe(original.label)
    expect(original).toEqual(sampleResume)
    expect(result.resume.isExample).toBe(true)
    expect(result.resume.experience[0].company).toBe(
      sampleResume.experience[0].company,
    )
    expect(JSON.stringify(result.resume.experience).match(/\d+/g)).toEqual(
      JSON.stringify(original.experience).match(/\d+/g),
    )
    expect(AgentResultSchema.safeParse(result).success).toBe(true)
  })
  it('导入不泄漏示例人物的身份、学历与工作经历', () => {
    const result = demoAgent({
      intent: 'import',
      text: '王明\n前端工程师\nwang@example.com\n使用 React 和 TypeScript',
      resume: sampleResume,
    })
    expect(result.resume.name).toBe('王明')
    expect(result.resume.id).not.toBe(sampleResume.id)
    expect(result.resume.isExample).toBe(false)
    expect(result.resume.email).toBe('wang@example.com')
    expect(result.resume.experience).toEqual([])
    expect(result.resume.education).toBe('')
    expect(JSON.stringify(result.resume)).not.toContain('山海科技')
    expect(result.resume.skills).toEqual(['React', 'TypeScript'])
  })
  it('JD 缺少的技能必须留作缺口，不得注入简历', () => {
    const result = demoAgent({
      intent: 'tailor',
      text: sampleJD,
      resume: sampleResume,
    })
    expect(result.missing).toContain('B2B SaaS')
    expect(result.resume.id).not.toBe(sampleResume.id)
    expect(result.missing).toContain('英语沟通')
    expect(result.resume.skills).not.toContain('B2B SaaS')
    expect([...result.resume.skills].sort()).toEqual(
      [...sampleResume.skills].sort(),
    )
  })
  it('从简历库检索更相关版本，平分时保留当前版本', () => {
    const engineer = {
      ...sampleResume,
      id: 'engineer',
      label: '工程师版本',
      summary: 'React TypeScript',
      skills: ['React', 'TypeScript'],
      experience: [],
    }
    expect(
      retrieveResume(sampleResume, [engineer], '要求 React TypeScript').id,
    ).toBe('engineer')
    expect(retrieveResume(sampleResume, [engineer], '没有可检索的词').id).toBe(
      sampleResume.id,
    )
    const result = demoAgent({
      intent: 'tailor',
      text: 'React TypeScript',
      resume: sampleResume,
      library: [engineer],
    })
    expect(result.resume.skills).toEqual(['React', 'TypeScript'])
    expect(result.changes[0]).toContain('工程师版本')
  })
  it('直接聊天能识别粘贴的简历与 JD', () => {
    expect(inferIntent('王明\n工程师\na@example.com', 'polish')).toBe('import')
    expect(
      inferIntent('我的简历：个人简介\n10 年后端开发经验，使用 Go。', 'polish'),
    ).toBe('import')
    expect(inferIntent('岗位职责：React 开发', 'polish')).toBe('tailor')
    expect(inferIntent('帮我润色', 'polish')).toBe('polish')
  })
  it('检索不会选择其他人的简历或残留示例身份', () => {
    const other = {
      ...sampleResume,
      id: 'other-person',
      name: '其他人',
      skills: ['React', 'TypeScript'],
    }
    expect(retrieveResume(sampleResume, [other], 'React TypeScript').id).toBe(
      sampleResume.id,
    )
    const differentEmail = {
      ...other,
      name: sampleResume.name,
      email: 'different@example.com',
    }
    expect(
      retrieveResume(sampleResume, [differentEmail], 'React TypeScript').id,
    ).toBe(sampleResume.id)
  })
  it('限制输入及检索规模', () => {
    expect(
      AgentRequestSchema.safeParse({
        intent: 'polish',
        text: 'x'.repeat(20001),
        resume: sampleResume,
      }).success,
    ).toBe(false)
    expect(
      AgentRequestSchema.safeParse({
        intent: 'tailor',
        text: 'JD',
        resume: sampleResume,
        library: Array(21).fill(sampleResume),
      }).success,
    ).toBe(false)
    expect(matchJD(sampleResume, 'Rust')).toEqual({ keywords: [], missing: [] })
  })
})

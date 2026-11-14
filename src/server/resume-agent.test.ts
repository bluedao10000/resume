import { describe, it, expect, vi } from 'vitest'
import { generateResume } from './resume-agent'
import { sampleResume, AgentRequestSchema } from '../domain/resume'
import { executeResumeTool } from './resume-tools'
import {
  testModelConfig as config,
  toolResponse,
  responsesToolResponse,
} from './pi-test-fixtures'
const input = {
  intent: 'polish' as const,
  text: '润色这份简历',
  resume: sampleResume,
}
const update = {
  resume: {
    ...sampleResume,
    id: 'model-id',
    label: '模型改名',
    template: 'minimal',
    summary: '更简洁的简介',
  },
  keywords: [],
  missing: [],
}
describe('pi-ai 简历工具执行', () => {
  it('Responses adapter 保留推理能力并真实执行函数工具', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(responsesToolResponse('resume_update', update))
    const result = await generateResume(
      input,
      {
        ...config,
        AI_API: 'openai-responses',
        AI_REASONING_EFFORT: 'low',
      },
      transport,
    )
    const [url, init] = transport.mock.calls[0]
    expect(String(url)).toBe('https://model.example/v1/responses')
    const payload = JSON.parse(String(init?.body))
    expect(payload.reasoning.effort).toBe('low')
    expect(payload.tool_choice).toBe('required')
    expect(payload.parallel_tool_calls).toBe(false)
    expect(payload).not.toHaveProperty('temperature')
    expect(result.resume.summary).toBe(update.resume.summary)
  })
  it('通过真实 pi adapter 调用模型，保留条目身份，确认消息来自实际变更', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(toolResponse('resume_update', update))
    const result = await generateResume(input, config, transport)
    const [url, init] = transport.mock.calls[0]
    expect(String(url)).toBe('https://model.example/v1/chat/completions')
    const payload = JSON.parse(String(init?.body))
    expect(payload).not.toHaveProperty('temperature')
    expect(
      payload.tools.map((t: { function: { name: string } }) => t.function.name),
    ).toContain('resume_reorder_sections')
    expect(result.resume).toMatchObject({
      id: sampleResume.id,
      label: sampleResume.label,
      template: sampleResume.template,
      summary: '更简洁的简介',
    })
    expect(result.message).toBe('已更新个人简介。')
    expect(result.operation).toMatchObject({
      status: 'applied',
      fields: ['summary'],
    })
    expect(sampleResume.summary).not.toBe(result.resume.summary)
  })
  it('章节工具真正修改顺序，不改写事实，重复执行返回无需修改', async () => {
    const transport = vi.fn<typeof fetch>().mockImplementation(async () =>
      toolResponse('resume_reorder_sections', {
        section: 'skills',
        relativeTo: 'experience',
        position: 'before',
      }),
    )
    const result = await generateResume(
      { ...input, text: '把专业技能移动到工作经历上方' },
      config,
      transport,
    )
    expect(result.resume.sectionOrder).toEqual([
      'summary',
      'skills',
      'experience',
      'education',
    ])
    expect(result.resume.experience).toEqual(sampleResume.experience)
    expect(result.resume.skills).toEqual(sampleResume.skills)
    expect(result.applied).toBe(true)
    const again = await generateResume(
      { ...input, resume: result.resume },
      config,
      transport,
    )
    expect(again.applied).toBe(false)
    expect(again.operation?.status).toBe('unchanged')
  })
  it('多轮历史实际传给 pi，当前输入只出现一次', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        toolResponse('conversation_reply', { message: '你希望突出架构经验。' }),
      )
    const result = await generateResume(
      {
        ...input,
        text: '我刚才希望突出什么？',
        history: [
          { role: 'user', content: '希望突出架构经验' },
          { role: 'assistant', content: '好的，保留真实经历。' },
        ],
      },
      config,
      transport,
    )
    const body = JSON.parse(String(transport.mock.calls[0][1]?.body))
    expect(body.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: 'user', content: '希望突出架构经验' }),
        expect.objectContaining({
          role: 'assistant',
          content: '好的，保留真实经历。',
        }),
      ]),
    )
    expect(JSON.stringify(body).match(/我刚才希望突出什么/g)).toHaveLength(1)
    expect(result.applied).toBe(false)
  })
  it('导入不发送示例事实或历史人物，导入与 JD 分配新 ID', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => toolResponse('resume_update', update))
    const imported = await generateResume(
      {
        ...input,
        intent: 'import',
        text: '王明\n工程师',
        requestId: 'import-turn',
        history: [{ role: 'user', content: '另一个人的秘密' }],
      },
      config,
      transport,
    )
    const body = String(transport.mock.calls[0][1]?.body)
    expect(body).not.toContain('林知夏')
    expect(body).not.toContain('山海科技')
    expect(body).not.toContain('另一个人的秘密')
    expect(imported.resume.id).toBe('import-turn')
    expect(imported.resume.isExample).toBe(false)
    const tailored = await generateResume(
      { ...input, intent: 'tailor', requestId: 'tailor-turn' },
      config,
      transport,
    )
    expect(tailored.resume.id).toBe('tailor-turn')
  })
  it('未知工具和重复章节无效，不得显示修改成功', () => {
    const request = AgentRequestSchema.parse(input)
    expect(() => executeResumeTool('shell', {}, request)).toThrow()
    expect(() =>
      executeResumeTool(
        'resume_reorder_sections',
        { section: 'skills', relativeTo: 'skills', position: 'before' },
        request,
      ),
    ).toThrow()
  })
  it('无实际变化不保存且不显示成功卡片', () => {
    const result = executeResumeTool(
      'resume_update',
      { resume: sampleResume },
      AgentRequestSchema.parse(input),
    )
    expect(result.applied).toBe(false)
    expect(result.changes).toEqual([])
  })
  it.each([400, 429])('供应商失败 %s 不暴露响应内容', async (status) => {
    const transport = vi
      .fn<typeof fetch>()
      .mockImplementation(async () =>
        Response.json(
          { error: { message: 'private supplier payload fixture-only' } },
          { status },
        ),
      )
    await expect(
      generateResume(input, config, transport),
    ).rejects.toMatchObject({
      code: status === 429 ? 'MODEL_LIMIT' : 'MODEL_REQUEST_FAILED',
      providerStatus: status,
    })
  })
  it('无效参数不提交修改', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        toolResponse('resume_reorder_sections', { section: 'unknown' }),
      )
    await expect(
      generateResume(input, config, transport),
    ).rejects.toMatchObject({ code: 'INVALID_TOOL_ARGUMENTS' })
  })
  it('无效工具仍记录供应商实际用量，预算拒绝发生在网络请求之前', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockImplementation(async () =>
        toolResponse('resume_reorder_sections', { section: 'unknown' }),
      )
    const onUsage = vi.fn()
    await expect(
      generateResume(input, config, transport, undefined, {
        onUsage,
        preparePayload: async (payload) => payload,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_TOOL_ARGUMENTS' })
    expect(onUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        input: 10,
        output: 10,
        cacheRead: 0,
        cacheWrite: 0,
      }),
    )
    transport.mockClear()
    await expect(
      generateResume(input, config, transport, undefined, {
        onUsage,
        preparePayload: async () => {
          throw new Error('budget rejected')
        },
      }),
    ).rejects.toThrow()
    expect(transport).not.toHaveBeenCalled()
  })
})

import '../../runtime'
import { z } from 'zod'
import { ImportLimitsSchema } from '../../../../src/domain/document-import'
import { extractMiniFile } from '../../document-import'
import { request } from '../../api'
import {
  demoAgent,
  ResumeSchema,
  type Resume,
} from '../../../../src/domain/resume'
import {
  MiniWorkspaceSchema,
  initialMiniWorkspace,
  miniRequest,
  applyMiniResult,
  type MiniWorkspace,
} from '../../../../src/domain/mini-workspace'
import {
  resumeTemplates,
  presentationFor,
  setResumePresentation,
  type Presentation,
} from '../../../../src/domain/resume-presentation'
import { documentView } from '../../presentation'
import { removeResume } from '../../../../src/domain/resume-library'

const authSchema = z.object({
  token: z.string(),
  user: z.object({ id: z.string() }),
  expiresAt: z.number(),
})
const configSchema = z.object({
  mode: z.enum(['demo', 'live']),
  runtime: z.enum(['pi-ai', 'pi-durable']),
  loginEnabled: z.boolean(),
  importLimits: ImportLimitsSchema.optional(),
})
type Auth = z.infer<typeof authSchema>
const id = () =>
  Date.now().toString(36) +
  '-' +
  Math.random().toString(36).slice(2) +
  Math.random().toString(36).slice(2)
let workspace: MiniWorkspace | null = null
let auth: Auth | null = null
let scope = ''
let epoch = 0
let timer: ReturnType<typeof setTimeout> | undefined
let undo: MiniWorkspace | null = null
let hidden = false
let importSequence = 0
let importTask: WechatMiniprogram.RequestTask | undefined
const key = () => 'folio:mini:v1:' + scope
const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : '操作失败，请重试。'
type InputEvent = WechatMiniprogram.CustomEvent<{ value: string }>

Page({
  data: {
    importOpen: false,
    importText: '',
    importBusy: false,
    importFileName: '',
    backupOpen: false,
    entered: false,
    demo: false,
    busy: false,
    loading: true,
    error: '',
    tab: 'chat',
    drawer: false,
    toolsOpen: false,
    composerFocus: false,
    input: '',
    intent: 'polish' as 'import' | 'polish' | 'tailor',
    intentName: '对话修改',
    resumes: [] as Resume[],
    selected: null as Resume | null,
    messages: [] as MiniWorkspace['messages'],
    pending: false,
    sections: [] as ReturnType<typeof documentView>['sections'],
    resumeCards: [] as ReturnType<typeof documentView>[],
    templateCards: [] as (ReturnType<typeof documentView> & {
      name: string
      description: string
      index: number
    })[],
    layoutFields: [
      {
        key: 'summary',
        label: '简介',
        values: ['plain', 'inset'],
        labels: ['正文', '重点块'],
      },
      {
        key: 'skills',
        label: '技能',
        values: ['tags', 'list', 'columns'],
        labels: ['标签', '逐项', '双列'],
      },
      {
        key: 'experience',
        label: '工作要点',
        values: ['bullets', 'ruled'],
        labels: ['项目符号', '分隔线'],
      },
      {
        key: 'density',
        label: '密度',
        values: ['comfortable', 'compact'],
        labels: ['舒适', '紧凑'],
      },
    ],
    layoutIndices: [0, 0, 0, 0],
    config: null as z.infer<typeof configSchema> | null,
    templates: resumeTemplates,
    templateIndex: 0,
    presentation: presentationFor({ template: 'editorial' }),
    canUndo: false,
    edit: null as Resume | null,
    scrollTarget: '',
  },
  async onLoad() {
    try {
      this.setData({
        config: configSchema.parse((await request('config')).data),
      })
      const saved: unknown = wx.getStorageSync('folio:mini:auth')
      if (saved && this.data.config?.mode === 'live') {
        const parsed = authSchema.safeParse(saved)
        if (parsed.success && parsed.data.expiresAt > Date.now()) {
          const session = await request(
            'session',
            'GET',
            undefined,
            parsed.data.token,
          )
          if (
            z.object({ user: z.object({ id: z.string() }) }).parse(session.data)
              .user.id !== parsed.data.user.id
          )
            throw new Error('登录状态异常，请重新登录。')
          auth = parsed.data
          this.enter('user:' + auth.user.id, false)
        }
      }
    } catch (error) {
      this.setData({ error: errorMessage(error) })
    } finally {
      this.setData({ loading: false })
    }
  },
  onHide() {
    hidden = true
    clearTimeout(timer)
  },
  onShow() {
    hidden = false
    if (workspace?.pending && this.data.entered && !this.data.busy)
      void this.resume()
  },
  onUnload() {
    importSequence++
    importTask?.abort()
    hidden = true
    epoch++
    clearTimeout(timer)
  },
  render() {
    if (!workspace) return
    const selected =
      workspace.resumes.find((r) => r.id === workspace!.selectedId) || null
    this.setData({
      resumes: workspace.resumes,
      selected,
      messages: workspace.messages,
      pending: !!workspace.pending,
      canUndo: !!undo,
      scrollTarget: 'message-' + (workspace.messages.length - 1),
      templateIndex: selected
        ? resumeTemplates.findIndex((t) => t.id === selected.template)
        : 0,
      presentation: presentationFor(selected || { template: 'editorial' }),
      sections: selected ? documentView(selected).sections : [],
      resumeCards: workspace.resumes.map(documentView),
      templateCards: selected
        ? resumeTemplates.map((t, index) => ({
            ...documentView({
              ...selected,
              template: t.id,
              presentation:
                t.id === selected.template ? selected.presentation : undefined,
            }),
            name: t.name,
            description: t.description,
            index,
          }))
        : [],
      layoutIndices: this.data.layoutFields.map((field) =>
        field.values.indexOf(
          presentationFor(selected || { template: 'editorial' })[
            field.key as keyof Presentation
          ],
        ),
      ),
    })
  },
  save(next: MiniWorkspace, preserveUndo = false) {
    const validated = MiniWorkspaceSchema.parse(next)
    // Persist first. A storage quota failure must never be reported as saved.
    try {
      wx.setStorageSync(key(), validated)
    } catch {
      throw new Error('本机保存失败，请释放存储空间后重试。原简历已保留。')
    }
    workspace = validated
    if (!preserveUndo) undo = null
    this.render()
  },
  enter(nextScope: string, demo: boolean) {
    epoch++
    importSequence++
    importTask?.abort()
    clearTimeout(timer)
    scope = nextScope
    undo = null
    const saved: unknown = wx.getStorageSync(key())
    workspace =
      saved === '' || saved === undefined
        ? initialMiniWorkspace(id(), demo)
        : MiniWorkspaceSchema.parse(saved)
    this.setData({
      importOpen: false,
      importText: '',
      importFileName: '',
      importBusy: false,
      backupOpen: false,
      entered: true,
      demo,
      tab: 'chat',
      error: '',
      busy: false,
      drawer: false,
    })
    this.render()
    if (workspace.pending) void this.resume()
  },
  demo() {
    try {
      this.enter('guest', true)
    } catch {
      this.setData({
        error: '本机数据无法读取，原数据已保留。请先备份或联系支持。',
      })
    }
  },
  async login() {
    if (this.data.busy) return
    this.setData({ busy: true, error: '' })
    try {
      const code = await new Promise<string>((resolve, reject) =>
        wx.login({
          success: (r) =>
            r.code
              ? resolve(r.code)
              : reject(new Error('未取得微信登录凭证。')),
          fail: () => reject(new Error('微信登录失败。')),
        }),
      )
      auth = authSchema.parse((await request('login', 'POST', { code })).data)
      wx.setStorageSync('folio:mini:auth', auth)
      this.enter('user:' + auth.user.id, false)
    } catch (error) {
      this.setData({ error: errorMessage(error) })
    } finally {
      this.setData({ busy: false })
    }
  },
  async retryConfig() {
    this.setData({ error: '', loading: true })
    await this.onLoad()
  },
  async logout() {
    this.closeImport()
    if (this.data.busy) return
    try {
      if (!this.data.demo && auth)
        await request('session', 'DELETE', undefined, auth.token)
      epoch++
      clearTimeout(timer)
      workspace = null
      undo = null
      auth = null
      scope = ''
      wx.removeStorageSync('folio:mini:auth')
      this.setData({
        entered: false,
        selected: null,
        resumes: [],
        messages: [],
        pending: false,
        edit: null,
        input: '',
        drawer: false,
        error: '',
      })
    } catch (error) {
      this.setData({ error: errorMessage(error) })
    }
  },
  input(event: InputEvent) {
    this.setData({ input: event.detail.value })
  },
  blurComposer() {
    this.setData({ composerFocus: false })
  },
  toggleTools() {
    this.setData({ toolsOpen: !this.data.toolsOpen })
  },
  openDrawer() {
    this.setData({ drawer: !this.data.drawer })
  },
  navigate(event: WechatMiniprogram.BaseEvent) {
    this.setData({
      tab: String(event.currentTarget.dataset.tab),
      toolsOpen: false,
      drawer: false,
    })
  },
  chooseIntent(event: WechatMiniprogram.BaseEvent) {
    const intent = event.currentTarget.dataset.intent as
      'import' | 'polish' | 'tailor'
    if (intent === 'import') {
      this.openImport()
      return
    }
    this.setData({
      intent,
      toolsOpen: false,
      composerFocus: true,
      input:
        intent === 'polish' && !this.data.input
          ? '帮我精简个人简介，保留真实经历。'
          : this.data.input,
      intentName: intent === 'tailor' ? '按 JD 定制' : '对话修改',
    })
  },
  openImport() {
    if (workspace?.pending) return
    this.setData({
      tab: 'chat',
      drawer: false,
      toolsOpen: false,
      importOpen: true,
      error: '',
    })
  },
  closeImport() {
    importSequence++
    importTask?.abort()
    importTask = undefined
    this.setData({ importOpen: false, importBusy: false })
  },
  inputImport(event: InputEvent) {
    this.setData({ importText: event.detail.value })
  },
  toggleBackup() {
    this.setData({ backupOpen: !this.data.backupOpen })
  },
  chooseDocument() {
    if (this.data.importBusy || workspace?.pending) return
    if (!auth || this.data.demo) {
      this.setData({ error: '文件导入需要微信登录；演示模式可粘贴文字试用。' })
      return
    }
    const limits = this.data.config?.importLimits
    if (!limits) {
      this.setData({ error: '文档导入配置尚未加载，请重新进入小程序。' })
      return
    }
    const generation = epoch,
      sequence = ++importSequence,
      token = auth.token
    const isCurrent = () =>
      generation === epoch &&
      sequence === importSequence &&
      this.data.importOpen
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['pdf', 'docx', 'doc'],
      success: async (result) => {
        if (!isCurrent()) return
        const file = result.tempFiles[0]
        if (!file) return
        const type = file.name.split('.').pop()?.toLowerCase() || ''
        if (!['pdf', 'docx'].includes(type)) {
          this.setData({
            error: '请选择 PDF 或 Word（DOCX）；旧版 DOC 请先另存为 DOCX。',
          })
          return
        }
        if (file.size > limits.maxFileBytes) {
          this.setData({
            error: `文件超过 ${Math.round(limits.maxFileBytes / 1048576)}MB，请压缩或拆分后重试。`,
          })
          return
        }
        this.setData({ importBusy: true, error: '' })
        try {
          const text = await extractMiniFile(
            file.path,
            type,
            token,
            limits.timeoutMs,
            (task) => {
              importTask = task
            },
            isCurrent,
          )
          if (isCurrent())
            this.setData({ importText: text, importFileName: file.name })
        } catch (error) {
          if (isCurrent()) this.setData({ error: errorMessage(error) })
        } finally {
          if (isCurrent()) {
            importTask = undefined
            this.setData({ importBusy: false })
          }
        }
      },
      fail: (error) => {
        if (isCurrent() && !/cancel/i.test(error.errMsg))
          this.setData({ error: '无法选择文件，请重试。' })
      },
    })
  },
  async confirmImport() {
    if (
      this.data.importBusy ||
      !this.data.importText.trim() ||
      workspace?.pending
    )
      return
    this.setData({
      intent: 'import',
      intentName: '导入简历',
      input: this.data.importText,
      tab: 'chat',
    })
    this.closeImport()
    await this.send()
    if (!this.data.error) this.setData({ importText: '', importFileName: '' })
  },
  async send() {
    if (
      !workspace ||
      this.data.busy ||
      workspace.pending ||
      !this.data.input.trim()
    )
      return
    try {
      const pending = miniRequest(
        workspace,
        this.data.intent,
        this.data.input.trim(),
        id(),
      )
      this.save({
        ...workspace,
        pending,
        messages: [
          ...workspace.messages,
          { role: 'user', content: pending.text },
        ],
      })
      this.setData({ input: '', error: '' })
      await this.resume()
    } catch (error) {
      this.setData({ error: errorMessage(error) })
    }
  },
  async resume() {
    if (!workspace?.pending || this.data.busy) return
    const generation = epoch,
      pending = workspace.pending,
      token = auth?.token || ''
    this.setData({ busy: true, error: '' })
    try {
      const response = this.data.demo
        ? { status: 200, data: demoAgent(pending, 'mini-' + pending.requestId) }
        : await request('agent', 'POST', pending, token)
      if (generation !== epoch) return
      if (response.status === 202) {
        this.setData({ busy: false })
        if (!hidden) timer = setTimeout(() => void this.poll(generation), 1000)
        return
      }
      this.save(
        applyMiniResult(
          workspace!,
          response.data as ReturnType<typeof demoAgent>,
        ),
      )
    } catch (error) {
      if (generation === epoch) this.setData({ error: errorMessage(error) })
    } finally {
      if (generation === epoch) this.setData({ busy: false })
    }
  },
  async poll(generation: number) {
    if (generation !== epoch || hidden || !workspace?.pending || this.data.busy)
      return
    this.setData({ busy: true })
    const pending = workspace.pending
    try {
      const response = await request(
        'agent?threadId=' +
          encodeURIComponent(pending.threadId!) +
          '&requestId=' +
          encodeURIComponent(pending.requestId!),
        'GET',
        undefined,
        auth?.token,
      )
      if (generation !== epoch) return
      const result = z
        .object({
          status: z.enum(['running', 'completed', 'failed', 'cancelled']),
          result: z.unknown().optional(),
          error: z.string().optional(),
        })
        .parse(response.data)
      if (result.status === 'running') {
        if (!hidden) timer = setTimeout(() => void this.poll(generation), 1500)
      } else if (result.status === 'completed')
        this.save(
          applyMiniResult(
            workspace!,
            result.result as ReturnType<typeof demoAgent>,
          ),
        )
      else {
        this.save({ ...workspace!, pending: null })
        this.setData({ error: result.error || '任务已停止，当前简历已保留。' })
      }
    } catch (error) {
      if (generation === epoch) this.setData({ error: errorMessage(error) })
    } finally {
      if (generation === epoch) this.setData({ busy: false })
    }
  },
  async cancel() {
    if (!workspace?.pending || this.data.busy) return
    const generation = epoch,
      pending = workspace.pending
    this.setData({ busy: true })
    try {
      if (!this.data.demo) {
        if (this.data.config?.runtime !== 'pi-durable')
          throw new Error('此任务不能远程停止。请恢复请求以查询结果。')
        await request(
          'agent?threadId=' +
            encodeURIComponent(pending.threadId!) +
            '&requestId=' +
            encodeURIComponent(pending.requestId!),
          'DELETE',
          undefined,
          auth?.token,
        )
      }
      if (generation !== epoch) return
      clearTimeout(timer)
      this.save({ ...workspace!, pending: null })
      this.setData({ error: '任务已停止。' })
    } catch (error) {
      this.setData({ error: errorMessage(error) })
    } finally {
      if (generation === epoch) this.setData({ busy: false })
    }
  },
  select(event: WechatMiniprogram.BaseEvent) {
    if (!workspace || workspace.pending) return
    try {
      this.save({
        ...workspace,
        selectedId: String(event.currentTarget.dataset.id),
      })
      this.setData({ tab: 'preview' })
    } catch (error) {
      this.setData({ error: errorMessage(error) })
    }
  },
  newChat() {
    if (!workspace || workspace.pending) return
    // Existing full conversation stays in an explicit local archive.
    try {
      if (workspace.messages.length)
        wx.setStorageSync(
          key() + ':chat:' + workspace.threadId,
          workspace.messages,
        )
      this.save({ ...workspace, messages: [], threadId: id() })
      this.setData({ tab: 'chat', drawer: false })
    } catch (error) {
      this.setData({ error: errorMessage(error) })
    }
  },
  history() {
    const generation = epoch
    if (!workspace || workspace.pending) return
    const prefix = key() + ':chat:'
    const keys = wx
      .getStorageInfoSync()
      .keys.filter((k) => k.startsWith(prefix))
      .reverse()
      .slice(0, 6)
    if (!keys.length) {
      this.setData({ error: '还没有历史对话。' })
      return
    }
    wx.showActionSheet({
      itemList: keys.map((_, i) => '历史对话 ' + (i + 1)),
      success: (result) => {
        try {
          if (generation !== epoch) return
          const selectedKey = keys[result.tapIndex]
          const messages = MiniWorkspaceSchema.shape.messages.parse(
            wx.getStorageSync(selectedKey),
          )
          if (workspace!.messages.length)
            wx.setStorageSync(
              key() + ':chat:' + workspace!.threadId,
              workspace!.messages,
            )
          this.save({
            ...workspace!,
            messages,
            threadId: selectedKey.slice(prefix.length),
          })
          this.setData({ tab: 'chat', drawer: false })
        } catch (error) {
          this.setData({ error: errorMessage(error) })
        }
      },
    })
  },
  remove(event: WechatMiniprogram.BaseEvent) {
    const generation = epoch
    if (!workspace || workspace.pending) return
    const target = workspace.resumes.find(
      (r) => r.id === event.currentTarget.dataset.id,
    )
    if (!target) return
    wx.showModal({
      title: '删除简历',
      content: '确定删除“' + target.label + '”？',
      cancelText: '取消',
      confirmText: '删除',
      confirmColor: '#a13830',
      success: (result) => {
        if (
          generation !== epoch ||
          !result.confirm ||
          !workspace ||
          workspace.pending
        )
          return
        try {
          const previous = workspace
          const removed = removeResume(
            workspace.resumes,
            target.id,
            workspace.selectedId,
          )
          this.save({ ...workspace, ...removed })
          undo = previous
          this.render()
        } catch (error) {
          this.setData({ error: errorMessage(error) })
        }
      },
    })
  },
  undo() {
    if (undo && !workspace?.pending)
      try {
        this.save(undo)
      } catch (error) {
        this.setData({ error: errorMessage(error) })
      }
  },
  chooseTemplate(event: WechatMiniprogram.BaseEvent) {
    this.template({
      detail: { value: String(event.currentTarget.dataset.index) },
    } as InputEvent)
  },
  layout(event: InputEvent) {
    if (!workspace || !this.data.selected || workspace.pending) return
    const field =
      this.data.layoutFields[Number(event.currentTarget.dataset.index)]
    const value = field?.values[Number(event.detail.value)]
    if (!field || !value) return
    try {
      const result = setResumePresentation(this.data.selected, {
        presentation: { [field.key]: value },
      })
      this.save({
        ...workspace,
        resumes: workspace.resumes.map((r) =>
          r.id === result.resume.id ? result.resume : r,
        ),
      })
    } catch (error) {
      this.setData({ error: errorMessage(error) })
    }
  },
  template(event: InputEvent) {
    if (!workspace || !this.data.selected || workspace.pending) return
    const template = resumeTemplates[Number(event.detail.value)].id
    if (template === this.data.selected.template) return
    try {
      this.save({
        ...workspace,
        resumes: workspace.resumes.map((r) =>
          r.id === workspace!.selectedId
            ? { ...r, template, presentation: undefined }
            : r,
        ),
      })
    } catch (error) {
      this.setData({ error: errorMessage(error) })
    }
  },
  edit() {
    if (this.data.selected && !workspace?.pending)
      this.setData({
        edit: JSON.parse(JSON.stringify(this.data.selected)) as Resume,
      })
  },
  editField(event: InputEvent) {
    const field = String(event.currentTarget.dataset.field)
    this.setData({
      ['edit.' + field]:
        field === 'skills'
          ? event.detail.value.split('、').filter(Boolean)
          : event.detail.value,
    })
  },
  editExperience(event: InputEvent) {
    const { index, field } = event.currentTarget.dataset
    this.setData({
      ['edit.experience.' + index + '.' + field]:
        field === 'bullets'
          ? event.detail.value.split('\n').filter(Boolean)
          : event.detail.value,
    })
  },
  dismissError() {
    this.setData({ error: '' })
  },
  addExperience() {
    if (!this.data.edit || this.data.edit.experience.length >= 15) return
    this.setData({
      'edit.experience': [
        ...this.data.edit.experience,
        { company: '', role: '', period: '', bullets: [] },
      ],
    })
  },
  deleteExperience(event: WechatMiniprogram.BaseEvent) {
    const generation = epoch,
      draft = this.data.edit,
      index = Number(event.currentTarget.dataset.index)
    wx.showModal({
      title: '删除工作经历',
      content: '确定从当前草稿移除这段经历？保存后生效。',
      confirmText: '删除',
      cancelText: '取消',
      success: (result) => {
        if (
          result.confirm &&
          generation === epoch &&
          draft &&
          this.data.edit === draft
        )
          this.setData({
            'edit.experience': draft.experience.filter((_, i) => i !== index),
          })
      },
    })
  },
  closeEdit() {
    this.setData({ edit: null })
  },
  saveEdit() {
    if (!workspace || !this.data.edit || workspace.pending) return
    try {
      const edited = ResumeSchema.parse({
        ...this.data.edit,
        isExample: false,
        updatedAt: new Date().toISOString().slice(0, 10),
      })
      this.save({
        ...workspace,
        resumes: workspace.resumes.map((r) =>
          r.id === edited.id ? edited : r,
        ),
      })
      this.closeEdit()
    } catch (error) {
      this.setData({ error: errorMessage(error) })
    }
  },
  exportJson() {
    if (!workspace) return
    const filePath = wx.env.USER_DATA_PATH + '/folio-resumes.json'
    wx.getFileSystemManager().writeFile({
      filePath,
      data: JSON.stringify(workspace.resumes, null, 2),
      encoding: 'utf8',
      success: () =>
        wx.shareFileMessage({
          filePath,
          fileName: 'folio-resumes.json',
          fail: () => this.setData({ error: '分享未完成，简历仍保存在本机。' }),
        }),
      fail: () => this.setData({ error: '备份文件写入失败。' }),
    })
  },
  importJson() {
    const generation = epoch
    if (!workspace || workspace.pending) return
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['json'],
      success: (result) => {
        const file = result.tempFiles[0]
        if (file.size > 1024 * 1024) {
          this.setData({ error: 'JSON 文件不能超过 1 MB。' })
          return
        }
        wx.getFileSystemManager().readFile({
          filePath: file.path,
          encoding: 'utf8',
          success: (result) => {
            try {
              const data = JSON.parse(String(result.data))
              const imported = z
                .array(ResumeSchema)
                .min(1)
                .max(100)
                .parse(Array.isArray(data) ? data : [data])
              wx.showModal({
                title: '导入备份',
                content:
                  '新增 ' +
                  imported.length +
                  ' 份简历，保留当前简历。请确认备份属于你。',
                success: (result) => {
                  if (
                    generation !== epoch ||
                    !result.confirm ||
                    !workspace ||
                    workspace.pending
                  )
                    return
                  try {
                    const copies = imported.map((r) => ({ ...r, id: id() }))
                    this.save({
                      ...workspace,
                      resumes: [...workspace.resumes, ...copies],
                      selectedId: copies[0].id,
                    })
                  } catch (error) {
                    this.setData({ error: errorMessage(error) })
                  }
                },
              })
            } catch {
              this.setData({ error: '备份格式无效，当前简历未修改。' })
            }
          },
          fail: () => this.setData({ error: '无法读取文件。' }),
        })
      },
    })
  },
})

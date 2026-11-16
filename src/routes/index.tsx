import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Button } from '@astryxdesign/core/Button'
import {
  ArrowDownToLine,
  ArrowRight,
  CreditCard,
  Check,
  ChevronDown,
  FilePlus2,
  FileText,
  FolderOpen,
  History,
  LayoutTemplate,
  MessageSquare,
  MoreHorizontal,
  Plus,
  Search,
  Sparkles,
  Trash2,
  UserRound,
  X,
} from 'lucide-react'
import { AgentChat, type Intent } from '../components/chat/AgentChat'
import { ResumeDocument } from '../components/resume/ResumeDocument'
import { ResumeLayoutControls } from '../components/resume/ResumeLayoutControls'
import {
  resumeTemplates,
  templateDefinition,
} from '../domain/resume-presentation'
import { ImportLimitsSchema, documentAccept } from '../domain/document-import'
import { Modal } from '../components/Modal'
import { ConfirmDelete } from '../components/ConfirmDelete'
import {
  LoginMethods,
  type SocialProvider,
  type SocialLogin,
} from '../components/LoginMethods'
import { LandingPage, landingFaq } from '../components/LandingPage'
import { BillingPanel } from '../components/BillingPanel'
import { AccountDetails } from '../components/AccountDetails'
import {
  emptyResume,
  isExampleResume,
  sampleJD,
  ResumeSchema,
  type Resume,
  type AgentResult,
} from '../domain/resume'
import { authClient } from '../lib/auth-client'
import {
  clearPendingEmailLogin,
  readPendingEmailLogin,
} from '../lib/email-login-state'
import { fetchSession } from '../server/session'
import { exportJSON, loadResumes, saveResumes } from '../lib/storage'
import {
  loadChats,
  saveChats,
  newChatThread,
  type ChatStore,
  type SavedChatMessage,
} from '../lib/chat-storage'
import {
  deduplicateResumes,
  removeResume,
  restoreResumeLibrary,
} from '../domain/resume-library'
const SITE_URL = 'https://www.codeiy.com'
const SITE_TITLE = 'AI 简历定制：按岗位 JD 修改简历并导出 PDF｜Folio'
const SITE_DESCRIPTION =
  '导进现有简历，贴上目标岗位描述（JD），用对话把匹配经历往前排、去掉空话套话。Folio 帮你保留原稿、单独生成投递版本，核对修改和待补充信息后即可导出 A4 PDF。支持 PDF、DOCX 导入，自带免费 AI 额度。'
const structuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebSite',
      name: 'Folio',
      alternateName: 'Folio AI 简历工具',
      url: `${SITE_URL}/`,
      inLanguage: 'zh-CN',
      description: SITE_DESCRIPTION,
    },
    {
      '@type': 'SoftwareApplication',
      name: 'Folio',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      url: `${SITE_URL}/`,
      inLanguage: 'zh-CN',
      description: SITE_DESCRIPTION,
      featureList: [
        '对话式简历整理',
        '按岗位描述定制简历',
        'PDF、DOCX、TXT、Markdown、JSON 导入',
        '简历模板与局部排版',
        '浏览器 A4 PDF 与 JSON 导出',
      ],
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'CNY' },
    },
    {
      '@type': 'FAQPage',
      mainEntity: landingFaq.map((item) => ({
        '@type': 'Question',
        name: item.question,
        acceptedAnswer: { '@type': 'Answer', text: item.answer },
      })),
    },
  ],
}
export const Route = createFileRoute('/')({
  component: Entry,
  loader: () => fetchSession(),
  head: () => ({
    meta: [
      { title: SITE_TITLE },
      { name: 'description', content: SITE_DESCRIPTION },
      { name: 'robots', content: 'index,follow,max-image-preview:large' },
      { property: 'og:type', content: 'website' },
      { property: 'og:site_name', content: 'Folio' },
      { property: 'og:locale', content: 'zh_CN' },
      { property: 'og:url', content: `${SITE_URL}/` },
      { property: 'og:title', content: SITE_TITLE },
      { property: 'og:description', content: SITE_DESCRIPTION },
      { property: 'og:image', content: `${SITE_URL}/og.png` },
      {
        property: 'og:image:alt',
        content: 'Folio：导入已有简历，按岗位定制，核对后导出 PDF',
      },
      { property: 'og:image:width', content: '1200' },
      { property: 'og:image:height', content: '630' },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: SITE_TITLE },
      { name: 'twitter:description', content: SITE_DESCRIPTION },
      { name: 'twitter:image', content: `${SITE_URL}/og.png` },
    ],
    links: [{ rel: 'canonical', href: `${SITE_URL}/` }],
    scripts: [
      {
        type: 'application/ld+json',
        children: JSON.stringify(structuredData),
      },
    ],
  }),
})
const ResumeEditor = lazy(() =>
  import('../components/resume/ResumeEditor').then((module) => ({
    default: module.ResumeEditor,
  })),
)
const RichTextEditor = lazy(() =>
  import('../components/resume/RichTextEditor').then((module) => ({
    default: module.RichTextEditor,
  })),
)
const ConfigSchema = z.object({
  mode: z.enum(['demo', 'live']),
  runtime: z.enum(['pi-ai', 'pi-durable']).default('pi-ai'),
  authMethods: z
    .object({
      market: z.boolean(),
      github: z.boolean(),
      email: z.boolean(),
    })
    .optional(),
  authConfigured: z.boolean(),
  market: z.enum(['cn', 'global']).default('global'),
  importLimits: ImportLimitsSchema.optional(),
})
type Config = z.infer<typeof ConfigSchema>
type Session = typeof authClient.$Infer.Session

function configuredSocialMethods(config: Config): SocialProvider[] {
  const methods: SocialProvider[] = []
  if (config.authMethods?.github) methods.push('github')
  if (config.authMethods?.market ?? config.authConfigured)
    methods.push(config.market === 'cn' ? 'wechat' : 'google')
  return methods
}

function Entry() {
  const initialSession = Route.useLoaderData()
  const { data: liveSession, isPending } = authClient.useSession()
  // SSR resolves the cookie session, so signed-in users never see the landing
  // page first; useSession takes over once loaded for sign-in/out updates.
  const session = isPending ? initialSession : liveSession
  const [config, setConfig] = useState<Config | null>(null)
  const [configError, setConfigError] = useState(false)
  const [demoOpen, setDemoOpen] = useState(false)
  const [loginOpen, setLoginOpen] = useState(false)
  const [loginBusy, setLoginBusy] = useState<SocialProvider | null>(null)
  const [loginError, setLoginError] = useState('')
  useEffect(() => {
    if (readPendingEmailLogin()) setLoginOpen(true)
    const url = new URL(window.location.href)
    if (url.searchParams.has('loginFailed')) {
      setLoginOpen(true)
      const error = url.searchParams.get('error')
      setLoginError(
        error === 'account_not_linked' ||
          error === 'github_verified_email_required'
          ? '请使用原邮箱登录，或先在 GitHub 验证同一邮箱后重试。'
          : '登录未完成，请重试或选择其他方式。',
      )
      url.searchParams.delete('loginFailed')
      url.searchParams.delete('error')
      url.searchParams.delete('error_description')
      window.history.replaceState(window.history.state, '', url)
    }
    const controller = new AbortController()
    fetch('/api/config', { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('config')
        return response.json()
      })
      .then((value) => setConfig(ConfigSchema.parse(value)))
      .catch(() => {
        if (!controller.signal.aborted) setConfigError(true)
      })
    try {
      setDemoOpen(sessionStorage.getItem('folio:demo-open') === 'true')
    } catch {
      /* Demo remains available without sessionStorage. */
    }
    return () => controller.abort()
  }, [])
  const login: SocialLogin = async (provider, signal) => {
    if (loginBusy) return
    setLoginBusy(provider)
    setLoginError('')
    try {
      const response = await authClient.signIn.social(
        {
          provider,
          ...(provider !== 'google' && { errorCallbackURL: '/?loginFailed=1' }),
          callbackURL: provider === 'github' ? '/auth/callback' : '/',
          ...(signal && { disableRedirect: true }),
        },
        { signal },
      )
      if (signal?.aborted) return
      if (signal && response.data?.url) return response.data.url
      if (response.error || signal)
        setLoginError(response.error?.message ?? '登录失败，请重试。')
    } catch {
      if (!signal?.aborted) setLoginError('无法连接登录服务，请重试。')
    } finally {
      setLoginBusy(null)
    }
  }
  useEffect(() => {
    if (session) clearPendingEmailLogin()
  }, [session])
  async function signOut() {
    const response = await authClient.signOut()
    if (response.error)
      throw new Error(response.error.message ?? '退出失败，请重试。')
    setDemoOpen(false)
    try {
      sessionStorage.removeItem('folio:demo-open')
    } catch {
      /* Optional. */
    }
  }
  if (configError)
    return (
      <main className="entry-loading" role="alert">
        <p>暂时无法加载</p>
        <button
          className="outline-button"
          onClick={() => window.location.reload()}
        >
          重试
        </button>
      </main>
    )
  // Signed-in visitors wait on the config fetch with a neutral loader; the
  // landing page stays reserved for visitors who are actually signed out.
  if (!config && session)
    return (
      <main className="entry-loading" role="status" aria-label="正在加载">
        folio
      </main>
    )
  if (!config)
    return (
      <LandingPage
        ready={false}
        canLogin={false}
        isLoading={!!loginBusy}
        error={loginError}
        onLogin={() => void login('google')}
      />
    )
  const social = configuredSocialMethods(config)
  const email = config.authMethods?.email ?? false
  const usesLoginDialog =
    config.market === 'cn' || email || social.includes('github')
  if (!session && !(config.mode === 'demo' && demoOpen))
    return (
      <>
        <LandingPage
          ready
          opensLoginDialog={usesLoginDialog}
          canLogin={email || social.length > 0}
          isLoading={!usesLoginDialog && !!loginBusy}
          error={usesLoginDialog ? '' : loginError}
          onLogin={() => {
            if (usesLoginDialog) setLoginOpen(true)
            else void login('google')
          }}
          onDemo={
            config.mode === 'demo'
              ? () => {
                  setDemoOpen(true)
                  try {
                    sessionStorage.setItem('folio:demo-open', 'true')
                  } catch {
                    /* Optional. */
                  }
                }
              : undefined
          }
        />
        {loginOpen && usesLoginDialog ? (
          <Modal
            title="登录 Folio"
            className={config.market === 'cn' ? 'login-dialog' : undefined}
            onClose={() => {
              clearPendingEmailLogin()
              setLoginOpen(false)
            }}
          >
            <LoginMethods
              social={social}
              email={email}
              busy={loginBusy}
              error={loginError}
              onLogin={login}
              china={config.market === 'cn'}
            />
          </Modal>
        ) : null}
      </>
    )
  return (
    <Workspace
      key={session?.user.id ?? 'guest'}
      session={session}
      config={config}
      onLogin={login}
      onSignOut={signOut}
      loginBusy={loginBusy}
      loginError={loginError}
    />
  )
}

type View = 'chat' | 'library' | 'templates'
function Workspace({
  session,
  config,
  onLogin,
  onSignOut,
  loginBusy,
  loginError,
}: {
  session: Session | null
  config: Config
  onLogin: SocialLogin
  onSignOut: () => Promise<void>
  loginBusy: SocialProvider | null
  loginError: string
}) {
  const [resumes, setResumes] = useState<Resume[]>([])
  const [selected, setSelected] = useState('')
  const [ready, setReady] = useState(false)
  const [loadedScope, setLoadedScope] = useState<string | null>(null)
  const [storageFailure, setStorageFailure] = useState(false)
  const [view, setView] = useState<View>('chat')
  const [mobile, setMobile] = useState<'chat' | 'preview'>('chat')
  const [panel, setPanel] = useState<'preview' | 'edit'>('preview')
  const [modal, setModal] = useState<
    'import' | 'jd' | 'export' | 'login' | 'history' | 'billing' | null
  >(null)
  const [text, setText] = useState('')
  const [importing, setImporting] = useState(false)
  const importController = useRef<AbortController | null>(null)
  useEffect(() => () => importController.current?.abort(), [])
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has('billing'))
      setModal('billing')
  }, [])
  const [notice, setNotice] = useState('')
  const [search, setSearch] = useState('')
  const [intent, setIntent] = useState<Intent>('polish')
  const [command, setCommand] = useState<{ id: number; text: string } | null>(
    null,
  )
  const [busy, setBusy] = useState(false)
  const [deleteRequest, setDeleteRequest] = useState<
    { kind: 'resume'; id: string } | { kind: 'duplicates' } | null
  >(null)
  const [chatKey, setChatKey] = useState(0)
  const [chats, setChats] = useState<ChatStore | null>(null)
  const [chatStorageFailure, setChatStorageFailure] = useState(false)
  const [libraryBackup, setLibraryBackup] = useState<{
    kind: 'cleanup' | 'delete'
    scope: string
    before: Resume[]
    after: Resume[]
    selectedBefore: string
  } | null>(null)
  const accountName = session?.user.name.trim()
  const scope = session?.user.id ?? 'guest'
  const scopeRef = useRef<string | null>(null)
  const resume =
    resumes.find((r) => r.id === selected) ?? resumes[0] ?? emptyResume
  const hasResume = resumes.length > 0
  const activeThread = chats?.threads.find(
    (thread) => thread.id === chats.activeId,
  )
  const result =
    activeThread?.result?.resume.id === resume.id ? activeThread.result : null
  const deleteTarget =
    deleteRequest?.kind === 'resume'
      ? resumes.find((item) => item.id === deleteRequest.id)
      : undefined
  const uniqueResumes = useMemo(
    () => deduplicateResumes(resumes, selected),
    [resumes, selected],
  )
  const duplicateCount = resumes.length - uniqueResumes.length
  const canUndoLibraryChange =
    libraryBackup?.scope === scope && libraryBackup.after === resumes
  const undoLabel = libraryBackup?.kind === 'delete' ? '撤销删除' : '撤销清理'
  const consumeCommand = useCallback((id: number) => {
    setCommand((pending) => (pending?.id === id ? null : pending))
  }, [])
  useEffect(() => {
    setReady(false)
    scopeRef.current = scope
    setBusy(false)
    setResumes([])
    setSelected('')
    try {
      const saved = restoreResumeLibrary(loadResumes(scope))
      setResumes(saved)
      let chatStore: ChatStore | null = null
      try {
        chatStore = loadChats(scope)
        setChatStorageFailure(false)
      } catch {
        setChatStorageFailure(true)
        setNotice('无法读取历史对话，原始记录已保留；当前对话暂不保存。')
      }
      const active = chatStore?.threads.find(
        (thread) => thread.id === chatStore?.activeId,
      )
      const selectedId =
        saved.find((r) => r.id === active?.resumeId)?.id ?? saved[0]?.id ?? ''
      if (
        !active ||
        (active.resumeId && !saved.some((r) => r.id === active.resumeId))
      ) {
        const thread = newChatThread(selectedId || null)
        chatStore = {
          activeId: thread.id,
          threads: [thread, ...(chatStore?.threads ?? [])],
        }
      }
      setChats(chatStore)
      setSelected(selectedId)
      setIntent(saved.length ? 'polish' : 'import')
      setStorageFailure(false)
    } catch (e) {
      setStorageFailure(true)
      setNotice(
        e instanceof Error ? e.message : '无法读取本机存储，请导出备份。',
      )
    }
    setCommand(null)
    setLibraryBackup(null)
    setChatKey((n) => n + 1)
    setLoadedScope(scope)
    setReady(true)
  }, [scope])
  useEffect(() => {
    function syncLibrary(event: StorageEvent) {
      if (
        event.storageArea !== localStorage ||
        (event.key !== null && event.key !== `folio:resumes:v1:${scope}`)
      )
        return
      try {
        const saved = restoreResumeLibrary(loadResumes(scope) ?? [])
        setResumes(saved)
        setChats((store) => {
          if (!store) return store
          const active = store.threads.find(
            (thread) => thread.id === store.activeId,
          )
          if (!active?.resumeId || saved.some((r) => r.id === active.resumeId))
            return store
          const next =
            store.threads.find((thread) => thread.resumeId === saved[0]?.id) ??
            newChatThread(saved[0]?.id ?? null)
          return {
            activeId: next.id,
            threads: store.threads.some((t) => t.id === next.id)
              ? store.threads
              : [next, ...store.threads],
          }
        })
        setSelected((id) =>
          saved.some((r) => r.id === id) ? id : (saved[0]?.id ?? ''),
        )
        setIntent(saved.length ? 'polish' : 'import')
        setLibraryBackup(null)
        setDeleteRequest(null)
        setCommand(null)
        setBusy(false)
        setChatKey((n) => n + 1)
        setPanel('preview')
        setStorageFailure(false)
      } catch {
        setStorageFailure(true)
        setNotice('无法读取其他标签页的更改，请导出备份后刷新。')
      }
    }
    window.addEventListener('storage', syncLibrary)
    return () => window.removeEventListener('storage', syncLibrary)
  }, [scope])
  useEffect(() => {
    if (ready && loadedScope === scope && !storageFailure)
      try {
        saveResumes(scope, resumes)
      } catch {
        setNotice('本机存储不可用，请立即导出 JSON 备份。')
        setStorageFailure(true)
      }
  }, [resumes, ready, scope, loadedScope, storageFailure])
  useEffect(() => {
    if (!ready || loadedScope !== scope || !chats || chatStorageFailure) return
    try {
      saveChats(scope, chats)
    } catch {
      setChatStorageFailure(true)
      setNotice('历史对话未能保存，请保留当前页面并检查浏览器存储空间。')
    }
  }, [chats, ready, loadedScope, scope, chatStorageFailure])
  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(''), 6500)
    return () => clearTimeout(timer)
  }, [notice])
  function update(r: Resume, editedContent = false) {
    setResumes((items) =>
      items.map((item) =>
        item.id === resume.id
          ? {
              ...r,
              ...(editedContent && isExampleResume(item)
                ? {
                    isExample: false,
                    label: item.label === '示例简历' ? '我的简历' : r.label,
                  }
                : {}),
              updatedAt: new Date().toISOString().slice(0, 10),
            }
          : item,
      ),
    )
  }
  function onResult(r: AgentResult) {
    if (scopeRef.current !== scope) return
    if (!r.applied) {
      setIntent(hasResume ? 'polish' : 'import')
      setChats((store) =>
        store
          ? {
              ...store,
              threads: store.threads.map((thread) =>
                thread.id === store.activeId
                  ? { ...thread, result: null }
                  : thread,
              ),
            }
          : store,
      )
      return
    }
    setResumes((items) =>
      items.some((item) => item.id === r.resume.id)
        ? items.map((item) => (item.id === r.resume.id ? r.resume : item))
        : [r.resume, ...items],
    )
    setSelected(r.resume.id)
    setIntent('polish')
    setPanel('preview')
    setChats((store) =>
      store
        ? {
            ...store,
            threads: store.threads.map((thread) =>
              thread.id === store.activeId
                ? {
                    ...thread,
                    resumeId: r.resume.id,
                    result: r,
                    updatedAt: new Date().toISOString(),
                  }
                : thread,
            ),
          }
        : store,
    )
  }
  function onMessages(messages: SavedChatMessage[], running: boolean) {
    setChats((store) =>
      store
        ? {
            ...store,
            threads: store.threads.map((thread) =>
              thread.id === store.activeId
                ? {
                    ...thread,
                    messages,
                    title:
                      messages
                        .find((m) => m.role === 'user')
                        ?.content.slice(0, 40) || thread.title,
                    pendingRequest: running ? thread.pendingRequest : null,
                    updatedAt: new Date().toISOString(),
                  }
                : thread,
            ),
          }
        : store,
    )
  }
  function activateChat(resumeId: string | null, threadId?: string) {
    if (busy) return
    const existing = threadId
      ? chats?.threads.find((thread) => thread.id === threadId)
      : chats?.threads.find((thread) => thread.resumeId === resumeId)
    const thread = existing ?? newChatThread(resumeId)
    setChats((store) => ({
      activeId: thread.id,
      threads: existing ? store!.threads : [thread, ...(store?.threads ?? [])],
    }))
    setCommand(null)
    setChatKey((key) => key + 1)
  }
  function run(next: Intent, input: string) {
    if (busy) return
    if (!hasResume && next !== 'import') {
      setNotice('请先导入你的经历，再润色或按岗位定制。')
      open('import')
      return
    }
    setIntent(next)
    setCommand({ id: Date.now(), text: input })
    setView('chat')
    setModal(null)
    setMobile('chat')
  }
  function open(next: 'import' | 'jd') {
    if (busy) {
      setNotice('请等待当前任务完成，或先停止生成。')
      return
    }
    setText('')
    if (next === 'jd' && !hasResume) {
      setNotice('请先创建一份简历，再根据岗位定制。')
      setModal('import')
    } else setModal(next)
  }
  function select(id: string) {
    if (busy) {
      setNotice('请先等待或停止当前生成。')
      return
    }
    const r = resumes.find((item) => item.id === id)
    if (!r) return
    setSelected(r.id)
    activateChat(r.id)
    setCommand(null)
    setIntent('polish')
    setView('chat')
    setPanel('preview')
    setMobile('preview')
  }
  function cleanDuplicates() {
    if (busy || !ready || loadedScope !== scope || storageFailure) return
    if (!duplicateCount) return
    setDeleteRequest(null)
    setLibraryBackup({
      kind: 'cleanup',
      scope,
      before: resumes,
      after: uniqueResumes,
      selectedBefore: selected,
    })
    setResumes(uniqueResumes)
    setNotice(`已清理 ${duplicateCount} 份重复副本。`)
  }
  function deleteResume(id: string) {
    if (busy || !ready || loadedScope !== scope || storageFailure) return
    const target = resumes.find((item) => item.id === id)
    if (!target) return
    setDeleteRequest(null)
    const remaining = removeResume(resumes, id, selected)
    setLibraryBackup({
      kind: 'delete',
      scope,
      before: resumes,
      after: remaining.resumes,
      selectedBefore: selected,
    })
    setResumes(remaining.resumes)
    setSelected(remaining.selectedId)
    setCommand(null)
    if (id === resume.id) {
      activateChat(remaining.selectedId || null)
    }
    setIntent(remaining.resumes.length ? 'polish' : 'import')
    setPanel('preview')
    setNotice(`已删除“${target.label || target.name}”。`)
  }
  function undoLibraryChange() {
    if (busy || !canUndoLibraryChange || !libraryBackup) return
    setResumes(libraryBackup.before)
    setSelected(libraryBackup.selectedBefore)
    setIntent(libraryBackup.before.length ? 'polish' : 'import')
    setLibraryBackup(null)
    setCommand(null)
    setNotice(`已${undoLabel}。`)
  }
  async function importFile(file?: File) {
    if (!file) return
    importController.current?.abort()
    const controller = new AbortController()
    importController.current = controller
    setImporting(true)
    try {
      if (!config.importLimits)
        throw new Error('文档导入配置未加载，请刷新后重试。')
      const { extractDocument } = await import('../lib/document-import')
      const value = await extractDocument(
        file,
        config.importLimits,
        controller.signal,
      )
      if (controller.signal.aborted) return
      if (file.name.toLowerCase().endsWith('.json')) {
        const parsed = ResumeSchema.safeParse(JSON.parse(value))
        if (!parsed.success) throw new Error('JSON 需要符合 Folio 简历结构。')
        const r = { ...parsed.data, id: crypto.randomUUID() }
        setResumes((items) => [r, ...items])
        setSelected(r.id)
        activateChat(r.id)
        setIntent('polish')
        setCommand(null)
        setPanel('preview')
        setModal(null)
        setNotice('简历 JSON 已导入。')
      } else {
        setText(value)
      }
    } catch (e) {
      if (!controller.signal.aborted)
        setNotice(e instanceof Error ? e.message : '文件读取失败')
    } finally {
      if (importController.current === controller) setImporting(false)
    }
  }
  return (
    <div className="app-shell" data-ready={ready} aria-busy={!ready}>
      <aside className="sidebar">
        <a
          className="wordmark workspace-brand"
          href="/"
          aria-label="Folio 首页"
        >
          folio
        </a>
        <button
          className="new-conversation"
          disabled={busy}
          onClick={() => {
            const thread = newChatThread(hasResume ? resume.id : null)
            setChats((store) => ({
              activeId: thread.id,
              threads: [thread, ...(store?.threads ?? [])],
            }))
            setChatKey((k) => k + 1)
            setCommand(null)
            setIntent(hasResume ? 'polish' : 'import')
            setView('chat')
            setMobile('chat')
          }}
        >
          <Plus size={17} />
          开启新对话
        </button>
        <nav aria-label="主导航">
          <button
            className={`chat-nav ${view === 'chat' ? 'active' : ''} ${mobile === 'preview' ? 'preview-selected' : ''}`}
            onClick={() => {
              setView('chat')
              setMobile('chat')
            }}
          >
            <MessageSquare size={17} />
            简历 Agent
          </button>
          <button
            className={`mobile-preview-nav ${view === 'chat' && mobile === 'preview' ? 'active' : ''}`}
            onClick={() => {
              setView('chat')
              setMobile('preview')
            }}
            aria-label="简历预览"
            title="简历预览"
          >
            <FileText size={17} />
            简历预览
          </button>
          <button
            className={view === 'library' ? 'active' : ''}
            disabled={busy}
            onClick={() => setView('library')}
          >
            <FolderOpen size={17} />
            我的简历库<span className="nav-count">{resumes.length}</span>
          </button>
          <button
            className={view === 'templates' ? 'active' : ''}
            disabled={busy}
            onClick={() => setView('templates')}
          >
            <LayoutTemplate size={17} />
            简历模板
          </button>
          <button onClick={() => setModal('history')} aria-label="历史对话">
            <History size={17} />
            历史对话
          </button>
          <button onClick={() => setModal('billing')}>
            <CreditCard size={17} />
            套餐与用量
          </button>
        </nav>
        <div className="nav-group-label recent-label">
          最近的简历
          <button
            className="icon-button"
            onClick={() => open('import')}
            aria-label="添加简历"
          >
            <Plus size={14} />
          </button>
        </div>
        <div className="recent-list">
          {resumes.slice(0, 5).map((r) => (
            <button
              key={r.id}
              className={r.id === resume.id ? 'selected' : ''}
              onClick={() => select(r.id)}
            >
              <FileText size={15} />
              <span>{r.label}</span>
              {isExampleResume(r) && r.label !== '示例简历' ? (
                <small className="example-badge">示例简历</small>
              ) : null}
              {r.id === resume.id ? <span className="selected-dot" /> : null}
            </button>
          ))}
        </div>
        <div className="sidebar-bottom">
          {config.mode === 'demo' ? (
            <span className="demo-badge">演示模式</span>
          ) : null}
          <button
            className="user-menu"
            aria-label={session ? '账户设置' : '登录工作空间'}
            onClick={() => setModal('login')}
          >
            <span className="user-avatar" aria-hidden="true">
              {accountName ? (
                Array.from(accountName)[0]
              ) : (
                <UserRound size={15} />
              )}
            </span>
            <span>{session ? accountName || '我的账户' : '访客工作空间'}</span>
            <MoreHorizontal size={18} />
          </button>
        </div>
      </aside>
      <main className="main-shell">
        {view === 'chat' ? (
          <div className={`workspace mobile-${mobile}`}>
            <section className="chat-panel">
              {ready && activeThread ? (
                <AgentChat
                  key={`${activeThread.id}:${chatKey}`}
                  thread={activeThread}
                  runtimeMode={config.runtime}
                  onMessages={onMessages}
                  onRequest={(pendingRequest) =>
                    setChats((store) =>
                      store
                        ? {
                            ...store,
                            threads: store.threads.map((thread) =>
                              thread.id === store.activeId
                                ? { ...thread, pendingRequest }
                                : thread,
                            ),
                          }
                        : store,
                    )
                  }
                  resume={resume}
                  hasResume={hasResume}
                  busy={busy}
                  library={resumes}
                  intent={intent}
                  onResult={onResult}
                  onImport={() => open('import')}
                  onJD={() => open('jd')}
                  onPolish={() =>
                    run(
                      'polish',
                      '帮我润色这份简历，保留真实经历，去掉空话套话，把做过的事写得更具体。',
                    )
                  }
                  onBusy={setBusy}
                  result={result}
                  command={command}
                  onCommandConsumed={consumeCommand}
                />
              ) : null}
            </section>
            <section className="preview-panel">
              <div className="preview-toolbar">
                <div>
                  <FileText size={16} />
                  <strong>{hasResume ? resume.label : '简历'}</strong>
                  {hasResume &&
                  isExampleResume(resume) &&
                  resume.label !== '示例简历' ? (
                    <span className="example-badge">示例简历</span>
                  ) : null}
                </div>
                <div className="preview-document-actions">
                  <button
                    className="icon-button delete-button"
                    disabled={!hasResume || busy || !ready || storageFailure}
                    onClick={() =>
                      setDeleteRequest({ kind: 'resume', id: resume.id })
                    }
                    aria-label="删除当前简历"
                    title="删除当前简历"
                  >
                    <Trash2 size={17} />
                  </button>
                  <button
                    className="icon-button"
                    disabled={!hasResume}
                    onClick={() => setModal('export')}
                    aria-label="导出简历"
                  >
                    <ArrowDownToLine size={17} />
                  </button>
                </div>
              </div>
              {hasResume ? (
                <div className="preview-options">
                  <div className="segmented">
                    <button
                      className={panel === 'preview' ? 'active' : ''}
                      onClick={() => setPanel('preview')}
                    >
                      预览
                    </button>
                    <button
                      className={panel === 'edit' ? 'active' : ''}
                      disabled={busy}
                      onClick={() => setPanel('edit')}
                    >
                      编辑内容
                    </button>
                  </div>
                  <button
                    className="template-choice"
                    onClick={() => setView('templates')}
                  >
                    <LayoutTemplate size={13} />
                    {templateDefinition(resume.template).name}
                    <ChevronDown size={12} />
                  </button>
                </div>
              ) : null}
              <div className="preview-scroll">
                {!hasResume ? (
                  <div className="empty">
                    <FilePlus2 size={30} />
                    <h2>还没有简历</h2>
                    <button
                      className="text-button"
                      onClick={() => open('import')}
                    >
                      导入简历
                    </button>
                  </div>
                ) : panel === 'preview' ? (
                  <>
                    <ResumeDocument resume={resume} />
                  </>
                ) : (
                  <Suspense fallback={<p role="status">正在加载编辑器…</p>}>
                    <ResumeEditor
                      key={resume.id}
                      resume={resume}
                      onChange={(value) => update(value, true)}
                    />
                  </Suspense>
                )}
              </div>
              <div className="preview-status">
                <span>
                  <Check size={12} />
                  {!ready
                    ? '正在读取本机数据'
                    : storageFailure
                      ? '未能自动保存，请导出备份'
                      : !hasResume
                        ? '简历库为空'
                        : '已保存'}
                </span>
                <button
                  disabled={!hasResume}
                  onClick={() => setModal('export')}
                >
                  导出简历
                  <ArrowDownToLine size={12} />
                </button>
              </div>
            </section>
          </div>
        ) : (
          <section className="collection-page">
            <h1>{view === 'library' ? '简历库' : '模板'}</h1>
            {view === 'library' ? (
              <>
                <div className="collection-actions">
                  <label className="search-field">
                    <Search size={16} />
                    <input
                      placeholder="搜索姓名、职位或版本…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </label>
                  {duplicateCount > 0 ? (
                    <button
                      className="text-button"
                      disabled={busy || !ready || storageFailure}
                      title="只合并正文、版本名称和模板完全相同的副本，保留当前选中的一份。"
                      onClick={() => setDeleteRequest({ kind: 'duplicates' })}
                    >
                      清理 {duplicateCount} 份重复副本
                    </button>
                  ) : null}
                  {canUndoLibraryChange ? (
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={undoLibraryChange}
                    >
                      {undoLabel}
                    </button>
                  ) : null}
                  <Button
                    label="导入简历"
                    variant="primary"
                    icon={<Plus size={16} />}
                    onClick={() => open('import')}
                  />
                </div>
                <div className="resume-grid">
                  {resumes
                    .filter((r) =>
                      `${r.label}${r.name}${r.title}`
                        .toLowerCase()
                        .includes(search.toLowerCase()),
                    )
                    .map((r) => (
                      <div className="resume-library-item" key={r.id}>
                        <button
                          className="resume-library-card"
                          onClick={() => select(r.id)}
                        >
                          <div className="mini-preview">
                            <ResumeDocument resume={r} />
                          </div>
                          <div className="library-card-caption">
                            <strong>{r.label}</strong>
                            <span>
                              {r.name} · {r.updatedAt}
                            </span>
                            <ArrowRight size={17} />
                          </div>
                        </button>
                        <div className="library-card-actions">
                          {isExampleResume(r) ? (
                            <span className="example-badge">示例简历</span>
                          ) : (
                            <span />
                          )}
                          <button
                            className="text-button delete-button"
                            disabled={busy || !ready || storageFailure}
                            onClick={() =>
                              setDeleteRequest({ kind: 'resume', id: r.id })
                            }
                            aria-label={`删除简历：${r.label}（${r.name}）`}
                          >
                            <Trash2 size={14} />
                            删除
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
                {!resumes.some((r) =>
                  `${r.label}${r.name}${r.title}`
                    .toLowerCase()
                    .includes(search.toLowerCase()),
                ) ? (
                  <div className="empty">
                    <Search size={30} />
                    <h2>{hasResume ? '没有找到这份简历' : '还没有简历'}</h2>
                  </div>
                ) : null}
              </>
            ) : !hasResume ? (
              <div className="empty">
                <FilePlus2 size={30} />
                <h2>先创建一份简历</h2>
                <button className="text-button" onClick={() => open('import')}>
                  导入简历
                </button>
              </div>
            ) : (
              <div className="template-workspace">
                <ResumeLayoutControls
                  resume={resume}
                  disabled={busy}
                  onChange={update}
                  onPreview={() => {
                    setView('chat')
                    setPanel('preview')
                    setMobile('preview')
                  }}
                />
                <div className="template-grid">
                  {resumeTemplates.map(
                    ({ id: t, name, description }, index) => (
                      <button
                        className={`template-card ${resume.template === t ? 'chosen' : ''}`}
                        key={t}
                        aria-pressed={resume.template === t}
                        disabled={busy}
                        onClick={() => {
                          update({
                            ...resume,
                            template: t,
                            presentation:
                              resume.template === t
                                ? resume.presentation
                                : undefined,
                          })
                          setView('chat')
                          setPanel('preview')
                          setMobile('preview')
                          setNotice('简历模板已切换。')
                        }}
                      >
                        <div className="mini-preview" aria-hidden="true">
                          <ResumeDocument
                            resume={{
                              ...resume,
                              template: t,
                              presentation:
                                resume.template === t
                                  ? resume.presentation
                                  : undefined,
                            }}
                          />
                        </div>
                        <div>
                          <strong>
                            {String(index + 1).padStart(2, '0')} / {name}
                          </strong>
                          <p>{description}</p>
                          <span>
                            {resume.template === t ? '当前使用' : '使用此模板'}
                            <ArrowRight size={15} />
                          </span>
                        </div>
                      </button>
                    ),
                  )}
                </div>
              </div>
            )}
          </section>
        )}
      </main>
      {deleteTarget ? (
        <ConfirmDelete
          title="删除这份简历？"
          name={`${deleteTarget.label} · ${deleteTarget.name}`}
          onCancel={() => setDeleteRequest(null)}
          onConfirm={() => deleteResume(deleteTarget.id)}
        />
      ) : null}
      {deleteRequest?.kind === 'duplicates' && duplicateCount > 0 ? (
        <ConfirmDelete
          title="清理重复副本？"
          name={`${duplicateCount} 份完全相同的副本，保留当前选中的版本。`}
          confirmLabel="确认清理"
          onCancel={() => setDeleteRequest(null)}
          onConfirm={cleanDuplicates}
        />
      ) : null}
      {notice ? (
        <div className="toast" role="status">
          <span>{notice}</span>
          {canUndoLibraryChange && view !== 'library' ? (
            <button onClick={undoLibraryChange}>{undoLabel}</button>
          ) : null}
          <button onClick={() => setNotice('')} aria-label="关闭提示">
            <X size={15} />
          </button>
        </div>
      ) : null}
      {modal === 'import' || modal === 'jd' ? (
        <Modal
          title={modal === 'import' ? '导入简历' : '按岗位定制'}
          onClose={() => {
            importController.current?.abort()
            setImporting(false)
            setModal(null)
          }}
        >
          {modal === 'import' ? (
            <label className="upload-zone">
              <FilePlus2 size={22} />
              <strong>选择简历文件</strong>
              <span>
                PDF、DOCX、TXT、MD、JSON
                {config.importLimits
                  ? ` · 最大 ${Math.round(config.importLimits.maxFileBytes / 1024 / 1024)}MB`
                  : ''}
              </span>
              <input
                type="file"
                aria-label="选择简历文件"
                accept={documentAccept}
                onChange={(e) => {
                  void importFile(e.target.files?.[0])
                  e.target.value = ''
                }}
              />
            </label>
          ) : null}
          {modal === 'import' ? (
            <Suspense fallback={<p role="status">正在加载编辑器…</p>}>
              <RichTextEditor
                label="简历原文"
                value={text}
                onChange={setText}
                maxLength={config.importLimits?.maxTextCharacters ?? 20000}
                disabled={importing}
              />
            </Suspense>
          ) : (
            <>
              <p className="modal-description">
                基于 {resume.name} 的简历库生成独立版本，保留原简历，不改动底稿。
              </p>
              <label className="modal-input-label">
                岗位描述（JD）
                <textarea
                  autoFocus
                  value={text}
                  maxLength={20000}
                  rows={9}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="直接粘贴岗位名称、公司、工作职责、任职要求…"
                />
              </label>
            </>
          )}
          {importing ? <p role="status">正在提取文档…</p> : null}
          <div className="modal-actions">
            <button
              className="text-button"
              disabled={importing}
              onClick={() =>
                setText(
                  modal === 'jd'
                    ? sampleJD
                    : '陈亦舟\n前端工程师\nyizhou@example.com\n3 年前端开发经验，主要用 React、TypeScript 做企业协作平台。负责设计系统核心组件开发，日常和产品、设计搭档推进需求落地。\n南京大学 · 软件工程 · 本科',
                )
              }
            >
              填入示例
            </button>
            <Button
              label={modal === 'jd' ? '生成定制草稿' : '整理为简历'}
              variant="primary"
              isDisabled={!text.trim() || busy || importing}
              icon={<Sparkles size={15} />}
              onClick={() => run(modal === 'jd' ? 'tailor' : 'import', text)}
            />
          </div>
        </Modal>
      ) : null}
      {modal === 'export' && hasResume ? (
        <Modal title="导出简历" onClose={() => setModal(null)}>
          <p className="modal-description">导出当前版本：{resume.label}</p>
          <div className="export-options">
            <button
              onClick={() => {
                setModal(null)
                setTimeout(() => window.print(), 100)
              }}
            >
              <FileText size={23} />
              <div>
                <strong>打印 / 保存为 PDF</strong>
                <span>标准 A4 排版 · 在打印窗口选「另存为 PDF」即可</span>
              </div>
              <ArrowRight size={17} />
            </button>
            <button
              onClick={() => {
                exportJSON(resume)
                setNotice('结构化简历已导出，可随时重新导入。')
              }}
            >
              <ArrowDownToLine size={23} />
              <div>
                <strong>导出结构化 JSON</strong>
                <span>本地完整备份 · 换设备时可随时导回 Folio</span>
              </div>
              <ArrowRight size={17} />
            </button>
          </div>
          <p className="field-hint">
            多页长简历会自动分页。打印时建议关掉浏览器的「页眉和页脚」，版面更干净。
          </p>
        </Modal>
      ) : null}
      {modal === 'login' ? (
        <Modal
          title={session ? '账户' : '登录 Folio'}
          className={
            !session && config.market === 'cn' ? 'login-dialog' : undefined
          }
          onClose={() => setModal(null)}
        >
          {session ? (
            <AccountDetails
              user={session.user}
              onBilling={() => setModal('billing')}
            />
          ) : (
            <p className="login-description">
              试用草稿只保存在当前浏览器，登录后可进入你的独立简历空间。
            </p>
          )}
          {session ? (
            <Button
              label="退出登录"
              onClick={async () => {
                try {
                  await onSignOut()
                } catch (error) {
                  setNotice(
                    error instanceof Error
                      ? error.message
                      : '退出失败，请重试。',
                  )
                }
              }}
            />
          ) : (
            <LoginMethods
              social={configuredSocialMethods(config)}
              email={config.authMethods?.email ?? false}
              busy={loginBusy}
              error={loginError}
              onLogin={onLogin}
              china={config.market === 'cn'}
            />
          )}
        </Modal>
      ) : null}
      {modal === 'billing' ? (
        <Modal title="套餐与用量" onClose={() => setModal(null)}>
          <BillingPanel
            signedIn={!!session}
            market={config.market}
            onLogin={() => {
              setModal('login')
            }}
          />
        </Modal>
      ) : null}
      {modal === 'history' ? (
        <Modal title="历史对话" onClose={() => setModal(null)}>
          <div className="history-list">
            {chats?.threads
              .filter((thread) => thread.messages.length)
              .map((thread) => (
                <button
                  className="outline-button"
                  key={thread.id}
                  disabled={
                    busy ||
                    Boolean(
                      thread.resumeId &&
                      !resumes.some((r) => r.id === thread.resumeId),
                    )
                  }
                  onClick={() => {
                    activateChat(thread.resumeId, thread.id)
                    if (thread.resumeId) setSelected(thread.resumeId)
                    setView('chat')
                    setMobile('chat')
                    setModal(null)
                  }}
                >
                  <MessageSquare size={15} />
                  <span>{thread.title}</span>
                </button>
              ))}
            {!chats?.threads.some((thread) => thread.messages.length) ? (
              <p>暂无历史对话</p>
            ) : null}
          </div>
        </Modal>
      ) : null}
      {hasResume ? (
        <div className="print-only">
          <ResumeDocument resume={resume} />
        </div>
      ) : null}
    </div>
  )
}

import { fromMarkdown } from 'mdast-util-from-markdown'
import type { Resume } from './resume'

type Experience = Resume['experience'][number]

type MarkdownNode = {
  type: string
  value?: string
  children?: MarkdownNode[]
}

// Compare a small set of equivalent phrases. Keep qualifiers, numbers, negation,
// and technical terms literal. Do not infer meaning from token similarity.
function normalizeWording(text: string) {
  return text
    .replace(/[ \t]+/g, ' ')
    .replace(
      /(^|[，。；、,;\n])(?:用|使用)(?= [A-Za-z][A-Za-z0-9]*)/g,
      '$1使用',
    )
    .replace(/(?:按|按照|依据)(?:既有|现有)业务规则/g, '按既有业务规则')
    .replace(
      /参与(?:维护(?:既有|现有)微服务|(?:既有|现有)微服务(?:的)?维护)(?=$|[，。；、,;\n])/g,
      '参与既有微服务维护',
    )
    .replace(/参数校验(?:和|与)错误处理/g, '参数校验与错误处理')
    .replace(/跟进发布(?:和|与)评论反馈/g, '跟进发布和评论反馈')
    .replace(/分类后反馈(?:给)?产品(?:与|和)客服/g, '分类后反馈产品与客服')
    .replace(/读取业务记录(?:，|并)输出差异清单/g, '读取业务记录并输出差异清单')
}

function withoutEmphasis(nodes: MarkdownNode[]): MarkdownNode[] {
  const merged: MarkdownNode[] = []
  function append(node: MarkdownNode) {
    if (node.type === 'strong' || node.type === 'emphasis') {
      node.children?.forEach(append)
      return
    }
    const previous = merged.at(-1)
    if (node.type === 'text' && previous?.type === 'text') {
      previous.value = (previous.value ?? '') + (node.value ?? '')
    } else {
      merged.push({ ...node })
    }
  }
  nodes.forEach(append)
  return merged.map((node) => {
    if (node.type === 'text')
      return { type: 'text', value: normalizeWording(node.value ?? '') }
    return node.children
      ? { ...node, children: withoutEmphasis(node.children) }
      : node
  })
}

function evidenceTextKey(markdown: string) {
  const tree = fromMarkdown(markdown)
  return JSON.stringify(
    withoutEmphasis(tree.children),
    (key, value: unknown) => (key === 'position' ? undefined : value),
  )
}

function experienceKey({ company, role, period }: Experience) {
  return JSON.stringify([company, role, period])
}

// Only items matching original evidence can reach the document. Proposal order is a preference;
// omitted originals and duplicate originals retain their evidence.
function reorderEvidence<T>(
  original: T[],
  proposed: T[],
  key: (item: T) => string,
  onUnsupported: (item: T) => void,
  reconcile: (original: T, proposed: T) => T = (item) => item,
): T[] {
  const available = new Map<string, number[]>()
  original.forEach((item, index) => {
    const id = key(item)
    const positions = available.get(id) ?? []
    positions.push(index)
    available.set(id, positions)
  })
  const used = new Set<number>()
  const ordered: T[] = []
  for (const item of proposed) {
    const id = key(item)
    const index = available.get(id)?.shift()
    if (index !== undefined) {
      used.add(index)
      ordered.push(reconcile(original[index], item))
    } else if (!available.has(id)) {
      onUnsupported(item)
    }
  }
  return [...ordered, ...original.filter((_, index) => !used.has(index))]
}

export function groundTailoredResume(source: Resume, proposed: Resume) {
  const confirmations = new Set<string>()
  function requireConfirmation(field: string, value: string) {
    const text = value.trim().replace(/\s+/g, ' ')
    if (!text) return
    confirmations.add(`请确认${field}中的建议「${text}」是否有依据`)
  }

  for (const [field, label] of [
    ['title', '职位'],
    ['education', '教育背景'],
  ] as const)
    if (proposed[field] !== source[field])
      requireConfirmation(label, proposed[field])

  const summaryMatches =
    evidenceTextKey(proposed.summary) === evidenceTextKey(source.summary)
  if (!summaryMatches) requireConfirmation('个人简介', proposed.summary)

  const skills = reorderEvidence(
    source.skills,
    proposed.skills,
    evidenceTextKey,
    (item) => requireConfirmation('专业技能', item),
    (_, proposal) => proposal,
  )
  const experience = reorderEvidence(
    source.experience,
    proposed.experience,
    experienceKey,
    (item) => {
      requireConfirmation(
        '工作经历',
        [item.company, item.role, item.period].join(' '),
      )
      for (const bullet of item.bullets) requireConfirmation('工作要点', bullet)
    },
    (original, proposal) => ({
      ...original,
      bullets: reorderEvidence(
        original.bullets,
        proposal.bullets,
        evidenceTextKey,
        (item) => requireConfirmation('工作要点', item),
        (_, item) => item,
      ),
    }),
  )
  return {
    resume: {
      ...source,
      label: proposed.label,
      summary: summaryMatches ? proposed.summary : source.summary,
      skills,
      experience,
    },
    confirmations: [...confirmations],
  }
}

import type { Resume } from './resume'

type Experience = Resume['experience'][number]

function experienceKey({ company, role, period }: Experience) {
  return JSON.stringify([company, role, period])
}

// Only original items can reach the document. Proposal order is a preference;
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
    ['summary', '个人简介'],
    ['education', '教育背景'],
  ] as const)
    if (proposed[field] !== source[field])
      requireConfirmation(label, proposed[field])

  const skills = reorderEvidence(
    source.skills,
    proposed.skills,
    (item) => item,
    (item) => requireConfirmation('专业技能', item),
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
        (item) => item,
        (item) => requireConfirmation('工作要点', item),
      ),
    }),
  )
  return {
    resume: { ...source, label: proposed.label, skills, experience },
    confirmations: [...confirmations],
  }
}

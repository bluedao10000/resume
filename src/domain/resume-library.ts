import {
  ResumeSchema,
  isExampleResume,
  sampleResume,
  type Resume,
} from './resume'

const contentSchema = ResumeSchema.omit({ id: true, updatedAt: true })

export function restoreResumeLibrary(saved: Resume[] | null): Resume[] {
  if (saved === null) return [sampleResume]
  return saved.map((resume) =>
    resume.isExample === undefined && isExampleResume(resume)
      ? {
          ...resume,
          isExample: true,
          label: resume.label === '我的基础简历' ? '示例简历' : resume.label,
        }
      : resume,
  )
}

export function removeResume(
  resumes: Resume[],
  resumeId: string,
  selectedId: string,
) {
  const remaining = resumes.filter((resume) => resume.id !== resumeId)
  return {
    resumes: remaining,
    selectedId: selectedId === resumeId ? (remaining[0]?.id ?? '') : selectedId,
  }
}

// Ignore generated identity/time only. Labels, templates and all facts matter.
export function deduplicateResumes(
  resumes: Resume[],
  selectedId: string,
): Resume[] {
  const signatures = resumes.map((resume) =>
    JSON.stringify(contentSchema.parse(resume)),
  )
  const keep = new Map<string, number>()
  resumes.forEach((resume, index) => {
    const signature = signatures[index]
    if (!keep.has(signature) || resume.id === selectedId)
      keep.set(signature, index)
  })
  return resumes.filter((_, index) => keep.get(signatures[index]) === index)
}

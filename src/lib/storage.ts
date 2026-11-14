import { z } from 'zod'
import { ResumeSchema, type Resume } from '../domain/resume'
const key = 'folio:resumes:v1'
export function loadResumes(scope: string): Resume[] | null {
  const value = localStorage.getItem(`${key}:${scope}`)
  if (!value) return null
  const parsed = z.array(ResumeSchema).safeParse(JSON.parse(value))
  if (!parsed.success)
    throw new Error(
      '已保存的数据格式不受支持，请先导出备份或重置浏览器站点数据。',
    )
  return parsed.data
}
export function saveResumes(scope: string, resumes: Resume[]) {
  localStorage.setItem(`${key}:${scope}`, JSON.stringify(resumes))
}
export function exportJSON(resume: Resume) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(resume, null, 2)], { type: 'application/json' }),
  )
  const a = document.createElement('a')
  a.href = url
  a.download = `${resume.name}-${resume.label}.json`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

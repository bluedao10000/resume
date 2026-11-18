import type { Resume } from './resume'

const monthRange =
  /^(\d{4})[./年-](\d{1,2})月?\s*(?:至|到|[-–—~～])\s*(\d{4})[./年-](\d{1,2})月?$/
const introductoryWords =
  /^(?:(?:[-*•]|\d+[.)、])\s*)?(?:要求|需要|需)?(?:具有|具备|拥有|有)?/
const approximateYears =
  /^(?:(?:大约|约)([\d一二两三四五六七八九十]+)年|([\d一二两三四五六七八九十]+)年左右)(?:的)?工作经(?:验|历)$/

function yearCount(value: string) {
  if (/^\d+$/.test(value)) return Number(value)
  const digits = '零一二三四五六七八九'
  const normalized = value.replace('两', '二')
  if (normalized.length === 1 && normalized !== '十')
    return digits.indexOf(normalized)
  const tens = /^([一二三四五六七八九]?)十([一二三四五六七八九]?)$/.exec(
    normalized,
  )
  return tens
    ? (tens[1] ? digits.indexOf(tens[1]) : 1) * 10 +
        (tens[2] ? digits.indexOf(tens[2]) : 0)
    : NaN
}

function formatMonth(value: number) {
  return `${Math.floor(value / 12)}.${String((value % 12) + 1).padStart(2, '0')}`
}

export function approximateWorkYears(text: string) {
  const match = approximateYears.exec(
    text.replace(/\s+/g, '').replace(introductoryWords, ''),
  )
  if (match) return yearCount(match[1] ?? match[2])
}

// This receipt answers an approximate, unqualified duration question only.
// Count distinct calendar months, retaining gaps between employment records.
export function approximateWorkTenure(
  jd: string,
  experience: Resume['experience'],
  asOf = new Date(),
) {
  const clauses = jd.split(/[\n，,。；;：:！!？?]/).map((text) => text.trim())
  const requirements = clauses
    .map((clause) => ({
      clause,
      years: approximateWorkYears(clause),
    }))
    .filter(({ years }) => years !== undefined)
  if (!requirements.length || !experience.length) return
  const intervals: [number, number][] = []
  for (const { period } of experience) {
    const parts = monthRange.exec(period.trim())
    if (!parts) return
    const [startYear, startMonth, endYear, endMonth] = parts
      .slice(1)
      .map(Number)
    if (startMonth < 1 || startMonth > 12 || endMonth < 1 || endMonth > 12)
      return
    const start = startYear * 12 + startMonth - 1
    const end = endYear * 12 + endMonth - 1
    if (start > end || end > asOf.getUTCFullYear() * 12 + asOf.getUTCMonth())
      return
    intervals.push([start, end])
  }
  const periods: [number, number][] = []
  for (const [start, end] of intervals.sort((a, b) => a[0] - b[0])) {
    const last = periods.at(-1)
    if (last && start <= last[1] + 1) last[1] = Math.max(end, last[1])
    else periods.push([start, end])
  }
  const months = periods.reduce(
    (total, [start, end]) => total + end - start + 1,
    0,
  )
  const supported = requirements.find(({ years }) => years === months / 12)
  if (!supported) return
  const ranges = periods
    .map(([start, end]) => `${formatMonth(start)}—${formatMonth(end)}`)
    .join('、')
  const receipt = `底稿中的任职日期为 ${ranges}，共覆盖 ${months} 个自然月，可作为「${supported.clause}」的月份依据。`
  return { years: months / 12, receipt }
}

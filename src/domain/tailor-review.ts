import type { Resume } from './resume'
import { plainText } from './rich-text'

// Compare a lead bullet within the same job. Two indistinguishable job records
// cannot support an unambiguous receipt.
export function firstBulletPromotion(
  source: Resume,
  result: Resume,
  textKey: (text: string) => string = (text) => text,
) {
  for (const job of result.experience) {
    const originals = source.experience.filter(
      (item) =>
        item.company === job.company &&
        item.role === job.role &&
        item.period === job.period,
    )
    if (originals.length !== 1 || !job.bullets.length) continue
    const first = textKey(job.bullets[0])
    const bullets = originals[0].bullets
    const index = bullets.findIndex((bullet) => textKey(bullet) === first)
    if (index < 1) continue
    const text = plainText(bullets[index]).replace(/\s+/g, ' ').trim()
    if (!text) continue
    const excerpt = Array.from(text)
    const quote =
      excerpt.slice(0, 80).join('') + (excerpt.length > 80 ? '…' : '')
    const label = [job.company, job.role].filter(Boolean).join(' · ')
    return `${label || '这段经历'}的第 ${index + 1} 条已提到首位。原文是「${quote}」`
  }
  return ''
}

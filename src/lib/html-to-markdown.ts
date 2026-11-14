import DOMPurify from 'dompurify'
import Turndown from 'turndown'

const converter = new Turndown({
  headingStyle: 'atx',
  bulletListMarker: '-',
  strongDelimiter: '**',
})
converter.addRule('styled-emphasis', {
  filter: (node) =>
    node.nodeName === 'SPAN' &&
    (/^(bold|[6-9]00)$/.test((node as HTMLElement).style.fontWeight) ||
      (node as HTMLElement).style.fontStyle === 'italic'),
  replacement: (content, node) => {
    if (!content.trim()) return content
    const style = (node as HTMLElement).style
    if (/^(bold|[6-9]00)$/.test(style.fontWeight)) content = `**${content}**`
    if (style.fontStyle === 'italic') content = `*${content}*`
    return content
  },
})

export function safeHtml(html: string) {
  const cleaned = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'p',
      'div',
      'span',
      'strong',
      'b',
      'em',
      'i',
      'ul',
      'ol',
      'li',
      'br',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'a',
      'code',
      'table',
      'thead',
      'tbody',
      'tr',
      'td',
      'th',
    ],
    ALLOWED_ATTR: ['href', 'style', 'start'],
  })
  return cleaned.replace(/<(\/?)h[1-6](?:\s[^>]*)?>/gi, '<$1h3>')
}
export function htmlToMarkdown(html: string) {
  return converter.turndown(safeHtml(html))
}

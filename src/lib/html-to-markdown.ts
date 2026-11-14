import DOMPurify from 'dompurify'
import Turndown from 'turndown'

const converter = new Turndown({
  headingStyle: 'atx',
  bulletListMarker: '-',
  strongDelimiter: '**',
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
      'pre',
      'font',
    ],
    ALLOWED_ATTR: ['href', 'style', 'start', 'face'],
  })
  const body = new DOMParser().parseFromString(cleaned, 'text/html').body
  for (const element of body.querySelectorAll<HTMLElement>('*')) {
    const { fontWeight, fontStyle, fontFamily, whiteSpace, display } =
      element.style
    const family = fontFamily || element.getAttribute('face') || ''
    const bold =
      /^(bold|[6-9]00)$/.test(fontWeight) ||
      /(?:^|[-,\s"'])(?:bold|semibold|demibold)(?:italic|oblique)?(?:$|[-,\s"'])/i.test(
        family,
      )
    const italic =
      /^(italic|oblique)$/.test(fontStyle) ||
      /(?:^|[-,\s"'])(?:bold)?(?:italic|oblique)(?:$|[-,\s"'])/i.test(family)
    // Convert source CSS to semantic nodes before the editor discards styles.
    for (const tag of [
      ...(bold ? ['strong'] : []),
      ...(italic ? ['em'] : []),
    ]) {
      const mark = body.ownerDocument.createElement(tag)
      while (element.firstChild) mark.appendChild(element.firstChild)
      element.appendChild(mark)
    }
    if (/^pre(?:-wrap|-line)?$/.test(whiteSpace) || element.tagName === 'PRE') {
      const walker = body.ownerDocument.createTreeWalker(
        element,
        NodeFilter.SHOW_TEXT,
      )
      const nodes: Text[] = []
      while (walker.nextNode()) nodes.push(walker.currentNode as Text)
      for (const text of nodes) {
        const lines = text.data.replace(/\r\n?/g, '\n').split('\n')
        if (lines.length < 2) continue
        const fragment = body.ownerDocument.createDocumentFragment()
        lines.forEach((line, index) => {
          if (index) fragment.append(body.ownerDocument.createElement('br'))
          fragment.append(line)
        })
        text.replaceWith(fragment)
      }
    }
    const tag = element.tagName
    const replacement = /^H[1-6]$/.test(tag)
      ? 'h3'
      : tag === 'PRE' || (tag === 'SPAN' && display === 'block')
        ? 'div'
        : tag === 'FONT'
          ? 'span'
          : undefined
    element.removeAttribute('style')
    element.removeAttribute('face')
    if (replacement) {
      const node = body.ownerDocument.createElement(replacement)
      while (element.firstChild) node.appendChild(element.firstChild)
      element.replaceWith(node)
    }
  }
  return body.innerHTML
}
export function htmlToMarkdown(html: string) {
  return converter.turndown(safeHtml(html))
}

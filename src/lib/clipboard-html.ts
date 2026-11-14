import { safeHtml } from './html-to-markdown'

const blocks = 'p,div,h3,ul,ol,li,table'
const bullet = /^\s*(?:[•●▪◦‣⁃∙·\uF0B7]\s*|[-*+]\s+)/
const numbered = /^\s*(\d{1,3})[.)、]\s+/

// Keep clipboard text literal: Markdown syntax in a PDF is not an instruction.
function textHtml(text: string) {
  const escape = (value: string) =>
    value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => `<p>${escape(line)}</p>`)
    .join('')
}

export function clipboardHtml(html: string, text: string) {
  const body = new DOMParser().parseFromString(
    html ? safeHtml(html) : textHtml(text),
    'text/html',
  ).body
  // Some readers provide a single inline HTML run but useful lines in plain text.
  // Restore only matching text boundaries, retaining the original inline marks.
  const lineContainer =
    body.children.length === 1 &&
    body.firstElementChild?.matches('p,div') &&
    !body.firstElementChild.querySelector(blocks)
      ? (body.firstElementChild as HTMLElement)
      : body
  if (
    html &&
    !lineContainer.querySelector(`${blocks},br`) &&
    /[\r\n]/.test(text)
  ) {
    const compact = (value: string) => value.replace(/\s/g, '')
    if (compact(body.textContent ?? '') === compact(text)) {
      const boundaries: number[] = []
      let length = 0
      for (const line of text
        .replace(/\r\n?/g, '\n')
        .split('\n')
        .slice(0, -1)) {
        length += compact(line).length
        if (length && boundaries.at(-1) !== length) boundaries.push(length)
      }
      const walker = body.ownerDocument.createTreeWalker(
        lineContainer,
        NodeFilter.SHOW_TEXT,
      )
      const points: { node: Text; offset: number }[] = []
      let count = 0
      let boundary = 0
      while (walker.nextNode()) {
        const node = walker.currentNode as Text
        for (let index = 0; index < node.length; index++) {
          if (!/\s/.test(node.data[index])) count++
          if (count === boundaries[boundary]) {
            points.push({ node, offset: index + 1 })
            boundary++
          }
        }
      }
      for (const { node, offset } of points.reverse()) {
        const tail = node.splitText(offset)
        tail.parentNode!.insertBefore(
          body.ownerDocument.createElement('br'),
          tail,
        )
      }
    }
  }
  // Split leaf blocks and root inline runs on actual line breaks. Range cloning
  // preserves emphasis even when a marked span crosses a line boundary.
  function splitLines(container: HTMLElement) {
    const breaks = [...container.querySelectorAll('br')]
    if (!breaks.length) return
    const fragment = body.ownerDocument.createDocumentFragment()
    const range = body.ownerDocument.createRange()
    range.setStart(container, 0)
    for (const br of breaks) {
      range.setEndBefore(br)
      const p = body.ownerDocument.createElement('p')
      p.appendChild(range.cloneContents())
      fragment.append(p)
      range.setStartAfter(br)
    }
    range.setEnd(container, container.childNodes.length)
    const p = body.ownerDocument.createElement('p')
    p.appendChild(range.cloneContents())
    fragment.append(p)
    if (container === body) container.replaceChildren(fragment)
    else container.replaceWith(fragment)
  }
  for (const block of body.querySelectorAll<HTMLElement>('p,div')) {
    if (!block.querySelector(blocks) && !block.closest('li')) splitLines(block)
  }
  if (!body.querySelector(blocks)) splitLines(body)

  // Literal PDF bullet glyphs are text, so ProseMirror cannot recognize them.
  // Convert adjacent lines to real lists without guessing headings or emphasis.
  for (const parent of [body, ...body.querySelectorAll<HTMLElement>('div')]) {
    let list: HTMLOListElement | HTMLUListElement | undefined
    let nextNumber = 0
    for (const node of [...parent.childNodes]) {
      if (node.nodeType === Node.TEXT_NODE && !node.textContent?.trim())
        continue
      if (
        !(node instanceof HTMLElement) ||
        !/^(P|DIV)$/.test(node.tagName) ||
        node.querySelector(blocks)
      ) {
        list = undefined
        continue
      }
      const content = node.textContent ?? ''
      const match = content.match(bullet) || content.match(numbered)
      if (!match) {
        list = undefined
        continue
      }
      const ordered = numbered.test(content)
      const number = ordered ? Number(match[1]) : 0
      if (
        !list ||
        list.tagName !== (ordered ? 'OL' : 'UL') ||
        (ordered && number !== nextNumber)
      ) {
        list = body.ownerDocument.createElement(ordered ? 'ol' : 'ul')
        if (ordered && number !== 1) list.setAttribute('start', String(number))
        node.parentNode!.insertBefore(list, node)
      }
      nextNumber = number + 1
      let remaining = match[0].length
      const walker = body.ownerDocument.createTreeWalker(
        node,
        NodeFilter.SHOW_TEXT,
      )
      while (remaining && walker.nextNode()) {
        const textNode = walker.currentNode as Text
        const remove = Math.min(remaining, textNode.length)
        textNode.deleteData(0, remove)
        remaining -= remove
      }
      const item = body.ownerDocument.createElement('li')
      while (node.firstChild) item.appendChild(node.firstChild)
      list.appendChild(item)
      node.remove()
    }
  }
  return body.innerHTML
}

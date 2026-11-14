import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { ImportLimits } from '../domain/document-import'
import { toMarkdown } from 'mdast-util-to-markdown'
GlobalWorkerOptions.workerSrc = workerSrc

export async function pdfMarkdown(
  buffer: ArrayBuffer,
  limits: ImportLimits,
  signal: AbortSignal,
) {
  signal.throwIfAborted()
  const task = getDocument({
    data: new Uint8Array(buffer),
    cMapUrl: `${location.origin}/pdfjs/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${location.origin}/pdfjs/standard_fonts/`,
    wasmUrl: `${location.origin}/pdfjs/wasm/`,
    useSystemFonts: true,
  })
  const cancel = () => {
    void task.destroy()
  }
  signal.addEventListener('abort', cancel, { once: true })
  try {
    const pdf = await task.promise
    if (pdf.numPages > limits.maxPages)
      throw new Error(`PDF 超过 ${limits.maxPages} 页，请拆分后导入。`)
    const pages: string[] = []
    let length = 0
    for (let n = 1; n <= pdf.numPages; n++) {
      signal.throwIfAborted()
      const page = await pdf.getPage(n)
      const content = await page.getTextContent()
      let text = ''
      let y: number | undefined
      let right: number | undefined
      for (const item of content.items) {
        if (!('str' in item)) continue
        const [x, nextY] = [item.transform[4], item.transform[5]]
        if (
          y !== undefined &&
          Math.abs(y - nextY) > Math.max(2, item.height / 3)
        )
          text += '\n'
        else if (
          right !== undefined &&
          x - right > Math.max(1, item.height / 8) &&
          !text.endsWith('\n')
        )
          text += ' '
        text += item.str
        if (item.hasEOL) {
          text += '\n'
          right = undefined
        } else right = x + item.width
        y = nextY
      }
      // PDF text is data, so escape Markdown syntax. Rebuild line and list structure
      // without pretending font runs imply Word-compatible semantic formatting.
      const markdown = text
        .split(/\n/)
        .map((line) => {
          const list = line.match(/^\s*[•●▪·]\s*(.*)$/)
          const value = toMarkdown({
            type: 'root',
            children: [
              {
                type: 'paragraph',
                children: [{ type: 'text', value: list?.[1] ?? line }],
              },
            ],
          }).trim()
          return list ? `- ${value}` : value
        })
        .join('\n\n')
      length += markdown.length
      if (length > limits.maxTextCharacters)
        throw new Error(
          `提取内容超过 ${limits.maxTextCharacters.toLocaleString()} 字符，请拆分文件。`,
        )
      pages.push(markdown)
      page.cleanup()
    }
    return pages.join('\n\n')
  } catch (error) {
    signal.throwIfAborted()
    if (error instanceof Error && error.name === 'PasswordException')
      throw new Error('PDF 有密码保护，请先解锁后导入。')
    if (error instanceof Error && /超过/.test(error.message)) throw error
    throw new Error('PDF 解析失败，请确认文件未损坏，或另存为 PDF 后重试。')
  } finally {
    signal.removeEventListener('abort', cancel)
    await task.destroy()
  }
}

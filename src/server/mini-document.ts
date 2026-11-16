import { Unzip, UnzipInflate, strFromU8 } from 'fflate'
import { SaxesParser } from 'saxes'
import { getDocumentProxy } from 'unpdf'
import {
  ImportLimitsSchema,
  validateDocxArchive,
  validateExtractedText,
  type ImportLimits,
} from '../domain/document-import'

export function miniImportLimits(env: Record<string, unknown>): ImportLimits {
  return ImportLimitsSchema.parse({
    maxFileBytes: Number(env.IMPORT_MAX_FILE_BYTES),
    maxPages: Number(env.IMPORT_MAX_PDF_PAGES),
    maxTextCharacters: Number(env.IMPORT_MAX_TEXT_CHARACTERS),
    timeoutMs: Number(env.IMPORT_TIMEOUT_MS),
    maxExpandedBytes: Number(env.IMPORT_MAX_EXPANDED_BYTES),
  })
}
export function docxText(bytes: Uint8Array, limits: ImportLimits) {
  validateDocxArchive(bytes.slice().buffer, limits)
  const chunks: Uint8Array[] = []
  let expanded = 0,
    found = false,
    complete = false
  const unzip = new Unzip((file) => {
    if (file.name !== 'word/document.xml') return
    if (found) throw new Error('DOCX 存在重复的正文，请重新另存文件。')
    found = true
    file.ondata = (error, data, final) => {
      if (error) throw new Error('DOCX 文件损坏。')
      expanded += data.length
      if (expanded > Math.min(limits.maxExpandedBytes, limits.maxFileBytes)) {
        file.terminate()
        throw new Error('DOCX 正文解压后过大，请拆分文件。')
      }
      chunks.push(data)
      complete = final
    }
    file.start()
  })
  unzip.register(UnzipInflate)
  for (let offset = 0; offset < bytes.length; offset += 16384)
    unzip.push(
      bytes.subarray(offset, offset + 16384),
      offset + 16384 >= bytes.length,
    )
  if (!found || !complete) throw new Error('DOCX 缺少有效正文。')
  const xml = new Uint8Array(expanded)
  let offset = 0
  for (const chunk of chunks) {
    xml.set(chunk, offset)
    offset += chunk.length
  }
  let text = '',
    inText = false
  const add = (value: string) => {
    text += value
    if (text.length > limits.maxTextCharacters)
      throw new Error('简历文字过长，请拆分文件后重试。')
  }
  const parser = new SaxesParser({ xmlns: true })
  const word = (tag: { uri: string }) =>
    [
      'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
      'http://purl.oclc.org/ooxml/wordprocessingml/main',
    ].includes(tag.uri)
  parser.on('doctype', () => {
    throw new Error('不支持带 DTD 的 DOCX。')
  })
  parser.on('opentag', (tag) => {
    if (!word(tag)) return
    if (tag.local === 't') inText = true
    if (tag.local === 'tab') add('\t')
    if (tag.local === 'br') add('\n')
  })
  parser.on('text', (value) => {
    if (inText) add(value)
  })
  parser.on('closetag', (tag) => {
    if (!word(tag)) return
    if (tag.local === 't') inText = false
    if (tag.local === 'p') add('\n')
  })
  parser.write(strFromU8(xml)).close()
  return validateExtractedText(text, limits)
}
async function extractDocument(
  bytes: Uint8Array,
  type: string,
  limits: ImportLimits,
  assetOrigin: string,
  signal: AbortSignal,
) {
  if (bytes.length > limits.maxFileBytes)
    throw new Error('文件过大，请使用限额以内的文件。')
  if (type === 'docx') return docxText(bytes, limits)
  if (type !== 'pdf')
    throw new Error('请选择 PDF 或 Word（DOCX）；旧版 DOC 请另存为 DOCX。')
  if (strFromU8(bytes.subarray(0, 5)) !== '%PDF-')
    throw new Error('PDF 文件格式不正确。')
  const loading = getDocumentProxy(bytes, {
    disableFontFace: true,
    useSystemFonts: true,
    useWasm: false,
    useWorkerFetch: true,
    cMapUrl: assetOrigin + '/pdfjs/cmaps/',
    cMapPacked: true,
    standardFontDataUrl: assetOrigin + '/pdfjs/standard_fonts/',
    maxImageSize: 0,
  })
  const pdf = await loading
  if (signal.aborted) {
    await pdf.loadingTask.destroy()
    throw new Error('文档解析超时，请拆分文件或粘贴原文。')
  }
  const cancel = () => {
    void pdf.loadingTask.destroy()
  }
  signal.addEventListener('abort', cancel, { once: true })
  try {
    if (pdf.numPages > limits.maxPages)
      throw new Error(`PDF 超过 ${limits.maxPages} 页，请拆分后导入。`)
    let text = ''
    const deadline = Date.now() + limits.timeoutMs
    for (let n = 1; n <= pdf.numPages; n++) {
      if (Date.now() > deadline)
        throw new Error('文档解析超时，请拆分文件或粘贴原文。')
      const page = await pdf.getPage(n)
      const content = await page.getTextContent()
      let y: number | undefined
      for (const item of content.items) {
        if (!('str' in item)) continue
        if (
          y !== undefined &&
          Math.abs(y - item.transform[5]) > Math.max(2, item.height / 3)
        )
          text += '\n'
        else if (text && !text.endsWith('\n')) text += ' '
        text += item.str
        if (item.hasEOL) text += '\n'
        y = item.transform[5]
        if (text.length > limits.maxTextCharacters)
          throw new Error('简历文字过长，请拆分文件后重试。')
      }
      text += '\n'
      page.cleanup()
    }
    return validateExtractedText(text, limits)
  } finally {
    signal.removeEventListener('abort', cancel)
    await pdf.loadingTask.destroy()
  }
}
export async function extractMiniDocument(
  bytes: Uint8Array,
  type: string,
  limits: ImportLimits,
  assetOrigin: string,
) {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      extractDocument(bytes, type, limits, assetOrigin, controller.signal),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort()
          reject(new Error('文档解析超时，请拆分文件或粘贴原文。'))
        }, limits.timeoutMs)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}
// Read incrementally: Content-Length is optional and cannot be trusted.
export async function readBoundedDocument(request: Request, limit: number) {
  if (Number(request.headers.get('content-length')) > limit)
    throw new Error('文件过大。')
  if (!request.body) throw new Error('请选择简历文件。')
  const reader = request.body.getReader(),
    chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const part = await reader.read()
      if (part.done) break
      size += part.value.length
      if (size > limit) {
        await reader.cancel()
        throw new Error('文件过大。')
      }
      chunks.push(part.value)
    }
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.length
  }
  return bytes
}
export async function miniDocumentResponse(
  request: Request,
  env: Record<string, unknown>,
) {
  try {
    const limits = miniImportLimits(env)
    const type = new URL(request.url).searchParams.get('type') || ''
    if (!['pdf', 'docx'].includes(type))
      return Response.json(
        { error: '请选择 PDF 或 Word（DOCX）文件。' },
        { status: 400 },
      )
    const bytes = await readBoundedDocument(request, limits.maxFileBytes)
    const text = await extractMiniDocument(
      bytes,
      type,
      limits,
      String(env.BETTER_AUTH_URL),
    )
    return Response.json({ text }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    // Never echo file contents or parser internals.
    const safe =
      /^(文件过大|请选择|DOCX |PDF |简历文字|文档解析|没有提取|提取内容|不支持|请先移除)/.test(
        message,
      )
        ? message
        : '文件无法解析；请确认未加密、未损坏，或粘贴简历原文。'
    return Response.json(
      { error: safe },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}

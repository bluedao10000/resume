import {
  validateDocument,
  validateExtractedText,
  type ImportLimits,
} from '../domain/document-import'

async function docxHtml(
  buffer: ArrayBuffer,
  limits: ImportLimits,
  signal: AbortSignal,
): Promise<string> {
  signal.throwIfAborted()
  const worker = new Worker(new URL('./docx-worker.ts', import.meta.url), {
    type: 'module',
  })
  try {
    return await new Promise((resolve, reject) => {
      const abort = () => reject(signal.reason)
      signal.addEventListener('abort', abort, { once: true })
      worker.onmessage = ({
        data,
      }: MessageEvent<{ html?: string; error?: string }>) => {
        signal.removeEventListener('abort', abort)
        data.error ? reject(new Error(data.error)) : resolve(data.html ?? '')
      }
      worker.onerror = () => {
        signal.removeEventListener('abort', abort)
        reject(new Error('DOCX 解析失败，请另存文件后重试。'))
      }
      worker.postMessage({ buffer, limits }, [buffer])
    })
  } finally {
    worker.terminate()
  }
}
export async function extractDocument(
  file: File,
  limits: ImportLimits,
  cancel: AbortSignal,
): Promise<string> {
  const extension = validateDocument(file, limits)
  const signal = AbortSignal.any([
    cancel,
    AbortSignal.timeout(limits.timeoutMs),
  ])
  signal.throwIfAborted()
  try {
    let value: string
    if (extension === 'pdf') {
      const { pdfMarkdown } = await import('./pdf-import')
      value = await pdfMarkdown(await file.arrayBuffer(), limits, signal)
    } else if (extension === 'docx') {
      const { htmlToMarkdown } = await import('./html-to-markdown')
      value = htmlToMarkdown(
        await docxHtml(await file.arrayBuffer(), limits, signal),
      )
    } else value = await file.text()
    signal.throwIfAborted()
    return extension === 'json' ? value : validateExtractedText(value, limits)
  } catch (error) {
    if (signal.aborted && !cancel.aborted)
      throw new Error('文档解析超时，请拆分文件或粘贴简历原文。')
    throw error
  }
}

import mammoth from 'mammoth/mammoth.browser'
import {
  validateDocxArchive,
  type ImportLimits,
} from '../domain/document-import'
const worker = self as unknown as {
  onmessage: (
    event: MessageEvent<{ buffer: ArrayBuffer; limits: ImportLimits }>,
  ) => void
  postMessage: (data: unknown) => void
}
worker.onmessage = async ({ data: { buffer, limits } }) => {
  try {
    validateDocxArchive(buffer, limits)
    const result = await mammoth.convertToHtml(
      { arrayBuffer: buffer },
      {
        externalFileAccess: false,
        includeEmbeddedStyleMap: false,
        convertImage: (() => []) as unknown as NonNullable<
          Parameters<typeof mammoth.convertToHtml>[1]
        >['convertImage'],
      },
    )
    if (result.value.length > limits.maxExpandedBytes)
      throw new Error('文档内容过大，请拆分后导入。')
    worker.postMessage({ html: result.value })
  } catch (error) {
    worker.postMessage({
      error:
        error instanceof Error && /DOCX|文档内容过大/.test(error.message)
          ? error.message
          : 'DOCX 解析失败，请确认文件未损坏且没有密码保护。',
    })
  }
}

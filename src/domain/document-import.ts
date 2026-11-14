import { z } from 'zod'
export const ImportLimitsSchema = z.object({
  maxFileBytes: z.number().int().positive(),
  maxPages: z.number().int().positive(),
  maxTextCharacters: z.number().int().positive().max(20000),
  timeoutMs: z.number().int().positive(),
  maxExpandedBytes: z.number().int().positive(),
})
export type ImportLimits = z.infer<typeof ImportLimitsSchema>
export const documentAccept = '.pdf,.docx,.txt,.md,.json'
export function validateDocument(
  file: Pick<File, 'name' | 'size'>,
  limits: ImportLimits,
) {
  if (file.size > limits.maxFileBytes)
    throw new Error(
      `文件过大，请使用 ${Math.round(limits.maxFileBytes / 1024 / 1024)}MB 以内的文件。`,
    )
  const extension = file.name.split('.').at(-1)?.toLowerCase()
  if (!extension || !['pdf', 'docx', 'txt', 'md', 'json'].includes(extension))
    throw new Error(
      '请选择 PDF、DOCX、TXT、MD 或 Folio JSON。旧版 DOC 请先另存为 DOCX。',
    )
  return extension
}
export function validateExtractedText(value: string, limits: ImportLimits) {
  if (!value.trim())
    throw new Error(
      '没有提取到文字。扫描版 PDF 请先进行 OCR，或直接粘贴简历原文。',
    )
  if (value.length > limits.maxTextCharacters)
    throw new Error(
      `提取内容超过 ${limits.maxTextCharacters.toLocaleString()} 字符，请拆分文件或粘贴需要整理的部分。`,
    )
  return value.trim()
}
// Inspect the ZIP central directory before asking Mammoth to inflate a DOCX.
export function validateDocxArchive(buffer: ArrayBuffer, limits: ImportLimits) {
  const data = new DataView(buffer)
  let end = -1
  for (
    let i = buffer.byteLength - 22;
    i >= Math.max(0, buffer.byteLength - 65557);
    i--
  ) {
    if (data.getUint32(i, true) === 0x06054b50) {
      end = i
      break
    }
  }
  if (end < 0) throw new Error('DOCX 文件损坏或格式不正确。')
  const count = data.getUint16(end + 10, true)
  let offset = data.getUint32(end + 16, true)
  let total = 0
  if (count === 0xffff || offset === 0xffffffff)
    throw new Error('不支持 ZIP64 格式的 DOCX，请另存为普通 DOCX。')
  for (let i = 0; i < count; i++) {
    if (
      offset + 46 > buffer.byteLength ||
      data.getUint32(offset, true) !== 0x02014b50
    )
      throw new Error('DOCX 文件目录损坏。')
    if (data.getUint16(offset + 8, true) & 1)
      throw new Error('请先移除 DOCX 的密码保护。')
    total += data.getUint32(offset + 24, true)
    if (total > limits.maxExpandedBytes)
      throw new Error('DOCX 解压后内容过大，请移除图片或拆分文件。')
    offset +=
      46 +
      data.getUint16(offset + 28, true) +
      data.getUint16(offset + 30, true) +
      data.getUint16(offset + 32, true)
  }
}

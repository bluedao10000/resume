import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  validateDocument,
  validateDocxArchive,
  validateExtractedText,
} from './document-import'
const limits = {
  maxFileBytes: 10485760,
  maxPages: 30,
  maxTextCharacters: 20000,
  timeoutMs: 20000,
  maxExpandedBytes: 52428800,
}
describe('文档导入边界', () => {
  it('接受声明的常见格式，拒绝超限、未知格式、空扫描内容和超长文字', () => {
    for (const name of [
      'resume.PDF',
      'resume.docx',
      'resume.txt',
      'resume.md',
      'resume.json',
    ])
      expect(validateDocument({ name, size: 100 }, limits)).toBeTruthy()
    expect(() =>
      validateDocument({ name: 'resume.doc', size: 100 }, limits),
    ).toThrow('DOCX')
    expect(() =>
      validateDocument({ name: 'resume.pdf', size: 10485761 }, limits),
    ).toThrow('文件过大')
    expect(() => validateExtractedText(' ', limits)).toThrow('OCR')
    expect(() => validateExtractedText('a'.repeat(20001), limits)).toThrow(
      '超过',
    )
  })
  it('解压前检查真实 DOCX 目录，拦截损坏文件与扩张超限', () => {
    const file = readFileSync('tests/fixtures/resume.docx')
    const buffer = new Uint8Array(file).buffer
    expect(() => validateDocxArchive(buffer, limits)).not.toThrow()
    expect(() =>
      validateDocxArchive(buffer, { ...limits, maxExpandedBytes: 10 }),
    ).toThrow('解压')
    expect(() => validateDocxArchive(new ArrayBuffer(10), limits)).toThrow(
      '损坏',
    )
  })
})

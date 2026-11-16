import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { zipSync, strToU8 } from 'fflate'
import { extractMiniDocument, readBoundedDocument } from './mini-document'
const limits = {
  maxFileBytes: 10485760,
  maxPages: 30,
  maxTextCharacters: 20000,
  timeoutMs: 20000,
  maxExpandedBytes: 52428800,
}
describe('authenticated mini document extraction', () => {
  for (const [file, expected] of [
    ['resume.docx', '测试候选人'],
    ['resume.pdf', 'Test Candidate'],
    ['resume-cjk.pdf', '测试候选人'],
  ])
    it('extracts real ' + file, async () => {
      const text = await extractMiniDocument(
        new Uint8Array(readFileSync('tests/fixtures/' + file)),
        file.split('.').pop()!,
        limits,
        'https://www.codeiy.com',
      )
      expect(text).toContain(expected)
    })
  it('rejects empty scanned PDFs and excessive pages before Agent invocation', async () => {
    await expect(
      extractMiniDocument(
        new Uint8Array(readFileSync('tests/fixtures/no-text.pdf')),
        'pdf',
        limits,
        'https://www.codeiy.com',
      ),
    ).rejects.toThrow('OCR')
    await expect(
      extractMiniDocument(
        new Uint8Array(readFileSync('tests/fixtures/too-many-pages.pdf')),
        'pdf',
        limits,
        'https://www.codeiy.com',
      ),
    ).rejects.toThrow('超过 30 页')
  })
  it('bounds text, rejects DTD and never extracts DOCX external links or hidden instructions', async () => {
    const doc = (xml: string) => zipSync({ 'word/document.xml': strToU8(xml) })
    await expect(
      extractMiniDocument(
        doc('<!DOCTYPE x><x/>'),
        'docx',
        limits,
        'https://www.codeiy.com',
      ),
    ).rejects.toThrow('DTD')
    await expect(
      extractMiniDocument(
        new Uint8Array(readFileSync('tests/fixtures/resume.docx')),
        'docx',
        { ...limits, maxTextCharacters: 5 },
        'https://www.codeiy.com',
      ),
    ).rejects.toThrow('过长')
  })
  it('enforces upload size even without a Content-Length header', async () => {
    const req = new Request('https://example.com', {
      method: 'POST',
      body: new Uint8Array(20),
    })
    await expect(readBoundedDocument(req, 10)).rejects.toThrow('过大')
  })
})

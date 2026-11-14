"""Reproducible synthetic documents for browser parser tests (stdlib only)."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

target = Path(__file__).resolve().parents[1] / "tests" / "fixtures"
target.mkdir(exist_ok=True)


def pdf(name, stream, pages=1, cjk=False):
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        f"<< /Type /Pages /Kids [{' '.join(f'{6+i} 0 R' for i in range(pages))}] /Count {pages} >>".encode(),
        (b"<< /Type /Font /Subtype /Type0 /BaseFont /STSong-Light /Encoding /UniGB-UCS2-H /DescendantFonts ["
         + f"{6+pages} 0 R".encode() + b"] >>") if cjk else b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
        f"<< /Length {len(stream)} >>\nstream\n".encode() + stream + b"\nendstream",
    ]
    objects += [b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents 5 0 R >>"] * pages
    if cjk:
        objects.append(b"<< /Type /Font /Subtype /CIDFontType0 /BaseFont /STSong-Light /CIDSystemInfo << /Registry (Adobe) /Ordering (GB1) /Supplement 4 >> /DW 1000 >>")
    out = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for n, obj in enumerate(objects, 1):
        offsets.append(len(out))
        out.extend(f"{n} 0 obj\n".encode() + obj + b"\nendobj\n")
    xref = len(out)
    out.extend(f"xref\n0 {len(objects)+1}\n0000000000 65535 f \n".encode())
    out.extend(b"".join(f"{offset:010d} 00000 n \n".encode() for offset in offsets[1:]))
    out.extend(f"trailer\n<< /Size {len(objects)+1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF".encode())
    (target / name).write_bytes(out)


pdf("resume.pdf", b"BT /F1 12 Tf 50 780 Td (Test Candidate) Tj 0 -22 Td (Backend Engineer) Tj 0 -22 Td (candidate@example.invalid) Tj 0 -30 Td /F2 12 Tf (Core work) Tj 0 -22 Td /F1 12 Tf (Designed WebSocket architecture with Go and Redis.) Tj ET")
pdf("no-text.pdf", b"")
pdf("too-many-pages.pdf", b"BT /F1 12 Tf 50 780 Td (Synthetic page) Tj ET", pages=31)
cjk_lines = ["测试候选人", "后端工程师", "设计微服务架构与实时通信"]
stream = "BT /F1 12 Tf 50 780 Td " + " 0 -24 Td ".join(f"<{text.encode('utf-16be').hex()}> Tj" for text in cjk_lines) + " ET"
pdf("resume-cjk.pdf", stream.encode(), cjk=True)

ns = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
doc = f"""<w:document {ns}><w:body>
<w:p><w:r><w:t>测试候选人</w:t></w:r></w:p>
<w:p><w:r><w:t>后端工程师</w:t></w:r></w:p>
<w:p><w:r><w:t>candidate@example.invalid</w:t></w:r></w:p>
<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>核心工作</w:t></w:r></w:p>
<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>
<w:r><w:t xml:space="preserve">主导平台 </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>微服务架构设计</w:t></w:r>
<w:r><w:t>，使用 Go 和 Redis。</w:t></w:r></w:p>
<w:p><w:r><w:rPr><w:i/></w:rPr><w:t>跨团队协作</w:t></w:r></w:p>
<w:sectPr/></w:body></w:document>"""
with ZipFile(target / "resume.docx", "w", ZIP_DEFLATED) as archive:
    archive.writestr("[Content_Types].xml", """<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>""")
    archive.writestr("_rels/.rels", """<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>""")
    archive.writestr("word/document.xml", doc)
    archive.writestr("word/_rels/document.xml.rels", """<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdNum" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/></Relationships>""")
    archive.writestr("word/styles.xml", f"""<w:styles {ns}><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style></w:styles>""")
    archive.writestr("word/numbering.xml", f"""<w:numbering {ns}><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>""")

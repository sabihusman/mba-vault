// Builders for minimal-but-real PDF/DOCX/PPTX files, used by the extractor tests.
// We generate the binary formats programmatically (rather than commit opaque
// sample files) so the tests exercise the actual pdfjs/mammoth/jszip code paths
// against files whose exact content we control. Text passed in must be plain
// (no unbalanced parentheses/backslashes for the PDF content stream).
import JSZip from "jszip";

/** A single-page-per-string PDF with a Helvetica text-showing operator. */
export function buildMinimalPdf(pageTexts: string[]): Buffer {
  const enc = (s: string): Buffer => Buffer.from(s, "latin1");
  const objects: string[] = [];
  const kids: string[] = [];
  let objNum = 3; // 1 = catalog, 2 = pages tree

  const pages: { pageNo: number; contentNo: number; text: string }[] = [];
  for (const text of pageTexts) {
    const pageNo = objNum++;
    const contentNo = objNum++;
    pages.push({ pageNo, contentNo, text });
    kids.push(`${pageNo} 0 R`);
  }
  const fontNo = objNum++;

  objects[1] = "<</Type/Catalog/Pages 2 0 R>>";
  objects[2] = `<</Type/Pages/Kids[${kids.join(" ")}]/Count ${pageTexts.length}>>`;
  for (const p of pages) {
    objects[p.pageNo] =
      `<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents ${p.contentNo} 0 R` +
      `/Resources<</Font<</F1 ${fontNo} 0 R>>>>>>`;
    const stream = `BT /F1 24 Tf 72 700 Td (${p.text}) Tj ET`;
    objects[p.contentNo] = `<</Length ${stream.length}>>\nstream\n${stream}\nendstream`;
  }
  objects[fontNo] = "<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>";

  let pdf = enc("%PDF-1.4\n");
  const offsets: number[] = [];
  for (let i = 1; i < objNum; i++) {
    offsets[i] = pdf.length;
    pdf = Buffer.concat([pdf, enc(`${i} 0 obj\n${objects[i]}\nendobj\n`)]);
  }

  const xrefStart = pdf.length;
  let xref = `xref\n0 ${objNum}\n0000000000 65535 f \n`;
  for (let i = 1; i < objNum; i++) xref += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  xref += `trailer\n<</Size ${objNum}/Root 1 0 R>>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.concat([pdf, enc(xref)]);
}

/** A minimal Word doc with one `<w:p>` per paragraph — enough for mammoth. */
export function buildMinimalDocx(paragraphs: string[]): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
      `</Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
      `</Relationships>`,
  );
  const body = paragraphs.map((p) => `<w:p><w:r><w:t>${p}</w:t></w:r></w:p>`).join("");
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
      `<w:body>${body}</w:body></w:document>`,
  );
  return zip.generateAsync({ type: "nodebuffer" });
}

/** A minimal PPTX: one `ppt/slides/slideN.xml` per slide, each a list of runs. */
export function buildMinimalPptx(slides: string[][]): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="xml" ContentType="application/xml"/></Types>`,
  );
  slides.forEach((runs, i) => {
    const paras = runs.map((t) => `<a:p><a:r><a:t>${t}</a:t></a:r></a:p>`).join("");
    zip.file(
      `ppt/slides/slide${i + 1}.xml`,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" ` +
        `xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">` +
        `<p:cSld><p:spTree>${paras}</p:spTree></p:cSld></p:sld>`,
    );
  });
  return zip.generateAsync({ type: "nodebuffer" });
}

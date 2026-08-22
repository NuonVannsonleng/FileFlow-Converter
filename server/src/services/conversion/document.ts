import { copyFile, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parse as parseCsv } from 'csv-parse/sync';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import { Document, HeadingLevel, ImageRun, Packer, Paragraph, TextRun } from 'docx';
import unzipper from 'unzipper';
import type { ConversionDefinition, ConversionContext } from './types.js';
import { renderPdf, type DocBlock } from './pdfRender.js';
import { extractPdf, pageToPlainText, type ExtractedPage } from './pdfExtract.js';
import { libreOfficeConvert } from '../libreoffice.js';
import { AppError } from '../../utils/errors.js';

// ---------------------------------------------------------------------------
// Text extraction helpers
// ---------------------------------------------------------------------------

const HTML_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decodeEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    }
    if (entity.startsWith('#')) {
      return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
    }
    return HTML_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
}

/**
 * Turn the narrow HTML subset mammoth emits into our block model. This is not a
 * general HTML renderer - it handles headings, paragraphs, lists and tables, and
 * flattens everything else to text, which is what the UI note promises.
 */
function htmlToBlocks(html: string): DocBlock[] {
  const blocks: DocBlock[] = [];
  let orderedIndex = 0;

  const blockPattern =
    /<(h[1-6]|p|li|table)\b[^>]*>([\s\S]*?)<\/\1>|<(ol|ul)\b[^>]*>|<\/(ol)>/gi;

  /** Pull inline base64 images out of a chunk of HTML, in document order. */
  const imagesIn = (fragment: string): Extract<DocBlock, { type: 'image' }>[] => {
    const found: Extract<DocBlock, { type: 'image' }>[] = [];
    const pattern = /<img\b[^>]*src=["']data:image\/[a-z+]+;base64,([^"']+)["'][^>]*>/gi;
    for (const match of fragment.matchAll(pattern)) {
      const alt = /alt=["']([^"']*)["']/i.exec(match[0])?.[1];
      try {
        found.push({ type: 'image', data: Buffer.from(match[1] ?? '', 'base64'), alt });
      } catch {
        // Skip an image whose payload will not decode.
      }
    }
    return found;
  };

  let inOrderedList = false;
  let match: RegExpExecArray | null;

  while ((match = blockPattern.exec(html)) !== null) {
    const [, tag, inner, listOpen, listClose] = match;

    if (listOpen) {
      inOrderedList = listOpen.toLowerCase() === 'ol';
      orderedIndex = 0;
      continue;
    }
    if (listClose) {
      inOrderedList = false;
      continue;
    }
    if (!tag || inner === undefined) continue;

    const name = tag.toLowerCase();

    if (name === 'table') {
      const rows: string[][] = [];
      for (const rowMatch of inner.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
        const cells = [...(rowMatch[1] ?? '').matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(
          (cell) => stripTags(cell[1] ?? ''),
        );
        if (cells.length > 0) rows.push(cells);
      }
      if (rows.length > 0) blocks.push({ type: 'table', rows });
      continue;
    }

    // Images usually sit inside their own <p>, so take them before the text.
    blocks.push(...imagesIn(inner));

    const text = stripTags(inner);
    if (!text) continue;

    if (name.startsWith('h')) {
      blocks.push({ type: 'heading', text, level: Number(name.slice(1)) || 1 });
    } else if (name === 'li') {
      orderedIndex += 1;
      blocks.push({
        type: 'listItem',
        text,
        ordered: inOrderedList,
        index: orderedIndex,
      });
    } else {
      const bold = /<(strong|b)\b/i.test(inner);
      const italic = /<(em|i)\b/i.test(inner);
      blocks.push({ type: 'paragraph', text, bold, italic });
    }
  }

  // An image not wrapped in a block element would otherwise be dropped
  // entirely, which is exactly the 'my photo vanished' failure.
  const seen = new Set(
    blocks.filter((b) => b.type === 'image').map((b) => (b as { data: Buffer }).data.length),
  );
  for (const image of imagesIn(html)) {
    if (!seen.has(image.data.length)) blocks.push(image);
  }

  return blocks;
}

type ParagraphBlock = Extract<DocBlock, { type: 'paragraph' }>;

function textToBlocks(text: string): ParagraphBlock[] {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => ({ type: 'paragraph' as const, text: paragraph.replace(/\n/g, ' ') }));
}

async function writePdf(blocks: DocBlock[], ctx: ConversionContext) {
  // Character sanitisation happens inside renderPdf, which is the only place
  // that knows whether a Unicode font was embedded for this document.
  const content = blocks.length > 0
    ? blocks
    : [{ type: 'paragraph' as const, text: '(This document contained no extractable text.)' }];
  await renderPdf(content, ctx.outputPath, { title: ctx.originalName });
}

/** Read an entry out of a ZIP-based Office/OpenDocument container. */
async function readZipEntry(archivePath: string, entryName: string): Promise<string | null> {
  const directory = await unzipper.Open.file(archivePath);
  const entry = directory.files.find((file) => file.path === entryName);
  if (!entry) return null;
  const buffer = await entry.buffer();
  return buffer.toString('utf8');
}

function sheetsToBlocks(workbook: XLSX.WorkBook): DocBlock[] {
  const blocks: DocBlock[] = [];
  for (const [index, name] of workbook.SheetNames.entries()) {
    const sheet = workbook.Sheets[name];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json<string[]>(sheet, {
      header: 1,
      raw: false,
      defval: '',
      blankrows: false,
    });
    if (rows.length === 0) continue;
    if (index > 0) blocks.push({ type: 'pageBreak' });
    blocks.push({
      type: 'table',
      rows: rows.map((row) => row.map((cell) => String(cell ?? ''))),
      caption: workbook.SheetNames.length > 1 ? name : undefined,
    });
  }
  return blocks;
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

const txtToPdf = async (ctx: ConversionContext) => {
  ctx.onProgress(20);
  const text = await readFile(ctx.inputPath, 'utf8');
  ctx.onProgress(50);
  await writePdf(textToBlocks(text), ctx);
  ctx.onProgress(100);
};

const txtToDocx = async (ctx: ConversionContext) => {
  ctx.onProgress(20);
  const text = await readFile(ctx.inputPath, 'utf8');
  const doc = new Document({
    sections: [
      {
        children: textToBlocks(text).map(
          (block) =>
            new Paragraph({
              children: [new TextRun(block.text)],
            }),
        ),
      },
    ],
  });
  ctx.onProgress(70);
  await writeFile(ctx.outputPath, await Packer.toBuffer(doc));
  ctx.onProgress(100);
};

const docxToPdf = async (ctx: ConversionContext) => {
  ctx.onProgress(20);
  const { value: html } = await mammoth.convertToHtml({ path: ctx.inputPath });
  ctx.onProgress(55);
  await writePdf(htmlToBlocks(html), ctx);
  ctx.onProgress(100);
};

const docxToTxt = async (ctx: ConversionContext) => {
  ctx.onProgress(30);
  const { value } = await mammoth.extractRawText({ path: ctx.inputPath });
  await writeFile(ctx.outputPath, value, 'utf8');
  ctx.onProgress(100);
};

const pdfToTxt = async (ctx: ConversionContext) => {
  ctx.onProgress(20);
  const pages = await extractPdf(ctx.inputPath);
  ctx.onProgress(80);
  await writeFile(ctx.outputPath, pages.map(pageToPlainText).join('\n\n'), 'utf8');
  ctx.onProgress(100);
};

/** Word measures images in pixels at 96 DPI; PDF works in 72 DPI points. */
const ptToPx = (pt: number) => Math.max(1, Math.round(pt * (96 / 72)));

/** A4 minus one-inch margins, in pixels at 96 DPI. */
const DOCX_CONTENT_WIDTH_PX = 624;

/**
 * Build the Word body for one extracted page. Font size relative to the page's
 * body text decides heading level: it is the only structural signal a PDF
 * reliably carries, since PDFs store glyphs rather than document outlines.
 */
function pageToDocxChildren(page: ExtractedPage): Paragraph[] {
  const children: Paragraph[] = [];

  for (const block of page.blocks) {
    if (block.kind === 'image') {
      const nativeWidth = ptToPx(block.displayWidth);
      // Never exceed the text column, and keep the aspect ratio while shrinking.
      const scale = Math.min(1, DOCX_CONTENT_WIDTH_PX / nativeWidth);
      children.push(
        new Paragraph({
          children: [
            new ImageRun({
              type: 'png',
              data: block.data,
              transformation: {
                width: Math.round(nativeWidth * scale),
                height: Math.round(ptToPx(block.displayHeight) * scale),
              },
            }),
          ],
        }),
      );
      continue;
    }

    const ratio = block.fontSize / page.bodyFontSize;
    const heading =
      ratio >= 1.6
        ? HeadingLevel.HEADING_1
        : ratio >= 1.3
          ? HeadingLevel.HEADING_2
          : ratio >= 1.15
            ? HeadingLevel.HEADING_3
            : undefined;

    children.push(
      heading
        ? new Paragraph({ heading, children: [new TextRun({ text: block.text, bold: true })] })
        : new Paragraph({
            // `size` is in half-points; carrying it over keeps relative scale.
            children: [new TextRun({ text: block.text, size: Math.round(block.fontSize * 2) })],
          }),
    );
  }

  return children;
}

const pdfToDocx = async (ctx: ConversionContext) => {
  ctx.onProgress(15);
  const pages = await extractPdf(ctx.inputPath);
  ctx.onProgress(70);

  const children: Paragraph[] = [];
  for (const [index, page] of pages.entries()) {
    const pageChildren = pageToDocxChildren(page);
    if (pageChildren.length === 0) continue;
    if (index > 0) {
      // Keep each source page on its own Word page instead of running them together.
      children.push(new Paragraph({ text: '', pageBreakBefore: true }));
    }
    children.push(...pageChildren);
  }

  if (children.length === 0) {
    children.push(new Paragraph({ text: '(This PDF contained no extractable content.)' }));
  }

  const doc = new Document({ sections: [{ children }] });
  await writeFile(ctx.outputPath, await Packer.toBuffer(doc));
  ctx.onProgress(100);
};

const odtToBlocks = async (inputPath: string): Promise<DocBlock[]> => {
  const xml = await readZipEntry(inputPath, 'content.xml');
  if (xml === null) throw AppError.corrupted('This ODT file could not be read.');

  const blocks: DocBlock[] = [];
  for (const match of xml.matchAll(/<text:(h|p)\b([^>]*)>([\s\S]*?)<\/text:\1>/g)) {
    const text = stripTags(match[3] ?? '');
    if (!text) continue;
    if (match[1] === 'h') {
      const level = Number(/outline-level="(\d+)"/.exec(match[2] ?? '')?.[1] ?? 1);
      blocks.push({ type: 'heading', text, level });
    } else {
      blocks.push({ type: 'paragraph', text });
    }
  }
  return blocks;
};

const odtToPdf = async (ctx: ConversionContext) => {
  ctx.onProgress(25);
  const blocks = await odtToBlocks(ctx.inputPath);
  ctx.onProgress(60);
  await writePdf(blocks, ctx);
  ctx.onProgress(100);
};

const odtToTxt = async (ctx: ConversionContext) => {
  ctx.onProgress(30);
  const blocks = await odtToBlocks(ctx.inputPath);
  const text = blocks
    .map((block) => ('text' in block ? block.text : ''))
    .filter(Boolean)
    .join('\n\n');
  await writeFile(ctx.outputPath, text, 'utf8');
  ctx.onProgress(100);
};

/**
 * Stored files are named by id with no extension, so SheetJS cannot sniff the
 * type from the path - hand it the bytes and let it detect from content.
 */
async function readWorkbook(inputPath: string): Promise<XLSX.WorkBook> {
  try {
    return XLSX.read(await readFile(inputPath), { type: 'buffer', cellDates: false, raw: false });
  } catch {
    throw AppError.corrupted('This spreadsheet could not be read.');
  }
}

const sheetToPdf = async (ctx: ConversionContext) => {
  ctx.onProgress(25);
  const workbook = await readWorkbook(ctx.inputPath);
  ctx.onProgress(60);
  await writePdf(sheetsToBlocks(workbook), ctx);
  ctx.onProgress(100);
};

const sheetToXlsx = async (ctx: ConversionContext) => {
  ctx.onProgress(30);
  const workbook = await readWorkbook(ctx.inputPath);
  XLSX.writeFile(workbook, ctx.outputPath, { bookType: 'xlsx' });
  ctx.onProgress(100);
};

const sheetToCsv = async (ctx: ConversionContext) => {
  ctx.onProgress(30);
  const workbook = await readWorkbook(ctx.inputPath);
  const first = workbook.SheetNames[0];
  const sheet = first ? workbook.Sheets[first] : undefined;
  if (!sheet) throw AppError.corrupted('This spreadsheet has no readable sheets.');
  await writeFile(ctx.outputPath, XLSX.utils.sheet_to_csv(sheet), 'utf8');
  ctx.onProgress(100);
};

const csvToPdf = async (ctx: ConversionContext) => {
  ctx.onProgress(25);
  const raw = await readFile(ctx.inputPath, 'utf8');
  let rows: string[][];
  try {
    rows = parseCsv(raw, { skip_empty_lines: true, relax_column_count: true, bom: true });
  } catch {
    throw AppError.corrupted('This CSV file could not be parsed.');
  }
  ctx.onProgress(60);
  await writePdf([{ type: 'table', rows }], ctx);
  ctx.onProgress(100);
};

/** LibreOffice-backed handler factory; `filter` is soffice's `--convert-to` value. */
const viaLibreOffice =
  (filter: string) =>
  async (ctx: ConversionContext): Promise<void> => {
    ctx.onProgress(15);
    const produced = await libreOfficeConvert(ctx.inputPath, filter, ctx.workDir);
    ctx.onProgress(85);
    await copyFile(produced, ctx.outputPath);
    ctx.onProgress(100);
  };

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const SIMPLIFIED =
  'Text, headings, lists, tables and pictures are preserved; complex page layouts are simplified.';
const PDF_TO_WORD =
  'Text, pictures and heading structure are preserved; exact page layout is approximated.';
const ODT_NOTE = 'Text and headings are preserved; pictures and complex layouts are not.';

export const documentConversions: ConversionDefinition[] = [
  // Native (always available)
  { from: 'txt', to: 'pdf', category: 'document', engine: 'native', handler: txtToPdf },
  { from: 'txt', to: 'docx', category: 'document', engine: 'native', handler: txtToDocx },
  { from: 'docx', to: 'pdf', category: 'document', engine: 'native', note: SIMPLIFIED, handler: docxToPdf },
  { from: 'docx', to: 'txt', category: 'document', engine: 'native', handler: docxToTxt },
  { from: 'pdf', to: 'txt', category: 'document', engine: 'native', handler: pdfToTxt },
  { from: 'pdf', to: 'docx', category: 'document', engine: 'native', note: PDF_TO_WORD, handler: pdfToDocx },
  { from: 'odt', to: 'pdf', category: 'document', engine: 'native', note: ODT_NOTE, handler: odtToPdf },
  { from: 'odt', to: 'txt', category: 'document', engine: 'native', handler: odtToTxt },
  { from: 'xlsx', to: 'pdf', category: 'document', engine: 'native', handler: sheetToPdf },
  { from: 'xlsx', to: 'csv', category: 'document', engine: 'native', note: 'Exports the first sheet.', handler: sheetToCsv },
  { from: 'xls', to: 'pdf', category: 'document', engine: 'native', handler: sheetToPdf },
  { from: 'xls', to: 'xlsx', category: 'document', engine: 'native', handler: sheetToXlsx },
  { from: 'xls', to: 'csv', category: 'document', engine: 'native', note: 'Exports the first sheet.', handler: sheetToCsv },
  { from: 'csv', to: 'xlsx', category: 'document', engine: 'native', handler: sheetToXlsx },
  { from: 'csv', to: 'pdf', category: 'document', engine: 'native', handler: csvToPdf },

  // LibreOffice-backed. Hidden by the API until soffice is actually present.
  { from: 'doc', to: 'pdf', category: 'document', engine: 'libreoffice', handler: viaLibreOffice('pdf') },
  { from: 'doc', to: 'docx', category: 'document', engine: 'libreoffice', handler: viaLibreOffice('docx') },
  { from: 'rtf', to: 'pdf', category: 'document', engine: 'libreoffice', handler: viaLibreOffice('pdf') },
  { from: 'rtf', to: 'docx', category: 'document', engine: 'libreoffice', handler: viaLibreOffice('docx') },
  { from: 'ppt', to: 'pdf', category: 'document', engine: 'libreoffice', handler: viaLibreOffice('pdf') },
  { from: 'pptx', to: 'pdf', category: 'document', engine: 'libreoffice', handler: viaLibreOffice('pdf') },
  { from: 'odt', to: 'docx', category: 'document', engine: 'libreoffice', handler: viaLibreOffice('docx') },
];

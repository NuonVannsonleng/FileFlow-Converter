import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { AppError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';

/** A run of text sharing a baseline, with the font size it was drawn at. */
export interface TextBlock {
  kind: 'text';
  /** PDF user-space y of the baseline. Larger is higher up the page. */
  y: number;
  text: string;
  fontSize: number;
}

/** A raster image lifted out of the page's content stream, re-encoded as PNG. */
export interface ImageBlock {
  kind: 'image';
  y: number;
  data: Buffer;
  /** Rendered size on the page, in PDF points. */
  displayWidth: number;
  displayHeight: number;
}

export type PageBlock = TextBlock | ImageBlock;

export interface ExtractedPage {
  /** Text and images interleaved in reading order, top of page first. */
  blocks: PageBlock[];
  /** Most common font size on the page; the baseline for heading detection. */
  bodyFontSize: number;
  widthPt: number;
  heightPt: number;
}

/** pdf.js needs a file:// URL to the standard Type1 font metrics it ships with. */
function standardFontDataUrl(): string {
  const entry = createRequire(import.meta.url).resolve('pdfjs-dist/package.json');
  return pathToFileURL(path.join(path.dirname(entry), 'standard_fonts/')).href;
}

type Matrix = [number, number, number, number, number, number];

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** PDF matrix concatenation: `m` applied before `base` (row-vector convention). */
function multiply(m: Matrix, base: Matrix): Matrix {
  return [
    m[0] * base[0] + m[1] * base[2],
    m[0] * base[1] + m[1] * base[3],
    m[2] * base[0] + m[3] * base[2],
    m[2] * base[1] + m[3] * base[3],
    m[4] * base[0] + m[5] * base[2] + base[4],
    m[4] * base[1] + m[5] * base[3] + base[5],
  ];
}

/**
 * An image occupies the unit square transformed by the current matrix. Mapping
 * all four corners is sign-agnostic, which matters because PDFs routinely flip
 * the y axis to compensate for image space running top-down.
 */
function unitSquareBounds(m: Matrix) {
  const xs: number[] = [];
  const ys: number[] = [];
  const corners: [number, number][] = [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ];
  for (const [ux, uy] of corners) {
    xs.push(ux * m[0] + uy * m[2] + m[4]);
    ys.push(ux * m[1] + uy * m[3] + m[5]);
  }
  return {
    top: Math.max(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
}

/** Cap on the pixel dimensions we keep, so one huge scan cannot bloat the output. */
const MAX_IMAGE_EDGE = 2000;
/** Ignore hairline artefacts: rules, spacers, and 1px shims are not photographs. */
const MIN_IMAGE_EDGE = 16;

interface RawImage {
  width: number;
  height: number;
  kind: number;
  data: Uint8Array | Uint8ClampedArray;
}

/**
 * pdf.js hands back decoded pixels in one of three layouts. Normalise each to
 * something sharp can read, then re-encode as PNG.
 */
async function toPng(image: RawImage): Promise<Buffer | null> {
  const { width, height, kind } = image;
  if (!width || !height) return null;

  const source = Buffer.from(image.data.buffer, image.data.byteOffset, image.data.byteLength);
  let raw: Buffer;
  let channels: 1 | 3 | 4;

  if (kind === 1) {
    // GRAYSCALE_1BPP: packed bits, each row padded to a byte boundary.
    const rowBytes = Math.ceil(width / 8);
    raw = Buffer.alloc(width * height);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const byte = source[y * rowBytes + (x >> 3)] ?? 0;
        raw[y * width + x] = (byte >> (7 - (x & 7))) & 1 ? 255 : 0;
      }
    }
    channels = 1;
  } else if (kind === 2) {
    channels = 3;
    raw = source.subarray(0, width * height * 3);
  } else if (kind === 3) {
    channels = 4;
    raw = source.subarray(0, width * height * 4);
  } else {
    return null;
  }

  if (raw.length < width * height * channels) return null;

  try {
    const pipeline = sharp(raw, { raw: { width, height, channels } });
    if (Math.max(width, height) > MAX_IMAGE_EDGE) {
      pipeline.resize({
        width: width >= height ? MAX_IMAGE_EDGE : undefined,
        height: height > width ? MAX_IMAGE_EDGE : undefined,
        fit: 'inside',
      });
    }
    return await pipeline.png({ compressionLevel: 9 }).toBuffer();
  } catch (error) {
    logger.warn('Could not re-encode an embedded PDF image', { error: String(error) });
    return null;
  }
}

/** Walk a page's content stream, collecting every raster image with its position. */
async function extractImages(
  page: {
    getOperatorList: () => Promise<{ fnArray: number[]; argsArray: unknown[][] }>;
    objs: { get: (key: string, cb: (value: unknown) => void) => void; has?: (k: string) => boolean };
    commonObjs: { get: (key: string, cb: (value: unknown) => void) => void };
  },
  OPS: Record<string, number>,
): Promise<ImageBlock[]> {
  let operators;
  try {
    operators = await page.getOperatorList();
  } catch (error) {
    logger.warn('Could not read a PDF page content stream', { error: String(error) });
    return [];
  }

  const images: ImageBlock[] = [];
  const stack: Matrix[] = [];
  let ctm: Matrix = [...IDENTITY] as Matrix;

  for (let i = 0; i < operators.fnArray.length; i += 1) {
    const fn = operators.fnArray[i];
    const args = operators.argsArray[i] ?? [];

    if (fn === OPS.save) {
      stack.push([...ctm] as Matrix);
      continue;
    }
    if (fn === OPS.restore) {
      ctm = stack.pop() ?? ([...IDENTITY] as Matrix);
      continue;
    }
    if (fn === OPS.transform) {
      ctm = multiply(args as unknown as Matrix, ctm);
      continue;
    }

    const isXObject = fn === OPS.paintImageXObject;
    const isInline = fn === OPS.paintInlineImageXObject;
    if (!isXObject && !isInline) continue;

    let raw: RawImage | null = null;

    if (isInline) {
      raw = args[0] as RawImage;
    } else {
      const key = args[0];
      if (typeof key !== 'string') continue;
      // Page-local objects resolve immediately once the operator list is built.
      raw = await new Promise<RawImage | null>((resolve) => {
        try {
          page.objs.get(key, (value) => resolve((value as RawImage) ?? null));
        } catch {
          resolve(null);
        }
      });
    }

    if (!raw?.data || !raw.width || !raw.height) continue;
    if (raw.width < MIN_IMAGE_EDGE || raw.height < MIN_IMAGE_EDGE) continue;

    const png = await toPng(raw);
    if (!png) continue;

    const bounds = unitSquareBounds(ctm);
    images.push({
      kind: 'image',
      y: bounds.top,
      data: png,
      displayWidth: bounds.width || raw.width,
      displayHeight: bounds.height || raw.height,
    });
  }

  return images;
}

/** Group positioned glyph runs into lines, so a paragraph is not one word per row. */
function groupTextIntoLines(
  items: { str: string; height: number; transform: number[]; hasEOL?: boolean }[],
): TextBlock[] {
  const lines: TextBlock[] = [];

  for (const item of items) {
    if (!item.str) continue;
    const y = item.transform[5] ?? 0;
    const fontSize = item.height || item.transform[3] || 11;

    // Anything within half a line height belongs to the same baseline.
    const tolerance = Math.max(2, fontSize * 0.5);
    const current = lines[lines.length - 1];

    if (current && Math.abs(current.y - y) <= tolerance) {
      const needsSpace = !current.text.endsWith(' ') && !item.str.startsWith(' ');
      current.text += (needsSpace ? ' ' : '') + item.str;
      current.fontSize = Math.max(current.fontSize, fontSize);
    } else {
      lines.push({ kind: 'text', y, text: item.str, fontSize });
    }
  }

  return lines
    .map((line) => ({ ...line, text: line.text.replace(/\s+/g, ' ').trim() }))
    .filter((line) => line.text.length > 0);
}

/** The size most of the page is set in, used as the baseline for headings. */
function medianFontSize(lines: TextBlock[]): number {
  if (lines.length === 0) return 11;
  const sizes = lines.map((line) => line.fontSize).sort((a, b) => a - b);
  return sizes[Math.floor(sizes.length / 2)] ?? 11;
}

/**
 * Read a PDF into positioned text and images, page by page.
 *
 * Ordering is by vertical position rather than content-stream order: text and
 * images are drawn in separate passes by most producers, so stream order would
 * put every photograph at the end of the page.
 */
export async function extractPdf(inputPath: string): Promise<ExtractedPage[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(await readFile(inputPath));

  let doc;
  try {
    doc = await pdfjs.getDocument({
      data,
      standardFontDataUrl: standardFontDataUrl(),
      // Nothing from an uploaded PDF should ever be eval'd.
      isEvalSupported: false,
      useSystemFonts: false,
      // Forces decoded pixel buffers instead of ImageBitmaps we cannot read here.
      isOffscreenCanvasSupported: false,
    }).promise;
  } catch {
    throw AppError.corrupted('This PDF appears to be damaged or password protected.');
  }

  const pages: ExtractedPage[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
      const page = await doc.getPage(pageNumber);
      const viewBox = page.getViewport({ scale: 1 }).viewBox;

      const content = await page.getTextContent();
      const positioned = content.items.flatMap((item) =>
        'str' in item
          ? [{
              str: item.str,
              height: item.height,
              transform: item.transform as number[],
              hasEOL: item.hasEOL,
            }]
          : [],
      );
      const lines = groupTextIntoLines(positioned);

      const images = await extractImages(
        page as unknown as Parameters<typeof extractImages>[0],
        pdfjs.OPS as unknown as Record<string, number>,
      );

      const blocks: PageBlock[] = [...lines, ...images].sort((a, b) => b.y - a.y);

      pages.push({
        blocks,
        bodyFontSize: medianFontSize(lines),
        widthPt: (viewBox[2] ?? 595) - (viewBox[0] ?? 0),
        heightPt: (viewBox[3] ?? 842) - (viewBox[1] ?? 0),
      });

      page.cleanup();
    }
  } finally {
    await doc.destroy();
  }

  return pages;
}

/** Plain text only, for the PDF -> TXT path. */
export function pageToPlainText(page: ExtractedPage): string {
  return page.blocks
    .filter((block): block is TextBlock => block.kind === 'text')
    .map((block) => block.text)
    .join('\n');
}

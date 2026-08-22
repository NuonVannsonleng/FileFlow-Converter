import { createWriteStream, existsSync } from 'node:fs';
import PDFDocument from 'pdfkit';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

/**
 * A deliberately small document model. Every native document converter parses its
 * source into these blocks, so there is exactly one PDF layout implementation.
 */
export type DocBlock =
  | { type: 'heading'; text: string; level: number }
  | { type: 'paragraph'; text: string; bold?: boolean; italic?: boolean }
  | { type: 'listItem'; text: string; ordered?: boolean; index?: number }
  | { type: 'table'; rows: string[][]; caption?: string }
  | { type: 'image'; data: Buffer; alt?: string }
  | { type: 'pageBreak' };

export interface PdfRenderOptions {
  title?: string;
  /** Points. 72 = 1 inch. */
  margin?: number;
  fontSize?: number;
}

const HEADING_SIZES = [22, 18, 15, 13, 12, 11];

// ---------------------------------------------------------------------------
// Fonts
// ---------------------------------------------------------------------------

interface FontSet {
  regular: string;
  bold: string;
  italic: string;
  boldItalic: string;
  /** True when a real TrueType font is embedded, so any script can be written. */
  unicode: boolean;
}

const STANDARD_FONTS: FontSet = {
  regular: 'Helvetica',
  bold: 'Helvetica-Bold',
  italic: 'Helvetica-Oblique',
  boldItalic: 'Helvetica-BoldOblique',
  unicode: false,
};

/**
 * System fonts worth trying when none is configured. Each covers far more than
 * the Latin-1 that pdfkit's built-in fonts are limited to. Scripts outside these
 * (Khmer, Thai, CJK) still need PDF_FONT_PATH pointed at a font that has them.
 */
const FONT_CANDIDATES: { regular: string; bold?: string }[] = [
  { regular: 'C:/Windows/Fonts/arial.ttf', bold: 'C:/Windows/Fonts/arialbd.ttf' },
  { regular: 'C:/Windows/Fonts/segoeui.ttf', bold: 'C:/Windows/Fonts/seguisb.ttf' },
  {
    regular: '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    bold: '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  },
  {
    regular: '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
    bold: '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
  },
  { regular: '/Library/Fonts/Arial.ttf', bold: '/Library/Fonts/Arial Bold.ttf' },
  { regular: '/System/Library/Fonts/Supplemental/Arial.ttf' },
];

let resolvedPaths: { regular: string; bold: string } | null | undefined;

/** Locate an embeddable font once per process. `null` means use the built-ins. */
function resolveFontPaths(): { regular: string; bold: string } | null {
  if (resolvedPaths !== undefined) return resolvedPaths;

  const configured = env.pdfFontPath;
  if (configured) {
    if (existsSync(configured)) {
      const bold =
        env.pdfFontBoldPath && existsSync(env.pdfFontBoldPath) ? env.pdfFontBoldPath : configured;
      logger.info('Embedding configured PDF font', { regular: configured, bold });
      resolvedPaths = { regular: configured, bold };
      return resolvedPaths;
    }
    logger.warn('PDF_FONT_PATH does not exist; falling back to built-in fonts', {
      path: configured,
    });
  }

  for (const candidate of FONT_CANDIDATES) {
    if (!existsSync(candidate.regular)) continue;
    const bold = candidate.bold && existsSync(candidate.bold) ? candidate.bold : candidate.regular;
    logger.info('Embedding system font in generated PDFs', { regular: candidate.regular, bold });
    resolvedPaths = { regular: candidate.regular, bold };
    return resolvedPaths;
  }

  logger.info('No embeddable font found; PDFs use built-in Latin-1 fonts');
  resolvedPaths = null;
  return resolvedPaths;
}

/**
 * Register the embeddable font on this document, if one is available.
 *
 * pdfkit cannot synthesise a slant, so italic reuses the upright face rather
 * than silently dropping the text.
 */
function setUpFonts(doc: PDFKit.PDFDocument): FontSet {
  const paths = resolveFontPaths();
  if (!paths) return STANDARD_FONTS;

  try {
    doc.registerFont('Body', paths.regular);
    doc.registerFont('BodyBold', paths.bold);
    return {
      regular: 'Body',
      bold: 'BodyBold',
      italic: 'Body',
      boldItalic: 'BodyBold',
      unicode: true,
    };
  } catch (error) {
    logger.warn('Could not embed the configured font; using built-ins', { error: String(error) });
    return STANDARD_FONTS;
  }
}

/**
 * pdfkit's standard fonts are Latin-1 only, so anything outside that range would
 * render as garbage. Replacing it keeps output readable and honest. Skipped
 * entirely when a real font is embedded.
 */
export function sanitizeForStandardFont(text: string): string {
  // Keep Latin-1 plus the whitespace pdfkit understands; swap everything else.
  return text.replace(/[^\n\t\x20-\xFF]/g, '?');
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

/** Table columns get equal width; long cells wrap rather than overflow. */
function drawTable(doc: PDFKit.PDFDocument, rows: string[][], fontSize: number, fonts: FontSet) {
  if (rows.length === 0) return;

  const columnCount = rows.reduce((max, row) => Math.max(max, row.length), 0);
  if (columnCount === 0) return;

  const usableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const columnWidth = usableWidth / columnCount;
  const cellPadding = 4;
  const cellFontSize = Math.max(7, Math.min(fontSize, columnCount > 6 ? 7.5 : fontSize - 1));

  for (const [rowIndex, row] of rows.entries()) {
    const isHeader = rowIndex === 0;
    doc.font(isHeader ? fonts.bold : fonts.regular).fontSize(cellFontSize);

    const cells = Array.from({ length: columnCount }, (_, i) => row[i] ?? '');
    const rowHeight =
      Math.max(
        ...cells.map((cell) =>
          doc.heightOfString(cell || ' ', { width: columnWidth - cellPadding * 2 }),
        ),
      ) +
      cellPadding * 2;

    // Start a new page before drawing a row that would run off the bottom.
    if (doc.y + rowHeight > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
    }

    const top = doc.y;
    const left = doc.page.margins.left;

    if (isHeader) {
      doc.rect(left, top, usableWidth, rowHeight).fill('#f1f5f9');
      doc.fillColor('#0f172a');
    }

    for (const [columnIndex, cell] of cells.entries()) {
      const x = left + columnIndex * columnWidth;
      doc.rect(x, top, columnWidth, rowHeight).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
      doc.text(cell, x + cellPadding, top + cellPadding, {
        width: columnWidth - cellPadding * 2,
        height: rowHeight - cellPadding * 2,
        ellipsis: true,
      });
    }

    doc.fillColor('#000000');
    doc.y = top + rowHeight;
    doc.x = left;
  }

  doc.moveDown(0.8);
}

/** Render a block document to a PDF file. Resolves once the file is fully flushed. */
export function renderPdf(
  blocks: DocBlock[],
  outputPath: string,
  options: PdfRenderOptions = {},
): Promise<void> {
  const { title, margin = 56, fontSize = 11 } = options;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin,
      info: title ? { Title: title } : undefined,
      autoFirstPage: true,
    });

    const stream = createWriteStream(outputPath);
    stream.on('finish', () => resolve());
    stream.on('error', reject);
    doc.on('error', reject);
    doc.pipe(stream);

    const fonts = setUpFonts(doc);
    // Only mangle characters when the font genuinely cannot represent them.
    const write = (text: string) => (fonts.unicode ? text : sanitizeForStandardFont(text));

    doc.font(fonts.regular).fontSize(fontSize).fillColor('#111827');

    for (const block of blocks) {
      switch (block.type) {
        case 'pageBreak':
          doc.addPage();
          break;

        case 'heading': {
          const size = HEADING_SIZES[Math.min(block.level, HEADING_SIZES.length) - 1] ?? fontSize;
          doc.moveDown(0.6);
          doc.font(fonts.bold).fontSize(size).text(write(block.text), { align: 'left' });
          doc.font(fonts.regular).fontSize(fontSize);
          doc.moveDown(0.3);
          break;
        }

        case 'listItem': {
          const marker = block.ordered ? `${block.index ?? 1}.` : '\u2022';
          doc.text(`${marker}  ${write(block.text)}`, { indent: 14, align: 'left' });
          doc.moveDown(0.15);
          break;
        }

        case 'image': {
          const usableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
          const usableHeight = doc.page.height - doc.page.margins.top - doc.page.margins.bottom;
          try {
            // `fit` scales down into the box while preserving the aspect ratio,
            // and leaves anything smaller at its natural size.
            doc.image(block.data, { fit: [usableWidth, usableHeight * 0.8], align: 'center' });
            doc.moveDown(0.8);
          } catch {
            // A corrupt or unsupported image must not abort the whole document.
            doc.font(fonts.italic).fontSize(fontSize - 1).fillColor('#6b7280');
            doc.text(write(block.alt ? `[image: ${block.alt}]` : '[image could not be rendered]'));
            doc.font(fonts.regular).fontSize(fontSize).fillColor('#111827');
            doc.moveDown(0.4);
          }
          break;
        }

        case 'table':
          if (block.caption) {
            doc.font(fonts.bold).fontSize(fontSize).text(write(block.caption));
            doc.font(fonts.regular).fontSize(fontSize);
            doc.moveDown(0.3);
          }
          drawTable(
            doc,
            block.rows.map((row) => row.map(write)),
            fontSize,
            fonts,
          );
          break;

        case 'paragraph':
        default: {
          const font = block.bold
            ? block.italic
              ? fonts.boldItalic
              : fonts.bold
            : block.italic
              ? fonts.italic
              : fonts.regular;
          doc.font(font).text(write(block.text) || ' ', { align: 'left', lineGap: 2 });
          doc.font(fonts.regular);
          doc.moveDown(0.45);
          break;
        }
      }
    }

    doc.end();
  });
}

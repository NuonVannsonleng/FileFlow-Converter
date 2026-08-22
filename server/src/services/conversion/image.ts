import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import bmp from 'bmp-js';
import heicConvert from 'heic-convert';
import type { ConversionContext, ConversionDefinition } from './types.js';
import { AppError } from '../../utils/errors.js';

/** Formats sharp cannot decode on its own; each needs a pre-pass into raw pixels. */
const NEEDS_PREDECODE = new Set(['bmp', 'heic']);

const RASTER_TARGETS = ['jpg', 'png', 'webp', 'tiff', 'gif', 'avif'] as const;

/** Sources we accept. SVG is input-only: rasterising is one-way. */
const RASTER_SOURCES = ['jpg', 'png', 'webp', 'tiff', 'gif', 'bmp', 'heic', 'svg', 'avif'] as const;

/** Targets that have no alpha channel and therefore need a background fill. */
const OPAQUE_TARGETS = new Set(['jpg', 'bmp']);

function parseHexColor(value: string | undefined, fallback = '#ffffff') {
  const hex = /^#?([0-9a-f]{6})$/i.exec(value ?? fallback)?.[1] ?? fallback.slice(1);
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
    alpha: 1,
  };
}

/** Formats that can carry multiple frames in both directions. */
const ANIMATABLE = new Set(['gif', 'webp']);

/** Turn an input sharp cannot open into a sharp instance backed by raw RGBA. */
async function decodeSource(inputPath: string, from: string, to: string): Promise<sharp.Sharp> {
  if (!NEEDS_PREDECODE.has(from)) {
    // Read every frame only when the target can hold them; otherwise sharp would
    // hand us the frames stacked into one tall sprite sheet.
    const animated = ANIMATABLE.has(from) && ANIMATABLE.has(to);
    return sharp(inputPath, { animated });
  }

  const buffer = await readFile(inputPath);

  if (from === 'bmp') {
    const decoded = bmp.decode(buffer);
    // bmp-js emits ABGR-ordered bytes; sharp expects RGBA.
    const pixels = Buffer.alloc(decoded.data.length);
    for (let i = 0; i < decoded.data.length; i += 4) {
      pixels[i] = decoded.data[i + 3]!;
      pixels[i + 1] = decoded.data[i + 2]!;
      pixels[i + 2] = decoded.data[i + 1]!;
      pixels[i + 3] = decoded.data[i]!;
    }
    return sharp(pixels, {
      raw: { width: decoded.width, height: decoded.height, channels: 4 },
    });
  }

  // HEIC: sharp's prebuilt binaries omit the HEVC decoder, so decode in JS first.
  const png = await heicConvert({ buffer: buffer as unknown as ArrayBufferLike, format: 'PNG' });
  return sharp(Buffer.from(png));
}

function applyResize(pipeline: sharp.Sharp, ctx: ConversionContext): sharp.Sharp {
  const { width, height, maintainAspectRatio = true } = ctx.settings;
  if (!width && !height) return pipeline;
  return pipeline.resize({
    width: width || undefined,
    height: height || undefined,
    // `inside` preserves the aspect ratio, `fill` stretches to the exact box.
    fit: maintainAspectRatio ? 'inside' : 'fill',
    withoutEnlargement: false,
  });
}

function applyEncoder(pipeline: sharp.Sharp, ctx: ConversionContext): sharp.Sharp {
  const quality = clampQuality(ctx.settings.quality, 82);
  switch (ctx.to) {
    case 'jpg':
      return pipeline.jpeg({ quality, mozjpeg: true, progressive: true });
    case 'png':
      return pipeline.png({
        compressionLevel: clampInt(ctx.settings.compressionLevel, 0, 9, 9),
        palette: quality < 100,
        quality,
      });
    case 'webp':
      return pipeline.webp({ quality, effort: 4 });
    case 'avif':
      return pipeline.avif({ quality, effort: 4 });
    case 'tiff':
      return pipeline.tiff({ quality, compression: 'lzw' });
    case 'gif':
      return pipeline.gif();
    default:
      throw AppError.unsupported();
  }
}

function clampQuality(value: number | undefined, fallback: number) {
  return clampInt(value, 1, 100, fallback);
}

function clampInt(value: number | undefined, min: number, max: number, fallback: number) {
  if (value === undefined || Number.isNaN(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

async function convertImage(ctx: ConversionContext): Promise<void> {
  ctx.onProgress(10);
  let pipeline = await decodeSource(ctx.inputPath, ctx.from, ctx.to);
  ctx.onProgress(35);

  // Rotate per EXIF before anything else, or resizing works on the wrong axes.
  pipeline = pipeline.rotate();
  pipeline = applyResize(pipeline, ctx);

  if (OPAQUE_TARGETS.has(ctx.to)) {
    pipeline = pipeline.flatten({ background: parseHexColor(ctx.settings.backgroundColor) });
  }

  ctx.onProgress(60);
  await applyEncoder(pipeline, ctx).toFile(ctx.outputPath);
  ctx.onProgress(100);
}

/** Every source/target raster pair, minus the identity conversions. */
export const imageConversions: ConversionDefinition[] = RASTER_SOURCES.flatMap((from) =>
  RASTER_TARGETS.filter((to) => to !== from).map((to) => ({
    from,
    to,
    category: 'image' as const,
    engine: 'sharp' as const,
    note:
      from === 'svg'
        ? 'Vector artwork is rasterised at its natural size.'
        : from === 'gif' && to !== 'webp'
          ? 'Animated GIFs are flattened to their first frame.'
          : undefined,
    handler: convertImage,
  })),
);

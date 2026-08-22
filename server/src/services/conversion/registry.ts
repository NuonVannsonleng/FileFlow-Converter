import type { CapabilityReport, ConversionOption, Engine } from '@shared';
import ffmpegPath from 'ffmpeg-static';
import { env } from '../../config/env.js';
import { AppError } from '../../utils/errors.js';
import { detectLibreOffice } from '../libreoffice.js';
import { archiveConversions, compressToZip } from './archive.js';
import { documentConversions } from './document.js';
import { FORMATS } from './formats.js';
import { imageConversions } from './image.js';
import { mediaConversions } from './media.js';
import type { ConversionDefinition } from './types.js';

/** Anything can be wrapped in a ZIP, so build that row from the format catalogue. */
const compressionConversions: ConversionDefinition[] = FORMATS.filter(
  (format) => format.id !== 'zip' && format.id !== 'folder',
).map((format) => ({
  from: format.id,
  to: 'zip',
  category: 'archive' as const,
  engine: 'archive' as const,
  note: 'Compresses the file without changing its contents.',
  handler: compressToZip,
}));

const ALL: ConversionDefinition[] = [
  ...documentConversions,
  ...imageConversions,
  ...mediaConversions,
  ...archiveConversions,
  ...compressionConversions,
];

const key = (from: string, to: string) => `${from}->${to}`;

const BY_KEY = new Map<string, ConversionDefinition>();
for (const definition of ALL) {
  // First registration wins, so a native handler takes priority over an
  // equivalent LibreOffice one when both exist for the same pair.
  BY_KEY.set(key(definition.from, definition.to), BY_KEY.get(key(definition.from, definition.to)) ?? definition);
}

// ---------------------------------------------------------------------------
// Engine availability
// ---------------------------------------------------------------------------

let engineState: CapabilityReport['engines'] | null = null;

/** Probe every engine once at boot so request handling never blocks on it. */
export async function initEngines(): Promise<CapabilityReport['engines']> {
  const libre = await detectLibreOffice();

  let sharpVersion: string | undefined;
  let sharpAvailable = false;
  try {
    const sharp = (await import('sharp')).default;
    sharpVersion = sharp.versions.vips;
    sharpAvailable = true;
  } catch {
    sharpAvailable = false;
  }

  engineState = {
    native: { available: true, detail: 'Built-in document engine' },
    archive: { available: true, detail: 'Built-in archive engine' },
    sharp: {
      available: sharpAvailable,
      version: sharpVersion,
      detail: sharpAvailable ? 'libvips image pipeline' : 'Image engine unavailable',
    },
    ffmpeg: {
      available: Boolean(ffmpegPath),
      detail: ffmpegPath ? 'Bundled FFmpeg build' : 'FFmpeg binary not found',
    },
    libreoffice: {
      available: Boolean(libre),
      version: libre?.version,
      detail: libre ? 'Headless LibreOffice' : 'Install LibreOffice to enable Office conversions',
    },
  };

  return engineState;
}

function engines(): CapabilityReport['engines'] {
  if (!engineState) throw new Error('initEngines() must run before the registry is queried');
  return engineState;
}

export function isEngineAvailable(engine: Engine): boolean {
  return engines()[engine]?.available ?? false;
}

export function capabilities(): CapabilityReport {
  return {
    engines: engines(),
    maxFileSizeBytes: env.maxFileSizeBytes,
    maxFilesPerBatch: env.maxFilesPerBatch,
    fileTtlMinutes: env.fileTtlMinutes,
  };
}

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

/** The full matrix, each entry flagged with whether its engine is installed. */
export function listConversions(): ConversionOption[] {
  return [...BY_KEY.values()]
    .map(({ from, to, category, engine, note }) => ({
      from,
      to,
      category,
      engine,
      available: isEngineAvailable(engine),
      note,
    }))
    .sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
}

/** Target formats reachable from `from` using engines that are actually present. */
export function targetsFor(from: string): string[] {
  return [...BY_KEY.values()]
    .filter((definition) => definition.from === from && isEngineAvailable(definition.engine))
    .map((definition) => definition.to)
    .sort();
}

/** Every source format at least one available engine can read. */
export function supportedSources(): string[] {
  const sources = new Set<string>();
  for (const definition of BY_KEY.values()) {
    if (isEngineAvailable(definition.engine)) sources.add(definition.from);
  }
  return [...sources];
}

export function isSupportedSource(from: string): boolean {
  for (const definition of BY_KEY.values()) {
    if (definition.from === from && isEngineAvailable(definition.engine)) return true;
  }
  return false;
}

/** Resolve a conversion, throwing the user-facing error when it is not offered. */
export function resolveConversion(from: string, to: string): ConversionDefinition {
  const definition = BY_KEY.get(key(from, to));
  if (!definition) {
    throw AppError.unsupported(
      `Converting ${from.toUpperCase()} to ${to.toUpperCase()} isn't supported yet.`,
    );
  }
  if (!isEngineAvailable(definition.engine)) {
    throw AppError.unsupported(
      `${from.toUpperCase()} to ${to.toUpperCase()} needs an engine that isn't installed on this server.`,
    );
  }
  return definition;
}

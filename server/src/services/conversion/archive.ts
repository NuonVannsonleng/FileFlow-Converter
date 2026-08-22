import { createReadStream, createWriteStream } from 'node:fs';
import { copyFile, mkdir, readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createGunzip, createGzip } from 'node:zlib';
import archiver from 'archiver';
import unzipper from 'unzipper';
import * as tar from 'tar';
import type { ConversionContext, ConversionDefinition } from './types.js';
import { AppError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';

/** Guard against zip-slip: reject entries that escape the extraction root. */
function safeJoin(root: string, entryName: string): string | null {
  const normalized = entryName.replace(/\\/g, '/');
  if (normalized.includes('\0')) return null;
  const target = path.resolve(root, normalized);
  const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep;
  return target.startsWith(rootWithSep) ? target : null;
}

async function extractZip(inputPath: string, destination: string): Promise<void> {
  let directory: unzipper.CentralDirectory;
  try {
    directory = await unzipper.Open.file(inputPath);
  } catch {
    throw AppError.corrupted('This archive appears to be damaged or is not a valid ZIP.');
  }

  for (const entry of directory.files) {
    if (entry.type === 'Directory') continue;
    const target = safeJoin(destination, entry.path);
    if (!target) {
      logger.warn('Skipped unsafe archive entry', { entry: entry.path });
      continue;
    }
    await mkdir(path.dirname(target), { recursive: true });
    await pipeline(entry.stream(), createWriteStream(target));
  }
}

async function extractTar(inputPath: string, destination: string, gzip: boolean): Promise<void> {
  try {
    await tar.extract({
      file: inputPath,
      cwd: destination,
      gzip,
      // `strip: 0` plus the filter below is our zip-slip equivalent for tar.
      filter: (entryPath) => safeJoin(destination, entryPath) !== null,
    });
  } catch {
    throw AppError.corrupted('This archive appears to be damaged or is not a valid TAR.');
  }
}

async function extractTo(ctx: ConversionContext, destination: string): Promise<void> {
  await mkdir(destination, { recursive: true });
  if (ctx.from === 'zip') return extractZip(ctx.inputPath, destination);
  return extractTar(ctx.inputPath, destination, ctx.from === 'tar.gz');
}

/** Every file under `root`, as paths relative to it. */
async function listFiles(root: string): Promise<string[]> {
  const found: string[] = [];
  const walk = async (dir: string) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) found.push(path.relative(root, full));
    }
  };
  await walk(root);
  return found;
}

function zipDirectory(sourceDir: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const output = createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    output.on('close', () => resolve());
    output.on('error', reject);
    archive.on('error', reject);
    archive.on('warning', (err) => {
      if (err.code !== 'ENOENT') reject(err);
    });
    archive.pipe(output);
    archive.directory(sourceDir, false);
    void archive.finalize();
  });
}

function zipSingleFile(filePath: string, entryName: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const output = createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    output.on('close', () => resolve());
    output.on('error', reject);
    archive.on('error', reject);
    archive.pipe(output);
    archive.file(filePath, { name: entryName });
    void archive.finalize();
  });
}

/** TAR / TAR.GZ -> ZIP: unpack to scratch, then repack. */
const repackToZip = async (ctx: ConversionContext): Promise<void> => {
  const scratch = path.join(ctx.workDir, 'extract');
  ctx.onProgress(15);
  await extractTo(ctx, scratch);
  ctx.onProgress(60);
  await zipDirectory(scratch, ctx.outputPath);
  await rm(scratch, { recursive: true, force: true });
  ctx.onProgress(100);
};

/** ZIP / TAR -> TAR.GZ. */
const repackToTarGz = async (ctx: ConversionContext): Promise<void> => {
  const scratch = path.join(ctx.workDir, 'extract');
  ctx.onProgress(15);
  await extractTo(ctx, scratch);
  ctx.onProgress(60);
  await tar.create(
    { gzip: true, file: ctx.outputPath, cwd: scratch, portable: true },
    await listFiles(scratch),
  );
  await rm(scratch, { recursive: true, force: true });
  ctx.onProgress(100);
};

const tarGzToTar = async (ctx: ConversionContext): Promise<void> => {
  ctx.onProgress(20);
  await pipeline(createReadStream(ctx.inputPath), createGunzip(), createWriteStream(ctx.outputPath));
  ctx.onProgress(100);
};

const tarToTarGz = async (ctx: ConversionContext): Promise<void> => {
  ctx.onProgress(20);
  await pipeline(
    createReadStream(ctx.inputPath),
    createGzip({ level: 9 }),
    createWriteStream(ctx.outputPath),
  );
  ctx.onProgress(100);
};

/**
 * Unpack an archive. A single-entry archive yields that file directly (the common
 * `report.pdf.tar.gz` case); anything larger is repacked as a flat ZIP, since the
 * job model delivers exactly one downloadable artefact.
 */
const extractArchive = async (ctx: ConversionContext): Promise<void> => {
  const scratch = path.join(ctx.workDir, 'extract');
  ctx.onProgress(15);
  await extractTo(ctx, scratch);
  ctx.onProgress(55);

  const files = await listFiles(scratch);
  if (files.length === 0) throw AppError.corrupted('This archive is empty.');

  if (files.length === 1) {
    const only = files[0]!;
    await copyFile(path.join(scratch, only), ctx.outputPath);
    // The extracted file keeps its own name rather than a synthesised one.
    ctx.setOutputName(path.basename(only));
  } else {
    await zipDirectory(scratch, ctx.outputPath);
  }

  await rm(scratch, { recursive: true, force: true });
  ctx.onProgress(100);
};

/** Compress any single file into a ZIP. This is the "ZIP creation" path. */
export const compressToZip = async (ctx: ConversionContext): Promise<void> => {
  ctx.onProgress(20);
  const info = await stat(ctx.inputPath);
  if (info.size === 0) throw AppError.corrupted('This file is empty.');
  await zipSingleFile(ctx.inputPath, ctx.originalName, ctx.outputPath);
  ctx.onProgress(100);
};

export const archiveConversions: ConversionDefinition[] = [
  { from: 'tar', to: 'zip', category: 'archive', engine: 'archive', handler: repackToZip },
  { from: 'tar.gz', to: 'zip', category: 'archive', engine: 'archive', handler: repackToZip },
  { from: 'zip', to: 'tar.gz', category: 'archive', engine: 'archive', handler: repackToTarGz },
  { from: 'tar', to: 'tar.gz', category: 'archive', engine: 'archive', handler: tarToTarGz },
  { from: 'tar.gz', to: 'tar', category: 'archive', engine: 'archive', handler: tarGzToTar },
  {
    from: 'zip',
    to: 'folder',
    category: 'archive',
    engine: 'archive',
    note: 'Single-file archives unpack directly; larger ones come back as a flat ZIP.',
    handler: extractArchive,
  },
  {
    from: 'tar',
    to: 'folder',
    category: 'archive',
    engine: 'archive',
    note: 'Single-file archives unpack directly; larger ones come back as a flat ZIP.',
    handler: extractArchive,
  },
  {
    from: 'tar.gz',
    to: 'folder',
    category: 'archive',
    engine: 'archive',
    note: 'Single-file archives unpack directly; larger ones come back as a flat ZIP.',
    handler: extractArchive,
  },
];

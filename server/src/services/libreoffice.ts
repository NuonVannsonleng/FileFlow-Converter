import { execFile } from 'node:child_process';
import { access, readdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

const execFileAsync = promisify(execFile);

/** Locations checked when LIBREOFFICE_PATH is not set, in priority order. */
const CANDIDATES = [
  process.platform === 'win32' ? 'C:\\Program Files\\LibreOffice\\program\\soffice.exe' : '',
  process.platform === 'win32' ? 'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe' : '',
  '/usr/bin/soffice',
  '/usr/bin/libreoffice',
  '/usr/local/bin/soffice',
  '/opt/libreoffice/program/soffice',
  '/Applications/LibreOffice.app/Contents/MacOS/soffice',
  // Last resort: whatever is on PATH.
  'soffice',
].filter(Boolean);

let detection: Promise<{ path: string; version: string } | null> | null = null;

async function isExecutable(candidate: string): Promise<boolean> {
  if (!path.isAbsolute(candidate)) return true; // PATH lookup is validated by running it
  try {
    await access(candidate, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function detect(): Promise<{ path: string; version: string } | null> {
  const candidates = env.libreOfficePath ? [env.libreOfficePath] : CANDIDATES;

  for (const candidate of candidates) {
    if (!(await isExecutable(candidate))) continue;
    try {
      const { stdout } = await execFileAsync(candidate, ['--version'], { timeout: 15_000 });
      const version = stdout.trim().split('\n')[0] ?? 'LibreOffice';
      logger.info('LibreOffice detected', { path: candidate, version });
      return { path: candidate, version };
    } catch {
      // Not this one; keep looking.
    }
  }
  return null;
}

/** Cached probe. Runs at most once per process. */
export function detectLibreOffice() {
  detection ??= detect();
  return detection;
}

export async function isLibreOfficeAvailable(): Promise<boolean> {
  return (await detectLibreOffice()) !== null;
}

/**
 * Run `soffice --headless --convert-to`. LibreOffice always names the result after
 * the input file, so the caller gets back the path it actually produced.
 */
export async function libreOfficeConvert(
  inputPath: string,
  targetFilter: string,
  outDir: string,
): Promise<string> {
  const binary = await detectLibreOffice();
  if (!binary) {
    throw AppError.unsupported('This conversion needs LibreOffice, which is not installed.');
  }

  // A private user profile avoids clashing with a desktop LibreOffice session,
  // which otherwise makes headless runs exit immediately without converting.
  const profileDir = path.join(outDir, '.lo-profile');
  const profileUrl =
    process.platform === 'win32'
      ? `file:///${profileDir.replace(/\\/g, '/')}`
      : `file://${profileDir}`;

  try {
    await execFileAsync(
      binary.path,
      [
        '--headless',
        '--norestore',
        '--nolockcheck',
        '--nodefault',
        '--nofirststartwizard',
        `-env:UserInstallation=${profileUrl}`,
        '--convert-to',
        targetFilter,
        '--outdir',
        outDir,
        inputPath,
      ],
      { timeout: 5 * 60_000, maxBuffer: 10 * 1024 * 1024 },
    );
  } catch (error) {
    logger.error('LibreOffice conversion failed', {
      message: error instanceof Error ? error.message : String(error),
    });
    throw AppError.conversionFailed();
  }

  const extension = targetFilter.split(':')[0] ?? targetFilter;
  const expected = `${path.parse(inputPath).name}.${extension}`;
  const produced = await readdir(outDir);

  if (produced.includes(expected)) return path.join(outDir, expected);

  // Fall back to any file with the right extension, in case of name mangling.
  const match = produced.find((name) => name.toLowerCase().endsWith(`.${extension}`));
  if (match) return path.join(outDir, match);

  throw AppError.conversionFailed();
}

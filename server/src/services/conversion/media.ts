import ffmpegPath from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';
import ffmpeg from 'fluent-ffmpeg';
import type { ConversionContext, ConversionDefinition } from './types.js';
import { AppError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';

if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath);
if (ffprobeStatic?.path) ffmpeg.setFfprobePath(ffprobeStatic.path);

export const AUDIO_FORMATS = ['mp3', 'wav', 'aac', 'flac', 'ogg', 'm4a'] as const;
export const VIDEO_FORMATS = ['mp4', 'mov', 'webm', 'avi', 'mkv'] as const;

/**
 * Container-appropriate defaults; users may override the codecs in settings.
 * `container` is the ffmpeg muxer name and is always set: output files are stored
 * under an extensionless id, so ffmpeg has nothing to infer the format from.
 */
const AUDIO_PRESETS: Record<string, { codec: string; container: string; bitrate?: string }> = {
  mp3: { codec: 'libmp3lame', container: 'mp3', bitrate: '192k' },
  wav: { codec: 'pcm_s16le', container: 'wav' },
  aac: { codec: 'aac', container: 'adts', bitrate: '192k' },
  m4a: { codec: 'aac', container: 'ipod', bitrate: '192k' },
  flac: { codec: 'flac', container: 'flac' },
  ogg: { codec: 'libvorbis', container: 'ogg', bitrate: '192k' },
};

const VIDEO_PRESETS: Record<
  string,
  { video: string; audio: string; container: string; extra?: string[] }
> = {
  mp4: {
    video: 'libx264',
    audio: 'aac',
    container: 'mp4',
    extra: ['-movflags', '+faststart', '-pix_fmt', 'yuv420p'],
  },
  mov: { video: 'libx264', audio: 'aac', container: 'mov', extra: ['-pix_fmt', 'yuv420p'] },
  mkv: { video: 'libx264', audio: 'aac', container: 'matroska', extra: ['-pix_fmt', 'yuv420p'] },
  avi: { video: 'mpeg4', audio: 'libmp3lame', container: 'avi', extra: ['-qscale:v', '4'] },
  // VP9 beats VP8 on size at similar quality; row-mt and cpu-used keep it tolerable.
  webm: {
    video: 'libvpx-vp9',
    audio: 'libopus',
    container: 'webm',
    extra: ['-row-mt', '1', '-cpu-used', '4', '-deadline', 'good'],
  },
};

/** `HH:MM:SS.ms` timemark to seconds. Returns 0 for the `N/A` ffmpeg emits early on. */
function timemarkToSeconds(timemark: string): number {
  const parts = timemark.split(':');
  if (parts.length !== 3) return 0;
  const [h, m, s] = parts;
  const seconds = Number(h) * 3600 + Number(m) * 60 + Number.parseFloat(s ?? '0');
  return Number.isFinite(seconds) ? seconds : 0;
}

export function probe(inputPath: string): Promise<ffmpeg.FfprobeData> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(inputPath, (err, data) => {
      if (err) reject(AppError.corrupted('We could not read this media file.'));
      else resolve(data);
    });
  });
}

async function probeDuration(inputPath: string): Promise<number> {
  try {
    const data = await probe(inputPath);
    return Number(data.format?.duration) || 0;
  } catch {
    return 0;
  }
}

function run(command: ffmpeg.FfmpegCommand, ctx: ConversionContext, duration: number) {
  return new Promise<void>((resolve, reject) => {
    command
      .on('progress', (progress) => {
        // fluent-ffmpeg's own `percent` is unreliable, so derive it from the timemark.
        const done = timemarkToSeconds(String(progress.timemark ?? '0'));
        const percent = duration > 0 ? (done / duration) * 100 : 0;
        // Cap below 100 so the UI only celebrates once the file is really on disk.
        ctx.onProgress(Math.min(99, Math.max(5, Math.round(percent))));
      })
      .on('error', (err) => {
        logger.error('ffmpeg failed', { message: err.message, from: ctx.from, to: ctx.to });
        reject(AppError.conversionFailed());
      })
      .on('end', () => {
        ctx.onProgress(100);
        resolve();
      })
      .save(ctx.outputPath);
  });
}

function applyAudioSettings(command: ffmpeg.FfmpegCommand, ctx: ConversionContext, target: string) {
  const preset = AUDIO_PRESETS[target];
  if (!preset) throw AppError.unsupported();

  command.audioCodec(ctx.settings.audioCodec || preset.codec);
  command.format(preset.container);

  // Lossless targets reject a bitrate; only apply it to the lossy codecs.
  const lossless = target === 'wav' || target === 'flac';
  if (!lossless) {
    const bitrate = ctx.settings.audioBitrate ? `${ctx.settings.audioBitrate}k` : preset.bitrate;
    if (bitrate) command.audioBitrate(bitrate);
  }
  if (ctx.settings.sampleRate) command.audioFrequency(ctx.settings.sampleRate);
  if (ctx.settings.channels) command.audioChannels(ctx.settings.channels);
  return command;
}

/** Audio to audio, and video to audio (the "extract audio" path). */
async function convertToAudio(ctx: ConversionContext): Promise<void> {
  const duration = await probeDuration(ctx.inputPath);
  ctx.onProgress(5);
  const command = ffmpeg(ctx.inputPath).noVideo();
  applyAudioSettings(command, ctx, ctx.to);
  await run(command, ctx, duration);
}

async function convertToVideo(ctx: ConversionContext): Promise<void> {
  // "Extract audio only" turns a video target into a plain audio job.
  if (ctx.settings.extractAudioOnly) {
    return convertToAudio({ ...ctx, to: 'mp3' });
  }

  const preset = VIDEO_PRESETS[ctx.to];
  if (!preset) throw AppError.unsupported();

  const duration = await probeDuration(ctx.inputPath);
  ctx.onProgress(5);

  const command = ffmpeg(ctx.inputPath)
    .videoCodec(ctx.settings.videoCodec || preset.video)
    .audioCodec(ctx.settings.audioCodec || preset.audio)
    .format(preset.container);

  command.outputOptions(preset.extra ?? []);

  if (ctx.settings.resolution && ctx.settings.resolution !== 'original') {
    const width = Number.parseInt(ctx.settings.resolution.split('x')[0] ?? '', 10);
    if (Number.isFinite(width) && width > 0) {
      // `-2` keeps the other axis even, which H.264 and VP9 both require.
      command.outputOptions('-vf', `scale=${width}:-2`);
    }
  }
  if (ctx.settings.fps) command.fps(ctx.settings.fps);
  if (ctx.settings.videoBitrate) command.videoBitrate(`${ctx.settings.videoBitrate}k`);
  if (ctx.settings.audioBitrate) command.audioBitrate(`${ctx.settings.audioBitrate}k`);

  await run(command, ctx, duration);
}

/** Video to GIF via a two-pass palette, otherwise colours band badly. */
async function convertToGif(ctx: ConversionContext): Promise<void> {
  const duration = await probeDuration(ctx.inputPath);
  ctx.onProgress(5);

  const fps = ctx.settings.fps ?? 12;
  const width = ctx.settings.width ?? 640;
  const filter =
    `fps=${fps},scale=${width}:-1:flags=lanczos,` +
    'split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer';

  const command = ffmpeg(ctx.inputPath)
    .noAudio()
    .outputOptions('-filter_complex', filter, '-loop', '0')
    .format('gif');

  await run(command, ctx, duration);
}

const audioToAudio: ConversionDefinition[] = AUDIO_FORMATS.flatMap((from) =>
  AUDIO_FORMATS.filter((to) => to !== from).map((to) => ({
    from,
    to,
    category: 'audio' as const,
    engine: 'ffmpeg' as const,
    handler: convertToAudio,
  })),
);

const videoToAudio: ConversionDefinition[] = VIDEO_FORMATS.flatMap((from) =>
  AUDIO_FORMATS.map((to) => ({
    from,
    to,
    category: 'video' as const,
    engine: 'ffmpeg' as const,
    note: 'Extracts the audio track only.',
    handler: convertToAudio,
  })),
);

const videoToVideo: ConversionDefinition[] = VIDEO_FORMATS.flatMap((from) =>
  VIDEO_FORMATS.filter((to) => to !== from).map((to) => ({
    from,
    to,
    category: 'video' as const,
    engine: 'ffmpeg' as const,
    note: to === 'webm' ? 'VP9 encoding is thorough, so this one takes longer.' : undefined,
    handler: convertToVideo,
  })),
);

const videoToGif: ConversionDefinition[] = VIDEO_FORMATS.map((from) => ({
  from,
  to: 'gif',
  category: 'video' as const,
  engine: 'ffmpeg' as const,
  note: 'Long clips make large GIFs; short clips work best.',
  handler: convertToGif,
}));

export const mediaConversions: ConversionDefinition[] = [
  ...audioToAudio,
  ...videoToAudio,
  ...videoToVideo,
  ...videoToGif,
];

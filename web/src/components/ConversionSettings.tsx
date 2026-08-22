import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, SlidersHorizontal } from 'lucide-react';
import type { Category, ConversionSettings as Settings } from '@shared';
import { useTranslation } from '@/hooks/useTranslation';
import { cn } from '@/lib/cn';
import { Field, Slider, inputClass, selectClass } from './ui/Field';
import { Switch } from './ui/Switch';

interface ConversionSettingsProps {
  category: Category | undefined;
  target: string | null;
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  disabled?: boolean;
}

/** Targets with no alpha channel, where a background colour actually matters. */
const OPAQUE_TARGETS = new Set(['jpg', 'bmp']);
const LOSSLESS_AUDIO = new Set(['wav', 'flac']);

const RESOLUTIONS = ['original', '3840x2160', '1920x1080', '1280x720', '854x480', '640x360'];
const SAMPLE_RATES = [8000, 22050, 32000, 44100, 48000, 96000];
const AUDIO_BITRATES = [64, 96, 128, 192, 256, 320];

/**
 * Only the controls that affect this particular conversion are rendered. Showing
 * a bitrate slider for a PNG would be noise, and a lie about what it does.
 */
export function ConversionSettings({
  category,
  target,
  settings,
  onChange,
  disabled,
}: ConversionSettingsProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const targetCategory = resolveTargetCategory(target);
  // Video-to-GIF is driven by ffmpeg, so it gets its own controls rather than
  // the sharp-based image ones, even though GIF is an image format.
  const showGif = target === 'gif' && category === 'video';
  const showImage = targetCategory === 'image' && !showGif;
  const showAudio = targetCategory === 'audio';
  const showVideo = targetCategory === 'video';

  if (!showImage && !showAudio && !showVideo && !showGif) return null;

  return (
    <div className="rounded-xl border border-line bg-surface">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 px-4 py-3 text-left"
      >
        <SlidersHorizontal size={16} className="text-faint" aria-hidden="true" />
        <span className="flex-1 text-sm font-medium">{t('workspace.advanced')}</span>
        <span className="text-xs text-faint">{t('common.optional')}</span>
        <ChevronDown
          size={16}
          className={cn('text-faint transition-transform duration-200', open && 'rotate-180')}
          aria-hidden="true"
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="space-y-4 border-t border-line px-4 py-4">
              <p className="text-xs leading-relaxed text-faint">{t('workspace.advancedHint')}</p>

              {(showImage || showGif) && (
                <div className="grid gap-4 sm:grid-cols-2">
                  {showImage && (
                    <Field
                      label={t('common.quality')}
                      suffix={`${settings.quality ?? 82}`}
                      className="sm:col-span-2"
                    >
                      {({ id }) => (
                        <Slider
                          id={id}
                          min={10}
                          max={100}
                          value={settings.quality ?? 82}
                          onChange={(quality) => onChange({ quality })}
                        />
                      )}
                    </Field>
                  )}

                  <Field label={t('common.width')} hint="px">
                    {({ id }) => (
                      <input
                        id={id}
                        type="number"
                        min={1}
                        max={10000}
                        disabled={disabled}
                        placeholder={t('common.auto')}
                        className={inputClass}
                        value={settings.width ?? ''}
                        onChange={(event) =>
                          onChange({ width: toNumber(event.target.value) })
                        }
                      />
                    )}
                  </Field>

                  <Field label={t('common.height')} hint="px">
                    {({ id }) => (
                      <input
                        id={id}
                        type="number"
                        min={1}
                        max={10000}
                        disabled={disabled || showGif}
                        placeholder={t('common.auto')}
                        className={inputClass}
                        value={settings.height ?? ''}
                        onChange={(event) =>
                          onChange({ height: toNumber(event.target.value) })
                        }
                      />
                    )}
                  </Field>

                  {showImage && (
                    <div className="sm:col-span-2">
                      <Switch
                        label={t('common.aspectRatio')}
                        checked={settings.maintainAspectRatio ?? true}
                        disabled={disabled}
                        onChange={(maintainAspectRatio) => onChange({ maintainAspectRatio })}
                      />
                    </div>
                  )}

                  {target === 'png' && (
                    <Field
                      label={t('common.compression')}
                      suffix={`${settings.compressionLevel ?? 9}`}
                      className="sm:col-span-2"
                    >
                      {({ id }) => (
                        <Slider
                          id={id}
                          min={0}
                          max={9}
                          value={settings.compressionLevel ?? 9}
                          onChange={(compressionLevel) => onChange({ compressionLevel })}
                        />
                      )}
                    </Field>
                  )}

                  {target && OPAQUE_TARGETS.has(target) && (
                    <Field
                      label={t('common.background')}
                      hint={t('common.backgroundHint')}
                      className="sm:col-span-2"
                    >
                      {({ id }) => (
                        <div className="flex items-center gap-2.5">
                          <input
                            id={id}
                            type="color"
                            disabled={disabled}
                            className="h-10 w-14 cursor-pointer rounded-lg border border-line bg-surface p-1"
                            value={settings.backgroundColor ?? '#ffffff'}
                            onChange={(event) =>
                              onChange({ backgroundColor: event.target.value })
                            }
                          />
                          <span className="font-mono text-xs uppercase text-muted">
                            {settings.backgroundColor ?? '#ffffff'}
                          </span>
                        </div>
                      )}
                    </Field>
                  )}
                </div>
              )}

              {(showAudio || showVideo) && (
                <div className="grid gap-4 sm:grid-cols-2">
                  {!(target && LOSSLESS_AUDIO.has(target)) && (
                    <Field label={t('common.bitrate')} hint="kbps">
                      {({ id }) => (
                        <select
                          id={id}
                          disabled={disabled}
                          className={selectClass}
                          value={settings.audioBitrate ?? ''}
                          onChange={(event) =>
                            onChange({ audioBitrate: toNumber(event.target.value) })
                          }
                        >
                          <option value="">{t('common.auto')}</option>
                          {AUDIO_BITRATES.map((rate) => (
                            <option key={rate} value={rate}>
                              {rate} kbps
                            </option>
                          ))}
                        </select>
                      )}
                    </Field>
                  )}

                  <Field label={t('common.sampleRate')} hint="Hz">
                    {({ id }) => (
                      <select
                        id={id}
                        disabled={disabled}
                        className={selectClass}
                        value={settings.sampleRate ?? ''}
                        onChange={(event) =>
                          onChange({ sampleRate: toNumber(event.target.value) })
                        }
                      >
                        <option value="">{t('common.original')}</option>
                        {SAMPLE_RATES.map((rate) => (
                          <option key={rate} value={rate}>
                            {rate.toLocaleString()} Hz
                          </option>
                        ))}
                      </select>
                    )}
                  </Field>

                  <Field label={t('common.channels')}>
                    {({ id }) => (
                      <select
                        id={id}
                        disabled={disabled}
                        className={selectClass}
                        value={settings.channels ?? ''}
                        onChange={(event) =>
                          onChange({ channels: toNumber(event.target.value) })
                        }
                      >
                        <option value="">{t('common.original')}</option>
                        <option value={1}>{t('common.mono')}</option>
                        <option value={2}>{t('common.stereo')}</option>
                      </select>
                    )}
                  </Field>

                  {showVideo && (
                    <>
                      <Field label={t('common.resolution')}>
                        {({ id }) => (
                          <select
                            id={id}
                            disabled={disabled}
                            className={selectClass}
                            value={settings.resolution ?? 'original'}
                            onChange={(event) => onChange({ resolution: event.target.value })}
                          >
                            {RESOLUTIONS.map((resolution) => (
                              <option key={resolution} value={resolution}>
                                {resolution === 'original' ? t('common.original') : resolution}
                              </option>
                            ))}
                          </select>
                        )}
                      </Field>

                      <Field label={t('common.fps')} hint="fps">
                        {({ id }) => (
                          <input
                            id={id}
                            type="number"
                            min={1}
                            max={120}
                            disabled={disabled}
                            placeholder={t('common.original')}
                            className={inputClass}
                            value={settings.fps ?? ''}
                            onChange={(event) => onChange({ fps: toNumber(event.target.value) })}
                          />
                        )}
                      </Field>

                      <div className="sm:col-span-2">
                        <Switch
                          label={t('common.extractAudio')}
                          checked={settings.extractAudioOnly ?? false}
                          disabled={disabled}
                          onChange={(extractAudioOnly) => onChange({ extractAudioOnly })}
                        />
                      </div>
                    </>
                  )}
                </div>
              )}

              {showGif && (
                <Field label={t('common.fps')} hint="fps" className="sm:max-w-[50%]">
                  {({ id }) => (
                    <input
                      id={id}
                      type="number"
                      min={1}
                      max={30}
                      disabled={disabled}
                      placeholder="12"
                      className={inputClass}
                      value={settings.fps ?? ''}
                      onChange={(event) => onChange({ fps: toNumber(event.target.value) })}
                    />
                  )}
                </Field>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function toNumber(value: string): number | undefined {
  if (value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

const IMAGE_TARGETS = new Set(['jpg', 'png', 'webp', 'tiff', 'avif', 'gif']);
const AUDIO_TARGETS = new Set(['mp3', 'wav', 'aac', 'flac', 'ogg', 'm4a']);
const VIDEO_TARGETS = new Set(['mp4', 'mov', 'webm', 'avi', 'mkv']);

function resolveTargetCategory(target: string | null): Category | undefined {
  if (!target) return undefined;
  if (VIDEO_TARGETS.has(target)) return 'video';
  if (AUDIO_TARGETS.has(target)) return 'audio';
  if (IMAGE_TARGETS.has(target)) return 'image';
  return undefined;
}

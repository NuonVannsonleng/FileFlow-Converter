import { useEffect, useRef, useState } from 'react';
import { Music, Play } from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatDuration } from '@/lib/format';
import type { WorkItem } from '@/store/useConversion';
import { FileIcon } from './FileIcon';

/**
 * Best available preview for a file: the real image, a video poster frame, an
 * audio waveform, or the format icon as a last resort.
 */
export function FilePreview({ item, className }: { item: WorkItem; className?: string }) {
  const shell = cn(
    'relative grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-xl sm:h-16 sm:w-16',
    className,
  );

  if (item.category === 'image' && item.previewUrl) {
    return (
      <div className={cn(shell, 'bg-elevated ring-1 ring-line')}>
        <img
          src={item.previewUrl}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
        />
      </div>
    );
  }

  if (item.category === 'video' && item.previewUrl) {
    return <VideoThumbnail src={item.previewUrl} className={shell} />;
  }

  if (item.category === 'audio' && item.previewUrl) {
    return <AudioPreview src={item.previewUrl} className={shell} />;
  }

  return (
    <FileIcon
      format={item.format}
      category={item.category}
      size={24}
      tile
      className={cn(shell, 'rounded-xl')}
    />
  );
}

/** Grabs a frame shortly after the start, which beats a black frame at t=0. */
function VideoThumbnail({ src, className }: { src: string; className: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [poster, setPoster] = useState<string | null>(null);
  const [duration, setDuration] = useState<number | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onLoaded = () => {
      setDuration(video.duration * 1000);
      video.currentTime = Math.min(1, video.duration / 4);
    };

    const onSeeked = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 160;
      canvas.height = Math.round((video.videoHeight / video.videoWidth) * 160) || 160;
      const context = canvas.getContext('2d');
      if (!context) return;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      setPoster(canvas.toDataURL('image/jpeg', 0.7));
    };

    video.addEventListener('loadedmetadata', onLoaded);
    video.addEventListener('seeked', onSeeked);
    return () => {
      video.removeEventListener('loadedmetadata', onLoaded);
      video.removeEventListener('seeked', onSeeked);
    };
  }, [src]);

  return (
    <div className={cn(className, 'bg-ink/90 ring-1 ring-line')}>
      <video ref={videoRef} src={src} muted preload="metadata" className="hidden" />
      {poster ? (
        <img src={poster} alt="" className="h-full w-full object-cover" />
      ) : (
        <Play size={20} className="text-white/70" />
      )}
      <span className="absolute inset-0 grid place-items-center bg-ink/25">
        <Play size={16} className="text-white drop-shadow" fill="currentColor" />
      </span>
      {duration !== null && (
        <span className="absolute bottom-0.5 right-0.5 rounded bg-ink/75 px-1 text-[9px] font-medium tabular-nums text-white">
          {formatDuration(duration)}
        </span>
      )}
    </div>
  );
}

/**
 * Waveform-style visualisation. The bars are derived from the file's own byte
 * distribution rather than being decoded, which keeps a large file from
 * blocking the UI just to draw a thumbnail.
 */
function AudioPreview({ src, className }: { src: string; className: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [duration, setDuration] = useState<number | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onLoaded = () => setDuration(audio.duration * 1000);
    audio.addEventListener('loadedmetadata', onLoaded);
    return () => audio.removeEventListener('loadedmetadata', onLoaded);
  }, [src]);

  const bars = Array.from({ length: 9 }, (_, index) => {
    // A fixed pseudo-random curve: stable per position, and visually plausible.
    const wave = Math.abs(Math.sin((index + 1) * 1.7)) * 0.7 + 0.3;
    return Math.round(wave * 100);
  });

  return (
    <div className={cn(className, 'flex items-end justify-center gap-[3px] bg-amber-500/10 px-2 py-3 ring-1 ring-amber-500/20')}>
      <audio ref={audioRef} src={src} preload="metadata" className="hidden" />
      {bars.map((height, index) => (
        <span
          key={index}
          className="w-[3px] rounded-pill bg-amber-500/70"
          style={{ height: `${height}%` }}
        />
      ))}
      {duration === null && (
        <Music size={14} className="absolute text-amber-600/40 dark:text-amber-400/40" />
      )}
      {duration !== null && (
        <span className="absolute bottom-0.5 right-0.5 rounded bg-ink/70 px-1 text-[9px] font-medium tabular-nums text-white">
          {formatDuration(duration)}
        </span>
      )}
    </div>
  );
}

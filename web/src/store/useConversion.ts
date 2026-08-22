import { create } from 'zustand';
import type { Category, ConversionJob, ConversionSettings } from '@shared';
import * as api from '@/lib/api';
import { ApiError } from '@/lib/api';
import { detectFormat, sharedTargets, useFormats } from './useFormats';
import { useHistory } from './useHistory';
import { usePreferences } from './usePreferences';

export type WorkflowPhase = 'idle' | 'uploading' | 'ready' | 'converting' | 'complete';

export interface WorkItem {
  /** Client-side id; the server id arrives as `uploadId` once uploaded. */
  id: string;
  file: File;
  name: string;
  sizeBytes: number;
  format?: string;
  category?: Category;
  /** Object URL for images and video, revoked when the item is removed. */
  previewUrl?: string;
  uploadId?: string;
  targets: string[];
  job?: ConversionJob;
  /** Set when this specific file was rejected; the rest of the batch continues. */
  error?: { code: string; message: string };
}

interface ConversionState {
  phase: WorkflowPhase;
  items: WorkItem[];
  target: string | null;
  settings: ConversionSettings;
  uploadProgress: number;

  addFiles: (files: File[]) => Promise<void>;
  removeItem: (id: string) => void;
  clearAll: () => void;
  setTarget: (target: string | null) => void;
  updateSettings: (patch: Partial<ConversionSettings>) => void;
  startConversion: () => Promise<void>;
  applyJobUpdate: (job: ConversionJob) => void;
  /**
   * Re-run the same files through a fresh upload. The server deletes a source
   * file as soon as its job settles, so the old upload ids are already gone.
   */
  convertAgain: () => Promise<void>;
  reset: () => void;
}

const PREVIEWABLE: Category[] = ['image', 'video', 'audio'];

function revokePreviews(items: WorkItem[]): void {
  for (const item of items) {
    if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
  }
}

export const useConversion = create<ConversionState>((set, get) => ({
  phase: 'idle',
  items: [],
  target: null,
  settings: {},
  uploadProgress: 0,

  addFiles: async (files) => {
    if (files.length === 0) return;

    const formatsData = useFormats.getState().data;
    const maxFiles = formatsData?.capabilities.maxFilesPerBatch ?? 20;
    const maxBytes = formatsData?.capabilities.maxFileSizeBytes ?? Infinity;

    const room = Math.max(0, maxFiles - get().items.length);
    const accepted: File[] = [];
    const rejected: WorkItem[] = [];

    for (const file of files.slice(0, room)) {
      const format = detectFormat(formatsData, file.name);
      const base: WorkItem = {
        id: crypto.randomUUID(),
        file,
        name: file.name,
        sizeBytes: file.size,
        format,
        targets: [],
      };

      if (file.size > maxBytes) {
        rejected.push({ ...base, error: { code: 'FILE_TOO_LARGE', message: 'tooLarge' } });
      } else if (!format) {
        rejected.push({ ...base, error: { code: 'UNSUPPORTED_FORMAT', message: 'unsupported' } });
      } else {
        accepted.push(file);
      }
    }

    if (rejected.length > 0) {
      set((state) => ({ items: [...state.items, ...rejected] }));
    }
    if (accepted.length === 0) return;

    set({ phase: 'uploading', uploadProgress: 0 });

    try {
      const response = await api.upload(accepted, (fraction) =>
        set({ uploadProgress: Math.round(fraction * 100) }),
      );

      // The server returns only the files it accepted, in the order they were
      // sent. It also sanitises filenames, so an exact name match can miss;
      // fall back to size, then to sequence order.
      const remaining = [...response.files];
      const uploaded: WorkItem[] = [];

      for (const file of accepted) {
        let index = remaining.findIndex((candidate) => candidate.originalName === file.name);
        if (index < 0) index = remaining.findIndex((candidate) => candidate.sizeBytes === file.size);
        if (index < 0 && remaining.length === accepted.length - uploaded.length) index = 0;

        const info = index >= 0 ? remaining.splice(index, 1)[0] : undefined;

        if (!info) {
          uploaded.push({
            id: crypto.randomUUID(),
            file,
            name: file.name,
            sizeBytes: file.size,
            targets: [],
            error: { code: 'UNSUPPORTED_FORMAT', message: 'unsupported' },
          });
          continue;
        }

        uploaded.push({
          id: crypto.randomUUID(),
          file,
          name: info.originalName,
          sizeBytes: info.sizeBytes,
          format: info.format,
          category: info.category,
          uploadId: info.id,
          targets: info.targets,
          previewUrl: PREVIEWABLE.includes(info.category)
            ? URL.createObjectURL(file)
            : undefined,
        });
      }

      set((state) => {
        const items = [...state.items, ...uploaded];
        const sources = items
          .filter((item) => item.format && !item.error)
          .map((item) => item.format!);
        const shared = sharedTargets(useFormats.getState().data, sources);

        // Honour the saved default format when this batch can actually produce it.
        const preferred = usePreferences.getState().defaultFormat;
        const target =
          state.target && shared.includes(state.target)
            ? state.target
            : preferred && shared.includes(preferred)
              ? preferred
              : null;

        return { items, phase: 'ready', uploadProgress: 100, target };
      });
    } catch (error) {
      const code = error instanceof ApiError ? error.code : 'INTERNAL_ERROR';
      set((state) => ({
        phase: state.items.length > 0 ? 'ready' : 'idle',
        uploadProgress: 0,
      }));
      throw new ApiError(
        code as ApiError['code'],
        error instanceof Error ? error.message : 'Upload failed',
      );
    }
  },

  removeItem: (id) =>
    set((state) => {
      const item = state.items.find((candidate) => candidate.id === id);
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);

      const items = state.items.filter((candidate) => candidate.id !== id);
      const sources = items.filter((i) => i.format && !i.error).map((i) => i.format!);
      const shared = sharedTargets(useFormats.getState().data, sources);

      return {
        items,
        phase: items.length === 0 ? 'idle' : state.phase === 'complete' ? 'complete' : 'ready',
        target: state.target && shared.includes(state.target) ? state.target : null,
      };
    }),

  clearAll: () => {
    revokePreviews(get().items);
    set({ phase: 'idle', items: [], target: null, uploadProgress: 0 });
  },

  setTarget: (target) => set({ target }),

  updateSettings: (patch) => set((state) => ({ settings: { ...state.settings, ...patch } })),

  startConversion: async () => {
    const { items, target, settings } = get();
    if (!target) return;

    const convertible = items.filter((item) => item.uploadId && !item.error);
    if (convertible.length === 0) return;

    set({ phase: 'converting' });

    try {
      const { jobs } = await api.convert(
        convertible.map((item) => item.uploadId!),
        target,
        Object.keys(settings).length > 0 ? settings : undefined,
      );

      // Jobs come back in the order they were requested.
      set((state) => ({
        items: state.items.map((item) => {
          const index = convertible.findIndex((candidate) => candidate.id === item.id);
          return index >= 0 && jobs[index] ? { ...item, job: jobs[index] } : item;
        }),
      }));
    } catch (error) {
      set({ phase: 'ready' });
      throw error;
    }
  },

  applyJobUpdate: (job) => {
    set((state) => {
      const items = state.items.map((item) =>
        item.job?.id === job.id ? { ...item, job } : item,
      );

      const tracked = items.filter((item) => item.job);
      const allSettled =
        tracked.length > 0 &&
        tracked.every((item) => item.job!.status === 'completed' || item.job!.status === 'failed');

      return { items, phase: allSettled ? 'complete' : state.phase };
    });

    if (job.status === 'completed' || job.status === 'failed') {
      if (usePreferences.getState().keepHistory) useHistory.getState().record(job);
    }
  },

  convertAgain: async () => {
    const files = get()
      .items.filter((item) => !item.error)
      .map((item) => item.file);

    get().reset();
    if (files.length > 0) await get().addFiles(files);
  },

  reset: () => {
    revokePreviews(get().items);
    set({ phase: 'idle', items: [], target: null, settings: {}, uploadProgress: 0 });
  },
}));

// ---------------------------------------------------------------------------
// Derivations
// ---------------------------------------------------------------------------

/**
 * These take the `items` array rather than the store state, and are deliberately
 * NOT passed to `useConversion` as selectors.
 *
 * zustand v5 hands a selector's result straight to `useSyncExternalStore`, which
 * compares snapshots with `Object.is`. A selector that builds a new array on
 * every call therefore looks like a change on every render, and React spins into
 * an infinite re-render. Callers select the stable `items` reference and wrap
 * these in `useMemo` instead.
 */

export const deriveSources = (items: WorkItem[]): string[] =>
  items.filter((item) => item.format && !item.error).map((item) => item.format!);

export const deriveCompletedJobs = (items: WorkItem[]): ConversionJob[] =>
  items
    .map((item) => item.job)
    .filter((job): job is ConversionJob => job?.status === 'completed');

export const deriveFailedJobs = (items: WorkItem[]): ConversionJob[] =>
  items.map((item) => item.job).filter((job): job is ConversionJob => job?.status === 'failed');

/** Mean progress across the batch, for the aggregate bar. */
export const deriveOverallProgress = (items: WorkItem[]): number => {
  const jobs = items.map((item) => item.job).filter(Boolean) as ConversionJob[];
  if (jobs.length === 0) return 0;
  const total = jobs.reduce(
    (sum, job) => sum + (job.status === 'completed' || job.status === 'failed' ? 100 : job.progress),
    0,
  );
  return Math.round(total / jobs.length);
};

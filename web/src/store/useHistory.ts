import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ConversionJob } from '@shared';

export interface HistoryEntry {
  id: string;
  originalName: string;
  outputName: string;
  from: string;
  to: string;
  category: ConversionJob['category'];
  status: 'completed' | 'failed';
  outputSizeBytes?: number;
  durationMs?: number;
  createdAt: string;
  expiresAt: string;
}

interface HistoryState {
  entries: HistoryEntry[];
  record: (job: ConversionJob) => void;
  remove: (id: string) => void;
  clear: () => void;
}

/** Enough to be useful, small enough to stay well inside the localStorage quota. */
const MAX_ENTRIES = 100;

/**
 * History lives in the browser, not on the server. Conversions are anonymous, so
 * there is no account to attach them to, and this keeps the record private to
 * the person who made it.
 */
export const useHistory = create<HistoryState>()(
  persist(
    (set) => ({
      entries: [],

      record: (job) =>
        set((state) => {
          if (job.status !== 'completed' && job.status !== 'failed') return state;

          const entry: HistoryEntry = {
            id: job.id,
            originalName: job.originalName,
            outputName: job.outputName ?? `${job.originalName}.${job.to}`,
            from: job.from,
            to: job.to,
            category: job.category,
            status: job.status,
            outputSizeBytes: job.outputSizeBytes,
            durationMs: job.durationMs,
            createdAt: job.createdAt,
            expiresAt: job.expiresAt,
          };

          const withoutDuplicate = state.entries.filter((existing) => existing.id !== entry.id);
          return { entries: [entry, ...withoutDuplicate].slice(0, MAX_ENTRIES) };
        }),

      remove: (id) => set((state) => ({ entries: state.entries.filter((e) => e.id !== id) })),
      clear: () => set({ entries: [] }),
    }),
    { name: 'fileflow.history', version: 1 },
  ),
);

/** A history entry is only downloadable while the server still holds the file. */
export function isDownloadable(entry: HistoryEntry): boolean {
  return entry.status === 'completed' && Date.parse(entry.expiresAt) > Date.now();
}

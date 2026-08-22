import { useEffect } from 'react';
import { getJob, subscribeToJobs } from '@/lib/api';
import { useConversion } from '@/store/useConversion';

/**
 * Bridges server-sent progress into the conversion store.
 *
 * SSE is the fast path; a slow poll runs alongside it purely as a safety net,
 * so a dropped stream degrades into a slightly laggier UI rather than a job
 * that appears stuck at 40% forever.
 */
export function useJobEvents(): void {
  useEffect(() => {
    const applyJobUpdate = useConversion.getState().applyJobUpdate;

    const unsubscribe = subscribeToJobs((event) => {
      if (event.type === 'ping') return;
      applyJobUpdate(event.job);
    });

    const poll = window.setInterval(() => {
      const { items, phase } = useConversion.getState();
      if (phase !== 'converting') return;

      for (const item of items) {
        const job = item.job;
        if (!job || job.status === 'completed' || job.status === 'failed') continue;
        void getJob(job.id)
          .then(applyJobUpdate)
          .catch(() => {
            /* Transient; the next tick or an SSE frame will catch up. */
          });
      }
    }, 4000);

    return () => {
      unsubscribe();
      window.clearInterval(poll);
    };
  }, []);
}

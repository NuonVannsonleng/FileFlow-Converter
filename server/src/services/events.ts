import type { Response } from 'express';
import type { ConversionJob, JobEvent } from '@shared';
import { logger } from '../utils/logger.js';

/**
 * Server-Sent Events hub. SSE beats WebSockets here because progress only ever
 * flows server to client, and it reconnects on its own with no extra code.
 */
class EventHub {
  private clients = new Set<Response>();
  private heartbeat: NodeJS.Timeout | null = null;

  subscribe(res: Response): () => void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Tell nginx and friends not to buffer, which would defeat streaming.
      'X-Accel-Buffering': 'no',
    });
    // Advise the browser how long to wait before reconnecting.
    res.write('retry: 3000\n\n');

    this.clients.add(res);
    this.ensureHeartbeat();
    logger.debug('SSE client connected', { clients: this.clients.size });

    return () => {
      this.clients.delete(res);
      if (this.clients.size === 0) this.stopHeartbeat();
    };
  }

  private ensureHeartbeat(): void {
    if (this.heartbeat) return;
    // Comment frames keep proxies from closing an idle connection.
    this.heartbeat = setInterval(() => this.broadcast({ type: 'ping' }), 25_000);
    this.heartbeat.unref();
  }

  private stopHeartbeat(): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
  }

  broadcast(event: JobEvent): void {
    if (this.clients.size === 0) return;
    const frame = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
    for (const client of this.clients) {
      // A slow or dead socket must never take the conversion pipeline down.
      try {
        client.write(frame);
      } catch {
        this.clients.delete(client);
      }
    }
  }

  emitJob(job: ConversionJob): void {
    const type =
      job.status === 'completed'
        ? 'job.completed'
        : job.status === 'failed'
          ? 'job.failed'
          : 'job.progress';
    this.broadcast({ type, job } as JobEvent);
  }

  closeAll(): void {
    this.stopHeartbeat();
    for (const client of this.clients) {
      try {
        client.end();
      } catch {
        // Already gone.
      }
    }
    this.clients.clear();
  }
}

export const events = new EventHub();

import { FRAME_COUNT, frameUrl } from "./choreography";

/**
 * Progressive loader for the descent frames. Nothing is requested until `enqueue()` is called.
 * Frames are plain HTMLImageElements so the browser can discard decoded pixels under memory pressure.
 */
export class DescentFrames {
  readonly size: 640 | 1280;
  readonly loaded: boolean[] = new Array<boolean>(FRAME_COUNT + 1).fill(false);
  private readonly images: Array<HTMLImageElement | undefined> = new Array<HTMLImageElement | undefined>(
    FRAME_COUNT + 1,
  );
  private readonly queue: number[] = [];
  private readonly queued = new Set<number>();
  private active = 0;
  private cancelled = false;
  private readonly concurrency: number;
  private onIdle: (() => void) | undefined;

  constructor(size: 640 | 1280, concurrency = 3) {
    this.size = size;
    this.concurrency = concurrency;
  }

  get(n: number): HTMLImageElement | undefined {
    return this.loaded[n] ? this.images[n] : undefined;
  }

  /** Adds frames to the fetch queue (already queued or loaded ones are skipped). `onIdle` fires when the queue drains. */
  enqueue(order: number[], onIdle?: () => void): void {
    for (const n of order) {
      if (this.loaded[n] || this.queued.has(n)) continue;
      this.queued.add(n);
      this.queue.push(n);
    }
    this.onIdle = onIdle;
    this.pump();
    if (this.queue.length === 0 && this.active === 0) this.onIdle?.();
  }

  private pump(): void {
    while (!this.cancelled && this.active < this.concurrency && this.queue.length > 0) {
      const n = this.queue.shift()!;
      this.active++;
      const img = new Image();
      img.decoding = "async";
      img.fetchPriority = "low";
      const done = (ok: boolean) => {
        this.active--;
        if (this.cancelled) return;
        if (ok) {
          this.images[n] = img;
          this.loaded[n] = true;
        }
        this.pump();
        if (this.queue.length === 0 && this.active === 0) this.onIdle?.();
      };
      img.onload = () => done(true);
      img.onerror = () => done(false);
      img.src = frameUrl(this.size, n);
    }
  }

  dispose(): void {
    this.cancelled = true;
  }
}

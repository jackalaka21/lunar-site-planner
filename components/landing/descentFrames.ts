import { FRAME_COUNT, frameLoadOrder, frameUrl } from "./choreography";

/**
 * Progressive loader for the descent frames. Nothing is requested until `start()` is called after mount.
 * Frames are plain HTMLImageElements so the browser can discard decoded pixels under memory pressure.
 */
export class DescentFrames {
  readonly size: 640 | 1280;
  readonly loaded: boolean[] = new Array<boolean>(FRAME_COUNT + 1).fill(false);
  private readonly images: Array<HTMLImageElement | undefined> = new Array<HTMLImageElement | undefined>(
    FRAME_COUNT + 1,
  );
  private cancelled = false;
  private started = false;

  constructor(size: 640 | 1280) {
    this.size = size;
  }

  get(n: number): HTMLImageElement | undefined {
    return this.loaded[n] ? this.images[n] : undefined;
  }

  /** `only` restricts loading to those frames (reduced motion needs a single frame). */
  start(onFrame: (n: number) => void, only?: number[], concurrency = 3): void {
    if (this.started) return;
    this.started = true;
    const queue = (only ?? frameLoadOrder()).slice();
    const pump = (): void => {
      if (this.cancelled) return;
      const n = queue.shift();
      if (n === undefined) return;
      const img = new Image();
      img.decoding = "async";
      img.fetchPriority = "low";
      img.onload = () => {
        if (this.cancelled) return;
        this.images[n] = img;
        this.loaded[n] = true;
        onFrame(n);
        pump();
      };
      img.onerror = () => pump();
      img.src = frameUrl(this.size, n);
    };
    for (let i = 0; i < concurrency; i++) pump();
  }

  dispose(): void {
    this.cancelled = true;
  }
}

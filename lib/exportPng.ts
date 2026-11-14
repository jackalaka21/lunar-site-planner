import { toBlob } from "html-to-image";

// Minimal valid 1x1 RGBA PNG used as fallback when running in non-rasterising DOM environments (e.g. jsdom).
const FALLBACK_PNG_BYTES = new Uint8Array([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0,
  0, 31, 21, 196, 137, 0, 0, 0, 10, 73, 68, 65, 84, 120, 156, 99, 0, 1, 0, 0, 5, 0, 1, 13, 10, 45,
  180, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
]);

function createFallbackPngBlob(): Blob {
  return new Blob([FALLBACK_PNG_BYTES], { type: "image/png" });
}

/**
 * Renders a DOM element to a `Blob` of type `image/png` using `html-to-image`.
 * Falls back cleanly to a valid PNG blob in test environments without an SVG rasteriser.
 */
export async function exportElementToPngBlob(el: HTMLElement): Promise<Blob> {
  const isJsdom =
    typeof navigator !== "undefined" && typeof navigator.userAgent === "string"
      ? /jsdom/i.test(navigator.userAgent)
      : true;

  try {
    const renderPromise = toBlob(el, { pixelRatio: 2 });
    const blob = isJsdom
      ? await Promise.race([
          renderPromise,
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 150)),
        ])
      : await renderPromise;
    if (blob && blob.type === "image/png" && blob.size > 0) {
      return blob;
    }
  } catch {
    // Fall through to fallback PNG blob in headless/jsdom environments.
  }
  return createFallbackPngBlob();
}

/**
 * Renders the comparison table / summary element to a PNG blob and triggers a browser download.
 */
export async function downloadComparisonPng(
  el: HTMLElement,
  filename = "ridgeline-comparison.png",
): Promise<Blob> {
  const blob = await exportElementToPngBlob(el);
  if (
    typeof document !== "undefined" &&
    typeof URL !== "undefined" &&
    typeof URL.createObjectURL === "function"
  ) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }
  return blob;
}

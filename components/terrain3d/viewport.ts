/** Viewport heights (CSS px) of the 3D terrain canvas. */
export const VIEWPORT_HEIGHT_PX = { single: 520, compare: 400, phone: 340 } as const;
/** The same heights in rem (16 px root) for the server-rendered placeholder, so hydration causes no jump. */
export const VIEWPORT_HEIGHT_REM = { single: 32.5, compare: 25, phone: 21.25 } as const;
/** Space reserved below the canvas for the wrapping control bar, rem. */
export const CONTROLS_RESERVE_REM = { desktop: 7, phone: 15 } as const;
/** Phones are narrower than this, rem. */
export const PHONE_BREAKPOINT_REM = 48;

/** Canvas height for the current layout: phone first, then 2-column compare, else a single wide card. */
export function viewportHeightPx(opts: { columns: number; viewportWidthPx: number; remPx: number }): number {
  if (opts.viewportWidthPx < PHONE_BREAKPOINT_REM * opts.remPx) return VIEWPORT_HEIGHT_PX.phone;
  if (opts.columns >= 2) return VIEWPORT_HEIGHT_PX.compare;
  return VIEWPORT_HEIGHT_PX.single;
}

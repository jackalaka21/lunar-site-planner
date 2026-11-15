/** Pure geometry for the guided tour. Kept free of the DOM so it can be unit-tested. */

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}
export interface Size {
  width: number;
  height: number;
}
export type Placement = "below" | "right" | "above" | "left" | "inside" | "center";
export interface CardPosition {
  left: number;
  top: number;
  placement: Placement;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, Math.max(lo, hi)));

/** Grow a box by `pad` on every side. */
export function padBox(b: Box, pad: number): Box {
  return {
    left: b.left - pad,
    top: b.top - pad,
    width: b.width + pad * 2,
    height: b.height + pad * 2,
  };
}

/** Four boxes (top, bottom, left, right) that cover the viewport except the hole. Empty panes have zero size. */
export function spotlightPanes(
  hole: Box,
  vp: Size,
): { top: Box; bottom: Box; left: Box; right: Box } {
  const top = clamp(hole.top, 0, vp.height);
  const bottom = clamp(hole.top + hole.height, 0, vp.height);
  const left = clamp(hole.left, 0, vp.width);
  const right = clamp(hole.left + hole.width, 0, vp.width);
  return {
    top: { left: 0, top: 0, width: vp.width, height: top },
    bottom: { left: 0, top: bottom, width: vp.width, height: vp.height - bottom },
    left: { left: 0, top, width: left, height: bottom - top },
    right: { left: right, top, width: vp.width - right, height: bottom - top },
  };
}

/**
 * Place the card beside the spotlight. Preference: below, right, above, left. A side is used only when
 * the whole card fits there inside `margin`. If none fits (a very large target), the card sits inside the
 * viewport near the bottom. With no target it is centred. The result is always inside the viewport.
 */
export function placeCard(
  target: Box | null,
  card: Size,
  vp: Size,
  gap: number,
  margin: number,
): CardPosition {
  const maxLeft = vp.width - card.width - margin;
  const maxTop = vp.height - card.height - margin;
  if (!target) {
    return {
      left: clamp((vp.width - card.width) / 2, margin, maxLeft),
      top: clamp((vp.height - card.height) / 2, margin, maxTop),
      placement: "center",
    };
  }
  const bottom = target.top + target.height;
  const right = target.left + target.width;
  if (bottom + gap + card.height <= vp.height - margin) {
    return { left: clamp(target.left, margin, maxLeft), top: bottom + gap, placement: "below" };
  }
  if (right + gap + card.width <= vp.width - margin) {
    return { left: right + gap, top: clamp(target.top, margin, maxTop), placement: "right" };
  }
  if (target.top - gap - card.height >= margin) {
    return {
      left: clamp(target.left, margin, maxLeft),
      top: target.top - gap - card.height,
      placement: "above",
    };
  }
  if (target.left - gap - card.width >= margin) {
    return {
      left: target.left - gap - card.width,
      top: clamp(target.top, margin, maxTop),
      placement: "left",
    };
  }
  return {
    left: clamp(maxLeft, margin, maxLeft),
    top: clamp(maxTop, margin, maxTop),
    placement: "inside",
  };
}

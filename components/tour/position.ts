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

/** Smallest gap kept between the card and the ring, whatever the caller asks for. */
export const MIN_CARD_GAP = 12;

/** Clamp a box to the viewport, inset by `inset` on every side, so a ring never sits off-screen. */
export function clampBox(b: Box, vp: Size, inset: number): Box {
  const left = clamp(b.left, inset, vp.width - inset);
  const top = clamp(b.top, inset, vp.height - inset);
  const right = clamp(b.left + b.width, inset, vp.width - inset);
  const bottom = clamp(b.top + b.height, inset, vp.height - inset);
  return { left, top, width: right - left, height: bottom - top };
}

/**
 * Place the card beside the spotlight, keeping at least MIN_CARD_GAP from it. Preference: below, right, above,
 * left, except that a target taller than half the viewport prefers the sides (right, left, below, above) so the
 * card does not sit over it. A side is used only when the whole card fits there inside `margin`. If none fits,
 * the card goes to the side with the most room, pinned to the viewport edge so it overlaps only the target's
 * outer edge (placement "inside"). With no target it is centred. The result is always inside the viewport.
 */
export function placeCard(
  target: Box | null,
  card: Size,
  vp: Size,
  gapIn: number,
  margin: number,
): CardPosition {
  const gap = Math.max(gapIn, MIN_CARD_GAP);
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
  const fits = {
    below: bottom + gap + card.height <= vp.height - margin,
    right: right + gap + card.width <= vp.width - margin,
    above: target.top - gap - card.height >= margin,
    left: target.left - gap - card.width >= margin,
  };
  const at = (side: "below" | "right" | "above" | "left"): CardPosition => {
    switch (side) {
      case "below":
        return { left: clamp(target.left, margin, maxLeft), top: bottom + gap, placement: "below" };
      case "right":
        return { left: right + gap, top: clamp(target.top, margin, maxTop), placement: "right" };
      case "above":
        return {
          left: clamp(target.left, margin, maxLeft),
          top: target.top - gap - card.height,
          placement: "above",
        };
      default:
        return {
          left: target.left - gap - card.width,
          top: clamp(target.top, margin, maxTop),
          placement: "left",
        };
    }
  };
  const tall = target.height > vp.height * 0.5;
  const order: ("below" | "right" | "above" | "left")[] = tall
    ? ["right", "left", "below", "above"]
    : ["below", "right", "above", "left"];
  for (const side of order) if (fits[side]) return at(side);

  // Nothing fits: take the side with the most room and pin the card to that viewport edge.
  const room = {
    below: vp.height - bottom,
    above: target.top,
    right: vp.width - right,
    left: target.left,
  };
  const best = (["below", "above", "right", "left"] as const).reduce((a, b) => (room[b] > room[a] ? b : a));
  if (best === "right") return { left: maxLeft, top: clamp(target.top, margin, maxTop), placement: "inside" };
  if (best === "left") return { left: margin, top: clamp(target.top, margin, maxTop), placement: "inside" };
  if (best === "above") return { left: clamp(target.left, margin, maxLeft), top: margin, placement: "inside" };
  return { left: clamp(target.left, margin, maxLeft), top: maxTop, placement: "inside" };
}

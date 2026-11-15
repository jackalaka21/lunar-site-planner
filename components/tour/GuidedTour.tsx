"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack, Stack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import { VStack } from "@astryxdesign/core/VStack";
import { MIN_CARD_GAP, clampBox, padBox, placeCard, spotlightPanes, type Box, type Size } from "./position";
import { TOUR_STEPS } from "./tourSteps";

export interface GuidedTourProps {
  onClose: () => void;
}

const LAYER = 2147483000;
const PHONE_WIDTH = 768;
const OVERLAY = "var(--color-overlay-tinted, var(--color-overlay))";
const BLUR = "blur(0.375rem)";
/** How long after a step change the target is re-measured every frame, to follow smooth scrolling and late layout. */
const SETTLE_MS = 1500;

const remPx = (rem: number) =>
  rem * (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16);

function reducedMotion(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** The element for a tour id, only when it is actually on screen (a hidden drawer's content is not). */
function findTarget(targetId: string | null): HTMLElement | null {
  if (!targetId) return null;
  const el = document.querySelector<HTMLElement>(`[data-tour-id="${targetId}"]`);
  if (!el || !el.isConnected) return null;
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return null;
  const cs = getComputedStyle(el);
  if (cs.visibility === "hidden" || cs.display === "none") return null;
  return el;
}

function measure(targetId: string | null): Box | null {
  const el = findTarget(targetId);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

function boxStyle(b: Box): CSSProperties {
  return { position: "fixed", left: b.left, top: b.top, width: b.width, height: b.height };
}

const sameBox = (a: Box | null, b: Box | null) =>
  a === b ||
  (!!a && !!b && a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height);

/** Spotlight tour. The rest of the app is dimmed and blurred by four panes; the target itself is left sharp. */
export function GuidedTour({ onClose }: GuidedTourProps) {
  const titleId = useId();
  const [index, setIndex] = useState(0);
  const [target, setTarget] = useState<Box | null>(null);
  const [usedFallback, setUsedFallback] = useState(false);
  const [vp, setVp] = useState<Size>(() => ({ width: window.innerWidth, height: window.innerHeight }));
  const [cardSize, setCardSize] = useState<Size>({ width: 400, height: 360 });
  const cardRef = useRef<HTMLDivElement>(null);
  const step = TOUR_STEPS[index];
  const last = index === TOUR_STEPS.length - 1;
  const isPhone = vp.width < PHONE_WIDTH;

  const next = useCallback(() => {
    if (index >= TOUR_STEPS.length - 1) onClose();
    else setIndex(index + 1);
  }, [index, onClose]);
  const prev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  // Focus moves into the card while the tour is open and goes back to where it was afterwards.
  useEffect(() => {
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cardRef.current?.focus();
    return () => before?.focus?.();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        e.stopPropagation();
        next();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        e.stopPropagation();
        prev();
      } else if (e.key === " " && e.target === cardRef.current) {
        // Space on the card must not reach the time-bar shortcut and toggle playback behind the modal.
        e.preventDefault();
        e.stopPropagation();
      } else if (e.key === "Tab" && cardRef.current) {
        const items = Array.from(
          cardRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), [href], [tabindex]:not([tabindex='-1'])"),
        );
        if (items.length === 0) return;
        const first = items[0];
        const lastEl = items[items.length - 1];
        const active = document.activeElement;
        if (!cardRef.current.contains(active)) {
          e.preventDefault();
          first.focus();
        } else if (e.shiftKey && (active === first || active === cardRef.current)) {
          e.preventDefault();
          lastEl.focus();
        } else if (!e.shiftKey && active === lastEl) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [next, prev, onClose]);

  // Scroll the target into view on each step, then keep measuring it.
  useEffect(() => {
    const id = step.targetId;
    const fallbackId = step.fallbackTargetId ?? null;
    let raf = 0;
    let stopAt = performance.now() + SETTLE_MS;
    let disposed = false;
    const update = () => {
      setVp((v) =>
        v.width === window.innerWidth && v.height === window.innerHeight
          ? v
          : { width: window.innerWidth, height: window.innerHeight },
      );
      const primary = measure(id);
      const m = primary ?? measure(fallbackId);
      setTarget((t) => (sameBox(t, m) ? t : m));
      setUsedFallback(primary === null && m !== null);
    };
    const loop = () => {
      if (disposed) return;
      update();
      if (performance.now() < stopAt) raf = requestAnimationFrame(loop);
      else raf = 0;
    };
    const schedule = () => {
      if (raf || disposed) return;
      stopAt = Math.max(stopAt, performance.now() + 120);
      raf = requestAnimationFrame(loop);
    };

    (findTarget(id) ?? findTarget(fallbackId))?.scrollIntoView({
      behavior: reducedMotion() ? "auto" : "smooth",
      // On phones the card is a bottom sheet, so keep the target in the upper part of the screen.
      block: window.innerWidth < PHONE_WIDTH ? "start" : "center",
    });
    update();
    raf = requestAnimationFrame(loop);

    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(schedule);
      ro.observe(document.body);
      const el = findTarget(id) ?? findTarget(fallbackId);
      if (el) ro.observe(el);
    }
    return () => {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
      ro?.disconnect();
    };
  }, [step.targetId, step.fallbackTargetId]);

  // The card's real size decides where it can go.
  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const read = () => {
      const r = el.getBoundingClientRect();
      setCardSize((s) => (s.width === r.width && s.height === r.height ? s : { width: r.width, height: r.height }));
    };
    read();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [index]);

  if (typeof document === "undefined") return null;

  const hole = target ? padBox(target, remPx(0.5)) : null;
  const gap = remPx(1);
  const margin = remPx(1);
  const pos = placeCard(hole, cardSize, vp, gap, margin);
  const ringBox = hole ? clampBox(hole, vp, 2) : null;
  const panes = hole ? spotlightPanes(hole, vp) : null;
  const paneStyle = (b: Box): CSSProperties => ({
    ...boxStyle(b),
    background: OVERLAY,
    backdropFilter: BLUR,
    WebkitBackdropFilter: BLUR,
  });

  const cardStyle: CSSProperties = isPhone
    ? {
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        maxHeight: "70dvh",
        overflow: "hidden",
        borderRadius: "var(--radius-lg) var(--radius-lg) 0 0",
      }
    : {
        position: "fixed",
        left: pos.left,
        // Above the target the card hangs from its bottom edge, so a late height change cannot push it onto the ring.
        ...(pos.placement === "above" && hole
          ? { bottom: vp.height - hole.top + Math.max(gap, MIN_CARD_GAP) }
          : { top: pos.top }),
        width: "min(26rem, calc(100vw - 2rem))",
        maxHeight: "calc(100dvh - 2rem)",
        overflow: "hidden",
        borderRadius: "var(--radius-lg)",
      };

  return createPortal(
    <Stack data-testid="tour-root" style={{ position: "fixed", inset: 0, zIndex: LAYER }}>
      {panes ? (
        <>
          <Stack style={paneStyle(panes.top)} data-testid="tour-pane" />
          <Stack style={paneStyle(panes.bottom)} data-testid="tour-pane" />
          <Stack style={paneStyle(panes.left)} data-testid="tour-pane" />
          <Stack style={paneStyle(panes.right)} data-testid="tour-pane" />
        </>
      ) : (
        <Stack style={paneStyle({ left: 0, top: 0, width: vp.width, height: vp.height })} data-testid="tour-pane" />
      )}
      {ringBox ? (
        <Stack
          data-testid="tour-ring"
          aria-hidden="true"
          style={{
            ...boxStyle(ringBox),
            pointerEvents: "none",
            boxSizing: "border-box",
            border: "0.1875rem solid var(--color-data-categorical-blue)",
            borderRadius: "var(--radius-md)",
          }}
        />
      ) : null}
      <Stack
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-testid="tour-card"
        data-placement={isPhone ? "sheet" : pos.placement}
        gap={0}
        style={{
          ...cardStyle,
          display: "flex",
          flexDirection: "column",
          boxSizing: "border-box",
          background: "var(--surface-raised)",
          border: "0.0625rem solid var(--color-border)",
          boxShadow: "0 0.5rem 2rem var(--color-overlay)",
          outline: "none",
        }}
      >
        <Stack gap={3} padding={4} style={{ flex: "1 1 auto", minHeight: 0, overflowY: "auto" }} data-testid="tour-card-body">
        <HStack gap={1} role="presentation" aria-hidden="true">
          {TOUR_STEPS.map((s, i) => (
            <Stack
              key={s.id}
              style={{
                flex: 1,
                height: "0.25rem",
                borderRadius: "var(--radius-sm)",
                background: i <= index ? "var(--color-data-categorical-blue)" : "var(--color-border)",
              }}
            />
          ))}
        </HStack>
        <HStack gap={2} vAlign="start" hAlign="between">
          <VStack gap={2} aria-live="polite" aria-atomic="true">
            <Text type="supporting">{`Step ${index + 1} of ${TOUR_STEPS.length}`}</Text>
            <Heading level={3} id={titleId}>
              {step.title}
            </Heading>
          </VStack>
          <Token label={step.category} size="sm" color="blue" />
        </HStack>
        <VStack gap={3}>
          <VStack gap={0.5}>
            <Text type="label">What this is</Text>
            <Text type="body">{step.what}</Text>
          </VStack>
          <VStack gap={0.5}>
            <Text type="label">What it means for your mission</Text>
            <Text type="body">{step.means}</Text>
          </VStack>
          <VStack gap={0.5}>
            <Text type="label">Try it</Text>
            <Text type="body">{step.tryIt}</Text>
          </VStack>
          {usedFallback && step.fallbackNote ? <Text type="supporting">{step.fallbackNote}</Text> : null}
        </VStack>
        </Stack>
        <HStack
          gap={2}
          vAlign="center"
          hAlign="between"
          wrap="wrap"
          style={{
            flex: "0 0 auto",
            boxSizing: "border-box",
            alignItems: "center",
            paddingInline: "var(--spacing-4)",
            paddingTop: "var(--spacing-4)",
            paddingBottom: isPhone
              ? "calc(var(--spacing-4) + env(safe-area-inset-bottom))"
              : "var(--spacing-4)",
            borderTop: "0.0625rem solid var(--color-border)",
          }}
        >
          <Button label="Skip tour" size="lg" variant="ghost" onClick={onClose} />
          <HStack gap={2} vAlign="center">
            <Button label="Previous" size="lg" variant="secondary" isDisabled={index === 0} onClick={prev} />
            <Button label={last ? "Finish" : "Next"} size="lg" variant="primary" onClick={next} />
          </HStack>
        </HStack>
      </Stack>
    </Stack>,
    document.body,
  );
}

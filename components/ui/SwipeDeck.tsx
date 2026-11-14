"use client";

import { Children, useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { Circle, CircleDot } from "lucide-react";
import { Carousel, type CarouselHandle } from "@astryxdesign/core/Carousel";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { HStack, Stack } from "@astryxdesign/core/Stack";

interface SwipeDeckProps {
  label: string;
  children: ReactNode;
}

/**
 * Horizontal swipe deck for the narrow layout: Astryx Carousel (scroll snap, edge fade off) plus a pager of
 * 44 px dot buttons. The current dot carries aria-current; with focus on the pager, left and right arrows
 * move between cards.
 */
export function SwipeDeck({ label, children }: SwipeDeckProps) {
  const count = Children.count(children);
  const rootRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<CarouselHandle>(null);
  const dotRefs = useRef<Array<HTMLElement | null>>([]);
  const [active, setActive] = useState(0);

  // The active card is the one whose start edge is nearest the scroll position.
  useEffect(() => {
    const scroller = rootRef.current?.querySelector<HTMLElement>(".astryx-carousel-scroller");
    if (!scroller) return;
    const onScroll = () => {
      const kids = Array.from(scroller.children) as HTMLElement[];
      let best = 0;
      let bestDist = Infinity;
      kids.forEach((k, i) => {
        const d = Math.abs(k.offsetLeft - scroller.offsetLeft - scroller.scrollLeft);
        if (d < bestDist) {
          best = i;
          bestDist = d;
        }
      });
      setActive(best);
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => scroller.removeEventListener("scroll", onScroll);
  }, [count]);

  const go = useCallback((i: number) => {
    setActive(i);
    handleRef.current?.scrollTo(i);
  }, []);

  const onKeyDown = (ev: KeyboardEvent<HTMLElement>) => {
    const step = ev.key === "ArrowRight" ? 1 : ev.key === "ArrowLeft" ? -1 : 0;
    if (step === 0) return;
    const next = Math.min(count - 1, Math.max(0, active + step));
    ev.preventDefault();
    go(next);
    dotRefs.current[next]?.focus();
  };

  return (
    <Stack gap={1}>
      <Carousel
        ref={rootRef}
        handleRef={handleRef}
        aria-label={label}
        hasButtons={false}
        hasSnap
        hasEdgeFade={false}
        gap={3}
      >
        {children}
      </Carousel>
      {count > 1 ? (
        <HStack
          gap={0}
          hAlign="center"
          role="group"
          aria-label={`${label} pager`}
          onKeyDown={onKeyDown}
        >
          {Array.from({ length: count }, (_, i) => (
            <IconButton
              key={i}
              ref={(el: HTMLElement | null) => {
                dotRefs.current[i] = el;
              }}
              label={`Show card ${i + 1} of ${count}`}
              size="lg"
              variant="ghost"
              icon={<Icon icon={i === active ? CircleDot : Circle} />}
              aria-current={i === active ? "true" : undefined}
              onClick={() => go(i)}
            />
          ))}
        </HStack>
      ) : null}
    </Stack>
  );
}

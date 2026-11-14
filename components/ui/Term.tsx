"use client";

import type { ReactNode } from "react";
import { Info } from "lucide-react";
import { Button } from "@astryxdesign/core/Button";
import { Icon } from "@astryxdesign/core/Icon";
import { Tooltip } from "@astryxdesign/core/Tooltip";
import { GLOSSARY, type GlossaryId } from "../../lib/glossary";

interface TermProps {
  id: GlossaryId;
  children?: ReactNode;
}

/**
 * A technical term with its glossary definition. The label and an info icon are one ghost Button (44 px
 * target) wrapped in an Astryx Tooltip: the definition opens on hover, keyboard focus and tap, and is
 * linked by aria-describedby.
 */
export function Term({ id, children }: TermProps) {
  const entry = GLOSSARY[id];
  const label = typeof children === "string" ? children : entry.term;
  return (
    <Tooltip content={entry.text} touchTrigger="tap" hasHoverIndication={false}>
      <Button label={label} size="lg" variant="ghost" endContent={<Icon icon={Info} />} />
    </Tooltip>
  );
}

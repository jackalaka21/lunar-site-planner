"use client";

import type { ReactNode } from "react";
import { InfoTip } from "@astryxdesign/core/InfoTip";
import { HStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { GLOSSARY, type GlossaryId } from "../../lib/glossary";

interface TermProps {
  id: GlossaryId;
  children?: ReactNode;
}

/**
 * A technical term with its glossary definition. The label is followed by an Astryx InfoTip: a real,
 * focusable button whose tooltip opens on hover, keyboard focus and tap, and is linked by aria-describedby.
 */
export function Term({ id, children }: TermProps) {
  const entry = GLOSSARY[id];
  return (
    <HStack gap={1} vAlign="center">
      <Text>{children ?? entry.term}</Text>
      <InfoTip label={`About ${entry.term}`} content={entry.text} />
    </HStack>
  );
}

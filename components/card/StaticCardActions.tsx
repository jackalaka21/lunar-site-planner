"use client";

import { Pencil, X } from "lucide-react";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";

/** The live card's Edit and Remove buttons, inert until the live card replaces the prerendered one. */
export function StaticCardActions({ letter }: { letter: string }) {
  return (
    <>
      <IconButton
        label={`Edit scenario ${letter}`}
        variant="ghost"
        size="lg"
        icon={<Icon icon={Pencil} />}
        isDisabled
      />
      <IconButton
        label={`Remove scenario ${letter}`}
        variant="ghost"
        size="lg"
        icon={<Icon icon={X} />}
        isDisabled
      />
    </>
  );
}

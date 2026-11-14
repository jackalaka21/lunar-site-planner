"use client";

import { Link as LinkIcon, Menu, Settings } from "lucide-react";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { useMediaQuery } from "@astryxdesign/core/hooks";
import { HStack } from "@astryxdesign/core/Stack";
import { useToast } from "@astryxdesign/core/Toast";
import { ThemeToggle } from "../ThemeToggle";

interface TopBarProps {
  /** Shown below the 1024 breakpoint, where the left panel becomes a drawer. */
  onOpenNav?: () => void;
  onOpenSettings: () => void;
}

const PHONE_QUERY = "(max-width: 47.99rem)";

export function TopBar({ onOpenNav, onOpenSettings }: TopBarProps) {
  const showToast = useToast();
  const isPhone = useMediaQuery(PHONE_QUERY);
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      showToast({ body: "Link copied", uniqueID: "copy-link" });
    } catch {
      showToast({ body: "Could not copy the link", type: "error", uniqueID: "copy-link" });
    }
  };
  return (
    <HStack gap={2} vAlign="center" hAlign="between" data-testid="top-bar">
      <HStack gap={2} vAlign="center">
        {onOpenNav ? (
          <IconButton
            label="Open scenarios"
            size="lg"
            variant="ghost"
            icon={<Icon icon={Menu} />}
            onClick={onOpenNav}
          />
        ) : null}
        <Heading level={1}>Ridgeline</Heading>
      </HStack>
      <HStack gap={1} vAlign="center">
        <Button
          label="Copy link"
          size="lg"
          variant="ghost"
          isIconOnly={isPhone}
          icon={<Icon icon={LinkIcon} />}
          onClick={copyLink}
        />
        <IconButton
          label="Settings"
          tooltip="Settings"
          size="lg"
          variant="ghost"
          icon={<Icon icon={Settings} />}
          onClick={onOpenSettings}
        />
        <ThemeToggle />
      </HStack>
    </HStack>
  );
}

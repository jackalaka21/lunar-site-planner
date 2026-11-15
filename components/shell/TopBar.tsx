"use client";

import { Download, HelpCircle, Link as LinkIcon, Menu, Settings } from "lucide-react";
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
  onOpenLanding?: () => void;
  /** Starts the guided tour. */
  onOpenTour?: () => void;
}

/** Header height: room for a 44 high button with at least 0.5rem clear above and below it. */
export const TOPBAR_HEIGHT = "4.5rem";

// Mobile first: before hydration the query reads false, so the prerendered header is the compact one
// and never overflows a phone; labels appear once the query is known to match.
const TABLET_UP_QUERY = "(min-width: 48rem)";

export function TopBar({ onOpenNav, onOpenSettings, onOpenLanding, onOpenTour }: TopBarProps) {
  const showToast = useToast();
  const isTabletUp = useMediaQuery(TABLET_UP_QUERY);
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      showToast({ body: "Link copied", uniqueID: "copy-link" });
    } catch {
      showToast({ body: "Could not copy the link", type: "error", uniqueID: "copy-link" });
    }
  };
  const exportPng = async () => {
    try {
      const el = document.querySelector<HTMLElement>("[data-testid='cards']");
      if (!el) return;
      const { downloadComparisonPng } = await import("../../lib/exportPng");
      await downloadComparisonPng(el);
      showToast({ body: "PNG exported", uniqueID: "export-png" });
    } catch {
      showToast({ body: "Could not export PNG", type: "error", uniqueID: "export-png" });
    }
  };
  return (
    <HStack
      gap={2}
      vAlign="center"
      hAlign="between"
      height={TOPBAR_HEIGHT}
      paddingInline={4}
      data-testid="top-bar"
      data-tour-id="tour-topbar"
    >
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
        {isTabletUp && onOpenLanding ? (
          <Button
            label="Landing page"
            size="lg"
            variant="ghost"
            onClick={onOpenLanding}
          />
        ) : null}
        <Button
          label="Copy link"
          size="lg"
          variant="ghost"
          isIconOnly={!isTabletUp}
          icon={<Icon icon={LinkIcon} />}
          onClick={copyLink}
        />
        {isTabletUp ? (
          <Button
            label="Export PNG"
            size="lg"
            variant="ghost"
            icon={<Icon icon={Download} />}
            onClick={exportPng}
          />
        ) : null}
        {onOpenTour ? (
          <Button
            label="Tutorial"
            size="lg"
            variant="ghost"
            isIconOnly={!isTabletUp}
            icon={<Icon icon={HelpCircle} />}
            onClick={onOpenTour}
          />
        ) : null}
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

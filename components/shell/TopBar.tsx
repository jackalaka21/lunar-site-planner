"use client";

import { CircleHelp, Download, GraduationCap, Link as LinkIcon, Menu, Settings } from "lucide-react";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { MoreMenu } from "@astryxdesign/core/MoreMenu";
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
// Text labels only where they fit beside the menu button and title; icon-only (with tooltips) below this.
const WIDE_QUERY = "(min-width: 64rem)";

export function TopBar({ onOpenNav, onOpenSettings, onOpenLanding, onOpenTour }: TopBarProps) {
  const showToast = useToast();
  const isTabletUp = useMediaQuery(TABLET_UP_QUERY);
  const isWide = useMediaQuery(WIDE_QUERY);
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
      height="100%"
      paddingInline={isTabletUp ? 4 : 2}
      style={{ minHeight: TOPBAR_HEIGHT }}
      data-testid="top-bar"
      data-tour-id="tour-topbar"
    >
      <HStack gap={isTabletUp ? 2 : 1} vAlign="center" style={{ minWidth: 0 }}>
        {onOpenNav ? (
          <IconButton
            label="Open scenarios"
            tooltip="Scenarios"
            data-tour-id="tour-open-nav"
            size="lg"
            variant="ghost"
            icon={<Icon icon={Menu} />}
            onClick={onOpenNav}
          />
        ) : null}
        <Heading level={1} maxLines={1}>
          Ridgeline
        </Heading>
      </HStack>
      <HStack gap={isTabletUp ? 1 : 0} vAlign="center" style={{ flexShrink: 0 }}>
        {isTabletUp && onOpenLanding ? (
          <Button
            label="Landing page"
            size="lg"
            variant="ghost"
            onClick={onOpenLanding}
          />
        ) : null}
        <Button
          label="About & validation"
          tooltip={isWide ? undefined : "About & validation"}
          data-testid="topbar-about"
          size="lg"
          variant="ghost"
          isIconOnly={!isWide}
          icon={<Icon icon={CircleHelp} />}
          href="/about/"
        />
        {isTabletUp ? (
          <Button
            label="Copy link"
            tooltip={isWide ? undefined : "Copy link"}
            size="lg"
            variant="ghost"
            isIconOnly={!isWide}
            icon={<Icon icon={LinkIcon} />}
            onClick={copyLink}
          />
        ) : null}
        {isTabletUp ? (
          <Button
            label="Export PNG"
            tooltip={isWide ? undefined : "Export PNG"}
            size="lg"
            variant="ghost"
            isIconOnly={!isWide}
            icon={<Icon icon={Download} />}
            onClick={exportPng}
          />
        ) : null}
        {isTabletUp && onOpenTour ? (
          <Button
            label="Tutorial"
            tooltip={isWide ? undefined : "Tutorial"}
            size="lg"
            variant="ghost"
            isIconOnly={!isWide}
            icon={<Icon icon={GraduationCap} />}
            onClick={onOpenTour}
          />
        ) : null}
        {isTabletUp ? null : (
          <MoreMenu
            label="More"
            size="lg"
            alignment="end"
            items={[
              { label: "Copy link", icon: <Icon icon={LinkIcon} />, onClick: copyLink },
              ...(onOpenTour
                ? [{ label: "Tutorial", icon: <Icon icon={GraduationCap} />, onClick: onOpenTour }]
                : []),
            ]}
          />
        )}
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

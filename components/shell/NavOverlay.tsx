"use client";

import { X } from "lucide-react";
import { BottomSheet } from "@astryxdesign/core/BottomSheet";
import { Drawer, DrawerHeader } from "@astryxdesign/core/Drawer";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Layout, LayoutContent } from "@astryxdesign/core/Layout";
import { LeftPanel } from "./LeftPanel";

const PANEL_WIDTH = 280;

interface NavOverlayProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  /** Below 768 the scenario editor is a bottom sheet; from 768 to 1023 it is a side drawer. */
  isPhone: boolean;
}

/** The scenario editor as an overlay, loaded on first open (the wide layout shows it inline instead). */
export default function NavOverlay({ isOpen, onOpenChange, isPhone }: NavOverlayProps) {
  if (isPhone) {
    return (
      <BottomSheet
        isOpen={isOpen}
        onOpenChange={onOpenChange}
        label="Scenarios"
        height="tall"
        purpose="form"
      >
        <LeftPanel />
      </BottomSheet>
    );
  }
  return (
    <Drawer
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      label="Scenarios"
      side="start"
      width={PANEL_WIDTH}
    >
      <Layout
        header={
          <DrawerHeader
            title="Scenarios"
            endContent={
              <IconButton
                label="Close"
                size="lg"
                variant="ghost"
                icon={<Icon icon={X} />}
                onClick={() => onOpenChange(false)}
              />
            }
          />
        }
        content={
          <LayoutContent>
            <LeftPanel />
          </LayoutContent>
        }
      />
    </Drawer>
  );
}

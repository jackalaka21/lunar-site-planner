"use client";

import { Button } from "@astryxdesign/core/Button";
import { Banner } from "@astryxdesign/core/Banner";
import { Stack } from "@astryxdesign/core/Stack";
import { useAppStore } from "../../lib/state/store";

/** Store notices (for example a share link that was corrected on load), one dismissible Banner each. */
export function Notice() {
  const notices = useAppStore((s) => s.notices);
  const dismissNotice = useAppStore((s) => s.dismissNotice);
  if (notices.length === 0) return null;
  return (
    <Stack gap={2} data-testid="notices">
      {notices.map((text, i) => (
        <Banner
          key={`${i}-${text}`}
          status="warning"
          title={text}
          container="section"
          collapsible={false}
          endContent={<Button label="Dismiss" size="lg" variant="ghost" onClick={() => dismissNotice(i)} />}
        />
      ))}
    </Stack>
  );
}

import { Heading } from "@astryxdesign/core/Heading";
import { Stack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { ThemeToggle } from "../components/ThemeToggle";

export default function Home() {
  return (
    <Stack padding={6} gap={4}>
      <Stack direction="horizontal" justify="between" align="center">
        <Heading level={1}>Ridgeline</Heading>
        <ThemeToggle />
      </Stack>
      <Text color="secondary">Lunar landing sites and dates, compared against the real horizon.</Text>
    </Stack>
  );
}

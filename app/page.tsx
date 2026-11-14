import { StaticDefaultCard } from "../components/card/StaticDefaultCard";
import { AppFrame } from "../components/shell/AppFrame";

export default function Home() {
  return <AppFrame firstCard={<StaticDefaultCard />} />;
}

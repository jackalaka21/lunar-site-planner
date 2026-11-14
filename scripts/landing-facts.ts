// Prints the engine-computed facts behind the landing page's Mons Mouton showcase.
// Run: npx tsx scripts/landing-facts.ts
import { nodeFetchers } from "../lib/data/nodeFetchers";
import { compass, computeLandingFacts } from "../lib/landing/facts";
import { createEngineHandlers } from "../workers/engineHandlers";

async function main(): Promise<void> {
  const f = await computeLandingFacts(createEngineHandlers(nodeFetchers));
  console.log(JSON.stringify(f, null, 2));
  console.log(`earth az: ${compass(f.earthAzMin)} .. ${compass(f.earthAzMax)}`);
}
void main();

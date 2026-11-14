"use client";

import { LandingPage, type LandingPageProps } from "./LandingPage";

export { LandingPage, type LandingPageProps };

export function LandingHero(props: LandingPageProps) {
  return <LandingPage {...props} />;
}

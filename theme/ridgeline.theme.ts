/**
 * Ridgeline theme: the only file in the repo allowed to hold hex colours.
 * Extends Astryx neutral with a graphite ramp, IBM Plex, and one easing curve.
 * Values come from spec section 10.3 (graphite ramp, text roles, bodies, status, radius)
 * and section 6.1 (motion). Build with `npm run prebuild` (astryx theme build).
 *
 * Every token is a [light, dark] pair so mode switching never touches components.
 */
import { defineTheme } from "@astryxdesign/core/theme";
import { neutralTheme } from "@astryxdesign/theme-neutral";

/** The single easing curve (spec section 6.1). */
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

export const ridgelineTheme = defineTheme({
  name: "ridgeline",
  extends: neutralTheme,

  typography: {
    scale: { base: 14, ratio: 1.2 },
    body: {
      family: "IBM Plex Sans",
      fallbacks:
        '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    },
    heading: {
      family: "IBM Plex Sans",
      fallbacks:
        '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      weight: "medium",
      weights: { 1: "medium", 2: "medium", 3: "medium", 4: "medium", 5: "medium", 6: "medium" },
    },
    code: {
      family: "IBM Plex Mono",
      fallbacks: 'ui-monospace, "SF Mono", Consolas, "Liberation Mono", monospace',
    },
  },

  motion: { character: "crisp" },

  localTokens: {
    // Spec 10.3 has two surface steps Astryx has no semantic name for.
    "--surface-deepest": ["#f4f4f5", "#0f0f10"],
    "--surface-raised": ["#f4f4f5", "#232325"],
    // Spec 10.3 third text role (muted). Astryx has primary/secondary/disabled only.
    "--color-text-muted": ["#737373", "#85858b"],
  },

  tokens: {
    // Surfaces: graphite ramp
    "--color-background-body": ["#fafafa", "#141415"],
    "--color-background-surface": ["#ffffff", "#19191b"],
    "--color-background-card": ["#ffffff", "#19191b"],
    "--color-background-popover": ["#ffffff", "#232325"],
    "--color-background-muted": ["#f4f4f5", "#232325"],

    // Text roles
    "--color-text-primary": ["#171717", "#ededed"],
    "--color-text-secondary": ["#525252", "#a1a1a6"],
    "--color-text-disabled": ["#a3a3a3", "#5c5c62"],
    "--color-icon-primary": ["#171717", "#ededed"],
    "--color-icon-secondary": ["#525252", "#a1a1a6"],
    "--color-icon-disabled": ["#a3a3a3", "#5c5c62"],

    // Hairline = primary text at 8%
    "--color-border": ["#17171714", "#ededed14"],
    "--color-border-emphasized": ["#8a8a8f", "#6b6b72"],
    "--color-skeleton": ["#e4e4e7", "#2c2c30"],
    "--color-track": ["#e4e4e7", "#2c2c30"],

    // Chrome accent: none beyond ink. Primary button = ink fill, page-coloured label.
    "--color-accent": ["#171717", "#ededed"],
    "--color-on-accent": ["#ffffff", "#141415"],
    "--color-accent-muted": ["#17171720", "#ededed26"],
    "--color-text-accent": ["#171717", "#ededed"],
    "--color-icon-accent": ["#171717", "#ededed"],
    "--color-neutral": ["#17171714", "#ededed1a"],
    "--color-overlay": ["#17171780", "#0f0f10cc"],
    "--color-overlay-hover": ["#17171714", "#ededed14"],
    "--color-overlay-pressed": ["#1717171f", "#ededed1f"],

    // Info carries no hue (amber and blue belong to the bodies)
    "--color-info": ["#525252", "#a1a1a6"],
    "--color-on-info": ["#ffffff", "#141415"],
    "--color-info-muted": ["#17171714", "#ededed1a"],
    "--color-on-info-muted": ["#171717", "#ededed"],
    "--color-text-info": ["#525252", "#a1a1a6"],
    "--color-icon-info": ["#525252", "#a1a1a6"],
    "--color-border-info": ["#525252", "#a1a1a6"],

    // Status (verdict only). Fills and icons use the spec values; the text variants
    // are darkened or lightened where the spec value misses 4.5:1 as text.
    "--color-success": ["#16a34a", "#4cc38a"],
    "--color-on-success": ["#0f0f10", "#0f0f10"],
    "--color-success-muted": ["#16a34a1f", "#4cc38a26"],
    "--color-on-success-muted": ["#14532d", "#4cc38a"],
    "--color-text-success": ["#15803d", "#4cc38a"],
    "--color-icon-success": ["#16a34a", "#4cc38a"],
    "--color-border-success": ["#16a34a", "#4cc38a"],
    "--color-error": ["#dc2626", "#e5484d"],
    "--color-on-error": ["#ffffff", "#0f0f10"],
    "--color-error-muted": ["#dc26261f", "#e5484d26"],
    "--color-on-error-muted": ["#991b1b", "#f26b6f"],
    "--color-text-error": ["#b91c1c", "#f26b6f"],
    "--color-icon-error": ["#dc2626", "#e5484d"],
    "--color-border-error": ["#dc2626", "#e5484d"],

    // Data visualisation: Sun amber, Earth blue, neutral = muted text
    "--color-data-categorical-orange": ["#e69f00", "#e69f00"],
    "--color-data-categorical-blue": ["#0072b2", "#56b4e9"],
    "--color-data-neutral": ["#737373", "#85858b"],

    // Radius: tags 4-6, controls 8-10, cards 12-16, panels 14-20
    "--radius-inner": "0.375rem",
    "--radius-element": "0.625rem",
    "--radius-container": "0.875rem",
    "--radius-page": "1.125rem",
    "--radius-chat": "1.125rem",

    // Depth comes from surface steps and hairlines, not shadows
    "--shadow-low": "0 0 0 1px var(--color-border)",
    "--shadow-med": "0 0 0 1px var(--color-border)",
    "--shadow-high": "0 0 0 1px var(--color-border)",

    // One easing curve everywhere
    "--ease-standard": EASE,
    "--ease-entrance": EASE,
    "--ease-move": EASE,
    "--ease-exit": EASE,
  },
});

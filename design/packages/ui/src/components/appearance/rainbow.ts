/** A marker, never a CSS colour string. It is deliberately excluded from recent swatches. */
export const RAINBOW_SENTINEL = "__worldlens_rainbow__";

export type RainbowSpeedLevel = 1 | 2 | 3 | 4 | 5;

/** One global mapping, shared by every rainbow surface so they turn together. */
export const RAINBOW_SPEED_DURATIONS: Readonly<Record<RainbowSpeedLevel, string>> = {
    1: "36s",
    2: "24s",
    3: "16s",
    4: "10s",
    5: "6s",
};

export function isRainbowColor(value: string): boolean {
    return value === RAINBOW_SENTINEL;
}

export function rainbowDuration(level: number): string {
    const safe = Math.max(1, Math.min(5, Math.round(level))) as RainbowSpeedLevel;
    return RAINBOW_SPEED_DURATIONS[safe];
}

/** CSS is responsible for the hue cycle. Reduced motion settles on one deliberate hue. */
export const RAINBOW_CSS = `
@keyframes worldlens-appearance-rainbow {
  from { filter: hue-rotate(0deg); }
  to { filter: hue-rotate(360deg); }
}
[data-appearance-rainbow="true"] {
  animation: worldlens-appearance-rainbow var(--appearance-rainbow-duration, 16s) linear infinite;
}
@media (prefers-reduced-motion: reduce) {
  [data-appearance-rainbow="true"] {
    animation: none;
    filter: hue-rotate(210deg);
  }
}
`;

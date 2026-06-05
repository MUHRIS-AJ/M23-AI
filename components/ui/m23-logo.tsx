"use client";

// M23 brand mark + wordmark. Pure SVG so it scales crisply at any size and
// picks up the liquid-glass theme. The mark is a glossy rounded tile with a
// geometric "M"; the wordmark renders "M23" in the app's display font.

import * as React from "react";
import { cn } from "@/lib/utils";

interface MarkProps {
  className?: string;
  /** Pixel size of the square mark. */
  size?: number;
}

/** The standalone glass "M" tile — use anywhere the old "AI" square was. */
export function M23Mark({ className, size = 32 }: MarkProps) {
  const id = React.useId();
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", className)}
      role="img"
      aria-label="M23"
    >
      <defs>
        <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop stopColor="var(--accent)" />
          <stop offset="1" stopColor="var(--accent-hover)" />
        </linearGradient>
        <linearGradient id={`${id}-gloss`} x1="0" y1="0" x2="0" y2="48" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="0.5" stopColor="#ffffff" stopOpacity="0.06" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* tile */}
      <rect x="1.5" y="1.5" width="45" height="45" rx="13" fill={`url(#${id}-fill)`} />
      {/* glossy top highlight (liquid-glass specular) */}
      <rect x="1.5" y="1.5" width="45" height="45" rx="13" fill={`url(#${id}-gloss)`} />
      {/* inner ring for depth */}
      <rect
        x="2.5"
        y="2.5"
        width="43"
        height="43"
        rx="12"
        stroke="#ffffff"
        strokeOpacity="0.35"
        strokeWidth="1"
      />

      {/* geometric M */}
      <path
        d="M13 34V15.5C13 14.7 13.9 14.2 14.6 14.6L24 21L33.4 14.6C34.1 14.2 35 14.7 35 15.5V34"
        stroke="#ffffff"
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

interface LogoProps {
  className?: string;
  /** Mark size in px. */
  size?: number;
  /** Show the "M23" wordmark next to the mark. */
  showWordmark?: boolean;
  /** Wordmark text size class (Tailwind), e.g. "text-sm". */
  wordmarkClassName?: string;
}

/** Mark + "M23" wordmark lockup. */
export function M23Logo({
  className,
  size = 28,
  showWordmark = true,
  wordmarkClassName = "text-sm",
}: LogoProps) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <M23Mark size={size} />
      {showWordmark && (
        <span className={cn("font-serif font-semibold tracking-tight text-text-100", wordmarkClassName)}>
          M23
        </span>
      )}
    </span>
  );
}

export default M23Logo;

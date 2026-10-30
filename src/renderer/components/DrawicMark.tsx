import React from "react";
import type { SVGProps } from "react";

/**
 * Compact Drawic brand mark used by the custom title bar. The geometry matches
 * `build/icon-small.svg`, the 32 px app-icon variant, so the in-app mark and
 * the operating-system icon stay visually consistent.
 */
export function DrawicMark(props: SVGProps<SVGSVGElement>): React.ReactElement {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" {...props}>
      <rect width="32" height="32" rx="7.1" fill="#FFEBCF" />
      <g stroke="#102A45" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5.4 16.4H13.2" />
        <path d="M13.2 11.4V21.4" />
        <path d="M17.6 9.6V23.2" />
        <path d="M17.6 13H23.2V7.2Q23.2 5.2 25.2 5.2H27.2" />
        <path d="M17.6 19.8H23.2V24.8Q23.2 26.8 25.2 26.8H27.2" />
      </g>
      <circle cx="5.4" cy="16.4" r="2.4" fill="#102A45" />
      <circle cx="27.2" cy="5.2" r="2.4" fill="#102A45" />
      <circle cx="27.2" cy="26.8" r="2.4" fill="#102A45" />
    </svg>
  );
}

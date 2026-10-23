import type { SVGProps } from "react";

export type IconName =
  | "new"
  | "open"
  | "save"
  | "select"
  | "wire"
  | "junction"
  | "text"
  | "rectangle"
  | "ellipse"
  | "net"
  | "undo"
  | "redo"
  | "rotate"
  | "mirror"
  | "delete"
  | "export"
  | "check"
  | "close"
  | "chevron";

export function Icon({
  name,
  ...props
}: { name: IconName } & SVGProps<SVGSVGElement>) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    ...props,
  };
  switch (name) {
    case "new":
      return (
        <svg {...common}>
          <path d="M6 3h8l4 4v14H6z" />
          <path d="M14 3v5h5M9 13h6M12 10v6" />
        </svg>
      );
    case "open":
      return (
        <svg {...common}>
          <path d="M3 7h7l2 2h9v10H3z" />
          <path d="M3 7V5h7l2 2" />
        </svg>
      );
    case "save":
      return (
        <svg {...common}>
          <path d="M4 3h14l2 2v16H4z" />
          <path d="M8 3v6h8V3M8 21v-7h8v7" />
        </svg>
      );
    case "select":
      return (
        <svg {...common}>
          <path d="m5 3 13 9-6 1 3 7-3 1-3-7-4 4z" />
        </svg>
      );
    case "wire":
      return (
        <svg {...common}>
          <path d="M3 17h8V6h10" />
          <circle cx="3" cy="17" r="1.5" fill="currentColor" />
          <circle cx="21" cy="6" r="1.5" fill="currentColor" />
        </svg>
      );
    case "junction":
      return (
        <svg {...common}>
          <path d="M12 3v18M3 12h18" />
          <circle cx="12" cy="12" r="3.2" fill="currentColor" />
        </svg>
      );
    case "text":
      return (
        <svg {...common}>
          <path d="M5 5h14M12 5v14M8 19h8" />
        </svg>
      );
    case "rectangle":
      return (
        <svg {...common}>
          <rect x="4" y="5" width="16" height="14" rx="1" />
        </svg>
      );
    case "ellipse":
      return (
        <svg {...common}>
          <ellipse cx="12" cy="12" rx="8" ry="6" />
        </svg>
      );
    case "net":
      return (
        <svg {...common}>
          <path d="M4 17h7l4-10h5" />
          <path d="M4 14v6M1 17h6" />
        </svg>
      );
    case "undo":
      return (
        <svg {...common}>
          <path d="m8 7-5 5 5 5" />
          <path d="M4 12h9a7 7 0 0 1 7 7" />
        </svg>
      );
    case "redo":
      return (
        <svg {...common}>
          <path d="m16 7 5 5-5 5" />
          <path d="M20 12h-9a7 7 0 0 0-7 7" />
        </svg>
      );
    case "rotate":
      return (
        <svg {...common}>
          <path d="M20 7V3l-2 2a8 8 0 1 0 2 10" />
        </svg>
      );
    case "mirror":
      return (
        <svg {...common}>
          <path d="M12 3v18M9 6 3 18h6zM15 6l6 12h-6z" />
        </svg>
      );
    case "delete":
      return (
        <svg {...common}>
          <path d="M4 7h16M9 3h6l1 4H8zM6 7l1 14h10l1-14M10 11v6M14 11v6" />
        </svg>
      );
    case "export":
      return (
        <svg {...common}>
          <path d="M12 15V3m-5 5 5-5 5 5M4 14v7h16v-7" />
        </svg>
      );
    case "check":
      return (
        <svg {...common}>
          <path d="m4 12 5 5L20 6" />
        </svg>
      );
    case "close":
      return (
        <svg {...common}>
          <path d="m5 5 14 14M19 5 5 19" />
        </svg>
      );
    case "chevron":
      return (
        <svg {...common}>
          <path d="m9 5 7 7-7 7" />
        </svg>
      );
  }
}

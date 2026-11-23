import React from "react";
const paths = {
  files: (
    <>
      <path d="M3 7a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v9H3z" />
      <path d="M3 11h18" />
    </>
  ),
  spreadsheet: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M4 9h16M4 15h16M10 9v12M16 9v12" />
    </>
  ),
  browser: (
    <>
      <circle cx="12" cy="12" r="9" />
      <ellipse cx="12" cy="12" rx="4" ry="9" />
      <path d="M3 12h18M5 6h14M5 18h14" />
    </>
  ),
  systems: (
    <>
      <rect x="8" y="2" width="8" height="6" rx="1" />
      <rect x="2" y="16" width="8" height="6" rx="1" />
      <rect x="14" y="16" width="8" height="6" rx="1" />
      <path d="M12 8v4H6v4m6-4h6v4" />
    </>
  ),
  player: (
    <>
      <rect x="2" y="4" width="20" height="16" rx="3" />
      <path d="m10 8 6 4-6 4z" />
    </>
  ),
  charts: (
    <>
      <path d="M3 3v18h19" />
      <rect x="7" y="11" width="3" height="7" />
      <rect x="13" y="6" width="3" height="12" />
      <path d="m6 7 5-3 7 1" />
    </>
  ),
  editor: (
    <>
      <path d="M14 3H5v18h14V8zM14 3v5h5M8 12h8M8 16h6" />
    </>
  ),
  widgets: (
    <>
      <rect x="3" y="3" width="8" height="8" rx="2" />
      <rect x="15" y="3" width="6" height="6" rx="2" />
      <rect x="13" y="13" width="8" height="8" rx="2" />
      <rect x="3" y="15" width="6" height="6" rx="2" />
    </>
  ),
  tasks: (
    <>
      <path d="M3 20V9m6 11V4m6 16v-9m6 9V6" />
      <path d="m2 7 7-5 6 6 6-4" />
    </>
  ),
  settings: (
    <>
      <path d="m9 3 1-1h4l1 4 4-1 2 4-3 3 3 3-2 4-4-1-1 4h-4l-1-4-4 1-2-4 3-3-3-3 2-4 4 1z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9 8a3 3 0 1 1 5 2c-2 1-2 2-2 3m0 3v1" />
    </>
  ),
  bell: (
    <>
      <path d="M5 17h14l-2-3V9a5 5 0 0 0-10 0v5zM10 21h4" />
    </>
  ),
  back: <path d="m14 5-7 7 7 7" />,
  next: <path d="m9 5 7 7-7 7" />,
  plus: <path d="M12 4v16M4 12h16" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  play: <path d="m7 4 14 8-14 8z" />,
  pause: (
    <>
      <path d="M8 5v14M16 5v14" />
    </>
  ),
  stop: <rect x="5" y="5" width="14" height="14" rx="1" />,
  project: (
    <>
      <rect x="2" y="10" width="12" height="11" rx="2" />
      <path d="M9 15 21 3m-8 0h8v8" />
    </>
  ),
  search: (
    <>
      <circle cx="10" cy="10" r="6" />
      <path d="m15 15 6 6" />
    </>
  ),
  check: <path d="m4 12 5 5L20 6" />,
  trash: (
    <>
      <path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7" />
    </>
  ),
  save: (
    <>
      <path d="M4 3h14l3 3v15H3V3zM7 3v6h10V3M7 21v-8h10v8" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 6v6l4 2" />
    </>
  ),
  leaf: (
    <>
      <path d="M20 3C6 1 2 8 5 15s14 5 15-12zM4 21 16 8" />
    </>
  ),
  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </>
  ),
};
export default function Icon({ name, size = 20, ...props }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {paths[name] || paths.editor}
    </svg>
  );
}

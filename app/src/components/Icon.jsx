// 2px stroke line icons (lucide-style). No emoji in the interface.
const PATHS = {
  close: "M18 6 6 18M6 6l12 12",
  flag: "M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7",
  bolt: "M13 2 4 14h7l-1 8 9-12h-7z",
  flame: "M12 3c1 4 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3-1-5 1-8.5z",
  check: "M20 6 9 17l-5-5",
  x: "M18 6 6 18M6 6l12 12",
  map: "M9 3 3 5v16l6-2 6 2 6-2V3l-6 2zM9 3v16M15 5v16",
  left: "M15 18 9 12l6-6",
  right: "M9 18l6-6-6-6",
  home: "M3 11 12 3l9 8M5 10v10h14V10z",
  book: "M4 4h7a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4zM20 4h-7a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h8z",
  trophy: "M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3",
  user: "M20 21a8 8 0 0 0-16 0M12 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8z",
  clock: "M12 7v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0z",
  arrow: "M5 12h14M13 6l6 6-6 6",
};

export default function Icon({ name, size = 18, strokeWidth = 2, className }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

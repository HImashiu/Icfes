// Rounded "duo" icons: a soft filled body (`fill`, drawn at low opacity in the current color) under a thick rounded
// outline (`d`). Friendlier than thin line icons, in the spirit of Duolingo. No emoji in the interface.
const ICONS = {
  close: { d: "M17 7 7 17M7 7l10 10" },
  x: { d: "M17 7 7 17M7 7l10 10" },
  check: { d: "M19 7.5 10 16.5 5 11.5" },
  left: { d: "M14.5 6 8.5 12l6 6" },
  right: { d: "M9.5 6l6 6-6 6" },
  arrow: { d: "M5 12h14M13 6l6 6-6 6" },
  flag: {
    fill: "M5.5 4.5c2.5-1.3 4.8-1.3 7 0s4.5 1.3 6.5.3v9c-2 1-4.3 1-6.5-.3s-4.5-1.3-7 0z",
    d: "M5.5 21V4.5c2.5-1.3 4.8-1.3 7 0s4.5 1.3 6.5.3v9c-2 1-4.3 1-6.5-.3s-4.5-1.3-7 0",
  },
  bolt: { fill: "M13.5 2.5 4.5 13.5h6.5l-1 8 9-11h-6.5z", d: "M13.5 2.5 4.5 13.5h6.5l-1 8 9-11h-6.5z", solid: true },
  flame: {
    fill: "M12 2.5c.5 3.5 5.5 5.5 5.5 11a5.5 5.5 0 0 1-11 0c0-2.4 1.1-4 2.4-5.2.1 2 1 3.2 2.2 3.4C10.8 8.6 10.6 5.6 12 2.5z",
    d: "M12 2.5c.5 3.5 5.5 5.5 5.5 11a5.5 5.5 0 0 1-11 0c0-2.4 1.1-4 2.4-5.2.1 2 1 3.2 2.2 3.4C10.8 8.6 10.6 5.6 12 2.5z",
    solid: true,
  },
  map: {
    fill: "M3.5 6.5 9 4.5l6 2 5.5-2v13l-5.5 2-6-2-5.5 2z",
    d: "M3.5 6.5 9 4.5l6 2 5.5-2v13l-5.5 2-6-2-5.5 2zM9 4.5v13M15 6.5v13",
  },
  home: {
    fill: "M4 10.2 12 3.8l8 6.4v8.3a2 2 0 0 1-2 2h-3.2v-5a1.5 1.5 0 0 0-1.5-1.5h-2.6a1.5 1.5 0 0 0-1.5 1.5v5H6a2 2 0 0 1-2-2z",
    d: "M4 10.2 12 3.8l8 6.4v8.3a2 2 0 0 1-2 2h-3.2v-5a1.5 1.5 0 0 0-1.5-1.5h-2.6a1.5 1.5 0 0 0-1.5 1.5v5H6a2 2 0 0 1-2-2z",
  },
  book: {
    fill: "M12 6.8C10 5.2 7 4.7 3.8 5.2v13.3c3.2-.5 6.2 0 8.2 1.6 2-1.6 5-2.1 8.2-1.6V5.2C17 4.7 14 5.2 12 6.8z",
    d: "M12 6.8C10 5.2 7 4.7 3.8 5.2v13.3c3.2-.5 6.2 0 8.2 1.6 2-1.6 5-2.1 8.2-1.6V5.2C17 4.7 14 5.2 12 6.8zM12 6.8v13.3",
  },
  clock: {
    fill: "M20.5 12a8.5 8.5 0 1 1-17 0 8.5 8.5 0 0 1 17 0z",
    d: "M20.5 12a8.5 8.5 0 1 1-17 0 8.5 8.5 0 0 1 17 0zM12 7.5V12l3 2",
  },
  user: {
    fill: "M12 3.5a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM4.5 20.5c0-4 3.4-6.5 7.5-6.5s7.5 2.5 7.5 6.5z",
    d: "M12 3.5a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM4.5 20.5c0-4 3.4-6.5 7.5-6.5s7.5 2.5 7.5 6.5z",
  },
  bulb: {
    fill: "M12 2.8a6.2 6.2 0 0 0-3.7 11.2c.7.5 1.1 1.3 1.1 2.1v.4h5.2v-.4c0-.8.4-1.6 1.1-2.1A6.2 6.2 0 0 0 12 2.8z",
    d: "M12 2.8a6.2 6.2 0 0 0-3.7 11.2c.7.5 1.1 1.3 1.1 2.1v.4h5.2v-.4c0-.8.4-1.6 1.1-2.1A6.2 6.2 0 0 0 12 2.8zM9.8 19.3h4.4M10.6 21.5h2.8",
    solid: true,
  },
  trophy: {
    fill: "M7 3.5h10v5.5a5 5 0 0 1-10 0z",
    d: "M8.5 20.5h7M12 14v6.5M7 3.5h10v5.5a5 5 0 0 1-10 0zM7 5.5H4.5v1.5A3 3 0 0 0 7 10M17 5.5h2.5v1.5A3 3 0 0 1 17 10",
  },
};

export default function Icon({ name, size = 18, strokeWidth = 2.4, className }) {
  const icon = ICONS[name] ?? ICONS.close;
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
      className={className ? `icon ${className}` : "icon"}
    >
      {icon.fill && <path className="icon-fill" d={icon.fill} fill="currentColor" stroke="none" opacity={icon.solid ? 0.9 : 0.22} />}
      <path d={icon.d} />
    </svg>
  );
}

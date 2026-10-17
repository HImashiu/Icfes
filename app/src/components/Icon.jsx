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
  camera: {
    fill: "M3.5 8.5a2 2 0 0 1 2-2h2.2l1.6-2h5.4l1.6 2h2.2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z",
    d: "M3.5 8.5a2 2 0 0 1 2-2h2.2l1.6-2h5.4l1.6 2h2.2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2zM15.5 13a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0z",
  },
  print: {
    fill: "M4.5 9.5h15a1.5 1.5 0 0 1 1.5 1.5v5.5h-3.5v-3h-11v3H3V11a1.5 1.5 0 0 1 1.5-1.5z",
    d: "M7 9.5v-5h10v5M7 16.5H3V11a1.5 1.5 0 0 1 1.5-1.5h15A1.5 1.5 0 0 1 21 11v5.5h-4M7 13.5h10v7H7z",
  },
  chart: {
    fill: "M5 13h3v7H5zM10.5 8h3v12h-3zM16 4h3v16h-3z",
    d: "M5 13h3v7H5zM10.5 8h3v12h-3zM16 4h3v16h-3zM3 20.5h18",
  },
  users: {
    fill: "M9 4a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7zM2.5 19.5c0-3.5 2.9-5.7 6.5-5.7s6.5 2.2 6.5 5.7z",
    d: "M9 4a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7zM2.5 19.5c0-3.5 2.9-5.7 6.5-5.7s6.5 2.2 6.5 5.7zM15.5 4.3a3.5 3.5 0 0 1 0 6.4M18 14.2c2 .7 3.5 2.5 3.5 5.3",
  },
  chat: {
    fill: "M4 5.5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-7l-4.5 4v-4H6a2 2 0 0 1-2-2z",
    d: "M4 5.5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-7l-4.5 4v-4H6a2 2 0 0 1-2-2zM8.5 9h7M8.5 12h4",
  },
  school: {
    fill: "M12 3.5 21 8l-9 4.5L3 8z",
    d: "M12 3.5 21 8l-9 4.5L3 8zM6.5 10v5.5c1.5 1.5 3.5 2.3 5.5 2.3s4-.8 5.5-2.3V10M21 8v6",
  },
  shield: {
    fill: "M12 3 19.5 6v5.5c0 4.5-3.2 8-7.5 9.5-4.3-1.5-7.5-5-7.5-9.5V6z",
    d: "M12 3 19.5 6v5.5c0 4.5-3.2 8-7.5 9.5-4.3-1.5-7.5-5-7.5-9.5V6zM8.8 12l2.3 2.3 4.2-4.6",
  },
  pencil: {
    fill: "M15.5 4.5l4 4L9 19H5v-4z",
    d: "M15.5 4.5l4 4L9 19H5v-4zM13 7l4 4",
  },
  expand: { d: "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" },
  play: { fill: "M7 4.5v15l12-7.5z", d: "M7 4.5v15l12-7.5z", solid: true },
  plus: { d: "M12 5v14M5 12h14" },
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

// A small stroke icon set, drawn here so the page needs nothing from the network. Built with createElementNS, never innerHTML.
const PATHS = {
  grid: ["M4 4h7v7H4z", "M13 4h7v7h-7z", "M4 13h7v7H4z", "M13 13h7v7h-7z"],
  bank: ["M3 10l9-6 9 6", "M5 10v8", "M9.5 10v8", "M14.5 10v8", "M19 10v8", "M3 20h18"],
  cash: ["M3 7h18v10H3z", "M12 9.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5z", "M6 10v4", "M18 10v4"],
  trend: ["M3 17l6-6 4 4 8-8", "M15 7h6v6"],
  list: ["M9 6h12", "M9 12h12", "M9 18h12", "M4 6l1 1 2-2", "M4 12l1 1 2-2", "M4 18l1 1 2-2"],
  chart: ["M4 20V10", "M10 20V4", "M16 20v-7", "M22 20H2"],
  flow: ["M5 3h6v5H5z", "M13 16h6v5h-6z", "M8 8v5a3 3 0 003 3h2"],
  inbox: ["M3 13l3-8h12l3 8v6H3z", "M3 13h5l1 3h6l1-3h5"],
  book: ["M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2z", "M4 19V5", "M9 8h6"],
  shield: ["M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z", "M9 12l2 2 4-4"],
  code: ["M8 7l-5 5 5 5", "M16 7l5 5-5 5", "M13.5 5l-3 14"],
  spark: ["M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z", "M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"],
  doc: ["M6 3h9l4 4v14H6z", "M14 3v5h5", "M9 13h7", "M9 17h5"],
  user: ["M12 12a4 4 0 100-8 4 4 0 000 8z", "M4 21a8 8 0 0116 0"],
  check: ["M4 12l5 5L20 6"],
  clock: ["M12 21a9 9 0 100-18 9 9 0 000 18z", "M12 7v5l3 2"],
  search: ["M11 18a7 7 0 100-14 7 7 0 000 14z", "M20 20l-4-4"],
  send: ["M4 12l16-8-6 16-3-7z"],
  play: ["M7 4l13 8-13 8z"],
};

export function icon(name, size = 18) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  for (const [k, v] of Object.entries({ viewBox: "0 0 24 24", width: size, height: size, fill: "none", stroke: "currentColor", "stroke-width": "1.8", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" })) svg.setAttribute(k, v);
  for (const d of PATHS[name] ?? PATHS.grid) {
    const path = document.createElementNS(ns, "path");
    path.setAttribute("d", d);
    svg.append(path);
  }
  return svg;
}

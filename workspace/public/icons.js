// The workspace's own icon set, drawn here so the page needs nothing from the network. Two tones: ink line work and
// one lime accent shape per icon. Built with createElementNS, never innerHTML.
//   ["M…"]            a stroked path
//   ["M…", "accent"]  a shape filled with the brand lime, drawn under the line work
//   ["M…", "solid"]   a small shape filled with the ink colour (dots, arrowheads)
const ICONS = {
  // navigation
  grid: [["M4 4h7v7H4z", "accent"], ["M4 4h7v7H4z"], ["M13 4h7v7h-7z"], ["M4 13h7v7H4z"], ["M13 13h7v7h-7z"]],
  cash: [["M3 7h18v10H3z"], ["M12 9.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5z", "accent"], ["M12 9.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5z"], ["M6 10v4"], ["M18 10v4"]],
  trend: [["M3 17l6-6 4 4 8-8"], ["M15 7h6v6"]],
  list: [["M9 6h12"], ["M9 12h12"], ["M9 18h12"], ["M4 6l1 1 2-2"], ["M4 12l1 1 2-2"], ["M4 18l1 1 2-2"]],
  chart: [["M4 20V10"], ["M10 20V4"], ["M16 20v-7"], ["M22 20H2"]],
  flow: [["M5 3h6v5H5z"], ["M13 16h6v5h-6z"], ["M8 8v5a3 3 0 003 3h2"]],
  inbox: [["M3 13l3-8h12l3 8v6H3z"], ["M3 13h5l1 3h6l1-3h5"]],
  book: [["M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2z"], ["M4 19V5"], ["M9 8h6"]],
  shield: [["M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"], ["M9 12l2 2 4-4"]],
  code: [["M8 7l-5 5 5 5"], ["M16 7l5 5-5 5"], ["M13.5 5l-3 14"]],
  spark: [["M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"], ["M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"]],
  doc: [["M6 3h9l4 4v14H6z"], ["M14 3v5h5"], ["M9 13h7"], ["M9 17h5"]],
  user: [["M12 12a4 4 0 100-8 4 4 0 000 8z"], ["M4 21a8 8 0 0116 0"]],
  bank: [["M3 10l9-6 9 6"], ["M5 10v8"], ["M9.5 10v8"], ["M14.5 10v8"], ["M19 10v8"], ["M3 20h18"]],
  check: [["M4 12l5 5L20 6"]],
  clock: [["M12 21a9 9 0 100-18 9 9 0 000 18z"], ["M12 7v5l3 2"]],
  search: [["M11 18a7 7 0 100-14 7 7 0 000 14z"], ["M20 20l-4-4"]],
  send: [["M4 12l16-8-6 16-3-7z"]],
  play: [["M7 4l13 8-13 8z"]],
  // a small model on our own silicon: a chip with its core lit
  chip: [["M7 7h10v10H7z"], ["M10 10h4v4h-4z", "accent"], ["M10 10h4v4h-4z"], ["M10 4v3"], ["M14 4v3"], ["M10 17v3"], ["M14 17v3"], ["M4 10h3"], ["M4 14h3"], ["M17 10h3"], ["M17 14h3"]],

  // the tools: one original drawing each
  // who owes what, and how late: three invoices ageing into a clock
  t_ageing: [["M4 20V9h4v11z", "accent"], ["M4 20V9h4v11z"], ["M10 20V5h4v15z"], ["M2 20h14"], ["M18.5 22a3.5 3.5 0 100-7 3.5 3.5 0 000 7z"], ["M18.5 16.8v1.9l1.2.8"]],
  // debits and credits on a scale that has to sit level
  t_balance: [["M12 4v16"], ["M8 20h8"], ["M4 7h16"], ["M4 7l-2.5 6h5z", "accent"], ["M4 7l-2.5 6h5z"], ["M20 7l-2.5 6h5z", "accent"], ["M20 7l-2.5 6h5z"], ["M12 4a1 1 0 100-2 1 1 0 000 2z", "solid"]],
  // cash landing in the account
  t_cashin: [["M3 13v6a1 1 0 001 1h16a1 1 0 001-1v-6"], ["M12 3v10"], ["M8 9l4 4 4-4"], ["M7 16.5h10", "accent"], ["M6 17h12"]],
  // something is waiting for a person
  t_waiting: [["M6 9a6 6 0 1112 0c0 5 2 6 2 6H4s2-1 2-6z"], ["M10 19a2 2 0 004 0"], ["M18.5 7.5a3 3 0 100-6 3 3 0 000 6z", "accent"], ["M18.5 7.5a3 3 0 100-6 3 3 0 000 6z"]],
  // one receipt, looked at closely
  t_receipt: [["M5 3h11v18l-2.2-1.6L11.6 21l-2.2-1.6L7.2 21 5 19.4z"], ["M8 8h5"], ["M8 12h3"], ["M17 19a3.5 3.5 0 100-7 3.5 3.5 0 000 7z", "accent"], ["M17 19a3.5 3.5 0 100-7 3.5 3.5 0 000 7z"], ["M19.6 18.2L22 20.6"]],
  // agents as linked turns
  t_agents: [["M4 4h6v5H4z", "accent"], ["M4 4h6v5H4z"], ["M14 4h6v5h-6z"], ["M9 15h6v5H9z"], ["M7 9v2.5a1.5 1.5 0 001.5 1.5H12v2"], ["M17 9v2.5a1.5 1.5 0 01-1.5 1.5H12"]],
  // what is known, then what is expected
  t_forecast: [["M3 20h18"], ["M3 20V5"], ["M4.5 15l4-5 3.5 3"], ["M12 13l3-4", "dash"], ["M15 9l4-3.5", "dash"], ["M19 5.5a1.5 1.5 0 100-.01z", "accent"], ["M19 5.5a1.5 1.5 0 100-.01z"]],
  // a month that ticks itself shut
  t_close: [["M4 6h16v14H4z"], ["M4 10h16", "accent"], ["M4 10h16"], ["M8 3v5"], ["M16 3v5"], ["M8.5 15l2.5 2.5 4.5-5"]],
  // revenue recognised in steps
  t_revenue: [["M3 20h18"], ["M4 20v-4h4v4z", "accent"], ["M4 20v-4h4v4z"], ["M10 20v-8h4v8z"], ["M16 20V7h4v13z"], ["M4 11l5-4 4 2 6-5"]],
  // a rule book that wrote itself
  t_policies: [["M5 4a2 2 0 012-2h12v17H7a2 2 0 00-2 2z"], ["M5 21V4"], ["M12.5 6l1 2.8 2.8 1-2.8 1-1 2.8-1-2.8-2.8-1 2.8-1z", "accent"], ["M12.5 6l1 2.8 2.8 1-2.8 1-1 2.8-1-2.8-2.8-1 2.8-1z"]],
};

export function icon(name, size = 18) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  for (const [k, v] of Object.entries({ viewBox: "0 0 24 24", width: size, height: size, fill: "none", stroke: "currentColor", "stroke-width": "1.7", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" })) svg.setAttribute(k, v);
  for (const [d, kind] of ICONS[name] ?? ICONS.grid) {
    const path = document.createElementNS(ns, "path");
    path.setAttribute("d", d);
    if (kind === "accent") { path.setAttribute("fill", "var(--lime)"); path.setAttribute("stroke", "none"); }
    if (kind === "solid") { path.setAttribute("fill", "currentColor"); path.setAttribute("stroke", "none"); }
    if (kind === "dash") path.setAttribute("stroke-dasharray", "2.2 2.6");
    svg.append(path);
  }
  return svg;
}

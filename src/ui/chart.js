// Small dependency-free SVG bar chart with a true zero baseline.
// points: [{ label, value, display }]

const NS = "http://www.w3.org/2000/svg";
const s = (tag, attrs = {}, ...children) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  for (const c of children) el.append(c);
  return el;
};

export function barChart(points, { horizontal = false } = {}) {
  return horizontal ? hBars(points) : vBars(points);
}

function vBars(points) {
  const W = 640, H = 236, top = 22, bottom = 44, side = 8;
  const max = Math.max(0, ...points.map((p) => p.value));
  const min = Math.min(0, ...points.map((p) => p.value));
  const span = max - min || 1;
  const y = (v) => top + ((max - v) / span) * (H - top - bottom);
  const slot = (W - side * 2) / points.length;
  const bw = Math.min(56, slot * 0.62);
  const labelEvery = Math.ceil(points.length / 8);

  const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, class: "bars-v", role: "img", direction: "ltr" });
  points.forEach((p, i) => {
    const cx = side + slot * i + slot / 2;
    const y0 = y(0), y1 = y(p.value);
    const g = s("g", { class: p.value < 0 ? "neg" : "pos" },
      s("title", {}, `${p.label}: ${p.display}`),
      s("rect", { x: cx - bw / 2, y: Math.min(y0, y1), width: bw, height: Math.max(1, Math.abs(y1 - y0)), rx: 1 }));
    if (points.length <= 12) {
      g.append(s("text", { x: cx, y: p.value < 0 ? y1 + 13 : y1 - 5, "text-anchor": "middle", class: "v" }, p.display));
    }
    if ((points.length - 1 - i) % labelEvery === 0) {
      g.append(s("text", { x: cx, y: H - 6, "text-anchor": "middle", class: "x" }, p.label));
    }
    svg.append(g);
  });
  svg.append(s("line", { x1: side, x2: W - side, y1: y(0), y2: y(0), class: "zero" }));
  return svg;
}

function hBars(points) {
  const W = 640, row = 30, labelW = 170, valueW = 70;
  const H = points.length * row + 8;
  const max = Math.max(0, ...points.map((p) => p.value));
  const min = Math.min(0, ...points.map((p) => p.value));
  const span = max - min || 1;
  const x = (v) => labelW + ((v - min) / span) * (W - labelW - valueW);

  const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, class: "bars-h", role: "img", direction: "ltr" });
  points.forEach((p, i) => {
    const yy = 4 + i * row;
    const x0 = x(0), x1 = x(p.value);
    svg.append(s("g", { class: p.value < 0 ? "neg" : "pos" },
      s("title", {}, `${p.label}: ${p.display}`),
      s("text", { x: labelW - 8, y: yy + row / 2 + 4, "text-anchor": "end", class: "x" }, p.label),
      s("rect", { x: Math.min(x0, x1), y: yy + 5, width: Math.max(1, Math.abs(x1 - x0)), height: row - 10, rx: 1 }),
      s("text", { x: Math.max(x0, x1) + 6, y: yy + row / 2 + 4, class: "v" }, p.display)));
  });
  svg.append(s("line", { x1: x(0), x2: x(0), y1: 0, y2: H, class: "zero" }));
  return svg;
}

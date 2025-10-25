// chart.js — rendering & grouping for Pie and Bubble views
let nodes = [];
let links = [];
let nodeById = new Map();

// --- FIX: be resilient to either <svg id="vis"> or <svg id="pie"> ---
let svg = d3.select("#vis");
if (svg.empty()) svg = d3.select("#pie"); // fallback for older index.html
// --------------------------------------------------------------------

const width = 500,
  height = 500;
const center = [width / 2, height / 2];

const gMain = svg
  .append("g")
  .attr("transform", `translate(${center[0]},${center[1]})`);

const radius = Math.min(width, height) / 2 - 20;
const pie = d3.pie().value((d) => d.value);
const arc = d3.arc().innerRadius(0).outerRadius(radius);
const labelArc = d3
  .arc()
  .innerRadius(radius * 0.7)
  .outerRadius(radius * 0.7);

let threshold = 0;
let currentView = "pie";
let onDetailCb = () => {};

const GROUPS = [
  "Food",
  "Health",
  "Emotion",
  "Play",
  "Safety",
  "Learning",
  "Body",
  "Routine",
  "Social",
  "Rest",
];

function guessGroup(w) {
  const s = w.toLowerCase();
  if (
    /tummy|hunger|apple|soup|bread|thirst|water|milk|juice|snack|cake|candy|nut|egg/i.test(
      s
    )
  )
    return "Food";
  if (
    /hurt|scrape|bleed|doctor|medicine|fever|therm|rash|allergy|epipen|sick|recover/i.test(
      s
    )
  )
    return "Health";
  if (
    /scary|dream|hug|mom|dad|comfort|cry|happy|laugh|smile|lonely|shy/i.test(s)
  )
    return "Emotion";
  if (
    /toy|ball|game|puzzle|block|lego|run|jump|slide|swing|splash|dance|music|prize|balloon/i.test(
      s
    )
  )
    return "Play";
  if (
    /hot|stove|fire|sharp|knife|traffic|helmet|seatbelt|stranger|safe|umbrella|coat|boot/i.test(
      s
    )
  )
    return "Safety";
  if (
    /school|book|story|color|learn|question|why|homework|pencil|notebook|teacher|practice/i.test(
      s
    )
  )
    return "Learning";
  if (
    /potty|toilet|wash|soap|bath|shower|towel|brush|comb|shoes|laces|hair|dress/i.test(
      s
    )
  )
    return "Body";
  if (/nap|bed|sleep|rest|quiet|dark|lullaby|yawn|pillow|routine/i.test(s))
    return "Rest";
  if (
    /birthday|party|friend|share|invite|brother|sister|playmate|grandma|grandpa|visit/i.test(
      s
    )
  )
    return "Social";
  return "Routine";
}

function buildNodesFromRaw(raw) {
  const unique = [
    ...new Set(
      raw
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter(Boolean)
    ),
  ];
  return unique.map((label) => ({
    id: crypto.randomUUID(),
    label,
    baseGroup: guessGroup(label),
  }));
}
function indexByLabel(nodes) {
  const m = new Map();
  nodes.forEach((n) => m.set(n.label, n.id));
  return m;
}
function colorForIndex(i, n) {
  return d3.interpolateSpectral(i / Math.max(1, n - 1));
}

/* -------- components per threshold -------- */
function buildComponents(th) {
  const comps = [];
  for (const g of GROUPS) {
    const gNodes = nodes.filter((n) => n.baseGroup === g).map((n) => n.id);
    if (!gNodes.length) continue;
    const gSet = new Set(gNodes);
    const gLinks = links.filter(
      (l) => gSet.has(l.source) && gSet.has(l.target) && l.w >= th
    );
    const adj = new Map(gNodes.map((id) => [id, new Set()]));
    gLinks.forEach(({ source, target }) => {
      adj.get(source).add(target);
      adj.get(target).add(source);
    });

    const seen = new Set();
    let idx = 0;
    for (const id of gNodes) {
      if (seen.has(id)) continue;
      const stack = [id];
      seen.add(id);
      const collect = new Set([id]);
      while (stack.length) {
        const cur = stack.pop();
        for (const nei of adj.get(cur)) {
          if (!seen.has(nei)) {
            seen.add(nei);
            stack.push(nei);
            collect.add(nei);
          }
        }
      }
      comps.push({
        id: collect.size === gNodes.length ? g : `${g} • ${++idx}`,
        base: g,
        ids: collect,
      });
    }
  }

  const value = new Map(comps.map((c) => [c.id, 0]));
  const compOf = (nid) => comps.find((c) => c.ids.has(nid))?.id ?? null;

  for (const l of links) {
    const ca = compOf(l.source),
      cb = compOf(l.target);
    if (!ca || !cb) continue;
    if (ca === cb) value.set(ca, value.get(ca) + l.w);
    else {
      value.set(ca, value.get(ca) + l.w / 2);
      value.set(cb, value.get(cb) + l.w / 2);
    }
  }

  for (const c of comps) {
    c.value = +(value.get(c.id) || 0);
    c.items = [...c.ids].map((id) => nodeById.get(id).label).sort();
  }
  return comps.filter((c) => c.value > 0);
}

/* -------------------- PIE VIEW -------------------- */
function drawPie(comps) {
  gMain.selectAll("*").remove();

  const arcs = pie(comps);

  gMain
    .selectAll("path.slice")
    .data(arcs, (d) => d.data.id)
    .join("path")
    .attr("class", "slice")
    .attr("d", arc)
    .attr("fill", (d, i) => colorForIndex(i, arcs.length))
    .on("click", (_, d) => showDetail(d.data))
    .append("title")
    .text((d) => `${d.data.id}: ${d.data.value.toFixed(2)}`);

  const labelMinAngle = (8 * Math.PI) / 180;
  gMain
    .selectAll("text.label")
    .data(
      arcs.filter((a) => a.endAngle - a.startAngle >= labelMinAngle),
      (d) => d.data.id
    )
    .join(
      (enter) =>
        enter
          .append("text")
          .attr("class", "label")
          .attr("text-anchor", "middle")
          .style("font-size", "12px")
          .attr("transform", (d) => {
            const [x, y] = labelArc.centroid(d);
            const angle = (((d.startAngle + d.endAngle) / 2) * 180) / Math.PI;
            return `translate(${x},${y}) rotate(${angle - 90})`;
          })
          .text((d) => d.data.id),
      (update) =>
        update.attr("transform", (d) => {
          const [x, y] = labelArc.centroid(d);
          const angle = (((d.startAngle + d.endAngle) / 2) * 180) / Math.PI;
          return `translate(${x},${y}) rotate(${angle - 90})`;
        }),
      (exit) => exit.remove()
    );
}

/* ------------------ BUBBLE VIEW ------------------- */
function drawBubbles(comps) {
  gMain.selectAll("*").remove();

  const values = comps.map((c) => c.value);
  const rScale = d3
    .scaleSqrt()
    .domain([d3.min(values), d3.max(values)])
    .range([12, 60]);

  const nodesB = comps.map((c, i) => ({
    id: c.id,
    items: c.items,
    value: c.value,
    r: rScale(c.value),
    i,
  }));

  const sim = d3
    .forceSimulation(nodesB)
    .force("center", d3.forceCenter(0, 0))
    .force("charge", d3.forceManyBody().strength(0))
    .force(
      "collide",
      d3.forceCollide().radius((d) => d.r + 2)
    )
    .force("x", d3.forceX().strength(0.05))
    .force("y", d3.forceY().strength(0.05))
    .stop();

  for (let i = 0; i < 250; i++) sim.tick();

  const g = gMain
    .selectAll("g.b")
    .data(nodesB, (d) => d.id)
    .enter()
    .append("g")
    .attr("class", "b")
    .attr("transform", (d) => `translate(${d.x || 0},${d.y || 0})`)
    .on("click", (_, d) =>
      showDetail({ id: d.id, items: d.items, value: d.value })
    );

  g.append("circle")
    .attr("r", (d) => d.r)
    .attr("fill", (d, i) => colorForIndex(i, nodesB.length))
    .attr("stroke", "#fff")
    .attr("stroke-width", 2);

  g.filter((d) => d.r >= 18)
    .append("text")
    .attr("text-anchor", "middle")
    .attr("dy", ".35em")
    .style("font-size", "12px")
    .text((d) => d.id);

  g.append("title").text((d) => `${d.id}: ${d.value.toFixed(2)}`);
}

/* ----------------- helpers & API ------------------ */
function showDetail(comp) {
  const total = comp.value.toFixed(2);
  const items = comp.items;
  onDetailCb(
    `<b>${
      comp.id
    }</b> &nbsp; total link weight: <b>${total}</b> &nbsp; items: ${items
      .slice(0, 18)
      .join(", ")}${
      items.length > 18 ? ` … and ${items.length - 18} more` : ""
    }`
  );
}

function render() {
  const comps = buildComponents(threshold);
  if (currentView === "pie") drawPie(comps);
  else drawBubbles(comps);
}

export function initChart({ raw, links: linkTriples, onDetail }) {
  onDetailCb = onDetail || (() => {});
  nodes = buildNodesFromRaw(raw);
  nodeById = new Map(nodes.map((n) => [n.id, n]));
  const idByLabel = indexByLabel(nodes);
  links = linkTriples
    .map(([a, b, w]) => ({
      source: idByLabel.get(a),
      target: idByLabel.get(b),
      w,
    }))
    .filter((l) => l.source && l.target);
  render();
}

export function setThreshold(t) {
  threshold = Math.max(0, Math.min(0.96, t));
  render();
}

export function setView(view) {
  currentView = view === "bubbles" ? "bubbles" : "pie";
  render();
}

// viewer.js
// loads data.json, builds clustered hierarchy based on threshold,
// and renders one of three layouts: pie, bubble, force.
//
// data model expectation:
// window.data = {
//   nodes: [{id:"n1", label:"foo"}, ...],
//   links: [{id:"l1", source:"n1", target:"n2", weight:0.7}, ...]
// };
//
// We dynamically regroup nodes whose link weight >= T so we get clusters.

import { editWeight } from "./editor.js";

// color interpolation helper using d3.interpolateSpectral
function colorForIndex(i, max) {
  return d3.interpolateSpectral(i / Math.max(1, max));
}

// helper to update right-side detail div
function updateDetail(txt) {
  const el = document.getElementById("detail");
  if (el) {
    el.textContent = txt;
  }
}

// safe snapshot of window.data so we don't crash on undefined
function getSafeData() {
  const base = window.data || {};
  const safeNodes = Array.isArray(base.nodes) ? base.nodes : [];
  const safeLinks = Array.isArray(base.links) ? base.links : [];
  return { nodes: safeNodes, links: safeLinks };
}

// compute clusters based on threshold T
// 1. build graph of links >= threshold
// 2. find connected components
// 3. each component is a cluster group with summed internal weights
function clusterData(threshold) {
  const { nodes: rawNodes, links: rawLinks } = getSafeData();

  // clone so D3 doesn't mutate original
  const nodes = rawNodes.map((n) => ({ ...n }));
  const links = rawLinks.map((l) => ({ ...l }));

  // adjacency for links above threshold
  const adj = new Map();
  for (let n of nodes) {
    adj.set(n.id, new Set());
  }

  for (let l of links) {
    if (l.weight >= threshold) {
      if (adj.has(l.source)) adj.get(l.source).add(l.target);
      if (adj.has(l.target)) adj.get(l.target).add(l.source);
    }
  }

  // find connected components via BFS
  const visited = new Set();
  const comps = [];
  for (let n of nodes) {
    if (visited.has(n.id)) continue;
    const queue = [n.id];
    const comp = [];
    visited.add(n.id);
    while (queue.length) {
      const cur = queue.shift();
      comp.push(cur);

      const nbrs = adj.get(cur);
      if (!nbrs) continue;
      for (let nxt of nbrs) {
        if (!visited.has(nxt)) {
          visited.add(nxt);
          queue.push(nxt);
        }
      }
    }
    comps.push(comp);
  }

  // create cluster objects
  // each cluster gets an id and a weight sum of all internal links
  const clusterList = comps.map((members, idx) => {
    let sumW = 0;
    for (let l of links) {
      if (members.includes(l.source) && members.includes(l.target)) {
        sumW += l.weight;
      }
    }
    return {
      id: "cluster_" + idx,
      members,
      weight: sumW,
      color: colorForIndex(idx, comps.length - 1),
    };
  });

  return { clusters: clusterList, nodes, links };
}

// pie layout:
// draw arcs sized by cluster.weight
function renderPie(svg, { clusters }, controller) {
  svg.selectAll("*").remove();

  const w = svg.attr("width");
  const h = svg.attr("height");
  const r = Math.min(w, h) / 2 - 20;

  const pieGen = d3
    .pie()
    .sort(null)
    .value((d) => d.weight || 0.0001); // avoid zero-slice collapse

  const arcGen = d3.arc().innerRadius(0).outerRadius(r);

  const g = svg.append("g").attr("transform", `translate(${w / 2},${h / 2})`);

  const pieData = pieGen(clusters);

  const arcs = g
    .selectAll("path.slice")
    .data(pieData)
    .enter()
    .append("path")
    .attr("class", "slice")
    .attr("fill", (d) => d.data.color)
    .attr("stroke", "#0f172a")
    .attr("stroke-width", 1)
    // data attributes for editor
    .attr("data-type", "cluster")
    .attr("data-id", (d) => d.data.id)
    .attr("data-weight", (d) => d.data.weight)
    .on("click", (event, d) => {
      const assocId = d.data.id;
      const oldVal = Number(d.data.weight || 0).toFixed(2);

      // open editor; rerender on save
      editWeight(assocId, oldVal, () => {
        controller.render(controller.currentView);
      });

      // update detail panel
      updateDetail(`cluster ${assocId}\nweight ${oldVal}`);
    })
    .each(function (d) {
      d3.select(this).attr("d", arcGen(d));
    });

  // label clusters
  g.selectAll("text.slice-label")
    .data(pieData)
    .enter()
    .append("text")
    .attr("class", "slice-label")
    .attr("fill", "#fff")
    .attr("font-size", "10px")
    .attr("text-anchor", "middle")
    .attr("transform", (d) => {
      const c = arcGen.centroid(d);
      return `translate(${c[0]},${c[1]})`;
    })
    .text((d) => `${d.data.id} (${d.data.members.length})`);
}

// bubble layout:
// position cluster "bubbles" with collision only
function renderBubble(svg, { clusters }, controller) {
  svg.selectAll("*").remove();

  const w = svg.attr("width");
  const h = svg.attr("height");

  const nodesData = clusters.map((c, i) => {
    // radius ~ sqrt(weight) * scale
    const baseW = c.weight || 0;
    const r = Math.sqrt(baseW * 200) + 20;
    return {
      ...c,
      r,
      x: w / 2 + (Math.random() - 0.5) * 50,
      y: h / 2 + (Math.random() - 0.5) * 50,
    };
  });

  // force sim with collide, no charge
  const sim = d3
    .forceSimulation(nodesData)
    .force("center", d3.forceCenter(w / 2, h / 2))
    .force(
      "collide",
      d3.forceCollide((d) => d.r + 4)
    )
    .on("tick", ticked);

  const g = svg.append("g");

  const circles = g
    .selectAll("circle.bubble")
    .data(nodesData)
    .enter()
    .append("circle")
    .attr("class", "bubble")
    .attr("r", (d) => d.r)
    .attr("fill", (d) => d.color)
    .attr("stroke", "#0f172a")
    .attr("stroke-width", 1)
    .attr("data-type", "cluster")
    .attr("data-id", (d) => d.id)
    .attr("data-weight", (d) => d.weight)
    .on("click", (event, d) => {
      const assocId = d.id;
      const oldVal = Number(d.weight || 0).toFixed(2);

      editWeight(assocId, oldVal, () => {
        controller.render(controller.currentView);
      });

      updateDetail(`cluster ${assocId}\nweight ${oldVal}`);
    });

  const labels = g
    .selectAll("text.bubble-label")
    .data(nodesData)
    .enter()
    .append("text")
    .attr("class", "bubble-label")
    .attr("fill", "#fff")
    .attr("font-size", "10px")
    .attr("text-anchor", "middle")
    .text((d) => `${d.id} (${d.members.length})`);

  function ticked() {
    circles.attr("cx", (d) => d.x).attr("cy", (d) => d.y);

    labels.attr("x", (d) => d.x).attr("y", (d) => d.y + 3);
  }
}

// force layout:
// classic node-link force graph with drag
function renderForce(svg, { nodes, links }, controller) {
  svg.selectAll("*").remove();

  const w = svg.attr("width");
  const h = svg.attr("height");

  // shallow copies so d3 can mutate x/y
  const simNodes = nodes.map((n) => ({ ...n }));
  const simLinks = links.map((l) => ({ ...l }));

  // index nodes for link lookup by id
  const nodeById = new Map(simNodes.map((n) => [n.id, n]));
  simLinks.forEach((l) => {
    l.source = nodeById.get(l.source);
    l.target = nodeById.get(l.target);
  });

  const sim = d3
    .forceSimulation(simNodes)
    .force("link", d3.forceLink(simLinks).distance(80).strength(0.3))
    .force("charge", d3.forceManyBody().strength(-300))
    .force("center", d3.forceCenter(w / 2, h / 2))
    .on("tick", ticked);

  const g = svg.append("g");

  // draw links
  const linkEls = g
    .selectAll("line.link")
    .data(simLinks)
    .enter()
    .append("line")
    .attr("class", "link")
    .attr("stroke", (d) => d3.interpolateSpectral(d.weight || 0))
    .attr("stroke-width", (d) => 1 + (d.weight || 0) * 3)
    .attr("data-type", "link")
    .attr("data-id", (d) => d.id || `${d.source.id}->${d.target.id}`)
    .attr("data-weight", (d) => d.weight)
    .on("click", (event, d) => {
      const assocId = d.id || `${d.source.id}->${d.target.id}`;
      const oldVal = Number(d.weight || 0).toFixed(2);

      editWeight(assocId, oldVal, () => {
        controller.render(controller.currentView);
      });

      updateDetail(
        `link ${assocId}\n` +
          `${d.source.id} ↔ ${d.target.id}\n` +
          `weight ${oldVal}`
      );
    });

  // draw nodes
  const nodeEls = g
    .selectAll("circle.node")
    .data(simNodes)
    .enter()
    .append("circle")
    .attr("class", "node")
    .attr("r", 8)
    .attr("fill", (d, i) => colorForIndex(i, simNodes.length - 1))
    .attr("stroke", "#0f172a")
    .attr("stroke-width", 1)
    .attr("data-type", "node")
    .attr("data-id", (d) => d.id)
    .attr("data-label", (d) => d.label)
    .on("click", (event, d) => {
      updateDetail(`node ${d.id}\n${d.label}`);
    })
    .call(
      d3
        .drag()
        .on("start", (event, d) => {
          if (!event.active) sim.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on("drag", (event, d) => {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on("end", (event, d) => {
          if (!event.active) sim.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        })
    );

  // node labels
  const labelEls = g
    .selectAll("text.node-label")
    .data(simNodes)
    .enter()
    .append("text")
    .attr("class", "node-label")
    .attr("fill", "#fff")
    .attr("font-size", "10px")
    .attr("text-anchor", "middle")
    .text((d) => d.label);

  function ticked() {
    linkEls
      .attr("x1", (d) => d.source.x)
      .attr("y1", (d) => d.source.y)
      .attr("x2", (d) => d.target.x)
      .attr("y2", (d) => d.target.y);

    nodeEls.attr("cx", (d) => d.x).attr("cy", (d) => d.y);

    labelEls.attr("x", (d) => d.x).attr("y", (d) => d.y - 12);
  }
}

// main init - loads JSON and wires controller
export function initViewer(urlToDataJson) {
  const svg = d3.select("#viz");

  // controller state we expose back to index.html
  const controller = {
    currentView: "pie",
    currentThreshold: 0.5,
    render(view) {
      // if data hasn't loaded yet, just no-op
      if (!window.data) return;

      // rebuild cluster snapshot each render
      const snapshot = clusterData(controller.currentThreshold);

      // set svg size each time (handles resize)
      const stageEl = document.getElementById("stage");
      if (!stageEl) return;
      const rect = stageEl.getBoundingClientRect();

      svg.attr("width", rect.width).attr("height", rect.height);

      if (view === "pie") {
        renderPie(svg, snapshot, controller);
      } else if (view === "bubble") {
        renderBubble(svg, snapshot, controller);
      } else {
        renderForce(svg, snapshot, controller);
      }
    },
  };

  // initial fetch of data
  fetch(urlToDataJson)
    .then((r) => {
      if (!r.ok) {
        throw new Error("HTTP " + r.status + " " + r.statusText);
      }
      return r.json();
    })
    .then((json) => {
      window.data = json;
      controller.render(controller.currentView);
    })
    .catch((err) => {
      console.error("Failed to load data", err);
      updateDetail("Failed to load data.json");
    });

  // handle resize to keep svg full-bleed
  window.addEventListener("resize", () => {
    controller.render(controller.currentView);
  });

  return controller;
}

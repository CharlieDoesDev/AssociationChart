import { initChart, setThreshold } from "./chart.js";

const slider = document.getElementById("granularity");
const hint = document.getElementById("granularityHint");
const detail = document.getElementById("detail");

// Map slider [0..1] -> threshold [0..0.96]
const toThreshold = d3.scaleLinear().domain([0, 1]).range([0, 0.96]);

function updateHint(t) {
  hint.textContent =
    t < 0.05 ? "coarse" : t > 0.95 ? "atomic" : `fine ${Math.round(t * 100)}%`;
}

async function boot() {
  const res = await fetch("./data.json");
  const data = await res.json();

  // Initialize chart once with data
  initChart({
    raw: data.raw,
    links: data.links,
    onDetail: (text) => (detail.innerHTML = text),
  });

  // Wire slider
  const onInput = () => {
    const t = +slider.value;
    updateHint(t);
    setThreshold(toThreshold(t));
    detail.textContent = "Click a slice to see details";
  };
  slider.addEventListener("input", onInput);

  // initial draw
  onInput();
}

boot().catch((err) => {
  console.error(err);
  detail.textContent = "Failed to load data.json";
});

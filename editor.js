// editor.js
// small inline weight editor that appears near mouse
// allows editing 0-1 weight value, updates window.data, triggers download,
// then calls supplied callback(newVal)

let popoverEl; // DOM element for the floating editor
let inputEl; // number input
let saveBtn; // Save button
let cancelBtn; // Cancel button
let currentAssocId = null; // which assocId we're editing
let onDoneCb = null; // callback to run on save
let originalVal = 0; // previous weight val

// ensure popover exists in DOM
function ensurePopover() {
  if (popoverEl) return;
  popoverEl = document.createElement("div");
  popoverEl.className = "weight-editor-popover";
  popoverEl.innerHTML = `
    <label for="weightInput">Weight (0-1)</label>
    <input id="weightInput" type="number" min="0" max="1" step="0.01"/>
    <div class="weight-editor-actions">
      <button class="save-btn">Save</button>
      <button class="cancel-btn">Cancel</button>
    </div>
  `;
  document.body.appendChild(popoverEl);

  inputEl = popoverEl.querySelector("#weightInput");
  saveBtn = popoverEl.querySelector(".save-btn");
  cancelBtn = popoverEl.querySelector(".cancel-btn");

  // Save handler: update in-memory data and trigger file download
  saveBtn.addEventListener("click", () => {
    const newVal = parseFloat(inputEl.value);
    if (Number.isNaN(newVal)) {
      closePopover();
      return;
    }
    // patch window.data.links weight by assocId match
    if (window.data && Array.isArray(window.data.links)) {
      for (let link of window.data.links) {
        // assocId will match either a unique link id or a composite "src->tgt"
        if (String(link.id) === String(currentAssocId)) {
          link.weight = newVal;
        }
        // if link.id not found, also check combo key for convenience
        const combo = `${link.source}->${link.target}`;
        if (combo === String(currentAssocId)) {
          link.weight = newVal;
        }
      }
    }

    // download new data.json so user can save changes locally
    triggerDownload(window.data, "data.json");

    // notify viewer so it can rerender
    if (onDoneCb) onDoneCb(newVal);

    closePopover();
  });

  // Cancel handler: revert and hide
  cancelBtn.addEventListener("click", () => {
    // optional: restore old val in UI consumer if needed
    if (onDoneCb) onDoneCb(originalVal);
    closePopover();
  });
}

// helper to hide popover
function closePopover() {
  popoverEl.style.display = "none";
  currentAssocId = null;
  onDoneCb = null;
}

// triggers browser download of pretty JSON
function triggerDownload(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  URL.revokeObjectURL(url);
}

// public API - show editor near mouse position
export function editWeight(assocId, oldVal, callback) {
  ensurePopover();
  currentAssocId = assocId;
  originalVal = oldVal;
  onDoneCb = callback;

  // position popover at mouse cursor
  // we read the last known mouse position from window._lastMouse
  const mx = (window._lastMouse && window._lastMouse.x) || 100;
  const my = (window._lastMouse && window._lastMouse.y) || 100;
  popoverEl.style.left = mx + 12 + "px";
  popoverEl.style.top = my + 12 + "px";

  // fill current value
  inputEl.value = Number(oldVal).toFixed(2);

  // show
  popoverEl.style.display = "block";
  inputEl.focus();
}

// track mouse globally so we know where to spawn editor
window.addEventListener("pointermove", (e) => {
  window._lastMouse = { x: e.clientX, y: e.clientY };
});

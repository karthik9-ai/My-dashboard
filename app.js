const storageKey = "tracker-app-state-v1";

const defaultState = {
  trackers: [
    {
      id: createId(),
      name: "Water",
      category: "Health",
      unit: "cups",
      target: 8,
      color: "#2374ab",
      entries: [
        entryDaysAgo(0, 5, "Morning and lunch"),
        entryDaysAgo(1, 7, ""),
        entryDaysAgo(2, 8, "Hit target"),
      ],
    },
    {
      id: createId(),
      name: "Reading",
      category: "Focus",
      unit: "pages",
      target: 25,
      color: "#8a5a44",
      entries: [entryDaysAgo(0, 12, "Before work"), entryDaysAgo(3, 30, "")],
    },
    {
      id: createId(),
      name: "Savings",
      category: "Money",
      unit: "$",
      target: 50,
      color: "#287d5a",
      entries: [entryDaysAgo(1, 45, "Moved to reserve"), entryDaysAgo(4, 60, "")],
    },
  ],
};

let state = loadState();
let editingTrackerId = null;

const elements = {
  todayLabel: document.querySelector("#todayLabel"),
  navButtons: document.querySelectorAll(".nav-button"),
  views: document.querySelectorAll(".view"),
  trackerGrid: document.querySelector("#trackerGrid"),
  trackerTemplate: document.querySelector("#trackerCardTemplate"),
  summaryStrip: document.querySelector("#summaryStrip"),
  emptyState: document.querySelector("#emptyState"),
  categoryFilter: document.querySelector("#categoryFilter"),
  dialog: document.querySelector("#trackerDialog"),
  form: document.querySelector("#trackerForm"),
  dialogTitle: document.querySelector("#dialogTitle"),
  newTrackerButton: document.querySelector("#newTrackerButton"),
  entryList: document.querySelector("#entryList"),
  entrySearch: document.querySelector("#entrySearch"),
  insightGrid: document.querySelector("#insightGrid"),
  exportData: document.querySelector("#exportData"),
  importData: document.querySelector("#importData"),
};

render();
bindEvents();

function bindEvents() {
  elements.navButtons.forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.view));
  });

  elements.newTrackerButton.addEventListener("click", () => openTrackerDialog());
  document.querySelectorAll("[data-open-form]").forEach((button) => {
    button.addEventListener("click", () => openTrackerDialog());
  });

  elements.form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (event.submitter?.value === "cancel") {
      elements.dialog.close();
      return;
    }
    saveTrackerFromForm();
  });

  elements.categoryFilter.addEventListener("change", renderTrackers);
  elements.entrySearch.addEventListener("input", renderEntries);
  elements.exportData.addEventListener("click", exportState);
  elements.importData.addEventListener("change", importState);
}

function render() {
  elements.todayLabel.textContent = new Intl.DateTimeFormat("en", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date());

  renderCategories();
  renderSummary();
  renderTrackers();
  renderEntries();
  renderInsights();
}

function setView(viewName) {
  elements.navButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.view === viewName);
  });
  elements.views.forEach((view) => {
    view.classList.toggle("active-view", view.id === `${viewName}View`);
  });
}

function renderCategories() {
  const selected = elements.categoryFilter.value;
  const categories = [...new Set(state.trackers.map((tracker) => tracker.category || "General"))].sort();
  elements.categoryFilter.innerHTML = '<option value="all">All categories</option>';
  categories.forEach((category) => {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    elements.categoryFilter.append(option);
  });
  elements.categoryFilter.value = categories.includes(selected) ? selected : "all";
}

function renderSummary() {
  const todayTotal = state.trackers.reduce((sum, tracker) => sum + totalForDay(tracker, todayKey()), 0);
  const targetTotal = state.trackers.reduce((sum, tracker) => sum + Number(tracker.target || 0), 0);
  const completed = state.trackers.filter((tracker) => totalForDay(tracker, todayKey()) >= tracker.target).length;
  const entries = state.trackers.reduce((sum, tracker) => sum + tracker.entries.length, 0);

  elements.summaryStrip.innerHTML = "";
  [
    ["Today logged", formatNumber(todayTotal)],
    ["Targets met", `${completed}/${state.trackers.length}`],
    ["Total entries", entries],
    ["Target progress", `${targetTotal ? Math.round((todayTotal / targetTotal) * 100) : 0}%`],
  ].forEach(([label, value]) => {
    const item = document.createElement("div");
    item.className = "summary-item";
    item.innerHTML = `<span>${label}</span><strong>${value}</strong>`;
    elements.summaryStrip.append(item);
  });
}

function renderTrackers() {
  const filter = elements.categoryFilter.value;
  const trackers = state.trackers.filter((tracker) => filter === "all" || tracker.category === filter);
  elements.trackerGrid.innerHTML = "";
  elements.emptyState.classList.toggle("hidden", state.trackers.length > 0);

  trackers.forEach((tracker) => {
    const total = totalForDay(tracker, todayKey());
    const percent = tracker.target ? Math.min((total / tracker.target) * 100, 100) : 0;
    const card = elements.trackerTemplate.content.firstElementChild.cloneNode(true);
    card.style.setProperty("--accent", tracker.color);
    card.querySelector(".category-pill").textContent = tracker.category || "General";
    card.querySelector("h3").textContent = tracker.name;
    card.querySelector(".current-value").textContent = `${formatNumber(total)} ${tracker.unit}`.trim();
    card.querySelector(".target-value").textContent = `Target ${formatNumber(tracker.target)} ${tracker.unit}`.trim();
    card.querySelector(".progress-track span").style.width = `${percent}%`;
    card.querySelector(".card-note").textContent = `${streakForTracker(tracker)} day streak · ${tracker.entries.length} logs`;

    const quickInput = card.querySelector(".quick-log input");
    quickInput.placeholder = tracker.unit || "value";
    card.querySelector(".quick-log").addEventListener("submit", (event) => {
      event.preventDefault();
      const value = Number(quickInput.value);
      if (!Number.isFinite(value) || value <= 0) return;
      tracker.entries.unshift({ id: createId(), date: todayKey(), value, note: "" });
      quickInput.value = "";
      persistAndRender();
    });

    card.querySelector(".menu-trigger").addEventListener("click", () => openTrackerDialog(tracker.id));
    elements.trackerGrid.append(card);
  });
}

function renderEntries() {
  const search = elements.entrySearch.value.trim().toLowerCase();
  const entries = state.trackers
    .flatMap((tracker) =>
      tracker.entries.map((entry) => ({
        ...entry,
        trackerName: tracker.name,
        unit: tracker.unit,
        color: tracker.color,
      })),
    )
    .filter((entry) => `${entry.trackerName} ${entry.note}`.toLowerCase().includes(search))
    .sort((a, b) => b.date.localeCompare(a.date));

  elements.entryList.innerHTML = entries.length ? "" : '<div class="empty-state"><h3>No entries found</h3><p>Try another search or log today from the dashboard.</p></div>';
  entries.forEach((entry) => {
    const item = document.createElement("article");
    item.className = "entry-item";
    item.style.borderLeft = `5px solid ${entry.color}`;
    item.innerHTML = `
      <h3>${entry.trackerName}</h3>
      <div class="entry-meta">
        <span>${formatEntryDate(entry.date)}</span>
        <strong>${formatNumber(entry.value)} ${entry.unit}</strong>
      </div>
      ${entry.note ? `<p class="entry-note">${entry.note}</p>` : ""}
    `;
    elements.entryList.append(item);
  });
}

function renderInsights() {
  elements.insightGrid.innerHTML = "";
  state.trackers.forEach((tracker) => {
    const card = document.createElement("article");
    card.className = "insight-card";
    card.style.setProperty("--accent", tracker.color);
    const days = lastSevenDays();
    const max = Math.max(tracker.target, ...days.map((day) => totalForDay(tracker, day)), 1);
    card.innerHTML = `<h3>${tracker.name}</h3><div class="bars"></div>`;
    const bars = card.querySelector(".bars");
    days.forEach((day) => {
      const value = totalForDay(tracker, day);
      const bar = document.createElement("div");
      bar.className = "bar";
      bar.innerHTML = `<span style="height:${Math.max((value / max) * 100, 4)}%"></span><span>${weekdayShort(day)}</span>`;
      bar.title = `${formatNumber(value)} ${tracker.unit} on ${formatEntryDate(day)}`;
      bars.append(bar);
    });
    elements.insightGrid.append(card);
  });
}

function openTrackerDialog(trackerId = null) {
  editingTrackerId = trackerId;
  const tracker = state.trackers.find((item) => item.id === trackerId);
  elements.dialogTitle.textContent = tracker ? "Edit tracker" : "New tracker";
  elements.form.elements.name.value = tracker?.name || "";
  elements.form.elements.category.value = tracker?.category || "";
  elements.form.elements.unit.value = tracker?.unit || "";
  elements.form.elements.target.value = tracker?.target || 1;
  elements.form.elements.color.value = tracker?.color || "#2374ab";
  elements.dialog.showModal();
  elements.form.elements.name.focus();
}

function saveTrackerFromForm() {
  const formData = new FormData(elements.form);
  const payload = {
    name: formData.get("name").trim(),
    category: formData.get("category").trim() || "General",
    unit: formData.get("unit").trim(),
    target: Number(formData.get("target")),
    color: formData.get("color"),
  };

  if (editingTrackerId) {
    const tracker = state.trackers.find((item) => item.id === editingTrackerId);
    Object.assign(tracker, payload);
  } else {
    state.trackers.push({ id: createId(), ...payload, entries: [] });
  }

  elements.dialog.close();
  persistAndRender();
}

function persistAndRender() {
  localStorage.setItem(storageKey, JSON.stringify(state));
  render();
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (saved?.trackers) return saved;
  } catch {
    localStorage.removeItem(storageKey);
  }
  return defaultState;
}

function exportState() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `tracker-export-${todayKey()}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function importState(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    try {
      const imported = JSON.parse(reader.result);
      if (!Array.isArray(imported.trackers)) throw new Error("Missing trackers");
      state = imported;
      persistAndRender();
    } catch {
      alert("That file does not look like a tracker export.");
    }
  });
  reader.readAsText(file);
  event.target.value = "";
}

function totalForDay(tracker, date) {
  return tracker.entries.filter((entry) => entry.date === date).reduce((sum, entry) => sum + Number(entry.value || 0), 0);
}

function streakForTracker(tracker) {
  let streak = 0;
  for (const day of lastNDays(60)) {
    if (totalForDay(tracker, day) >= tracker.target) streak += 1;
    else break;
  }
  return streak;
}

function todayKey() {
  return dateKey(new Date());
}

function entryDaysAgo(days, value, note) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return { id: createId(), date: dateKey(date), value, note };
}

function lastSevenDays() {
  return lastNDays(7).reverse();
}

function lastNDays(count) {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - index);
    return dateKey(date);
  });
}

function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function createId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function weekdayShort(dateKey) {
  return new Intl.DateTimeFormat("en", { weekday: "short" }).format(new Date(`${dateKey}T00:00:00`));
}

function formatEntryDate(dateKey) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${dateKey}T00:00:00`));
}

function formatNumber(value) {
  return new Intl.NumberFormat("en", { maximumFractionDigits: 1 }).format(value);
}

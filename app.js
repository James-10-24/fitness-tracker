let state = {
  foods: [],
  logs: [],
  goals: { cal: 2000, pro: 150 }
};

const STORAGE_KEY = "nutrilog_v1";
const APP_FILES = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest",
  "./icons/icon.svg",
  "./icons/icon-192.svg",
  "./icons/icon-512.svg"
];

let currentPage = "today";
let selectedFoodId = null;
let toastTimer;
let deferredInstallPrompt = null;

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error("Failed to save state", error);
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      state = { ...state, ...JSON.parse(raw) };
    }
  } catch (error) {
    console.error("Failed to load state", error);
  }
}

function todayStr() {
  const now = new Date();
  const local = new Date(now.getTime() - (now.getTimezoneOffset() * 60000));
  return local.toISOString().slice(0, 10);
}

function todayLogs() {
  return state.logs.filter((entry) => entry.date === todayStr());
}

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function showPage(page) {
  document.querySelectorAll(".page").forEach((node) => node.classList.remove("active"));
  document.querySelectorAll(".nav-btn").forEach((node) => node.classList.remove("active"));
  document.getElementById(`page-${page}`).classList.add("active");
  document.getElementById(`nav-${page}`).classList.add("active");
  currentPage = page;

  if (page === "today") {
    renderToday();
  }
  if (page === "log") {
    renderFoodPicker();
  }
  if (page === "foods") {
    renderFoodsDB();
  }
  if (page === "history") {
    renderHistory();
  }
  updateFab();
}

function updateFab() {
  const fab = document.getElementById("fab-btn");
  if (currentPage === "foods") {
    fab.style.display = "flex";
    fab.title = "Add Food";
  } else if (currentPage === "log" || currentPage === "history") {
    fab.style.display = "none";
  } else {
    fab.style.display = "flex";
    fab.title = currentPage === "today" ? "Log Meal" : "Add";
  }
}

function handleFab() {
  if (currentPage === "today") {
    showPage("log");
  } else if (currentPage === "foods") {
    openFoodModal();
  }
}

function renderToday() {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  document.getElementById("today-greeting").textContent = greeting;

  const date = new Date();
  document.getElementById("today-date").textContent = date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric"
  });

  const logs = todayLogs();
  const totalCal = logs.reduce((sum, log) => sum + (log.cal || 0), 0);
  const totalPro = logs.reduce((sum, log) => sum + (log.pro || 0), 0);
  const goalCal = state.goals.cal;
  const goalPro = state.goals.pro;

  document.getElementById("today-cal-val").textContent = Math.round(totalCal);
  document.getElementById("today-pro-val").textContent = Math.round(totalPro);
  document.getElementById("today-cal-goal").textContent = goalCal;
  document.getElementById("today-pro-goal").textContent = goalPro;

  document.getElementById("prog-cal-curr").textContent = Math.round(totalCal);
  document.getElementById("prog-cal-goal").textContent = goalCal;
  document.getElementById("prog-pro-curr").textContent = Math.round(totalPro);
  document.getElementById("prog-pro-goal").textContent = goalPro;

  const pCal = goalCal > 0 ? Math.min((totalCal / goalCal) * 100, 100) : 0;
  const pPro = goalPro > 0 ? Math.min((totalPro / goalPro) * 100, 100) : 0;
  document.getElementById("prog-cal-bar").style.width = `${pCal}%`;
  document.getElementById("prog-pro-bar").style.width = `${pPro}%`;

  document.getElementById("cal-progress-wrap").classList.toggle("progress-over", totalCal > goalCal);
  document.getElementById("pro-progress-wrap").classList.toggle("progress-over", totalPro > goalPro);

  const list = document.getElementById("today-meal-list");
  if (!logs.length) {
    list.innerHTML = "<div class=\"empty-state\"><div class=\"empty-icon\">Meal</div>No meals logged yet.<br>Tap + to add your first meal.</div>";
    return;
  }

  list.innerHTML = logs.slice().reverse().map((log) => `
    <div class="meal-item">
      <div>
        <div class="meal-name">${escHtml(log.name)}</div>
        <div class="meal-meta">${Math.round(log.cal)} kcal · ${Math.round(log.pro)}g protein</div>
      </div>
      <div class="meal-right">
        <span class="meal-cals">${Math.round(log.cal)}</span>
        <button class="meal-del" onclick="deleteLog('${log.id}')" title="Remove">x</button>
      </div>
    </div>
  `).join("");
}

function deleteLog(id) {
  state.logs = state.logs.filter((entry) => entry.id !== id);
  saveState();
  renderToday();
  showToast("Meal removed");
}

function switchLogTab(tab) {
  document.querySelectorAll(".tab-pill").forEach((pill, index) => {
    const active = (index === 0 && tab === "from-foods") || (index === 1 && tab === "custom");
    pill.classList.toggle("active", active);
  });
  document.getElementById("tab-from-foods").classList.toggle("active", tab === "from-foods");
  document.getElementById("tab-custom").classList.toggle("active", tab === "custom");
}

function renderFoodPicker() {
  const query = (document.getElementById("food-search")?.value || "").toLowerCase();
  const list = document.getElementById("food-picker-list");
  const foods = state.foods.filter((food) => !query || food.name.toLowerCase().includes(query));

  if (!foods.length) {
    list.innerHTML = "<div class=\"empty-state\" style=\"padding:16px 0\">No foods found.<br>Add foods in the Foods tab first.</div>";
    return;
  }

  list.innerHTML = foods.map((food) => `
    <div class="food-option ${selectedFoodId === food.id ? "selected" : ""}" onclick="selectFood('${food.id}')">
      <div>
        <div class="food-option-name">${escHtml(food.name)}</div>
        <div class="food-option-meta">${food.cal} kcal · ${food.pro}g protein${food.serving ? ` · ${escHtml(food.serving)}` : ""}</div>
      </div>
      <span class="food-option-badge">${food.cal} cal</span>
    </div>
  `).join("");
}

function selectFood(id) {
  selectedFoodId = selectedFoodId === id ? null : id;
  renderFoodPicker();
}

function logFromFood() {
  if (!selectedFoodId) {
    showToast("Please select a food first");
    return;
  }

  const food = state.foods.find((entry) => entry.id === selectedFoodId);
  if (!food) {
    return;
  }

  const servings = parseFloat(document.getElementById("log-servings").value) || 1;
  state.logs.push({
    id: uid(),
    date: todayStr(),
    name: food.name,
    cal: food.cal * servings,
    pro: food.pro * servings
  });

  saveState();
  selectedFoodId = null;
  document.getElementById("log-servings").value = "1";
  document.getElementById("food-search").value = "";
  renderFoodPicker();
  showToast("Meal logged");
  setTimeout(() => showPage("today"), 400);
}

function logCustom() {
  const name = document.getElementById("custom-name").value.trim();
  const cal = parseFloat(document.getElementById("custom-cal").value) || 0;
  const pro = parseFloat(document.getElementById("custom-pro").value) || 0;

  if (!name) {
    showToast("Please enter a meal name");
    return;
  }

  state.logs.push({ id: uid(), date: todayStr(), name, cal, pro });
  saveState();
  document.getElementById("custom-name").value = "";
  document.getElementById("custom-cal").value = "";
  document.getElementById("custom-pro").value = "";
  showToast("Meal logged");
  setTimeout(() => showPage("today"), 400);
}

function goToFoodsAndAdd() {
  showPage("foods");
  setTimeout(() => openFoodModal(), 200);
}

function renderFoodsDB() {
  const list = document.getElementById("foods-list");
  if (!state.foods.length) {
    list.innerHTML = "<div class=\"empty-state\"><div class=\"empty-icon\">Food</div>No foods yet.<br>Tap + to add your first food.</div>";
    return;
  }

  list.innerHTML = state.foods.map((food) => `
    <div class="food-row">
      <div class="food-row-info">
        <div class="food-row-name">${escHtml(food.name)}</div>
        <div class="food-row-meta">${food.cal} kcal · ${food.pro}g protein${food.serving ? ` · ${escHtml(food.serving)}` : ""}</div>
      </div>
      <div class="food-row-actions">
        <button class="icon-btn" onclick="openFoodModal('${food.id}')" title="Edit">Edit</button>
      </div>
    </div>
  `).join("");
}

function openFoodModal(editId) {
  const modal = document.getElementById("overlay-food");
  const deleteButton = document.getElementById("food-delete-btn");
  document.getElementById("food-edit-id").value = editId || "";

  if (editId) {
    const food = state.foods.find((entry) => entry.id === editId);
    if (!food) {
      return;
    }
    document.getElementById("food-modal-title").textContent = "Edit Food";
    document.getElementById("food-name-input").value = food.name;
    document.getElementById("food-cal-input").value = food.cal;
    document.getElementById("food-pro-input").value = food.pro;
    document.getElementById("food-serving-input").value = food.serving || "";
    deleteButton.style.display = "block";
  } else {
    document.getElementById("food-modal-title").textContent = "Add Food";
    document.getElementById("food-name-input").value = "";
    document.getElementById("food-cal-input").value = "";
    document.getElementById("food-pro-input").value = "";
    document.getElementById("food-serving-input").value = "";
    deleteButton.style.display = "none";
  }

  modal.classList.add("open");
}

function saveFood() {
  const name = document.getElementById("food-name-input").value.trim();
  const cal = parseFloat(document.getElementById("food-cal-input").value) || 0;
  const pro = parseFloat(document.getElementById("food-pro-input").value) || 0;
  const serving = document.getElementById("food-serving-input").value.trim();

  if (!name) {
    showToast("Please enter a food name");
    return;
  }

  const editId = document.getElementById("food-edit-id").value;
  if (editId) {
    const index = state.foods.findIndex((food) => food.id === editId);
    if (index >= 0) {
      state.foods[index] = { ...state.foods[index], name, cal, pro, serving };
    }
  } else {
    state.foods.push({ id: uid(), name, cal, pro, serving });
  }

  saveState();
  closeModal("food");
  renderFoodsDB();
  renderFoodPicker();
  showToast(editId ? "Food updated" : "Food added");
}

function deleteFood() {
  const editId = document.getElementById("food-edit-id").value;
  if (!editId) {
    return;
  }
  if (!window.confirm("Delete this food from your database?")) {
    return;
  }

  state.foods = state.foods.filter((food) => food.id !== editId);
  saveState();
  closeModal("food");
  renderFoodsDB();
  renderFoodPicker();
  showToast("Food deleted");
}

function renderHistory() {
  const content = document.getElementById("history-content");
  const allDates = [...new Set(state.logs.map((entry) => entry.date))]
    .sort()
    .reverse()
    .filter((date) => date !== todayStr());

  if (!allDates.length) {
    content.innerHTML = "<div class=\"empty-state\" style=\"padding-top:32px\"><div class=\"empty-icon\">Past</div>No history yet.<br>Keep logging and check back!</div>";
    return;
  }

  content.innerHTML = allDates.map((date) => {
    const logs = state.logs.filter((entry) => entry.date === date);
    const totalCal = logs.reduce((sum, log) => sum + (log.cal || 0), 0);
    const totalPro = logs.reduce((sum, log) => sum + (log.pro || 0), 0);
    const label = new Date(`${date}T12:00:00`).toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric"
    });
    const pCal = state.goals.cal > 0 ? Math.min((totalCal / state.goals.cal) * 100, 100) : 0;
    const pPro = state.goals.pro > 0 ? Math.min((totalPro / state.goals.pro) * 100, 100) : 0;

    return `
      <div class="history-day">
        <div class="history-date">${label}</div>
        <div class="history-card">
          <div class="history-row">
            <div class="history-stat"><div class="hval">${Math.round(totalCal)}</div><div class="hunit">kcal</div></div>
            <div class="history-stat"><div class="hval">${Math.round(totalPro)}g</div><div class="hunit">protein</div></div>
            <div class="history-stat"><div class="hval">${logs.length}</div><div class="hunit">meals</div></div>
          </div>
          <div class="progress-wrap" style="margin-bottom:8px">
            <div class="progress-top"><span class="progress-name" style="font-size:12px">Calories</span><span class="progress-nums">${Math.round(pCal)}%</span></div>
            <div class="progress-bar-bg"><div class="progress-bar-fill fill-cal" style="width:${pCal}%"></div></div>
          </div>
          <div class="progress-wrap" style="margin-bottom:0">
            <div class="progress-top"><span class="progress-name" style="font-size:12px">Protein</span><span class="progress-nums">${Math.round(pPro)}%</span></div>
            <div class="progress-bar-bg"><div class="progress-bar-fill fill-pro" style="width:${pPro}%"></div></div>
          </div>
        </div>
      </div>
    `;
  }).join("");
}

function showGoalsModal() {
  document.getElementById("goal-cal-input").value = state.goals.cal;
  document.getElementById("goal-pro-input").value = state.goals.pro;
  document.getElementById("overlay-goals").classList.add("open");
}

function saveGoals() {
  state.goals.cal = parseFloat(document.getElementById("goal-cal-input").value) || 2000;
  state.goals.pro = parseFloat(document.getElementById("goal-pro-input").value) || 150;
  saveState();
  closeModal("goals");
  renderToday();
  renderHistory();
  showToast("Goals updated");
}

function closeModal(name) {
  document.getElementById(`overlay-${name}`).classList.remove("open");
}

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2000);
}

function escHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[char]));
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  window.addEventListener("load", async () => {
    try {
      await navigator.serviceWorker.register("./sw.js");
    } catch (error) {
      console.error("Service worker registration failed", error);
    }
  });
}

function setupInstallPrompt() {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
  });
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    document.querySelectorAll(".overlay.open").forEach((overlay) => overlay.classList.remove("open"));
  }
});

document.addEventListener("DOMContentLoaded", () => {
  loadState();
  renderToday();
  renderFoodsDB();
  renderFoodPicker();
  renderHistory();
  updateFab();
  registerServiceWorker();
  setupInstallPrompt();
});

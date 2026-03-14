let state = {
  foods: [],
  logs: [],
  waterLogs: [],
  stepLogs: [],
  waterUnits: [],
  goals: { cal: 2000, pro: 150, carb: 220, fat: 65, water: 2.5, steps: 8000 }
};

const STORAGE_KEY = "nutrilog_v2";
const LEGACY_STORAGE_KEY = "nutrilog_v1";
const AI_ESTIMATE_ENDPOINT = "/api/estimate-food";
const OUNCES_TO_GRAMS = 28.3495;
const CUP_TO_ML = 240;

let currentPage = "today";
let selectedFoodId = null;
let toastTimer;
let activeAiEstimate = null;

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error("Failed to save state", error);
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
    if (raw) {
      state = { ...state, ...JSON.parse(raw) };
      state.waterLogs = Array.isArray(state.waterLogs) ? state.waterLogs : [];
      state.stepLogs = Array.isArray(state.stepLogs) ? state.stepLogs : [];
      state.waterUnits = defaultWaterUnits(state.waterUnits);
      state.foods = Array.isArray(state.foods) ? state.foods.map(normalizeFoodRecord) : [];
      state.goals = { cal: 2000, pro: 150, carb: 220, fat: 65, water: 2.5, steps: 8000, ...(state.goals || {}) };
    }
  } catch (error) {
    console.error("Failed to load state", error);
  }

  state.waterUnits = defaultWaterUnits(state.waterUnits);
}

function todayStr() {
  const now = new Date();
  const local = new Date(now.getTime() - (now.getTimezoneOffset() * 60000));
  return local.toISOString().slice(0, 10);
}

function todayLogs() {
  return state.logs.filter((entry) => entry.date === todayStr());
}

function todayWaterTotal() {
  return state.waterLogs
    .filter((entry) => entry.date === todayStr())
    .reduce((sum, entry) => sum + (entry.amount || 0), 0);
}

function todayStepsTotal() {
  return state.stepLogs
    .filter((entry) => entry.date === todayStr())
    .reduce((sum, entry) => sum + (entry.amount || 0), 0);
}

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function defaultWaterUnits(existingUnits = []) {
  const existing = Array.isArray(existingUnits) ? existingUnits : [];
  const glass = existing.find((unit) => String(unit.name).toLowerCase() === "glass");
  const bottle = existing.find((unit) => String(unit.name).toLowerCase() === "bottle");
  return [
    normalizeWaterUnit({ id: glass?.id || "glass-unit", name: "Glass", ml: glass?.ml || 250 }),
    normalizeWaterUnit({ id: bottle?.id || "bottle-unit", name: "Bottle", ml: bottle?.ml || 500 })
  ];
}

function normalizeWaterUnit(unit) {
  return {
    id: unit.id || uid(),
    name: (unit.name || "Drink").trim(),
    ml: Math.max(1, Math.round(normalizePositiveNumber(unit.ml, 250) || 250))
  };
}

function normalizeFoodRecord(food) {
  const grams = Math.max(1, normalizePositiveNumber(food.grams, 0) || inferGramsFromServing(food.serving) || 100);
  const cal = normalizePositiveNumber(food.cal, 0);
  const pro = normalizePositiveNumber(food.pro, 0);
  const carb = normalizePositiveNumber(food.carb, 0);
  const fat = normalizePositiveNumber(food.fat, 0);
  const quantityMeta = inferQuantityFromServing(food.serving);
  const baseQuantity = normalizePositiveNumber(food.baseQuantity, 0) || quantityMeta.baseQuantity || 0;
  const quantityUnit = food.quantityUnit || quantityMeta.quantityUnit || "";
  return {
    ...food,
    grams,
    cal,
    pro,
    carb,
    fat,
    baseQuantity,
    quantityUnit,
    calPerGram: cal / grams,
    proPerGram: pro / grams,
    carbPerGram: carb / grams,
    fatPerGram: fat / grams,
    serving: food.serving || `${Math.round(grams)} g`
  };
}

function inferGramsFromServing(serving) {
  if (!serving) {
    return 0;
  }
  const match = String(serving).match(/(\d+(?:\.\d+)?)\s*g\b/i);
  return match ? Number(match[1]) : 0;
}

function inferQuantityFromServing(serving) {
  if (!serving) {
    return { baseQuantity: 0, quantityUnit: "" };
  }
  const cleaned = String(serving).trim();
  const match = cleaned.match(/^(\d+(?:\.\d+)?)\s+(.+)$/i);
  if (!match) {
    return { baseQuantity: 0, quantityUnit: "" };
  }

  const unit = normalizeFoodUnit(match[2].trim());
  if (isWeightUnit(unit)) {
    return { baseQuantity: 0, quantityUnit: "" };
  }

  return {
    baseQuantity: Number(match[1]),
    quantityUnit: unit
  };
}

function formatFoodBaseLabel(food) {
  if (food.quantityUnit && food.baseQuantity > 0) {
    return `${roundNutrient(food.baseQuantity)} ${formatFoodUnitLabel(food.quantityUnit, getFoodUnitKind(food.quantityUnit), food.baseQuantity)}`;
  }
  return food.serving || `${Math.round(food.grams)} g`;
}

function singularizeUnit(unit) {
  if (!unit) {
    return "";
  }
  return unit.replace(/\bpieces\b/i, "piece").replace(/\beggs\b/i, "egg").replace(/s$/i, "");
}

function normalizeFoodUnit(unit) {
  const cleaned = singularizeUnit(String(unit || "").trim().toLowerCase()).replace(/\s+/g, " ");
  if (!cleaned) {
    return "";
  }
  if (["g", "gram"].includes(cleaned)) return "g";
  if (["kg", "kilogram"].includes(cleaned)) return "kg";
  if (["oz", "ounce"].includes(cleaned)) return "oz";
  if (["lb", "pound"].includes(cleaned)) return "lb";
  if (["ml", "milliliter"].includes(cleaned)) return "ml";
  if (["l", "liter"].includes(cleaned)) return "l";
  if (["cup"].includes(cleaned)) return "cup";
  return cleaned;
}

function isWeightUnit(unit) {
  return ["g", "kg", "oz", "lb"].includes(normalizeFoodUnit(unit));
}

function isVolumeUnit(unit) {
  return ["ml", "l", "cup"].includes(normalizeFoodUnit(unit));
}

function getFoodUnitKind(unit) {
  const normalized = normalizeFoodUnit(unit);
  if (isWeightUnit(normalized)) return "weight";
  if (isVolumeUnit(normalized)) return "volume";
  if (normalized) return "piece";
  return "weight";
}

function formatFoodUnitLabel(unit, kind, amount = 2) {
  const normalized = normalizeFoodUnit(unit);
  if (kind === "weight") {
    if (normalized === "g") return "g";
    if (normalized === "oz") return "oz";
    if (normalized === "kg") return "kg";
    if (normalized === "lb") return "lb";
  }
  if (kind === "volume") {
    if (normalized === "ml") return "ml";
    if (normalized === "l") return "L";
    if (normalized === "cup") return amount === 1 ? "cup" : "cups";
  }
  if (kind === "piece") {
    if (normalized === "piece") return amount === 1 ? "piece" : "pieces";
    if (!normalized || normalized === "qty") return "qty";
    return amount === 1 ? normalized : `${normalized}s`;
  }
  return normalized || "qty";
}

function convertToCanonicalFoodAmount(value, unit, kind) {
  const amount = normalizePositiveNumber(value, 0);
  const normalized = normalizeFoodUnit(unit);
  if (kind === "weight") {
    if (normalized === "oz") return amount * OUNCES_TO_GRAMS;
    if (normalized === "kg") return amount * 1000;
    if (normalized === "lb") return amount * 453.592;
    return amount;
  }
  if (kind === "volume") {
    if (normalized === "cup") return amount * CUP_TO_ML;
    if (normalized === "l") return amount * 1000;
    return amount;
  }
  return amount;
}

function convertFromCanonicalFoodAmount(value, unit, kind) {
  const amount = normalizePositiveNumber(value, 0);
  const normalized = normalizeFoodUnit(unit);
  if (kind === "weight") {
    if (normalized === "oz") return amount / OUNCES_TO_GRAMS;
    if (normalized === "kg") return amount / 1000;
    if (normalized === "lb") return amount / 453.592;
    return amount;
  }
  if (kind === "volume") {
    if (normalized === "cup") return amount / CUP_TO_ML;
    if (normalized === "l") return amount / 1000;
    return amount;
  }
  return amount;
}

function getFoodLogConfig(food) {
  if (food && food.quantityUnit && food.baseQuantity > 0) {
    const unitKind = getFoodUnitKind(food.quantityUnit);
    if (unitKind === "volume") {
      const baseUnit = normalizeFoodUnit(food.quantityUnit);
      const selectedUnit = baseUnit === "l" ? "l" : baseUnit === "cup" ? "cup" : "ml";
      const units = baseUnit === "l"
        ? ["l", "ml", "cup"]
        : baseUnit === "cup"
          ? ["cup", "ml"]
          : ["ml", "cup"];
      const baseCanonical = convertToCanonicalFoodAmount(food.baseQuantity, baseUnit, "volume");
      return {
        kind: "volume",
        label: "Amount",
        helper: selectedUnit === "cup" ? "Enter the amount in cups" : selectedUnit === "l" ? "Enter the amount in L" : "Enter the amount in ml",
        selectedUnit,
        options: units.map((unit) => ({ value: unit, label: formatFoodUnitLabel(unit, "volume", unit === "cup" ? 2 : 1) })),
        amount: roundNutrient(convertFromCanonicalFoodAmount(baseCanonical, selectedUnit, "volume")),
        min: "0.1",
        step: "0.1"
      };
    }
    return {
      kind: "piece",
      label: `Quantity (${formatFoodUnitLabel(food.quantityUnit, "piece", 2)})`,
      helper: "Enter how many you had",
      selectedUnit: normalizeFoodUnit(food.quantityUnit) || "qty",
      options: [{ value: normalizeFoodUnit(food.quantityUnit) || "qty", label: formatFoodUnitLabel(food.quantityUnit, "piece", 2) }],
      amount: roundNutrient(food.baseQuantity),
      min: "0.1",
      step: "0.1"
    };
  }

  return {
    kind: "weight",
    label: "Amount",
    helper: "Enter how many grams you had",
    selectedUnit: "g",
    options: [
      { value: "g", label: "g" },
      { value: "oz", label: "oz" }
    ],
    amount: food ? Math.round(food.grams) : 100,
    min: "1",
    step: "1"
  };
}

function updateFoodLogInputMode() {
  const amountLabel = document.getElementById("log-amount-label");
  const amountInput = document.getElementById("log-amount");
  const unitSelect = document.getElementById("log-unit");
  const helper = document.getElementById("log-input-helper");
  const food = state.foods.find((entry) => entry.id === selectedFoodId);
  const config = getFoodLogConfig(food);
  if (!amountLabel || !amountInput || !unitSelect) {
    return;
  }

  amountLabel.textContent = config.label;
  amountInput.min = config.min;
  amountInput.step = config.step;
  amountInput.value = String(config.amount);
  amountInput.placeholder = String(config.amount);
  unitSelect.innerHTML = config.options.map((option) => `
    <option value="${escHtml(option.value)}" ${option.value === config.selectedUnit ? "selected" : ""}>${escHtml(option.label)}</option>
  `).join("");
  unitSelect.disabled = config.options.length === 1;
  unitSelect.dataset.prevUnit = config.selectedUnit;
  if (helper) {
    helper.textContent = config.helper;
  }
}

function handleLogUnitChange() {
  const amountInput = document.getElementById("log-amount");
  const unitSelect = document.getElementById("log-unit");
  const helper = document.getElementById("log-input-helper");
  const food = state.foods.find((entry) => entry.id === selectedFoodId);
  if (!amountInput || !unitSelect || !food) {
    return;
  }

  const config = getFoodLogConfig(food);
  const prevUnit = unitSelect.dataset.prevUnit || config.selectedUnit;
  const nextUnit = unitSelect.value;
  const currentValue = normalizePositiveNumber(amountInput.value, config.amount);
  const canonical = convertToCanonicalFoodAmount(currentValue, prevUnit, config.kind);
  const converted = convertFromCanonicalFoodAmount(canonical, nextUnit, config.kind);
  amountInput.value = config.kind === "weight" && nextUnit === "g"
    ? String(Math.round(converted))
    : String(roundNutrient(converted));
  unitSelect.dataset.prevUnit = nextUnit;

  if (helper) {
    if (config.kind === "weight") {
      helper.textContent = nextUnit === "oz" ? "Enter how many ounces you had" : "Enter how many grams you had";
    } else if (config.kind === "volume") {
      helper.textContent = nextUnit === "cup" ? "Enter the amount in cups" : nextUnit === "l" ? "Enter the amount in L" : "Enter the amount in ml";
    }
  }
}

function roundNutrient(value) {
  return Math.round(Number(value) * 10) / 10;
}

function normalizePositiveNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function showPage(page) {
  closeFabMenu();
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
  if (!fab) {
    return;
  }
  if (currentPage === "foods") {
    fab.style.display = "flex";
    fab.title = "Add Food";
  } else if (currentPage === "log" || currentPage === "history") {
    closeFabMenu();
    fab.style.display = "none";
  } else {
    fab.style.display = "flex";
    fab.title = currentPage === "today" ? "Daily Tracking" : "Add";
  }
}

function handleFab() {
  if (currentPage === "today") {
    toggleFabMenu();
  } else if (currentPage === "foods") {
    openFoodModal();
  }
}

function toggleFabMenu() {
  setFabMenuOpen(!isFabMenuOpen());
}

function closeFabMenu() {
  setFabMenuOpen(false);
}

function isFabMenuOpen() {
  const menu = document.getElementById("fab-menu");
  return !!menu && !menu.classList.contains("hidden");
}

function setFabMenuOpen(open) {
  const menu = document.getElementById("fab-menu");
  const backdrop = document.getElementById("fab-menu-backdrop");
  const fab = document.getElementById("fab-btn");
  if (!menu || !backdrop || !fab) {
    return;
  }

  menu.classList.toggle("hidden", !open);
  backdrop.classList.toggle("hidden", !open);
  menu.setAttribute("aria-hidden", String(!open));
  backdrop.setAttribute("aria-hidden", String(!open));
  fab.classList.toggle("open", open);
  fab.setAttribute("aria-expanded", String(open));
}

function openLogFromFab() {
  closeFabMenu();
  showPage("log");
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
  const totalCarb = logs.reduce((sum, log) => sum + (log.carb || 0), 0);
  const totalFat = logs.reduce((sum, log) => sum + (log.fat || 0), 0);
  const totalWater = todayWaterTotal();
  const totalSteps = todayStepsTotal();
  const goalCal = state.goals.cal;
  const goalPro = state.goals.pro;
  const goalCarb = state.goals.carb;
  const goalFat = state.goals.fat;
  const goalWater = state.goals.water;
  const goalSteps = state.goals.steps;

  document.getElementById("prog-cal-curr").textContent = Math.round(totalCal);
  document.getElementById("prog-cal-goal").textContent = goalCal;
  document.getElementById("prog-pro-curr").textContent = Math.round(totalPro);
  document.getElementById("prog-pro-goal").textContent = goalPro;
  document.getElementById("prog-carb-curr").textContent = Math.round(totalCarb);
  document.getElementById("prog-carb-goal").textContent = Math.round(goalCarb);
  document.getElementById("prog-fat-curr").textContent = Math.round(totalFat);
  document.getElementById("prog-fat-goal").textContent = Math.round(goalFat);
  document.getElementById("prog-water-curr").textContent = roundNutrient(totalWater);
  document.getElementById("prog-water-goal").textContent = roundNutrient(goalWater);
  document.getElementById("prog-steps-curr").textContent = Math.round(totalSteps);
  document.getElementById("prog-steps-goal").textContent = Math.round(goalSteps);

  const pCal = goalCal > 0 ? Math.min((totalCal / goalCal) * 100, 100) : 0;
  const pPro = goalPro > 0 ? Math.min((totalPro / goalPro) * 100, 100) : 0;
  const pCarb = goalCarb > 0 ? Math.min((totalCarb / goalCarb) * 100, 100) : 0;
  const pFat = goalFat > 0 ? Math.min((totalFat / goalFat) * 100, 100) : 0;
  const pWater = goalWater > 0 ? Math.min((totalWater / goalWater) * 100, 100) : 0;
  const pSteps = goalSteps > 0 ? Math.min((totalSteps / goalSteps) * 100, 100) : 0;
  document.getElementById("prog-cal-bar").style.width = `${pCal}%`;
  document.getElementById("prog-pro-bar").style.width = `${pPro}%`;
  document.getElementById("prog-carb-bar").style.width = `${pCarb}%`;
  document.getElementById("prog-fat-bar").style.width = `${pFat}%`;
  document.getElementById("prog-water-bar").style.width = `${pWater}%`;
  document.getElementById("prog-steps-bar").style.width = `${pSteps}%`;

  document.getElementById("cal-progress-wrap").classList.toggle("progress-over", totalCal > goalCal);
  document.getElementById("pro-progress-wrap").classList.toggle("progress-over", totalPro > goalPro);
  document.getElementById("carb-progress-wrap").classList.toggle("progress-over", totalCarb > goalCarb);
  document.getElementById("fat-progress-wrap").classList.toggle("progress-over", totalFat > goalFat);
  document.getElementById("water-progress-wrap").classList.toggle("progress-over", totalWater > goalWater);
  document.getElementById("steps-progress-wrap").classList.toggle("progress-over", totalSteps > goalSteps);
  document.getElementById("prog-cal-warning").classList.toggle("hidden", totalCal <= goalCal);
  document.getElementById("prog-pro-warning").classList.toggle("hidden", totalPro <= goalPro);
  document.getElementById("prog-carb-warning").classList.toggle("hidden", totalCarb <= goalCarb);
  document.getElementById("prog-fat-warning").classList.toggle("hidden", totalFat <= goalFat);
  document.getElementById("prog-water-success").classList.toggle("hidden", !(goalWater > 0 && totalWater >= goalWater));
  document.getElementById("prog-steps-success").classList.toggle("hidden", !(goalSteps > 0 && totalSteps >= goalSteps));

  const list = document.getElementById("today-meal-list");
  if (!logs.length) {
    list.innerHTML = "<div class=\"empty-state\"><div class=\"empty-icon\">Meal</div>No meals logged yet.<br>Tap + to add your first meal.</div>";
    return;
  }

  list.innerHTML = logs.slice().reverse().map((log) => `
    <div class="meal-item">
      <div>
        <div class="meal-name">${escHtml(log.name)}</div>
        <div class="meal-meta">${Math.round(log.cal)} kcal · ${roundNutrient(log.pro)}g protein · ${roundNutrient(log.carb || 0)}g carbs · ${roundNutrient(log.fat || 0)}g fat</div>
      </div>
      <div class="meal-right">
        <button class="meal-del" onclick="deleteLog('${log.id}')" title="Remove">x</button>
      </div>
    </div>
  `).join("");
}

function deleteLog(id) {
  state.logs = state.logs.filter((entry) => entry.id !== id);
  saveState();
  renderToday();
  renderHistory();
  showToast("Meal removed");
}

function addWater() {
  const defaultUnit = state.waterUnits[0];
  if (!defaultUnit) {
    showToast("Create a water unit first");
    return;
  }
  addWaterByUnit(defaultUnit.id);
}

function addWaterManual() {
  const amount = normalizePositiveNumber(document.getElementById("quick-water-manual-input").value, 0);
  if (amount <= 0) {
    showToast("Enter a valid water amount");
    return;
  }

  state.waterLogs.push({
    id: uid(),
    date: todayStr(),
    amount: roundNutrient(amount),
    unitId: "manual",
    unitName: "Manual"
  });
  saveState();
  renderToday();
  closeFabMenu();
  triggerWaterCelebration();
  showToast("Water added");
}

function addSteps() {
  const amount = Math.round(normalizePositiveNumber(document.getElementById("quick-steps-input").value, 0));
  if (amount <= 0) {
    showToast("Enter a valid step amount");
    return;
  }

  state.stepLogs.push({
    id: uid(),
    date: todayStr(),
    amount
  });
  saveState();
  renderToday();
  document.getElementById("quick-steps-input").value = "1000";
  closeFabMenu();
  triggerStepCelebration();
  showToast("Steps added");
}

function resetWaterToday() {
  state.waterLogs = state.waterLogs.filter((entry) => entry.date !== todayStr());
  saveState();
  renderToday();
  showToast("Water reset for today");
}

function resetStepsToday() {
  state.stepLogs = state.stepLogs.filter((entry) => entry.date !== todayStr());
  saveState();
  renderToday();
  showToast("Steps reset for today");
}

function saveWaterUnitVolume(id) {
  const volumeInput = document.getElementById(`water-unit-volume-${id}`);
  const unitInput = document.getElementById(`water-unit-unit-${id}`);
  const unit = state.waterUnits.find((entry) => entry.id === id);
  if (!volumeInput || !unitInput || !unit) {
    showToast("Water unit not found");
    return;
  }

  const volume = normalizePositiveNumber(volumeInput.value, 0);
  const volumeUnit = unitInput.value;
  if (volume <= 0) {
    showToast("Enter a valid water volume");
    return;
  }

  const ml = volumeUnit === "l" ? Math.round(volume * 1000) : Math.round(volume);
  const index = state.waterUnits.findIndex((entry) => entry.id === id);
  if (index >= 0) {
    state.waterUnits[index] = normalizeWaterUnit({ ...state.waterUnits[index], ml });
  }
  saveState();
  renderWaterUnits();
  showToast(`${unit.name} volume updated`);
}

function removeWaterUnit(id) {
  state.waterUnits = state.waterUnits.filter((unit) => unit.id !== id);
  if (!state.waterUnits.length) {
    state.waterUnits = defaultWaterUnits();
  }
  saveState();
  renderWaterUnits();
}

function renderWaterUnits() {
  const unitList = document.getElementById("water-unit-list");
  const actionList = document.getElementById("water-unit-actions");
  if (!unitList || !actionList) {
    return;
  }

  unitList.innerHTML = state.waterUnits.map((unit) => `
    <div class="water-unit-card">
      <div class="water-unit-card-title">${escHtml(unit.name)}</div>
      <div class="water-unit-volume-row">
        <input class="form-input" id="water-unit-volume-${unit.id}" type="number" min="0.1" step="0.1" value="${unit.ml >= 1000 && unit.ml % 1000 === 0 ? unit.ml / 1000 : unit.ml}">
        <select class="form-input water-unit-select" id="water-unit-unit-${unit.id}">
          <option value="ml" ${unit.ml >= 1000 && unit.ml % 1000 === 0 ? "" : "selected"}>ml</option>
          <option value="l" ${unit.ml >= 1000 && unit.ml % 1000 === 0 ? "selected" : ""}>L</option>
        </select>
      </div>
      <button class="btn btn-secondary quick-track-btn secondary-quiet water-unit-save-btn" onclick="saveWaterUnitVolume('${unit.id}')">Save</button>
    </div>
  `).join("");

  actionList.innerHTML = state.waterUnits.map((unit) => `
    <button class="btn btn-secondary quick-track-btn secondary-quiet water-action-btn" onclick="addWaterByUnit('${unit.id}')">
      <span class="water-action-icon">${unit.name === "Bottle" ? "<span class='bottle-icon'></span>" : "<span class='glass-icon'></span>"}</span>
      <span>Add ${escHtml(unit.name)}</span>
    </button>
  `).join("");
}

function formatWaterUnit(ml) {
  return ml >= 1000 ? `${roundNutrient(ml / 1000)} L` : `${Math.round(ml)} ml`;
}

function addWaterByUnit(id) {
  const unit = state.waterUnits.find((entry) => entry.id === id);
  if (!unit) {
    showToast("Water unit not found");
    return;
  }

  state.waterLogs.push({
    id: uid(),
    date: todayStr(),
    amount: roundNutrient(unit.ml / 1000),
    unitId: unit.id,
    unitName: unit.name
  });
  saveState();
  renderToday();
  closeFabMenu();
  triggerWaterCelebration();
  showToast(`${unit.name} added`);
}

function triggerWaterCelebration() {
  const cheer = document.getElementById("water-cheer");
  if (!cheer) {
    return;
  }
  cheer.classList.remove("hidden");
  void cheer.offsetWidth;
  cheer.classList.add("showing");
  window.clearTimeout(triggerWaterCelebration.timer);
  triggerWaterCelebration.timer = window.setTimeout(() => {
    cheer.classList.add("hidden");
    cheer.classList.remove("showing");
  }, 1100);
}

function triggerStepCelebration() {
  const cheer = document.getElementById("step-cheer");
  if (!cheer) {
    return;
  }
  cheer.classList.remove("hidden");
  void cheer.offsetWidth;
  cheer.classList.add("showing");
  window.clearTimeout(triggerStepCelebration.timer);
  triggerStepCelebration.timer = window.setTimeout(() => {
    cheer.classList.add("hidden");
    cheer.classList.remove("showing");
  }, 1100);
}

function triggerFoodCelebration() {
  const cheer = document.getElementById("food-cheer");
  if (!cheer) {
    return;
  }
  cheer.classList.remove("hidden");
  void cheer.offsetWidth;
  cheer.classList.add("showing");
  window.clearTimeout(triggerFoodCelebration.timer);
  triggerFoodCelebration.timer = window.setTimeout(() => {
    cheer.classList.add("hidden");
    cheer.classList.remove("showing");
  }, 1100);
}

function switchLogTab(tab) {
  document.querySelectorAll(".tab-pill").forEach((pill) => {
    pill.classList.toggle("active", pill.dataset.tab === tab);
  });
  document.querySelectorAll(".tab-content").forEach((content) => {
    content.classList.toggle("active", content.id === `tab-${tab}`);
  });
}

function renderFoodPicker() {
  const query = (document.getElementById("food-search")?.value || "").toLowerCase();
  const list = document.getElementById("food-picker-list");
  const foods = state.foods.filter((food) => !query || food.name.toLowerCase().includes(query));

  if (!foods.length) {
    list.innerHTML = "<div class=\"empty-state\" style=\"padding:16px 0\">No foods found.<br>Use AI Estimate or add foods manually first.</div>";
    return;
  }

  list.innerHTML = foods.map((food) => `
    <div class="food-option ${selectedFoodId === food.id ? "selected" : ""}" onclick="selectFood('${food.id}')">
      <div>
        <div class="food-option-name">${escHtml(food.name)}</div>
        <div class="food-option-meta">${Math.round(food.cal)} kcal · ${roundNutrient(food.pro)}g protein per ${escHtml(formatFoodBaseLabel(food))}</div>
      </div>
      <span class="food-option-badge">${escHtml(formatFoodBaseLabel(food))}</span>
    </div>
  `).join("");
}

function selectFood(id) {
  selectedFoodId = selectedFoodId === id ? null : id;
  renderFoodPicker();
  updateFoodLogInputMode();
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

  const config = getFoodLogConfig(food);
  const amountInput = document.getElementById("log-amount");
  const unitSelect = document.getElementById("log-unit");
  const amount = normalizePositiveNumber(amountInput?.value, 0);
  const selectedUnit = unitSelect?.value || config.selectedUnit;
  if (amount <= 0) {
    showToast(config.kind === "piece" ? "Enter quantity greater than 0" : "Enter amount greater than 0");
    return;
  }

  let ratio = 1;
  if (config.kind === "weight") {
    const inputGrams = convertToCanonicalFoodAmount(amount, selectedUnit, "weight");
    ratio = food.grams > 0 ? inputGrams / food.grams : 0;
  } else if (config.kind === "volume") {
    const baseCanonical = convertToCanonicalFoodAmount(food.baseQuantity, food.quantityUnit, "volume");
    const inputCanonical = convertToCanonicalFoodAmount(amount, selectedUnit, "volume");
    ratio = baseCanonical > 0 ? inputCanonical / baseCanonical : 0;
  } else {
    ratio = food.baseQuantity > 0 ? amount / food.baseQuantity : 0;
  }
  if (ratio <= 0) {
    showToast("Enter a valid amount");
    return;
  }

  state.logs.push({
    id: uid(),
    date: todayStr(),
    name: food.name,
    cal: roundNutrient(food.cal * ratio),
    pro: roundNutrient(food.pro * ratio),
    carb: roundNutrient((food.carb || 0) * ratio),
    fat: roundNutrient((food.fat || 0) * ratio)
  });

  saveState();
  selectedFoodId = null;
  document.getElementById("food-search").value = "";
  renderFoodPicker();
  updateFoodLogInputMode();
  renderToday();
  renderHistory();
  triggerFoodCelebration();
  showToast("Meal logged");
  setTimeout(() => showPage("today"), 400);
}

async function requestAiEstimate() {
  const query = document.getElementById("ai-food-input").value.trim();
  const statusNode = document.getElementById("ai-estimate-status");
  const button = document.getElementById("ai-estimate-btn");

  if (!query) {
    statusNode.textContent = "Enter a food description first.";
    return;
  }

  button.disabled = true;
  statusNode.textContent = "Estimating calories and protein...";

  try {
    const response = await fetch(AI_ESTIMATE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query })
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Estimate failed");
    }

    activeAiEstimate = {
      baseGrams: normalizePositiveNumber(payload.estimated_grams, 100),
      baseCalories: normalizePositiveNumber(payload.calories, 0),
      baseProtein: normalizePositiveNumber(payload.protein_g, 0),
      baseCarb: normalizePositiveNumber(payload.carb_g, 0),
      baseFat: normalizePositiveNumber(payload.fat_g, 0),
      baseQuantity: normalizePositiveNumber(payload.base_quantity, 0),
      quantityUnit: payload.quantity_unit || "",
      portionName: payload.portion_name || "",
      confidence: payload.confidence || "medium",
      note: payload.note || ""
    };

    document.getElementById("ai-name").value = payload.food_name || query;
    document.getElementById("ai-quantity").value = activeAiEstimate.baseQuantity > 0 ? roundNutrient(activeAiEstimate.baseQuantity) : "1";
    document.getElementById("ai-grams").value = Math.round(activeAiEstimate.baseGrams);
    document.getElementById("ai-calories").value = Math.round(activeAiEstimate.baseCalories);
    document.getElementById("ai-protein").value = roundNutrient(activeAiEstimate.baseProtein);
    document.getElementById("ai-carb").value = roundNutrient(activeAiEstimate.baseCarb);
    document.getElementById("ai-fat").value = roundNutrient(activeAiEstimate.baseFat);
    document.getElementById("ai-serving-label").value = activeAiEstimate.portionName || buildAiPortionName(activeAiEstimate.baseGrams, activeAiEstimate.baseQuantity, activeAiEstimate.quantityUnit);
    document.getElementById("ai-estimate-note").textContent = `AI estimate (${activeAiEstimate.confidence} confidence): ${payload.note}`;
    updateAiQuantityMode();
    document.getElementById("ai-estimate-editor").classList.remove("hidden");
    statusNode.textContent = "Estimate ready. Adjust any values before saving.";
  } catch (error) {
    console.error("AI estimate failed", error);
    statusNode.textContent = error.message || "Estimate failed";
  } finally {
    button.disabled = false;
  }
}

function updateAiQuantityMode() {
  const quantityGroup = document.getElementById("ai-quantity-group");
  const quantityLabel = document.getElementById("ai-quantity-label");
  if (activeAiEstimate && activeAiEstimate.baseQuantity > 0 && activeAiEstimate.quantityUnit) {
    quantityGroup.classList.remove("hidden");
    quantityLabel.textContent = `Quantity (${activeAiEstimate.quantityUnit})`;
  } else {
    quantityGroup.classList.add("hidden");
  }
}

function syncEstimateFromGrams() {
  if (!activeAiEstimate) {
    return;
  }

  const grams = normalizePositiveNumber(document.getElementById("ai-grams").value, activeAiEstimate.baseGrams);
  const ratio = activeAiEstimate.baseGrams > 0 ? grams / activeAiEstimate.baseGrams : 1;
  document.getElementById("ai-calories").value = Math.round(activeAiEstimate.baseCalories * ratio);
  document.getElementById("ai-protein").value = roundNutrient(activeAiEstimate.baseProtein * ratio);
  document.getElementById("ai-carb").value = roundNutrient(activeAiEstimate.baseCarb * ratio);
  document.getElementById("ai-fat").value = roundNutrient(activeAiEstimate.baseFat * ratio);
  if (activeAiEstimate.baseQuantity > 0 && activeAiEstimate.quantityUnit) {
    const quantity = roundNutrient(activeAiEstimate.baseQuantity * ratio);
    document.getElementById("ai-quantity").value = quantity;
    document.getElementById("ai-serving-label").value = buildAiPortionName(grams, quantity, activeAiEstimate.quantityUnit);
  } else {
    document.getElementById("ai-serving-label").value = buildAiPortionName(grams, 0, "");
  }
}

function syncEstimateFromQuantity() {
  if (!activeAiEstimate || !(activeAiEstimate.baseQuantity > 0)) {
    return;
  }

  const quantity = normalizePositiveNumber(document.getElementById("ai-quantity").value, activeAiEstimate.baseQuantity);
  const ratio = activeAiEstimate.baseQuantity > 0 ? quantity / activeAiEstimate.baseQuantity : 1;
  const grams = Math.round(activeAiEstimate.baseGrams * ratio);
  document.getElementById("ai-grams").value = grams;
  document.getElementById("ai-calories").value = Math.round(activeAiEstimate.baseCalories * ratio);
  document.getElementById("ai-protein").value = roundNutrient(activeAiEstimate.baseProtein * ratio);
  document.getElementById("ai-carb").value = roundNutrient(activeAiEstimate.baseCarb * ratio);
  document.getElementById("ai-fat").value = roundNutrient(activeAiEstimate.baseFat * ratio);
  if (activeAiEstimate.quantityUnit) {
    document.getElementById("ai-serving-label").value = buildAiPortionName(grams, quantity, activeAiEstimate.quantityUnit);
  }
}

function buildAiPortionName(grams, baseQuantity, quantityUnit) {
  if (baseQuantity > 0 && quantityUnit) {
    return `${roundNutrient(baseQuantity)} ${quantityUnit}`;
  }
  return `${Math.round(grams)} g`;
}

function readAiEditorValues() {
  const name = document.getElementById("ai-name").value.trim();
  const grams = normalizePositiveNumber(document.getElementById("ai-grams").value, 0);
  const calories = normalizePositiveNumber(document.getElementById("ai-calories").value, 0);
  const protein = normalizePositiveNumber(document.getElementById("ai-protein").value, 0);
  const carb = normalizePositiveNumber(document.getElementById("ai-carb").value, 0);
  const fat = normalizePositiveNumber(document.getElementById("ai-fat").value, 0);
  const serving = document.getElementById("ai-serving-label").value.trim() || `${Math.round(grams)} g portion`;

  return { name, grams, calories, protein, carb, fat, serving };
}

function validateAiEditorValues(values) {
  if (!values.name) {
    showToast("Enter a food name");
    return false;
  }
  if (values.grams <= 0) {
    showToast("Grams must be greater than 0");
    return false;
  }
  if (values.calories < 0 || values.protein < 0 || values.carb < 0 || values.fat < 0) {
    showToast("Nutrition values must be valid numbers");
    return false;
  }
  return true;
}

function resetAiEstimateForm() {
  activeAiEstimate = null;
  document.getElementById("ai-food-input").value = "";
  document.getElementById("ai-name").value = "";
  document.getElementById("ai-quantity").value = "";
  document.getElementById("ai-grams").value = "";
  document.getElementById("ai-calories").value = "";
  document.getElementById("ai-protein").value = "";
  document.getElementById("ai-carb").value = "";
  document.getElementById("ai-fat").value = "";
  document.getElementById("ai-serving-label").value = "";
  document.getElementById("ai-estimate-note").textContent = "";
  document.getElementById("ai-estimate-status").textContent = "";
  document.getElementById("ai-estimate-editor").classList.add("hidden");
  updateAiQuantityMode();
}

function logAiEstimate() {
  const values = readAiEditorValues();
  if (!validateAiEditorValues(values)) {
    return;
  }

  state.logs.push({
    id: uid(),
    date: todayStr(),
    name: values.name,
    cal: roundNutrient(values.calories),
    pro: roundNutrient(values.protein),
    carb: roundNutrient(values.carb),
    fat: roundNutrient(values.fat)
  });

  saveState();
  resetAiEstimateForm();
  renderToday();
  renderHistory();
  triggerFoodCelebration();
  showToast("AI estimate logged");
  setTimeout(() => showPage("today"), 400);
}

function saveAiEstimateToFoods() {
  const values = readAiEditorValues();
  if (!validateAiEditorValues(values)) {
    return;
  }

  state.foods.push(normalizeFoodRecord({
    id: uid(),
    name: values.name,
    grams: values.grams,
    baseQuantity: activeAiEstimate?.baseQuantity || inferQuantityFromServing(values.serving).baseQuantity || 0,
    quantityUnit: activeAiEstimate?.quantityUnit || inferQuantityFromServing(values.serving).quantityUnit || "",
    cal: roundNutrient(values.calories),
    pro: roundNutrient(values.protein),
    carb: roundNutrient(values.carb),
    fat: roundNutrient(values.fat),
    serving: values.serving
  }));

  saveState();
  renderFoodsDB();
  renderFoodPicker();
  showToast("Food saved from AI estimate");
}

function logCustom() {
  const name = document.getElementById("custom-name").value.trim();
  const quantity = normalizePositiveNumber(document.getElementById("custom-quantity").value, 0);
  const portionName = document.getElementById("custom-portion-name").value.trim();
  const cal = normalizePositiveNumber(document.getElementById("custom-cal").value, 0);
  const pro = normalizePositiveNumber(document.getElementById("custom-pro").value, 0);
  const carb = normalizePositiveNumber(document.getElementById("custom-carb").value, 0);
  const fat = normalizePositiveNumber(document.getElementById("custom-fat").value, 0);

  if (!name) {
    showToast("Please enter a meal name");
    return;
  }

  const displayName = quantity > 0 && portionName
    ? `${name} (${roundNutrient(quantity)} ${portionName})`
    : portionName
      ? `${name} (${portionName})`
      : quantity > 0
        ? `${name} (${roundNutrient(quantity)})`
        : name;

  state.logs.push({ id: uid(), date: todayStr(), name: displayName, cal, pro, carb, fat });
  saveState();
  document.getElementById("custom-name").value = "";
  document.getElementById("custom-quantity").value = "";
  document.getElementById("custom-portion-name").value = "";
  document.getElementById("custom-cal").value = "";
  document.getElementById("custom-pro").value = "";
  document.getElementById("custom-carb").value = "";
  document.getElementById("custom-fat").value = "";
  renderToday();
  renderHistory();
  triggerFoodCelebration();
  showToast("Meal logged");
  setTimeout(() => showPage("today"), 400);
}

function renderFoodsDB() {
  const list = document.getElementById("foods-list");
  if (!state.foods.length) {
    list.innerHTML = "<div class=\"empty-state\"><div class=\"empty-icon\">Food</div>No foods yet.<br>Use AI Estimate or tap + to add one manually.</div>";
    return;
  }

  list.innerHTML = state.foods.map((food) => `
    <div class="food-row">
      <div class="food-row-info">
        <div class="food-row-name">${escHtml(food.name)}</div>
        <div class="food-row-meta">${Math.round(food.cal)} kcal · ${roundNutrient(food.pro)}g protein · ${roundNutrient(food.carb || 0)}g carbs · ${roundNutrient(food.fat || 0)}g fat per ${escHtml(formatFoodBaseLabel(food))}</div>
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
    document.getElementById("food-grams-input").value = food.grams;
    document.getElementById("food-cal-input").value = food.cal;
    document.getElementById("food-pro-input").value = food.pro;
    document.getElementById("food-carb-input").value = food.carb || 0;
    document.getElementById("food-fat-input").value = food.fat || 0;
    document.getElementById("food-serving-input").value = food.serving || "";
    deleteButton.style.display = "block";
  } else {
    document.getElementById("food-modal-title").textContent = "Add Food";
    document.getElementById("food-name-input").value = "";
    document.getElementById("food-grams-input").value = "100";
    document.getElementById("food-cal-input").value = "";
    document.getElementById("food-pro-input").value = "";
    document.getElementById("food-carb-input").value = "";
    document.getElementById("food-fat-input").value = "";
    document.getElementById("food-serving-input").value = "";
    deleteButton.style.display = "none";
  }

  modal.classList.add("open");
}

function saveFood() {
  const name = document.getElementById("food-name-input").value.trim();
  const grams = Math.max(1, normalizePositiveNumber(document.getElementById("food-grams-input").value, 100) || 100);
  const cal = normalizePositiveNumber(document.getElementById("food-cal-input").value, 0);
  const pro = normalizePositiveNumber(document.getElementById("food-pro-input").value, 0);
  const carb = normalizePositiveNumber(document.getElementById("food-carb-input").value, 0);
  const fat = normalizePositiveNumber(document.getElementById("food-fat-input").value, 0);
  const serving = document.getElementById("food-serving-input").value.trim() || `${Math.round(grams)} g`;

  if (!name) {
    showToast("Please enter a food name");
    return;
  }

  const editId = document.getElementById("food-edit-id").value;
  if (editId) {
    const index = state.foods.findIndex((food) => food.id === editId);
    if (index >= 0) {
      state.foods[index] = normalizeFoodRecord({ ...state.foods[index], name, grams, cal, pro, carb, fat, serving });
    }
  } else {
    state.foods.push(normalizeFoodRecord({ id: uid(), name, grams, cal, pro, carb, fat, serving }));
  }

  saveState();
  closeModal("food");
  renderFoodsDB();
  renderFoodPicker();
  updateFoodLogInputMode();
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
  updateFoodLogInputMode();
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
            <div class="history-stat"><div class="hval">${roundNutrient(totalPro)}g</div><div class="hunit">protein</div></div>
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
  document.getElementById("goal-carb-input").value = state.goals.carb;
  document.getElementById("goal-fat-input").value = state.goals.fat;
  document.getElementById("goal-water-input").value = state.goals.water;
  document.getElementById("goal-steps-input").value = state.goals.steps;
  document.getElementById("goal-suggest-status").textContent = "";
  document.getElementById("overlay-goals").classList.add("open");
}

function saveGoals() {
  state.goals.cal = normalizePositiveNumber(document.getElementById("goal-cal-input").value, 2000) || 2000;
  state.goals.pro = normalizePositiveNumber(document.getElementById("goal-pro-input").value, 150) || 150;
  state.goals.carb = normalizePositiveNumber(document.getElementById("goal-carb-input").value, 220) || 220;
  state.goals.fat = normalizePositiveNumber(document.getElementById("goal-fat-input").value, 65) || 65;
  state.goals.water = normalizePositiveNumber(document.getElementById("goal-water-input").value, 2.5) || 2.5;
  state.goals.steps = normalizePositiveNumber(document.getElementById("goal-steps-input").value, 8000) || 8000;
  saveState();
  closeModal("goals");
  renderToday();
  renderHistory();
  showToast("Goals updated");
}

function toggleHeightInputs() {
  const isImperial = document.getElementById("goal-height-unit").value === "ft";
  document.getElementById("goal-height-input").parentElement.classList.toggle("hidden", isImperial);
  document.getElementById("goal-height-imperial-row").classList.toggle("hidden", !isImperial);
}

function heightToCm() {
  const unit = document.getElementById("goal-height-unit").value;
  if (unit === "ft") {
    const feet = normalizePositiveNumber(document.getElementById("goal-height-ft-input").value, 0);
    const inches = normalizePositiveNumber(document.getElementById("goal-height-in-input").value, 0);
    return ((feet * 12) + inches) * 2.54;
  }
  return normalizePositiveNumber(document.getElementById("goal-height-input").value, 0);
}

function weightToKg() {
  const unit = document.getElementById("goal-weight-unit").value;
  const value = normalizePositiveNumber(document.getElementById("goal-weight-input").value, 0);
  return unit === "lb" ? value * 0.45359237 : value;
}

function suggestGoals() {
  const gender = document.getElementById("goal-gender-input").value;
  const age = normalizePositiveNumber(document.getElementById("goal-age-input").value, 0);
  const heightCm = heightToCm();
  const weightKg = weightToKg();
  const fitnessGoal = document.getElementById("goal-main-goal-input").value;
  const activity = document.getElementById("goal-activity-input").value;
  const status = document.getElementById("goal-suggest-status");

  if (age < 13 || heightCm <= 0 || weightKg <= 0) {
    status.textContent = "Enter valid age, height, and weight first.";
    return;
  }

  const recommendation = calculateGoalRecommendation({
    gender,
    age,
    heightCm,
    weightKg,
    fitnessGoal,
    activity
  });

  document.getElementById("goal-cal-input").value = recommendation.cal;
  document.getElementById("goal-pro-input").value = recommendation.pro;
  document.getElementById("goal-carb-input").value = recommendation.carb;
  document.getElementById("goal-fat-input").value = recommendation.fat;
  document.getElementById("goal-water-input").value = recommendation.water;
  document.getElementById("goal-steps-input").value = recommendation.steps;
  status.textContent = recommendation.note;
}

function calculateGoalRecommendation({ gender, age, heightCm, weightKg, fitnessGoal, activity }) {
  const activityMultiplier = {
    sedentary: 1.2,
    light: 1.375,
    moderate: 1.55,
    very: 1.725
  }[activity] || 1.55;

  const baseBmr = gender === "female"
    ? (10 * weightKg) + (6.25 * heightCm) - (5 * age) - 161
    : (10 * weightKg) + (6.25 * heightCm) - (5 * age) + 5;

  const tdee = baseBmr * activityMultiplier;
  const calorieAdjustment = {
    lose: -450,
    maintain: 0,
    build: 250,
    health: -150
  }[fitnessGoal] ?? 0;
  const calorieGoal = Math.max(1200, Math.round(tdee + calorieAdjustment));

  const proteinPerKg = {
    lose: 2,
    maintain: 1.6,
    build: 2,
    health: 1.4
  }[fitnessGoal] || 1.6;
  const fatPerKg = {
    lose: 0.8,
    maintain: 0.9,
    build: 1,
    health: 0.9
  }[fitnessGoal] || 0.9;

  const pro = Math.round(weightKg * proteinPerKg);
  const fat = Math.round(weightKg * fatPerKg);
  const remainingCalories = calorieGoal - (pro * 4) - (fat * 9);
  const carb = Math.max(130, Math.round(remainingCalories / 4));
  const waterBase = weightKg * (activity === "very" ? 0.04 : activity === "moderate" ? 0.037 : 0.035);
  const water = roundNutrient(waterBase);

  const activitySteps = {
    sedentary: 6500,
    light: 8000,
    moderate: 10000,
    very: 12000
  }[activity] || 8000;
  const steps = Math.round((activitySteps + (fitnessGoal === "lose" ? 1500 : fitnessGoal === "build" ? -500 : 0)) / 500) * 500;

  return {
    cal: calorieGoal,
    pro,
    carb,
    fat,
    water,
    steps: Math.max(4000, steps),
    note: `Suggested from your profile using estimated maintenance calories and macro targets for ${fitnessGoal === "lose" ? "fat loss" : fitnessGoal === "build" ? "muscle gain" : fitnessGoal === "health" ? "general health" : "maintenance"}.`
  };
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

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeFabMenu();
    document.querySelectorAll(".overlay.open").forEach((overlay) => overlay.classList.remove("open"));
  }
});

document.addEventListener("DOMContentLoaded", () => {
  loadState();
  renderToday();
  renderWaterUnits();
  renderFoodsDB();
  renderFoodPicker();
  updateFoodLogInputMode();
  renderHistory();
  updateFab();
  registerServiceWorker();

  document.getElementById("ai-food-input")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      requestAiEstimate();
    }
  });

  document.getElementById("ai-grams")?.addEventListener("input", syncEstimateFromGrams);
  document.getElementById("ai-quantity")?.addEventListener("input", syncEstimateFromQuantity);
  document.getElementById("goal-height-unit")?.addEventListener("change", toggleHeightInputs);
  toggleHeightInputs();
});

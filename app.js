const DEFAULT_GOALS = { cal: 2000, pro: 150, carb: 220, fat: 65, water: 2.5, steps: 8000 };
const SUPABASE_URL = "https://fqylcprwmpgqenhlvfdj.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_vst5ttBTskmLEFK-iKar5A_8qttx1eO";
const STORAGE_KEY = "nutrilog_v3";
const LEGACY_STORAGE_KEY = "nutrilog_v1";
const AI_ESTIMATE_ENDPOINT = "/api/estimate-food";
const OUNCES_TO_GRAMS = 28.3495;
const CUP_TO_ML = 240;

let state = createInitialState();
let currentPage = "today";
let selectedFoodId = null;
let toastTimer;
let activeAiEstimate = null;
let supabaseClient = null;
let currentUser = null;
let hasLoadedUserState = false;
let cloudSyncTimer = null;
let isApplyingRemoteState = false;

function createInitialState() {
  return {
    foods: [],
    logs: [],
    waterLogs: [],
    stepLogs: [],
    waterUnits: defaultWaterUnits(),
    goals: { ...DEFAULT_GOALS }
  };
}

function saveState() {
  saveLocalState();
  if (currentUser && !isApplyingRemoteState) {
    scheduleCloudSync();
  }
}

function saveLocalState() {
  try {
    localStorage.setItem(getStorageKey(currentUser?.id), JSON.stringify(state));
  } catch (error) {
    console.error("Failed to save state", error);
  }
}

function loadState(userId = null) {
  try {
    const raw = readCachedState(userId);
    state = raw ? normalizeAppState(JSON.parse(raw)) : createInitialState();
  } catch (error) {
    console.error("Failed to load state", error);
    state = createInitialState();
  }
}

function readCachedState(userId = null) {
  return localStorage.getItem(getStorageKey(userId))
    || (userId ? localStorage.getItem(STORAGE_KEY) : null)
    || localStorage.getItem(LEGACY_STORAGE_KEY);
}

function getStorageKey(userId = null) {
  return userId ? `${STORAGE_KEY}:${userId}` : STORAGE_KEY;
}

function normalizeAppState(rawState) {
  const nextState = { ...createInitialState(), ...(rawState || {}) };
  nextState.waterLogs = Array.isArray(nextState.waterLogs) ? nextState.waterLogs : [];
  nextState.stepLogs = Array.isArray(nextState.stepLogs) ? nextState.stepLogs : [];
  nextState.logs = Array.isArray(nextState.logs) ? nextState.logs : [];
  nextState.waterUnits = defaultWaterUnits(nextState.waterUnits);
  nextState.foods = Array.isArray(nextState.foods) ? nextState.foods.map(normalizeFoodRecord) : [];
  nextState.goals = { ...DEFAULT_GOALS, ...(nextState.goals || {}) };
  return nextState;
}

function hasMeaningfulData(candidateState) {
  if (!candidateState) {
    return false;
  }
  return Boolean(
    candidateState.foods?.length
    || candidateState.logs?.length
    || candidateState.waterLogs?.length
    || candidateState.stepLogs?.length
  );
}

function renderApp() {
  updateLogTabs();
  renderToday();
  renderWaterUnits();
  renderFoodsDB();
  renderFoodPicker();
  updateFoodLogInputMode();
  renderHistory();
  updateFab();
}

function scheduleCloudSync() {
  clearTimeout(cloudSyncTimer);
  cloudSyncTimer = setTimeout(() => {
    syncStateToCloud().catch((error) => {
      console.error("Cloud sync failed", error);
      showToast("Cloud sync failed");
    });
  }, 300);
}

async function syncStateToCloud() {
  if (!supabaseClient || !currentUser) {
    return;
  }

  const userId = currentUser.id;
  const goalsRow = {
    user_id: userId,
    cal: Math.round(state.goals.cal || DEFAULT_GOALS.cal),
    pro: roundNutrient(state.goals.pro || DEFAULT_GOALS.pro),
    carb: roundNutrient(state.goals.carb || DEFAULT_GOALS.carb),
    fat: roundNutrient(state.goals.fat || DEFAULT_GOALS.fat),
    water: roundNutrient(state.goals.water || DEFAULT_GOALS.water),
    steps: Math.round(state.goals.steps || DEFAULT_GOALS.steps),
    updated_at: new Date().toISOString()
  };

  const goalsResult = await supabaseClient.from("goals").upsert(goalsRow, { onConflict: "user_id" });
  if (goalsResult.error) {
    throw goalsResult.error;
  }

  await Promise.all([
    replaceUserRows("foods", state.foods.map((food) => ({
      id: food.id,
      user_id: userId,
      name: food.name,
      grams: roundNutrient(food.grams),
      base_quantity: roundNutrient(food.baseQuantity || 0),
      quantity_unit: food.quantityUnit || "",
      cal: roundNutrient(food.cal),
      pro: roundNutrient(food.pro),
      carb: roundNutrient(food.carb || 0),
      fat: roundNutrient(food.fat || 0),
      serving: food.serving || "",
      created_at: food.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString()
    }))),
    replaceUserRows("meal_logs", state.logs.map((log) => ({
      id: log.id,
      user_id: userId,
      logged_on: log.date,
      name: log.name,
      cal: roundNutrient(log.cal),
      pro: roundNutrient(log.pro),
      carb: roundNutrient(log.carb || 0),
      fat: roundNutrient(log.fat || 0),
      created_at: log.created_at || new Date().toISOString()
    }))),
    replaceUserRows("water_logs", state.waterLogs.map((entry) => ({
      id: entry.id,
      user_id: userId,
      logged_on: entry.date,
      amount: roundNutrient(entry.amount),
      created_at: entry.created_at || new Date().toISOString()
    }))),
    replaceUserRows("step_logs", state.stepLogs.map((entry) => ({
      id: entry.id,
      user_id: userId,
      logged_on: entry.date,
      amount: Math.round(entry.amount),
      created_at: entry.created_at || new Date().toISOString()
    }))),
    replaceUserRows("water_units", state.waterUnits.map((unit) => ({
      id: unit.id,
      user_id: userId,
      name: unit.name,
      ml: Math.round(unit.ml),
      created_at: unit.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString()
    })))
  ]);
}

async function replaceUserRows(table, rows) {
  if (!supabaseClient || !currentUser) {
    return;
  }
  const userId = currentUser.id;
  const deleteResult = await supabaseClient.from(table).delete().eq("user_id", userId);
  if (deleteResult.error) {
    throw deleteResult.error;
  }
  if (!rows.length) {
    return;
  }
  const insertResult = await supabaseClient.from(table).insert(rows);
  if (insertResult.error) {
    throw insertResult.error;
  }
}

async function loadUserState(userId) {
  isApplyingRemoteState = true;
  try {
    const [goalsResult, foodsResult, logsResult, waterLogsResult, stepLogsResult, waterUnitsResult] = await Promise.all([
      supabaseClient.from("goals").select("*").eq("user_id", userId).maybeSingle(),
      supabaseClient.from("foods").select("*").eq("user_id", userId).order("created_at", { ascending: true }),
      supabaseClient.from("meal_logs").select("*").eq("user_id", userId).order("created_at", { ascending: true }),
      supabaseClient.from("water_logs").select("*").eq("user_id", userId).order("created_at", { ascending: true }),
      supabaseClient.from("step_logs").select("*").eq("user_id", userId).order("created_at", { ascending: true }),
      supabaseClient.from("water_units").select("*").eq("user_id", userId).order("created_at", { ascending: true })
    ]);

    const errors = [goalsResult.error, foodsResult.error, logsResult.error, waterLogsResult.error, stepLogsResult.error, waterUnitsResult.error].filter(Boolean);
    if (errors.length) {
      throw errors[0];
    }

    const remoteState = normalizeAppState({
      goals: goalsResult.data ? {
        cal: goalsResult.data.cal,
        pro: goalsResult.data.pro,
        carb: goalsResult.data.carb,
        fat: goalsResult.data.fat,
        water: goalsResult.data.water,
        steps: goalsResult.data.steps
      } : undefined,
      foods: (foodsResult.data || []).map((row) => ({
        id: row.id,
        name: row.name,
        grams: row.grams,
        baseQuantity: row.base_quantity,
        quantityUnit: row.quantity_unit,
        cal: row.cal,
        pro: row.pro,
        carb: row.carb,
        fat: row.fat,
        serving: row.serving || "",
        created_at: row.created_at,
        updated_at: row.updated_at
      })),
      logs: (logsResult.data || []).map((row) => ({
        id: row.id,
        date: row.logged_on,
        name: row.name,
        cal: row.cal,
        pro: row.pro,
        carb: row.carb,
        fat: row.fat,
        created_at: row.created_at
      })),
      waterLogs: (waterLogsResult.data || []).map((row) => ({
        id: row.id,
        date: row.logged_on,
        amount: row.amount,
        created_at: row.created_at
      })),
      stepLogs: (stepLogsResult.data || []).map((row) => ({
        id: row.id,
        date: row.logged_on,
        amount: row.amount,
        created_at: row.created_at
      })),
      waterUnits: (waterUnitsResult.data || []).map((row) => ({
        id: row.id,
        name: row.name,
        ml: row.ml,
        created_at: row.created_at,
        updated_at: row.updated_at
      }))
    });

    const remoteHasData = Boolean(
      goalsResult.data
      || foodsResult.data?.length
      || logsResult.data?.length
      || waterLogsResult.data?.length
      || stepLogsResult.data?.length
      || waterUnitsResult.data?.length
    );

    loadState(userId);
    const localState = state;
    if (!remoteHasData && hasMeaningfulData(localState)) {
      state = localState;
      renderApp();
      saveLocalState();
      setTimeout(() => {
        syncStateToCloud().catch((error) => {
          console.error("Initial import failed", error);
          showToast("Initial cloud import failed");
        });
      }, 0);
      showToast("Imported this device data to your account");
      return;
    }

    state = remoteState;
    saveLocalState();
    renderApp();
  } finally {
    isApplyingRemoteState = false;
  }
}

function updateAuthUi() {
  const authScreen = document.getElementById("auth-screen");
  const accountButton = document.getElementById("account-btn");
  const accountEmail = document.getElementById("account-email-display");
  if (!authScreen || !accountButton || !accountEmail) {
    return;
  }

  const signedIn = !!currentUser;
  authScreen.classList.toggle("hidden", signedIn);
  accountButton.classList.toggle("hidden", !signedIn);
  accountButton.textContent = signedIn ? (currentUser.email || "Account") : "Account";
  accountEmail.textContent = signedIn ? (currentUser.email || "") : "";
}

async function applySession(session) {
  const nextUser = session?.user || null;
  if (nextUser && currentUser?.id === nextUser.id && hasLoadedUserState) {
    updateAuthUi();
    return;
  }

  currentUser = nextUser;
  updateAuthUi();

  if (!currentUser) {
    hasLoadedUserState = false;
    clearTimeout(cloudSyncTimer);
    state = createInitialState();
    renderApp();
    return;
  }

  hasLoadedUserState = true;
  document.getElementById("auth-status").textContent = "Loading your data...";
  await loadUserState(currentUser.id);
  document.getElementById("auth-status").textContent = "";
}

async function initializeSupabase() {
  if (!window.supabase?.createClient) {
    console.error("Supabase client failed to load");
    return;
  }

  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true
    }
  });

  const sessionResult = await supabaseClient.auth.getSession();
  if (sessionResult.error) {
    console.error("Failed to get session", sessionResult.error);
  }
  await applySession(sessionResult.data.session);

  supabaseClient.auth.onAuthStateChange((_event, session) => {
    Promise.resolve(applySession(session)).catch((error) => {
      console.error("Failed to apply auth session", error);
      document.getElementById("auth-status").textContent = error.message || "Auth session failed";
    });
  });
}

async function submitAuth(mode) {
  const email = document.getElementById("auth-email").value.trim();
  const password = document.getElementById("auth-password").value;
  const status = document.getElementById("auth-status");

  if (!supabaseClient) {
    status.textContent = "Supabase is not ready yet.";
    return;
  }
  if (!email || !password) {
    status.textContent = "Enter both email and password.";
    return;
  }

  status.textContent = mode === "signup" ? "Creating account..." : "Signing in...";
  try {
    const result = mode === "signup"
      ? await supabaseClient.auth.signUp({ email, password })
      : await supabaseClient.auth.signInWithPassword({ email, password });

    if (result.error) {
      throw result.error;
    }

    if (mode === "signup" && !result.data.session) {
      status.textContent = "Account created. Check your email to confirm, then sign in.";
      return;
    }

    status.textContent = "";
  } catch (error) {
    console.error("Auth request failed", error);
    status.textContent = error.message || "Authentication failed.";
  }
}

function openAccountModal() {
  document.getElementById("overlay-account").classList.add("open");
}

async function logout() {
  if (!supabaseClient) {
    return;
  }
  const result = await supabaseClient.auth.signOut();
  if (result.error) {
    showToast(result.error.message || "Logout failed");
    return;
  }
  closeModal("account");
  document.getElementById("auth-email").value = "";
  document.getElementById("auth-password").value = "";
  document.getElementById("auth-status").textContent = "";
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
  const amountGroup = document.getElementById("log-amount-group");
  const amountLabel = document.getElementById("log-amount-label");
  const amountInput = document.getElementById("log-amount");
  const unitSelect = document.getElementById("log-unit");
  const food = state.foods.find((entry) => entry.id === selectedFoodId);
  const config = getFoodLogConfig(food);
  if (!amountGroup || !amountLabel || !amountInput || !unitSelect) {
    return;
  }
  amountGroup.classList.toggle("hidden", !food);
  if (!food) {
    unitSelect.innerHTML = "";
    return;
  }

  amountLabel.textContent = config.helper;
  amountInput.min = config.min;
  amountInput.step = config.step;
  amountInput.value = String(config.amount);
  amountInput.placeholder = String(config.amount);
  unitSelect.innerHTML = config.options.map((option) => `
    <option value="${escHtml(option.value)}" ${option.value === config.selectedUnit ? "selected" : ""}>${escHtml(option.label)}</option>
  `).join("");
  unitSelect.disabled = config.options.length === 1;
  unitSelect.dataset.prevUnit = config.selectedUnit;
}

function handleLogUnitChange() {
  const amountInput = document.getElementById("log-amount");
  const unitSelect = document.getElementById("log-unit");
  const amountLabel = document.getElementById("log-amount-label");
  const food = state.foods.find((entry) => entry.id === selectedFoodId);
  if (!amountInput || !unitSelect || !food || !amountLabel) {
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

  if (config.kind === "weight") {
    amountLabel.textContent = nextUnit === "oz" ? "Enter how many ounces you had" : "Enter how many grams you had";
  } else if (config.kind === "volume") {
    amountLabel.textContent = nextUnit === "cup" ? "Enter the amount in cups" : nextUnit === "l" ? "Enter the amount in L" : "Enter the amount in ml";
  }
}

function roundNutrient(value) {
  return Math.round(Number(value) * 10) / 10;
}

function normalizePositiveNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function isCountBasedFoodUnit(unit) {
  const normalized = normalizeFoodUnit(unit);
  return !!normalized && !["g", "kg", "oz", "lb", "ml", "l", "cup"].includes(normalized);
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
    updateLogTabs();
    renderFoodPicker();
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
  if (currentPage === "log" || currentPage === "history") {
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
  if (tab === "from-foods" && !state.foods.length) {
    tab = "ai-estimate";
  }
  document.querySelectorAll(".tab-pill").forEach((pill) => {
    pill.classList.toggle("active", pill.dataset.tab === tab);
  });
  document.querySelectorAll(".tab-content").forEach((content) => {
    content.classList.toggle("active", content.id === `tab-${tab}`);
  });
}

function updateLogTabs() {
  const hasFoods = state.foods.length > 0;
  const myFoodsTab = document.getElementById("log-tab-my-foods");
  const myFoodsContent = document.getElementById("tab-from-foods");
  if (!myFoodsTab || !myFoodsContent) {
    return;
  }

  myFoodsTab.classList.toggle("hidden", !hasFoods);
  myFoodsContent.classList.toggle("hidden", !hasFoods);

  const activeTab = document.querySelector(".tab-pill.active")?.dataset.tab;
  if (!hasFoods && activeTab === "from-foods") {
    switchLogTab("ai-estimate");
  }
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
      <div class="food-option-main">
        <div class="food-option-name">${escHtml(food.name)}</div>
        <div class="food-option-meta">${Math.round(food.cal)} kcal · ${roundNutrient(food.pro)}g protein per ${escHtml(formatFoodBaseLabel(food))}</div>
      </div>
      <div class="food-option-side">
        <span class="food-option-badge">${escHtml(formatFoodBaseLabel(food))}</span>
        <div class="food-option-actions">
          <button class="icon-btn food-option-icon" onclick="event.stopPropagation(); openFoodModal('${food.id}')" title="Edit" aria-label="Edit ${escHtml(food.name)}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 20h9"/>
              <path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5Z"/>
            </svg>
          </button>
          <button class="icon-btn danger food-option-icon" onclick="event.stopPropagation(); deleteFoodById('${food.id}')" title="Delete" aria-label="Delete ${escHtml(food.name)}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 6h18"/>
              <path d="M8 6V4h8v2"/>
              <path d="M19 6l-1 14H6L5 6"/>
              <path d="M10 11v6"/>
              <path d="M14 11v6"/>
            </svg>
          </button>
        </div>
      </div>
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

    const normalizedBaseQuantity = normalizePositiveNumber(payload.base_quantity, 0);
    const normalizedQuantityUnit = payload.quantity_unit || "";
    const resolvedTotalGrams = resolveAiEstimatedTotalGrams({
      estimatedGrams: normalizePositiveNumber(payload.estimated_grams, 100),
      baseQuantity: normalizedBaseQuantity,
      quantityUnit: normalizedQuantityUnit,
      calories: normalizePositiveNumber(payload.calories, 0),
      protein: normalizePositiveNumber(payload.protein_g, 0),
      carbs: normalizePositiveNumber(payload.carb_g, 0),
      fat: normalizePositiveNumber(payload.fat_g, 0),
      note: payload.note || ""
    });

    activeAiEstimate = {
      baseGrams: resolvedTotalGrams,
      baseCalories: normalizePositiveNumber(payload.calories, 0),
      baseProtein: normalizePositiveNumber(payload.protein_g, 0),
      baseCarb: normalizePositiveNumber(payload.carb_g, 0),
      baseFat: normalizePositiveNumber(payload.fat_g, 0),
      baseQuantity: normalizedBaseQuantity,
      quantityUnit: normalizedQuantityUnit,
      portionName: payload.portion_name || "",
      confidence: payload.confidence || "medium",
      note: payload.note || ""
    };

    document.getElementById("ai-name").value = payload.food_name || query;
    document.getElementById("ai-quantity").value = roundNutrient(getAiVisibleQuantity());
    document.getElementById("ai-grams").value = Math.round(activeAiEstimate.baseGrams);
    document.getElementById("ai-calories").value = Math.round(activeAiEstimate.baseCalories);
    document.getElementById("ai-protein").value = roundNutrient(activeAiEstimate.baseProtein);
    document.getElementById("ai-carb").value = roundNutrient(activeAiEstimate.baseCarb);
    document.getElementById("ai-fat").value = roundNutrient(activeAiEstimate.baseFat);
    document.getElementById("ai-serving-label").value = getAiPortionUnitLabel();
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
  const quantityLabel = document.getElementById("ai-quantity-label");
  const quantityInput = document.getElementById("ai-quantity");
  const portionInput = document.getElementById("ai-serving-label");
  const gramsGroup = document.getElementById("ai-grams-group");
  const gramsInput = document.getElementById("ai-grams");
  const helper = document.getElementById("ai-estimate-helper");
  if (!quantityLabel || !quantityInput || !portionInput || !gramsGroup || !gramsInput || !helper || !activeAiEstimate) {
    return;
  }
  quantityLabel.textContent = "Quantity";
  quantityInput.value = roundNutrient(getAiVisibleQuantity());
  portionInput.value = getAiPortionUnitLabel();
  gramsInput.value = Math.round(activeAiEstimate.baseGrams);
  const showGrams = shouldShowAiGramsField();
  gramsGroup.classList.toggle("hidden", !showGrams);
  helper.textContent = showGrams
    ? "Change any value if it looks off. Editing quantity or total grams will auto-update the rest."
    : "Change any value if it looks off. Editing quantity will auto-update the rest.";
}

function syncEstimateFromQuantity() {
  if (!activeAiEstimate) {
    return;
  }

  const quantity = normalizePositiveNumber(document.getElementById("ai-quantity").value, getAiVisibleQuantity());
  const ratio = getAiQuantityRatio(quantity);
  const grams = Math.round(activeAiEstimate.baseGrams * ratio);
  document.getElementById("ai-grams").value = grams;
  document.getElementById("ai-calories").value = Math.round(activeAiEstimate.baseCalories * ratio);
  document.getElementById("ai-protein").value = roundNutrient(activeAiEstimate.baseProtein * ratio);
  document.getElementById("ai-carb").value = roundNutrient(activeAiEstimate.baseCarb * ratio);
  document.getElementById("ai-fat").value = roundNutrient(activeAiEstimate.baseFat * ratio);
  document.getElementById("ai-serving-label").value = getAiPortionUnitLabel(quantity);
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
}

function getAiVisibleQuantity() {
  if (!activeAiEstimate) {
    return 1;
  }
  if (activeAiEstimate.baseQuantity > 0 && activeAiEstimate.quantityUnit) {
    return activeAiEstimate.baseQuantity;
  }
  return activeAiEstimate.baseGrams;
}

function getAiQuantityRatio(quantity) {
  if (!activeAiEstimate) {
    return 1;
  }
  if (activeAiEstimate.baseQuantity > 0 && activeAiEstimate.quantityUnit) {
    return activeAiEstimate.baseQuantity > 0 ? quantity / activeAiEstimate.baseQuantity : 1;
  }
  return activeAiEstimate.baseGrams > 0 ? quantity / activeAiEstimate.baseGrams : 1;
}

function shouldShowAiGramsField() {
  if (!activeAiEstimate) {
    return false;
  }
  return activeAiEstimate.baseGrams > 0 && activeAiEstimate.baseQuantity > 0 && !!activeAiEstimate.quantityUnit;
}

function getAiPortionUnitLabel(quantity = null) {
  if (!activeAiEstimate) {
    return "g";
  }

  if (activeAiEstimate.quantityUnit) {
    const effectiveQuantity = quantity ?? getAiVisibleQuantity();
    return pluralizeAiUnit(activeAiEstimate.quantityUnit, effectiveQuantity);
  }

  const cleanedPortion = String(activeAiEstimate.portionName || "").replace(/^\s*\d+(?:\.\d+)?\s*/u, "").trim();
  return cleanedPortion || "g";
}

function pluralizeAiUnit(unit, quantity) {
  const normalized = String(unit || "").trim().toLowerCase();
  if (!normalized) {
    return "g";
  }
  return formatFoodUnitLabel(normalized, getFoodUnitKind(normalized), quantity ?? 2);
}

function resolveAiEstimatedTotalGrams({ estimatedGrams, baseQuantity, quantityUnit, calories, protein, carbs, fat, note }) {
  const grams = normalizePositiveNumber(estimatedGrams, 0);
  if (!(grams > 0)) {
    return 0;
  }
  if (!(baseQuantity > 1) || !isCountBasedFoodUnit(quantityUnit)) {
    return grams;
  }

  const gramsPerEachMatch = String(note || "").match(/(\d+(?:\.\d+)?)\s*g\s+each/i);
  if (gramsPerEachMatch) {
    return Number(gramsPerEachMatch[1]) * baseQuantity;
  }

  const macroMass = Math.max(0, protein) + Math.max(0, carbs) + Math.max(0, fat);
  const caloriesPerGram = calories > 0 ? calories / grams : 0;
  const macroDensity = macroMass / grams;
  if (caloriesPerGram > 4.5 || macroDensity > 0.75) {
    return grams * baseQuantity;
  }

  return grams;
}

function readAiEditorValues() {
  const name = document.getElementById("ai-name").value.trim();
  const quantity = normalizePositiveNumber(document.getElementById("ai-quantity").value, getAiVisibleQuantity());
  const portionName = document.getElementById("ai-serving-label").value.trim();
  const grams = normalizePositiveNumber(document.getElementById("ai-grams").value, 0);
  const calories = normalizePositiveNumber(document.getElementById("ai-calories").value, 0);
  const protein = normalizePositiveNumber(document.getElementById("ai-protein").value, 0);
  const carb = normalizePositiveNumber(document.getElementById("ai-carb").value, 0);
  const fat = normalizePositiveNumber(document.getElementById("ai-fat").value, 0);
  const normalizedPortion = normalizeFoodUnit(portionName);
  const displayPortion = portionName ? formatFoodUnitLabel(normalizedPortion || portionName, getFoodUnitKind(normalizedPortion || portionName), quantity) : "";
  const serving = displayPortion ? `${roundNutrient(quantity)} ${displayPortion}` : `${Math.round(grams)} g`;

  return { name, quantity, portionName, grams, calories, protein, carb, fat, serving };
}

function validateAiEditorValues(values) {
  if (!values.name) {
    showToast("Enter a food name");
    return false;
  }
  if (values.grams <= 0) {
    showToast("Quantity must be greater than 0");
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
  document.getElementById("ai-save-to-foods").checked = true;
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

  const shouldSave = document.getElementById("ai-save-to-foods")?.checked;
  if (shouldSave) {
    upsertAiEstimateFood(values);
  }

  saveState();
  resetAiEstimateForm();
  renderToday();
  renderHistory();
  triggerFoodCelebration();
  showToast(shouldSave ? "Meal logged and saved to My Foods" : "Meal logged");
  setTimeout(() => showPage("today"), 400);
}

function saveAiEstimateToFoods() {
  const values = readAiEditorValues();
  if (!validateAiEditorValues(values)) {
    return;
  }

  upsertAiEstimateFood(values);
  saveState();
  renderFoodsDB();
  updateLogTabs();
  renderFoodPicker();
  showToast("Food saved from AI estimate");
}

function upsertAiEstimateFood(values) {
  const baseQuantity = activeAiEstimate?.baseQuantity || inferQuantityFromServing(values.serving).baseQuantity || 0;
  const quantityUnit = activeAiEstimate?.quantityUnit || inferQuantityFromServing(values.serving).quantityUnit || "";
  upsertFoodRecord({
    name: values.name,
    grams: values.grams,
    baseQuantity,
    quantityUnit,
    cal: roundNutrient(values.calories),
    pro: roundNutrient(values.protein),
    carb: roundNutrient(values.carb),
    fat: roundNutrient(values.fat),
    serving: values.serving
  });
  renderFoodsDB();
  updateLogTabs();
  renderFoodPicker();
}

function readCustomValues() {
  const name = document.getElementById("custom-name").value.trim();
  const quantity = normalizePositiveNumber(document.getElementById("custom-quantity").value, 0);
  const portionName = document.getElementById("custom-portion-name").value.trim();
  const cal = normalizePositiveNumber(document.getElementById("custom-cal").value, 0);
  const pro = normalizePositiveNumber(document.getElementById("custom-pro").value, 0);
  const carb = normalizePositiveNumber(document.getElementById("custom-carb").value, 0);
  const fat = normalizePositiveNumber(document.getElementById("custom-fat").value, 0);

  return { name, quantity, portionName, cal, pro, carb, fat };
}

function buildCustomDisplayName(values) {
  const { name, quantity, portionName } = values;
  return quantity > 0 && portionName
    ? `${name} (${roundNutrient(quantity)} ${portionName})`
    : portionName
      ? `${name} (${portionName})`
      : quantity > 0
        ? `${name} (${roundNutrient(quantity)})`
        : name;
}

function buildCustomServing(values) {
  const { quantity, portionName } = values;
  if (quantity > 0 && portionName) {
    return `${roundNutrient(quantity)} ${portionName}`;
  }
  if (portionName) {
    return portionName;
  }
  return "";
}

function resetCustomForm() {
  document.getElementById("custom-name").value = "";
  document.getElementById("custom-quantity").value = "";
  document.getElementById("custom-portion-name").value = "";
  document.getElementById("custom-cal").value = "";
  document.getElementById("custom-pro").value = "";
  document.getElementById("custom-carb").value = "";
  document.getElementById("custom-fat").value = "";
  document.getElementById("custom-save-to-foods").checked = true;
}

function validateCustomValues(values) {
  if (!values.name) {
    showToast("Please enter a meal name");
    return false;
  }
  return true;
}

function logCustom() {
  const values = readCustomValues();
  if (!validateCustomValues(values)) {
    return;
  }

  const displayName = buildCustomDisplayName(values);

  state.logs.push({ id: uid(), date: todayStr(), name: displayName, cal: values.cal, pro: values.pro, carb: values.carb, fat: values.fat });
  const shouldSave = document.getElementById("custom-save-to-foods")?.checked;
  if (shouldSave) {
    saveCustomValuesToFoods(values);
  }
  saveState();
  resetCustomForm();
  renderToday();
  renderHistory();
  triggerFoodCelebration();
  showToast(shouldSave ? "Meal logged and saved to My Foods" : "Meal logged");
  setTimeout(() => showPage("today"), 400);
}

function saveCustomToFoods() {
  const values = readCustomValues();
  if (!validateCustomValues(values)) {
    return;
  }

  saveCustomValuesToFoods(values);
  saveState();
  resetCustomForm();
  showToast("Saved to My Foods");
}

function saveCustomValuesToFoods(values) {
  const serving = buildCustomServing(values);
  let grams = 100;
  const normalizedUnit = normalizeFoodUnit(values.portionName);
  if (values.quantity > 0 && normalizedUnit) {
    if (isWeightUnit(normalizedUnit)) {
      grams = convertToCanonicalFoodAmount(values.quantity, normalizedUnit, "weight");
    } else if (normalizedUnit === "ml") {
      grams = values.quantity;
    } else if (normalizedUnit === "l") {
      grams = values.quantity * 1000;
    }
  }

  const quantityMeta = inferQuantityFromServing(serving);
  upsertFoodRecord({
    name: values.name,
    grams: Math.max(1, roundNutrient(grams)),
    baseQuantity: quantityMeta.baseQuantity || 0,
    quantityUnit: quantityMeta.quantityUnit || "",
    cal: roundNutrient(values.cal),
    pro: roundNutrient(values.pro),
    carb: roundNutrient(values.carb),
    fat: roundNutrient(values.fat),
    serving
  });
  renderFoodsDB();
  updateLogTabs();
  renderFoodPicker();
}

function upsertFoodRecord(foodLike) {
  const normalized = normalizeFoodRecord({ id: uid(), ...foodLike });
  const matchIndex = state.foods.findIndex((food) =>
    food.name.trim().toLowerCase() === normalized.name.trim().toLowerCase() &&
    (food.serving || "").trim().toLowerCase() === (normalized.serving || "").trim().toLowerCase()
  );
  if (matchIndex >= 0) {
    state.foods[matchIndex] = { ...state.foods[matchIndex], ...normalized, id: state.foods[matchIndex].id };
    return state.foods[matchIndex];
  }
  state.foods.push(normalized);
  return normalized;
}

function renderFoodsDB() {
  const list = document.getElementById("foods-list");
  if (!list) {
    return;
  }
  if (!state.foods.length) {
    list.innerHTML = "<div class=\"empty-state\"><div class=\"empty-icon\">Food</div>No saved foods yet.<br>Use AI or Custom to create one.</div>";
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
        <button class="icon-btn danger" onclick="deleteFoodById('${food.id}')" title="Delete">Delete</button>
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
  updateLogTabs();
  renderFoodPicker();
  updateFoodLogInputMode();
  showToast(editId ? "Food updated" : "Food added");
}

function deleteFood() {
  const editId = document.getElementById("food-edit-id").value;
  if (!editId) {
    return;
  }
  deleteFoodById(editId, true);
}

function deleteFoodById(id, closeEditor = false) {
  if (!id) {
    return;
  }
  if (!window.confirm("Delete this food from your database?")) {
    return;
  }

  state.foods = state.foods.filter((food) => food.id !== id);
  if (selectedFoodId === id) {
    selectedFoodId = null;
  }
  saveState();
  if (closeEditor) {
    closeModal("food");
  }
  renderFoodsDB();
  updateLogTabs();
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
  document.getElementById("goal-sources-popover").classList.add("hidden");
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

async function suggestGoals() {
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

function toggleGoalSourcesInfo() {
  document.getElementById("goal-sources-popover").classList.toggle("hidden");
}

function calculateGoalRecommendation({ gender, age, heightCm, weightKg, fitnessGoal, activity }) {
  const sexOffset = gender === "male" ? 5 : -161;
  const rmr = (10 * weightKg) + (6.25 * heightCm) - (5 * age) + sexOffset;
  const activityMultiplier = {
    sedentary: 1.2,
    light: 1.375,
    moderate: 1.55,
    very: 1.725
  }[activity] || 1.55;
  const goalAdjustment = {
    lose: -400,
    maintain: 0,
    build: 250,
    health: 0
  }[fitnessGoal] || 0;

  const calories = Math.max(1200, roundToNearest((rmr * activityMultiplier) + goalAdjustment, 25));

  const proteinMultiplier = {
    lose: 1.8,
    maintain: 1.4,
    build: 2.0,
    health: 1.2
  }[fitnessGoal] || 1.4;
  const minimumProteinMultiplier = {
    lose: 1.4,
    maintain: 1.2,
    build: 1.6,
    health: 1.0
  }[fitnessGoal] || 1.2;
  const fatPercentTarget = {
    lose: 0.25,
    maintain: 0.28,
    build: 0.27,
    health: 0.3
  }[fitnessGoal] || 0.28;

  let protein = weightKg * proteinMultiplier;
  protein = Math.min(protein, (calories * 0.3) / 4);
  let proteinCalories = protein * 4;

  let fatCalories = calories * fatPercentTarget;
  fatCalories = clamp(fatCalories, calories * 0.2, calories * 0.35);
  let carbCalories = calories - proteinCalories - fatCalories;

  const minimumCarbCalories = calories * 0.45;
  if (carbCalories < minimumCarbCalories) {
    fatCalories = Math.max(calories * 0.2, fatCalories - (minimumCarbCalories - carbCalories));
    carbCalories = calories - proteinCalories - fatCalories;
  }
  if (carbCalories < minimumCarbCalories) {
    const minimumProteinCalories = weightKg * minimumProteinMultiplier * 4;
    proteinCalories = Math.max(minimumProteinCalories, proteinCalories - (minimumCarbCalories - carbCalories));
    protein = proteinCalories / 4;
    carbCalories = calories - proteinCalories - fatCalories;
  }

  const fat = fatCalories / 9;
  const carbs = Math.max(0, carbCalories / 4);

  const waterBase = gender === "male" ? 3.7 : 2.7;
  const water = roundToDecimal(waterBase + ({
    sedentary: 0,
    light: 0.3,
    moderate: 0.6,
    very: 0.9
  }[activity] || 0.3), 1);

  const steps = {
    sedentary: 6000,
    light: 8000,
    moderate: 10000,
    very: 12000
  }[activity] || 8000;

  return {
    cal: Math.round(calories),
    pro: roundToDecimal(protein, 1),
    carb: roundToDecimal(carbs, 1),
    fat: roundToDecimal(fat, 1),
    water,
    steps,
    note: buildGoalRecommendationNote(fitnessGoal, activity)
  };
}

function buildGoalRecommendationNote(fitnessGoal, activity) {
  const goalCopy = {
    lose: "fat loss with higher protein and a moderate calorie deficit",
    maintain: "steady maintenance with balanced macros",
    build: "muscle gain with a controlled calorie surplus",
    health: "general health with practical daily targets"
  }[fitnessGoal] || "balanced nutrition";
  const activityCopy = {
    sedentary: "sedentary",
    light: "lightly active",
    moderate: "moderately active",
    very: "very active"
  }[activity] || "moderately active";
  return `Suggested from NIH/National Academies guidance for a ${activityCopy} routine and ${goalCopy}. You can still edit any target manually.`;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function roundToNearest(value, step) {
  return Math.round(value / step) * step;
}

function roundToDecimal(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function closeModal(name) {
  document.getElementById(`overlay-${name}`).classList.remove("open");
  if (name === "goals") {
    document.getElementById("goal-sources-popover").classList.add("hidden");
  }
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
  renderApp();
  updateAuthUi();
  registerServiceWorker();
  initializeSupabase().catch((error) => {
    console.error("Supabase initialization failed", error);
    document.getElementById("auth-status").textContent = error.message || "Failed to initialize authentication.";
  });

  document.getElementById("ai-food-input")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      requestAiEstimate();
    }
  });

  document.getElementById("auth-email")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      submitAuth("signin");
    }
  });

  document.getElementById("auth-password")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      submitAuth("signin");
    }
  });

  document.getElementById("ai-quantity")?.addEventListener("input", syncEstimateFromQuantity);
  document.getElementById("ai-grams")?.addEventListener("input", syncEstimateFromGrams);
  document.getElementById("goal-height-unit")?.addEventListener("change", toggleHeightInputs);
  toggleHeightInputs();
});

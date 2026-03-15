window.__VIVA_APP_BOOTED = true;

const DEFAULT_GOALS = { cal: 2000, pro: 150, carb: 220, fat: 65, water: 2.5, steps: 8000 };
const SUPABASE_URL = "https://fqylcprwmpgqenhlvfdj.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_vst5ttBTskmLEFK-iKar5A_8qttx1eO";
const STORAGE_KEY = "nutrilog_v3";
const LEGACY_STORAGE_KEY = "nutrilog_v1";
const AUTH_PREFERENCE_KEY = "viva_ai_auth_pref";
const AI_ESTIMATE_ENDPOINT = "/api/estimate-food";
const AI_IMAGE_ENDPOINT = "/api/identify-food-image";
const AMPLITUDE_API_KEY = "36b1073a066682c38cec1621502bf5bc";
const AMPLITUDE_PRODUCTION_HOSTS = new Set(["fitness-tracker-three-ebon.vercel.app"]);
const OUNCES_TO_GRAMS = 28.3495;
const CUP_TO_ML = 240;

let currentUser = null;
let state = createInitialState();
let currentPage = "today";
let selectedFoodId = null;
let toastTimer;
let activeAiEstimate = null;
let supabaseClient = null;
let hasLoadedUserState = false;
let cloudSyncTimer = null;
let isApplyingRemoteState = false;
let isRecoveryMode = false;
let isGuestMode = !currentUser;
let authScreenForced = false;
let deferredInstallPrompt = null;
let pullRefreshStartY = 0;
let pullRefreshDistance = 0;
let isPullRefreshing = false;
let isPullTracking = false;
let startupDelayDone = false;
let startupAuthReady = false;
let activeAiPhoto = null;
let editingLogId = null;
let quickTrackMode = "water";
let amplitudeInitPromise = null;
let hasTrackedAppOpened = false;

const PULL_REFRESH_TRIGGER = 60;
const PULL_REFRESH_MAX = 112;
const STARTUP_AUTH_TIMEOUT_MS = 3500;

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
  syncAmplitudeUserProperties();
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

function getWaterUnitOwnerKey() {
  return currentUser?.id || "guest";
}

function getScopedWaterUnitId(kind, ownerKey = getWaterUnitOwnerKey()) {
  const safeOwnerKey = String(ownerKey || "guest").replace(/[^a-zA-Z0-9_-]/g, "-");
  return `${kind}-unit-${safeOwnerKey}`;
}

function getSavedAuthPreference() {
  return localStorage.getItem(AUTH_PREFERENCE_KEY) || "";
}

function setSavedAuthPreference(value) {
  if (value) {
    localStorage.setItem(AUTH_PREFERENCE_KEY, value);
    return;
  }
  localStorage.removeItem(AUTH_PREFERENCE_KEY);
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

function isAmplitudeEnabled() {
  return typeof window !== "undefined" && AMPLITUDE_PRODUCTION_HOSTS.has(window.location.hostname);
}

function hasCustomGoals() {
  return Object.keys(DEFAULT_GOALS).some((key) => Number(state.goals[key]) !== Number(DEFAULT_GOALS[key]));
}

function getAnalyticsUserProperties() {
  return {
    auth_state: currentUser ? "signed_in" : (isGuestMode ? "guest" : "signed_out"),
    guest_or_account: currentUser ? "account" : "guest",
    has_saved_foods: state.foods.length > 0,
    has_goals_set: hasCustomGoals()
  };
}

function loadAmplitudeScript() {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-amplitude-sdk="true"]');
    if (existing) {
      if (window.amplitude?.init) {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Amplitude SDK failed to load")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = `https://cdn.amplitude.com/script/${AMPLITUDE_API_KEY}.js`;
    script.async = true;
    script.dataset.amplitudeSdk = "true";
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", () => reject(new Error("Amplitude SDK failed to load")), { once: true });
    document.head.appendChild(script);
  });
}

async function ensureAmplitude() {
  if (!isAmplitudeEnabled()) {
    return false;
  }
  if (window.amplitude?.init && amplitudeInitPromise === null) {
    amplitudeInitPromise = Promise.resolve(true);
    return true;
  }
  if (amplitudeInitPromise) {
    return amplitudeInitPromise;
  }

  amplitudeInitPromise = (async () => {
    await loadAmplitudeScript();
    if (!window.amplitude?.init) {
      throw new Error("Amplitude SDK did not initialize.");
    }
    window.amplitude.init(AMPLITUDE_API_KEY, {
      fetchRemoteConfig: true,
      autocapture: false
    });
    syncAmplitudeUserProperties();
    return true;
  })().catch((error) => {
    console.error("Amplitude initialization failed", error);
    amplitudeInitPromise = null;
    return false;
  });

  return amplitudeInitPromise;
}

async function syncAmplitudeUserProperties() {
  if (!(await ensureAmplitude()) || !window.amplitude) {
    return;
  }

  if (currentUser?.id) {
    window.amplitude.setUserId(currentUser.id);
  } else if (typeof window.amplitude.reset === "function") {
    window.amplitude.reset();
  } else if (typeof window.amplitude.setUserId === "function") {
    window.amplitude.setUserId(null);
  }

  if (typeof window.amplitude.identify === "function" && typeof window.amplitude.Identify === "function") {
    const identify = new window.amplitude.Identify();
    const properties = getAnalyticsUserProperties();
    Object.entries(properties).forEach(([key, value]) => identify.set(key, value));
    window.amplitude.identify(identify);
  }
}

async function trackAmplitudeEvent(eventName, eventProperties = {}) {
  if (!(await ensureAmplitude()) || !window.amplitude?.track) {
    return;
  }
  window.amplitude.track(eventName, {
    ...eventProperties,
    auth_state: currentUser ? "signed_in" : (isGuestMode ? "guest" : "signed_out")
  });
}

function isStartupComplete() {
  return startupDelayDone && startupAuthReady;
}

function setStartupStatus(message) {
  const status = document.getElementById("startup-status");
  if (status) {
    status.textContent = message;
  }
}

function showStartupFailure(message) {
  const errorBox = document.getElementById("startup-error");
  const continueButton = document.getElementById("startup-continue-btn");
  const spinner = document.querySelector(".startup-spinner");
  setStartupStatus("Startup hit a problem.");
  if (spinner) {
    spinner.classList.add("hidden");
  }
  if (errorBox) {
    errorBox.textContent = message || "Unknown startup error.";
    errorBox.classList.remove("hidden");
  }
  continueButton?.classList.remove("hidden");
}

function dismissStartupScreen() {
  startupDelayDone = true;
  startupAuthReady = true;
  document.getElementById("startup-screen")?.classList.add("hidden");
  updateAuthUi();
}

function finishStartupIfReady() {
  if (!isStartupComplete()) {
    return;
  }
  document.getElementById("startup-screen")?.classList.add("hidden");
  updateAuthUi();
  syncAmplitudeUserProperties();
  if (!hasTrackedAppOpened) {
    hasTrackedAppOpened = true;
    trackAmplitudeEvent("app_opened", {
      has_saved_foods: state.foods.length > 0,
      has_goals_set: hasCustomGoals()
    });
  }
}

function isMobileDevice() {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "")
    || (window.matchMedia && window.matchMedia("(max-width: 768px)").matches);
}

function isIosDevice() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent || "");
}

function isStandaloneMode() {
  return window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone === true;
}

function shouldShowInstallEntry() {
  if (isStandaloneMode()) {
    return false;
  }
  if (isIosDevice()) {
    return true;
  }
  return isMobileDevice();
}

function updateInstallUi() {
  ["auth-install-btn", "today-install-btn"].forEach((id) => {
    const button = document.getElementById(id);
    if (button) {
      button.classList.toggle("hidden", !shouldShowInstallEntry());
    }
  });
}

function isAtTopOfPage() {
  const scroller = document.scrollingElement || document.documentElement || document.body;
  const scrollTop = scroller?.scrollTop || window.scrollY || 0;
  return scrollTop <= 2;
}

function hasOpenOverlay() {
  return !!document.querySelector(".overlay.open");
}

function isAuthScreenVisible() {
  const authScreen = document.getElementById("auth-screen");
  return !!authScreen && !authScreen.classList.contains("hidden");
}

function updatePullRefreshUi(distance = 0, refreshing = false) {
  const indicator = document.getElementById("pull-refresh-indicator");
  const text = document.getElementById("pull-refresh-text");
  const icon = document.getElementById("pull-refresh-icon");
  const pill = document.getElementById("pull-refresh-pill");
  if (!indicator || !text || !icon) {
    return;
  }

  if (!distance && !refreshing) {
    indicator.classList.remove("visible", "ready", "refreshing");
    indicator.style.transform = "translate(-50%, -72px)";
    pill?.style.setProperty("--pull-progress", "0");
    text.textContent = "Pull to refresh";
    icon.textContent = "↻";
    return;
  }

  const capped = Math.min(distance, PULL_REFRESH_MAX);
  const progress = Math.min(capped / PULL_REFRESH_TRIGGER, 1);
  indicator.classList.add("visible");
  indicator.classList.toggle("ready", capped >= PULL_REFRESH_TRIGGER && !refreshing);
  indicator.classList.toggle("refreshing", refreshing);
  indicator.style.transform = `translate(-50%, ${Math.min(capped - 64, 18)}px)`;
  pill?.style.setProperty("--pull-progress", String(progress));
  text.textContent = refreshing
    ? "Refreshing..."
    : capped >= PULL_REFRESH_TRIGGER
      ? "Release to refresh"
      : "Pull to refresh";
  icon.textContent = "↻";
}

async function refreshCurrentView() {
  if (isPullRefreshing) {
    return;
  }

  isPullRefreshing = true;
  updatePullRefreshUi(PULL_REFRESH_TRIGGER, true);

  try {
    if (currentUser && supabaseClient) {
      await loadUserState(currentUser.id);
    } else {
      loadState();
      renderApp();
    }
    showToast("Updated");
  } catch (error) {
    console.error("Pull refresh failed", error);
    showToast("Refresh failed");
  } finally {
    setTimeout(() => {
      isPullRefreshing = false;
      updatePullRefreshUi(0, false);
    }, 280);
  }
}

function handlePullTouchStart(event) {
  if (!isMobileDevice() || isPullRefreshing || hasOpenOverlay() || isAuthScreenVisible() || !isAtTopOfPage()) {
    isPullTracking = false;
    return;
  }

  const target = event.target;
  if (target && typeof target.closest === "function" && target.closest("input, textarea, select, button")) {
    isPullTracking = false;
    return;
  }

  if ((event.touches?.[0]?.clientY || 0) > 120) {
    isPullTracking = false;
    return;
  }

  pullRefreshStartY = event.touches[0]?.clientY || 0;
  pullRefreshDistance = 0;
  isPullTracking = true;
  updatePullRefreshUi(0, false);
}

function handlePullTouchMove(event) {
  if (!isPullTracking || isPullRefreshing) {
    return;
  }

  const currentY = event.touches[0]?.clientY || 0;
  const rawDistance = currentY - pullRefreshStartY;
  if (rawDistance <= 0) {
    updatePullRefreshUi(0, false);
    return;
  }
  if (!isAtTopOfPage()) {
    isPullTracking = false;
    updatePullRefreshUi(0, false);
    return;
  }

  pullRefreshDistance = Math.min(rawDistance * 0.85, PULL_REFRESH_MAX);
  if (pullRefreshDistance > 4) {
    event.preventDefault();
    updatePullRefreshUi(pullRefreshDistance, false);
  }
}

function handlePullTouchEnd() {
  if (!isPullTracking) {
    return;
  }

  const shouldRefresh = pullRefreshDistance >= PULL_REFRESH_TRIGGER;
  isPullTracking = false;
  const finalDistance = pullRefreshDistance;
  pullRefreshDistance = 0;

  if (shouldRefresh) {
    refreshCurrentView();
    return;
  }

  if (finalDistance > 0) {
    updatePullRefreshUi(0, false);
  }
}

function scheduleCloudSync() {
  clearTimeout(cloudSyncTimer);
  cloudSyncTimer = setTimeout(() => {
    syncStateToCloud().catch((error) => {
      console.error("Cloud sync failed", error);
      showToast(`Cloud sync failed: ${formatSupabaseError(error)}`);
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
          showToast(`Initial cloud import failed: ${formatSupabaseError(error)}`);
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
  const accountNameInput = document.getElementById("account-name-input");
  const accountSignedOut = document.getElementById("account-signed-out");
  const accountSignedIn = document.getElementById("account-signed-in");
  const accountStatus = document.getElementById("account-status");
  const recoveryPanel = document.getElementById("auth-recovery");
  const authActions = document.querySelector(".auth-actions");
  const authLinks = document.querySelector(".auth-links");
  const authGuestButton = document.getElementById("auth-guest-btn");
  if (!authScreen || !accountButton || !accountEmail) {
    return;
  }

  if (!isStartupComplete()) {
    authScreen.classList.add("hidden");
    accountButton.classList.add("hidden");
    return;
  }

  const signedIn = !!currentUser;
  const shouldShowAuthScreen = isRecoveryMode || (!signedIn && !isGuestMode) || authScreenForced;
  authScreen.classList.toggle("hidden", !shouldShowAuthScreen);
  accountButton.classList.toggle("hidden", isRecoveryMode || (shouldShowAuthScreen && !signedIn));
  accountButton.textContent = signedIn ? getUserDisplayName() : "Sign In";
  accountEmail.textContent = signedIn ? (currentUser.email || "") : "";
  if (accountNameInput) {
    accountNameInput.value = signedIn ? getCurrentUserName() : "";
  }
  accountSignedOut?.classList.toggle("hidden", signedIn);
  accountSignedIn?.classList.toggle("hidden", !signedIn);
  if (accountStatus && !signedIn) {
    accountStatus.textContent = "";
  }
  recoveryPanel?.classList.toggle("hidden", !isRecoveryMode);
  authActions?.classList.toggle("hidden", isRecoveryMode);
  authLinks?.classList.toggle("hidden", isRecoveryMode);
  authGuestButton?.classList.toggle("hidden", isRecoveryMode);
  updateInstallUi();
}

function setRecoveryMode(active) {
  isRecoveryMode = !!active;
  if (active) {
    authScreenForced = true;
  }
  updateAuthUi();
}

function getCurrentUserName() {
  const raw = currentUser?.user_metadata?.display_name;
  return typeof raw === "string" ? raw.trim() : "";
}

function getUserDisplayName() {
  return getCurrentUserName() || currentUser?.email || "Account";
}

function togglePasswordVisibility(inputId, toggleId) {
  const input = document.getElementById(inputId);
  const toggle = document.getElementById(toggleId);
  if (!input || !toggle) {
    return;
  }
  const visible = input.type === "text";
  input.type = visible ? "password" : "text";
  toggle.setAttribute("aria-pressed", String(!visible));
  toggle.setAttribute("aria-label", visible ? "Show password" : "Hide password");
  toggle.textContent = visible ? "👁" : "🙈";
}

async function applySession(session) {
  const nextUser = session?.user || null;
  if (nextUser && currentUser?.id === nextUser.id && hasLoadedUserState) {
    isGuestMode = false;
    updateAuthUi();
    syncAmplitudeUserProperties();
    return;
  }

  currentUser = nextUser;
  isGuestMode = !currentUser;
  if (currentUser) {
    authScreenForced = false;
    setSavedAuthPreference("account");
  }
  updateAuthUi();
  syncAmplitudeUserProperties();

  if (!currentUser) {
    hasLoadedUserState = false;
    clearTimeout(cloudSyncTimer);
    loadState();
    renderApp();
    return;
  }

  hasLoadedUserState = true;
  document.getElementById("auth-status").textContent = "Loading your data...";
  await loadUserState(currentUser.id);
  document.getElementById("auth-status").textContent = "";
}

async function initializeSupabase() {
  setStartupStatus("Restoring your session...");
  if (!window.supabase?.createClient) {
    console.error("Supabase client failed to load");
    showStartupFailure("Supabase client failed to load.");
    startupAuthReady = true;
    finishStartupIfReady();
    return;
  }

  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true
    }
  });

  const sessionResult = await withTimeout(
    supabaseClient.auth.getSession(),
    STARTUP_AUTH_TIMEOUT_MS,
    "Authentication startup timed out"
  );
  if (sessionResult.error) {
    console.error("Failed to get session", sessionResult.error);
  }
  await withTimeout(
    applySession(sessionResult.data.session),
    STARTUP_AUTH_TIMEOUT_MS,
    "Session restore timed out"
  );
  setStartupStatus("Ready");
  startupAuthReady = true;
  finishStartupIfReady();

  supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === "PASSWORD_RECOVERY") {
      setRecoveryMode(true);
      document.getElementById("auth-status").textContent = "Set a new password to finish recovery.";
    }
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
      trackAmplitudeEvent("sign_up", { confirmation_required: true });
      status.textContent = "Account created. Check your email to confirm, then sign in.";
      return;
    }

    isGuestMode = false;
    authScreenForced = false;
    setSavedAuthPreference("account");
    status.textContent = "";
    closeModal("account");
    trackAmplitudeEvent(mode === "signup" ? "sign_up" : "sign_in", { confirmation_required: false });
  } catch (error) {
    console.error("Auth request failed", error);
    status.textContent = error.message || "Authentication failed.";
  }
}

async function startPasswordReset() {
  const email = document.getElementById("auth-email").value.trim();
  const status = document.getElementById("auth-status");
  if (!supabaseClient) {
    status.textContent = "Supabase is not ready yet.";
    return;
  }
  if (!email) {
    status.textContent = "Enter your email first.";
    return;
  }

  status.textContent = "Sending reset email...";
  try {
    const result = await supabaseClient.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}${window.location.pathname}`
    });
    if (result.error) {
      throw result.error;
    }
    status.textContent = "Reset email sent. Open the link, then set your new password here.";
  } catch (error) {
    console.error("Password reset request failed", error);
    status.textContent = error.message || "Password reset failed.";
  }
}

async function completePasswordReset() {
  const password = document.getElementById("auth-reset-password").value;
  const confirm = document.getElementById("auth-reset-password-confirm").value;
  const status = document.getElementById("auth-status");
  if (!supabaseClient) {
    status.textContent = "Supabase is not ready yet.";
    return;
  }
  if (!isRecoveryMode) {
    status.textContent = "Open your recovery email link first.";
    return;
  }
  if (!password || !confirm) {
    status.textContent = "Enter and confirm your new password.";
    return;
  }
  if (password.length < 6) {
    status.textContent = "Password must be at least 6 characters.";
    return;
  }
  if (password !== confirm) {
    status.textContent = "Passwords do not match.";
    return;
  }

  status.textContent = "Updating password...";
  try {
    const result = await supabaseClient.auth.updateUser({ password });
    if (result.error) {
      throw result.error;
    }
    document.getElementById("auth-password").value = "";
    document.getElementById("auth-reset-password").value = "";
    document.getElementById("auth-reset-password-confirm").value = "";
    setRecoveryMode(false);
    status.textContent = "Password updated. You can continue in the app now.";
  } catch (error) {
    console.error("Password update failed", error);
    status.textContent = error.message || "Password update failed.";
  }
}

function openAccountModal() {
  if (currentUser) {
    document.getElementById("account-status").textContent = "";
  }
  document.getElementById("overlay-account").classList.add("open");
}

function openInstallModal() {
  const title = document.getElementById("install-title");
  const copy = document.getElementById("install-copy");
  const steps = document.getElementById("install-steps");
  const actionButton = document.getElementById("install-action-btn");
  if (!title || !copy || !steps || !actionButton) {
    return;
  }

  title.textContent = "Install Viva.AI";

  if (deferredInstallPrompt) {
    copy.textContent = "Add Viva.AI to your home screen so it feels like a real app and opens faster next time.";
    steps.classList.add("hidden");
    actionButton.classList.remove("hidden");
    trackAmplitudeEvent("install_prompt_opened", { install_mode: "native_prompt" });
  } else if (isIosDevice()) {
    copy.textContent = "On iPhone and iPad, Viva.AI can still be added manually from your browser menu or share sheet even when the browser does not show a one-tap install prompt.";
    steps.classList.remove("hidden");
    actionButton.classList.add("hidden");
    trackAmplitudeEvent("install_prompt_opened", { install_mode: "ios_manual" });
  } else {
    copy.textContent = "Your browser does not expose the install prompt right now. Open the browser menu and use Add to Home Screen if it is available.";
    steps.classList.add("hidden");
    actionButton.classList.add("hidden");
    trackAmplitudeEvent("install_prompt_opened", { install_mode: "browser_manual" });
  }

  document.getElementById("overlay-install").classList.add("open");
}

async function promptPwaInstall() {
  if (!deferredInstallPrompt) {
    openInstallModal();
    return;
  }
  try {
    await deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
  } catch (error) {
    console.error("PWA install prompt failed", error);
  } finally {
    deferredInstallPrompt = null;
    updateInstallUi();
    closeModal("install");
  }
}

function openAuthFromAccount(mode = "signin") {
  authScreenForced = true;
  isGuestMode = false;
  setSavedAuthPreference("");
  updateAuthUi();
  document.getElementById("overlay-account").classList.remove("open");
  document.getElementById("auth-status").textContent = "";
  if (mode === "signup") {
    document.getElementById("auth-status").textContent = "Create an account to sync your current local data.";
  }
}

function continueAsGuest() {
  isGuestMode = true;
  authScreenForced = false;
  setSavedAuthPreference("guest");
  document.getElementById("auth-status").textContent = "";
  updateAuthUi();
  trackAmplitudeEvent("continue_as_guest");
}

async function saveDisplayName() {
  const input = document.getElementById("account-name-input");
  const status = document.getElementById("account-status");
  if (!supabaseClient || !currentUser || !input || !status) {
    return;
  }
  const nextName = input.value.trim().slice(0, 100);
  input.value = nextName;
  status.textContent = "Saving name...";
  try {
    const result = await supabaseClient.auth.updateUser({
      data: { display_name: nextName }
    });
    if (result.error) {
      throw result.error;
    }
    currentUser = result.data.user || currentUser;
    updateAuthUi();
    status.textContent = "Name saved.";
    syncAmplitudeUserProperties();
  } catch (error) {
    console.error("Display name update failed", error);
    status.textContent = error.message || "Failed to save name.";
  }
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
  document.getElementById("auth-reset-password").value = "";
  document.getElementById("auth-reset-password-confirm").value = "";
  document.getElementById("auth-status").textContent = "";
  document.getElementById("account-status").textContent = "";
  isGuestMode = true;
  authScreenForced = false;
  setSavedAuthPreference("guest");
  setRecoveryMode(false);
  trackAmplitudeEvent("logout");
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

function defaultWaterUnits(existingUnits = [], ownerKey = getWaterUnitOwnerKey()) {
  const existing = Array.isArray(existingUnits) ? existingUnits : [];
  const glass = existing.find((unit) => String(unit.name).toLowerCase() === "glass");
  const bottle = existing.find((unit) => String(unit.name).toLowerCase() === "bottle");
  const glassId = getScopedWaterUnitId("glass", ownerKey);
  const bottleId = getScopedWaterUnitId("bottle", ownerKey);
  return [
    normalizeWaterUnit({
      id: glass?.id && glass.id !== "glass-unit" ? glass.id : glassId,
      name: "Glass",
      ml: glass?.ml || 250
    }),
    normalizeWaterUnit({
      id: bottle?.id && bottle.id !== "bottle-unit" ? bottle.id : bottleId,
      name: "Bottle",
      ml: bottle?.ml || 500
    })
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

function normalizeFoodMatchKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatFoodBaseLabel(food) {
  if (food.quantityUnit && food.baseQuantity > 0) {
    return `${roundNutrient(food.baseQuantity)} ${formatFoodUnitLabel(food.quantityUnit, getFoodUnitKind(food.quantityUnit), food.baseQuantity)}`;
  }
  return food.serving || `${Math.round(food.grams)} g`;
}

function findSavedFoodByDescription(query) {
  const normalizedQuery = normalizeFoodMatchKey(query);
  if (!normalizedQuery) {
    return null;
  }
  return state.foods.find((food) => normalizeFoodMatchKey(food.name) === normalizedQuery) || null;
}

async function fetchSharedAiCache(query) {
  if (!supabaseClient) {
    return null;
  }
  const normalizedQuery = normalizeFoodMatchKey(query);
  if (!normalizedQuery) {
    return null;
  }

  const result = await supabaseClient
    .from("ai_food_cache")
    .select("*")
    .eq("normalized_query", normalizedQuery)
    .maybeSingle();

  if (result.error) {
    console.error("Failed to read ai_food_cache", result.error);
    return null;
  }

  if (!result.data) {
    return null;
  }

  void supabaseClient
    .from("ai_food_cache")
    .update({
      hit_count: Number(result.data.hit_count || 0) + 1,
      last_used_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq("id", result.data.id);

  return {
    food_name: result.data.food_name,
    estimated_grams: result.data.estimated_grams,
    calories: result.data.calories,
    protein_g: result.data.protein_g,
    carb_g: result.data.carb_g,
    fat_g: result.data.fat_g,
    base_quantity: result.data.base_quantity,
    quantity_unit: result.data.quantity_unit,
    portion_name: result.data.portion_name,
    source_note: result.data.source_note,
    confidence: result.data.confidence,
    note: result.data.note
  };
}

async function saveSharedAiCache(query, payload) {
  if (!supabaseClient) {
    return;
  }
  const normalizedQuery = normalizeFoodMatchKey(query);
  if (!normalizedQuery) {
    return;
  }

  const row = {
    normalized_query: normalizedQuery,
    display_query: query.trim(),
    food_name: payload.food_name || query.trim(),
    estimated_grams: Math.round(normalizePositiveNumber(payload.estimated_grams, 0)),
    calories: roundNutrient(payload.calories || 0),
    protein_g: roundNutrient(payload.protein_g || 0),
    carb_g: roundNutrient(payload.carb_g || 0),
    fat_g: roundNutrient(payload.fat_g || 0),
    base_quantity: roundNutrient(payload.base_quantity || 0),
    quantity_unit: payload.quantity_unit || "",
    portion_name: payload.portion_name || "",
    source_note: payload.source_note || "",
    confidence: payload.confidence || "medium",
    note: payload.note || "",
    last_used_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const existing = await supabaseClient
    .from("ai_food_cache")
    .select("id, hit_count")
    .eq("normalized_query", normalizedQuery)
    .maybeSingle();

  if (existing.error && existing.error.code !== "PGRST116") {
    console.error("Failed to check existing ai_food_cache row", existing.error);
  }

  row.hit_count = Number(existing.data?.hit_count || 0) + 1;

  const result = await supabaseClient
    .from("ai_food_cache")
    .upsert(row, { onConflict: "normalized_query" });

  if (result.error) {
    console.error("Failed to write ai_food_cache", result.error);
  }
}

function normalizeFoodForLibrary({ name, grams, cal, pro, carb, fat, baseQuantity = 0, quantityUnit = "" }) {
  const normalizedUnit = normalizeFoodUnit(quantityUnit);
  const normalizedBaseQuantity = normalizePositiveNumber(baseQuantity, 0);
  const normalizedGrams = Math.max(1, normalizePositiveNumber(grams, 0) || 1);
  const normalizedCal = normalizePositiveNumber(cal, 0);
  const normalizedPro = normalizePositiveNumber(pro, 0);
  const normalizedCarb = normalizePositiveNumber(carb, 0);
  const normalizedFat = normalizePositiveNumber(fat, 0);

  if (normalizedUnit && normalizedBaseQuantity > 0 && !isWeightUnit(normalizedUnit)) {
    const divisor = normalizedBaseQuantity;
    return {
      name,
      grams: Math.max(0.1, roundNutrient(normalizedGrams / divisor)),
      baseQuantity: 1,
      quantityUnit: normalizedUnit,
      cal: roundNutrient(normalizedCal / divisor),
      pro: roundNutrient(normalizedPro / divisor),
      carb: roundNutrient(normalizedCarb / divisor),
      fat: roundNutrient(normalizedFat / divisor),
      serving: `1 ${formatFoodUnitLabel(normalizedUnit, getFoodUnitKind(normalizedUnit), 1)}`
    };
  }

  return {
    name,
    grams: 1,
    baseQuantity: 0,
    quantityUnit: "",
    cal: roundNutrient(normalizedCal / normalizedGrams),
    pro: roundNutrient(normalizedPro / normalizedGrams),
    carb: roundNutrient(normalizedCarb / normalizedGrams),
    fat: roundNutrient(normalizedFat / normalizedGrams),
    serving: "1 g"
  };
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

function setNumericInputValue(id, value, formatter = (next) => String(next)) {
  const input = document.getElementById(id);
  if (!input) {
    return;
  }
  const numeric = Number(value);
  input.value = Number.isFinite(numeric) ? formatter(numeric) : "";
}

function hydrateAiEstimateFromPayload(payload, query, options = {}) {
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
    note: payload.note || "",
    sourceNote: payload.source_note || ""
  };

  document.getElementById("ai-name").value = payload.food_name || query;
  setNumericInputValue("ai-quantity", getAiVisibleQuantity(), (next) => String(roundNutrient(next)));
  setNumericInputValue("ai-grams", activeAiEstimate.baseGrams, (next) => String(Math.round(next)));
  setNumericInputValue("ai-calories", activeAiEstimate.baseCalories, (next) => String(Math.round(next)));
  setNumericInputValue("ai-protein", activeAiEstimate.baseProtein, (next) => String(roundNutrient(next)));
  setNumericInputValue("ai-carb", activeAiEstimate.baseCarb, (next) => String(roundNutrient(next)));
  setNumericInputValue("ai-fat", activeAiEstimate.baseFat, (next) => String(roundNutrient(next)));
  document.getElementById("ai-serving-label").value = getAiPortionUnitLabel();
  document.getElementById("ai-estimate-note").textContent = `AI estimate (${activeAiEstimate.confidence} confidence): ${payload.note}`;
  updateAiQuantityMode();
  document.getElementById("ai-estimate-editor").classList.remove("hidden");
  setAiEstimateStatus(options.statusText || "Estimate ready. Adjust any values before saving.", !!activeAiEstimate.sourceNote);
}

async function postJsonExpectJson(endpoint, body, notFoundMessage) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  const contentType = response.headers.get("content-type") || "";
  const rawBody = await response.text();
  let payload = null;
  if (contentType.includes("application/json")) {
    try {
      payload = JSON.parse(rawBody);
    } catch (_error) {
      throw new Error("AI endpoint returned invalid JSON.");
    }
  } else {
    const trimmed = rawBody.trim();
    if (!response.ok && /The page could not be found|Cannot\s+POST|<!doctype html|<html/i.test(trimmed)) {
      throw new Error(notFoundMessage);
    }
    throw new Error(trimmed || "AI endpoint returned a non-JSON response.");
  }

  if (!response.ok) {
    throw new Error(payload?.error || "Request failed");
  }

  return payload;
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
  document.getElementById(`nav-${page}`)?.classList.add("active");
  currentPage = page;

  if (page === "today") {
    renderToday();
  }
  if (page === "log") {
    updateLogTabs();
    switchLogTab(state.foods.length ? "from-foods" : "ai-estimate");
    renderFoodPicker();
  }
  if (page === "history") {
    renderHistory();
  }

  updateFab();
}

function updateFab() {
  return;
}

function handleFab() {
  return;
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

function openLogFromToday() {
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
    list.innerHTML = "<div class=\"empty-state\"><div class=\"empty-icon\">Meal</div>No meals logged yet.<br>Tap Add Meal to log your first meal.</div>";
    return;
  }

  list.innerHTML = logs.slice().reverse().map((log) => `
    <div class="meal-item">
      <div>
        <div class="meal-name">${escHtml(getLogDisplayName(log))}</div>
        <div class="meal-meta">${Math.round(log.cal)} kcal · ${roundNutrient(log.pro)}g protein · ${roundNutrient(log.carb || 0)}g carbs · ${roundNutrient(log.fat || 0)}g fat</div>
      </div>
      <div class="meal-right">
        <button class="meal-edit" onclick="openEditLogModal('${log.id}')" title="Edit meal" aria-label="Edit ${escHtml(getLogDisplayName(log))}">✎</button>
        <button class="meal-del" onclick="deleteLog('${log.id}')" title="Remove">x</button>
      </div>
    </div>
  `).join("");
}

function getLogDisplayName(log) {
  if (!log) {
    return "";
  }
  if (log.quantity > 0 && log.portionName) {
    return buildCustomDisplayName({
      name: log.name || "",
      quantity: log.quantity,
      portionName: log.portionName
    });
  }
  return log.name || "";
}

function parseMealDisplayName(name) {
  const raw = String(name || "").trim();
  const match = raw.match(/^(.*?)(?:\s*\((.+)\))?$/);
  const baseName = match?.[1]?.trim() || raw;
  const detail = match?.[2]?.trim() || "";
  if (!detail) {
    return { name: baseName, quantity: 0, portionName: "" };
  }

  const quantityMatch = detail.match(/^(\d+(?:\.\d+)?)\s+(.+)$/);
  if (quantityMatch) {
    return {
      name: baseName,
      quantity: normalizePositiveNumber(quantityMatch[1], 0),
      portionName: quantityMatch[2].trim()
    };
  }

  return { name: baseName, quantity: 0, portionName: detail };
}

function openEditLogModal(id) {
  const log = state.logs.find((entry) => entry.id === id);
  if (!log) {
    showToast("Meal not found");
    return;
  }

  const parsed = log.quantity > 0 || log.portionName
    ? {
        name: log.name || "",
        quantity: normalizePositiveNumber(log.quantity, 0),
        portionName: log.portionName || ""
      }
    : parseMealDisplayName(log.name);
  editingLogId = id;
  document.getElementById("edit-log-name").value = parsed.name || "";
  document.getElementById("edit-log-cal").value = Math.round(log.cal || 0);
  document.getElementById("edit-log-pro").value = roundNutrient(log.pro || 0);
  document.getElementById("edit-log-carb").value = roundNutrient(log.carb || 0);
  document.getElementById("edit-log-fat").value = roundNutrient(log.fat || 0);
  document.getElementById("edit-log-quantity").value = parsed.quantity > 0 ? roundNutrient(parsed.quantity) : "";
  document.getElementById("edit-log-portion").value = parsed.portionName || "";
  document.getElementById("edit-log-status").textContent = "";
  document.getElementById("overlay-edit-log").classList.add("open");
}

function saveEditedLog() {
  if (!editingLogId) {
    return;
  }

  const status = document.getElementById("edit-log-status");
  const name = document.getElementById("edit-log-name").value.trim();
  const cal = normalizePositiveNumber(document.getElementById("edit-log-cal").value, -1);
  const pro = normalizePositiveNumber(document.getElementById("edit-log-pro").value, -1);
  const carb = normalizePositiveNumber(document.getElementById("edit-log-carb").value, -1);
  const fat = normalizePositiveNumber(document.getElementById("edit-log-fat").value, -1);
  const quantity = normalizePositiveNumber(document.getElementById("edit-log-quantity").value, 0);
  const portionName = document.getElementById("edit-log-portion").value.trim();

  if (!name) {
    status.textContent = "Enter a meal name.";
    return;
  }
  if (cal < 0 || pro < 0 || carb < 0 || fat < 0) {
    status.textContent = "Enter valid nutrition values.";
    return;
  }

  const index = state.logs.findIndex((entry) => entry.id === editingLogId);
  if (index < 0) {
    status.textContent = "Meal not found.";
    return;
  }

  state.logs[index] = {
    ...state.logs[index],
    name,
    quantity: roundNutrient(quantity),
    portionName,
    cal: roundNutrient(cal),
    pro: roundNutrient(pro),
    carb: roundNutrient(carb),
    fat: roundNutrient(fat)
  };

  saveState();
  renderToday();
  renderHistory();
  closeModal("edit-log");
  showToast("Meal updated");
  trackAmplitudeEvent("meal_edited", {
    has_quantity: quantity > 0,
    has_portion_name: !!portionName
  });
}

function deleteLog(id) {
  state.logs = state.logs.filter((entry) => entry.id !== id);
  saveState();
  renderToday();
  renderHistory();
  showToast("Meal removed");
  trackAmplitudeEvent("meal_deleted");
}

function openQuickTrackModal(mode) {
  quickTrackMode = mode;
  document.getElementById("quick-track-title").textContent = mode === "water" ? "Add Water" : "Add Steps";
  document.getElementById("quick-track-water-fields").classList.toggle("hidden", mode !== "water");
  document.getElementById("quick-track-steps-fields").classList.toggle("hidden", mode !== "steps");
  document.getElementById("quick-track-status").textContent = "";
  document.getElementById("quick-track-water-value").value = "";
  document.getElementById("quick-track-water-unit").value = "ml";
  document.getElementById("quick-track-steps-value").value = "";
  document.getElementById("overlay-quick-track").classList.add("open");
}

function submitQuickTrack() {
  const status = document.getElementById("quick-track-status");
  status.textContent = "";

  if (quickTrackMode === "water") {
    const rawAmount = normalizePositiveNumber(document.getElementById("quick-track-water-value").value, 0);
    const unit = document.getElementById("quick-track-water-unit").value;
    if (rawAmount <= 0) {
      status.textContent = "Enter a valid water amount.";
      return;
    }

    const amountL = unit === "ml" ? rawAmount / 1000 : rawAmount;
    state.waterLogs.push({
      id: uid(),
      date: todayStr(),
      amount: roundNutrient(amountL),
      unitId: "manual",
      unitName: "Manual"
    });
    saveState();
    renderToday();
    closeModal("quick-track");
    triggerWaterCelebration();
    showToast("Water added");
    trackAmplitudeEvent("water_added", {
      entry_method: "manual",
      amount_l: roundNutrient(amountL),
      source_unit: unit
    });
    return;
  }

  const amount = Math.round(normalizePositiveNumber(document.getElementById("quick-track-steps-value").value, 0));
  if (amount <= 0) {
    status.textContent = "Enter a valid step amount.";
    return;
  }

  state.stepLogs.push({
    id: uid(),
    date: todayStr(),
    amount
  });
  saveState();
  renderToday();
  closeModal("quick-track");
  triggerStepCelebration();
  showToast("Steps added");
  trackAmplitudeEvent("steps_added", { amount, entry_method: "manual" });
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
  trackAmplitudeEvent("water_added", { entry_method: normalizeFoodUnit(unit.name) || unit.name.toLowerCase(), amount_l: roundNutrient(unit.ml / 1000) });
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
    return;
  }

  if (hasFoods && !activeTab) {
    switchLogTab("from-foods");
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

  const portionName = formatFoodUnitLabel(selectedUnit, config.kind, amount);

  state.logs.push({
    id: uid(),
    date: todayStr(),
    name: food.name,
    quantity: roundNutrient(amount),
    portionName,
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
  trackAmplitudeEvent("meal_added", {
    entry_method: "my_foods",
    portion_kind: config.kind,
    has_quantity: true,
    has_portion_name: !!portionName
  });
  setTimeout(() => showPage("today"), 400);
}

async function requestAiEstimate(options = {}) {
  const query = (options.queryOverride || document.getElementById("ai-food-input").value.trim()).trim();
  const button = document.getElementById("ai-estimate-btn");

  if (!query) {
    setAiEstimateStatus("Enter a food description first.");
    return;
  }

  if (options.queryOverride) {
    document.getElementById("ai-food-input").value = query;
  }

  button.disabled = true;
  setAiEstimateStatus(options.statusMessage || "Estimating nutrition...");
  trackAmplitudeEvent("ai_estimate_requested", {
    request_source: options.requestSource || (options.queryOverride ? "photo" : "text")
  });

  try {
    const savedFood = findSavedFoodByDescription(query);
    if (savedFood) {
      hydrateAiEstimateFromPayload({
        food_name: savedFood.name,
        estimated_grams: savedFood.grams,
        calories: savedFood.cal,
        protein_g: savedFood.pro,
        carb_g: savedFood.carb || 0,
        fat_g: savedFood.fat || 0,
        base_quantity: savedFood.baseQuantity || 0,
        quantity_unit: savedFood.quantityUnit || "",
        portion_name: savedFood.quantityUnit && savedFood.baseQuantity > 0
          ? formatFoodUnitLabel(savedFood.quantityUnit, getFoodUnitKind(savedFood.quantityUnit), savedFood.baseQuantity)
          : "g",
        source_note: "Loaded from your saved My Foods entry instead of making a new AI request.",
        confidence: "high",
        note: "Matched an existing saved food with the same description."
      }, query, {
        statusText: "Loaded from My Foods. Adjust any values before saving."
      });
      trackAmplitudeEvent("ai_estimate_completed", {
        confidence: "high",
        has_source_note: true,
        request_source: "saved_food"
      });
      return;
    }

    const cachedEstimate = await fetchSharedAiCache(query);
    if (cachedEstimate) {
      hydrateAiEstimateFromPayload(cachedEstimate, query, {
        statusText: "Loaded from shared AI cache. Adjust any values before saving."
      });
      trackAmplitudeEvent("ai_estimate_completed", {
        confidence: activeAiEstimate.confidence,
        has_source_note: !!activeAiEstimate.sourceNote,
        request_source: "shared_cache"
      });
      return;
    }

    const payload = await postJsonExpectJson(
      AI_ESTIMATE_ENDPOINT,
      { query },
      "AI backend is not available on this deployment. /api/estimate-food is returning a page instead of JSON."
    );
    void saveSharedAiCache(query, payload);
    hydrateAiEstimateFromPayload(payload, query);
    trackAmplitudeEvent("ai_estimate_completed", {
      confidence: activeAiEstimate.confidence,
      has_source_note: !!activeAiEstimate.sourceNote,
      request_source: options.requestSource || (options.queryOverride ? "photo" : "text")
    });
  } catch (error) {
    console.error("AI estimate failed", error);
    setAiEstimateStatus(/expected pattern/i.test(error?.message || "")
      ? "AI estimate returned an invalid value. Please try again."
      : (error.message || "Estimate failed"));
  } finally {
    button.disabled = false;
  }
}

function openAiPhotoPicker(source) {
  const inputId = source === "camera" ? "ai-photo-camera-input" : "ai-photo-library-input";
  document.getElementById(inputId)?.click();
}

async function handleAiPhotoSelected(event) {
  const input = event?.target;
  const file = input?.files?.[0];
  if (!file) {
    return;
  }

  try {
    await identifyMealFromPhoto(file);
  } finally {
    input.value = "";
  }
}

async function identifyMealFromPhoto(file) {
  const cameraButton = document.getElementById("ai-photo-camera-btn");
  const libraryButton = document.getElementById("ai-photo-library-btn");
  const estimateButton = document.getElementById("ai-estimate-btn");

  if (!file.type.startsWith("image/")) {
    setAiEstimateStatus("Choose a valid meal image first.");
    return;
  }

  cameraButton.disabled = true;
  libraryButton.disabled = true;
  estimateButton.disabled = true;
  setAiEstimateStatus("Reading your photo...");

  try {
    const dataUrl = await fileToResizedDataUrl(file);
    activeAiPhoto = { name: file.name || "meal-photo", dataUrl };
    renderAiPhotoPreview({ title: "Meal image ready", copy: "Looking at the photo to build a food description..." });

    const payload = await postJsonExpectJson(
      AI_IMAGE_ENDPOINT,
      { image_data_url: dataUrl },
      "AI backend is not available on this deployment. /api/identify-food-image is returning a page instead of JSON."
    );

    const detectedDescription = String(payload.description || "").trim();
    if (!detectedDescription) {
      throw new Error("AI could not identify a food description from that image.");
    }

    document.getElementById("ai-food-input").value = detectedDescription;
    renderAiPhotoPreview({
      title: payload.detected_name || "Photo recognized",
      copy: `Detected: ${detectedDescription}${payload.note ? ` • ${payload.note}` : ""}`
    });
    trackAmplitudeEvent("ai_photo_identified", {
      confidence: payload.confidence || "medium",
      has_quantity_guess: normalizePositiveNumber(payload.quantity, 0) > 0,
      has_portion_name: !!payload.portion_name
    });

    await requestAiEstimate({
      queryOverride: detectedDescription,
      statusMessage: "Photo recognized. Estimating nutrition...",
      requestSource: "photo"
    });
  } catch (error) {
    console.error("AI image identification failed", error);
    setAiEstimateStatus(error.message || "Image recognition failed");
  } finally {
    cameraButton.disabled = false;
    libraryButton.disabled = false;
    estimateButton.disabled = false;
  }
}

function renderAiPhotoPreview(preview = null) {
  const wrap = document.getElementById("ai-photo-preview");
  const image = document.getElementById("ai-photo-preview-image");
  const title = document.getElementById("ai-photo-preview-title");
  const copy = document.getElementById("ai-photo-preview-copy");
  if (!wrap || !image || !title || !copy) {
    return;
  }

  if (!activeAiPhoto) {
    wrap.classList.add("hidden");
    image.removeAttribute("src");
    title.textContent = "Meal image ready";
    copy.textContent = "AI can turn this photo into a food description before estimating nutrition.";
    return;
  }

  image.src = activeAiPhoto.dataUrl;
  title.textContent = preview?.title || "Meal image ready";
  copy.textContent = preview?.copy || "AI can turn this photo into a food description before estimating nutrition.";
  wrap.classList.remove("hidden");
}

function clearAiPhotoSelection() {
  activeAiPhoto = null;
  renderAiPhotoPreview();
}

function setAiEstimateStatus(message, showInfo = false) {
  const statusNode = document.getElementById("ai-estimate-status");
  const infoButton = document.getElementById("ai-estimate-info-btn");
  const sourceCopy = document.getElementById("ai-estimate-sources-copy");
  const hasSourceNote = !!activeAiEstimate?.sourceNote;
  if (statusNode) {
    statusNode.textContent = message || "";
  }
  if (sourceCopy) {
    sourceCopy.textContent = activeAiEstimate?.sourceNote || "Waiting for the AI estimate basis.";
  }
  infoButton?.classList.toggle("hidden", !(showInfo && hasSourceNote));
  if (!(showInfo && hasSourceNote)) {
    document.getElementById("ai-estimate-sources-popover")?.classList.add("hidden");
  }
}

function toggleAiEstimateSourcesInfo() {
  document.getElementById("ai-estimate-sources-popover")?.classList.toggle("hidden");
}

function fileToResizedDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const maxSide = 1440;
        const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("Image processing is not available in this browser."));
          return;
        }
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.86));
      };
      image.onerror = () => reject(new Error("Image could not be read."));
      image.src = typeof reader.result === "string" ? reader.result : "";
    };
    reader.onerror = () => reject(new Error("Image could not be read."));
    reader.readAsDataURL(file);
  });
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
  setNumericInputValue("ai-quantity", getAiVisibleQuantity(), (next) => String(roundNutrient(next)));
  portionInput.value = getAiPortionUnitLabel();
  setNumericInputValue("ai-grams", activeAiEstimate.baseGrams, (next) => String(Math.round(next)));
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
  setNumericInputValue("ai-grams", grams, (next) => String(Math.round(next)));
  setNumericInputValue("ai-calories", activeAiEstimate.baseCalories * ratio, (next) => String(Math.round(next)));
  setNumericInputValue("ai-protein", activeAiEstimate.baseProtein * ratio, (next) => String(roundNutrient(next)));
  setNumericInputValue("ai-carb", activeAiEstimate.baseCarb * ratio, (next) => String(roundNutrient(next)));
  setNumericInputValue("ai-fat", activeAiEstimate.baseFat * ratio, (next) => String(roundNutrient(next)));
  document.getElementById("ai-serving-label").value = getAiPortionUnitLabel(quantity);
}

function syncEstimateFromGrams() {
  if (!activeAiEstimate) {
    return;
  }

  const grams = normalizePositiveNumber(document.getElementById("ai-grams").value, activeAiEstimate.baseGrams);
  const ratio = activeAiEstimate.baseGrams > 0 ? grams / activeAiEstimate.baseGrams : 1;
  setNumericInputValue("ai-calories", activeAiEstimate.baseCalories * ratio, (next) => String(Math.round(next)));
  setNumericInputValue("ai-protein", activeAiEstimate.baseProtein * ratio, (next) => String(roundNutrient(next)));
  setNumericInputValue("ai-carb", activeAiEstimate.baseCarb * ratio, (next) => String(roundNutrient(next)));
  setNumericInputValue("ai-fat", activeAiEstimate.baseFat * ratio, (next) => String(roundNutrient(next)));
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
  clearAiPhotoSelection();
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
  setAiEstimateStatus("");
  document.getElementById("ai-estimate-editor").classList.add("hidden");
  document.getElementById("ai-save-to-foods").checked = false;
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
    quantity: roundNutrient(values.quantity),
    portionName: values.portionName,
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
  trackAmplitudeEvent("meal_added", {
    entry_method: "ai",
    has_quantity: values.quantity > 0,
    has_portion_name: !!values.portionName,
    saved_to_my_foods: !!shouldSave
  });
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
  upsertFoodRecord(normalizeFoodForLibrary({
    name: values.name,
    grams: values.grams,
    baseQuantity,
    quantityUnit,
    cal: roundNutrient(values.calories),
    pro: roundNutrient(values.protein),
    carb: roundNutrient(values.carb),
    fat: roundNutrient(values.fat)
  }));
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

  state.logs.push({
    id: uid(),
    date: todayStr(),
    name: values.name,
    quantity: roundNutrient(values.quantity),
    portionName: values.portionName,
    cal: values.cal,
    pro: values.pro,
    carb: values.carb,
    fat: values.fat
  });
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
  trackAmplitudeEvent("meal_added", {
    entry_method: "custom",
    has_quantity: values.quantity > 0,
    has_portion_name: !!values.portionName,
    saved_to_my_foods: !!shouldSave
  });
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
  upsertFoodRecord(normalizeFoodForLibrary({
    name: values.name,
    grams: Math.max(1, roundNutrient(grams)),
    baseQuantity: quantityMeta.baseQuantity || 0,
    quantityUnit: quantityMeta.quantityUnit || "",
    cal: roundNutrient(values.cal),
    pro: roundNutrient(values.pro),
    carb: roundNutrient(values.carb),
    fat: roundNutrient(values.fat)
  }));
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
  trackAmplitudeEvent("goals_saved");
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
  document.getElementById("ai-estimate-sources-popover")?.classList.add("hidden");
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
  if (name === "edit-log") {
    editingLogId = null;
    document.getElementById("edit-log-status").textContent = "";
  }
  if (name === "quick-track") {
    document.getElementById("quick-track-status").textContent = "";
  }
}

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2000);
}

function formatSupabaseError(error) {
  if (!error) {
    return "Unknown error";
  }
  const message = typeof error.message === "string" && error.message.trim() ? error.message.trim() : "";
  const details = typeof error.details === "string" && error.details.trim() ? error.details.trim() : "";
  const hint = typeof error.hint === "string" && error.hint.trim() ? error.hint.trim() : "";
  const code = typeof error.code === "string" && error.code.trim() ? error.code.trim() : "";
  return message || details || hint || code || String(error);
}

function withTimeout(promise, timeoutMs, message) {
  let timerId;
  return Promise.race([
    promise.finally(() => clearTimeout(timerId)),
    new Promise((_, reject) => {
      timerId = window.setTimeout(() => reject(new Error(message)), timeoutMs);
    })
  ]);
}

window.addEventListener("error", (event) => {
  const message = event?.error?.message || event?.message;
  if (message) {
    console.error("Startup runtime error", event.error || message);
    showStartupFailure(message);
  }
});

window.addEventListener("unhandledrejection", (event) => {
  const reason = event?.reason;
  const message = reason?.message || String(reason || "");
  if (message) {
    console.error("Startup unhandled rejection", reason);
    showStartupFailure(message);
  }
});

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
      let hasPendingRefresh = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (hasPendingRefresh) {
          return;
        }
        hasPendingRefresh = true;
        window.location.reload();
      });

      const registration = await navigator.serviceWorker.register("./sw.js");
      if (registration.waiting) {
        registration.waiting.postMessage({ type: "SKIP_WAITING" });
      }
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        if (!worker) {
          return;
        }
        worker.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) {
            worker.postMessage({ type: "SKIP_WAITING" });
          }
        });
      });
      registration.update().catch(() => {});
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

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  updateInstallUi();
});

window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  updateInstallUi();
  closeModal("install");
  trackAmplitudeEvent("install_completed");
});

document.addEventListener("DOMContentLoaded", () => {
  isGuestMode = getSavedAuthPreference() === "guest";
  setStartupStatus("Loading your data...");
  loadState();
  renderApp();
  updateAuthUi();
  window.setTimeout(() => {
    startupDelayDone = true;
    finishStartupIfReady();
  }, 1000);
  registerServiceWorker();
  updateInstallUi();
  initializeSupabase().catch((error) => {
    console.error("Supabase initialization failed", error);
    document.getElementById("auth-status").textContent = error.message || "Failed to initialize authentication.";
    showStartupFailure(error.message || "Failed to initialize authentication.");
    startupAuthReady = true;
    finishStartupIfReady();
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

  document.getElementById("auth-reset-password")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      completePasswordReset();
    }
  });

  document.getElementById("auth-reset-password-confirm")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      completePasswordReset();
    }
  });

  document.getElementById("ai-quantity")?.addEventListener("input", syncEstimateFromQuantity);
  document.getElementById("ai-grams")?.addEventListener("input", syncEstimateFromGrams);
  document.getElementById("goal-height-unit")?.addEventListener("change", toggleHeightInputs);
  toggleHeightInputs();

  document.addEventListener("touchstart", handlePullTouchStart, { passive: true });
  document.addEventListener("touchmove", handlePullTouchMove, { passive: false });
  document.addEventListener("touchend", handlePullTouchEnd, { passive: true });
  document.addEventListener("touchcancel", handlePullTouchEnd, { passive: true });
});

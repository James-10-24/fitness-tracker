(function () {
  const HEALTH_DISCLAIMER = "Hale helps you track and understand your health data. This is not medical advice. Always discuss your results with a qualified healthcare professional.";
  const HEALTH_ANALYSIS_ENDPOINT = "/api/analyze-blood-test";
  const HEALTH_PROFILE_HEIGHT_KEY = "hale_profile_height_cm";
  const MEDICATION_NOTIFICATION_CACHE_KEY = "hale_health_notification_cache";
  const HEALTH_TABS = ["blood", "body", "medications", "visits"];
  const BLOOD_CATEGORY_ORDER = ["cholesterol", "glucose", "blood_count", "liver_kidney", "thyroid", "vitamins_minerals", "custom"];
  const BLOOD_CATEGORY_LABELS = {
    cholesterol: "Cholesterol",
    glucose: "Glucose",
    blood_count: "Full Blood Count",
    liver_kidney: "Liver & Kidney",
    thyroid: "Thyroid",
    vitamins_minerals: "Vitamins & Minerals",
    custom: "Custom"
  };
  const MEDICATION_TYPE_COLORS = {
    prescription: "health-med-card--prescription",
    supplement: "health-med-card--supplement",
    otc: "health-med-card--otc"
  };
  const MEDICATION_FREQUENCY_LABELS = {
    daily: "Daily",
    twice_daily: "Twice daily",
    three_times_daily: "Three times daily",
    weekly: "Weekly",
    as_needed: "As needed",
    custom: "Custom"
  };

  const BUILTIN_BLOOD_MARKERS = [
    markerDef("cholesterol-total", "cholesterol", "Total Cholesterol", "mmol/L", 0, 5.2),
    markerDef("cholesterol-ldl", "cholesterol", "LDL Cholesterol", "mmol/L", 0, 3.4),
    markerDef("cholesterol-hdl", "cholesterol", "HDL Cholesterol", "mmol/L", 1.0, 3.5),
    markerDef("cholesterol-triglycerides", "cholesterol", "Triglycerides", "mmol/L", 0, 1.7),
    markerDef("cholesterol-non-hdl", "cholesterol", "Non-HDL", "mmol/L", 0, 4.0),
    markerDef("glucose-fasting", "glucose", "Fasting Glucose", "mmol/L", 3.9, 6.1),
    markerDef("glucose-hba1c", "glucose", "HbA1c", "%", 4.0, 5.6),
    markerDef("glucose-random", "glucose", "Random Glucose", "mmol/L", 3.9, 7.8),
    markerDef("blood-haemoglobin", "blood_count", "Haemoglobin", "g/dL", 12.0, 17.5),
    markerDef("blood-haematocrit", "blood_count", "Haematocrit", "%", 36, 53),
    markerDef("blood-wbc", "blood_count", "White Blood Cells", "×10⁹/L", 4.5, 11.0),
    markerDef("blood-platelets", "blood_count", "Platelets", "×10⁹/L", 150, 400),
    markerDef("blood-rbc", "blood_count", "Red Blood Cells", "×10¹²/L", 4.1, 5.9),
    markerDef("liver-alt", "liver_kidney", "ALT", "U/L", 7, 56),
    markerDef("liver-ast", "liver_kidney", "AST", "U/L", 10, 40),
    markerDef("liver-ggt", "liver_kidney", "GGT", "U/L", 9, 48),
    markerDef("liver-alp", "liver_kidney", "Alkaline Phosphatase", "U/L", 44, 147),
    markerDef("liver-creatinine", "liver_kidney", "Creatinine", "µmol/L", 53, 115),
    markerDef("liver-egfr", "liver_kidney", "eGFR", "mL/min", 60, null),
    markerDef("liver-uric-acid", "liver_kidney", "Uric Acid", "µmol/L", 140, 430),
    markerDef("thyroid-tsh", "thyroid", "TSH", "mIU/L", 0.4, 4.0),
    markerDef("thyroid-ft3", "thyroid", "Free T3", "pmol/L", 3.1, 6.8),
    markerDef("thyroid-ft4", "thyroid", "Free T4", "pmol/L", 12, 22),
    markerDef("vitd", "vitamins_minerals", "Vitamin D (25-OH)", "nmol/L", 50, 125),
    markerDef("vitb12", "vitamins_minerals", "Vitamin B12", "pmol/L", 148, 738),
    markerDef("folate", "vitamins_minerals", "Folate", "nmol/L", 7, 45),
    markerDef("ferritin", "vitamins_minerals", "Ferritin", "µg/L", 13, 400),
    markerDef("serum-iron", "vitamins_minerals", "Serum Iron", "µmol/L", 9, 30),
    markerDef("tibc", "vitamins_minerals", "TIBC", "µmol/L", 45, 81)
  ];

  let healthTab = "blood";
  let bloodTestsExpanded = new Set();
  let bloodInsightExpanded = new Set();
  let bodyRangeMode = "90d";
  let medicationExpanded = new Set();
  let visitExpanded = new Set();
  let editingBloodTestId = null;
  let editingBodyMetricId = null;
  let editingMedicationId = null;
  let editingVisitId = null;
  let bloodPhotoDraft = "";
  let visitAttachmentDrafts = [];
  let bloodFormStep = 1;
  let medicationHoldTimer = null;
  let notificationTickerStarted = false;

  function markerDef(id, category, name, unit, referenceMin, referenceMax) {
    return { id, category, name, unit, referenceMin, referenceMax };
  }

  function ensureHealthScaffold() {
    const pageToday = document.getElementById("page-today");
    if (pageToday && !document.getElementById("today-health-card")) {
      const cards = pageToday.querySelectorAll(".card");
      const anchor = cards[1] || cards[0] || null;
      const wrapper = document.createElement("div");
      wrapper.className = "card card-clickable hidden";
      wrapper.id = "today-health-card";
      wrapper.setAttribute("role", "button");
      wrapper.setAttribute("tabindex", "0");
      wrapper.onclick = () => openHealthFromToday();
      wrapper.onkeydown = (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openHealthFromToday();
        }
      };
      wrapper.innerHTML = '<div class="card-label">Health Summary</div><div id="today-health-card-content"></div>';
      if (anchor?.parentNode) {
        anchor.parentNode.insertBefore(wrapper, anchor);
      } else {
        pageToday.appendChild(wrapper);
      }
    }

    if (!document.getElementById("page-health")) {
      const page = document.createElement("div");
      page.className = "page";
      page.id = "page-health";
      page.innerHTML = `
        <div class="page-header">
          <div class="page-title serif">Health</div>
          <div class="page-subtitle">Track labs, body metrics, medications, and visits</div>
        </div>
        <div class="tab-row health-tab-row">
          <button class="tab-pill active" id="health-tab-blood" type="button" onclick="switchHealthTab('blood')">Blood Tests</button>
          <button class="tab-pill" id="health-tab-body" type="button" onclick="switchHealthTab('body')">Body</button>
          <button class="tab-pill" id="health-tab-medications" type="button" onclick="switchHealthTab('medications')">Medications</button>
          <button class="tab-pill" id="health-tab-visits" type="button" onclick="switchHealthTab('visits')">Visits</button>
        </div>
        <div id="health-content"></div>
      `;
      document.body.insertBefore(page, document.querySelector("nav.nav"));
    }

    const nav = document.querySelector("nav.nav");
    if (nav && !document.getElementById("nav-health")) {
      const button = document.createElement("button");
      button.className = "nav-btn";
      button.id = "nav-health";
      button.type = "button";
      button.onclick = () => showPage("health");
      button.innerHTML = `
        <div class="nav-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h4l2-4 4 8 2-4h4"/><path d="M12 21C7 17 4 13.8 4 9.8A4.8 4.8 0 0 1 12 6a4.8 4.8 0 0 1 8 3.8C20 13.8 17 17 12 21Z"/></svg>
        </div>
        Health
      `;
      nav.insertBefore(button, document.getElementById("nav-history") || null);
    }

    if (!document.getElementById("overlay-health-blood")) {
      document.body.insertAdjacentHTML("beforeend", `
        <div class="overlay" id="overlay-health-blood" onclick="closeModal('health-blood')">
          <div class="sheet health-sheet" onclick="event.stopPropagation()">
            <div class="sheet-handle"></div>
            <div class="sheet-title" id="health-blood-title">Add Blood Test</div>
            <div class="health-stepper">
              <button class="health-step active" id="health-blood-step-1" type="button" onclick="setBloodFormStep(1)">1. Report</button>
              <button class="health-step" id="health-blood-step-2" type="button" onclick="setBloodFormStep(2)">2. Markers</button>
              <button class="health-step" id="health-blood-step-3" type="button" onclick="setBloodFormStep(3)">3. Review</button>
            </div>
            <div class="health-step-view" id="health-blood-view-1">
              <div class="form-group"><label class="form-label" for="health-blood-date">Date</label><input class="form-input" id="health-blood-date" type="date"></div>
              <div class="form-group"><label class="form-label" for="health-blood-lab">Lab Name</label><input class="form-input" id="health-blood-lab" placeholder="Optional"></div>
              <div class="form-group"><label class="form-label" for="health-blood-notes">Notes</label><textarea class="form-input health-textarea" id="health-blood-notes" placeholder="Anything you want to remember about this report"></textarea></div>
              <div class="health-upload-actions">
                <button class="btn btn-secondary" type="button" onclick="document.getElementById('health-blood-photo-input').click()">Attach Report Photo</button>
                <input class="hidden" id="health-blood-photo-input" type="file" accept="image/*" onchange="handleBloodReportPhoto(event)">
              </div>
              <div id="health-blood-photo-preview"></div>
            </div>
            <div class="health-step-view hidden" id="health-blood-view-2">
              <div class="health-disclaimer">${escHtml(HEALTH_DISCLAIMER)}</div>
              <div id="health-blood-marker-editor"></div>
            </div>
            <div class="health-step-view hidden" id="health-blood-view-3">
              <div class="health-disclaimer">${escHtml(HEALTH_DISCLAIMER)}</div>
              <div class="health-review-card" id="health-blood-review"></div>
            </div>
            <div class="api-status" id="health-blood-status"></div>
            <div class="health-sheet-actions">
              <button class="btn btn-secondary" id="health-blood-back-btn" type="button" onclick="goBloodFormStep(-1)">Back</button>
              <button class="btn btn-primary" id="health-blood-next-btn" type="button" onclick="goBloodFormStep(1)">Next</button>
              <button class="btn btn-primary hidden" id="health-blood-save-btn" type="button" onclick="saveBloodTestReport()">Save Report</button>
            </div>
          </div>
        </div>

        <div class="overlay" id="overlay-health-body" onclick="closeModal('health-body')">
          <div class="sheet health-sheet" onclick="event.stopPropagation()">
            <div class="sheet-handle"></div>
            <div class="sheet-title" id="health-body-title">Log Body Entry</div>
            <div class="form-group"><label class="form-label" for="health-body-date">Date</label><input class="form-input" id="health-body-date" type="date"></div>
            <div class="form-row">
              <div class="form-group"><label class="form-label" for="health-body-weight">Weight (kg)</label><input class="form-input" id="health-body-weight" type="number" step="0.1"></div>
              <div class="form-group"><label class="form-label" for="health-body-fat">Body Fat (%)</label><input class="form-input" id="health-body-fat" type="number" step="0.1"></div>
            </div>
            <div class="form-row">
              <div class="form-group"><label class="form-label" for="health-body-muscle">Muscle Mass (kg)</label><input class="form-input" id="health-body-muscle" type="number" step="0.1"></div>
              <div class="form-group"><label class="form-label" for="health-body-waist">Waist (cm)</label><input class="form-input" id="health-body-waist" type="number" step="0.1"></div>
            </div>
            <div class="form-group"><label class="form-label" for="health-body-notes">Notes</label><textarea class="form-input health-textarea" id="health-body-notes"></textarea></div>
            <div class="api-status" id="health-body-status"></div>
            <div class="health-sheet-actions">
              <button class="btn btn-primary" type="button" onclick="saveBodyMetricEntry()">Save Entry</button>
              <button class="btn btn-secondary" type="button" onclick="closeModal('health-body')">Cancel</button>
            </div>
          </div>
        </div>

        <div class="overlay" id="overlay-health-medication" onclick="closeModal('health-medication')">
          <div class="sheet health-sheet" onclick="event.stopPropagation()">
            <div class="sheet-handle"></div>
            <div class="sheet-title" id="health-medication-title">Add Medication</div>
            <div class="form-group"><label class="form-label" for="health-med-name">Name</label><input class="form-input" id="health-med-name"></div>
            <div class="form-row">
              <div class="form-group"><label class="form-label" for="health-med-type">Type</label><select class="form-input" id="health-med-type"><option value="prescription">Prescription</option><option value="supplement">Supplement</option><option value="otc">OTC</option></select></div>
              <div class="form-group"><label class="form-label" for="health-med-dose">Dose</label><input class="form-input" id="health-med-dose" placeholder="500mg"></div>
            </div>
            <div class="form-row">
              <div class="form-group"><label class="form-label" for="health-med-frequency">Frequency</label><select class="form-input" id="health-med-frequency" onchange="toggleMedicationCustomFrequency()"><option value="daily">Daily</option><option value="twice_daily">Twice daily</option><option value="three_times_daily">Three times daily</option><option value="weekly">Weekly</option><option value="as_needed">As needed</option><option value="custom">Custom</option></select></div>
              <div class="form-group hidden" id="health-med-custom-frequency-group"><label class="form-label" for="health-med-custom-frequency">Custom Frequency</label><input class="form-input" id="health-med-custom-frequency"></div>
            </div>
            <div class="form-row">
              <div class="form-group"><label class="form-label" for="health-med-start">Start Date</label><input class="form-input" id="health-med-start" type="date"></div>
              <div class="form-group"><label class="form-label" for="health-med-end">End Date</label><input class="form-input" id="health-med-end" type="date"></div>
            </div>
            <label class="checkbox-row" for="health-med-reminder-enabled"><input id="health-med-reminder-enabled" type="checkbox" onchange="toggleMedicationReminderFields()"><span>Enable reminders</span></label>
            <div class="form-group hidden" id="health-med-reminder-group"><label class="form-label" for="health-med-reminder-times">Reminder Times</label><input class="form-input" id="health-med-reminder-times" placeholder="08:00, 20:00"></div>
            <div class="form-row">
              <div class="form-group"><label class="form-label" for="health-med-refill-date">Refill Date</label><input class="form-input" id="health-med-refill-date" type="date"></div>
              <div class="form-group"><label class="form-label" for="health-med-refill-qty">Pills Remaining</label><input class="form-input" id="health-med-refill-qty" type="number" step="1"></div>
            </div>
            <div class="form-group"><label class="form-label" for="health-med-instructions">Instructions</label><textarea class="form-input health-textarea" id="health-med-instructions"></textarea></div>
            <div class="form-group"><label class="form-label" for="health-med-side-effects">Side Effects / Notes</label><textarea class="form-input health-textarea" id="health-med-side-effects"></textarea></div>
            <div class="form-group"><label class="form-label" for="health-med-prescribed-by">Prescribed By</label><input class="form-input" id="health-med-prescribed-by"></div>
            <div class="api-status" id="health-med-status"></div>
            <div class="health-sheet-actions">
              <button class="btn btn-primary" type="button" onclick="saveMedication()">Save Medication</button>
              <button class="btn btn-secondary" type="button" onclick="closeModal('health-medication')">Cancel</button>
            </div>
          </div>
        </div>

        <div class="overlay" id="overlay-health-visit" onclick="closeModal('health-visit')">
          <div class="sheet health-sheet" onclick="event.stopPropagation()">
            <div class="sheet-handle"></div>
            <div class="sheet-title" id="health-visit-title">Add Doctor Visit</div>
            <div class="form-row">
              <div class="form-group"><label class="form-label" for="health-visit-date">Date</label><input class="form-input" id="health-visit-date" type="date"></div>
              <div class="form-group"><label class="form-label" for="health-visit-followup">Follow-Up Date</label><input class="form-input" id="health-visit-followup" type="date"></div>
            </div>
            <div class="form-row">
              <div class="form-group"><label class="form-label" for="health-visit-doctor">Doctor Name</label><input class="form-input" id="health-visit-doctor"></div>
              <div class="form-group"><label class="form-label" for="health-visit-specialty">Specialty</label><input class="form-input" id="health-visit-specialty"></div>
            </div>
            <div class="form-group"><label class="form-label" for="health-visit-clinic">Clinic</label><input class="form-input" id="health-visit-clinic"></div>
            <div class="form-group"><label class="form-label" for="health-visit-reason">Reason</label><input class="form-input" id="health-visit-reason"></div>
            <div class="form-group"><label class="form-label" for="health-visit-diagnosis">Diagnosis</label><input class="form-input" id="health-visit-diagnosis"></div>
            <div class="form-group"><label class="form-label" for="health-visit-notes">Notes</label><textarea class="form-input health-textarea" id="health-visit-notes"></textarea></div>
            <div class="form-group"><label class="form-label">Linked Blood Tests</label><div id="health-visit-report-links" class="health-checkbox-list"></div></div>
            <div class="health-upload-actions">
              <button class="btn btn-secondary" type="button" onclick="document.getElementById('health-visit-attachment-input').click()">Attach Photos</button>
              <input class="hidden" id="health-visit-attachment-input" type="file" accept="image/*" multiple onchange="handleVisitAttachments(event)">
            </div>
            <div id="health-visit-attachment-preview" class="health-thumb-grid"></div>
            <div class="api-status" id="health-visit-status"></div>
            <div class="health-sheet-actions">
              <button class="btn btn-primary" type="button" onclick="saveDoctorVisit()">Save Visit</button>
              <button class="btn btn-secondary" type="button" onclick="closeModal('health-visit')">Cancel</button>
            </div>
          </div>
        </div>
      `);
    }
  }

  const originalCreateInitialState = createInitialState;
  createInitialState = function () {
    return {
      ...originalCreateInitialState(),
      bloodTests: [],
      bodyMetrics: [],
      medications: [],
      medicationLogs: [],
      doctorVisits: []
    };
  };

  const originalNormalizeAppState = normalizeAppState;
  normalizeAppState = function (rawState) {
    const nextState = originalNormalizeAppState(rawState);
    nextState.bloodTests = Array.isArray(nextState.bloodTests) ? nextState.bloodTests.map(normalizeBloodTestReport) : [];
    nextState.bodyMetrics = Array.isArray(nextState.bodyMetrics) ? nextState.bodyMetrics.map(normalizeBodyMetricEntry) : [];
    nextState.medications = Array.isArray(nextState.medications) ? nextState.medications.map(normalizeMedication) : [];
    nextState.medicationLogs = Array.isArray(nextState.medicationLogs) ? nextState.medicationLogs.map(normalizeMedicationLog) : [];
    nextState.doctorVisits = Array.isArray(nextState.doctorVisits) ? nextState.doctorVisits.map(normalizeDoctorVisit) : [];
    return nextState;
  };

  state = normalizeAppState(state);

  const originalRenderApp = renderApp;
  renderApp = function () {
    originalRenderApp();
    renderTodayHealthCard();
    renderHealthPage();
    maybeSendHealthNotifications();
  };

  const originalShowPage = showPage;
  showPage = function (page) {
    originalShowPage(page);
    if (page === "health") {
      renderHealthPage();
    }
  };

  const originalCloseModal = closeModal;
  closeModal = function (name) {
    originalCloseModal(name);
    if (name === "health-blood") {
      editingBloodTestId = null;
      bloodPhotoDraft = "";
      bloodFormStep = 1;
    }
    if (name === "health-body") {
      editingBodyMetricId = null;
    }
    if (name === "health-medication") {
      editingMedicationId = null;
    }
    if (name === "health-visit") {
      editingVisitId = null;
      visitAttachmentDrafts = [];
    }
  };

  const originalSaveGoals = saveGoals;
  saveGoals = function () {
    persistHealthProfileHeight();
    originalSaveGoals();
  };

  const originalSuggestGoals = suggestGoals;
  suggestGoals = async function () {
    persistHealthProfileHeight();
    return await originalSuggestGoals();
  };

  const originalSyncStateToCloud = syncStateToCloud;
  syncStateToCloud = async function () {
    await originalSyncStateToCloud();
    if (!supabaseClient || !currentUser) {
      return;
    }
    const userId = currentUser.id;
    await Promise.all([
      replaceUserRows("health_blood_tests", state.bloodTests.map((report) => ({
        id: report.id,
        user_id: userId,
        date: report.date,
        lab_name: report.labName || "",
        notes: report.notes || "",
        photo_url: report.photoUrl || "",
        markers: report.markers || [],
        ai_summary: report.aiSummary || null,
        created_at: report.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString()
      }))),
      replaceUserRows("health_body_metrics", state.bodyMetrics.map((entry) => ({
        id: entry.id,
        user_id: userId,
        date: entry.date,
        weight_kg: nullableNumber(entry.weightKg),
        body_fat_percent: nullableNumber(entry.bodyFatPercent),
        bmi: nullableNumber(entry.bmi),
        muscle_mass_kg: nullableNumber(entry.muscleMassKg),
        waist_cm: nullableNumber(entry.waistCm),
        notes: entry.notes || "",
        created_at: entry.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString()
      }))),
      replaceUserRows("health_medications", state.medications.map((item) => ({
        id: item.id,
        user_id: userId,
        name: item.name,
        type: item.type,
        dose: item.dose,
        frequency: item.frequency,
        custom_frequency: item.customFrequency || "",
        start_date: item.startDate,
        end_date: item.endDate || null,
        reminder_enabled: !!item.reminderEnabled,
        reminder_times: item.reminderTimes || [],
        refill_date: item.refillDate || null,
        refill_qty: nullableNumber(item.refillQty),
        instructions: item.instructions || "",
        side_effects: item.sideEffects || "",
        prescribed_by: item.prescribedBy || "",
        is_active: !!item.isActive,
        created_at: item.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString()
      }))),
      replaceUserRows("health_medication_logs", state.medicationLogs.map((log) => ({
        id: log.id,
        user_id: userId,
        medication_id: log.medicationId,
        taken_at: log.takenAt,
        dose_taken: log.doseTaken || "",
        notes: log.notes || "",
        created_at: log.created_at || new Date().toISOString()
      }))),
      replaceUserRows("health_doctor_visits", state.doctorVisits.map((visit) => ({
        id: visit.id,
        user_id: userId,
        date: visit.date,
        doctor_name: visit.doctorName || "",
        specialty: visit.specialty || "",
        clinic: visit.clinic || "",
        reason: visit.reason || "",
        diagnosis: visit.diagnosis || "",
        notes: visit.notes || "",
        follow_up_date: visit.followUpDate || null,
        attachments: visit.attachments || [],
        linked_report_ids: visit.linkedReportIds || [],
        created_at: visit.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString()
      })))
    ]);
  };

  const originalLoadUserState = loadUserState;
  loadUserState = async function (userId) {
    let localBefore = createInitialState();
    try {
      const raw = readCachedState(userId);
      localBefore = raw ? normalizeAppState(JSON.parse(raw)) : createInitialState();
    } catch (error) {
      console.error("Failed to read local health cache", error);
    }

    await originalLoadUserState(userId);
    if (!supabaseClient || !userId) {
      return;
    }

    const [bloodResult, bodyResult, medicationsResult, medicationLogsResult, visitsResult] = await Promise.all([
      supabaseClient.from("health_blood_tests").select("*").eq("user_id", userId).order("date", { ascending: false }),
      supabaseClient.from("health_body_metrics").select("*").eq("user_id", userId).order("date", { ascending: false }),
      supabaseClient.from("health_medications").select("*").eq("user_id", userId).order("created_at", { ascending: true }),
      supabaseClient.from("health_medication_logs").select("*").eq("user_id", userId).order("taken_at", { ascending: false }),
      supabaseClient.from("health_doctor_visits").select("*").eq("user_id", userId).order("date", { ascending: false })
    ]);

    const errors = [bloodResult.error, bodyResult.error, medicationsResult.error, medicationLogsResult.error, visitsResult.error].filter(Boolean);
    if (errors.length) {
      throw errors[0];
    }

    const remoteBlood = (bloodResult.data || []).map((row) => normalizeBloodTestReport({
      id: row.id,
      date: row.date,
      labName: row.lab_name,
      notes: row.notes,
      photoUrl: row.photo_url,
      markers: row.markers,
      aiSummary: row.ai_summary,
      created_at: row.created_at,
      updated_at: row.updated_at
    }));
    const remoteBody = (bodyResult.data || []).map((row) => normalizeBodyMetricEntry({
      id: row.id,
      date: row.date,
      weightKg: row.weight_kg,
      bodyFatPercent: row.body_fat_percent,
      bmi: row.bmi,
      muscleMassKg: row.muscle_mass_kg,
      waistCm: row.waist_cm,
      notes: row.notes,
      created_at: row.created_at,
      updated_at: row.updated_at
    }));
    const remoteMeds = (medicationsResult.data || []).map((row) => normalizeMedication({
      id: row.id,
      name: row.name,
      type: row.type,
      dose: row.dose,
      frequency: row.frequency,
      customFrequency: row.custom_frequency,
      startDate: row.start_date,
      endDate: row.end_date,
      reminderEnabled: row.reminder_enabled,
      reminderTimes: row.reminder_times,
      refillDate: row.refill_date,
      refillQty: row.refill_qty,
      instructions: row.instructions,
      sideEffects: row.side_effects,
      prescribedBy: row.prescribed_by,
      isActive: row.is_active,
      created_at: row.created_at,
      updated_at: row.updated_at
    }));
    const remoteMedicationLogs = (medicationLogsResult.data || []).map((row) => normalizeMedicationLog({
      id: row.id,
      medicationId: row.medication_id,
      takenAt: row.taken_at,
      doseTaken: row.dose_taken,
      notes: row.notes,
      created_at: row.created_at
    }));
    const remoteVisits = (visitsResult.data || []).map((row) => normalizeDoctorVisit({
      id: row.id,
      date: row.date,
      doctorName: row.doctor_name,
      specialty: row.specialty,
      clinic: row.clinic,
      reason: row.reason,
      diagnosis: row.diagnosis,
      notes: row.notes,
      followUpDate: row.follow_up_date,
      attachments: row.attachments,
      linkedReportIds: row.linked_report_ids,
      created_at: row.created_at,
      updated_at: row.updated_at
    }));

    const remoteHasHealthData = Boolean(remoteBlood.length || remoteBody.length || remoteMeds.length || remoteMedicationLogs.length || remoteVisits.length);
    const localHasHealthData = hasMeaningfulHealthData(localBefore);

    if (!remoteHasHealthData && localHasHealthData) {
      state.bloodTests = localBefore.bloodTests;
      state.bodyMetrics = localBefore.bodyMetrics;
      state.medications = localBefore.medications;
      state.medicationLogs = localBefore.medicationLogs;
      state.doctorVisits = localBefore.doctorVisits;
      saveLocalState();
      renderHealthPage();
      setTimeout(() => {
        syncStateToCloud().catch((error) => {
          console.error("Health import failed", error);
          showToast(`Health import failed: ${formatSupabaseError(error)}`);
        });
      }, 0);
      return;
    }

    state.bloodTests = remoteBlood;
    state.bodyMetrics = remoteBody;
    state.medications = remoteMeds;
    state.medicationLogs = remoteMedicationLogs;
    state.doctorVisits = remoteVisits;
    saveLocalState();
    renderHealthPage();
  };

  function hasMeaningfulHealthData(candidateState) {
    return Boolean(
      candidateState?.bloodTests?.length
      || candidateState?.bodyMetrics?.length
      || candidateState?.medications?.length
      || candidateState?.medicationLogs?.length
      || candidateState?.doctorVisits?.length
    );
  }

  function normalizeBloodTestReport(report) {
    return {
      id: report?.id || uid(),
      date: report?.date || todayStr(),
      labName: String(report?.labName || "").trim(),
      notes: String(report?.notes || "").trim(),
      photoUrl: String(report?.photoUrl || "").trim(),
      markers: Array.isArray(report?.markers) ? report.markers.map(normalizeBloodMarker).filter(Boolean) : [],
      aiSummary: report?.aiSummary || null,
      created_at: report?.created_at || new Date().toISOString(),
      updated_at: report?.updated_at
    };
  }

  function normalizeBloodMarker(marker) {
    if (!marker?.name) {
      return null;
    }
    const category = BLOOD_CATEGORY_ORDER.includes(marker.category) ? marker.category : "custom";
    const value = Number(marker.value);
    const referenceMin = marker.referenceMin === null || marker.referenceMin === undefined || marker.referenceMin === "" ? null : Number(marker.referenceMin);
    const referenceMax = marker.referenceMax === null || marker.referenceMax === undefined || marker.referenceMax === "" ? null : Number(marker.referenceMax);
    const normalized = {
      id: marker.id || uid(),
      category,
      name: String(marker.name).trim(),
      value: Number.isFinite(value) ? value : 0,
      unit: String(marker.unit || "").trim(),
      referenceMin: Number.isFinite(referenceMin) ? referenceMin : null,
      referenceMax: Number.isFinite(referenceMax) ? referenceMax : null,
      status: "normal"
    };
    normalized.status = computeBloodMarkerStatus(normalized);
    return normalized;
  }

  function normalizeBodyMetricEntry(entry) {
    const weightKg = nullableNumber(entry?.weightKg);
    const bodyFatPercent = nullableNumber(entry?.bodyFatPercent);
    const muscleMassKg = nullableNumber(entry?.muscleMassKg);
    const waistCm = nullableNumber(entry?.waistCm);
    const bmi = nullableNumber(entry?.bmi) ?? computeBmi(weightKg, getKnownHeightCm());
    return {
      id: entry?.id || uid(),
      date: entry?.date || todayStr(),
      weightKg,
      bodyFatPercent,
      bmi,
      muscleMassKg,
      waistCm,
      notes: String(entry?.notes || "").trim(),
      created_at: entry?.created_at || new Date().toISOString(),
      updated_at: entry?.updated_at
    };
  }

  function normalizeMedication(item) {
    return {
      id: item?.id || uid(),
      name: String(item?.name || "").trim(),
      type: ["prescription", "supplement", "otc"].includes(item?.type) ? item.type : "supplement",
      dose: String(item?.dose || "").trim(),
      frequency: ["daily", "twice_daily", "three_times_daily", "weekly", "as_needed", "custom"].includes(item?.frequency) ? item.frequency : "daily",
      customFrequency: String(item?.customFrequency || "").trim(),
      startDate: item?.startDate || todayStr(),
      endDate: item?.endDate || "",
      reminderEnabled: !!item?.reminderEnabled,
      reminderTimes: normalizeReminderTimes(item?.reminderTimes),
      refillDate: item?.refillDate || "",
      refillQty: nullableNumber(item?.refillQty),
      instructions: String(item?.instructions || "").trim(),
      sideEffects: String(item?.sideEffects || "").trim(),
      prescribedBy: String(item?.prescribedBy || "").trim(),
      isActive: item?.isActive !== false,
      created_at: item?.created_at || new Date().toISOString(),
      updated_at: item?.updated_at
    };
  }

  function normalizeMedicationLog(log) {
    return {
      id: log?.id || uid(),
      medicationId: log?.medicationId || "",
      takenAt: log?.takenAt || new Date().toISOString(),
      doseTaken: String(log?.doseTaken || "").trim(),
      notes: String(log?.notes || "").trim(),
      created_at: log?.created_at || new Date().toISOString()
    };
  }

  function normalizeDoctorVisit(visit) {
    return {
      id: visit?.id || uid(),
      date: visit?.date || todayStr(),
      doctorName: String(visit?.doctorName || "").trim(),
      specialty: String(visit?.specialty || "").trim(),
      clinic: String(visit?.clinic || "").trim(),
      reason: String(visit?.reason || "").trim(),
      diagnosis: String(visit?.diagnosis || "").trim(),
      notes: String(visit?.notes || "").trim(),
      followUpDate: visit?.followUpDate || "",
      attachments: Array.isArray(visit?.attachments) ? visit.attachments.filter(Boolean) : [],
      linkedReportIds: Array.isArray(visit?.linkedReportIds) ? visit.linkedReportIds.filter(Boolean) : [],
      created_at: visit?.created_at || new Date().toISOString(),
      updated_at: visit?.updated_at
    };
  }

  function nullableNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function normalizeReminderTimes(times) {
    if (Array.isArray(times)) {
      return times.map((value) => String(value || "").trim()).filter((value) => /^\d{2}:\d{2}$/.test(value));
    }
    if (typeof times === "string") {
      return times.split(",").map((value) => value.trim()).filter((value) => /^\d{2}:\d{2}$/.test(value));
    }
    return [];
  }

  function computeBloodMarkerStatus(marker) {
    const value = Number(marker.value);
    if (!Number.isFinite(value)) {
      return "normal";
    }
    const min = marker.referenceMin;
    const max = marker.referenceMax;
    if (Number.isFinite(min) && value < min) {
      return min > 0 && ((min - value) / min) > 0.2 ? "critical" : "low";
    }
    if (Number.isFinite(max) && value > max) {
      return max > 0 && ((value - max) / max) > 0.2 ? "critical" : "high";
    }
    return "normal";
  }

  function computeMarkerTone(marker) {
    if (marker.status === "critical") {
      return "critical";
    }
    if (marker.status === "high" || marker.status === "low") {
      return "alert";
    }
    const min = marker.referenceMin;
    const max = marker.referenceMax;
    if (Number.isFinite(min) && Math.abs(marker.value - min) <= Math.max(0.05 * Math.abs(min), 0.1)) {
      return "borderline";
    }
    if (Number.isFinite(max) && Math.abs(marker.value - max) <= Math.max(0.05 * Math.abs(max), 0.1)) {
      return "borderline";
    }
    return "normal";
  }

  function computeBmi(weightKg, heightCm) {
    if (!Number.isFinite(weightKg) || !Number.isFinite(heightCm) || heightCm <= 0) {
      return null;
    }
    const heightM = heightCm / 100;
    return roundNutrient(weightKg / (heightM * heightM));
  }

  function getBmiLabel(bmi) {
    if (!Number.isFinite(bmi)) {
      return "Unknown";
    }
    if (bmi < 18.5) {
      return "Underweight";
    }
    if (bmi < 25) {
      return "Normal";
    }
    if (bmi < 30) {
      return "Overweight";
    }
    return "Obese";
  }

  function persistHealthProfileHeight() {
    try {
      const heightCmValue = typeof heightToCm === "function" ? heightToCm() : 0;
      if (heightCmValue > 0) {
        localStorage.setItem(HEALTH_PROFILE_HEIGHT_KEY, String(roundNutrient(heightCmValue)));
      }
    } catch (error) {
      console.error("Failed to persist health profile height", error);
    }
  }

  function getKnownHeightCm() {
    const stored = Number(localStorage.getItem(HEALTH_PROFILE_HEIGHT_KEY));
    if (Number.isFinite(stored) && stored > 0) {
      return stored;
    }
    return null;
  }

  function renderTodayHealthCard() {
    const card = document.getElementById("today-health-card");
    const content = document.getElementById("today-health-card-content");
    if (!card || !content) {
      return;
    }

    const latestBody = getLatestBodyMetric();
    const previousBody = getPreviousBodyMetric();
    const latestBlood = getLatestBloodTest();
    const dueMedications = getDueTodayMedications();
    const followUps = getUpcomingFollowUps();
    const hasAny = Boolean(latestBody || latestBlood || dueMedications.length || followUps.length);
    card.classList.toggle("hidden", !hasAny);
    if (!hasAny) {
      content.innerHTML = '<div class="empty-state">No health records yet. Start with a body metric, medication, or blood test.</div>';
      return;
    }

    const trend = latestBody && previousBody && Number.isFinite(latestBody.weightKg) && Number.isFinite(previousBody.weightKg)
      ? roundNutrient(latestBody.weightKg - previousBody.weightKg)
      : null;
    const attentionCount = latestBlood ? latestBlood.markers.filter((marker) => marker.status !== "normal").length : 0;

    content.innerHTML = `
      <div class="health-home-row">
        <div>
          <div class="health-home-label">Body</div>
          <div class="health-home-value">${latestBody && Number.isFinite(latestBody.weightKg) ? `${roundNutrient(latestBody.weightKg)} kg` : "No weight logged"}</div>
          <div class="health-home-meta">${trend === null ? "" : `${trend < 0 ? "↓" : trend > 0 ? "↑" : "→"} ${Math.abs(trend)} kg vs last entry`}</div>
        </div>
        <div>
          <div class="health-home-label">Blood Test</div>
          <div class="health-home-meta">${latestBlood ? `Last test: ${formatShortDate(latestBlood.date)} · ${attentionCount ? `${attentionCount} markers need attention` : "All clear"}` : "No blood tests yet"}</div>
        </div>
      </div>
      ${dueMedications.length ? `
        <div class="health-home-block">
          <div class="health-home-label">Due today</div>
          <div class="health-pill-row">
            ${dueMedications.map((med) => `<button class="health-pill" type="button" onclick="markMedicationTaken('${med.id}')">✓ ${escHtml(med.name)} ${escHtml(med.dose || "")}</button>`).join("")}
          </div>
        </div>
      ` : ""}
      ${followUps.length ? `
        <div class="health-home-block health-followup-row">Follow-up soon: ${followUps.map((visit) => `${visit.doctorName || visit.specialty || "Visit"} · ${formatShortDate(visit.followUpDate)}`).join(" • ")}</div>
      ` : ""}
    `;
  }

  function renderHealthPage() {
    if (!document.getElementById("health-content")) {
      return;
    }
    HEALTH_TABS.forEach((tab) => {
      document.getElementById(`health-tab-${tab}`)?.classList.toggle("active", healthTab === tab);
    });
    const content = document.getElementById("health-content");
    if (healthTab === "blood") {
      content.innerHTML = renderBloodTestsTab();
    } else if (healthTab === "body") {
      content.innerHTML = renderBodyMetricsTab();
    } else if (healthTab === "medications") {
      content.innerHTML = renderMedicationsTab();
    } else {
      content.innerHTML = renderVisitsTab();
    }
  }

  function renderHealthEmptyCard(message, actionLabel = "", actionHandler = "") {
    return `
      <div class="card health-empty-card">
        <div class="health-empty-state">${escHtml(message)}</div>
        ${actionLabel && actionHandler ? `<div class="health-empty-actions"><button class="btn btn-secondary" type="button" onclick="${escAttr(actionHandler)}">${escHtml(actionLabel)}</button></div>` : ""}
      </div>
    `;
  }
  function renderHealthTopBar(title, actionLabel, actionHandler) {
    return `
      <div class="goals-bar health-top-bar">
        <span class="goals-bar-text">${escHtml(title)}</span>
        <button class="health-top-bar-action" type="button" onclick="${escAttr(actionHandler)}">${escHtml(actionLabel)}</button>
      </div>
    `;
  }

  function renderBloodTestsTab() {
    const reports = [...state.bloodTests].sort((a, b) => b.date.localeCompare(a.date));
    return `
      ${renderHealthTopBar('Blood Tests', 'Add New', 'openBloodTestModal()')}
      <div class="card health-card health-disclaimer-card">
        <div class="health-disclaimer health-disclaimer--inline">${escHtml(HEALTH_DISCLAIMER)}</div>
      </div>
      <div class="health-list">
        ${reports.length ? reports.map((report) => renderBloodTestCard(report)).join("") : renderHealthEmptyCard('No blood test reports yet.', 'Add New', 'openBloodTestModal()')}
      </div>
    `;
  }

  function renderBloodTestCard(report) {
    const expanded = bloodTestsExpanded.has(report.id);
    const tones = report.markers.map(computeMarkerTone);
    return `
      <div class="card health-card">
        <button class="health-card-header" type="button" onclick="toggleBloodTestCard('${report.id}')">
          <div>
            <div class="health-card-title">${formatLongDate(report.date)}</div>
            <div class="health-card-meta">${escHtml(report.labName || "Lab report")} · ${report.markers.length} markers</div>
          </div>
          <div class="health-status-dots">${tones.map((tone) => `<span class="health-status-dot ${tone}"></span>`).join("")}</div>
        </button>
        ${expanded ? `
          <div class="health-card-body">
            ${report.notes ? `<div class="health-inline-note">${escHtml(report.notes)}</div>` : ""}
            ${report.photoUrl ? `<img class="health-report-photo" src="${escAttr(report.photoUrl)}" alt="Lab report photo">` : ""}
            <div class="health-marker-list">${report.markers.map((marker) => renderBloodMarkerItem(marker)).join("")}</div>
            ${report.aiSummary ? renderBloodInsight(report) : ""}
            <div class="health-card-actions"><button class="btn btn-secondary" type="button" onclick="openBloodTestModal('${report.id}')">Edit</button><button class="btn btn-secondary" type="button" onclick="promptDeleteBloodTest('${report.id}')">Delete</button></div>
          </div>
        ` : ""}
      </div>
    `;
  }

  function renderBloodMarkerItem(marker) {
    const abnormal = marker.status !== "normal";
    return `
      <div class="health-marker-item ${abnormal ? 'is-flagged' : ''}">
        <div class="health-marker-top">
          <div>
            <div class="health-marker-name">${escHtml(marker.name)}</div>
            <div class="health-marker-range">Ref: ${formatReferenceRange(marker)}</div>
          </div>
          <div class="health-marker-value"><span class="health-marker-badge ${marker.status}">${marker.status}</span>${roundNutrient(marker.value)} ${escHtml(marker.unit)}</div>
        </div>
        ${abnormal ? `<div class="health-marker-explanation">${escHtml(buildMarkerExplanation(marker))}</div>` : ""}
      </div>
    `;
  }

  function renderBloodInsight(report) {
    const expanded = bloodInsightExpanded.has(report.id);
    const insight = report.aiSummary;
    return `
      <div class="health-insight-card">
        <button class="health-insight-toggle" type="button" onclick="toggleBloodInsight('${report.id}')">What this means for you</button>
        ${expanded ? `
          <div class="health-insight-body">
            <div class="health-disclaimer health-disclaimer--small">${escHtml(insight.disclaimer || HEALTH_DISCLAIMER)}</div>
            ${(insight.flaggedMarkers || []).length ? `<div class="health-insight-group"><div class="health-mini-title">Flagged markers</div>${insight.flaggedMarkers.map((item) => `<div class="health-flagged-item"><strong>${escHtml(item.name)}</strong> · ${item.value} ${escHtml(item.unit)} · ${escHtml(item.status)}<div>${escHtml(item.plainEnglishExplanation || "")}</div><div class="health-inline-note">${escHtml(item.suggestion || "")}</div></div>`).join("")}</div>` : ""}
            ${(insight.nutritionSuggestions || []).length ? `<div class="health-insight-group"><div class="health-mini-title">Nutrition</div><ul>${insight.nutritionSuggestions.map((item) => `<li>${escHtml(item)}</li>`).join("")}</ul></div>` : ""}
            ${(insight.workoutSuggestions || []).length ? `<div class="health-insight-group"><div class="health-mini-title">Workouts</div><ul>${insight.workoutSuggestions.map((item) => `<li>${escHtml(item)}</li>`).join("")}</ul></div>` : ""}
            <div class="health-insight-group"><div class="health-mini-title">General advice</div><div>${escHtml(insight.generalAdvice || "")}</div></div>
          </div>
        ` : ""}
      </div>
    `;
  }

  function renderBodyMetricsTab() {
    const entries = [...state.bodyMetrics].sort((a, b) => b.date.localeCompare(a.date));
    const latest = entries[0];
    const previous = entries[1] || null;
    const chartEntries = bodyRangeMode === "90d" ? entries.filter((entry) => daysBetween(entry.date, todayStr()) <= 90) : entries;
    return `
      ${renderHealthTopBar('Body Metrics', 'Log New Entry', 'openBodyMetricModal()')}
      <div class="card health-card health-section-card">
        <div class="health-toolbar health-toolbar--stacked">
          <div class="segmented-control"><button class="segmented-btn ${bodyRangeMode === '90d' ? 'active' : ''}" type="button" onclick="setBodyRangeMode('90d')">Last 90 Days</button><button class="segmented-btn ${bodyRangeMode === 'all' ? 'active' : ''}" type="button" onclick="setBodyRangeMode('all')">All Time</button></div>
        </div>
        ${renderSimpleLineChart(chartEntries.filter((entry) => Number.isFinite(entry.weightKg)).map((entry) => ({ label: entry.date, value: entry.weightKg })), 'kg')}
      </div>
      <div class="card health-card">
        <div class="card-label">Latest Entry</div>
        ${latest ? renderLatestBodyCard(latest, previous) : '<div class="health-empty-state">No body metrics yet. Log your first entry to see trends here.</div>'}
      </div>
      ${entries.length ? `
        <div class="health-section-title-wrap"><div class="health-section-title">History</div></div>
        <div class="health-list">
          ${entries.map((entry) => renderBodyMetricRow(entry)).join("")}
        </div>
      ` : ''}
    `;
  }

  function renderLatestBodyCard(latest, previous) {
    const trend = previous && Number.isFinite(latest.weightKg) && Number.isFinite(previous.weightKg)
      ? roundNutrient(latest.weightKg - previous.weightKg)
      : null;
    return `
      <div class="health-latest-grid">
        <div><div class="health-home-label">Weight</div><div class="health-home-value">${Number.isFinite(latest.weightKg) ? `${roundNutrient(latest.weightKg)} kg` : '—'}</div><div class="health-home-meta">${trend === null ? '' : `${trend < 0 ? '↓' : trend > 0 ? '↑' : '→'} ${Math.abs(trend)} kg since last entry`}</div></div>
        <div><div class="health-home-label">BMI</div><div class="health-home-value">${Number.isFinite(latest.bmi) ? latest.bmi : '—'}</div><div class="health-home-meta">${Number.isFinite(latest.bmi) ? getBmiLabel(latest.bmi) : 'Set height in goals to calculate BMI'}</div></div>
        <div><div class="health-home-label">Body Fat</div><div class="health-home-value">${Number.isFinite(latest.bodyFatPercent) ? `${roundNutrient(latest.bodyFatPercent)}%` : '—'}</div></div>
        <div><div class="health-home-label">Muscle</div><div class="health-home-value">${Number.isFinite(latest.muscleMassKg) ? `${roundNutrient(latest.muscleMassKg)} kg` : '—'}</div></div>
      </div>
    `;
  }

  function renderBodyMetricRow(entry) {
    return `
      <div class="card health-card health-history-row">
        <div class="health-card-header static">
          <div>
            <div class="health-card-title">${formatLongDate(entry.date)}</div>
            <div class="health-card-meta">${Number.isFinite(entry.weightKg) ? `${roundNutrient(entry.weightKg)} kg` : 'No weight'} · BMI ${Number.isFinite(entry.bmi) ? entry.bmi : '—'} · Waist ${Number.isFinite(entry.waistCm) ? `${roundNutrient(entry.waistCm)} cm` : '—'}</div>
          </div>
          <div class="health-inline-actions"><button class="btn btn-secondary" type="button" onclick="openBodyMetricModal('${entry.id}')">Edit</button><button class="btn btn-secondary" type="button" onclick="deleteBodyMetricEntry('${entry.id}')">Delete</button></div>
        </div>
        ${entry.notes ? `<div class="health-inline-note">${escHtml(entry.notes)}</div>` : ''}
      </div>
    `;
  }

  function renderMedicationsTab() {
    const dueToday = getDueTodayMedications();
    const active = state.medications.filter((item) => item.isActive);
    const inactive = state.medications.filter((item) => !item.isActive);
    return `
      ${renderHealthTopBar('Medications', 'Add Medication', 'openMedicationModal()')}
      ${dueToday.length ? `<div class="card health-card"><div class="card-label">Due Today</div><div class="health-pill-row">${dueToday.map((item) => `<button class="health-pill" type="button" onclick="markMedicationTaken('${item.id}')">✓ ${escHtml(item.name)} ${escHtml(item.dose || '')}</button>`).join('')}</div></div>` : ''}
      <div class="health-section-title-wrap"><div class="health-section-title">Active</div></div>
      <div class="health-list">${active.length ? active.map((item) => renderMedicationCard(item)).join('') : renderHealthEmptyCard('No active medications.', 'Add Medication', 'openMedicationModal()')}</div>
      <div class="health-section-title-wrap"><div class="health-section-title">Inactive / Past</div></div>
      <div class="health-list">${inactive.length ? inactive.map((item) => renderMedicationCard(item)).join('') : renderHealthEmptyCard('No past medications yet.')}</div>
    `;
  }

  function renderMedicationCard(item) {
    const expanded = medicationExpanded.has(item.id);
    const nextReminder = getNextReminderTime(item);
    const refillDays = getDaysUntil(item.refillDate);
    const refillWarning = Number.isFinite(refillDays) && refillDays >= 0 && refillDays <= 7;
    const adherence = state.medicationLogs.filter((log) => log.medicationId === item.id).slice(0, 5);
    return `
      <div class="card health-card health-med-card ${MEDICATION_TYPE_COLORS[item.type] || ''}" onmousedown="startMedicationHold('${item.id}')" onmouseup="cancelMedicationHold()" onmouseleave="cancelMedicationHold()" ontouchstart="startMedicationHold('${item.id}')" ontouchend="cancelMedicationHold()">
        <button class="health-card-header" type="button" onclick="toggleMedicationCard('${item.id}')">
          <div>
            <div class="health-card-title">${escHtml(item.name)}</div>
            <div class="health-card-meta">${escHtml(item.dose || 'No dose')} · ${escHtml(MEDICATION_FREQUENCY_LABELS[item.frequency] || item.frequency)} · ${escHtml(nextReminder || 'No reminder')}</div>
          </div>
          ${refillWarning ? `<span class="health-warning-badge">Refill soon</span>` : ''}
        </button>
        ${expanded ? `
          <div class="health-card-body">
            <div class="health-inline-note">${escHtml(item.instructions || 'No instructions')}</div>
            ${item.prescribedBy ? `<div class="health-inline-note">Prescribed by ${escHtml(item.prescribedBy)}</div>` : ''}
            ${item.sideEffects ? `<div class="health-inline-note">Notes: ${escHtml(item.sideEffects)}</div>` : ''}
            ${Number.isFinite(item.refillQty) ? `<div class="health-refill-block"><div class="health-mini-title">Refill tracker</div><div class="health-refill-bar"><div class="health-refill-fill" style="width:${Math.min(100, Math.max(8, estimateRefillPercent(item)))}%"></div></div><div class="health-card-meta">${item.refillQty} remaining${Number.isFinite(refillDays) ? ` · ${refillDays} days to refill` : ''}</div></div>` : ''}
            ${adherence.length ? `<div class="health-mini-title">Recent adherence</div><div class="health-log-list">${adherence.map((log) => `<div class="health-log-row">${formatDateTime(log.takenAt)} · ${escHtml(log.doseTaken || item.dose || '')}</div>`).join('')}</div>` : ''}
            <div class="health-card-actions"><button class="btn btn-secondary" type="button" onclick="markMedicationTaken('${item.id}')">Mark Taken</button><button class="btn btn-secondary" type="button" onclick="openMedicationModal('${item.id}')">Edit</button></div>
          </div>
        ` : ''}
      </div>
    `;
  }

  function renderVisitsTab() {
    const visits = [...state.doctorVisits].sort((a, b) => b.date.localeCompare(a.date));
    return `
      ${renderHealthTopBar('Doctor Visits', 'Add Visit', 'openDoctorVisitModal()')}
      <div class="health-list">${visits.length ? visits.map((visit) => renderVisitCard(visit)).join('') : renderHealthEmptyCard('No doctor visits yet.', 'Add Visit', 'openDoctorVisitModal()')}</div>
    `;
  }

  function renderVisitCard(visit) {
    const expanded = visitExpanded.has(visit.id);
    const followUpSoon = isFollowUpSoon(visit.followUpDate);
    const linkedReports = state.bloodTests.filter((report) => (visit.linkedReportIds || []).includes(report.id));
    return `
      <div class="card health-card">
        <button class="health-card-header" type="button" onclick="toggleVisitCard('${visit.id}')">
          <div>
            <div class="health-card-title">${formatLongDate(visit.date)} · ${escHtml(visit.doctorName || visit.specialty || 'Doctor Visit')}</div>
            <div class="health-card-meta">${escHtml(visit.specialty || '')}${visit.specialty && visit.reason ? ' · ' : ''}${escHtml(visit.reason || '')}</div>
          </div>
          ${followUpSoon ? '<span class="health-warning-badge">Follow-up soon</span>' : ''}
        </button>
        ${expanded ? `
          <div class="health-card-body">
            ${visit.clinic ? `<div class="health-inline-note">${escHtml(visit.clinic)}</div>` : ''}
            ${visit.diagnosis ? `<div class="health-inline-note">Diagnosis: ${escHtml(visit.diagnosis)}</div>` : ''}
            <div class="health-inline-note">${escHtml(visit.notes || 'No notes')}</div>
            ${visit.followUpDate ? `<div class="health-inline-note">Follow-up: ${formatLongDate(visit.followUpDate)}</div>` : ''}
            ${visit.attachments.length ? `<div class="health-thumb-grid">${visit.attachments.map((src) => `<img class="health-thumb" src="${escAttr(src)}" alt="Visit attachment">`).join('')}</div>` : ''}
            ${linkedReports.length ? `<div class="health-linked-block"><div class="health-mini-title">Linked blood tests</div>${linkedReports.map((report) => `<div class="health-log-row">${formatShortDate(report.date)} · ${escHtml(report.labName || 'Blood test')}</div>`).join('')}</div>` : ''}
            <div class="health-card-actions"><button class="btn btn-secondary" type="button" onclick="openDoctorVisitModal('${visit.id}')">Edit</button><button class="btn btn-secondary" type="button" onclick="deleteDoctorVisit('${visit.id}')">Delete</button></div>
          </div>
        ` : ''}
      </div>
    `;
  }

  function renderSimpleLineChart(points, unit) {
    if (!points.length) {
      return '<div class="health-empty-state health-empty-state--compact">Not enough data for a chart yet.</div>';
    }
    const width = 320;
    const height = 150;
    const max = Math.max(...points.map((point) => point.value || 0), 1);
    const min = Math.min(...points.map((point) => point.value || 0), 0);
    const span = Math.max(max - min, 1);
    const stepX = points.length > 1 ? (width - 24) / (points.length - 1) : 0;
    const polyline = points.map((point, index) => {
      const x = 12 + (stepX * index);
      const y = height - 20 - (((point.value - min) / span) * (height - 36));
      return `${x},${y}`;
    }).join(' ');
    return `
      <svg class="workout-chart health-chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
        <polyline fill="none" stroke="var(--accent)" stroke-width="3" points="${polyline}" />
        ${points.map((point, index) => {
          const x = 12 + (stepX * index);
          const y = height - 20 - (((point.value - min) / span) * (height - 36));
          return `<circle cx="${x}" cy="${y}" r="3" fill="var(--accent)"></circle>`;
        }).join('')}
      </svg>
      <div class="workout-chart-caption">${escHtml(unit)} over time</div>
    `;
  }

  function switchHealthTab(tab) {
    if (!HEALTH_TABS.includes(tab)) {
      return;
    }
    healthTab = tab;
    renderHealthPage();
  }

  function openHealthFromToday() {
    showPage("health");
    renderHealthPage();
  }

  function toggleBloodTestCard(id) {
    if (bloodTestsExpanded.has(id)) {
      bloodTestsExpanded.delete(id);
    } else {
      bloodTestsExpanded.add(id);
    }
    renderHealthPage();
  }

  function toggleBloodInsight(id) {
    if (bloodInsightExpanded.has(id)) {
      bloodInsightExpanded.delete(id);
    } else {
      bloodInsightExpanded.add(id);
    }
    renderHealthPage();
  }

  function setBodyRangeMode(mode) {
    bodyRangeMode = mode === "all" ? "all" : "90d";
    renderHealthPage();
  }

  function toggleMedicationCard(id) {
    if (medicationExpanded.has(id)) {
      medicationExpanded.delete(id);
    } else {
      medicationExpanded.add(id);
    }
    renderHealthPage();
  }

  function toggleVisitCard(id) {
    if (visitExpanded.has(id)) {
      visitExpanded.delete(id);
    } else {
      visitExpanded.add(id);
    }
    renderHealthPage();
  }

  function setBloodFormStep(step) {
    bloodFormStep = Math.max(1, Math.min(3, Number(step) || 1));
    [1, 2, 3].forEach((value) => {
      document.getElementById(`health-blood-step-${value}`)?.classList.toggle("active", value === bloodFormStep);
      document.getElementById(`health-blood-view-${value}`)?.classList.toggle("hidden", value !== bloodFormStep);
    });
    document.getElementById("health-blood-back-btn")?.classList.toggle("hidden", bloodFormStep === 1);
    document.getElementById("health-blood-next-btn")?.classList.toggle("hidden", bloodFormStep === 3);
    document.getElementById("health-blood-save-btn")?.classList.toggle("hidden", bloodFormStep !== 3);
    if (bloodFormStep === 3) {
      renderBloodReview();
    }
  }

  function goBloodFormStep(delta) {
    setBloodFormStep(bloodFormStep + delta);
  }

  function openBloodTestModal(id = null) {
    ensureHealthScaffold();
    editingBloodTestId = id;
    bloodPhotoDraft = "";
    const report = state.bloodTests.find((item) => item.id === id) || null;
    document.getElementById("health-blood-title").textContent = report ? "Edit Blood Test" : "Add Blood Test";
    document.getElementById("health-blood-date").value = report?.date || todayStr();
    document.getElementById("health-blood-lab").value = report?.labName || "";
    document.getElementById("health-blood-notes").value = report?.notes || "";
    bloodPhotoDraft = report?.photoUrl || "";
    renderBloodPhotoPreview();
    renderBloodMarkerEditor(report);
    document.getElementById("health-blood-status").textContent = "";
    setBloodFormStep(1);
    document.getElementById("overlay-health-blood").classList.add("open");
  }

  function renderBloodMarkerEditor(report = null) {
    const container = document.getElementById("health-blood-marker-editor");
    if (!container) {
      return;
    }
    const existing = new Map((report?.markers || []).map((marker) => [`${marker.category}::${marker.name}`, marker]));
    container.innerHTML = BLOOD_CATEGORY_ORDER.map((category) => {
      const builtins = BUILTIN_BLOOD_MARKERS.filter((marker) => marker.category === category);
      const customRows = (report?.markers || []).filter((marker) => marker.category === category && !builtins.some((builtin) => builtin.name === marker.name));
      return `
        <details class="health-marker-section" open>
          <summary>${escHtml(BLOOD_CATEGORY_LABELS[category])}</summary>
          <div class="health-marker-editor-list">
            ${builtins.map((marker) => renderBloodMarkerEditorRow(marker, existing.get(`${category}::${marker.name}`), false)).join('')}
            <div id="health-custom-marker-group-${category}">
              ${customRows.map((marker) => renderBloodMarkerEditorRow(marker, marker, true)).join('')}
            </div>
            <button class="btn btn-secondary health-add-custom-marker" type="button" onclick="addCustomBloodMarkerRow('${category}')">Add custom marker</button>
          </div>
        </details>
      `;
    }).join('');
    container.querySelectorAll('.health-marker-editor-row').forEach((node) => updateBloodMarkerEditorRow(node));
  }

  function renderBloodMarkerEditorRow(definition, existing, isCustom) {
    const marker = existing || definition || {};
    const id = marker.id || uid();
    const refMin = marker.referenceMin ?? definition.referenceMin ?? '';
    const refMax = marker.referenceMax ?? definition.referenceMax ?? '';
    return `
      <div class="health-marker-editor-row ${isCustom ? 'custom' : ''}" data-category="${escAttr(marker.category || definition.category || 'custom')}" data-id="${escAttr(id)}">
        <div class="health-marker-editor-header">
          ${isCustom
            ? `<input class="form-input health-inline-input health-marker-name-input" placeholder="Marker name" value="${escAttr(marker.name || '')}" oninput="updateBloodMarkerEditorStatus(this)">`
            : `<div class="health-marker-name">${escHtml(marker.name || definition.name || '')}</div>`}
          <span class="health-inline-status"></span>
        </div>
        <div class="health-marker-editor-grid">
          <input class="form-input health-inline-input health-marker-value-input" type="number" step="0.01" placeholder="Value" value="${marker.value ?? ''}" oninput="updateBloodMarkerEditorStatus(this)">
          <input class="form-input health-inline-input health-marker-unit-input" placeholder="Unit" value="${escAttr(marker.unit || definition.unit || '')}" oninput="updateBloodMarkerEditorStatus(this)">
          <input class="form-input health-inline-input health-marker-refmin-input" type="number" step="0.01" placeholder="Min" value="${refMin}">
          <input class="form-input health-inline-input health-marker-refmax-input" type="number" step="0.01" placeholder="Max" value="${refMax}">
          ${isCustom ? `<button class="btn btn-secondary" type="button" onclick="removeCustomBloodMarkerRow('${id}')">Remove</button>` : ''}
        </div>
      </div>
    `;
  }

  function addCustomBloodMarkerRow(category) {
    const container = document.getElementById(`health-custom-marker-group-${category}`);
    if (!container) {
      return;
    }
    const wrapper = document.createElement('div');
    wrapper.innerHTML = renderBloodMarkerEditorRow({ id: uid(), category, name: '', unit: '' }, null, true);
    container.appendChild(wrapper.firstElementChild);
  }

  function removeCustomBloodMarkerRow(id) {
    document.querySelector(`.health-marker-editor-row[data-id="${CSS.escape(id)}"]`)?.remove();
  }

  function updateBloodMarkerEditorStatus(source) {
    updateBloodMarkerEditorRow(source.closest('.health-marker-editor-row'));
  }

  function updateBloodMarkerEditorRow(row) {
    if (!row) {
      return;
    }
    const name = row.querySelector('.health-marker-name-input')?.value.trim() || row.querySelector('.health-marker-name')?.textContent?.trim() || '';
    const value = Number(row.querySelector('.health-marker-value-input')?.value);
    const unit = row.querySelector('.health-marker-unit-input')?.value.trim() || '';
    const referenceMinRaw = row.querySelector('.health-marker-refmin-input')?.value;
    const referenceMaxRaw = row.querySelector('.health-marker-refmax-input')?.value;
    const referenceMin = referenceMinRaw === '' ? null : Number(referenceMinRaw);
    const referenceMax = referenceMaxRaw === '' ? null : Number(referenceMaxRaw);
    const statusNode = row.querySelector('.health-inline-status');
    if (!statusNode) {
      return;
    }
    if (!name || !Number.isFinite(value)) {
      statusNode.textContent = '';
      statusNode.className = 'health-inline-status';
      return;
    }
    const marker = normalizeBloodMarker({
      id: row.dataset.id,
      category: row.dataset.category,
      name,
      value,
      unit,
      referenceMin,
      referenceMax
    });
    statusNode.textContent = marker.status;
    statusNode.className = `health-inline-status ${marker.status}`;
  }

  async function handleBloodReportPhoto(event) {
    const file = event?.target?.files?.[0];
    if (!file) {
      return;
    }
    bloodPhotoDraft = await readFileAsDataUrl(file);
    renderBloodPhotoPreview();
    event.target.value = '';
  }

  function renderBloodPhotoPreview() {
    const container = document.getElementById('health-blood-photo-preview');
    if (!container) {
      return;
    }
    container.innerHTML = bloodPhotoDraft
      ? `<img class="health-report-photo" src="${escAttr(bloodPhotoDraft)}" alt="Blood report preview"><button class="btn btn-secondary" type="button" onclick="clearBloodReportPhoto()">Remove photo</button>`
      : '';
  }

  function clearBloodReportPhoto() {
    bloodPhotoDraft = '';
    renderBloodPhotoPreview();
  }

  function collectBloodMarkersFromForm() {
    return Array.from(document.querySelectorAll('.health-marker-editor-row')).map((row) => {
      const name = row.querySelector('.health-marker-name-input')?.value.trim() || row.querySelector('.health-marker-name')?.textContent?.trim() || '';
      const valueRaw = row.querySelector('.health-marker-value-input')?.value;
      const unit = row.querySelector('.health-marker-unit-input')?.value.trim() || '';
      const referenceMinRaw = row.querySelector('.health-marker-refmin-input')?.value;
      const referenceMaxRaw = row.querySelector('.health-marker-refmax-input')?.value;
      if (!name || valueRaw === '') {
        return null;
      }
      return normalizeBloodMarker({
        id: row.dataset.id,
        category: row.dataset.category,
        name,
        value: Number(valueRaw),
        unit,
        referenceMin: referenceMinRaw === '' ? null : Number(referenceMinRaw),
        referenceMax: referenceMaxRaw === '' ? null : Number(referenceMaxRaw)
      });
    }).filter(Boolean);
  }

  function renderBloodReview() {
    const review = document.getElementById('health-blood-review');
    if (!review) {
      return;
    }
    const markers = collectBloodMarkersFromForm();
    const flagged = markers.filter((marker) => marker.status !== 'normal');
    review.innerHTML = `
      <div class="health-review-line"><strong>${markers.length}</strong> markers entered</div>
      <div class="health-review-line"><strong>${flagged.length}</strong> markers outside range</div>
      <div class="health-review-line">AI analysis will use your last 7 days of nutrition and last 30 days of workouts for context.</div>
    `;
  }

  async function saveBloodTestReport() {
    const statusNode = document.getElementById('health-blood-status');
    const date = document.getElementById('health-blood-date').value || todayStr();
    const labName = document.getElementById('health-blood-lab').value.trim();
    const notes = document.getElementById('health-blood-notes').value.trim();
    const markers = collectBloodMarkersFromForm();
    if (!markers.length) {
      statusNode.textContent = 'Add at least one marker value before saving.';
      return;
    }

    statusNode.textContent = 'Saving report...';
    const existingIndex = state.bloodTests.findIndex((item) => item.id === editingBloodTestId);
    const nextReport = normalizeBloodTestReport({
      ...(existingIndex >= 0 ? state.bloodTests[existingIndex] : null),
      id: existingIndex >= 0 ? state.bloodTests[existingIndex].id : uid(),
      date,
      labName,
      notes,
      photoUrl: bloodPhotoDraft,
      markers,
      aiSummary: existingIndex >= 0 ? state.bloodTests[existingIndex].aiSummary : null,
      updated_at: new Date().toISOString()
    });

    if (existingIndex >= 0) {
      state.bloodTests[existingIndex] = nextReport;
    } else {
      state.bloodTests.unshift(nextReport);
    }
    saveState();
    renderHealthPage();
    renderTodayHealthCard();

    statusNode.textContent = 'Analyzing your report...';
    try {
      const insight = await requestBloodTestInsight(nextReport);
      const reportIndex = state.bloodTests.findIndex((item) => item.id === nextReport.id);
      if (reportIndex >= 0) {
        state.bloodTests[reportIndex] = {
          ...state.bloodTests[reportIndex],
          aiSummary: insight,
          updated_at: new Date().toISOString()
        };
        saveState();
      }
      renderHealthPage();
      renderTodayHealthCard();
      closeModal('health-blood');
      showToast('Blood test saved');
    } catch (error) {
      console.error('Blood test analysis failed', error);
      closeModal('health-blood');
      showToast(error.message || 'Blood test saved without AI analysis');
    }
  }

  async function requestBloodTestInsight(report) {
    const nutrition = getRecentNutritionAverages();
    const workoutFrequency = getRecentWorkoutFrequency();
    const response = await fetch(HEALTH_ANALYSIS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ report, nutrition, workoutFrequency })
    });
    const text = await response.text();
    let payload = {};
    try {
      payload = text ? JSON.parse(text) : {};
    } catch (error) {
      throw new Error('Blood test analysis format was invalid.');
    }
    if (!response.ok) {
      throw new Error(payload.error || 'Blood test analysis failed.');
    }
    return payload;
  }

  function getRecentNutritionAverages() {
    const dates = Array.from({ length: 7 }, (_, index) => shiftDate(todayStr(), -index));
    const relevantLogs = state.logs.filter((log) => dates.includes(log.date));
    const totalDays = Math.max(dates.length, 1);
    return {
      avgCalories: roundNutrient(relevantLogs.reduce((sum, log) => sum + (log.cal || 0), 0) / totalDays),
      avgProtein: roundNutrient(relevantLogs.reduce((sum, log) => sum + (log.pro || 0), 0) / totalDays),
      avgCarbs: roundNutrient(relevantLogs.reduce((sum, log) => sum + (log.carb || 0), 0) / totalDays),
      avgFat: roundNutrient(relevantLogs.reduce((sum, log) => sum + (log.fat || 0), 0) / totalDays)
    };
  }

  function getRecentWorkoutFrequency() {
    const threshold = shiftDate(todayStr(), -29);
    return state.workoutSessions.filter((session) => session.date >= threshold).length;
  }

  function promptDeleteBloodTest(id) {
    openActionSheet('Delete blood test?', [
      { label: 'Delete Report', style: 'destructive', onClick: () => deleteBloodTest(id) }
    ], { message: 'This removes the report and any AI insight attached to it.' });
  }

  function deleteBloodTest(id) {
    state.bloodTests = state.bloodTests.filter((item) => item.id !== id);
    saveState();
    renderHealthPage();
    renderTodayHealthCard();
    showToast('Blood test removed');
  }

  function openBodyMetricModal(id = null) {
    editingBodyMetricId = id;
    const entry = state.bodyMetrics.find((item) => item.id === id) || null;
    document.getElementById('health-body-title').textContent = entry ? 'Edit Body Entry' : 'Log Body Entry';
    document.getElementById('health-body-date').value = entry?.date || todayStr();
    document.getElementById('health-body-weight').value = entry?.weightKg ?? '';
    document.getElementById('health-body-fat').value = entry?.bodyFatPercent ?? '';
    document.getElementById('health-body-muscle').value = entry?.muscleMassKg ?? '';
    document.getElementById('health-body-waist').value = entry?.waistCm ?? '';
    document.getElementById('health-body-notes').value = entry?.notes || '';
    document.getElementById('health-body-status').textContent = '';
    document.getElementById('overlay-health-body').classList.add('open');
  }

  function saveBodyMetricEntry() {
    const status = document.getElementById('health-body-status');
    const date = document.getElementById('health-body-date').value || todayStr();
    const weightKg = nullableNumber(document.getElementById('health-body-weight').value);
    if (!Number.isFinite(weightKg)) {
      status.textContent = 'Weight is required.';
      return;
    }
    const entry = normalizeBodyMetricEntry({
      id: editingBodyMetricId || uid(),
      date,
      weightKg,
      bodyFatPercent: nullableNumber(document.getElementById('health-body-fat').value),
      muscleMassKg: nullableNumber(document.getElementById('health-body-muscle').value),
      waistCm: nullableNumber(document.getElementById('health-body-waist').value),
      notes: document.getElementById('health-body-notes').value.trim(),
      created_at: state.bodyMetrics.find((item) => item.id === editingBodyMetricId)?.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    const index = state.bodyMetrics.findIndex((item) => item.id === entry.id);
    if (index >= 0) {
      state.bodyMetrics[index] = entry;
    } else {
      state.bodyMetrics.unshift(entry);
    }
    state.bodyMetrics.sort((a, b) => b.date.localeCompare(a.date));
    saveState();
    closeModal('health-body');
    renderHealthPage();
    renderTodayHealthCard();
    showToast('Body entry saved');
  }

  function deleteBodyMetricEntry(id) {
    state.bodyMetrics = state.bodyMetrics.filter((item) => item.id !== id);
    saveState();
    renderHealthPage();
    renderTodayHealthCard();
    showToast('Body entry removed');
  }

  function openMedicationModal(id = null) {
    editingMedicationId = id;
    const item = state.medications.find((entry) => entry.id === id) || null;
    document.getElementById('health-medication-title').textContent = item ? 'Edit Medication' : 'Add Medication';
    document.getElementById('health-med-name').value = item?.name || '';
    document.getElementById('health-med-type').value = item?.type || 'prescription';
    document.getElementById('health-med-dose').value = item?.dose || '';
    document.getElementById('health-med-frequency').value = item?.frequency || 'daily';
    document.getElementById('health-med-custom-frequency').value = item?.customFrequency || '';
    document.getElementById('health-med-start').value = item?.startDate || todayStr();
    document.getElementById('health-med-end').value = item?.endDate || '';
    document.getElementById('health-med-reminder-enabled').checked = !!item?.reminderEnabled;
    document.getElementById('health-med-reminder-times').value = (item?.reminderTimes || []).join(', ');
    document.getElementById('health-med-refill-date').value = item?.refillDate || '';
    document.getElementById('health-med-refill-qty').value = item?.refillQty ?? '';
    document.getElementById('health-med-instructions').value = item?.instructions || '';
    document.getElementById('health-med-side-effects').value = item?.sideEffects || '';
    document.getElementById('health-med-prescribed-by').value = item?.prescribedBy || '';
    document.getElementById('health-med-status').textContent = '';
    toggleMedicationCustomFrequency();
    toggleMedicationReminderFields();
    document.getElementById('overlay-health-medication').classList.add('open');
  }

  function toggleMedicationCustomFrequency() {
    document.getElementById('health-med-custom-frequency-group')?.classList.toggle('hidden', document.getElementById('health-med-frequency').value !== 'custom');
  }

  function toggleMedicationReminderFields() {
    document.getElementById('health-med-reminder-group')?.classList.toggle('hidden', !document.getElementById('health-med-reminder-enabled').checked);
  }

  async function saveMedication() {
    const status = document.getElementById('health-med-status');
    const name = document.getElementById('health-med-name').value.trim();
    if (!name) {
      status.textContent = 'Medication name is required.';
      return;
    }
    const item = normalizeMedication({
      id: editingMedicationId || uid(),
      name,
      type: document.getElementById('health-med-type').value,
      dose: document.getElementById('health-med-dose').value.trim(),
      frequency: document.getElementById('health-med-frequency').value,
      customFrequency: document.getElementById('health-med-custom-frequency').value.trim(),
      startDate: document.getElementById('health-med-start').value || todayStr(),
      endDate: document.getElementById('health-med-end').value,
      reminderEnabled: document.getElementById('health-med-reminder-enabled').checked,
      reminderTimes: document.getElementById('health-med-reminder-times').value,
      refillDate: document.getElementById('health-med-refill-date').value,
      refillQty: nullableNumber(document.getElementById('health-med-refill-qty').value),
      instructions: document.getElementById('health-med-instructions').value.trim(),
      sideEffects: document.getElementById('health-med-side-effects').value.trim(),
      prescribedBy: document.getElementById('health-med-prescribed-by').value.trim(),
      isActive: true,
      created_at: state.medications.find((entry) => entry.id === editingMedicationId)?.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    const index = state.medications.findIndex((entry) => entry.id === item.id);
    if (index >= 0) {
      state.medications[index] = item;
    } else {
      state.medications.unshift(item);
    }
    saveState();
    await maybeRequestHealthNotificationPermission(item.reminderEnabled);
    closeModal('health-medication');
    renderHealthPage();
    renderTodayHealthCard();
    showToast('Medication saved');
  }

  function startMedicationHold(id) {
    cancelMedicationHold();
    medicationHoldTimer = setTimeout(() => {
      openActionSheet('Medication options', [
        { label: 'Mark as taken', style: 'default', onClick: () => markMedicationTaken(id) },
        { label: state.medications.find((item) => item.id === id)?.isActive ? 'Archive medication' : 'Reactivate medication', style: 'muted', onClick: () => toggleMedicationActive(id) },
        { label: 'Delete medication', style: 'destructive', onClick: () => deleteMedication(id) }
      ]);
    }, 550);
  }

  function cancelMedicationHold() {
    if (medicationHoldTimer) {
      clearTimeout(medicationHoldTimer);
      medicationHoldTimer = null;
    }
  }

  function toggleMedicationActive(id) {
    state.medications = state.medications.map((item) => item.id === id ? { ...item, isActive: !item.isActive, updated_at: new Date().toISOString() } : item);
    saveState();
    renderHealthPage();
    renderTodayHealthCard();
  }

  function deleteMedication(id) {
    state.medications = state.medications.filter((item) => item.id !== id);
    state.medicationLogs = state.medicationLogs.filter((log) => log.medicationId !== id);
    saveState();
    renderHealthPage();
    renderTodayHealthCard();
    showToast('Medication removed');
  }

  function getDueTodayMedications() {
    const today = todayStr();
    return state.medications.filter((item) => item.isActive && item.startDate <= today && (!item.endDate || item.endDate >= today) && isMedicationDueToday(item));
  }

  function isMedicationDueToday(item) {
    if (!item.reminderEnabled && item.frequency === 'as_needed') {
      return false;
    }
    if (item.frequency === 'weekly') {
      return new Date(`${todayStr()}T12:00:00`).getDay() === new Date(`${item.startDate}T12:00:00`).getDay();
    }
    return true;
  }

  function getNextReminderTime(item) {
    if (!item.reminderEnabled || !item.reminderTimes.length) {
      return '';
    }
    const now = currentLocalTimeStr();
    return item.reminderTimes.find((time) => time >= now) || item.reminderTimes[0];
  }

  function markMedicationTaken(id) {
    const item = state.medications.find((entry) => entry.id === id);
    if (!item) {
      return;
    }
    state.medicationLogs.unshift(normalizeMedicationLog({
      medicationId: id,
      takenAt: new Date().toISOString(),
      doseTaken: item.dose,
      created_at: new Date().toISOString()
    }));
    saveState();
    renderHealthPage();
    renderTodayHealthCard();
    showToast(`${item.name} marked as taken`);
  }

  async function maybeRequestHealthNotificationPermission(enabled) {
    if (!enabled || !("Notification" in window)) {
      return;
    }
    if (Notification.permission === 'default') {
      try {
        await Notification.requestPermission();
      } catch (error) {
        console.error('Notification permission request failed', error);
      }
    }
  }

  function maybeSendHealthNotifications() {
    if (notificationTickerStarted) {
      return;
    }
    notificationTickerStarted = true;
    tickHealthNotifications();
    setInterval(tickHealthNotifications, 60000);
  }

  function tickHealthNotifications() {
    if (!("Notification" in window) || Notification.permission !== 'granted') {
      return;
    }
    const cache = readNotificationCache();
    const nowDate = todayStr();
    const nowTime = currentLocalTimeStr();
    getDueTodayMedications().forEach((item) => {
      if (!item.reminderEnabled) {
        return;
      }
      item.reminderTimes.forEach((time) => {
        const key = `med:${item.id}:${nowDate}:${time}`;
        if (time === nowTime && !cache[key]) {
          cache[key] = true;
          const notification = new Notification(`Time to take your ${item.name} — ${item.dose}`);
          notification.onclick = () => {
            window.focus();
            healthTab = 'medications';
            showPage('health');
            renderHealthPage();
            notification.close();
          };
        }
      });
    });
    state.medications.filter((item) => item.isActive && item.refillDate).forEach((item) => {
      const refillDays = getDaysUntil(item.refillDate);
      const key = `refill:${item.id}:${nowDate}`;
      if (Number.isFinite(refillDays) && refillDays >= 0 && refillDays <= 7 && !cache[key]) {
        cache[key] = true;
        new Notification(`You may be running low on ${item.name}. Time to refill?`);
      }
    });
    writeNotificationCache(cache);
  }

  function readNotificationCache() {
    try {
      return JSON.parse(localStorage.getItem(MEDICATION_NOTIFICATION_CACHE_KEY) || '{}');
    } catch (error) {
      return {};
    }
  }

  function writeNotificationCache(cache) {
    localStorage.setItem(MEDICATION_NOTIFICATION_CACHE_KEY, JSON.stringify(cache));
  }

  function estimateRefillPercent(item) {
    if (!Number.isFinite(item.refillQty)) {
      return 0;
    }
    const dailyUse = item.frequency === 'three_times_daily' ? 3 : item.frequency === 'twice_daily' ? 2 : 1;
    const baseline = Math.max(item.refillQty, dailyUse * 14);
    return (item.refillQty / baseline) * 100;
  }

  function openDoctorVisitModal(id = null) {
    editingVisitId = id;
    visitAttachmentDrafts = [];
    const visit = state.doctorVisits.find((entry) => entry.id === id) || null;
    document.getElementById('health-visit-title').textContent = visit ? 'Edit Doctor Visit' : 'Add Doctor Visit';
    document.getElementById('health-visit-date').value = visit?.date || todayStr();
    document.getElementById('health-visit-followup').value = visit?.followUpDate || '';
    document.getElementById('health-visit-doctor').value = visit?.doctorName || '';
    document.getElementById('health-visit-specialty').value = visit?.specialty || '';
    document.getElementById('health-visit-clinic').value = visit?.clinic || '';
    document.getElementById('health-visit-reason').value = visit?.reason || '';
    document.getElementById('health-visit-diagnosis').value = visit?.diagnosis || '';
    document.getElementById('health-visit-notes').value = visit?.notes || '';
    visitAttachmentDrafts = visit?.attachments ? [...visit.attachments] : [];
    renderVisitAttachmentPreview();
    renderVisitReportLinks(visit?.linkedReportIds || []);
    document.getElementById('health-visit-status').textContent = '';
    document.getElementById('overlay-health-visit').classList.add('open');
  }

  function renderVisitReportLinks(selectedIds) {
    const container = document.getElementById('health-visit-report-links');
    if (!container) {
      return;
    }
    const selected = new Set(selectedIds || []);
    container.innerHTML = state.bloodTests.length
      ? state.bloodTests.map((report) => `<label class="checkbox-row"><input type="checkbox" class="health-visit-report-checkbox" value="${escAttr(report.id)}" ${selected.has(report.id) ? 'checked' : ''}><span>${escHtml(formatShortDate(report.date))} · ${escHtml(report.labName || 'Blood test')}</span></label>`).join('')
      : '<div class="health-inline-note">No blood tests available to link yet.</div>';
  }

  async function handleVisitAttachments(event) {
    const files = Array.from(event?.target?.files || []);
    if (!files.length) {
      return;
    }
    const images = await Promise.all(files.map((file) => readFileAsDataUrl(file)));
    visitAttachmentDrafts.push(...images);
    renderVisitAttachmentPreview();
    event.target.value = '';
  }

  function renderVisitAttachmentPreview() {
    const container = document.getElementById('health-visit-attachment-preview');
    if (!container) {
      return;
    }
    container.innerHTML = visitAttachmentDrafts.map((src, index) => `<div class="health-thumb-wrap"><img class="health-thumb" src="${escAttr(src)}" alt="Visit attachment"><button class="health-thumb-remove" type="button" onclick="removeVisitAttachment(${index})">×</button></div>`).join('');
  }

  function removeVisitAttachment(index) {
    visitAttachmentDrafts.splice(index, 1);
    renderVisitAttachmentPreview();
  }

  function saveDoctorVisit() {
    const status = document.getElementById('health-visit-status');
    const reason = document.getElementById('health-visit-reason').value.trim();
    const notes = document.getElementById('health-visit-notes').value.trim();
    if (!reason) {
      status.textContent = 'Reason for visit is required.';
      return;
    }
    const visit = normalizeDoctorVisit({
      id: editingVisitId || uid(),
      date: document.getElementById('health-visit-date').value || todayStr(),
      doctorName: document.getElementById('health-visit-doctor').value.trim(),
      specialty: document.getElementById('health-visit-specialty').value.trim(),
      clinic: document.getElementById('health-visit-clinic').value.trim(),
      reason,
      diagnosis: document.getElementById('health-visit-diagnosis').value.trim(),
      notes,
      followUpDate: document.getElementById('health-visit-followup').value,
      attachments: [...visitAttachmentDrafts],
      linkedReportIds: Array.from(document.querySelectorAll('.health-visit-report-checkbox:checked')).map((node) => node.value),
      created_at: state.doctorVisits.find((entry) => entry.id === editingVisitId)?.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    const index = state.doctorVisits.findIndex((entry) => entry.id === visit.id);
    if (index >= 0) {
      state.doctorVisits[index] = visit;
    } else {
      state.doctorVisits.unshift(visit);
    }
    saveState();
    closeModal('health-visit');
    renderHealthPage();
    renderTodayHealthCard();
    showToast('Visit saved');
  }

  function deleteDoctorVisit(id) {
    state.doctorVisits = state.doctorVisits.filter((item) => item.id !== id);
    saveState();
    renderHealthPage();
    renderTodayHealthCard();
    showToast('Visit removed');
  }

  function getLatestBodyMetric() {
    return [...state.bodyMetrics].sort((a, b) => b.date.localeCompare(a.date))[0] || null;
  }

  function getPreviousBodyMetric() {
    return [...state.bodyMetrics].sort((a, b) => b.date.localeCompare(a.date))[1] || null;
  }

  function getLatestBloodTest() {
    return [...state.bloodTests].sort((a, b) => b.date.localeCompare(a.date))[0] || null;
  }

  function getUpcomingFollowUps() {
    return state.doctorVisits.filter((visit) => isFollowUpSoon(visit.followUpDate)).sort((a, b) => a.followUpDate.localeCompare(b.followUpDate));
  }

  function isFollowUpSoon(date) {
    const days = getDaysUntil(date);
    return Number.isFinite(days) && days >= 0 && days <= 7;
  }

  function getDaysUntil(date) {
    if (!date) {
      return null;
    }
    const target = new Date(`${date}T12:00:00`);
    if (Number.isNaN(target.getTime())) {
      return null;
    }
    const today = new Date(`${todayStr()}T12:00:00`);
    return Math.round((target - today) / 86400000);
  }

  function buildMarkerExplanation(marker) {
    const lowerName = marker.name.toLowerCase();
    if (lowerName.includes('ldl')) {
      return marker.status === 'high'
        ? 'Your LDL is above the reference range. Higher LDL is commonly linked to cardiovascular risk over time.'
        : 'Your LDL is lower than the listed reference range. Confirm how your lab interprets this with your clinician.';
    }
    if (lowerName.includes('hba1c') || lowerName.includes('glucose')) {
      return marker.status === 'high'
        ? 'This marker is above range, which can suggest your blood sugar has been running higher than ideal.'
        : 'This marker is below range, which can happen with under-fuelling or medication effects.';
    }
    if (lowerName.includes('vitamin d')) {
      return marker.status === 'low'
        ? 'Vitamin D below range is common and may affect bone health, recovery, and general wellbeing.'
        : 'Vitamin D is above range. Very high levels should be reviewed with a clinician.';
    }
    if (lowerName.includes('creatinine') || lowerName.includes('egfr')) {
      return 'This marker helps give context on kidney function and hydration status.';
    }
    if (lowerName.includes('alt') || lowerName.includes('ast') || lowerName.includes('ggt')) {
      return 'This marker gives context on liver stress and should be interpreted alongside the full panel.';
    }
    return `Your ${marker.name} is ${marker.status}. It is outside the lab reference range and worth reviewing in context with the rest of your results.`;
  }

  function formatReferenceRange(marker) {
    const min = Number.isFinite(marker.referenceMin) ? marker.referenceMin : null;
    const max = Number.isFinite(marker.referenceMax) ? marker.referenceMax : null;
    if (min !== null && max !== null) {
      return `${min}–${max} ${marker.unit}`;
    }
    if (min !== null) {
      return `>${min} ${marker.unit}`;
    }
    if (max !== null) {
      return `<${max} ${marker.unit}`;
    }
    return `No reference range`;
  }

  function formatLongDate(date) {
    const parsed = new Date(`${date}T12:00:00`);
    return parsed.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  }

  function formatShortDate(date) {
    const parsed = new Date(`${date}T12:00:00`);
    return parsed.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  }

  function formatDateTime(iso) {
    const parsed = new Date(iso);
    return parsed.toLocaleString();
  }

  function daysBetween(dateA, dateB) {
    const a = new Date(`${dateA}T12:00:00`);
    const b = new Date(`${dateB}T12:00:00`);
    return Math.round(Math.abs(a - b) / 86400000);
  }

  function shiftDate(date, deltaDays) {
    const base = new Date(`${date}T12:00:00`);
    base.setDate(base.getDate() + deltaDays);
    return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}-${String(base.getDate()).padStart(2, '0')}`;
  }

  function escAttr(value) {
    return String(value || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
      reader.onerror = () => reject(new Error('File could not be read.'));
      reader.readAsDataURL(file);
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    ensureHealthScaffold();
    renderTodayHealthCard();
    renderHealthPage();
  });

  window.switchHealthTab = switchHealthTab;
  window.openHealthFromToday = openHealthFromToday;
  window.toggleBloodTestCard = toggleBloodTestCard;
  window.toggleBloodInsight = toggleBloodInsight;
  window.setBodyRangeMode = setBodyRangeMode;
  window.toggleMedicationCard = toggleMedicationCard;
  window.toggleVisitCard = toggleVisitCard;
  window.openBloodTestModal = openBloodTestModal;
  window.setBloodFormStep = setBloodFormStep;
  window.goBloodFormStep = goBloodFormStep;
  window.handleBloodReportPhoto = handleBloodReportPhoto;
  window.clearBloodReportPhoto = clearBloodReportPhoto;
  window.addCustomBloodMarkerRow = addCustomBloodMarkerRow;
  window.removeCustomBloodMarkerRow = removeCustomBloodMarkerRow;
  window.updateBloodMarkerEditorStatus = updateBloodMarkerEditorStatus;
  window.saveBloodTestReport = saveBloodTestReport;
  window.promptDeleteBloodTest = promptDeleteBloodTest;
  window.openBodyMetricModal = openBodyMetricModal;
  window.saveBodyMetricEntry = saveBodyMetricEntry;
  window.deleteBodyMetricEntry = deleteBodyMetricEntry;
  window.openMedicationModal = openMedicationModal;
  window.toggleMedicationCustomFrequency = toggleMedicationCustomFrequency;
  window.toggleMedicationReminderFields = toggleMedicationReminderFields;
  window.saveMedication = saveMedication;
  window.startMedicationHold = startMedicationHold;
  window.cancelMedicationHold = cancelMedicationHold;
  window.markMedicationTaken = markMedicationTaken;
  window.openDoctorVisitModal = openDoctorVisitModal;
  window.handleVisitAttachments = handleVisitAttachments;
  window.removeVisitAttachment = removeVisitAttachment;
  window.saveDoctorVisit = saveDoctorVisit;
  window.deleteDoctorVisit = deleteDoctorVisit;
})();

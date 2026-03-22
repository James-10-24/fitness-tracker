(function () {
  const WORKOUT_DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  const WORKOUT_DAY_LABELS = {
    mon: "Mon",
    tue: "Tue",
    wed: "Wed",
    thu: "Thu",
    fri: "Fri",
    sat: "Sat",
    sun: "Sun"
  };
  const EXERCISE_FILTERS = ["All", "Chest", "Back", "Shoulders", "Arms", "Legs", "Core", "Cardio", "Flexibility"];
  const ALL_EQUIPMENT = ["All", "Barbell", "Dumbbells", "Cable", "Machine", "Bodyweight", "Dumbbell", "Band", "Kettlebell", "Other"];
  const PLATE_SIZES = [25, 20, 15, 10, 5, 2.5, 1.25];

  const ex = (id, name, muscleGroup, inputType, equipment, instructions = "") => ({
    id,
    name,
    muscleGroup,
    inputType,
    equipment,
    isCustom: false,
    instructions
  });

  const BUILTIN_EXERCISES = [
    ex("ex-barbell-bench", "Barbell Bench Press", "Chest", "reps_weight", "Barbell", "Press from chest with feet planted."),
    ex("ex-incline-dumbbell-press", "Incline Dumbbell Press", "Chest", "reps_weight", "Dumbbells", "Keep shoulder blades pinned back."),
    ex("ex-push-up", "Push-Up", "Chest", "reps_weight", "Bodyweight", "Maintain a rigid plank."),
    ex("ex-cable-fly", "Cable Fly", "Chest", "reps_weight", "Cable", "Sweep hands together with soft elbows."),
    ex("ex-pec-deck", "Pec Deck", "Chest", "reps_weight", "Machine", "Control the stretch and squeeze."),
    ex("ex-chest-dip", "Chest Dip", "Chest", "reps_weight", "Bodyweight", "Lean forward to bias chest."),
    ex("ex-lat-pulldown", "Lat Pulldown", "Back", "reps_weight", "Cable", "Pull elbows toward the ribs."),
    ex("ex-pull-up", "Pull-Up", "Back", "reps_weight", "Bodyweight", "Start from a dead hang."),
    ex("ex-barbell-row", "Barbell Row", "Back", "reps_weight", "Barbell", "Brace the torso and row to lower ribs."),
    ex("ex-seated-cable-row", "Seated Cable Row", "Back", "reps_weight", "Cable", "Lead with elbows and pause at the body."),
    ex("ex-single-arm-dumbbell-row", "Single-Arm Dumbbell Row", "Back", "reps_weight", "Dumbbell", "Keep the chest supported or torso stable."),
    ex("ex-face-pull", "Face Pull", "Back", "reps_weight", "Cable", "Pull toward the face with elbows high."),
    ex("ex-deadlift", "Deadlift", "Back", "reps_weight", "Barbell", "Drive through the floor and keep lats tight."),
    ex("ex-back-extension", "Back Extension", "Back", "reps_weight", "Bodyweight", "Move through the hips, not the low back."),
    ex("ex-overhead-press", "Overhead Press", "Shoulders", "reps_weight", "Barbell", "Stack wrist, elbow, and shoulder."),
    ex("ex-seated-dumbbell-press", "Seated Dumbbell Press", "Shoulders", "reps_weight", "Dumbbells", "Press up without flaring ribs."),
    ex("ex-lateral-raise", "Lateral Raise", "Shoulders", "reps_weight", "Dumbbells", "Raise to shoulder height with control."),
    ex("ex-rear-delt-fly", "Rear Delt Fly", "Shoulders", "reps_weight", "Dumbbells", "Keep arms slightly bent and sweep wide."),
    ex("ex-upright-row", "Upright Row", "Shoulders", "reps_weight", "Barbell", "Use a comfortable range and grip width."),
    ex("ex-arnold-press", "Arnold Press", "Shoulders", "reps_weight", "Dumbbells", "Rotate palms smoothly during the press."),
    ex("ex-barbell-curl", "Barbell Curl", "Arms", "reps_weight", "Barbell", "Keep elbows tucked and torso still."),
    ex("ex-hammer-curl", "Hammer Curl", "Arms", "reps_weight", "Dumbbells", "Use a neutral grip throughout."),
    ex("ex-incline-dumbbell-curl", "Incline Dumbbell Curl", "Arms", "reps_weight", "Dumbbells", "Let biceps stretch at the bottom."),
    ex("ex-tricep-pushdown", "Tricep Pushdown", "Arms", "reps_weight", "Cable", "Lock elbows close to your sides."),
    ex("ex-overhead-tricep-extension", "Overhead Tricep Extension", "Arms", "reps_weight", "Dumbbell", "Extend fully without flaring elbows."),
    ex("ex-skullcrusher", "Skullcrusher", "Arms", "reps_weight", "Barbell", "Lower with elbows fixed over shoulders."),
    ex("ex-close-grip-bench", "Close-Grip Bench Press", "Arms", "reps_weight", "Barbell", "Grip just inside shoulder width."),
    ex("ex-tricep-dip", "Tricep Dip", "Arms", "reps_weight", "Bodyweight", "Stay upright to bias triceps."),
    ex("ex-back-squat", "Back Squat", "Legs", "reps_weight", "Barbell", "Brace hard and squat to depth you control."),
    ex("ex-front-squat", "Front Squat", "Legs", "reps_weight", "Barbell", "Keep elbows high and torso tall."),
    ex("ex-leg-press", "Leg Press", "Legs", "reps_weight", "Machine", "Control the eccentric and avoid butt wink."),
    ex("ex-romanian-deadlift", "Romanian Deadlift", "Legs", "reps_weight", "Barbell", "Hinge through the hips and keep bar close."),
    ex("ex-lunge", "Lunge", "Legs", "reps_weight", "Dumbbells", "Step long enough to keep front heel grounded."),
    ex("ex-bulgarian-split-squat", "Bulgarian Split Squat", "Legs", "reps_weight", "Dumbbells", "Descend straight down with balance."),
    ex("ex-leg-extension", "Leg Extension", "Legs", "reps_weight", "Machine", "Pause at the top without swinging."),
    ex("ex-leg-curl", "Leg Curl", "Legs", "reps_weight", "Machine", "Curl with hips pinned to the pad."),
    ex("ex-calf-raise", "Standing Calf Raise", "Legs", "reps_weight", "Machine", "Pause at the stretch and peak."),
    ex("ex-hip-thrust", "Hip Thrust", "Legs", "reps_weight", "Barbell", "Drive through heels and tuck ribs down."),
    ex("ex-plank", "Plank", "Core", "time", "Bodyweight", "Brace glutes and abs in a straight line."),
    ex("ex-side-plank", "Side Plank", "Core", "time", "Bodyweight", "Stack shoulders and hips."),
    ex("ex-hanging-leg-raise", "Hanging Leg Raise", "Core", "reps_weight", "Bodyweight", "Posteriorly tilt the pelvis at the top."),
    ex("ex-cable-crunch", "Cable Crunch", "Core", "reps_weight", "Cable", "Curl ribs toward hips."),
    ex("ex-ab-wheel", "Ab Wheel Rollout", "Core", "reps_weight", "Ab Wheel", "Keep hips tucked while reaching long."),
    ex("ex-russian-twist", "Russian Twist", "Core", "reps_weight", "Bodyweight", "Rotate the torso without collapsing chest."),
    ex("ex-bicycle-crunch", "Bicycle Crunch", "Core", "reps_weight", "Bodyweight", "Bring shoulder to opposite knee."),
    ex("ex-row-erg", "Row Erg", "Cardio", "distance_time", "Machine", "Track both distance and time."),
    ex("ex-treadmill-run", "Treadmill Run", "Cardio", "distance_time", "Treadmill", "Use for runs and jogs."),
    ex("ex-outdoor-run", "Outdoor Run", "Cardio", "distance_time", "Outdoor", "Track distance and duration."),
    ex("ex-stationary-bike", "Stationary Bike", "Cardio", "time", "Bike", "Use duration when distance is not available."),
    ex("ex-jump-rope", "Jump Rope", "Cardio", "time", "Rope", "Keep jumps compact and wrists relaxed."),
    ex("ex-walking", "Walking", "Cardio", "distance_time", "Outdoor", "Steady paced walk."),
    ex("ex-yoga-flow", "Yoga Flow", "Flexibility", "time", "Mat", "Continuous guided flow."),
    ex("ex-hamstring-stretch", "Hamstring Stretch", "Flexibility", "time", "Bodyweight", "Hold with long spine and relaxed neck."),
    ex("ex-hip-flexor-stretch", "Hip Flexor Stretch", "Flexibility", "time", "Bodyweight", "Posteriorly tilt pelvis during hold."),
    ex("ex-shoulder-mobility", "Shoulder Mobility Drill", "Flexibility", "time", "Band", "Slow controlled reps or holds."),
    ex("ex-foam-roll-quads", "Foam Roll Quads", "Flexibility", "time", "Foam Roller", "Move slowly through tight areas.")
  ];

  const WORKOUT_TEMPLATES = [
    {
      id: "tpl-ppl-6",
      name: "Push Pull Legs (6 day)",
      description: "Push / Pull / Legs repeated twice per week",
      weekdays: ["mon", "tue", "wed", "thu", "fri", "sat"],
      exercises: [
        { exerciseId: "ex-barbell-bench", defaultSets: 4, restSeconds: 120 },
        { exerciseId: "ex-incline-dumbbell-press", defaultSets: 3, restSeconds: 90 },
        { exerciseId: "ex-overhead-press", defaultSets: 3, restSeconds: 90 },
        { exerciseId: "ex-lateral-raise", defaultSets: 3, restSeconds: 60 },
        { exerciseId: "ex-tricep-pushdown", defaultSets: 3, restSeconds: 60 }
      ]
    },
    {
      id: "tpl-upper-lower-4",
      name: "Upper Lower Split (4 day)",
      description: "Two upper and two lower sessions each week",
      weekdays: ["mon", "tue", "thu", "fri"],
      exercises: [
        { exerciseId: "ex-barbell-bench", defaultSets: 4, restSeconds: 120 },
        { exerciseId: "ex-lat-pulldown", defaultSets: 4, restSeconds: 90 },
        { exerciseId: "ex-overhead-press", defaultSets: 3, restSeconds: 90 },
        { exerciseId: "ex-back-squat", defaultSets: 4, restSeconds: 120 },
        { exerciseId: "ex-romanian-deadlift", defaultSets: 3, restSeconds: 120 },
        { exerciseId: "ex-calf-raise", defaultSets: 3, restSeconds: 60 }
      ]
    },
    {
      id: "tpl-full-body-3",
      name: "Full Body 3x per week",
      description: "Balanced full-body training three days per week",
      weekdays: ["mon", "wed", "fri"],
      exercises: [
        { exerciseId: "ex-back-squat", defaultSets: 3, restSeconds: 120 },
        { exerciseId: "ex-barbell-bench", defaultSets: 3, restSeconds: 90 },
        { exerciseId: "ex-barbell-row", defaultSets: 3, restSeconds: 90 },
        { exerciseId: "ex-overhead-press", defaultSets: 2, restSeconds: 90 },
        { exerciseId: "ex-plank", defaultSets: 3, restSeconds: 45 }
      ]
    },
    {
      id: "tpl-beginner-5x5",
      name: "Beginner 5×5 (3 day)",
      description: "Simple barbell progression three days per week",
      weekdays: ["mon", "wed", "fri"],
      exercises: [
        { exerciseId: "ex-back-squat", defaultSets: 5, restSeconds: 150 },
        { exerciseId: "ex-barbell-bench", defaultSets: 5, restSeconds: 150 },
        { exerciseId: "ex-barbell-row", defaultSets: 5, restSeconds: 150 },
        { exerciseId: "ex-overhead-press", defaultSets: 5, restSeconds: 150 },
        { exerciseId: "ex-deadlift", defaultSets: 1, restSeconds: 180 }
      ]
    }
  ];

  let workoutTab = "home";
  let workoutBuilderDraft = null;
  let workoutBuilderExpandedIndex = -1;
  let workoutLibraryContext = "browse";
  let workoutLibraryTargetExerciseIndex = -1;
  let workoutLibraryFilter = "All";
  let workoutEquipmentFilter = "All";
  let workoutTemplatePickerOpen = false;
  let workoutHistoryExpandedId = null;
  let workoutProgressExerciseId = "";
  let workoutSummaryDraft = null;
  let workoutDragIndex = -1;
  let workoutTouchStartX = 0;
  let workoutTouchStartY = 0;
  let workoutSetHoldHandle = null;
  let workoutElapsedInterval = null;
  let workoutRestInterval = null;
  let workoutPlateCalcBar = 20;
  let archivedRoutinesExpanded = false;
  let actionSheetActions = [];
  let actionSheetOnClose = null;

  const originalCreateInitialState = createInitialState;
  createInitialState = function () {
    return {
      ...originalCreateInitialState(),
      customExercises: [],
      routines: [],
      archivedRoutines: [],
      workoutSessions: [],
      activeWorkoutDraft: null
    };
  };

  const originalNormalizeAppState = normalizeAppState;
  normalizeAppState = function (rawState) {
    const nextState = originalNormalizeAppState(rawState);
    nextState.customExercises = Array.isArray(nextState.customExercises)
      ? nextState.customExercises.map(normalizeExerciseRecord)
      : [];
    nextState.routines = Array.isArray(nextState.routines)
      ? nextState.routines.map(normalizeRoutineRecord)
      : [];
    nextState.archivedRoutines = Array.isArray(nextState.archivedRoutines)
      ? nextState.archivedRoutines.map(normalizeRoutineRecord)
      : [];
    nextState.workoutSessions = Array.isArray(nextState.workoutSessions)
      ? nextState.workoutSessions.map(normalizeWorkoutSession)
      : [];
    nextState.activeWorkoutDraft = nextState.activeWorkoutDraft
      ? normalizeWorkoutDraft(nextState.activeWorkoutDraft)
      : null;
    return nextState;
  };

  state = normalizeAppState(state);

  const originalRenderApp = renderApp;
  renderApp = function () {
    originalRenderApp();
    renderWorkoutPage();
  };

  const originalShowPage = showPage;
  showPage = function (page) {
    originalShowPage(page);
    if (page === "workouts") {
      renderWorkoutPage();
    }
  };

  const originalCloseModal = closeModal;
  closeModal = function (name) {
    originalCloseModal(name);
    if (name === "workout-builder") {
      workoutBuilderExpandedIndex = -1;
      document.getElementById("workout-builder-status").textContent = "";
    }
    if (name === "exercise-library") {
      workoutLibraryTargetExerciseIndex = -1;
    }
    if (name === "custom-exercise") {
      document.getElementById("custom-exercise-status").textContent = "";
    }
    if (name === "workout-summary") {
      workoutSummaryDraft = null;
    }
  };

  function openActionSheet(title, actions, options = {}) {
    const overlay = document.getElementById("overlay-action-sheet");
    const titleEl = document.getElementById("action-sheet-title");
    const bodyEl = document.getElementById("action-sheet-body");
    if (!overlay || !titleEl || !bodyEl) {
      return;
    }

    const safeActions = Array.isArray(actions) ? actions.filter(Boolean) : [];
    actionSheetActions = safeActions;
    actionSheetOnClose = typeof options.onClose === "function" ? options.onClose : null;
    titleEl.textContent = title || "";
    bodyEl.innerHTML = `
      ${options.message ? `<div class="action-sheet-message">${escHtml(options.message)}</div>` : ""}
      ${safeActions.map((action, index) => `
        <button
          class="action-sheet-btn action-sheet-btn--${action.style || "default"}"
          type="button"
          data-action-index="${index}">
          ${escHtml(action.label)}
        </button>
      `).join("")}
    `;

    bodyEl.querySelectorAll("[data-action-index]").forEach((button) => {
      button.addEventListener("click", () => {
        const index = Number(button.getAttribute("data-action-index"));
        const action = actionSheetActions[index];
        closeActionSheet();
        if (action?.onClick) {
          action.onClick();
        }
      });
    });

    overlay.classList.add("open");
  }

  function closeActionSheet() {
    const overlay = document.getElementById("overlay-action-sheet");
    const titleEl = document.getElementById("action-sheet-title");
    const bodyEl = document.getElementById("action-sheet-body");
    if (overlay) {
      overlay.classList.remove("open");
    }
    if (titleEl) {
      titleEl.textContent = "";
    }
    if (bodyEl) {
      bodyEl.innerHTML = "";
    }
    actionSheetActions = [];
    const onClose = actionSheetOnClose;
    actionSheetOnClose = null;
    if (onClose) {
      onClose();
    }
  }

  function openConfirmActionSheet(title, message, confirmLabel, onConfirm, confirmStyle = "default") {
    openActionSheet(title, [
      {
        label: confirmLabel,
        style: confirmStyle,
        onClick: onConfirm
      }
    ], { message });
  }

  const originalSyncStateToCloud = syncStateToCloud;
  syncStateToCloud = async function () {
    await originalSyncStateToCloud();
    if (!supabaseClient || !currentUser) {
      return;
    }
    const userId = currentUser.id;
    await Promise.all([
      replaceUserRows("workout_custom_exercises", state.customExercises.map((exercise) => ({
        id: exercise.id,
        user_id: userId,
        name: exercise.name,
        muscle_group: exercise.muscleGroup,
        input_type: exercise.inputType,
        equipment: exercise.equipment,
        is_custom: !!exercise.isCustom,
        instructions: exercise.instructions || "",
        created_at: exercise.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString()
      }))),
      replaceUserRows("workout_routines", state.routines.map((routine) => ({
        id: routine.id,
        user_id: userId,
        name: routine.name,
        weekdays: routine.weekdays || [],
        exercises: routine.exercises || [],
        is_archived: false,
        archived_at: null,
        created_at: routine.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString()
      })).concat((state.archivedRoutines || []).map((routine) => ({
        id: routine.id,
        user_id: userId,
        name: routine.name,
        weekdays: routine.weekdays || [],
        exercises: routine.exercises || [],
        is_archived: true,
        archived_at: routine.archivedAt || new Date().toISOString(),
        created_at: routine.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString()
      })))),
      replaceUserRows("workout_sessions", state.workoutSessions.map((session) => ({
        id: session.id,
        user_id: userId,
        routine_id: session.routineId || null,
        routine_name: session.routineName || "Freeform Workout",
        logged_on: session.date,
        duration_seconds: Math.round(session.durationSeconds || 0),
        notes: session.notes || "",
        difficulty_rating: session.difficultyRating || null,
        total_volume: roundNutrient(computeWorkoutVolume(session)),
        exercise_logs: session.exerciseLogs || [],
        personal_bests: session.personalBests || [],
        is_freeform: !!session.isFreeform,
        created_at: session.created_at || new Date().toISOString()
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
      console.error("Failed to read local workout cache", error);
    }

    await originalLoadUserState(userId);

    if (!supabaseClient || !userId) {
      return;
    }

    const [exerciseResult, routineResult, sessionResult] = await Promise.all([
      supabaseClient.from("workout_custom_exercises").select("*").eq("user_id", userId).order("created_at", { ascending: true }),
      supabaseClient.from("workout_routines").select("*").eq("user_id", userId).order("created_at", { ascending: true }),
      supabaseClient.from("workout_sessions").select("*").eq("user_id", userId).order("created_at", { ascending: true })
    ]);

    const errors = [exerciseResult.error, routineResult.error, sessionResult.error].filter(Boolean);
    if (errors.length) {
      throw errors[0];
    }

    const remoteExercises = (exerciseResult.data || []).map((row) => normalizeExerciseRecord({
      id: row.id,
      name: row.name,
      muscleGroup: row.muscle_group,
      inputType: row.input_type,
      equipment: row.equipment,
      isCustom: row.is_custom,
      instructions: row.instructions,
      created_at: row.created_at,
      updated_at: row.updated_at
    }));
    const remoteRoutines = (routineResult.data || []).map((row) => normalizeRoutineRecord({
      id: row.id,
      name: row.name,
      weekdays: row.weekdays,
      exercises: row.exercises,
      archivedAt: row.archived_at || null,
      created_at: row.created_at,
      updated_at: row.updated_at
    }));
    const remoteSessions = (sessionResult.data || []).map((row) => normalizeWorkoutSession({
      id: row.id,
      routineId: row.routine_id,
      routineName: row.routine_name,
      date: row.logged_on,
      durationSeconds: row.duration_seconds,
      notes: row.notes,
      difficultyRating: row.difficulty_rating,
      exerciseLogs: row.exercise_logs,
      personalBests: row.personal_bests,
      isFreeform: row.is_freeform,
      created_at: row.created_at
    }));
    const activeRoutines = remoteRoutines.filter((routine) => !routine.archivedAt);
    const archivedRoutines = remoteRoutines.filter((routine) => !!routine.archivedAt);

    const remoteHasWorkoutData = Boolean(remoteExercises.length || remoteRoutines.length || remoteSessions.length);
    const localHasWorkoutData = hasMeaningfulWorkoutData(localBefore);

    if (!remoteHasWorkoutData && localHasWorkoutData) {
      state.customExercises = localBefore.customExercises;
      state.routines = localBefore.routines;
      state.archivedRoutines = localBefore.archivedRoutines;
      state.workoutSessions = localBefore.workoutSessions;
      state.activeWorkoutDraft = localBefore.activeWorkoutDraft;
      saveLocalState();
      renderWorkoutPage();
      setTimeout(() => {
        syncStateToCloud().catch((error) => {
          console.error("Workout import failed", error);
          showToast(`Workout import failed: ${formatSupabaseError(error)}`);
        });
      }, 0);
      return;
    }

    state.customExercises = remoteExercises;
    state.routines = activeRoutines;
    state.archivedRoutines = archivedRoutines;
    state.workoutSessions = remoteSessions;
    saveLocalState();
    renderWorkoutPage();
  };

  function hasMeaningfulWorkoutData(candidateState) {
    return Boolean(
      candidateState?.customExercises?.length
      || candidateState?.routines?.length
      || candidateState?.archivedRoutines?.length
      || candidateState?.workoutSessions?.length
      || candidateState?.activeWorkoutDraft
    );
  }

  function normalizeExerciseRecord(exercise) {
    if (!exercise) {
      return null;
    }
    return {
      id: exercise.id || uid(),
      name: String(exercise.name || "").trim(),
      muscleGroup: normalizeExerciseMuscleGroup(exercise.muscleGroup),
      inputType: normalizeExerciseInputType(exercise.inputType),
      equipment: String(exercise.equipment || "Bodyweight").trim() || "Bodyweight",
      isCustom: !!exercise.isCustom,
      instructions: String(exercise.instructions || "").trim(),
      created_at: exercise.created_at,
      updated_at: exercise.updated_at
    };
  }

  function normalizeRoutineRecord(routine) {
    return {
      id: routine?.id || uid(),
      name: String(routine?.name || "").trim(),
      weekdays: Array.isArray(routine?.weekdays)
        ? routine.weekdays.map(normalizeWorkoutWeekday).filter(Boolean)
        : [],
      exercises: Array.isArray(routine?.exercises)
        ? routine.exercises.map((item, index) => normalizeRoutineExercise(item, index)).filter(Boolean)
        : [],
      archivedAt: routine?.archivedAt || null,
      created_at: routine?.created_at,
      updated_at: routine?.updated_at
    };
  }

  function normalizeRoutineExercise(exercise, fallbackOrder = 0) {
    if (!exercise?.exerciseId) {
      return null;
    }
    return {
      exerciseId: exercise.exerciseId,
      order: normalizePositiveInteger(exercise.order, fallbackOrder + 1),
      defaultSets: normalizePositiveInteger(exercise.defaultSets, 3),
      restSeconds: normalizePositiveInteger(exercise.restSeconds, 90)
    };
  }

  function normalizeWorkoutSession(session) {
    return {
      id: session?.id || uid(),
      routineId: session?.routineId || null,
      routineName: String(session?.routineName || "Freeform Workout"),
      date: session?.date || todayStr(),
      durationSeconds: Math.max(0, Math.round(session?.durationSeconds || 0)),
      exerciseLogs: Array.isArray(session?.exerciseLogs)
        ? session.exerciseLogs.map(normalizeExerciseLog).filter(Boolean)
        : [],
      personalBests: Array.isArray(session?.personalBests) ? session.personalBests.map(normalizeWorkoutPr) : [],
      notes: String(session?.notes || ""),
      difficultyRating: Number.isInteger(session?.difficultyRating) && session.difficultyRating >= 1 && session.difficultyRating <= 5
        ? session.difficultyRating
        : null,
      isFreeform: !!session?.isFreeform,
      created_at: session?.created_at || new Date().toISOString()
    };
  }

  function normalizeWorkoutDraft(draft) {
    return {
      id: draft?.id || uid(),
      routineId: draft?.routineId || null,
      routineName: String(draft?.routineName || "Freeform Workout"),
      date: draft?.date || todayStr(),
      created_at: draft?.created_at || new Date().toISOString(),
      startedAt: draft?.startedAt || null,
      currentExerciseIndex: clamp(Number(draft?.currentExerciseIndex || 0), 0, Math.max((draft?.sessionExercises?.length || 1) - 1, 0)),
      sessionExercises: Array.isArray(draft?.sessionExercises)
        ? draft.sessionExercises.map((item, index) => normalizeRoutineExercise(item, index)).filter(Boolean)
        : [],
      exerciseLogs: Array.isArray(draft?.exerciseLogs)
        ? draft.exerciseLogs.map(normalizeExerciseLog).filter(Boolean)
        : [],
      personalBests: Array.isArray(draft?.personalBests) ? draft.personalBests.map(normalizeWorkoutPr) : [],
      notes: String(draft?.notes || ""),
      difficultyRating: Number.isInteger(draft?.difficultyRating) && draft.difficultyRating >= 1 && draft.difficultyRating <= 5
        ? draft.difficultyRating
        : null,
      durationSeconds: Math.max(0, Math.round(draft?.durationSeconds || 0)),
      _restStartedAt: typeof draft?._restStartedAt === "number" ? draft._restStartedAt : null,
      isFreeform: !!draft?.isFreeform
    };
  }

  function normalizeExerciseLog(log) {
    if (!log?.exerciseId) {
      return null;
    }
    return {
      exerciseId: log.exerciseId,
      sets: Array.isArray(log.sets) ? log.sets.map(normalizeWorkoutSet) : []
    };
  }

  function normalizeWorkoutSet(set) {
    return {
      type: normalizeSetType(set?.type),
      reps: normalizePositiveNumber(set?.reps, 0),
      weightKg: normalizePositiveNumber(set?.weightKg, 0),
      durationSeconds: normalizePositiveNumber(set?.durationSeconds, 0),
      distanceKm: normalizePositiveNumber(set?.distanceKm, 0),
      isPersonalBest: !!set?.isPersonalBest,
      completedAt: set?.completedAt || null,
      rpe: (typeof set?.rpe === "number" && set.rpe >= 1 && set.rpe <= 10) ? set.rpe : (set?.rpe === 0 ? 0 : null),
      actualRestSeconds: typeof set?.actualRestSeconds === "number" ? Math.round(set.actualRestSeconds) : null
    };
  }

  function normalizeWorkoutPr(pr) {
    return {
      exerciseId: pr?.exerciseId || "",
      exerciseName: pr?.exerciseName || "Exercise",
      type: pr?.type || "weight",
      value: Number(pr?.value || 0),
      label: pr?.label || "",
      achievedAt: pr?.achievedAt || new Date().toISOString()
    };
  }

  function normalizeWorkoutWeekday(value) {
    const normalized = String(value || "").slice(0, 3).toLowerCase();
    return WORKOUT_DAY_KEYS.includes(normalized) ? normalized : "";
  }

  function normalizeExerciseInputType(value) {
    return ["reps_weight", "time", "distance", "distance_time"].includes(value) ? value : "reps_weight";
  }

  function normalizeExerciseMuscleGroup(value) {
    const normalized = String(value || "").trim();
    return EXERCISE_FILTERS.includes(normalized) && normalized !== "All" ? normalized : "Chest";
  }

  function normalizeSetType(value) {
    return ["warmup", "working", "dropset"].includes(value) ? value : "working";
  }

  function getAllExercises() {
    return [...BUILTIN_EXERCISES, ...state.customExercises].filter(Boolean);
  }

  function getExerciseById(id) {
    return getAllExercises().find((exercise) => exercise.id === id) || null;
  }

  function getRoutineById(id) {
    return state.routines.find((routine) => routine.id === id) || null;
  }

  function getWorkoutWeekday(date = new Date()) {
    return WORKOUT_DAY_KEYS[(date.getDay() + 6) % 7];
  }

  function formatWorkoutWeekdays(weekdays) {
    if (!weekdays?.length) {
      return "No assigned days";
    }
    return weekdays.map((day) => WORKOUT_DAY_LABELS[day]).join(" · ");
  }

  function estimateRoutineDurationMinutes(routine) {
    const seconds = (routine.exercises || []).reduce((sum, item) => sum + ((item.defaultSets || 0) * 45), 0);
    return Math.max(10, Math.round(seconds / 60));
  }

  function renderWorkoutPage() {
    const home = document.getElementById("workout-view-home");
    const history = document.getElementById("workout-view-history");
    const progress = document.getElementById("workout-view-progress");
    if (!home || !history || !progress) {
      return;
    }

    document.getElementById("workout-tab-home")?.classList.toggle("active", workoutTab === "home");
    document.getElementById("workout-tab-history")?.classList.toggle("active", workoutTab === "history");
    document.getElementById("workout-tab-progress")?.classList.toggle("active", workoutTab === "progress");
    home.classList.toggle("active", workoutTab === "home");
    history.classList.toggle("active", workoutTab === "history");
    progress.classList.toggle("active", workoutTab === "progress");

    renderWorkoutResumeBanner();
    renderWorkoutHome();
    renderWorkoutHistory();
    renderWorkoutProgress();
    renderWorkoutBuilder();
    renderExerciseLibrary();
    renderActiveWorkout();
    renderWorkoutSummary();
    renderWorkoutJumpList();
    hydrateCustomExerciseFields();
  }

  function switchWorkoutTab(tab) {
    workoutTab = ["home", "history", "progress"].includes(tab) ? tab : "home";
    renderWorkoutPage();
  }

  function renderWorkoutResumeBanner() {
    const banner = document.getElementById("workout-resume-banner");
    if (!banner) {
      return;
    }
    if (!state.activeWorkoutDraft) {
      banner.classList.add("hidden");
      banner.innerHTML = "";
      return;
    }

    banner.classList.remove("hidden");
    banner.innerHTML = `
      <div>
        <strong>You have an unfinished workout.</strong><br>
        Resume where you left off or discard it.
      </div>
      <div class="workout-inline-actions">
        <button class="btn btn-primary" type="button" onclick="resumeWorkoutDraft()">Resume</button>
        <button class="btn btn-secondary" type="button" onclick="discardWorkoutDraft(true)">Discard</button>
      </div>
    `;
  }

  function renderWorkoutHome() {
    const root = document.getElementById("workout-view-home");
    if (!root) {
      return;
    }
    const assignedRoutine = getAssignedRoutineForToday();
    const routines = state.routines.slice().sort((a, b) => a.name.localeCompare(b.name));

    root.innerHTML = `
      <div class="card workout-home-card">
        <div class="card-label">Today's Routine</div>
        ${assignedRoutine ? renderAssignedRoutineCard(assignedRoutine) : renderRestDayCard()}
      </div>
      <div class="card workout-home-card">
        <div class="card-label">Weekly Streak</div>
        ${renderWorkoutWeekBar()}
      </div>
      <div class="card workout-home-card">
        <div class="card-label">Saved Routines</div>
        <div class="workout-routine-list">
          ${routines.length ? routines.map(renderRoutineCard).join("") : `
            <div class="empty-state">
              <div class="empty-icon"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 5v14"/><path d="M18 5v14"/><path d="M2 9h4"/><path d="M2 15h4"/><path d="M18 9h4"/><path d="M18 15h4"/><path d="M6 12h12"/></svg></div>
              No routines yet.<br>Create your first routine or start a freeform workout.
            </div>
          `}
        </div>
        <div class="today-card-actions workout-home-actions">
          <button class="btn btn-primary" type="button" onclick="openWorkoutBuilder()">New Routine</button>
          <button class="btn btn-secondary" type="button" onclick="startFreeformWorkout()">Start Freeform Workout</button>
          <button class="btn btn-secondary" type="button" onclick="openPlateCalc()">Plate Calculator</button>
          <button class="btn btn-secondary" type="button" onclick="openExerciseLibrary('browse')">Browse Exercises</button>
        </div>
        ${(state.archivedRoutines || []).length ? renderArchivedRoutineSection() : ""}
      </div>
    `;
  }

  function renderArchivedRoutineSection() {
    const archived = (state.archivedRoutines || []).slice().sort((a, b) => a.name.localeCompare(b.name));
    return `
      <div class="workout-archived-section">
        <button class="workout-archived-toggle" type="button" onclick="toggleArchivedRoutines()">
          <span>Archived</span>
          <span>${archivedRoutinesExpanded ? "−" : "+"}</span>
        </button>
        ${archivedRoutinesExpanded ? `
          <div class="workout-routine-list">
            ${archived.map((routine) => `
              <div class="workout-routine-card workout-routine-card--archived">
                <div class="workout-routine-head">
                  <div>
                    <div class="workout-routine-name">${escHtml(routine.name)}</div>
                    <div class="workout-routine-meta">${routine.exercises.length} exercises · archived</div>
                  </div>
                  <div class="workout-inline-actions">
                    <button class="btn btn-secondary" type="button" onclick="promptArchivedRoutineActions('${routine.id}')">Manage</button>
                  </div>
                </div>
              </div>
            `).join("")}
          </div>
        ` : ""}
      </div>
    `;
  }

  function renderAssignedRoutineCard(routine) {
    return `
      <div class="workout-assigned-card">
        <div class="workout-assigned-title">${escHtml(routine.name)}</div>
        <div class="workout-assigned-meta">${routine.exercises.length} exercises · ~${estimateRoutineDurationMinutes(routine)} min · ${escHtml(formatWorkoutWeekdays(routine.weekdays))}</div>
        <div class="workout-inline-actions">
          <button class="btn btn-primary" type="button" onclick="startRoutineWorkout('${routine.id}')">Start Workout</button>
          <button class="btn btn-secondary" type="button" onclick="openWorkoutBuilder('${routine.id}')">Edit Routine</button>
        </div>
      </div>
    `;
  }

  function renderRestDayCard() {
    return `
      <div class="workout-assigned-card">
        <div class="workout-assigned-title">Rest Day</div>
        <div class="workout-assigned-meta">No routine is assigned for today. You can still start any saved routine or train freeform.</div>
        <div class="workout-inline-actions">
          <button class="btn btn-primary" type="button" onclick="startFreeformWorkout()">Start Freeform Workout</button>
          <button class="btn btn-secondary" type="button" onclick="openWorkoutBuilder()">New Routine</button>
        </div>
      </div>
    `;
  }

  function renderRoutineCard(routine) {
    return `
      <div class="workout-routine-card">
        <div class="workout-routine-head">
          <div>
            <div class="workout-routine-name">${escHtml(routine.name)}</div>
            <div class="workout-routine-meta">${routine.exercises.length} exercises · ~${estimateRoutineDurationMinutes(routine)} min</div>
            <div class="workout-routine-days">${escHtml(formatWorkoutWeekdays(routine.weekdays))}</div>
          </div>
          <div class="workout-inline-actions">
            <button class="btn btn-primary" type="button" onclick="startRoutineWorkout('${routine.id}')">Start</button>
            <button class="btn btn-secondary" type="button" onclick="openWorkoutBuilder('${routine.id}')">Edit</button>
            <button class="btn btn-secondary" type="button" onclick="promptRoutineActions('${routine.id}')">More</button>
          </div>
        </div>
      </div>
    `;
  }

  function renderWorkoutWeekBar() {
    const weekDates = getCurrentWeekDates();
    const doneDates = new Set(state.workoutSessions.map((session) => session.date));
    return `
      <div class="workout-week-bar">
        ${weekDates.map((item) => `
          <div class="workout-week-day ${item.date === todayStr() ? "today" : ""}">
            <div class="workout-week-dot ${doneDates.has(item.date) ? "done" : "missed"}"></div>
            <div class="workout-week-label">${item.label}</div>
          </div>
        `).join("")}
      </div>
    `;
  }

  function getCurrentWeekDates() {
    const today = new Date();
    const dayIndex = (today.getDay() + 6) % 7;
    const monday = new Date(today);
    monday.setDate(today.getDate() - dayIndex);
    return WORKOUT_DAY_KEYS.map((key, index) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + index);
      return {
        key,
        label: WORKOUT_DAY_LABELS[key],
        date: toLocalIsoDate(date)
      };
    });
  }

  function toLocalIsoDate(date) {
    const local = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
    return local.toISOString().slice(0, 10);
  }

  function getAssignedRoutineForToday() {
    const todayKey = getWorkoutWeekday();
    return state.routines.find((routine) => (routine.weekdays || []).includes(todayKey)) || null;
  }

  function openWorkoutBuilder(editId = null) {
    workoutTemplatePickerOpen = false;
    workoutBuilderExpandedIndex = -1;
    const deleteBtn = document.getElementById("workout-builder-delete-btn");
    if (editId) {
      const routine = getRoutineById(editId);
      workoutBuilderDraft = routine ? cloneRoutineDraft(routine) : createRoutineDraft();
      document.getElementById("workout-builder-title").textContent = "Edit Routine";
      if (deleteBtn) {
        deleteBtn.classList.toggle("hidden", !routine);
      }
    } else {
      workoutBuilderDraft = createRoutineDraft();
      document.getElementById("workout-builder-title").textContent = "New Routine";
      if (deleteBtn) {
        deleteBtn.classList.add("hidden");
      }
    }
    document.getElementById("overlay-workout-builder").classList.add("open");
    renderWorkoutBuilder();
  }

  function createRoutineDraft() {
    return {
      id: uid(),
      name: "",
      weekdays: [],
      exercises: []
    };
  }

  function cloneRoutineDraft(routine) {
    return {
      id: routine.id,
      name: routine.name,
      weekdays: [...routine.weekdays],
      exercises: routine.exercises.map((item) => ({ ...item }))
    };
  }

  function syncWorkoutBuilderName() {
    if (!workoutBuilderDraft) {
      return;
    }
    const input = document.getElementById("workout-builder-name");
    if (input) {
      workoutBuilderDraft.name = input.value;
    }
  }

  function renderWorkoutBuilder() {
    const root = document.getElementById("workout-builder-exercises");
    const weekdayRow = document.getElementById("workout-builder-weekdays");
    const picker = document.getElementById("workout-template-picker");
    if (!root || !weekdayRow || !picker || !workoutBuilderDraft) {
      return;
    }

    document.getElementById("workout-builder-name").value = workoutBuilderDraft.name;
    document.getElementById("workout-builder-name").oninput = syncWorkoutBuilderName;
    weekdayRow.innerHTML = WORKOUT_DAY_KEYS.map((day) => `
      <button class="workout-weekday-pill ${workoutBuilderDraft.weekdays.includes(day) ? "active" : ""}" type="button" onclick="toggleWorkoutBuilderDay('${day}')">${WORKOUT_DAY_LABELS[day]}</button>
    `).join("");

    picker.classList.toggle("hidden", !workoutTemplatePickerOpen);
    picker.innerHTML = WORKOUT_TEMPLATES.map((template) => `
      <button class="workout-template-card" type="button" onclick="applyWorkoutTemplate('${template.id}')">
        <div class="workout-template-name">${escHtml(template.name)}</div>
        <div class="workout-template-meta">${escHtml(template.description)}</div>
        <div class="workout-template-days">${escHtml(formatWorkoutWeekdays(template.weekdays))}</div>
      </button>
    `).join("");

    if (!workoutBuilderDraft.exercises.length) {
      root.innerHTML = "<div class=\"empty-state\"><div class=\"empty-icon\"><svg width=\"32\" height=\"32\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\"><path d=\"M6 5v14\"/><path d=\"M18 5v14\"/><path d=\"M2 9h4\"/><path d=\"M2 15h4\"/><path d=\"M18 9h4\"/><path d=\"M18 15h4\"/><path d=\"M6 12h12\"/></svg></div>Add exercises to build your routine.</div>";
      return;
    }

    root.innerHTML = workoutBuilderDraft.exercises
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((item, index) => {
        const exercise = getExerciseById(item.exerciseId);
        const expanded = workoutBuilderExpandedIndex === index;
        return `
          <div class="workout-builder-row ${expanded ? "expanded" : ""}" draggable="true"
               ondragstart="setWorkoutDragIndex(${index})"
               ondragover="allowWorkoutDrag(event)"
               ondrop="dropWorkoutExercise(${index})"
               onpointerdown="startWorkoutExerciseHold(${index})"
               onpointerup="cancelWorkoutExerciseHold()"
               onpointerleave="cancelWorkoutExerciseHold()"
               oncontextmenu="return promptDeleteWorkoutExercise(event, ${index})">
            <button class="workout-builder-row-main" type="button" onclick="toggleWorkoutBuilderExercise(${index})">
              <div class="workout-builder-row-info">
                <div class="workout-builder-row-name">${escHtml(exercise?.name || "Exercise")}</div>
                <div class="workout-builder-row-meta">${escHtml(exercise?.muscleGroup || "")}</div>
              </div>
              <div class="workout-builder-row-stats">${item.defaultSets} sets</div>
              <div class="workout-drag-handle">↕</div>
            </button>
            ${expanded ? `
              <div class="workout-builder-row-edit">
                <div class="form-group">
                  <label class="form-label">Default Sets</label>
                  <input class="form-input" type="number" min="1" step="1" value="${item.defaultSets}" oninput="updateWorkoutBuilderExercise(${index}, 'defaultSets', this.value)">
                </div>
                <div class="form-group">
                  <label class="form-label">Rest (sec)</label>
                  <input class="form-input" type="number" min="0" step="5" placeholder="Rest (sec)" value="${item.restSeconds || 90}" oninput="updateWorkoutBuilderExercise(${index}, 'restSeconds', this.value)">
                </div>
              </div>
            ` : ""}
          </div>
        `;
      }).join("");
  }

  function toggleWorkoutTemplatePicker() {
    syncWorkoutBuilderName();
    workoutTemplatePickerOpen = !workoutTemplatePickerOpen;
    renderWorkoutBuilder();
  }

  function applyWorkoutTemplate(templateId) {
    const template = WORKOUT_TEMPLATES.find((entry) => entry.id === templateId);
    if (!template || !workoutBuilderDraft) {
      return;
    }
    workoutBuilderDraft.name = template.name;
    workoutBuilderDraft.weekdays = [...template.weekdays];
    workoutBuilderDraft.exercises = template.exercises.map((item, index) => ({
      exerciseId: item.exerciseId,
      order: index + 1,
      defaultSets: item.defaultSets,
      restSeconds: item.restSeconds
    }));
    workoutTemplatePickerOpen = false;
    renderWorkoutBuilder();
  }

  function toggleWorkoutBuilderDay(day) {
    if (!workoutBuilderDraft) {
      return;
    }
    syncWorkoutBuilderName();
    const index = workoutBuilderDraft.weekdays.indexOf(day);
    if (index >= 0) {
      workoutBuilderDraft.weekdays.splice(index, 1);
    } else {
      workoutBuilderDraft.weekdays.push(day);
      workoutBuilderDraft.weekdays.sort((a, b) => WORKOUT_DAY_KEYS.indexOf(a) - WORKOUT_DAY_KEYS.indexOf(b));
    }
    renderWorkoutBuilder();
  }

  function toggleWorkoutBuilderExercise(index) {
    syncWorkoutBuilderName();
    workoutBuilderExpandedIndex = workoutBuilderExpandedIndex === index ? -1 : index;
    renderWorkoutBuilder();
  }

  function updateWorkoutBuilderExercise(index, field, value) {
    if (!workoutBuilderDraft?.exercises[index]) {
      return;
    }
    if (field === "defaultSets") {
      workoutBuilderDraft.exercises[index].defaultSets = normalizePositiveInteger(value, 1);
      return;
    }
    if (field === "restSeconds") {
      workoutBuilderDraft.exercises[index].restSeconds = normalizePositiveInteger(value, 90);
    }
  }

  function setWorkoutDragIndex(index) {
    workoutDragIndex = index;
  }

  function allowWorkoutDrag(event) {
    event.preventDefault();
  }

  function dropWorkoutExercise(index) {
    if (!workoutBuilderDraft || workoutDragIndex < 0 || workoutDragIndex === index) {
      workoutDragIndex = -1;
      return;
    }
    syncWorkoutBuilderName();
    const items = workoutBuilderDraft.exercises.slice().sort((a, b) => a.order - b.order);
    const [moved] = items.splice(workoutDragIndex, 1);
    items.splice(index, 0, moved);
    items.forEach((item, itemIndex) => {
      item.order = itemIndex + 1;
    });
    workoutBuilderDraft.exercises = items;
    workoutDragIndex = -1;
    renderWorkoutBuilder();
  }

  function startWorkoutExerciseHold(index) {
    cancelWorkoutExerciseHold();
    workoutSetHoldHandle = window.setTimeout(() => {
      deleteWorkoutBuilderExercise(index);
    }, 650);
  }

  function cancelWorkoutExerciseHold() {
    if (workoutSetHoldHandle) {
      clearTimeout(workoutSetHoldHandle);
      workoutSetHoldHandle = null;
    }
  }

  function promptDeleteWorkoutExercise(event, index) {
    event.preventDefault();
    deleteWorkoutBuilderExercise(index);
    return false;
  }

  function deleteWorkoutBuilderExercise(index) {
    cancelWorkoutExerciseHold();
    if (!workoutBuilderDraft?.exercises[index]) {
      return;
    }
    openConfirmActionSheet(
      "Remove Exercise",
      "Remove this exercise from the routine?",
      "Remove",
      () => {
        workoutBuilderDraft.exercises.splice(index, 1);
        workoutBuilderDraft.exercises.forEach((item, itemIndex) => {
          item.order = itemIndex + 1;
        });
        workoutBuilderExpandedIndex = -1;
        renderWorkoutBuilder();
      },
      "destructive"
    );
  }

  function openExerciseLibrary(context = "browse", targetExerciseIndex = -1) {
    workoutLibraryContext = context;
    workoutLibraryTargetExerciseIndex = targetExerciseIndex;
    document.getElementById("exercise-library-title").textContent = context === "routine"
      ? "Add Exercise"
      : context === "swap"
        ? "Swap Exercise"
      : context === "session"
        ? "Add Exercise to Workout"
        : "Exercise Library";
    document.getElementById("overlay-exercise-library").classList.add("open");
    renderExerciseLibrary();
  }

  function renderExerciseLibrary() {
    const list = document.getElementById("exercise-library-list");
    const filters = document.getElementById("exercise-library-filters");
    const query = (document.getElementById("exercise-library-search")?.value || "").trim().toLowerCase();
    if (!list || !filters) {
      return;
    }
    filters.innerHTML = `
      <div class="workout-library-filter-row">
        ${EXERCISE_FILTERS.map((filter) => `
          <button class="workout-filter-pill ${workoutLibraryFilter === filter ? "active" : ""}" type="button" onclick="setWorkoutLibraryFilter('${filter}')">${filter}</button>
        `).join("")}
      </div>
      <div class="workout-library-filter-row equipment-filter">
        ${ALL_EQUIPMENT.map((equipment) => `
          <button class="workout-filter-pill ${workoutEquipmentFilter === equipment ? "active" : ""}" type="button" onclick="setWorkoutEquipmentFilter('${equipment}')">${equipment}</button>
        `).join("")}
      </div>
    `;

    const rows = getAllExercises().filter((exercise) => {
      const matchesGroup = workoutLibraryFilter === "All" || exercise.muscleGroup === workoutLibraryFilter;
      const matchesEquipment = workoutEquipmentFilter === "All"
        || exercise.equipment === workoutEquipmentFilter
        || (workoutEquipmentFilter === "Other" && !ALL_EQUIPMENT.includes(exercise.equipment));
      const matchesQuery = !query || exercise.name.toLowerCase().includes(query);
      return matchesGroup && matchesEquipment && matchesQuery;
    });

    if (!rows.length) {
      list.innerHTML = "<div class=\"empty-state\"><div class=\"empty-icon\"><svg width=\"32\" height=\"32\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\"><circle cx=\"11\" cy=\"11\" r=\"8\"/><path d=\"m21 21-4.35-4.35\"/></svg></div>No exercises found.</div>";
      return;
    }

    list.innerHTML = rows.map((exercise) => `
      <button class="workout-library-row" type="button" onclick="handleExerciseLibraryPick('${exercise.id}')">
        <div class="workout-library-row-main">
          <div class="workout-library-row-name">${escHtml(exercise.name)} ${exercise.isCustom ? '<span class="workout-custom-badge">custom</span>' : ''}</div>
          <div class="workout-library-row-meta">${escHtml(exercise.muscleGroup)} · ${escHtml(exercise.equipment)} · ${escHtml(getExerciseInputTypeLabel(exercise.inputType))}</div>
        </div>
        <div class="workout-library-row-icon">${getExerciseInputTypeIcon(exercise.inputType)}</div>
      </button>
    `).join("");
  }

  function setWorkoutLibraryFilter(filter) {
    workoutLibraryFilter = filter;
    renderExerciseLibrary();
  }

  function setWorkoutEquipmentFilter(equipment) {
    workoutEquipmentFilter = equipment;
    renderExerciseLibrary();
  }

  function getExerciseInputTypeLabel(inputType) {
    return {
      reps_weight: "Reps + Weight",
      time: "Time",
      distance: "Distance",
      distance_time: "Distance + Time"
    }[inputType] || "Reps + Weight";
  }

  function getExerciseInputTypeIcon(inputType) {
    const type = normalizeExerciseInputType(inputType);
    if (type === "time") {
      return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
    }
    if (type === "distance" || type === "distance_time") {
      return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12h18"/><path d="M3 6l9-3 9 3"/><path d="M3 18l9 3 9-3"/></svg>`;
    }
    return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 5v14"/><path d="M18 5v14"/><path d="M2 9h4"/><path d="M2 15h4"/><path d="M18 9h4"/><path d="M18 15h4"/><path d="M6 12h12"/></svg>`;
  }

  function handleExerciseLibraryPick(exerciseId) {
    const exercise = getExerciseById(exerciseId);
    if (!exercise) {
      return;
    }
    if (workoutLibraryContext === "routine") {
      if (!workoutBuilderDraft) {
        return;
      }
      syncWorkoutBuilderName();
      workoutBuilderDraft.exercises.push({
        exerciseId: exercise.id,
        order: workoutBuilderDraft.exercises.length + 1,
        defaultSets: 3,
        restSeconds: 90
      });
      closeModal("exercise-library");
      renderWorkoutBuilder();
      return;
    }
    if (workoutLibraryContext === "session") {
      addExerciseToActiveWorkout(exercise.id, workoutLibraryTargetExerciseIndex);
      closeModal("exercise-library");
      return;
    }
    if (workoutLibraryContext === "swap") {
      swapSessionExercise(workoutLibraryTargetExerciseIndex, exercise.id);
      closeModal("exercise-library");
      return;
    }

    showToast(exercise.instructions || `${exercise.name} · ${exercise.muscleGroup} · ${exercise.equipment}`);
  }

  function openCustomExerciseModal() {
    document.getElementById("overlay-custom-exercise").classList.add("open");
    hydrateCustomExerciseFields();
  }

  function hydrateCustomExerciseFields() {
    const muscleSelect = document.getElementById("custom-exercise-muscle");
    if (!muscleSelect) {
      return;
    }
    if (!muscleSelect.innerHTML) {
      muscleSelect.innerHTML = EXERCISE_FILTERS.filter((item) => item !== "All").map((item) => `<option value="${item}">${item}</option>`).join("");
    }
  }

  function saveCustomExercise() {
    const status = document.getElementById("custom-exercise-status");
    const name = document.getElementById("custom-exercise-name").value.trim();
    const muscleGroup = document.getElementById("custom-exercise-muscle").value;
    const equipment = document.getElementById("custom-exercise-equipment").value.trim() || "Bodyweight";
    const inputType = document.getElementById("custom-exercise-input-type").value;
    const instructions = document.getElementById("custom-exercise-instructions").value.trim();

    if (!name) {
      status.textContent = "Enter an exercise name.";
      return;
    }

    state.customExercises.push(normalizeExerciseRecord({
      id: uid(),
      name,
      muscleGroup,
      inputType,
      equipment,
      isCustom: true,
      instructions,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }));
    saveState();
    document.getElementById("custom-exercise-name").value = "";
    document.getElementById("custom-exercise-equipment").value = "";
    document.getElementById("custom-exercise-instructions").value = "";
    status.textContent = "";
    closeModal("custom-exercise");
    renderExerciseLibrary();
    showToast("Custom exercise saved");
  }

  function saveWorkoutRoutine() {
    if (!workoutBuilderDraft) {
      return;
    }
    const status = document.getElementById("workout-builder-status");
    workoutBuilderDraft.name = document.getElementById("workout-builder-name").value.trim();
    if (!workoutBuilderDraft.name) {
      status.textContent = "Enter a routine name.";
      return;
    }
    if (!workoutBuilderDraft.exercises.length) {
      status.textContent = "Add at least one exercise.";
      return;
    }

    const normalizedRoutine = normalizeRoutineRecord({
      ...workoutBuilderDraft,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    const index = state.routines.findIndex((routine) => routine.id === normalizedRoutine.id);
    if (index >= 0) {
      state.routines[index] = {
        ...state.routines[index],
        ...normalizedRoutine,
        created_at: state.routines[index].created_at || normalizedRoutine.created_at
      };
    } else {
      state.routines.push(normalizedRoutine);
    }
    saveState();
    closeModal("workout-builder");
    renderWorkoutPage();
    showToast("Routine saved");
  }

  function promptDeleteWorkoutRoutine() {
    if (!workoutBuilderDraft) {
      return;
    }
    const routineId = workoutBuilderDraft.id;
    const routineName = workoutBuilderDraft.name || "this routine";
    const builderOverlay = document.getElementById("overlay-workout-builder");
    if (builderOverlay) {
      builderOverlay.classList.add("overlay-suspended");
    }
    openActionSheet("Delete Routine", [
      {
        label: "Delete Routine",
        style: "destructive",
        onClick: () => {
          state.routines = state.routines.filter((routine) => routine.id !== routineId);
          saveState();
          closeModal("workout-builder");
          renderWorkoutPage();
          showToast("Routine deleted");
        }
      }
    ], {
      message: `Delete ${routineName}? This cannot be undone.`,
      onClose: () => {
        if (builderOverlay) {
          builderOverlay.classList.remove("overlay-suspended");
        }
      }
    });
  }

  function startRoutineWorkout(routineId) {
    const routine = getRoutineById(routineId);
    if (!routine) {
      showToast("Routine not found");
      return;
    }

    state.activeWorkoutDraft = buildWorkoutDraftFromRoutine(routine);
    saveState();
    openActiveWorkout();
  }

  function startFreeformWorkout() {
    state.activeWorkoutDraft = normalizeWorkoutDraft({
      id: uid(),
      routineId: null,
      routineName: "Freeform Workout",
      date: todayStr(),
      created_at: new Date().toISOString(),
      startedAt: null,
      currentExerciseIndex: 0,
      sessionExercises: [],
      exerciseLogs: [],
      personalBests: [],
      notes: "",
      difficultyRating: null,
      durationSeconds: 0,
      isFreeform: true
    });
    saveState();
    openActiveWorkout();
  }

  function buildWorkoutDraftFromRoutine(routine) {
    const previousSession = findLatestSessionByRoutine(routine.id);
    const sessionExercises = routine.exercises.slice().sort((a, b) => a.order - b.order).map((item, index) => ({
      ...item,
      order: index + 1
    }));
    const exerciseLogs = sessionExercises.map((routineExercise) => {
      const exercise = getExerciseById(routineExercise.exerciseId);
      const previousLog = previousSession?.exerciseLogs?.find((entry) => entry.exerciseId === routineExercise.exerciseId);
      const previousSets = previousLog?.sets || [];
      const sets = Array.from({ length: routineExercise.defaultSets }, (_, index) => {
        const previousSet = previousSets[index] || previousSets[previousSets.length - 1] || {};
        return normalizeWorkoutSet({
          type: previousSet.type || "working",
          reps: previousSet.reps || 0,
          weightKg: previousSet.weightKg || 0,
          durationSeconds: previousSet.durationSeconds || 0,
          distanceKm: previousSet.distanceKm || 0,
          isPersonalBest: false,
          completedAt: null
        });
      });
      return {
        exerciseId: routineExercise.exerciseId,
        sets: sets.length ? sets : [createEmptySetForExercise(exercise)]
      };
    });

    return normalizeWorkoutDraft({
      id: uid(),
      routineId: routine.id,
      routineName: routine.name,
      date: todayStr(),
      created_at: new Date().toISOString(),
      startedAt: null,
      currentExerciseIndex: 0,
      sessionExercises,
      exerciseLogs,
      personalBests: [],
      notes: "",
      difficultyRating: null,
      durationSeconds: 0,
      isFreeform: false
    });
  }

  function findLatestSessionByRoutine(routineId) {
    return state.workoutSessions
      .filter((session) => session.routineId === routineId)
      .slice()
      .sort((a, b) => new Date(b.created_at || `${b.date}T12:00:00`).getTime() - new Date(a.created_at || `${a.date}T12:00:00`).getTime())[0] || null;
  }

  function findLatestSessionForExercise(exerciseId) {
    return state.workoutSessions
      .filter((session) => (session.exerciseLogs || []).some((log) => log.exerciseId === exerciseId))
      .slice()
      .sort((a, b) => new Date(b.created_at || `${b.date}T12:00:00`).getTime() - new Date(a.created_at || `${a.date}T12:00:00`).getTime())[0] || null;
  }

  function createEmptySetForExercise(exercise) {
    const type = normalizeExerciseInputType(exercise?.inputType);
    if (type === "time") {
      return normalizeWorkoutSet({ type: "working", durationSeconds: 0 });
    }
    if (type === "distance") {
      return normalizeWorkoutSet({ type: "working", distanceKm: 0 });
    }
    if (type === "distance_time") {
      return normalizeWorkoutSet({ type: "working", distanceKm: 0, durationSeconds: 0 });
    }
    return normalizeWorkoutSet({ type: "working", reps: 0, weightKg: 0 });
  }

  function openActiveWorkout() {
    document.getElementById("overlay-active-workout").classList.add("open");
    renderActiveWorkout();
  }

  function resumeWorkoutDraft() {
    if (!state.activeWorkoutDraft) {
      return;
    }
    openActiveWorkout();
  }

  function discardWorkoutDraft(fromBanner = false) {
    if (!state.activeWorkoutDraft) {
      return;
    }
    clearInterval(workoutElapsedInterval);
    clearInterval(workoutRestInterval);
    workoutElapsedInterval = null;
    workoutRestInterval = null;
    openConfirmActionSheet(
      "Discard Workout",
      "Discard the unfinished workout?",
      "Discard Workout",
      () => {
        state.activeWorkoutDraft = null;
        workoutSummaryDraft = null;
        saveState();
        closeModal("active-workout");
        closeModal("workout-summary");
        renderWorkoutPage();
        if (!fromBanner) {
          showToast("Workout discarded");
        }
      },
      "destructive"
    );
  }

  function renderActiveWorkout() {
    const root = document.getElementById("active-workout-root");
    if (!root) {
      return;
    }
    const draft = state.activeWorkoutDraft;
    if (!draft) {
      root.innerHTML = "";
      return;
    }

    const totalExercises = draft.sessionExercises.length;
    const currentExercise = draft.sessionExercises[draft.currentExerciseIndex] || null;
    const currentExerciseMeta = currentExercise ? getExerciseById(currentExercise.exerciseId) : null;
    const currentLog = currentExercise ? ensureWorkoutExerciseLog(draft.currentExerciseIndex) : null;
    const lastExerciseLog = currentExercise ? findLatestSessionForExercise(currentExercise.exerciseId)?.exerciseLogs?.find((log) => log.exerciseId === currentExercise.exerciseId) : null;
    const timerRunning = !!draft.startedAt;
    root.innerHTML = `
      <div class="workout-active-header">
        <div>
          <div class="workout-active-routine">${escHtml(draft.routineName || "Workout")}</div>
          <div class="workout-active-timer" id="active-workout-elapsed">
            ${formatElapsedTime(draft)}
          </div>
        </div>
        <div class="workout-inline-actions">
          <button class="btn btn-secondary workout-undo-btn" type="button" onclick="undoLastCompletedSet()">Undo</button>
          <button class="btn btn-${timerRunning ? "secondary" : "primary"}" type="button" onclick="${timerRunning ? "pauseActiveWorkoutTimer()" : "startActiveWorkoutTimer()"}">${timerRunning ? "Pause" : "Start"}</button>
          <button class="btn btn-secondary" type="button" onclick="stopActiveWorkoutTimer()">Stop</button>
        </div>
      </div>
      <div class="workout-active-progress">
        <span>${totalExercises ? `Exercise ${draft.currentExerciseIndex + 1} of ${totalExercises}` : "Freeform session"}</span>
        <div class="workout-inline-actions">
          <button class="btn btn-secondary" type="button" onclick="openWorkoutJump()">All Exercises</button>
        </div>
      </div>
      ${totalExercises ? renderCurrentWorkoutExercise(currentExerciseMeta, currentExercise, currentLog, lastExerciseLog) : renderEmptyActiveWorkoutState()}
    `;

    clearInterval(workoutElapsedInterval);
    if (!draft.startedAt) {
      workoutElapsedInterval = null;
      return;
    }
    workoutElapsedInterval = setInterval(() => {
      const el = document.getElementById("active-workout-elapsed");
      if (el && state.activeWorkoutDraft) {
        el.textContent = formatElapsedTime(state.activeWorkoutDraft);
      } else {
        clearInterval(workoutElapsedInterval);
        workoutElapsedInterval = null;
      }
    }, 1000);
  }

  function renderCurrentWorkoutExercise(exercise, routineExercise, currentLog, lastExerciseLog) {
    const allDone = areWorkingSetsComplete(currentLog?.sets || []);
    return `
      <div class="workout-current-exercise">
        <div class="workout-current-title-row">
          <button class="history-nav-btn" type="button" onclick="jumpWorkoutExercise(-1)" ${state.activeWorkoutDraft.currentExerciseIndex === 0 ? "disabled" : ""}>‹</button>
          <div class="workout-current-title-block">
            <div class="workout-current-title">${escHtml(exercise?.name || "Exercise")}</div>
            <div class="workout-current-tag">${escHtml(exercise?.muscleGroup || "")}</div>
          </div>
          <button class="history-nav-btn" type="button" onclick="jumpWorkoutExercise(1)" ${state.activeWorkoutDraft.currentExerciseIndex >= state.activeWorkoutDraft.sessionExercises.length - 1 ? "disabled" : ""}>›</button>
        </div>
        <div class="workout-inline-actions">
          <button class="btn btn-secondary workout-swap-btn" type="button" onclick="promptSwapExercise(${state.activeWorkoutDraft.currentExerciseIndex})">Swap</button>
        </div>
        <div class="workout-set-list">
          ${(currentLog?.sets || []).map((set, index) => renderWorkoutSetRow(exercise, set, index, lastExerciseLog?.sets?.[index] || null)).join("")}
        </div>
        <div class="workout-inline-actions workout-session-actions">
          <button class="btn btn-secondary" type="button" onclick="addSetToActiveWorkout()">Add Set</button>
          <button class="btn btn-secondary" type="button" onclick="openExerciseLibrary('session', ${state.activeWorkoutDraft.currentExerciseIndex + 1})">Add Exercise After</button>
          ${allDone ? `<button class="btn btn-primary" type="button" onclick="jumpWorkoutExercise(1)">${state.activeWorkoutDraft.currentExerciseIndex >= state.activeWorkoutDraft.sessionExercises.length - 1 ? "Finish Workout" : "Next Exercise"}</button>` : ""}
        </div>
      </div>
    `;
  }

  function renderWorkoutSetRow(exercise, set, index, lastSet) {
    const badge = set.type === "warmup" ? "W" : set.type === "dropset" ? "D" : String(index + 1);
    const lastSetText = formatLastSetText(exercise, lastSet);
    const completed = !!set.completedAt;
    const isPR = !!set.isPersonalBest;
    let html = `
      <div class="workout-set-row ${completed ? "done is-done" : ""} ${isPR ? "is-pr" : ""}"
           oncontextmenu="return openWorkoutSetMenu(event, ${index})"
           onpointerdown="startWorkoutSetHold(${index})"
           onpointerup="cancelWorkoutSetHold()"
           onpointerleave="cancelWorkoutSetHold()">
        <div class="workout-set-head">
          <span class="workout-set-number">Set ${index + 1}</span>
          <span class="workout-set-badge">${badge}</span>
          ${isPR ? '<span class="workout-pr-badge">🏆 PR</span>' : ''}
        </div>
        <div class="workout-set-last">${lastSetText}</div>
        <div class="workout-set-inputs">
          ${renderWorkoutSetInputs(exercise, set, index)}
          ${index > 0 ? `<button class="btn btn-secondary workout-copy-btn" type="button" onclick="copyLastWorkoutSet(${index})" title="Copy previous set">⇅</button>` : ""}
          <button class="btn ${completed ? "btn-primary" : "btn-secondary"} workout-set-check" type="button" onclick="toggleWorkoutSetComplete(${index})">${completed ? "✓" : "Done"}</button>
        </div>
        ${completed && set.rpe > 0 ? `<div class="workout-set-rpe-display">RPE ${set.rpe}</div>` : ""}
    `;
    const showRpePicker = completed && set.type === "working" && set.rpe === null;
    if (showRpePicker) {
      html += `
        <div class="workout-rpe-picker">
          <span class="workout-rpe-label">How hard? (RPE)</span>
          <div class="workout-rpe-options">
            ${[6, 7, 8, 9, 10].map((n) => `<button class="workout-rpe-btn" type="button" onclick="setWorkoutSetRpe(${index}, ${n})">${n}</button>`).join("")}
            <button class="workout-rpe-btn workout-rpe-skip" type="button" onclick="setWorkoutSetRpe(${index}, 0)">Skip</button>
          </div>
        </div>
      `;
    }
    html += "</div>";
    return html;
  }

  function renderWorkoutSetInputs(exercise, set, index) {
    const inputType = normalizeExerciseInputType(exercise?.inputType);
    const parts = [];
    if (inputType === "reps_weight") {
      parts.push(`<input class="form-input" type="number" min="0" step="1" placeholder="Reps" value="${set.reps || ""}" oninput="updateWorkoutSetField(${index}, 'reps', this.value)">`);
      parts.push(`<input class="form-input" type="number" min="0" step="0.5" placeholder="kg" value="${set.weightKg || ""}" oninput="updateWorkoutSetField(${index}, 'weightKg', this.value)">`);
    }
    if (inputType === "time") {
      parts.push(`<input class="form-input" type="number" min="0" step="1" placeholder="sec" value="${set.durationSeconds || ""}" oninput="updateWorkoutSetField(${index}, 'durationSeconds', this.value)">`);
    }
    if (inputType === "distance") {
      parts.push(`<input class="form-input" type="number" min="0" step="0.1" placeholder="km" value="${set.distanceKm || ""}" oninput="updateWorkoutSetField(${index}, 'distanceKm', this.value)">`);
    }
    if (inputType === "distance_time") {
      parts.push(`<input class="form-input" type="number" min="0" step="0.1" placeholder="km" value="${set.distanceKm || ""}" oninput="updateWorkoutSetField(${index}, 'distanceKm', this.value)">`);
      parts.push(`<input class="form-input" type="number" min="0" step="1" placeholder="sec" value="${set.durationSeconds || ""}" oninput="updateWorkoutSetField(${index}, 'durationSeconds', this.value)">`);
    }
    return parts.join("");
  }

  function renderEmptyActiveWorkoutState() {
    return `
      <div class="empty-state">
        <div class="empty-icon"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 5v14"/><path d="M18 5v14"/><path d="M2 9h4"/><path d="M2 15h4"/><path d="M18 9h4"/><path d="M18 15h4"/><path d="M6 12h12"/></svg></div>
        No exercises in this session yet.<br>Add exercises from the library to begin logging.
        <div class="today-card-actions">
          <button class="btn btn-primary" type="button" onclick="openExerciseLibrary('session', 0)">Add Exercise</button>
        </div>
      </div>
    `;
  }

  function formatLastSetText(exercise, set) {
    if (!set) {
      return "Last time: none";
    }
    const inputType = normalizeExerciseInputType(exercise?.inputType);
    if (inputType === "reps_weight") {
      const weight = set.weightKg > 0 ? `${roundNutrient(set.weightKg)}kg × ` : "";
      const reps = set.reps > 0 ? `${Math.round(set.reps)}` : "0";
      return `Last time: ${weight}${reps}`;
    }
    if (inputType === "time") {
      return `Last time: ${formatDuration(set.durationSeconds || 0)}`;
    }
    if (inputType === "distance") {
      return `Last time: ${roundNutrient(set.distanceKm || 0)} km`;
    }
    return `Last time: ${roundNutrient(set.distanceKm || 0)} km in ${formatDuration(set.durationSeconds || 0)}`;
  }

  function ensureWorkoutExerciseLog(exerciseIndex) {
    const draft = state.activeWorkoutDraft;
    const routineExercise = draft?.sessionExercises?.[exerciseIndex];
    if (!draft || !routineExercise) {
      return null;
    }
    let log = draft.exerciseLogs[exerciseIndex] || null;
    if (log?.exerciseId !== routineExercise.exerciseId) {
      const matchedIndex = draft.exerciseLogs.findIndex((entry, index) => index >= exerciseIndex && entry?.exerciseId === routineExercise.exerciseId);
      if (matchedIndex >= 0) {
        log = draft.exerciseLogs.splice(matchedIndex, 1)[0];
        draft.exerciseLogs.splice(exerciseIndex, 0, log);
      }
    }
    if (!log || log.exerciseId !== routineExercise.exerciseId) {
      const exercise = getExerciseById(routineExercise.exerciseId);
      log = {
        exerciseId: routineExercise.exerciseId,
        sets: Array.from({ length: routineExercise.defaultSets || 1 }, () => createEmptySetForExercise(exercise))
      };
      draft.exerciseLogs.splice(exerciseIndex, 0, log);
    }
    return log;
  }

  function updateWorkoutSetField(setIndex, field, value) {
    const draft = state.activeWorkoutDraft;
    if (!draft) {
      return;
    }
    const log = ensureWorkoutExerciseLog(draft.currentExerciseIndex);
    const set = log?.sets?.[setIndex];
    if (!set) {
      return;
    }
    const parsed = parseFloat(value);
    if (field === "reps") set[field] = isNaN(parsed) ? 0 : Math.max(0, Math.floor(parsed));
    else if (field === "weightKg") set[field] = isNaN(parsed) ? 0 : Math.max(0, parsed);
    else if (field === "distanceKm") set[field] = isNaN(parsed) ? 0 : Math.max(0, parsed);
    else if (field === "durationSeconds") set[field] = isNaN(parsed) ? 0 : Math.max(0, Math.floor(parsed));
    else set[field] = normalizePositiveNumber(value, 0);
    saveState();
  }

  function copyLastWorkoutSet(setIndex) {
    const draft = state.activeWorkoutDraft;
    if (!draft || setIndex < 1) return;
    const log = ensureWorkoutExerciseLog(draft.currentExerciseIndex);
    if (!log?.sets) return;
    const source = log.sets[setIndex - 1];
    const target = log.sets[setIndex];
    if (!source || !target) return;
    const exercise = getExerciseById(draft.sessionExercises[draft.currentExerciseIndex]?.exerciseId);
    const inputType = normalizeExerciseInputType(exercise?.inputType);
    if (inputType === "reps_weight") {
      target.reps = source.reps;
      target.weightKg = source.weightKg;
    } else if (inputType === "time") {
      target.durationSeconds = source.durationSeconds;
    } else if (inputType === "distance") {
      target.distanceKm = source.distanceKm;
    } else if (inputType === "distance_time") {
      target.distanceKm = source.distanceKm;
      target.durationSeconds = source.durationSeconds;
    }
    saveState();
    renderActiveWorkout();
    showToast("Copied from previous set");
  }

  function toggleWorkoutSetComplete(setIndex) {
    const draft = state.activeWorkoutDraft;
    if (!draft) {
      return;
    }
    const routineExercise = draft.sessionExercises[draft.currentExerciseIndex];
    const exercise = getExerciseById(routineExercise?.exerciseId);
    const log = ensureWorkoutExerciseLog(draft.currentExerciseIndex);
    const set = log?.sets?.[setIndex];
    if (!set) {
      return;
    }
    if (set.completedAt) {
      set.completedAt = null;
      set.isPersonalBest = false;
      set.rpe = null;
      set.actualRestSeconds = null;
      saveState();
      renderActiveWorkout();
      return;
    }

    if (!isWorkoutSetFilled(exercise, set)) {
      showToast("Enter set details before marking it complete");
      return;
    }

    if (draft._restStartedAt) {
      const elapsedRest = Math.round((Date.now() - draft._restStartedAt) / 1000);
      const prevCompleted = findPreviousCompletedSet(draft, draft.currentExerciseIndex, setIndex);
      if (prevCompleted) prevCompleted.actualRestSeconds = elapsedRest;
      draft._restStartedAt = null;
    }
    set.completedAt = new Date().toISOString();
    set.rpe = null;
    const prHit = detectWorkoutPr(exercise, set);
    if (prHit) {
      set.isPersonalBest = true;
      draft.personalBests = draft.personalBests.filter(
        (pr) => !(pr.exerciseId === prHit.exerciseId && pr.type === prHit.type)
      );
      draft.personalBests.push(prHit);
      showToast(`New PR: ${prHit.label}`);
    }
    saveState();
    renderActiveWorkout();

    const restSeconds = routineExercise?.restSeconds || 90;
    startRestTimer(restSeconds);
  }

  function isWorkoutSetFilled(exercise, set) {
    const inputType = normalizeExerciseInputType(exercise?.inputType);
    if (inputType === "reps_weight") return (set.reps > 0 || set.weightKg > 0);
    if (inputType === "time") return set.durationSeconds > 0;
    if (inputType === "distance") return set.distanceKm > 0;
    return set.distanceKm > 0 || set.durationSeconds > 0;
  }

  function setWorkoutSetRpe(setIndex, rpe) {
    const draft = state.activeWorkoutDraft;
    if (!draft) return;
    const log = ensureWorkoutExerciseLog(draft.currentExerciseIndex);
    const set = log?.sets?.[setIndex];
    if (!set) return;
    set.rpe = rpe > 0 ? rpe : 0;
    saveState();
    renderActiveWorkout();
  }

  function undoLastCompletedSet() {
    const draft = state.activeWorkoutDraft;
    if (!draft) return;
    let lastSet = null;
    let lastLog = null;
    let lastExerciseIndex = -1;
    let lastTime = "";
    draft.exerciseLogs.forEach((log, logIndex) => {
      for (const currentSet of (log.sets || [])) {
        if (currentSet.completedAt && currentSet.completedAt > lastTime) {
          lastTime = currentSet.completedAt;
          lastSet = currentSet;
          lastLog = log;
          lastExerciseIndex = logIndex;
        }
      }
    });
    if (!lastSet) {
      showToast("Nothing to undo");
      return;
    }
    lastSet.completedAt = null;
    lastSet.isPersonalBest = false;
    lastSet.rpe = null;
    lastSet.actualRestSeconds = null;
    if (lastLog?.exerciseId) {
      draft.personalBests = draft.personalBests.filter((pr) => !(pr.exerciseId === lastLog.exerciseId && pr.achievedAt === lastTime));
    }
    if (lastExerciseIndex >= 0) {
      draft.currentExerciseIndex = lastExerciseIndex;
    }
    stopRestTimer();
    saveState();
    renderActiveWorkout();
    showToast("Set undone");
  }

  function findPreviousCompletedSet(draft, exerciseIndex, currentSetIndex) {
    const log = draft.exerciseLogs[exerciseIndex];
    if (!log) return null;
    for (let index = currentSetIndex - 1; index >= 0; index -= 1) {
      if (log.sets[index]?.completedAt) return log.sets[index];
    }
    return null;
  }

  function detectWorkoutPr(exercise, set) {
    if (!exercise) return null;
    const inputType = normalizeExerciseInputType(exercise.inputType);
    const currentBest = getExercisePersonalBest(exercise.id);

    if (inputType === "reps_weight" && set.weightKg > 0) {
      if (set.weightKg <= (currentBest.heaviestWeight || 0)) return null;
      return {
        exerciseId: exercise.id,
        exerciseName: exercise.name,
        type: "weight",
        value: set.weightKg,
        label: `${exercise.name} ${roundNutrient(set.weightKg)}kg`,
        achievedAt: new Date().toISOString()
      };
    }
    if (inputType === "time" && set.durationSeconds > 0) {
      if (set.durationSeconds <= (currentBest.longestDuration || 0)) return null;
      return {
        exerciseId: exercise.id,
        exerciseName: exercise.name,
        type: "duration",
        value: set.durationSeconds,
        label: `${exercise.name} ${formatDuration(set.durationSeconds)}`,
        achievedAt: new Date().toISOString()
      };
    }
    if (inputType === "distance" && set.distanceKm > 0) {
      if (set.distanceKm <= (currentBest.longestDistance || 0)) return null;
      return {
        exerciseId: exercise.id,
        exerciseName: exercise.name,
        type: "distance",
        value: set.distanceKm,
        label: `${exercise.name} ${roundNutrient(set.distanceKm)}km`,
        achievedAt: new Date().toISOString()
      };
    }
    if (inputType === "distance_time" && set.distanceKm > 0 && set.durationSeconds > 0) {
      const paceSecondsPerKm = set.durationSeconds / set.distanceKm;
      const bestPace = currentBest.bestPaceSecondsPerKm || Infinity;
      if (paceSecondsPerKm >= bestPace) return null;
      const paceMin = Math.floor(paceSecondsPerKm / 60);
      const paceSec = Math.round(paceSecondsPerKm % 60);
      return {
        exerciseId: exercise.id,
        exerciseName: exercise.name,
        type: "pace",
        value: paceSecondsPerKm,
        label: `${exercise.name} ${paceMin}:${String(paceSec).padStart(2, "0")}/km`,
        achievedAt: new Date().toISOString()
      };
    }
    return null;
  }

  function getExercisePersonalBest(exerciseId) {
    const result = {
      heaviestWeight: 0,
      mostReps: 0,
      bestEstimatedOneRepMax: 0,
      longestDuration: 0,
      longestDistance: 0,
      bestPaceSecondsPerKm: Infinity,
      heaviestDate: "",
      repsDate: "",
      oneRmDate: "",
      durationDate: "",
      distanceDate: "",
      paceDate: ""
    };

    state.workoutSessions.forEach((session) => {
      const log = session.exerciseLogs.find((entry) => entry.exerciseId === exerciseId);
      if (!log) {
        return;
      }
      log.sets.forEach((set) => {
        if ((set.weightKg || 0) > result.heaviestWeight) {
          result.heaviestWeight = set.weightKg || 0;
          result.heaviestDate = session.date;
        }
        if ((set.reps || 0) > result.mostReps) {
          result.mostReps = set.reps || 0;
          result.repsDate = session.date;
        }
        const estimatedOneRm = (set.weightKg || 0) * (1 + ((set.reps || 0) / 30));
        if (estimatedOneRm > result.bestEstimatedOneRepMax) {
          result.bestEstimatedOneRepMax = estimatedOneRm;
          result.oneRmDate = session.date;
        }
        if ((set.durationSeconds || 0) > result.longestDuration) {
          result.longestDuration = set.durationSeconds || 0;
          result.durationDate = session.date;
        }
        if ((set.distanceKm || 0) > result.longestDistance) {
          result.longestDistance = set.distanceKm || 0;
          result.distanceDate = session.date;
        }
        if (set.distanceKm > 0 && set.durationSeconds > 0) {
          const pace = set.durationSeconds / set.distanceKm;
          if (pace < result.bestPaceSecondsPerKm) {
            result.bestPaceSecondsPerKm = pace;
            result.paceDate = session.date;
          }
        }
      });
    });

    return result;
  }

  function formatDuration(totalSeconds) {
    const seconds = Math.max(0, Math.round(totalSeconds || 0));
    const mins = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    return `${mins}:${String(remainder).padStart(2, "0")}`;
  }

  function getWorkoutElapsedSeconds(draft) {
    if (!draft) {
      return 0;
    }
    const baseElapsed = Math.max(0, Math.round(draft.durationSeconds || 0));
    if (!draft.startedAt) {
      return baseElapsed;
    }
    const runningElapsed = Math.floor((Date.now() - new Date(draft.startedAt).getTime()) / 1000);
    return Math.max(0, baseElapsed + runningElapsed);
  }

  function finalizeWorkoutElapsed(draft) {
    if (!draft) {
      return 0;
    }
    draft.durationSeconds = getWorkoutElapsedSeconds(draft);
    draft.startedAt = null;
    return draft.durationSeconds;
  }

  function formatElapsedTime(draft) {
    return formatDuration(getWorkoutElapsedSeconds(draft));
  }

  function startActiveWorkoutTimer() {
    const draft = state.activeWorkoutDraft;
    if (!draft || draft.startedAt) {
      return;
    }
    draft.startedAt = new Date().toISOString();
    saveState();
    renderActiveWorkout();
  }

  function pauseActiveWorkoutTimer() {
    const draft = state.activeWorkoutDraft;
    if (!draft?.startedAt) {
      return;
    }
    finalizeWorkoutElapsed(draft);
    saveState();
    renderActiveWorkout();
  }

  function stopActiveWorkoutTimer() {
    const draft = state.activeWorkoutDraft;
    if (!draft) {
      return;
    }
    if (draft.startedAt) {
      finalizeWorkoutElapsed(draft);
      saveState();
    }
    finishActiveWorkoutPrompt();
  }

  function jumpWorkoutExercise(delta) {
    const draft = state.activeWorkoutDraft;
    if (!draft?.sessionExercises?.length) {
      finishActiveWorkoutPrompt();
      return;
    }
    stopRestTimer();
    draft.currentExerciseIndex = clamp(draft.currentExerciseIndex + delta, 0, draft.sessionExercises.length - 1);
    saveState();
    renderActiveWorkout();
  }

  function openWorkoutJump() {
    document.getElementById("overlay-workout-jump").classList.add("open");
    renderWorkoutJumpList();
  }

  function renderWorkoutJumpList() {
    const root = document.getElementById("workout-jump-list");
    const draft = state.activeWorkoutDraft;
    if (!root) {
      return;
    }
    if (!draft?.sessionExercises?.length) {
      root.innerHTML = "<div class=\"empty-state\">No exercises in this session yet.</div>";
      return;
    }
    root.innerHTML = draft.sessionExercises.map((item, index) => {
      const exercise = getExerciseById(item.exerciseId);
      const completed = areWorkingSetsComplete(ensureWorkoutExerciseLog(index)?.sets || []);
      return `
        <button class="workout-jump-row ${index === draft.currentExerciseIndex ? "active" : ""}" type="button" onclick="jumpToWorkoutExercise(${index})">
          <span>${index + 1}. ${escHtml(exercise?.name || "Exercise")}</span>
          <span>${completed ? "Done" : "Open"}</span>
        </button>
      `;
    }).join("");
  }

  function jumpToWorkoutExercise(index) {
    if (!state.activeWorkoutDraft) {
      return;
    }
    stopRestTimer();
    state.activeWorkoutDraft.currentExerciseIndex = clamp(index, 0, state.activeWorkoutDraft.sessionExercises.length - 1);
    saveState();
    closeModal("workout-jump");
    renderActiveWorkout();
  }

  function addSetToActiveWorkout() {
    const draft = state.activeWorkoutDraft;
    if (!draft) {
      return;
    }
    const currentExercise = draft.sessionExercises[draft.currentExerciseIndex];
    const exercise = getExerciseById(currentExercise?.exerciseId);
    const log = ensureWorkoutExerciseLog(draft.currentExerciseIndex);
    log.sets.push(createEmptySetForExercise(exercise));
    saveState();
    renderActiveWorkout();
  }

  function addExerciseToActiveWorkout(exerciseId, insertAfterIndex = -1) {
    const draft = state.activeWorkoutDraft;
    if (!draft) {
      return;
    }
    const targetIndex = insertAfterIndex >= 0 ? insertAfterIndex : draft.currentExerciseIndex + 1;
    draft.sessionExercises.splice(targetIndex, 0, {
      exerciseId,
      order: targetIndex + 1,
      defaultSets: 3,
      restSeconds: 90
    });
    draft.sessionExercises.forEach((item, index) => {
      item.order = index + 1;
    });
    draft.exerciseLogs.splice(targetIndex, 0, {
      exerciseId,
      sets: [createEmptySetForExercise(getExerciseById(exerciseId))]
    });
    draft.currentExerciseIndex = targetIndex;
    saveState();
    renderActiveWorkout();
    renderWorkoutJumpList();
  }

  function openWorkoutSetMenu(event, setIndex) {
    event.preventDefault();
    changeWorkoutSetTypeOrDelete(setIndex);
    return false;
  }

  function startWorkoutSetHold(setIndex) {
    cancelWorkoutSetHold();
    workoutSetHoldHandle = window.setTimeout(() => {
      changeWorkoutSetTypeOrDelete(setIndex);
    }, 650);
  }

  function cancelWorkoutSetHold() {
    if (workoutSetHoldHandle) {
      clearTimeout(workoutSetHoldHandle);
      workoutSetHoldHandle = null;
    }
  }

  function startRestTimer(seconds) {
    const draft = state.activeWorkoutDraft;
    clearInterval(workoutRestInterval);
    if (!seconds || seconds <= 0) return;
    if (draft) {
      draft._restStartedAt = Date.now();
    }
    const endsAt = Date.now() + seconds * 1000;
    renderRestTimerBanner(Math.ceil((endsAt - Date.now()) / 1000));
    workoutRestInterval = setInterval(() => {
      const remaining = Math.ceil((endsAt - Date.now()) / 1000);
      if (remaining <= 0) {
        clearInterval(workoutRestInterval);
        workoutRestInterval = null;
        const banner = document.getElementById("rest-timer-banner");
        if (banner) banner.remove();
        showToast("Rest complete — next set!");
        return;
      }
      renderRestTimerBanner(remaining);
    }, 500);
  }

  function renderRestTimerBanner(remaining) {
    const activeRoot = document.getElementById("overlay-active-workout");
    if (!activeRoot) return;
    let banner = document.getElementById("rest-timer-banner");
    if (!banner) {
      banner = document.createElement("div");
      banner.id = "rest-timer-banner";
      banner.className = "rest-timer-banner";
      activeRoot.appendChild(banner);
    }
    banner.innerHTML = `
      <div class="rest-timer-content">
        <div class="rest-timer-label">Rest</div>
        <div class="rest-timer-count">${formatDuration(remaining)}</div>
        <button class="btn btn-secondary rest-timer-skip" type="button" onclick="skipRestTimer()">Skip</button>
      </div>
    `;
  }

  function skipRestTimer() {
    const draft = state.activeWorkoutDraft;
    if (draft?._restStartedAt) {
      const elapsedRest = Math.round((Date.now() - draft._restStartedAt) / 1000);
      const currentSetIndex = ensureWorkoutExerciseLog(draft.currentExerciseIndex)?.sets?.length || 0;
      const prevCompleted = findPreviousCompletedSet(draft, draft.currentExerciseIndex, currentSetIndex);
      if (prevCompleted && prevCompleted.actualRestSeconds == null) {
        prevCompleted.actualRestSeconds = elapsedRest;
      }
      draft._restStartedAt = null;
    }
    clearInterval(workoutRestInterval);
    workoutRestInterval = null;
    const banner = document.getElementById("rest-timer-banner");
    if (banner) banner.remove();
    if (draft) {
      saveState();
    }
  }

  function stopRestTimer() {
    skipRestTimer();
  }

  function promptSwapExercise(exerciseIndex) {
    const draft = state.activeWorkoutDraft;
    if (!draft) return;
    const routineEx = draft.sessionExercises[exerciseIndex];
    const currentEx = getExerciseById(routineEx?.exerciseId);
    if (!currentEx) return;
    const sameGroup = getAllExercises()
      .filter((exercise) => exercise.muscleGroup === currentEx.muscleGroup && exercise.id !== currentEx.id)
      .slice(0, 8);
    openActionSheet(`Swap: ${currentEx.name}`, [
      ...sameGroup.map((exercise) => ({
        label: exercise.name,
        onClick: () => swapSessionExercise(exerciseIndex, exercise.id)
      })),
      { label: "Browse Library…", onClick: () => openExerciseLibrary("swap", exerciseIndex) }
    ]);
  }

  function swapSessionExercise(exerciseIndex, newExerciseId) {
    const draft = state.activeWorkoutDraft;
    if (!draft) return;
    const routineEx = draft.sessionExercises[exerciseIndex];
    if (!routineEx) return;
    const newExercise = getExerciseById(newExerciseId);
    if (!newExercise) return;
    routineEx.exerciseId = newExerciseId;
    draft.exerciseLogs[exerciseIndex] = {
      exerciseId: newExerciseId,
      sets: Array.from({ length: routineEx.defaultSets || 3 }, () => createEmptySetForExercise(newExercise))
    };
    saveState();
    renderActiveWorkout();
    showToast(`Swapped to ${newExercise.name}`);
  }

  function changeWorkoutSetTypeOrDelete(setIndex) {
    cancelWorkoutSetHold();
    const log = ensureWorkoutExerciseLog(state.activeWorkoutDraft?.currentExerciseIndex || 0);
    const set = log?.sets?.[setIndex];
    if (!set) {
      return;
    }
    openActionSheet("Set Options", [
      {
        label: "Warmup",
        style: set.type === "warmup" ? "default" : "muted",
        onClick: () => {
          set.type = "warmup";
          saveState();
          renderActiveWorkout();
        }
      },
      {
        label: "Working",
        style: set.type === "working" ? "default" : "muted",
        onClick: () => {
          set.type = "working";
          saveState();
          renderActiveWorkout();
        }
      },
      {
        label: "Dropset",
        style: set.type === "dropset" ? "default" : "muted",
        onClick: () => {
          set.type = "dropset";
          saveState();
          renderActiveWorkout();
        }
      },
      {
        label: "Delete Set",
        style: "destructive",
        onClick: () => {
          if (log.sets.length <= 1) {
            showToast("Keep at least one set");
            return;
          }
          log.sets.splice(setIndex, 1);
          saveState();
          renderActiveWorkout();
        }
      }
    ], {
      message: `Set ${setIndex + 1}`
    });
  }

  function areWorkingSetsComplete(sets) {
    const workingSets = (sets || []).filter((set) => set.type !== "warmup");
    if (!workingSets.length) {
      return false;
    }
    return workingSets.every((set) => !!set.completedAt);
  }

  function finishActiveWorkoutPrompt() {
    const draft = state.activeWorkoutDraft;
    if (!draft) {
      return;
    }
    if (draft.startedAt) {
      finalizeWorkoutElapsed(draft);
      saveState();
    }
    const incomplete = draft.exerciseLogs.some((log) => !areWorkingSetsComplete(log.sets || []));
    const message = incomplete
      ? "Some working sets are still incomplete. Finish workout anyway?"
      : "Finish this workout?";
    openConfirmActionSheet(
      "Finish Workout",
      message,
      "Finish Workout",
      () => {
        const summarySession = normalizeWorkoutSession({
          ...draft,
          durationSeconds: draft.durationSeconds || 0,
          created_at: draft.created_at || new Date().toISOString()
        });
        workoutSummaryDraft = buildWorkoutSummary(summarySession);
        document.getElementById("overlay-workout-summary").classList.add("open");
        renderWorkoutSummary();
      }
    );
  }

  function buildWorkoutSummary(session) {
    return {
      session,
      durationSeconds: session.durationSeconds,
      totalVolume: computeWorkoutVolume(session),
      exerciseCount: session.exerciseLogs.filter((log) => (log.sets || []).some((set) => !!set.completedAt)).length,
      completedSetCount: session.exerciseLogs.reduce((sum, log) => sum + log.sets.filter((set) => !!set.completedAt).length, 0),
      personalBests: session.personalBests || [],
      difficultyRating: session.difficultyRating || null
    };
  }

  function computeWorkoutVolume(session) {
    return (session.exerciseLogs || []).reduce((total, log) => {
      return total + (log.sets || []).reduce((sum, set) => {
        if (!set.completedAt || set.type === "warmup") {
          return sum;
        }
        if (set.weightKg > 0 && set.reps > 0) {
          return sum + (set.weightKg * set.reps);
        }
        // Bodyweight exercises (no weight logged) — exclude from kg volume
        return sum;
      }, 0);
    }, 0);
  }

  function renderWorkoutSummary() {
    const root = document.getElementById("workout-summary-root");
    if (!root) {
      return;
    }
    if (!workoutSummaryDraft) {
      root.innerHTML = "";
      return;
    }
    const { session, durationSeconds, totalVolume, exerciseCount, completedSetCount, personalBests } = workoutSummaryDraft;
    root.innerHTML = `
      <div class="workout-summary-name-row">
        <input class="form-input" id="workout-summary-name"
          type="text"
          placeholder="Session name (optional)"
          value="${escHtml(session.routineName || "Freeform Workout")}">
      </div>
      <div class="workout-summary-notes-row">
        <textarea class="form-input" id="workout-summary-notes"
          placeholder="Notes (optional — e.g. 'felt strong today')"
          rows="2">${escHtml(session.notes || "")}</textarea>
      </div>
      <div class="form-group">
        <label class="form-label">How was this session?</label>
        <div class="workout-difficulty-row">
          ${[1, 2, 3, 4, 5].map((n) => `
            <button class="workout-difficulty-btn ${workoutSummaryDraft?.difficultyRating === n ? "active" : ""}"
              type="button" onclick="setWorkoutDifficultyRating(${n})">
              ${"★".repeat(n)}${"☆".repeat(5 - n)}
            </button>
          `).join("")}
        </div>
      </div>
      <div class="workout-summary-grid">
        <div class="history-summary-item">
          <div class="history-summary-label">Duration</div>
          <div class="history-summary-value">
            <input class="form-input" id="workout-summary-duration-minutes" type="number" min="0" step="1" placeholder="Minutes" value="${durationSeconds > 0 ? Math.round(durationSeconds / 60) : ""}">
          </div>
        </div>
        <div class="history-summary-item"><div class="history-summary-label">Volume</div><div class="history-summary-value">${Math.round(totalVolume)} kg</div></div>
        <div class="history-summary-item"><div class="history-summary-label">Exercises</div><div class="history-summary-value">${exerciseCount}</div></div>
        <div class="history-summary-item"><div class="history-summary-label">Sets</div><div class="history-summary-value">${completedSetCount}</div></div>
      </div>
      ${personalBests.length ? `
        <div class="workout-summary-prs">
          <div class="card-label">PRs Hit</div>
          ${personalBests.map((pr) => `<div class="workout-summary-pr">${escHtml(pr.label)}</div>`).join("")}
        </div>
      ` : ""}
      <div class="workout-summary-breakdown">
        ${session.exerciseLogs.map((log) => {
          const exercise = getExerciseById(log.exerciseId);
          return `
            <div class="workout-summary-exercise">
              <div class="workout-summary-exercise-name">${escHtml(exercise?.name || "Exercise")}</div>
              <div class="workout-summary-set-list">
                ${log.sets.map((set) => `<div class="workout-summary-set">${escHtml(formatWorkoutSetDisplay(exercise, set))}</div>`).join("")}
              </div>
            </div>
          `;
        }).join("")}
      </div>
      <div class="workout-inline-actions">
        <button class="btn btn-primary" type="button" onclick="saveFinishedWorkout()">Save Workout</button>
        <button class="btn btn-secondary" type="button" onclick="discardFinishedWorkout()">Discard</button>
      </div>
    `;
  }

  function formatWorkoutSetDisplay(exercise, set) {
    const prefix = set.type === "warmup" ? "Warmup" : set.type === "dropset" ? "Dropset" : "Working";
    const inputType = normalizeExerciseInputType(exercise?.inputType);
    if (inputType === "reps_weight") {
      return `${prefix}: ${roundNutrient(set.weightKg || 0)}kg × ${Math.round(set.reps || 0)}`;
    }
    if (inputType === "time") {
      return `${prefix}: ${formatDuration(set.durationSeconds || 0)}`;
    }
    if (inputType === "distance") {
      return `${prefix}: ${roundNutrient(set.distanceKm || 0)} km`;
    }
    return `${prefix}: ${roundNutrient(set.distanceKm || 0)} km · ${formatDuration(set.durationSeconds || 0)}`;
  }

  function saveFinishedWorkout() {
    if (!workoutSummaryDraft) {
      return;
    }
    clearInterval(workoutElapsedInterval);
    clearInterval(workoutRestInterval);
    workoutElapsedInterval = null;
    workoutRestInterval = null;
    const durationMinutes = Math.max(0, normalizePositiveInteger(document.getElementById("workout-summary-duration-minutes")?.value, 0));
    const sessionName = document.getElementById("workout-summary-name")?.value?.trim() || "Freeform Workout";
    const sessionNotes = document.getElementById("workout-summary-notes")?.value?.trim() || "";
    const session = normalizeWorkoutSession({
      ...workoutSummaryDraft.session,
      durationSeconds: durationMinutes * 60,
      routineName: sessionName,
      notes: sessionNotes,
      difficultyRating: workoutSummaryDraft.difficultyRating || null
    });
    state.workoutSessions.push(session);
    state.workoutSessions.sort((a, b) => new Date(a.created_at || `${a.date}T12:00:00`).getTime() - new Date(b.created_at || `${b.date}T12:00:00`).getTime());
    state.activeWorkoutDraft = null;
    workoutSummaryDraft = null;
    saveState();
    closeModal("workout-summary");
    closeModal("active-workout");
    renderWorkoutPage();
    showToast("Workout saved");
  }

  function discardFinishedWorkout() {
    clearInterval(workoutElapsedInterval);
    clearInterval(workoutRestInterval);
    workoutElapsedInterval = null;
    workoutRestInterval = null;
    workoutSummaryDraft = null;
    state.activeWorkoutDraft = null;
    saveState();
    closeModal("workout-summary");
    closeModal("active-workout");
    renderWorkoutPage();
    showToast("Workout discarded");
  }

  function renderWorkoutHistory() {
    const root = document.getElementById("workout-view-history");
    if (!root) {
      return;
    }
    const sessions = state.workoutSessions.slice().sort((a, b) => new Date(b.created_at || `${b.date}T12:00:00`).getTime() - new Date(a.created_at || `${a.date}T12:00:00`).getTime());
    if (!sessions.length) {
      root.innerHTML = "<div class=\"card\"><div class=\"empty-state\"><div class=\"empty-icon\"><svg width=\"32\" height=\"32\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\"><path d=\"M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z\"/><polyline points=\"14 2 14 8 20 8\"/><line x1=\"16\" y1=\"13\" x2=\"8\" y2=\"13\"/><line x1=\"16\" y1=\"17\" x2=\"8\" y2=\"17\"/><polyline points=\"10 9 9 9 8 9\"/></svg></div>No workout history yet.</div></div>";
      return;
    }

    const grouped = groupWorkoutSessionsByWeek(sessions);
    root.innerHTML = grouped.map((group) => `
      <div class="card workout-history-card">
        <div class="card-label">${escHtml(group.label)}</div>
        <div class="workout-session-list">
          ${group.sessions.map((session) => renderWorkoutSessionCard(session)).join("")}
        </div>
      </div>
    `).join("") + `
      <div class="workout-export-row">
        <button class="btn btn-secondary" type="button" onclick="exportWorkoutHistoryCSV()">Export as CSV</button>
      </div>
    `;
  }

  function groupWorkoutSessionsByWeek(sessions) {
    const groups = new Map();
    sessions.forEach((session) => {
      const weekStart = getWeekStartDate(session.date);
      if (!groups.has(weekStart)) {
        groups.set(weekStart, []);
      }
      groups.get(weekStart).push(session);
    });
    return [...groups.entries()].map(([weekStart, weekSessions]) => ({
      label: `Week of ${new Date(`${weekStart}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
      sessions: weekSessions
    }));
  }

  function getWeekStartDate(isoDate) {
    const date = new Date(`${isoDate}T12:00:00`);
    const diff = (date.getDay() + 6) % 7;
    date.setDate(date.getDate() - diff);
    return toLocalIsoDate(date);
  }

  function renderWorkoutSessionCard(session) {
    const expanded = workoutHistoryExpandedId === session.id;
    const totalVolume = Math.round(computeWorkoutVolume(session));
    return `
      <div class="workout-session-card ${expanded ? "expanded" : ""}">
        <button class="workout-session-head" type="button" onclick="toggleWorkoutHistorySession('${session.id}')">
          <div>
            <div class="workout-session-name">${escHtml(session.routineName || "Freeform Workout")}</div>
            <div class="workout-session-meta">${new Date(`${session.date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} · ${session.durationSeconds > 0 ? formatDuration(session.durationSeconds) : "Manual"} · ${totalVolume} kg · ${session.exerciseLogs.length} exercises</div>
            ${session.difficultyRating ? `<div class="workout-session-difficulty">${"★".repeat(session.difficultyRating)}${"☆".repeat(5 - session.difficultyRating)}</div>` : ""}
          </div>
          <div class="workout-session-head-actions">
            <svg class="chevron-icon ${expanded ? "open" : ""}" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
          </div>
        </button>
        <button class="workout-session-delete" type="button"
          onclick="promptDeleteWorkoutSession('${session.id}')"
          aria-label="Delete session">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
        </button>
        ${expanded ? `
          <div class="workout-session-breakdown">
            ${session.exerciseLogs.map((log) => {
              const exercise = getExerciseById(log.exerciseId);
              return `
                <div class="workout-session-exercise">
                  <div class="workout-session-exercise-name">${escHtml(exercise?.name || "Exercise")}</div>
                  <div class="workout-session-set-list">${log.sets.map((set) => `<span>${escHtml(formatWorkoutSetDisplay(exercise, set))}</span>`).join("")}</div>
                </div>
              `;
            }).join("")}
          </div>
          ${session.notes ? `<div class="workout-session-notes">${escHtml(session.notes)}</div>` : ""}
        ` : ""}
      </div>
    `;
  }

  function toggleWorkoutHistorySession(sessionId) {
    workoutHistoryExpandedId = workoutHistoryExpandedId === sessionId ? null : sessionId;
    renderWorkoutHistory();
  }

  function promptDeleteWorkoutSession(sessionId) {
    openConfirmActionSheet(
      "Delete Workout",
      "Delete this workout session? This cannot be undone.",
      "Delete",
      () => {
        state.workoutSessions = state.workoutSessions.filter((s) => s.id !== sessionId);
        saveState();
        renderWorkoutHistory();
      }
    );
  }

  function renderWorkoutProgress() {
    const root = document.getElementById("workout-view-progress");
    if (!root) {
      return;
    }

    const selectedExercise = getExerciseById(workoutProgressExerciseId) || getAllExercises().find((exercise) => state.workoutSessions.some((session) => session.exerciseLogs.some((log) => log.exerciseId === exercise.id))) || null;
    if (selectedExercise && !workoutProgressExerciseId) {
      workoutProgressExerciseId = selectedExercise.id;
    }

    root.innerHTML = `
      ${renderWorkoutVolumeBalance()}
      <div class="card workout-progress-card">
        <div class="card-label">Progress</div>
        <div class="search-wrap">
          <span class="search-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          </span>
          <input class="search-input" id="workout-progress-search" placeholder="Search exercises..." oninput="renderWorkoutProgressSearchResults()" value="${escHtml(selectedExercise?.name || "")}">
        </div>
        <div class="workout-progress-search-results hidden" id="workout-progress-search-results"></div>
        ${selectedExercise ? renderExerciseProgressPanel(selectedExercise) : `<div class="empty-state"><div class="empty-icon"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></div>Select an exercise to see progress.</div>`}
      </div>
    `;
    renderWorkoutProgressSearchResults();
  }

  function renderWorkoutProgressSearchResults() {
    const input = document.getElementById("workout-progress-search");
    const root = document.getElementById("workout-progress-search-results");
    if (!input || !root) {
      return;
    }
    const query = input.value.trim().toLowerCase();
    if (!query) {
      root.classList.add("hidden");
      root.innerHTML = "";
      return;
    }
    const rows = getAllExercises().filter((exercise) => exercise.name.toLowerCase().includes(query)).slice(0, 8);
    if (!rows.length) {
      root.classList.add("hidden");
      root.innerHTML = "";
      return;
    }
    root.classList.remove("hidden");
    root.innerHTML = rows.map((exercise) => `
      <button class="workout-search-row" type="button" onclick="selectWorkoutProgressExercise('${exercise.id}')">${escHtml(exercise.name)} <span>${escHtml(exercise.muscleGroup)}</span></button>
    `).join("");
  }

  function selectWorkoutProgressExercise(exerciseId) {
    workoutProgressExerciseId = exerciseId;
    renderWorkoutProgress();
  }

  function showChartTooltip(el) {
    const label = el.dataset.label;
    const tooltip = document.getElementById("chart-tooltip") || document.getElementById("chart-tooltip-bar");
    if (!tooltip || !label) return;
    tooltip.textContent = label;
    tooltip.classList.remove("hidden");
    setTimeout(() => tooltip.classList.add("hidden"), 2500);
  }

  function renderExerciseProgressPanel(exercise) {
    const logs = getExerciseProgressEntries(exercise.id);
    const weeklyVolume = getWeeklyExerciseVolume(exercise.id);
    const pb = getExercisePersonalBest(exercise.id);
    const stagnation = detectStagnation(exercise.id);
    return `
      <div class="workout-chart-block">
        <div class="workout-chart-title">Max Weight Over Time</div>
        ${logs.length ? renderLineChart(logs.map((entry) => ({ label: entry.date.slice(5), value: entry.maxWeight || 0 })), "kg") : `<div class="helper-text helper-left">No weighted sets recorded yet.</div>`}
      </div>
      <div class="workout-chart-block">
        <div class="workout-chart-title">Weekly Volume</div>
        ${weeklyVolume.length ? renderBarChart(weeklyVolume.map((entry) => ({ label: entry.label, value: entry.volume })), "kg") : `<div class="helper-text helper-left">No working-set volume yet.</div>`}
      </div>
      <div class="workout-pr-badge">
        <div><strong>Heaviest:</strong> ${roundNutrient(pb.heaviestWeight)} kg ${pb.heaviestDate ? `· ${pb.heaviestDate}` : ""}</div>
        <div><strong>Most Reps:</strong> ${Math.round(pb.mostReps)} ${pb.repsDate ? `· ${pb.repsDate}` : ""}</div>
        <div><strong>Best Est. 1RM:</strong> ${roundNutrient(pb.bestEstimatedOneRepMax)} kg ${pb.oneRmDate ? `· ${pb.oneRmDate}` : ""}</div>
      </div>
      ${stagnation ? `
        <div class="workout-stagnation-alert">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>
          <div>
            <strong>Plateau detected</strong> — ${stagnation.sessions} sessions logged in 6 weeks with no improvement.
            <div class="workout-stagnation-tip">${escHtml(stagnation.suggestion)}</div>
          </div>
        </div>
      ` : ""}
      <div class="workout-log-table">
        <div class="workout-log-table-head"><span>Date</span><span>Sets</span><span>Best Set</span></div>
        ${logs.map((entry) => `
          <div class="workout-log-table-row">
            <span>${entry.date}</span>
            <span>${entry.setCount}</span>
            <span>${escHtml(entry.bestSetLabel)}</span>
          </div>
        `).join("")}
      </div>
      <div class="workout-streak-card">
        <div class="card-label">Streaks</div>
        <div class="workout-streak-metrics">
          <div><strong>Current streak:</strong> ${getWorkoutWeekStreak().current} weeks</div>
          <div><strong>Longest streak:</strong> ${getWorkoutWeekStreak().longest} weeks</div>
        </div>
        ${renderWorkoutMonthCalendar()}
      </div>
    `;
  }

  function getExerciseProgressEntries(exerciseId) {
    return state.workoutSessions
      .filter((session) => session.exerciseLogs.some((log) => log.exerciseId === exerciseId))
      .map((session) => {
        const log = session.exerciseLogs.find((entry) => entry.exerciseId === exerciseId);
        const workingSets = log.sets.filter((set) => !!set.completedAt && set.type !== "warmup");
        const maxWeight = workingSets.reduce((max, set) => Math.max(max, set.weightKg || 0), 0);
        const bestSet = workingSets.slice().sort((a, b) => ((b.weightKg || 0) - (a.weightKg || 0)) || ((b.reps || 0) - (a.reps || 0)))[0] || workingSets[0] || null;
        return {
          date: session.date,
          setCount: workingSets.length,
          maxWeight,
          bestSetLabel: bestSet ? formatWorkoutSetDisplay(getExerciseById(exerciseId), bestSet) : "-"
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  function getWeeklyExerciseVolume(exerciseId) {
    const weeks = new Map();
    state.workoutSessions.forEach((session) => {
      const log = session.exerciseLogs.find((entry) => entry.exerciseId === exerciseId);
      if (!log) {
        return;
      }
      const weekKey = getWeekStartDate(session.date);
      const volume = log.sets.reduce((sum, set) => {
        if (!set.completedAt || set.type === "warmup") {
          return sum;
        }
        if (set.weightKg > 0 && set.reps > 0) {
          return sum + (set.weightKg * set.reps);
        }
        return sum;
      }, 0);
      weeks.set(weekKey, (weeks.get(weekKey) || 0) + volume);
    });
    return [...weeks.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([week, volume]) => ({ label: week.slice(5), volume }));
  }

  function renderLineChart(points, unit) {
    if (!points.length) return "";
    const width = 320;
    const height = 140;
    const padLeft = 36;
    const padBottom = 24;
    const padTop = 12;
    const padRight = 12;
    const chartW = width - padLeft - padRight;
    const chartH = height - padBottom - padTop;
    const max = Math.max(...points.map((p) => p.value), 1);
    const min = Math.min(...points.map((p) => p.value), 0);
    const range = max - min || 1;
    const stepX = points.length > 1 ? chartW / (points.length - 1) : 0;
    const toY = (v) => padTop + chartH - ((v - min) / range) * chartH;
    const toX = (i) => padLeft + stepX * i;
    const polyline = points.map((p, i) => `${toX(i)},${toY(p.value)}`).join(" ");
    const gridCount = 3;
    const grids = Array.from({ length: gridCount + 1 }, (_, i) => {
      const v = min + (range * i) / gridCount;
      const y = toY(v);
      return `
      <line x1="${padLeft}" y1="${y}" x2="${width - padRight}" y2="${y}" stroke="var(--border)" stroke-width="1"/>
      <text x="${padLeft - 4}" y="${y + 4}" text-anchor="end" font-size="10" fill="var(--text2)">${Math.round(v)}</text>
    `;
    });
    const circles = points.map((p, i) => `
    <circle cx="${toX(i)}" cy="${toY(p.value)}" r="4" fill="var(--accent)" class="chart-dot"
      data-label="${escHtml(p.label)}: ${roundNutrient(p.value)} ${unit}"/>
    <circle cx="${toX(i)}" cy="${toY(p.value)}" r="12" fill="transparent" class="chart-hit"
      onmouseenter="showChartTooltip(this)" ontouchstart="showChartTooltip(this)"
      data-label="${escHtml(p.label)}: ${roundNutrient(p.value)} ${unit}"/>
  `);
    return `
      <div class="workout-chart-wrap" id="chart-wrap-${Math.random().toString(36).slice(2)}">
        <div class="chart-tooltip hidden" id="chart-tooltip"></div>
        <svg class="workout-chart" viewBox="0 0 ${width} ${height}">
          ${grids.join("")}
          <polyline fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round" points="${polyline}"/>
          ${circles.join("")}
          ${points.map((p, i) => i === 0 || i === points.length - 1
            ? `<text x="${toX(i)}" y="${height - 6}" text-anchor="${i === 0 ? "start" : "end"}" font-size="9" fill="var(--text2)">${escHtml(p.label)}</text>`
            : "").join("")}
        </svg>
      </div>
      <div class="workout-chart-caption">Peak set weight by day (${unit})</div>
    `;
  }

  function renderBarChart(points, unit) {
    if (!points.length) return "";
    const width = 320;
    const height = 140;
    const padLeft = 36;
    const padBottom = 24;
    const padTop = 12;
    const padRight = 12;
    const chartW = width - padLeft - padRight;
    const chartH = height - padBottom - padTop;
    const max = Math.max(...points.map((p) => p.value), 1);
    const barCount = points.length;
    const barW = Math.max(10, Math.floor(chartW / barCount) - 4);
    const gridCount = 3;
    const grids = Array.from({ length: gridCount + 1 }, (_, i) => {
      const v = (max * i) / gridCount;
      const y = padTop + chartH - (v / max) * chartH;
      return `
      <line x1="${padLeft}" y1="${y}" x2="${width - padRight}" y2="${y}" stroke="var(--border)" stroke-width="1"/>
      <text x="${padLeft - 4}" y="${y + 4}" text-anchor="end" font-size="10" fill="var(--text2)">${Math.round(v)}</text>
    `;
    });
    const bars = points.map((p, i) => {
      const bh = ((p.value || 0) / max) * chartH;
      const x = padLeft + i * (barW + 4);
      const y = padTop + chartH - bh;
      return `
      <rect x="${x}" y="${y}" width="${barW}" height="${bh}" rx="4" fill="var(--accent2)"
        onmouseenter="showChartTooltip(this)" ontouchstart="showChartTooltip(this)"
        data-label="${escHtml(p.label)}: ${Math.round(p.value)} ${unit}"/>
      ${i === 0 || i === points.length - 1
        ? `<text x="${x + barW / 2}" y="${height - 6}" text-anchor="middle" font-size="9" fill="var(--text2)">${escHtml(p.label)}</text>`
        : ""}
    `;
    });
    return `
      <div class="workout-chart-wrap">
        <div class="chart-tooltip hidden" id="chart-tooltip-bar"></div>
        <svg class="workout-chart" viewBox="0 0 ${width} ${height}">
          ${grids.join("")}
          ${bars.join("")}
        </svg>
      </div>
      <div class="workout-chart-caption">Weekly working-set volume (${unit})</div>
    `;
  }

  function getWorkoutWeekStreak() {
    const weeks = [...new Set(state.workoutSessions.map((session) => getWeekStartDate(session.date)))].sort();
    let longest = 0;
    let current = 0;
    let run = 0;
    for (let index = 0; index < weeks.length; index += 1) {
      if (index === 0) {
        run = 1;
      } else {
        const prev = new Date(`${weeks[index - 1]}T12:00:00`);
        const currentDate = new Date(`${weeks[index]}T12:00:00`);
        const diff = Math.round((currentDate - prev) / 86400000);
        run = diff === 7 ? run + 1 : 1;
      }
      longest = Math.max(longest, run);
    }
    if (weeks.length) {
      const latest = weeks[weeks.length - 1];
      const currentWeek = getWeekStartDate(todayStr());
      if (latest === currentWeek) {
        current = run;
      }
    }
    return { current, longest };
  }

  function detectStagnation(exerciseId) {
    const exercise = getExerciseById(exerciseId);
    if (!exercise) return null;
    const inputType = normalizeExerciseInputType(exercise.inputType);
    const sixWeeksAgo = new Date();
    sixWeeksAgo.setDate(sixWeeksAgo.getDate() - 42);
    const sessions = state.workoutSessions
      .filter((session) => new Date(`${session.date}T12:00:00`) >= sixWeeksAgo)
      .sort((a, b) => a.date.localeCompare(b.date));
    const values = [];
    for (const session of sessions) {
      const log = session.exerciseLogs?.find((entry) => entry.exerciseId === exerciseId);
      if (!log) continue;
      const completed = log.sets.filter((set) => set.completedAt);
      if (!completed.length) continue;
      if (inputType === "reps_weight") {
        const best = Math.max(...completed.map((set) => set.weightKg || 0));
        if (best > 0) values.push(best);
      } else if (inputType === "time") {
        const best = Math.max(...completed.map((set) => set.durationSeconds || 0));
        if (best > 0) values.push(best);
      } else {
        const best = Math.max(...completed.map((set) => set.distanceKm || 0));
        if (best > 0) values.push(best);
      }
    }
    if (values.length < 3) return null;
    const first = values[0];
    const last = values[values.length - 1];
    if (last > first * 1.02) return null;
    return {
      sessions: values.length,
      suggestion: inputType === "reps_weight"
        ? "Try adding 2.5kg, increasing reps, or changing the rep range."
        : "Try increasing duration or distance by 5–10%."
    };
  }

  function computeMuscleGroupVolume(weeks = 4) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - weeks * 7);
    const volumeByGroup = {};
    EXERCISE_FILTERS.filter((filter) => filter !== "All").forEach((group) => { volumeByGroup[group] = 0; });
    for (const session of state.workoutSessions) {
      if (new Date(`${session.date}T12:00:00`) < cutoff) continue;
      for (const log of (session.exerciseLogs || [])) {
        const exercise = getExerciseById(log.exerciseId);
        if (!exercise) continue;
        const group = exercise.muscleGroup;
        if (!Object.prototype.hasOwnProperty.call(volumeByGroup, group)) continue;
        for (const set of log.sets || []) {
          if (!set.completedAt) continue;
          if (set.weightKg > 0 && set.reps > 0) volumeByGroup[group] += set.weightKg * set.reps;
          else if (set.durationSeconds > 0) volumeByGroup[group] += set.durationSeconds;
          else if (set.distanceKm > 0) volumeByGroup[group] += set.distanceKm * 1000;
        }
      }
    }
    return volumeByGroup;
  }

  function formatVolumeLabel(value) {
    return value >= 1000 ? `${(value / 1000).toFixed(1)}t` : `${Math.round(value)}kg`;
  }

  function renderWorkoutVolumeBalance() {
    const volumeMap = computeMuscleGroupVolume();
    const rows = Object.entries(volumeMap).filter(([, volume]) => volume > 0).sort((a, b) => b[1] - a[1]);
    if (!rows.length) return "";
    const maxVolume = rows[0][1] || 1;
    return `
      <div class="card workout-volume-balance-card">
        <div class="card-label">Muscle Group Volume · Last 4 Weeks</div>
        <div class="workout-volume-bars">
          ${rows.map(([group, volume]) => `
            <div class="workout-volume-bar-row">
              <div class="workout-volume-bar-label">${escHtml(group)}</div>
              <div class="workout-volume-bar-track">
                <div class="workout-volume-bar-fill" style="width:${Math.round((volume / maxVolume) * 100)}%"></div>
              </div>
              <div class="workout-volume-bar-value">${formatVolumeLabel(volume)}</div>
            </div>
          `).join("")}
        </div>
      </div>
    `;
  }

  function exportWorkoutHistoryCSV() {
    const rows = [["Date", "Session Name", "Duration (min)", "Exercise", "Set", "Type", "Reps", "Weight (kg)", "Duration (s)", "Distance (km)", "RPE", "Rest (s)", "PR", "Difficulty"]];
    for (const session of [...state.workoutSessions].sort((a, b) => b.date.localeCompare(a.date))) {
      const date = session.date || "";
      const name = session.routineName || "Workout";
      const durationMin = session.durationSeconds ? Math.round(session.durationSeconds / 60) : "";
      const diff = session.difficultyRating || "";
      for (const log of (session.exerciseLogs || [])) {
        const exercise = getExerciseById(log.exerciseId);
        const exName = exercise?.name || log.exerciseId;
        log.sets.forEach((set, index) => {
          if (!set.completedAt) return;
          rows.push([
            date, name, durationMin, exName, index + 1, set.type || "working",
            set.reps || "", set.weightKg || "", set.durationSeconds || "", set.distanceKm || "",
            set.rpe !== null ? set.rpe : "", set.actualRestSeconds || "",
            set.isPersonalBest ? "Yes" : "", diff
          ]);
        });
      }
    }
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, "\"\"")}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `hale-workouts-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    showToast("Export downloaded");
  }

  function setWorkoutDifficultyRating(rating) {
    if (!workoutSummaryDraft) return;
    workoutSummaryDraft.difficultyRating = rating;
    renderWorkoutSummary();
  }

  function calculatePlates(targetKg, barbellKg) {
    let remaining = (targetKg - barbellKg) / 2;
    if (remaining < 0) return null;
    const result = [];
    for (const plate of PLATE_SIZES) {
      const count = Math.floor(remaining / plate);
      if (count > 0) {
        result.push({ weight: plate, count });
        remaining -= plate * count;
        remaining = Math.round(remaining * 1000) / 1000;
      }
    }
    if (remaining > 0.01) result.push({ weight: "∓", count: `~${remaining.toFixed(2)}kg unloaded` });
    return result;
  }

  function openPlateCalc() {
    document.getElementById("overlay-plate-calc")?.classList.add("open");
    renderPlateCalcResult();
  }

  function setPlateCalcBar(kg, button) {
    workoutPlateCalcBar = kg;
    document.querySelectorAll("#overlay-plate-calc .segmented-btn").forEach((btn) => btn.classList.remove("active"));
    button?.classList.add("active");
    renderPlateCalcResult();
  }

  function renderPlateCalcResult() {
    const root = document.getElementById("plate-calc-result");
    const targetKg = parseFloat(document.getElementById("plate-calc-target")?.value || "0");
    if (!root) return;
    if (!targetKg) {
      root.innerHTML = "";
      return;
    }
    const plates = calculatePlates(targetKg, workoutPlateCalcBar);
    if (!plates) {
      root.innerHTML = `<div class="helper-text helper-left">Target is lighter than the selected bar.</div>`;
      return;
    }
    root.innerHTML = `
      <div class="plate-calc-side-label">Each side</div>
      <div class="plate-calc-plates">
        ${plates.map((plate) => {
          if (typeof plate.weight !== "number") {
            return `<span class="learn-tag">${escHtml(String(plate.count))}</span>`;
          }
          const className = `plate-pill--${String(plate.weight).replace(".", "_")}`;
          return `<span class="plate-pill ${className}">${plate.count} × ${plate.weight}kg</span>`;
        }).join("")}
      </div>
    `;
  }

  function promptRoutineActions(routineId) {
    const routine = getRoutineById(routineId);
    if (!routine) return;
    openActionSheet(routine.name, [
      { label: "Start Workout", onClick: () => startRoutineWorkout(routineId) },
      { label: "Edit Routine", onClick: () => openWorkoutBuilder(routineId) },
      { label: "Archive Routine", style: "muted", onClick: () => archiveRoutine(routineId) }
    ]);
  }

  function promptArchivedRoutineActions(routineId) {
    const routine = (state.archivedRoutines || []).find((entry) => entry.id === routineId);
    if (!routine) return;
    openActionSheet(routine.name, [
      { label: "Restore Routine", onClick: () => restoreRoutine(routineId) }
    ]);
  }

  function toggleArchivedRoutines() {
    archivedRoutinesExpanded = !archivedRoutinesExpanded;
    renderWorkoutHome();
  }

  function archiveRoutine(routineId) {
    const index = state.routines.findIndex((routine) => routine.id === routineId);
    if (index < 0) return;
    const [routine] = state.routines.splice(index, 1);
    routine.archivedAt = new Date().toISOString();
    state.archivedRoutines = state.archivedRoutines || [];
    state.archivedRoutines.push(routine);
    saveState();
    renderWorkoutPage();
    showToast("Routine archived");
  }

  function restoreRoutine(routineId) {
    const archived = state.archivedRoutines || [];
    const index = archived.findIndex((routine) => routine.id === routineId);
    if (index < 0) return;
    const [routine] = archived.splice(index, 1);
    delete routine.archivedAt;
    state.routines.push(routine);
    saveState();
    renderWorkoutPage();
    showToast("Routine restored");
  }

  function renderWorkoutMonthCalendar() {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    const totalDays = new Date(year, month + 1, 0).getDate();
    const completed = new Set(state.workoutSessions.filter((session) => session.date.startsWith(`${year}-${String(month + 1).padStart(2, "0")}`)).map((session) => session.date));
    return `
      <div class="workout-month-grid">
        ${Array.from({ length: totalDays }, (_, index) => {
          const day = String(index + 1).padStart(2, "0");
          const date = `${year}-${String(month + 1).padStart(2, "0")}-${day}`;
          return `<span class="workout-month-dot ${completed.has(date) ? "done" : ""}" title="${date}"></span>`;
        }).join("")}
      </div>
    `;
  }

  document.addEventListener("DOMContentLoaded", () => {
    renderWorkoutPage();
  });

  window.switchWorkoutTab = switchWorkoutTab;
  window.openWorkoutBuilder = openWorkoutBuilder;
  window.promptDeleteWorkoutRoutine = promptDeleteWorkoutRoutine;
  window.toggleWorkoutTemplatePicker = toggleWorkoutTemplatePicker;
  window.applyWorkoutTemplate = applyWorkoutTemplate;
  window.toggleWorkoutBuilderDay = toggleWorkoutBuilderDay;
  window.toggleWorkoutBuilderExercise = toggleWorkoutBuilderExercise;
  window.updateWorkoutBuilderExercise = updateWorkoutBuilderExercise;
  window.setWorkoutDragIndex = setWorkoutDragIndex;
  window.allowWorkoutDrag = allowWorkoutDrag;
  window.dropWorkoutExercise = dropWorkoutExercise;
  window.startWorkoutExerciseHold = startWorkoutExerciseHold;
  window.cancelWorkoutExerciseHold = cancelWorkoutExerciseHold;
  window.promptDeleteWorkoutExercise = promptDeleteWorkoutExercise;
  window.openExerciseLibrary = openExerciseLibrary;
  window.renderExerciseLibrary = renderExerciseLibrary;
  window.setWorkoutLibraryFilter = setWorkoutLibraryFilter;
  window.setWorkoutEquipmentFilter = setWorkoutEquipmentFilter;
  window.handleExerciseLibraryPick = handleExerciseLibraryPick;
  window.openCustomExerciseModal = openCustomExerciseModal;
  window.saveCustomExercise = saveCustomExercise;
  window.saveWorkoutRoutine = saveWorkoutRoutine;
  window.startRoutineWorkout = startRoutineWorkout;
  window.startFreeformWorkout = startFreeformWorkout;
  window.resumeWorkoutDraft = resumeWorkoutDraft;
  window.startActiveWorkoutTimer = startActiveWorkoutTimer;
  window.pauseActiveWorkoutTimer = pauseActiveWorkoutTimer;
  window.stopActiveWorkoutTimer = stopActiveWorkoutTimer;
  window.discardWorkoutDraft = discardWorkoutDraft;
  window.jumpWorkoutExercise = jumpWorkoutExercise;
  window.openWorkoutJump = openWorkoutJump;
  window.jumpToWorkoutExercise = jumpToWorkoutExercise;
  window.skipRestTimer = skipRestTimer;
  window.addSetToActiveWorkout = addSetToActiveWorkout;
  window.addExerciseToActiveWorkout = addExerciseToActiveWorkout;
  window.updateWorkoutSetField = updateWorkoutSetField;
  window.copyLastWorkoutSet = copyLastWorkoutSet;
  window.toggleWorkoutSetComplete = toggleWorkoutSetComplete;
  window.undoLastCompletedSet = undoLastCompletedSet;
  window.setWorkoutSetRpe = setWorkoutSetRpe;
  window.openWorkoutSetMenu = openWorkoutSetMenu;
  window.startWorkoutSetHold = startWorkoutSetHold;
  window.cancelWorkoutSetHold = cancelWorkoutSetHold;
  window.finishActiveWorkoutPrompt = finishActiveWorkoutPrompt;
  window.saveFinishedWorkout = saveFinishedWorkout;
  window.discardFinishedWorkout = discardFinishedWorkout;
  window.toggleWorkoutHistorySession = toggleWorkoutHistorySession;
  window.promptDeleteWorkoutSession = promptDeleteWorkoutSession;
  window.renderWorkoutProgressSearchResults = renderWorkoutProgressSearchResults;
  window.selectWorkoutProgressExercise = selectWorkoutProgressExercise;
  window.exportWorkoutHistoryCSV = exportWorkoutHistoryCSV;
  window.setWorkoutDifficultyRating = setWorkoutDifficultyRating;
  window.openPlateCalc = openPlateCalc;
  window.setPlateCalcBar = setPlateCalcBar;
  window.renderPlateCalcResult = renderPlateCalcResult;
  window.promptSwapExercise = promptSwapExercise;
  window.promptRoutineActions = promptRoutineActions;
  window.promptArchivedRoutineActions = promptArchivedRoutineActions;
  window.toggleArchivedRoutines = toggleArchivedRoutines;
  window.showChartTooltip = showChartTooltip;
  window.openActionSheet = openActionSheet;
  window.closeActionSheet = closeActionSheet;
})();

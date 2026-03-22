module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL || "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

  if (!supabaseUrl || !serviceRoleKey) {
    sendJson(res, 500, { error: "Server is missing Supabase service role configuration." });
    return;
  }

  const authHeader = req.headers["authorization"] || "";
  const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!jwt) {
    sendJson(res, 401, { error: "Authentication required." });
    return;
  }

  let userId;
  try {
    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${jwt}`,
        apikey: serviceRoleKey
      }
    });
    if (!userRes.ok) {
      sendJson(res, 401, { error: "Invalid or expired session. Please sign in again." });
      return;
    }
    const userData = await userRes.json();
    userId = userData.id;
    if (!userId) {
      sendJson(res, 401, { error: "Could not identify user." });
      return;
    }
  } catch (_e) {
    sendJson(res, 502, { error: "Failed to verify session with Supabase." });
    return;
  }

  const USER_DATA_TABLES = [
    "meal_logs",
    "water_logs",
    "step_logs",
    "water_units",
    "foods",
    "goals",
    "ai_food_cache",
    "workout_sessions",
    "workout_routines",
    "workout_custom_exercises",
    "health_medication_logs",
    "health_doctor_visits",
    "health_blood_tests",
    "health_body_metrics",
    "health_medications"
  ];

  const errors = [];

  for (const table of USER_DATA_TABLES) {
    try {
      const deleteRes = await fetch(
        `${supabaseUrl}/rest/v1/${table}?user_id=eq.${encodeURIComponent(userId)}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${serviceRoleKey}`,
            apikey: serviceRoleKey,
            "Content-Type": "application/json",
            Prefer: "return=minimal"
          }
        }
      );
      if (!deleteRes.ok && deleteRes.status !== 404) {
        const errText = await deleteRes.text();
        errors.push(`${table}: ${deleteRes.status} ${errText.slice(0, 120)}`);
      }
    } catch (err) {
      errors.push(`${table}: ${err.message}`);
    }
  }

  if (errors.length) {
    console.error("Account deletion — partial errors:", errors);
  }

  try {
    const deleteUserRes = await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey
      }
    });
    if (!deleteUserRes.ok) {
      const errText = await deleteUserRes.text();
      sendJson(res, 502, { error: `Failed to delete auth account: ${errText.slice(0, 200)}` });
      return;
    }
  } catch (err) {
    sendJson(res, 502, { error: `Failed to delete auth account: ${err.message}` });
    return;
  }

  sendJson(res, 200, { success: true, tablesCleared: USER_DATA_TABLES.length - errors.length });
};

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

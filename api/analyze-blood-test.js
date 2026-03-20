module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  const openAiApiKey = process.env.OPENAI_API_KEY || "";
  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
  if (!openAiApiKey) {
    sendJson(res, 500, { error: "OPENAI_API_KEY is missing. Configure it before using blood test analysis." });
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch (_error) {
    sendJson(res, 400, { error: "Request body must be valid JSON." });
    return;
  }

  const report = body.report;
  const nutrition = body.nutrition || {};
  const workoutFrequency = Number(body.workoutFrequency || 0);
  if (!report || !Array.isArray(report.markers) || !report.markers.length) {
    sendJson(res, 400, { error: "A blood test report with markers is required." });
    return;
  }

  try {
    const result = await requestBloodAnalysis({ report, nutrition, workoutFrequency, openAiApiKey, model });
    sendJson(res, 200, result);
  } catch (error) {
    sendJson(res, 502, { error: error.message || "Blood test analysis failed." });
  }
};

async function requestBloodAnalysis({ report, nutrition, workoutFrequency, openAiApiKey, model }) {
  const payload = buildBloodAnalysisPayload({ report, nutrition, workoutFrequency, model });
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openAiApiKey}`
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    let openAiMessage = "Blood test analysis request failed.";
    try {
      const parsedError = JSON.parse(errorText);
      openAiMessage = parsedError?.error?.message || openAiMessage;
    } catch (_error) {
      openAiMessage = errorText || openAiMessage;
    }
    throw new Error(openAiMessage);
  }

  const result = await response.json();
  const outputText = extractOutputText(result);
  if (!outputText) {
    throw new Error("Blood test analysis response was incomplete.");
  }

  let parsed;
  try {
    parsed = JSON.parse(outputText);
  } catch (_error) {
    throw new Error("Blood test analysis format was invalid.");
  }
  return normalizeBloodAnalysis(parsed);
}

function buildBloodAnalysisPayload({ report, nutrition, workoutFrequency, model }) {
  const markersText = report.markers.map((marker) => {
    const refMin = marker.referenceMin ?? "";
    const refMax = marker.referenceMax ?? "";
    return `${marker.name}: ${marker.value} ${marker.unit} (range ${refMin}-${refMax}, status ${marker.status})`;
  }).join("\n");

  return {
    model,
    input: [
      {
        role: "system",
        content: [{
          type: "input_text",
          text: [
            "You are a helpful health assistant for a fitness app.",
            "Analyse blood test results and respond in plain, friendly language.",
            "Always include a disclaimer that you are not a doctor and results should be discussed with a healthcare professional.",
            "Never be alarmist. Be calm, supportive, and constructive.",
            "If results are mostly normal, keep the response positive and brief.",
            "Do not diagnose conditions. Focus on supportive interpretation and practical habits.",
            "Return strict JSON matching the schema."
          ].join(" ")
        }]
      },
      {
        role: "user",
        content: [{
          type: "input_text",
          text: [
            `Blood test date: ${report.date}`,
            `Lab: ${report.labName || "Unknown"}`,
            `Notes: ${report.notes || "None"}`,
            "Markers:",
            markersText,
            `Recent nutrition averages (last 7 days): calories ${nutrition.avgCalories || 0}, protein ${nutrition.avgProtein || 0}g, carbs ${nutrition.avgCarbs || 0}g, fat ${nutrition.avgFat || 0}g.`,
            `Recent workout frequency (last 30 days): ${workoutFrequency} sessions.`
          ].join("\n")
        }]
      }
    ],
    text: {
      format: {
        type: "json_schema",
        name: "blood_test_insight",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            flaggedMarkers: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  name: { type: "string" },
                  value: { type: "number" },
                  unit: { type: "string" },
                  status: { type: "string" },
                  plainEnglishExplanation: { type: "string" },
                  suggestion: { type: "string" }
                },
                required: ["name", "value", "unit", "status", "plainEnglishExplanation", "suggestion"]
              }
            },
            nutritionSuggestions: { type: "array", items: { type: "string" } },
            workoutSuggestions: { type: "array", items: { type: "string" } },
            generalAdvice: { type: "string" },
            disclaimer: { type: "string" }
          },
          required: ["flaggedMarkers", "nutritionSuggestions", "workoutSuggestions", "generalAdvice", "disclaimer"]
        }
      }
    }
  };
}

function normalizeBloodAnalysis(value) {
  return {
    flaggedMarkers: Array.isArray(value.flaggedMarkers) ? value.flaggedMarkers.map((item) => ({
      name: String(item?.name || "").trim(),
      value: Number(item?.value) || 0,
      unit: String(item?.unit || "").trim(),
      status: String(item?.status || "").trim(),
      plainEnglishExplanation: String(item?.plainEnglishExplanation || "").trim(),
      suggestion: String(item?.suggestion || "").trim()
    })).filter((item) => item.name) : [],
    nutritionSuggestions: Array.isArray(value.nutritionSuggestions) ? value.nutritionSuggestions.map((item) => String(item || "").trim()).filter(Boolean) : [],
    workoutSuggestions: Array.isArray(value.workoutSuggestions) ? value.workoutSuggestions.map((item) => String(item || "").trim()).filter(Boolean) : [],
    generalAdvice: String(value.generalAdvice || "").trim(),
    disclaimer: String(value.disclaimer || "Always discuss results with your doctor.").trim() || "Always discuss results with your doctor."
  };
}

function extractOutputText(responseJson) {
  if (typeof responseJson.output_text === "string" && responseJson.output_text) {
    return responseJson.output_text;
  }
  const outputs = Array.isArray(responseJson.output) ? responseJson.output : [];
  for (const output of outputs) {
    const contents = Array.isArray(output.content) ? output.content : [];
    for (const content of contents) {
      if (typeof content.text === "string" && content.text) {
        return content.text;
      }
    }
  }
  return "";
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") {
    return req.body;
  }
  if (typeof req.body === "string") {
    return req.body ? JSON.parse(req.body) : {};
  }
  return await new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

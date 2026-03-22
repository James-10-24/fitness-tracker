module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  const openAiApiKey = process.env.OPENAI_API_KEY || "";
  const model = process.env.OPENAI_VISION_MODEL || "gpt-4.1-mini";
  if (!openAiApiKey) {
    sendJson(res, 500, { error: "OPENAI_API_KEY is missing." });
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch (_error) {
    sendJson(res, 400, { error: "Request body must be valid JSON." });
    return;
  }

  const imageDataUrl = typeof body.image_data_url === "string" ? body.image_data_url.trim() : "";
  if (!/^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(imageDataUrl)) {
    sendJson(res, 400, { error: "A valid base64 image data URL is required." });
    return;
  }

  try {
    const result = await scanBloodReport({ imageDataUrl, openAiApiKey, model });
    sendJson(res, 200, result);
  } catch (error) {
    sendJson(res, 502, { error: error.message || "Blood report scan failed." });
  }
};

async function scanBloodReport({ imageDataUrl, openAiApiKey, model }) {
  const payload = {
    model,
    input: [
      {
        role: "system",
        content: [{
          type: "input_text",
          text: [
            "You are a medical document parser for a fitness and health tracking app.",
            "The user will provide an image of a blood test or medical lab report.",
            "Your job is to extract every test marker you can read from the image.",
            "For each marker, extract: the test name, the numeric result value, the unit of measurement, and the reference range (min and max) if printed.",
            "Return ONLY a strict JSON array of marker objects. Do not include any commentary.",
            "If a value is flagged as high or low by the lab (e.g. H, L, *, arrows), note it in the status field.",
            "If the reference range only has one bound (e.g. '>60' or '<5.2'), set the other bound to null.",
            "If you cannot read a value clearly, omit that marker entirely rather than guessing.",
            "Normalise units to common abbreviations (mmol/L, g/dL, U/L, %, pmol/L, µmol/L, nmol/L, mIU/L, ×10⁹/L, ×10¹²/L, mL/min, µg/L)."
          ].join(" ")
        }]
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: "Please extract all blood test markers from this lab report image."
          },
          {
            type: "input_image",
            image_url: imageDataUrl
          }
        ]
      }
    ],
    text: {
      format: {
        type: "json_schema",
        name: "blood_report_scan",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            markers: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  name: { type: "string" },
                  value: { type: "number" },
                  unit: { type: "string" },
                  referenceMin: { type: ["number", "null"] },
                  referenceMax: { type: ["number", "null"] },
                  status: { type: "string", enum: ["normal", "high", "low", "unknown"] }
                },
                required: ["name", "value", "unit", "referenceMin", "referenceMax", "status"]
              }
            },
            labName: { type: "string" },
            reportDate: { type: "string" }
          },
          required: ["markers", "labName", "reportDate"]
        }
      }
    }
  };

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
    let message = "Blood report scan request failed.";
    try {
      message = JSON.parse(errorText)?.error?.message || message;
    } catch (_e) {
      message = errorText || message;
    }
    throw new Error(message);
  }

  const result = await response.json();
  const outputText = extractOutputText(result);
  if (!outputText) {
    throw new Error("Blood report scan response was empty.");
  }

  let parsed;
  try {
    parsed = JSON.parse(outputText);
  } catch (_e) {
    throw new Error("Blood report scan returned invalid JSON.");
  }

  return normalizeScannedReport(parsed);
}

function normalizeScannedReport(raw) {
  const markers = Array.isArray(raw.markers)
    ? raw.markers.map((m) => ({
        name: String(m?.name || "").trim(),
        value: Number(m?.value) || 0,
        unit: String(m?.unit || "").trim(),
        referenceMin: m?.referenceMin != null ? Number(m.referenceMin) : null,
        referenceMax: m?.referenceMax != null ? Number(m.referenceMax) : null,
        status: ["normal", "high", "low", "unknown"].includes(m?.status) ? m.status : "unknown"
      })).filter((m) => m.name && m.value !== 0)
    : [];

  return {
    markers,
    labName: String(raw.labName || "").trim(),
    reportDate: String(raw.reportDate || "").trim()
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
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return req.body ? JSON.parse(req.body) : {};
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 20_000_000) {
        reject(new Error("Image too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch (e) { reject(e); }
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

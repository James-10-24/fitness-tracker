module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  const openAiApiKey = process.env.OPENAI_API_KEY || "";
  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
  if (!openAiApiKey) {
    sendJson(res, 500, { error: "OPENAI_API_KEY is missing. Configure it in your deployment environment before using AI photo recognition." });
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
    sendJson(res, 400, { error: "A valid image data URL is required." });
    return;
  }

  try {
    const payload = await requestImageRecognition({ imageDataUrl, openAiApiKey, model });
    sendJson(res, 200, payload);
  } catch (error) {
    sendJson(res, 502, { error: error.message || "AI image recognition failed." });
  }
};

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
      if (raw.length > 8_000_000) {
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

async function requestImageRecognition({ imageDataUrl, openAiApiKey, model }) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openAiApiKey}`
    },
    body: JSON.stringify(buildImageRecognitionPayload({ imageDataUrl, model }))
  });

  if (!response.ok) {
    const errorText = await response.text();
    let openAiMessage = "AI image recognition failed.";
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
    throw new Error("AI image recognition response was incomplete.");
  }

  let parsed;
  try {
    parsed = JSON.parse(outputText);
  } catch (_error) {
    throw new Error("AI image recognition format was invalid.");
  }

  return normalizeImageRecognition(parsed);
}

function buildImageRecognitionPayload({ imageDataUrl, model }) {
  return {
    model,
    input: [
      {
        role: "system",
        content: [
          {
            type: "input_text",
            text: [
              "You identify the main food shown in a meal photo and turn it into a short nutrition lookup phrase.",
              "Return one concise search-friendly description that includes an estimated count only when it is visually clear.",
              "Prefer concrete food names such as '2 half boiled eggs', 'long black coffee', 'grilled chicken rice', or 'beef steak'.",
              "Do not invent hidden ingredients or exact calories.",
              "If multiple foods are visible, return the main meal item or a short combined dish name.",
              "portion_name must exclude the quantity number. Example: description='4 half boiled eggs', portion_name='eggs'.",
              "Keep the note short and practical. The output must follow the provided JSON schema exactly."
            ].join(" ")
          }
        ]
      },
      {
        role: "user",
        content: [
          { type: "input_text", text: "Identify this meal photo and return a practical food description for nutrition lookup." },
          { type: "input_image", image_url: imageDataUrl }
        ]
      }
    ],
    text: {
      format: {
        type: "json_schema",
        name: "food_image_detection",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            detected_name: { type: "string" },
            description: { type: "string" },
            quantity: { type: "number" },
            portion_name: { type: "string" },
            confidence: { type: "string", enum: ["low", "medium", "high"] },
            note: { type: "string" }
          },
          required: ["detected_name", "description", "quantity", "portion_name", "confidence", "note"]
        }
      }
    }
  };
}

function normalizeImageRecognition(value) {
  const detectedName = typeof value.detected_name === "string" ? value.detected_name.trim() : "";
  const description = typeof value.description === "string" ? value.description.trim() : "";
  const portionName = typeof value.portion_name === "string" ? value.portion_name.trim() : "";
  const quantity = Number(value.quantity);
  const confidence = typeof value.confidence === "string" ? value.confidence.trim().toLowerCase() : "medium";
  const note = typeof value.note === "string" ? value.note.trim() : "";

  if (!description) {
    throw new Error("AI could not identify a usable food description from that image.");
  }

  return {
    detected_name: detectedName || description,
    description,
    quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
    portion_name: portionName.replace(/^\s*\d+(?:\.\d+)?\s*/u, "") || "",
    confidence: ["low", "medium", "high"].includes(confidence) ? confidence : "medium",
    note: note || "Image-based guess"
  };
}

function extractOutputText(result) {
  if (typeof result?.output_text === "string" && result.output_text.trim()) {
    return result.output_text;
  }

  if (Array.isArray(result?.output)) {
    for (const item of result.output) {
      if (!Array.isArray(item?.content)) {
        continue;
      }
      for (const part of item.content) {
        if (typeof part?.text === "string" && part.text.trim()) {
          return part.text;
        }
      }
    }
  }

  return "";
}

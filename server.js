const http = require("http");
const fs = require("fs");
const path = require("path");

loadEnvFile(path.join(__dirname, ".env"));

const PORT = Number(process.env.PORT || 8080);
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const PUBLIC_DIR = __dirname;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon"
};

const server = http.createServer(async (req, res) => {
  try {
    if (!req.url) {
      sendJson(res, 400, { error: "Invalid request" });
      return;
    }

    const requestUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);

    if (requestUrl.pathname === "/api/estimate-food" && req.method === "POST") {
      await handleEstimateFood(req, res);
      return;
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }

    await serveStatic(requestUrl.pathname, res, req.method === "HEAD");
  } catch (error) {
    console.error("Unhandled server error", error);
    sendJson(res, 500, { error: "Internal server error" });
  }
});

server.listen(PORT, () => {
  console.log(`Nutri.AI running at http://localhost:${PORT}`);
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use. Stop the other server or set PORT in .env.`);
    process.exit(1);
  }

  console.error("Server failed to start", error);
  process.exit(1);
});

async function handleEstimateFood(req, res) {
  if (!OPENAI_API_KEY) {
    sendJson(res, 500, { error: "OPENAI_API_KEY is missing. Add it to .env before using AI estimates." });
    return;
  }

  const body = await readJsonBody(req);
  const query = typeof body.query === "string" ? body.query.trim() : "";

  if (!query) {
    sendJson(res, 400, { error: "Food description is required." });
    return;
  }

  try {
    const normalized = await requestEstimateWithRetry(query);
    if (!normalized) {
      sendJson(res, 502, { error: "AI estimate was missing required nutrition values." });
      return;
    }

    sendJson(res, 200, normalized);
  } catch (error) {
    sendJson(res, 502, { error: error.message || "AI estimate request failed." });
  }
}

async function requestEstimateWithRetry(query) {
  const firstPass = await requestOpenAiEstimate(query);
  const firstIssues = validateEstimateAgainstQuery(query, firstPass);
  if (!firstIssues.length) {
    return firstPass;
  }

  const retryInstruction = [
    "The previous estimate failed a nutrition sanity check.",
    `Issues: ${firstIssues.join("; ")}.`,
    "Retry using the exact described quantity, not a generic serving.",
    "Make calories roughly consistent with the macros using 4 kcal/g for protein and carbs, and 9 kcal/g for fat.",
    "Only use zero for a macro when it is truly negligible for the described food."
  ].join(" ");

  const secondPass = await requestOpenAiEstimate(query, retryInstruction);
  const secondIssues = validateEstimateAgainstQuery(query, secondPass);
  if (secondIssues.length) {
    console.warn("Estimate retry still failed sanity checks", { query, issues: secondIssues, estimate: secondPass });
  }
  return secondPass;
}

async function requestOpenAiEstimate(query, retryInstruction = "") {
  const payload = buildEstimatePayload(query, retryInstruction);
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("OpenAI request failed", response.status, errorText);
    let openAiMessage = "AI estimate request failed.";
    try {
      const parsedError = JSON.parse(errorText);
      openAiMessage = parsedError?.error?.message || openAiMessage;
    } catch (error) {
      openAiMessage = errorText || openAiMessage;
    }
    throw new Error(openAiMessage);
  }

  const result = await response.json();
  const outputText = extractOutputText(result);

  if (!outputText) {
    console.error("OpenAI response missing output text", JSON.stringify(result));
    throw new Error("AI estimate response was incomplete.");
  }

  let parsed;
  try {
    parsed = JSON.parse(outputText);
  } catch (error) {
    console.error("Failed to parse OpenAI JSON output", outputText);
    throw new Error("AI estimate format was invalid.");
  }

  return normalizeEstimate(parsed);
}

function buildEstimatePayload(query, retryInstruction = "") {
  const systemText = [
    "You estimate calories, protein, carbs, and fat for a described food item.",
    "Estimate the exact described quantity first. If the user says 4 eggs, estimate 4 eggs, not 1 egg.",
    "Return realistic nutrition estimates for that exact described amount, not a generic serving.",
    "Use common prepared-food assumptions only when the user is vague.",
    "Return a practical portion unit for logging. Prefer g, ml, cup, piece, or oz when they fit. For count-based foods, use a clear singular unit like egg, slice, or bottle.",
    "Also return a short human-readable portion_name such as 200 g, 250 ml, 1 cup, 2 eggs, or 1 bottle.",
    "Sanity-check the macros before answering. Do not return obviously impossible zeros for major macros when the food normally contains them.",
    "Examples: eggs should include meaningful fat, oils should include fat, rice and bread should include carbs, meat and fish should include protein.",
    "If the food is mixed, estimate all four macros realistically rather than leaving one at zero unless that macro is truly negligible.",
    "Make calories roughly consistent with the macros using 4 kcal/g for protein and carbs, and 9 kcal/g for fat.",
    "Keep the note short and practical.",
    "The output must follow the provided JSON schema exactly."
  ];
  if (retryInstruction) {
    systemText.push(retryInstruction);
  }

  return {
    model: OPENAI_MODEL,
    input: [
      {
        role: "system",
        content: [
          {
            type: "input_text",
            text: systemText.join(" ")
          }
        ]
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: `Estimate calories, protein, carbs, and fat for this food: ${query}`
          }
        ]
      }
    ],
    text: {
      format: {
        type: "json_schema",
        name: "nutrition_estimate",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            food_name: { type: "string" },
            estimated_grams: { type: "number" },
            calories: { type: "number" },
            protein_g: { type: "number" },
            carb_g: { type: "number" },
            fat_g: { type: "number" },
            base_quantity: { type: "number" },
            quantity_unit: { type: "string" },
            portion_name: { type: "string" },
            confidence: { type: "string", enum: ["low", "medium", "high"] },
            note: { type: "string" }
          },
          required: ["food_name", "estimated_grams", "calories", "protein_g", "carb_g", "fat_g", "base_quantity", "quantity_unit", "portion_name", "confidence", "note"]
        }
      }
    }
  };
}

function validateEstimateAgainstQuery(query, estimate) {
  if (!estimate) {
    return ["response was empty or invalid"];
  }

  const issues = [];
  const text = String(query || "").toLowerCase();
  const caloriesFromMacros = (estimate.protein_g * 4) + (estimate.carb_g * 4) + (estimate.fat_g * 9);
  if (estimate.calories > 0) {
    const calorieDelta = Math.abs(caloriesFromMacros - estimate.calories) / estimate.calories;
    if (calorieDelta > 0.35) {
      issues.push("calories are not consistent with protein, carbs, and fat");
    }
  }

  if (/\begg|omelet|omelette\b/.test(text) && estimate.fat_g <= 1) {
    issues.push("egg-based foods should not have near-zero fat");
  }
  if (/\boil|butter|avocado|peanut butter|almond butter|mayo|mayonnaise|cheese|salmon|nuts?\b/.test(text) && estimate.fat_g <= 1) {
    issues.push("fat-rich foods should not have near-zero fat");
  }
  if (/\brice|bread|toast|pasta|noodle|oat|oatmeal|potato|coffee\b/.test(text) && estimate.carb_g <= 1 && !/\bblack coffee|americano|espresso\b/.test(text)) {
    issues.push("carb-containing foods should not have near-zero carbs");
  }
  if (/\bmeat|beef|chicken|pork|fish|tuna|salmon|egg|eggs|tofu|protein\b/.test(text) && estimate.protein_g <= 1) {
    issues.push("protein-containing foods should not have near-zero protein");
  }

  return issues;
}

function normalizeEstimate(value) {
  const foodName = typeof value.food_name === "string" ? value.food_name.trim() : "";
  const grams = Number(value.estimated_grams);
  const calories = Number(value.calories);
  const protein = Number(value.protein_g);
  const carbs = Number(value.carb_g);
  const fat = Number(value.fat_g);
  const baseQuantity = Number(value.base_quantity);
  const quantityUnit = typeof value.quantity_unit === "string" ? singularizeUnit(value.quantity_unit.trim()) : "";
  const portionName = typeof value.portion_name === "string" ? value.portion_name.trim() : "";
  const confidence = typeof value.confidence === "string" ? value.confidence : "medium";
  const note = typeof value.note === "string" ? value.note.trim() : "";

  if (!foodName || !Number.isFinite(grams) || grams <= 0 || !Number.isFinite(calories) || calories < 0 || !Number.isFinite(protein) || protein < 0 || !Number.isFinite(carbs) || carbs < 0 || !Number.isFinite(fat) || fat < 0) {
    return null;
  }

  return {
    food_name: foodName,
    estimated_grams: Math.round(grams),
    calories: Math.round(calories),
    protein_g: Math.round(protein * 10) / 10,
    carb_g: Math.round(carbs * 10) / 10,
    fat_g: Math.round(fat * 10) / 10,
    base_quantity: Number.isFinite(baseQuantity) && baseQuantity > 0 ? Math.round(baseQuantity * 10) / 10 : 0,
    quantity_unit: Number.isFinite(baseQuantity) && baseQuantity > 0 ? quantityUnit : "",
    portion_name: portionName || buildPortionName(grams, baseQuantity, quantityUnit),
    confidence: ["low", "medium", "high"].includes(confidence) ? confidence : "medium",
    note: note || "Estimated from a common serving size."
  };
}

function buildPortionName(grams, baseQuantity, quantityUnit) {
  if (Number.isFinite(baseQuantity) && baseQuantity > 0 && quantityUnit) {
    return `${Math.round(baseQuantity * 10) / 10} ${quantityUnit}`;
  }
  return `${Math.round(grams)} g`;
}

function singularizeUnit(unit) {
  if (!unit) {
    return "";
  }
  return unit.replace(/\bpieces\b/gi, "piece").replace(/\beggs\b/gi, "egg").replace(/s$/i, "");
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

async function serveStatic(requestPath, res, isHeadRequest) {
  const normalizedPath = requestPath === "/" ? "/index.html" : requestPath;
  const filePath = resolvePublicPath(normalizedPath);

  if (!filePath) {
    sendNotFound(res);
    return;
  }

  try {
    const stats = await fs.promises.stat(filePath);
    if (stats.isDirectory()) {
      sendNotFound(res);
      return;
    }

    const extension = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[extension] || "application/octet-stream",
      "Cache-Control": extension === ".html" ? "no-cache" : "public, max-age=3600"
    });

    if (isHeadRequest) {
      res.end();
      return;
    }

    fs.createReadStream(filePath).pipe(res);
  } catch (error) {
    sendNotFound(res);
  }
}

function resolvePublicPath(requestPath) {
  const decodedPath = decodeURIComponent(requestPath);
  const cleanPath = decodedPath.replace(/^\/+/, "");
  const fullPath = path.join(PUBLIC_DIR, cleanPath);
  const normalizedRoot = path.resolve(PUBLIC_DIR);
  const normalizedFull = path.resolve(fullPath);
  return normalizedFull.startsWith(normalizedRoot) ? normalizedFull : null;
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function sendNotFound(res) {
  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Not found");
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
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

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const contents = fs.readFileSync(filePath, "utf8");
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }
    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, "");
    if (key && !process.env[key]) {
      process.env[key] = value;
    }
  }
}

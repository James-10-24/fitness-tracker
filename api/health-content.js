module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  const openAiApiKey = process.env.OPENAI_API_KEY || "";
  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
  if (!openAiApiKey) {
    sendJson(res, 500, { error: "OPENAI_API_KEY is missing." });
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch (_e) {
    sendJson(res, 400, { error: "Invalid JSON body." });
    return;
  }

  const userContext = sanitiseContext(body.context || {});

  try {
    const content = await generateHealthContent({ userContext, openAiApiKey, model });
    sendJson(res, 200, content);
  } catch (err) {
    sendJson(res, 502, { error: err.message || "Content generation failed." });
  }
};

function sanitiseContext(ctx) {
  return {
    goalType: String(ctx.goalType || "maintain").slice(0, 32),
    goals: {
      cal: Number(ctx.goals?.cal) || 2000,
      protein: Number(ctx.goals?.protein) || 150,
      carb: Number(ctx.goals?.carb) || 220,
      fat: Number(ctx.goals?.fat) || 65,
      water: Number(ctx.goals?.water) || 2.5,
      steps: Number(ctx.goals?.steps) || 8000
    },
    recentAvgMacros: {
      cal: Number(ctx.recentAvgMacros?.cal) || null,
      protein: Number(ctx.recentAvgMacros?.protein) || null,
      carb: Number(ctx.recentAvgMacros?.carb) || null,
      fat: Number(ctx.recentAvgMacros?.fat) || null
    },
    recentWorkouts: (Array.isArray(ctx.recentWorkouts) ? ctx.recentWorkouts : []).slice(0, 3).map((w) => ({
      routineName: String(w.routineName || "").slice(0, 64),
      durationMinutes: Number(w.durationMinutes) || 0,
      totalVolume: Number(w.totalVolume) || 0
    })),
    healthMarkers: (Array.isArray(ctx.healthMarkers) ? ctx.healthMarkers : []).slice(0, 20).map((m) => ({
      name: String(m.name || "").slice(0, 64),
      value: Number(m.value) || 0,
      unit: String(m.unit || "").slice(0, 16),
      status: String(m.status || "normal").slice(0, 16)
    })),
    conditions: (Array.isArray(ctx.conditions) ? ctx.conditions : []).slice(0, 10).map((c) => String(c).slice(0, 64)),
    activityLevel: String(ctx.activityLevel || "moderate").slice(0, 32),
    ageYears: Number(ctx.ageYears) || null,
    sex: ["male", "female", "other", ""].includes(ctx.sex) ? ctx.sex : "",
    date: new Date().toISOString().slice(0, 10)
  };
}

async function generateHealthContent({ userContext, openAiApiKey, model }) {
  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(userContext);

  const payload = {
    model,
    input: [
      { role: "system", content: [{ type: "input_text", text: systemPrompt }] },
      { role: "user", content: [{ type: "input_text", text: userPrompt }] }
    ],
    text: {
      format: {
        type: "json_schema",
        name: "health_content",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            articles: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  id: { type: "string" },
                  title: { type: "string" },
                  category: { type: "string", enum: ["nutrition", "fitness", "recovery", "mindset", "sleep", "health"] },
                  readTimeMinutes: { type: "number" },
                  summary: { type: "string" },
                  body: { type: "string" },
                  tags: { type: "array", items: { type: "string" } },
                  relevanceReason: { type: "string" }
                },
                required: ["id", "title", "category", "readTimeMinutes", "summary", "body", "tags", "relevanceReason"]
              }
            },
            videos: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  id: { type: "string" },
                  title: { type: "string" },
                  category: { type: "string", enum: ["nutrition", "fitness", "recovery", "mindset", "sleep", "health"] },
                  channelSuggestion: { type: "string" },
                  description: { type: "string" },
                  searchQuery: { type: "string" },
                  durationEstimate: { type: "string" },
                  tags: { type: "array", items: { type: "string" } }
                },
                required: ["id", "title", "category", "channelSuggestion", "description", "searchQuery", "durationEstimate", "tags"]
              }
            }
          },
          required: ["articles", "videos"]
        }
      }
    }
  };

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${openAiApiKey}` },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const text = await response.text();
    let msg = "Health content generation failed.";
    try { msg = JSON.parse(text)?.error?.message || msg; } catch (_e) { msg = text || msg; }
    throw new Error(msg);
  }

  const result = await response.json();
  const outputText = extractOutputText(result);
  if (!outputText) throw new Error("Empty response from content generator.");

  let parsed;
  try { parsed = JSON.parse(outputText); } catch (_e) { throw new Error("Invalid JSON from content generator."); }

  return normaliseContent(parsed);
}

function buildSystemPrompt() {
  return `You are a certified health and fitness content creator for a personal wellness app called Hale.
Your job is to generate 4 deeply personalised health articles and 4 video recommendations every day for the user.

ARTICLES must:
- Be genuinely useful, evidence-based, and encouraging in tone — never alarmist or preachy
- Cover a range of categories: nutrition, fitness, recovery, mindset, sleep, health
- Be 250–400 words in the body (not longer)
- Use this light markdown in the body: ## for section headings, **bold** for key terms, - for bullet points
- Include a 1-sentence relevanceReason explaining why this specific article suits THIS user today
- readTimeMinutes should be 2–4 (based on body length)

VIDEO RECOMMENDATIONS must:
- Suggest a real type of educational fitness/health video with a specific, searchable YouTube query
- channelSuggestion should be a real well-known channel (e.g. "Jeff Nippard", "Renaissance Periodization", "Andrew Huberman Lab", "Athlean-X", "Thomas DeLauer", "Yoga With Adriene")
- durationEstimate should reflect a realistic video length for the topic (e.g. "~8 min", "~20 min")
- description should clearly describe what the user will learn from the video

TONE: Warm, motivating, science-backed. Write like a knowledgeable personal trainer who genuinely cares.
VARIETY: Ensure no two articles share the same category. Mix practical tips with deeper insights.`;
}

function buildUserPrompt(ctx) {
  const lines = [`Today is ${ctx.date}.`, `User goal: ${ctx.goalType} (${ctx.goals.cal} kcal, ${ctx.goals.protein}g protein, ${ctx.goals.carb}g carb, ${ctx.goals.fat}g fat)`];

  if (ctx.recentAvgMacros.cal) {
    lines.push(`Recent 3-day average: ${ctx.recentAvgMacros.cal} kcal, ${ctx.recentAvgMacros.protein}g protein, ${ctx.recentAvgMacros.carb}g carb, ${ctx.recentAvgMacros.fat}g fat`);
  }
  if (ctx.recentWorkouts.length) {
    lines.push(`Recent workouts: ${ctx.recentWorkouts.map((w) => `${w.routineName} (${w.durationMinutes} min)`).join(", ")}`);
  }
  if (ctx.healthMarkers.length) {
    const flagged = ctx.healthMarkers.filter((m) => m.status === "high" || m.status === "low");
    if (flagged.length) {
      lines.push(`Flagged health markers: ${flagged.map((m) => `${m.name} ${m.value} ${m.unit} (${m.status})`).join(", ")}`);
    }
  }
  if (ctx.conditions.length) {
    lines.push(`Health conditions: ${ctx.conditions.join(", ")}`);
  }
  lines.push(`Activity level: ${ctx.activityLevel}`);
  if (ctx.ageYears) lines.push(`Age: ${ctx.ageYears} years`);
  if (ctx.sex) lines.push(`Sex: ${ctx.sex}`);
  lines.push("");
  lines.push("Generate 4 personalised articles and 4 video recommendations tailored to this user's situation today.");
  return lines.join("\n");
}

function normaliseContent(raw) {
  const articles = (Array.isArray(raw.articles) ? raw.articles : []).map((a) => ({
    id: String(a.id || Math.random().toString(36).slice(2)),
    title: String(a.title || "").trim(),
    category: ["nutrition", "fitness", "recovery", "mindset", "sleep", "health"].includes(a.category) ? a.category : "health",
    readTimeMinutes: Math.max(1, Number(a.readTimeMinutes) || 3),
    summary: String(a.summary || "").trim(),
    body: String(a.body || "").trim(),
    tags: Array.isArray(a.tags) ? a.tags.map((t) => String(t)) : [],
    relevanceReason: String(a.relevanceReason || "").trim()
  }));

  const videos = (Array.isArray(raw.videos) ? raw.videos : []).map((v) => ({
    id: String(v.id || Math.random().toString(36).slice(2)),
    title: String(v.title || "").trim(),
    category: ["nutrition", "fitness", "recovery", "mindset", "sleep", "health"].includes(v.category) ? v.category : "fitness",
    channelSuggestion: String(v.channelSuggestion || "").trim(),
    description: String(v.description || "").trim(),
    searchQuery: String(v.searchQuery || "").trim(),
    durationEstimate: String(v.durationEstimate || "").trim(),
    tags: Array.isArray(v.tags) ? v.tags.map((t) => String(t)) : []
  }));

  return { articles, videos };
}

function extractOutputText(responseJson) {
  if (typeof responseJson.output_text === "string" && responseJson.output_text) return responseJson.output_text;
  const outputs = Array.isArray(responseJson.output) ? responseJson.output : [];
  for (const output of outputs) {
    for (const content of (Array.isArray(output.content) ? output.content : [])) {
      if (typeof content.text === "string" && content.text) return content.text;
    }
  }
  return "";
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return req.body ? JSON.parse(req.body) : {};
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch (e) { reject(e); } });
    req.on("error", reject);
  });
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

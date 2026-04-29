import { createServer } from "node:http";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { randomUUID, scrypt, randomBytes, timingSafeEqual } from "node:crypto";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(__dirname, "public");
const generatedDir = join(publicDir, "generated");
const dataDir = join(__dirname, "data");
const historyPath = join(dataDir, "history.json");
const jobsPath = join(dataDir, "jobs.json");
const settingsPath = join(dataDir, "settings.json");
const templateDir = join(__dirname, "references", "ecommerce-templates");
const presetPath = join(__dirname, "references", "awesome-presets.json");
const customPresetsPath = join(dataDir, "custom-presets.json");
const port = Number(process.env.PORT || 4173);

const defaultSettings = {
  apiBaseUrl: "",
  apiKey: "",
  imageModel: "gpt-image-2",
  imageRequestTimeoutMs: 600000,
  imageDownloadTimeoutMs: 90000,
  imageRequestMaxAttempts: 4,
  maxCompareCount: 4,
  lanPassword: ""
};

let settings = { ...defaultSettings };
let settingsSaveQueue = Promise.resolve();

const FETCH_MAX_RETRIES = 3;
const FETCH_RETRY_BASE_DELAY_MS = 2000;
const MAX_BODY_BYTES = 2 * 1024 * 1024;

const ratioOptions = {
  "1:1": { label: "1:1", size: "1024x1024", tone: "Square" },
  "2:3": { label: "2:3", size: "1024x1536", tone: "Portrait" },
  "3:2": { label: "3:2", size: "1536x1024", tone: "Landscape" },
  "9:16": { label: "9:16", size: "1024x1792", tone: "Story" },
  "16:9": { label: "16:9", size: "1792x1024", tone: "Wide" },
  "3:4": { label: "3:4", size: "1152x1536", tone: "Poster" },
  "4:3": { label: "4:3", size: "1536x1152", tone: "Frame" }
};

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp"
};

await mkdir(generatedDir, { recursive: true });
await mkdir(dataDir, { recursive: true });

settings = await loadSettings();

const recentCalls = [];
let history = await loadHistory();
const storedJobs = await loadJobs();
const jobs = new Map((storedJobs.length ? storedJobs : history).map((job) => [job.id, job]));
const deletedJobIds = new Set();
let historySaveQueue = Promise.resolve();
let jobsSaveQueue = Promise.resolve();
const ecommerceTemplates = await loadTemplates();
const awesomeLibrary = await loadAwesomePresets();
let customPresetsSaveQueue = Promise.resolve();
let customPresets = await loadCustomPresets();
await saveJobs();

async function loadCustomPresets() {
  try {
    const data = JSON.parse(await readFile(customPresetsPath, "utf8"));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function saveCustomPresets() {
  customPresetsSaveQueue = customPresetsSaveQueue
    .catch((err) => console.error("[save] custom presets write failed:", err?.message))
    .then(async () => {
      await writeFile(customPresetsPath, `${JSON.stringify(customPresets, null, 2)}\n`, "utf8");
    });
  return customPresetsSaveQueue;
}

/* ── Auth helpers ─────────────────────────────────── */

function hashPassword(password, salt) {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey.toString("hex"));
    });
  });
}

async function verifyPassword(password, stored) {
  if (!stored) return true;
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const derived = await hashPassword(password, salt);
  return timingSafeEqual(Buffer.from(derived, "hex"), Buffer.from(hash, "hex"));
}

function generateToken() {
  return randomBytes(32).toString("hex");
}

const authTokens = new Set();

function extractToken(req) {
  const auth = req.headers.authorization || "";
  if (auth.startsWith("Bearer ")) return auth.slice(7).trim();
  return "";
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "x-content-type-options": "nosniff"
  });
  res.end(JSON.stringify(body));
}

function pushDebugRecord(record) {
  recentCalls.unshift({ at: new Date().toISOString(), ...record });
  recentCalls.length = Math.min(recentCalls.length, 50);
}

function preview(value, limit = 240) {
  const text = String(value || "");
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
}

async function readJson(req) {
  const chunks = [];
  let totalSize = 0;
  for await (const chunk of req) {
    totalSize += chunk.length;
    if (totalSize > MAX_BODY_BYTES) {
      const error = new Error("请求体过大，超过 2MB 限制。");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  return JSON.parse(raw);
}

async function loadHistory() {
  try {
    const data = JSON.parse(await readFile(historyPath, "utf8"));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function loadJobs() {
  try {
    const data = JSON.parse(await readFile(jobsPath, "utf8"));
    if (!Array.isArray(data)) return [];
    const now = new Date().toISOString();
    return data
      .map((job) => normalizeStoredJob(job, now))
      .filter(Boolean)
      .slice(0, 200);
  } catch {
    return [];
  }
}

function normalizeStoredJob(job, now) {
  if (!job?.id) return null;
  const normalized = {
    ...job,
    images: Array.isArray(job.images) ? job.images : [],
    warnings: Array.isArray(job.warnings) ? job.warnings : [],
    error: job.error || "",
    progress: Number(job.progress || 0)
  };

  if (normalized.status === "queued" || normalized.status === "running") {
    normalized.status = "failed";
    normalized.error = normalized.error || "服务重启后该任务未继续运行，请重新提交生成。";
    normalized.updatedAt = now;
  }

  return normalized;
}

async function loadTemplates() {
  try {
    const files = (await readdir(templateDir)).filter((file) => file.endsWith(".json")).sort();
    const templates = await Promise.all(
      files.map(async (file) => {
        const template = JSON.parse(await readFile(join(templateDir, file), "utf8"));
        return { ...template, file };
      })
    );
    return templates;
  } catch {
    return [];
  }
}

async function loadAwesomePresets() {
  try {
    const data = JSON.parse(await readFile(presetPath, "utf8"));
    return {
      sources: Array.isArray(data.sources) ? data.sources : [],
      presets: Array.isArray(data.presets) ? data.presets : []
    };
  } catch {
    return { sources: [], presets: [] };
  }
}

async function loadSettings() {
  try {
    const data = JSON.parse(await readFile(settingsPath, "utf8"));
    return { ...defaultSettings, ...data };
  } catch {
    return { ...defaultSettings };
  }
}

async function saveSettings() {
  settingsSaveQueue = settingsSaveQueue.catch((err) => console.error("[save] settings write failed:", err?.message)).then(async () => {
    await writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
  });
  return settingsSaveQueue;
}

async function saveHistory() {
  historySaveQueue = historySaveQueue.catch((err) => console.error("[save] history write failed:", err?.message)).then(async () => {
    history = history.slice(0, 100);
    await writeFile(historyPath, `${JSON.stringify(history, null, 2)}\n`, "utf8");
  });
  return historySaveQueue;
}

async function saveJobs() {
  jobsSaveQueue = jobsSaveQueue.catch((err) => console.error("[save] jobs write failed:", err?.message)).then(async () => {
    const items = [...jobs.values()]
      .filter((job) => !deletedJobIds.has(job.id))
      .sort((a, b) => new Date(b.createdAt || b.updatedAt) - new Date(a.createdAt || a.updatedAt))
      .slice(0, 200)
      .map(publicJob);
    await writeFile(jobsPath, `${JSON.stringify(items, null, 2)}\n`, "utf8");
    for (const id of deletedJobIds) {
      if (!jobs.has(id)) deletedJobIds.delete(id);
    }
  });
  return jobsSaveQueue;
}

function isCurrentJob(job) {
  return Boolean(job?.id) && jobs.get(job.id) === job && !deletedJobIds.has(job.id);
}

function normalizeCount(value) {
  const count = Number(value || 1);
  if (!Number.isFinite(count)) return 1;
  return Math.max(1, Math.min(settings.maxCompareCount, Math.round(count)));
}

function resolveRatio(value) {
  const ratio = ratioOptions[value] ? value : "1:1";
  return { ratio, ...ratioOptions[ratio] };
}

function templateSummary(template) {
  if (!template) return null;
  return {
    id: template.id,
    name: template.name,
    file: template.file,
    keywords: template.keywords || [],
    trigger_phrases: template.trigger_phrases || [],
    variants: Object.entries(template.variants || {}).map(([id, value]) => ({
      id,
      description: value.description || id
    })),
    supports_image_reference: Boolean(template.supports_image_reference)
  };
}

function presetSummary(preset) {
  if (!preset) return null;
  return {
    id: preset.id,
    source: preset.source,
    title: preset.title,
    category: preset.category,
    tags: preset.tags || [],
    templateId: preset.templateId || "",
    variant: preset.variant || "",
    ratio: preset.ratio || "",
    requiresReference: Boolean(preset.requiresReference),
    prompt: preset.prompt || "",
    guardrails: preset.guardrails || [],
    example: preset.example || ""
  };
}

function findTemplate(value) {
  if (!value) return null;
  return ecommerceTemplates.find((template) => template.id === value || template.file === value) || null;
}

function findPreset(value) {
  if (!value) return null;
  return awesomeLibrary.presets.find((preset) => preset.id === value)
    || customPresets.find((preset) => preset.id === value)
    || null;
}

function matchTemplate(input) {
  const explicit = findTemplate(input.scene);
  if (explicit) return explicit;

  const haystack = [
    input.prompt,
    input.product,
    input.scene,
    input.category,
    input.styleVariant,
    input.features,
    input.brandColors
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  let best = null;
  let bestScore = -1;
  for (const template of ecommerceTemplates) {
    const terms = [...(template.keywords || []), ...(template.trigger_phrases || [])];
    const score = terms.reduce((sum, term) => {
      const normalized = String(term).toLowerCase();
      return haystack.includes(normalized) ? sum + Math.max(1, normalized.length / 4) : sum;
    }, 0);
    if (score > bestScore) {
      best = template;
      bestScore = score;
    }
  }
  return bestScore > 0 ? best : null;
}

function replaceVariables(value, variables) {
  if (typeof value !== "string") return value;
  return value.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key) => variables[key] || "");
}

function compactObject(value) {
  if (Array.isArray(value)) {
    return value.map(compactObject).filter((item) => item !== "" && item !== null && item !== undefined);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .map(([key, item]) => [key, compactObject(item)])
        .filter(([, item]) => item !== "" && item !== null && item !== undefined)
    );
  }
  return value;
}

function applyVariables(value, variables) {
  if (Array.isArray(value)) return value.map((item) => applyVariables(item, variables));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, applyVariables(item, variables)]));
  }
  return replaceVariables(value, variables);
}

function inferCategory(text) {
  const normalized = String(text || "").toLowerCase();
  const groups = [
    ["beauty", ["beauty", "skincare", "serum", "cream", "makeup", "护肤", "精华", "面霜", "美妆", "口红"]],
    ["electronics", ["electronics", "phone", "headphone", "camera", "device", "电子", "手机", "耳机", "相机"]],
    ["food", ["food", "coffee", "tea", "snack", "drink", "食品", "咖啡", "茶", "饮料", "零食"]],
    ["fashion", ["fashion", "shirt", "dress", "shoe", "bag", "服装", "衣服", "鞋", "包"]],
    ["home", ["home", "furniture", "lamp", "chair", "家居", "家具", "灯", "椅"]],
    ["jewelry", ["jewelry", "ring", "necklace", "watch", "珠宝", "戒指", "项链", "手表"]],
    ["sports", ["sports", "fitness", "running", "gym", "运动", "健身", "跑步"]]
  ];
  return groups.find(([, terms]) => terms.some((term) => normalized.includes(term)))?.[0] || "";
}

function buildPrompt(payload, ratioSpec) {
  const preset = findPreset(payload.presetId);
  const submittedScene = String(payload.scene || "").trim();
  const submittedSceneTemplate = findTemplate(submittedScene);
  const effectivePayload = {
    ...payload,
    scene: submittedSceneTemplate ? submittedScene : preset?.templateId || submittedScene || "",
    styleVariant: submittedSceneTemplate ? payload.styleVariant || preset?.variant || "" : preset?.variant || payload.styleVariant || "",
    ratio: payload.ratio || preset?.ratio || ""
  };
  const template = submittedSceneTemplate || matchTemplate(effectivePayload);
  const product = String(effectivePayload.product || effectivePayload.prompt || "the product").trim();
  const category = String(
    effectivePayload.category ||
      (preset?.category === "电商" ? inferCategory(`${effectivePayload.prompt} ${effectivePayload.product}`) : "") ||
      inferCategory(`${effectivePayload.prompt} ${effectivePayload.product}`)
  ).trim();
  const features = String(effectivePayload.features || "").trim();
  const brandColors = String(effectivePayload.brandColors || "").trim();
  const variant = template?.variants?.[effectivePayload.styleVariant] ? effectivePayload.styleVariant : "";
  const variables = {
    user_prompt: effectivePayload.prompt || "",
    ratio: ratioSpec.label,
    size: ratioSpec.size,
    product,
    product_description: product,
    product_set_description: product,
    business: product,
    business_description: product,
    category,
    feature_list: features || "key selling points, material quality, usage benefit, brand trust",
    features: features || "key selling points",
    brand_colors: brandColors || "brand-consistent colors",
    color: brandColors || "brand accent color",
    colors: brandColors || "brand accent colors",
    color_scheme: brandColors || "brand-consistent palette",
    material_description: effectivePayload.material || "realistic product materials and texture",
    background: effectivePayload.background || "clean commercial background",
    background_description: effectivePayload.background || "clean commercial background",
    scene: effectivePayload.sceneDescription || "commercial e-commerce scene",
    scene_description: effectivePayload.sceneDescription || "commercial e-commerce scene",
    mood_description: effectivePayload.mood || "premium commercial mood",
    composition_style: effectivePayload.composition || "balanced product-first composition",
    prop_list: effectivePayload.props || "minimal relevant props",
    props: effectivePayload.props || "minimal relevant props",
    headline: effectivePayload.headline || "",
    headline_text: effectivePayload.headline || "",
    subtitle: effectivePayload.subtitle || "",
    subtitle_text: effectivePayload.subtitle || "",
    cta: effectivePayload.cta || "",
    cta_text: effectivePayload.cta || "",
    price: effectivePayload.price || "",
    price_info: effectivePayload.price || "",
    f1: features.split(/[,，\n]/)[0]?.trim() || "feature 1",
    f2: features.split(/[,，\n]/)[1]?.trim() || "feature 2",
    f3: features.split(/[,，\n]/)[2]?.trim() || "feature 3",
    f4: features.split(/[,，\n]/)[3]?.trim() || "feature 4",
    n: "4",
    data_elements: effectivePayload.dataElements || "simple benefit callouts",
    person: effectivePayload.person || "natural model",
    person_description: effectivePayload.person || "natural model",
    focus_area: effectivePayload.focusArea || "product details",
    texture_description: effectivePayload.material || "visible material texture",
    time_of_day: effectivePayload.timeOfDay || "daytime",
    camera_setup: effectivePayload.camera || "commercial camera setup"
  };

  let promptObject = structuredClone(template?.prompt_template || { type: "product photography", subject: "{product_description}" });
  if (variant) {
    promptObject = { ...promptObject, ...(template.variants[variant].overrides || {}) };
  }
  promptObject = applyVariables(promptObject, variables);
  if (category && template?.category_tips?.[category]) {
    promptObject.category_note = template.category_tips[category];
  }
  if (template?.anti_ai_tips) {
    promptObject.authenticity_rules = template.anti_ai_tips;
  }
  const strategyContext = compactObject({
    strategy: payload.strategyKind || preset?.category || "",
    type: payload.strategyType || (!submittedSceneTemplate ? submittedScene : ""),
    tone: payload.strategyTone || (!submittedSceneTemplate ? payload.styleVariant : ""),
    usage: payload.strategyUse || "",
    color_tone: brandColors,
    requirements: features
  });
  if (Object.keys(strategyContext).length) {
    promptObject.strategy_context = strategyContext;
  }
  promptObject.aspect_ratio = ratioSpec.label;
  promptObject.output_size = ratioSpec.size;
  promptObject.user_request = effectivePayload.prompt;
  promptObject.reference_policy = effectivePayload.referenceImage?.dataUrl
    ? "Use the uploaded reference image to preserve product identity, shape, colors, logos, and material cues."
    : "No reference image provided; generate from description.";
  if (preset) {
    promptObject.awesome_prompt_protocol = {
      title: preset.title,
      category: preset.category,
      source: preset.source,
      reference_required: Boolean(preset.requiresReference),
      instruction: replaceVariables(preset.prompt, variables),
      guardrails: preset.guardrails || []
    };
  }

  const compactPrompt = compactObject(promptObject);
  return {
    text: JSON.stringify(compactPrompt, null, 2),
    template: templateSummary(template),
    preset: presetSummary(preset),
    variant,
    category,
    promptObject: compactPrompt
  };
}

function looksLikeBase64Image(value) {
  return typeof value === "string" && value.length > 400 && /^[A-Za-z0-9+/=\s]+$/.test(value.slice(0, 500));
}

function imageFromOpenAI(data) {
  const seen = new Set();

  function visit(value, depth = 0) {
    if (!value || depth > 8) return null;
    if (typeof value === "string") {
      if (value.startsWith("data:image/")) return value;
      if (/^https?:\/\//.test(value)) return value;
      return null;
    }
    if (typeof value !== "object" || seen.has(value)) return null;
    seen.add(value);

    for (const key of ["b64_json", "base64", "image_base64"]) {
      if (looksLikeBase64Image(value[key])) return `data:image/png;base64,${value[key].replace(/\s/g, "")}`;
    }

    for (const key of ["url", "image_url", "image", "asset", "output_image"]) {
      const found = visit(value[key], depth + 1);
      if (found) return found;
    }

    for (const key of ["data", "images", "result", "results", "output", "content"]) {
      const found = visit(value[key], depth + 1);
      if (found) return found;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        const found = visit(item, depth + 1);
        if (found) return found;
      }
    }

    return null;
  }

  return visit(data);
}

function dataUrlParts(dataUrl, fallbackType = "image/png") {
  const match = String(dataUrl || "").match(/^data:([^;,]+)?(;base64)?,(.*)$/);
  if (!match) throw new Error("Invalid image data.");
  const mimeType = match[1] || fallbackType;
  const isBase64 = Boolean(match[2]);
  const buffer = isBase64 ? Buffer.from(match[3], "base64") : Buffer.from(decodeURIComponent(match[3]));
  return { buffer, mimeType };
}

function extensionForMime(mimeType) {
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpg";
  if (mimeType.includes("webp")) return "webp";
  return "png";
}

function dataUrlToBlob(dataUrl, fallbackType = "image/png") {
  const { buffer, mimeType } = dataUrlParts(dataUrl, fallbackType);
  return new Blob([buffer], { type: mimeType });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url, options, timeoutMs) {
  let lastError;
  for (let attempt = 1; attempt <= FETCH_MAX_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timer);
      return response;
    } catch (error) {
      clearTimeout(timer);
      lastError = error;
      const isRetryable =
        attempt < FETCH_MAX_RETRIES &&
        (error.name === "AbortError" ||
          /ECONNRESET|ETIMEDOUT|ECONNREFUSED|fetch failed|other side closed|socket|terminated/i.test(
            `${error.message || ""} ${error.cause?.message || ""} ${error.cause?.code || ""}`
          ));
      if (isRetryable) {
        await wait(FETCH_RETRY_BASE_DELAY_MS * attempt);
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

async function saveImageAsset(image, jobId, index) {
  if (!image) throw new Error("Image result is empty.");

  if (image.startsWith("data:")) {
    const { buffer, mimeType } = dataUrlParts(image);
    const ext = extensionForMime(mimeType);
    const filename = `${jobId}-${index}.${ext}`;
    await writeFile(join(generatedDir, filename), buffer);
    return { src: `/generated/${filename}`, mimeType };
  }

  let lastError = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await fetchWithTimeout(image, {}, settings.imageDownloadTimeoutMs);
      if (!response.ok) {
        return { src: image, mimeType: "remote/url", warning: `Remote image returned ${response.status}.` };
      }

      const mimeType = response.headers.get("content-type") || "image/png";
      const ext = extensionForMime(mimeType);
      const filename = `${jobId}-${index}.${ext}`;
      const buffer = Buffer.from(await response.arrayBuffer());
      await writeFile(join(generatedDir, filename), buffer);
      return { src: `/generated/${filename}`, mimeType };
    } catch (error) {
      lastError = error;
      if (attempt < 2) await wait(900);
    }
  }

  return {
    src: image,
    mimeType: "remote/url",
    warning: `Remote image could not be saved locally: ${lastError?.message || "download failed"}.`
  };
}

function isResponseFormatError(error) {
  return (
    [400, 415, 422].includes(error.status) &&
    /response[_ -]?format|b64|base64/i.test(`${error.message || ""} ${error.bodyPreview || ""}`)
  );
}

function isRetryableImageError(error) {
  return (
    error.retryable ||
    /fetch failed|other side closed|terminated|socket|network|ECONNRESET|ETIMEDOUT|timeout|aborted/i.test(
      `${error.message || ""} ${error.cause?.message || ""} ${error.cause?.code || ""}`
    )
  );
}

function errorChain(error) {
  const parts = [];
  const seen = new Set();
  let current = error;
  while (current && !seen.has(current) && parts.length < 5) {
    seen.add(current);
    const label = [current.name, current.code, current.message].filter(Boolean).join(": ");
    if (label) parts.push(label);
    current = current.cause;
  }
  return parts.join(" > ");
}

function isSocketClosedError(error) {
  return /UND_ERR_SOCKET|other side closed|socket closed|terminated/i.test(errorChain(error));
}

function compactPromptForImage(prompt) {
  try {
    const data = JSON.parse(prompt);
    const protocol = data.awesome_prompt_protocol || {};
    const strategy = data.strategy_context || {};
    const lines = [
      data.user_request ? `User request: ${data.user_request}` : "",
      protocol.title ? `Preset: ${protocol.title}` : "",
      protocol.instruction ? `Instruction: ${protocol.instruction}` : "",
      strategy.type ? `Type: ${strategy.type}` : "",
      strategy.tone ? `Tone: ${strategy.tone}` : "",
      strategy.usage ? `Usage: ${strategy.usage}` : "",
      strategy.color_tone ? `Color tone: ${strategy.color_tone}` : "",
      strategy.requirements ? `Requirements: ${strategy.requirements}` : "",
      data.reference_policy || "",
      Array.isArray(protocol.guardrails) && protocol.guardrails.length
        ? `Guardrails: ${protocol.guardrails.join("; ")}`
        : "",
      data.aspect_ratio ? `Aspect ratio: ${data.aspect_ratio}` : ""
    ].filter(Boolean);
    return lines.join("\n").slice(0, 5000) || prompt;
  } catch {
    return String(prompt || "").slice(0, 5000);
  }
}

function fallbackSizeFor(size, level = 1) {
  const [width, height] = String(size || "").split("x").map(Number);
  if (!width || !height || level >= 2) return "1024x1024";
  if (height > width) return "1024x1536";
  if (width > height) return "1536x1024";
  return "1024x1024";
}

function imageAttemptPlans({ prompt, size, referenceImage }) {
  const hasReference = Boolean(referenceImage?.dataUrl);
  const compactPrompt = compactPromptForImage(prompt);
  const conservativeSize = fallbackSizeFor(size, 1);
  const squareSize = fallbackSizeFor(size, 2);

  if (hasReference) {
    return [
      { label: "reference-url-original", preferBase64: false, prompt: compactPrompt, size },
      { label: "reference-url-conservative", preferBase64: false, prompt: compactPrompt, size: conservativeSize },
      { label: "reference-url-square", preferBase64: false, prompt: compactPrompt, size: squareSize },
      { label: "reference-b64-square", preferBase64: true, prompt: compactPrompt, size: squareSize }
    ].slice(0, settings.imageRequestMaxAttempts);
  }

  return [
    { label: "text-b64-original", preferBase64: true, prompt, size },
    { label: "text-url-original", preferBase64: false, prompt, size },
    { label: "text-url-conservative", preferBase64: false, prompt: compactPrompt, size: conservativeSize },
    { label: "text-url-square", preferBase64: false, prompt: compactPrompt, size: squareSize }
  ].slice(0, settings.imageRequestMaxAttempts);
}

async function postImageRequest({ endpoint, prompt, size, referenceImage, preferBase64 }) {
  const hasReference = Boolean(referenceImage?.dataUrl);
  let headers = { authorization: `Bearer ${settings.apiKey}` };
  let body;

  if (hasReference) {
    body = new FormData();
    body.append("model", settings.imageModel);
    body.append("prompt", prompt);
    body.append("size", size);
    body.append("n", "1");
    if (preferBase64) body.append("response_format", "b64_json");
    body.append(
      "image",
      dataUrlToBlob(referenceImage.dataUrl, referenceImage.type),
      referenceImage.name || "reference.png"
    );
  } else {
    headers = { ...headers, "content-type": "application/json" };
    body = JSON.stringify({
      model: settings.imageModel,
      prompt,
      size,
      n: 1,
      ...(preferBase64 ? { response_format: "b64_json" } : {})
    });
  }

  let response;
  try {
    response = await fetchWithTimeout(
      `${settings.apiBaseUrl}/${endpoint}`,
      {
        method: "POST",
        headers,
        body
      },
      settings.imageRequestTimeoutMs
    );
  } catch (error) {
    const timeoutSeconds = Math.round(settings.imageRequestTimeoutMs / 1000);
    const cause = errorChain(error);
    const message =
      error.name === "AbortError"
        ? `上游图片接口超过 ${timeoutSeconds} 秒没有返回，已中止本次尝试。`
        : `图片接口连接失败：${cause || error.message || "上游关闭连接"}.`;
    const wrapped = new Error(message);
    wrapped.cause = error;
    wrapped.retryable = true;
    throw wrapped;
  }

  const raw = await response.text();
  let data = {};
  try {
    data = JSON.parse(raw || "{}");
  } catch {
    const error = new Error(`Image request returned non-JSON response: ${response.status}`);
    error.status = response.status;
    error.bodyPreview = preview(raw, 800);
    error.retryable = response.status >= 500;
    throw error;
  }
  if (!response.ok) {
    const error = new Error(data?.error?.message || `Image request failed: ${response.status}`);
    error.status = response.status;
    error.bodyPreview = preview(raw, 800);
    error.retryable = response.status === 408 || response.status === 409 || response.status === 429 || response.status >= 500;
    throw error;
  }

  const image = imageFromOpenAI(data);
  if (!image) {
    const error = new Error("Image request succeeded, but no image field was found in the response.");
    error.bodyPreview = preview(raw, 1000);
    throw error;
  }

  return {
    image,
    mode: hasReference ? "reference" : "text",
    responseKeys: Object.keys(data || {}).slice(0, 8)
  };
}

async function requestImage({ prompt, size, referenceImage, onAttempt }) {
  const endpoint = referenceImage?.dataUrl ? "images/edits" : "images/generations";
  const plans = imageAttemptPlans({ prompt, size, referenceImage });
  const attempts = [];

  for (let index = 0; index < plans.length; index += 1) {
    const attempt = index + 1;
    const plan = plans[index];
    const attemptStartedAt = Date.now();
    try {
      await onAttempt?.({
        type: "start",
        attempt,
        maxAttempts: plans.length,
        plan
      });
      const result = await postImageRequest({
        endpoint,
        prompt: plan.prompt,
        size: plan.size,
        referenceImage,
        preferBase64: plan.preferBase64
      });
      return { ...result, attempts, requestPlan: plan };
    } catch (error) {
      const record = {
        attempt,
        label: plan.label,
        preferBase64: plan.preferBase64,
        size: plan.size,
        status: error.status || "",
        message: error.message || "image request failed",
        bodyPreview: error.bodyPreview || "",
        cause: errorChain(error),
        durationMs: Date.now() - attemptStartedAt
      };
      attempts.push(record);
      await onAttempt?.({
        type: "error",
        attempt,
        maxAttempts: plans.length,
        plan,
        record,
        attempts
      });

      if (
        index < plans.length - 1 &&
        (isRetryableImageError(error) || isResponseFormatError(error) || isSocketClosedError(error))
      ) {
        await wait(900 * attempt);
        continue;
      }

      error.attempts = attempts;
      throw error;
    }
  }

  const error = new Error("Image generation failed after retries.");
  error.attempts = attempts;
  throw error;
}

function publicJob(job) {
  return {
    id: job.id,
    status: job.status,
    prompt: job.prompt,
    finalPrompt: job.finalPrompt,
    promptObject: job.promptObject,
    template: job.template,
    preset: job.preset,
    variant: job.variant,
    category: job.category,
    ratio: job.ratio,
    size: job.size,
    count: job.count,
    mode: job.mode,
    progress: job.progress,
    images: job.images,
    error: job.error,
    warnings: job.warnings,
    statusNote: job.statusNote,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    completedAt: job.completedAt
  };
}

async function runJob(job, payload) {
  if (!isCurrentJob(job)) return;
  job.status = "running";
  job.statusNote = "后台已开始生成。";
  job.updatedAt = new Date().toISOString();
  await saveJobs();
  const startedAt = Date.now();

  try {
    for (let index = 0; index < job.count; index += 1) {
      if (!isCurrentJob(job)) return;
      const result = await requestImage({
        prompt: job.finalPrompt,
        size: job.size,
        referenceImage: payload.referenceImage,
        onAttempt: async (event) => {
          if (!isCurrentJob(job)) return;
          const total = event.maxAttempts;
          if (event.type === "start") {
            job.statusNote = `正在请求上游图片接口，第 ${event.attempt}/${total} 次（${event.plan?.label || "default"}）。`;
          } else if (event.type === "error" && event.attempt < total) {
            job.statusNote = `第 ${event.attempt}/${total} 次请求失败，准备降级重试：${event.record.message}`;
          } else if (event.type === "error") {
            job.statusNote = `第 ${event.attempt}/${total} 次请求失败：${event.record.message}`;
          }
          job.updatedAt = new Date().toISOString();
          await saveJobs();
        }
      });
      if (!isCurrentJob(job)) return;
      const asset = await saveImageAsset(result.image, job.id, index + 1);
      if (!isCurrentJob(job)) return;
      job.mode = result.mode;
      if (asset.warning) job.warnings.push(asset.warning);
      if (result.attempts?.length) job.warnings.push(`Image request retries: ${result.attempts.length}.`);
      if (result.requestPlan?.size && result.requestPlan.size !== job.size) {
        job.warnings.push(`Image request fallback size: ${result.requestPlan.size}.`);
      }
      if (result.requestPlan?.label) {
        job.warnings.push(`Image request plan: ${result.requestPlan.label}.`);
      }
      job.images.push({
        id: `${job.id}-${index + 1}`,
        src: asset.src,
        mimeType: asset.mimeType,
        index: index + 1
      });
      job.progress = Math.round((job.images.length / job.count) * 100);
      job.updatedAt = new Date().toISOString();
      await saveJobs();
    }

    if (!isCurrentJob(job)) return;
    job.status = "completed";
    job.statusNote = "生成完成。";
    job.completedAt = new Date().toISOString();
    job.updatedAt = job.completedAt;
    history.unshift(publicJob(job));
    await saveJobs();
    await saveHistory();
    pushDebugRecord({
      route: "/api/generate",
      ok: true,
      jobId: job.id,
      model: settings.imageModel,
      baseUrl: settings.apiBaseUrl,
      durationMs: Date.now() - startedAt,
      count: job.count,
      ratio: job.ratio,
      mode: job.mode,
      template: job.template?.id,
      preset: job.preset?.id,
      variant: job.variant,
      category: job.category,
      warnings: job.warnings,
      promptPreview: preview(job.finalPrompt)
    });
  } catch (error) {
    if (!isCurrentJob(job)) return;
    job.status = "failed";
    job.error = error.message || "Image generation failed.";
    job.statusNote = job.error;
    job.updatedAt = new Date().toISOString();
    history.unshift(publicJob(job));
    await saveJobs();
    await saveHistory();
    pushDebugRecord({
      route: "/api/generate",
      ok: false,
      jobId: job.id,
      model: settings.imageModel,
      baseUrl: settings.apiBaseUrl,
      durationMs: Date.now() - startedAt,
      error: job.error,
      cause: error.cause?.message || error.cause?.code || "",
      attempts: error.attempts || [],
      template: job.template?.id,
      preset: job.preset?.id,
      variant: job.variant,
      category: job.category,
      promptPreview: preview(job.finalPrompt)
    });
  }
}

async function enqueueJob(payload) {
  const prompt = String(payload.prompt || "").trim();
  if (!prompt) throw new Error("Missing prompt.");
  const count = normalizeCount(payload.count);
  const ratioSpec = resolveRatio(payload.ratio);
  const assembled = buildPrompt(payload, ratioSpec);
  const id = randomUUID();
  const now = new Date().toISOString();
  const job = {
    id,
    status: "queued",
    prompt,
    finalPrompt: assembled.text,
    promptObject: assembled.promptObject,
    template: assembled.template,
    preset: assembled.preset,
    variant: assembled.variant,
    category: assembled.category,
    ratio: ratioSpec.ratio,
    size: ratioSpec.size,
    count,
    mode: payload.referenceImage?.dataUrl ? "reference" : "text",
    progress: 0,
    images: [],
    error: "",
    statusNote: "等待后台开始。",
    warnings: [],
    createdAt: now,
    updatedAt: now,
    completedAt: ""
  };
  jobs.set(id, job);
  await saveJobs();
  setTimeout(() => {
    runJob(job, payload).catch((error) => {
      if (!isCurrentJob(job)) return;
      job.status = "failed";
      job.error = error.message || "Image generation failed.";
      job.statusNote = job.error;
      job.updatedAt = new Date().toISOString();
      saveJobs().catch((err) => console.error("[save] jobs fallback write failed:", err?.message));
    });
  }, 0);
  return job;
}

async function handleApi(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  try {
    /* ── Auth routes (no auth required) ──────────── */

    if (pathname === "/api/auth/login" && req.method === "POST") {
      const body = await readJson(req);
      const password = String(body.password || "");
      const stored = settings.lanPassword || "";
      if (!stored) {
        const token = generateToken();
        authTokens.add(token);
        sendJson(res, 200, { token, authRequired: false });
        return;
      }
      const valid = await verifyPassword(password, stored);
      if (!valid) {
        sendJson(res, 401, { error: "密码错误。" });
        return;
      }
      const token = generateToken();
      authTokens.add(token);
      sendJson(res, 200, { token, authRequired: true });
      return;
    }

    if (pathname === "/api/auth/check" && req.method === "GET") {
      sendJson(res, 200, { authRequired: Boolean(settings.lanPassword) });
      return;
    }

    /* ── Auth check for all other /api/* routes ──── */

    if (settings.lanPassword) {
      const token = extractToken(req);
      if (!token || !authTokens.has(token)) {
        sendJson(res, 401, { error: "请先登录。" });
        return;
      }
    }

    if (pathname === "/api/debug/recent" && req.method === "GET") {
      sendJson(res, 200, { calls: recentCalls });
      return;
    }

    if (pathname === "/api/status" && req.method === "GET") {
      sendJson(res, 200, {
        model: settings.imageModel,
        maxCompareCount: settings.maxCompareCount,
        imageRequestMaxAttempts: settings.imageRequestMaxAttempts,
        imageRequestTimeoutSeconds: Math.round(settings.imageRequestTimeoutMs / 1000),
        fetchMaxRetries: FETCH_MAX_RETRIES,
        ratios: ratioOptions,
        templateCount: ecommerceTemplates.length,
        presetCount: awesomeLibrary.presets.length,
        jobCount: jobs.size,
        historyCount: history.length
      });
      return;
    }

    if (pathname === "/api/templates" && req.method === "GET") {
      sendJson(res, 200, { templates: ecommerceTemplates.map(templateSummary) });
      return;
    }

    if (pathname === "/api/presets" && req.method === "GET") {
      const allPresets = [...awesomeLibrary.presets, ...customPresets.map((p) => ({ ...p, source: "custom" }))];
      const categories = [...new Set(allPresets.map((preset) => preset.category).filter(Boolean))];
      sendJson(res, 200, {
        sources: awesomeLibrary.sources,
        categories,
        presets: allPresets.map(presetSummary)
      });
      return;
    }

    /* ── Custom presets CRUD ─────────────────────── */

    if (pathname === "/api/presets/custom" && req.method === "GET") {
      sendJson(res, 200, { presets: customPresets });
      return;
    }

    if (pathname === "/api/presets/custom" && req.method === "POST") {
      const body = await readJson(req);
      const title = String(body.title || "").trim();
      if (!title) {
        sendJson(res, 400, { error: "预设标题不能为空。" });
        return;
      }
      const preset = {
        id: `custom-${randomUUID()}`,
        title,
        category: String(body.category || "自定义"),
        tags: Array.isArray(body.tags) ? body.tags.map(String) : [],
        prompt: String(body.prompt || ""),
        example: String(body.example || ""),
        templateId: String(body.templateId || ""),
        variant: String(body.variant || ""),
        ratio: String(body.ratio || ""),
        requiresReference: Boolean(body.requiresReference),
        guardrails: Array.isArray(body.guardrails) ? body.guardrails.map(String) : [],
        createdAt: new Date().toISOString()
      };
      customPresets.push(preset);
      await saveCustomPresets();
      sendJson(res, 201, { preset });
      return;
    }

    const customPresetMatch = pathname.match(/^\/api\/presets\/custom\/([^/]+)$/);
    if (customPresetMatch && req.method === "PUT") {
      const id = decodeURIComponent(customPresetMatch[1]);
      const index = customPresets.findIndex((p) => p.id === id);
      if (index === -1) {
        sendJson(res, 404, { error: "自定义预设未找到。" });
        return;
      }
      const body = await readJson(req);
      const existing = customPresets[index];
      customPresets[index] = {
        ...existing,
        title: String(body.title ?? existing.title).trim(),
        category: String(body.category ?? existing.category),
        tags: Array.isArray(body.tags) ? body.tags.map(String) : existing.tags,
        prompt: String(body.prompt ?? existing.prompt),
        example: String(body.example ?? existing.example),
        templateId: String(body.templateId ?? existing.templateId),
        variant: String(body.variant ?? existing.variant),
        ratio: String(body.ratio ?? existing.ratio),
        requiresReference: body.requiresReference !== undefined ? Boolean(body.requiresReference) : existing.requiresReference,
        guardrails: Array.isArray(body.guardrails) ? body.guardrails.map(String) : existing.guardrails,
        updatedAt: new Date().toISOString()
      };
      await saveCustomPresets();
      sendJson(res, 200, { preset: customPresets[index] });
      return;
    }

    if (customPresetMatch && req.method === "DELETE") {
      const id = decodeURIComponent(customPresetMatch[1]);
      const index = customPresets.findIndex((p) => p.id === id);
      if (index === -1) {
        sendJson(res, 404, { error: "自定义预设未找到。" });
        return;
      }
      customPresets.splice(index, 1);
      await saveCustomPresets();
      sendJson(res, 200, { ok: true, id });
      return;
    }

    if (pathname === "/api/jobs" && req.method === "GET") {
      const status = url.searchParams.get("status");
      const items = [...jobs.values()]
        .filter((job) => !status || job.status === status)
        .sort((a, b) => new Date(b.createdAt || b.updatedAt) - new Date(a.createdAt || a.updatedAt))
        .map(publicJob);
      sendJson(res, 200, { jobs: items });
      return;
    }

    if (pathname === "/api/history" && req.method === "GET") {
      sendJson(res, 200, { history });
      return;
    }

    if (pathname === "/api/history" && req.method === "DELETE") {
      history = [];
      await saveHistory();
      sendJson(res, 200, { ok: true });
      return;
    }

    const historyMatch = pathname.match(/^\/api\/history\/([^/]+)$/);
    if (historyMatch && req.method === "DELETE") {
      const id = decodeURIComponent(historyMatch[1]);
      const previousLength = history.length;
      history = history.filter((item) => item.id !== id);
      if (history.length === previousLength) {
        sendJson(res, 404, { error: "History item not found." });
        return;
      }
      await saveHistory();
      sendJson(res, 200, { ok: true, id });
      return;
    }

    if (pathname === "/api/generate" && req.method === "POST") {
      const body = await readJson(req);
      const job = await enqueueJob(body);
      sendJson(res, 202, { job: publicJob(job) });
      return;
    }

    const jobMatch = pathname.match(/^\/api\/jobs\/([^/]+)$/);
    if (jobMatch && req.method === "GET") {
      const job = jobs.get(jobMatch[1]) || history.find((item) => item.id === jobMatch[1]);
      if (!job) {
        sendJson(res, 404, { error: "Job not found." });
        return;
      }
      sendJson(res, 200, { job: publicJob(job) });
      return;
    }

    if (jobMatch && req.method === "DELETE") {
      const id = decodeURIComponent(jobMatch[1]);
      const job = jobs.get(id);
      if (!job) {
        sendJson(res, 404, { error: "Job not found." });
        return;
      }
      deletedJobIds.add(id);
      jobs.delete(id);
      await saveJobs();
      pushDebugRecord({
        route: "/api/jobs/:id",
        ok: true,
        action: "delete",
        jobId: id,
        status: job.status
      });
      sendJson(res, 200, { ok: true, id });
      return;
    }

    if (pathname === "/api/settings" && req.method === "GET") {
      const safeSettings = { ...settings, lanPassword: settings.lanPassword ? "********" : "" };
      sendJson(res, 200, { settings: safeSettings });
      return;
    }

    if (pathname === "/api/settings" && req.method === "PUT") {
      const body = await readJson(req);
      const allowed = [
        "apiBaseUrl", "apiKey", "imageModel", "imageRequestTimeoutMs",
        "imageDownloadTimeoutMs", "imageRequestMaxAttempts", "maxCompareCount"
      ];
      for (const key of allowed) {
        if (body[key] !== undefined) {
          if (key === "apiBaseUrl" || key === "imageModel" || key === "apiKey") {
            settings[key] = String(body[key]).trim();
          } else {
            settings[key] = Number(body[key]);
          }
        }
      }
      settings.imageRequestTimeoutMs = Math.max(30000, Math.min(1800000, settings.imageRequestTimeoutMs));
      settings.imageDownloadTimeoutMs = Math.max(10000, Math.min(600000, settings.imageDownloadTimeoutMs));
      settings.imageRequestMaxAttempts = Math.max(1, Math.min(8, Math.round(settings.imageRequestMaxAttempts)));
      settings.maxCompareCount = Math.max(1, Math.min(4, Math.round(settings.maxCompareCount)));
      if (body.lanPassword !== undefined) {
        const pw = String(body.lanPassword).trim();
        if (pw === "") {
          settings.lanPassword = "";
        } else {
          const salt = randomBytes(16).toString("hex");
          const hash = await hashPassword(pw, salt);
          settings.lanPassword = `${salt}:${hash}`;
        }
      }
      await saveSettings();
      sendJson(res, 200, { settings });
      return;
    }

    sendJson(res, 404, { error: "Unknown API route." });
  } catch (error) {
    const status = error.statusCode || 500;
    sendJson(res, status, { error: error.message || "Unexpected server error." });
  }
}

async function serveStatic(req, res) {
  const requestPath = new URL(req.url, `http://${req.headers.host}`).pathname;
  const safePath = normalize(requestPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(publicDir, safePath === "/" ? "index.html" : safePath);

  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403, { "x-content-type-options": "nosniff" });
    res.end("Forbidden");
    return;
  }

  try {
    const content = await readFile(filePath);
    res.writeHead(200, {
      "content-type": mimeTypes[extname(filePath)] || "application/octet-stream",
      "x-content-type-options": "nosniff",
      "x-frame-options": "SAMEORIGIN"
    });
    res.end(content);
  } catch (error) {
    if (error.code === "ENOENT") {
      const content = await readFile(join(publicDir, "index.html"));
      res.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "x-content-type-options": "nosniff",
        "x-frame-options": "SAMEORIGIN"
      });
      res.end(content);
    } else {
      console.error("[static] file read error:", error.message);
      res.writeHead(500, { "x-content-type-options": "nosniff" });
      res.end("Internal Server Error");
    }
  }
}

const server = createServer((req, res) => {
  if (req.url?.startsWith("/api/")) {
    handleApi(req, res);
    return;
  }
  serveStatic(req, res);
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Local Image Studio running at http://localhost:${port}`);
  console.log("Open it from your phone with http://<your-computer-lan-ip>:" + port);
});

function gracefulShutdown(signal) {
  console.log(`\n[shutdown] Received ${signal}, shutting down gracefully...`);
  const runningJobs = [...jobs.values()].filter((j) => j.status === "running" || j.status === "queued");
  if (runningJobs.length) {
    console.log(`[shutdown] Waiting for ${runningJobs.length} active job(s) to finish (max 30s)...`);
  }
  const deadline = Date.now() + 30000;
  const check = setInterval(() => {
    const remaining = [...jobs.values()].filter((j) => j.status === "running" || j.status === "queued");
    if (!remaining.length || Date.now() > deadline) {
      clearInterval(check);
      if (remaining.length) {
        console.log(`[shutdown] ${remaining.length} job(s) still running, forcing exit.`);
      } else {
        console.log("[shutdown] All jobs completed.");
      }
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 3000);
    }
  }, 1000);
}

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

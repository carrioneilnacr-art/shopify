const WINDOW_MS = 60000;
const MAX_REQUESTS = 6;
const requests = new Map();
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "https://x4gt-9cbk4m-mp.myshopify.com").split(",").map((v) => v.trim()).filter(Boolean);
function send(res, status, payload) {
  res.status(status).setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}
function extractText(response) {
  const output = Array.isArray(response.output) ? response.output : [];
  return output.filter((item) => item.type === "message")
    .flatMap((item) => Array.isArray(item.content) ? item.content : [])
    .filter((item) => item.type === "output_text" && typeof item.text === "string")
    .map((item) => item.text).join("\n").trim();
}
function validText(value, maxLength) {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= maxLength;
}
function rateLimited(ip) {
  const now = Date.now();
  const current = requests.get(ip);
  if (!current || now - current.startedAt >= WINDOW_MS) {
    requests.set(ip, { startedAt: now, count: 1 });
    return false;
  }
  current.count += 1;
  return current.count > MAX_REQUESTS;
}
export default async function handler(req, res) {
  const origin = req.headers.origin;
  if (origin && !ALLOWED_ORIGINS.includes(origin)) return send(res, 403, { error: "Origen no autorizado." });
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return send(res, 405, { error: "Método no permitido." });
  }
  if (!process.env.OPENAI_API_KEY) return send(res, 503, { error: "El asistente aún no está configurado. Vuelve a intentarlo más tarde." });
  const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown").split(",")[0].trim();
  if (rateLimited(ip)) return send(res, 429, { error: "Has realizado varias consultas. Espera un minuto e inténtalo de nuevo." });
  const body = typeof req.body === "string" ? (() => { try { return JSON.parse(req.body); } catch { return null; } })() : req.body;
  if (!body || typeof body !== "object") return send(res, 400, { error: "No pudimos leer los datos del viaje." });
  const departure = body.origin;
  const days = Number(body.days);
  const budget = Number(body.budget);
  const travellers = Number(body.travellers);
  if (!validText(departure, 80) || !Number.isInteger(days) || days < 1 || days > 30 || !Number.isFinite(budget) || budget < 50 || budget > 100000 || !Number.isInteger(travellers) || travellers < 1 || travellers > 20) {
    return send(res, 400, { error: "Revisa ciudad de salida, días, presupuesto y número de viajeros." });
  }
  const style = validText(body.style || "", 100) ? body.style.trim() : "Un poco de todo";
  const month = validText(body.month || "", 50) ? body.month.trim() : "Flexible";
  const interests = typeof body.interests === "string" ? body.interests.trim().slice(0, 700) : "";
  const input = [
    "Prepara una propuesta turística para viajar exclusivamente dentro del Perú.",
    "Responde en español, con tono cálido, profesional y práctico.",
    "No inventes precios exactos, horarios, disponibilidad, cierres, requisitos ni tiempos garantizados.",
    "Si incluyes costes, preséntalos solo como rangos orientativos y aclara que deben confirmarse.",
    "Ten en cuenta la geografía y distancias reales entre destinos; no propongas traslados físicamente imposibles.",
    "Considera altitud, aclimatación y dificultad física cuando recomiendes rutas de altura.",
    "Organiza la respuesta con: resumen de la ruta, itinerario por día, traslados orientativos, presupuesto aproximado por persona en soles, consejos prácticos y qué verificar antes de reservar.",
    "Si el presupuesto o los días no alcanzan para una ruta razonable, dilo con honestidad y ofrece una alternativa realista.",
    "No afirmes que Perú Explora IA tiene reservas, convenios o disponibilidad confirmada.",
    "",
    "Datos del viaje:",
    "Ciudad de salida: " + departure.trim(),
    "Duración: " + days + " días",
    "Presupuesto aproximado por persona: S/ " + budget,
    "Número de viajeros: " + travellers,
    "Estilo de viaje: " + style,
    "Época del viaje: " + month,
    "Intereses adicionales: " + (interests || "No especificados")
  ].join("\n");
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Authorization": "Bearer " + process.env.OPENAI_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-5.4-mini",
        store: false,
        max_output_tokens: 1100,
        instructions: "Eres el asesor de viajes de Perú Explora IA. Tu especialidad es turismo nacional peruano. Sé concreto y transparente. Nunca inventes datos operativos actuales.",
        input
      }),
      signal: AbortSignal.timeout(28000)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error("OpenAI request failed", response.status, data?.error?.type || "unknown_error");
      return send(res, 502, { error: "No pudimos generar el itinerario ahora. Inténtalo nuevamente en unos minutos." });
    }
    const itinerary = extractText(data);
    if (!itinerary) return send(res, 502, { error: "El asistente no devolvió una propuesta. Inténtalo nuevamente." });
    return send(res, 200, { itinerary, model: data.model || process.env.OPENAI_MODEL || "gpt-5.4-mini" });
  } catch (error) {
    console.error("Travel planner error", error?.name || "unknown_error");
    return send(res, 502, { error: "No pudimos conectar con el asistente. Inténtalo nuevamente." });
  }
}

// Azure AI Translator, for the bilingual Teams group names (Rick, 2026-10-07:
// the tenant's names are Chinese-only or English-only; the management centre
// shows both). Optional: without AZURE_TRANSLATOR_KEY the fill endpoint says
// so and names can still be typed by hand in the group panel.
//
// App settings: AZURE_TRANSLATOR_KEY, AZURE_TRANSLATOR_REGION (e.g. eastasia),
// optionally AZURE_TRANSLATOR_ENDPOINT (default: the global endpoint). The
// free tier (F0) covers 2 million characters a month — group names are a few
// hundred.
const ENDPOINT = process.env.AZURE_TRANSLATOR_ENDPOINT || "https://api.cognitive.microsofttranslator.com";

function configured() { return !!process.env.AZURE_TRANSLATOR_KEY; }

const CJK = /[㐀-鿿]/;
// Which side a name already is: "zh" when it holds Chinese characters, "en" when
// it is Latin text, "" when it is neither (digits, a code).
function sideOf(text) {
  const t = String(text || "");
  if (CJK.test(t)) return "zh";
  if (/[A-Za-z]/.test(t)) return "en";
  return "";
}

// translate(["中阶整本书阅读1班"], "en") → ["Intermediate whole-book reading class 1"]
async function translate(texts, to, from) {
  if (!configured()) throw Object.assign(new Error("AZURE_TRANSLATOR_KEY app setting is not configured"), { code: "no_translator" });
  const list = (texts || []).map((t) => String(t || "").slice(0, 500));
  if (!list.length) return [];
  const url = `${ENDPOINT}/translate?api-version=3.0&to=${encodeURIComponent(to === "zh" ? "zh-Hans" : "en")}${from ? "&from=" + encodeURIComponent(from === "zh" ? "zh-Hans" : "en") : ""}`;
  const headers = { "Ocp-Apim-Subscription-Key": process.env.AZURE_TRANSLATOR_KEY, "Content-Type": "application/json" };
  if (process.env.AZURE_TRANSLATOR_REGION) headers["Ocp-Apim-Subscription-Region"] = process.env.AZURE_TRANSLATOR_REGION;
  const out = [];
  for (let i = 0; i < list.length; i += 50) {
    const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(list.slice(i, i + 50).map((Text) => ({ Text }))) });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw Object.assign(new Error(`Translator HTTP ${res.status}: ${(data && data.error && data.error.message) || ""}`), { status: res.status });
    for (const r of data) out.push((r.translations && r.translations[0] && r.translations[0].text) || "");
  }
  return out;
}

module.exports = { configured, sideOf, translate };

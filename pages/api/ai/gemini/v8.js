import fetch from "node-fetch";
class Gemini {
  constructor({
    apiKey = "QUl6YVN5QklMVUtWcDNBaGR4aVM3RmtjUFFGZlM4R0d0YWJZLW40",
    baseUrl = "https://generativelanguage.googleapis.com/v1beta"
  } = {}) {
    this.config = {
      apiKey: this.decode(apiKey),
      baseUrl: baseUrl,
      headers: {
        "Content-Type": "application/json"
      }
    };
    if (!this.config.apiKey) console.warn("[Gemini] API key missing");
  }
  decode(str) {
    try {
      return JSON.parse(Buffer.from(str, "base64").toString());
    } catch {
      return Buffer.from(str, "base64").toString();
    }
  }
  async r(path, body) {
    const url = `${this.config.baseUrl}${path}?key=${this.config.apiKey}`;
    console.log(`[POST] ${url}`);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: this.config.headers,
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      console.log("[API OK]", res.status);
      return data;
    } catch (e) {
      console.error("[FETCH ERR]", e.message);
      throw e;
    }
  }
  async p(name) {
    const url = `${this.config.baseUrl}/${name}?key=${this.config.apiKey}`;
    console.log(`[POLL] ${url}`);
    while (true) {
      try {
        await new Promise(r => setTimeout(r, 2e3));
        const res = await fetch(url);
        const data = await res.json();
        if (!res.ok) throw new Error(`Poll HTTP ${res.status}`);
        if (data.done) {
          console.log("[POLL DONE]");
          return data;
        }
      } catch (e) {
        console.error("[POLL ERR]", e.message);
        throw e;
      }
    }
  }
  async _toB64(imageUrl) {
    if (!imageUrl) return null;
    try {
      if (Buffer.isBuffer(imageUrl)) {
        return imageUrl.toString("base64");
      }
      if (typeof imageUrl === "string") {
        if (!imageUrl.startsWith("http")) {
          return imageUrl.replace(/^data:image\/\w+;base64,/, "");
        }
        console.log("[IMG] fetch URL → arrayBuffer");
        const res = await fetch(imageUrl);
        if (!res.ok) throw new Error(`Image fetch ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        return buf.toString("base64");
      }
      throw new Error("imageUrl type not supported");
    } catch (e) {
      console.error("[IMG CONV ERR]", e.message);
      throw e;
    }
  }
  async listModels() {
    const url = `${this.config.baseUrl}/models?key=${this.config.apiKey}`;
    console.log(`[GET] ${url}`);
    try {
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${data.error?.message || ""}`);
      console.log("[MODELS] fetched successfully");
      return data;
    } catch (e) {
      console.error("[LIST MODELS ERR]", e.message);
      throw e;
    }
  }
  async chat({
    prompt,
    system,
    history = [],
    cfg = {},
    ...rest
  }) {
    console.log("[chat] start");
    try {
      const contents = [...system ? [{
        role: "model",
        parts: [{
          text: system
        }]
      }] : [], ...history.map(h => ({
        role: h.role ?? "user",
        parts: [{
          text: h.text
        }]
      })), {
        role: "user",
        parts: [{
          text: prompt
        }]
      }];
      return await this.r("/models/gemini-2.5-flash:generateContent", {
        contents: contents,
        generationConfig: cfg,
        ...rest
      });
    } catch (e) {
      console.error("[chat] failed");
      throw e;
    }
  }
  async veo({
    prompt,
    ar = "16:9",
    neg = "",
    ...rest
  }) {
    console.log("[veo] start");
    try {
      const op = await this.r("/models/veo-3.1-generate-preview:predictLongRunning", {
        instances: [{
          prompt: prompt
        }],
        parameters: {
          aspectRatio: ar,
          negativePrompt: neg,
          ...rest
        }
      });
      const name = op?.name;
      if (!name) throw new Error("No operation name");
      return await this.p(name);
    } catch (e) {
      console.error("[veo] failed");
      throw e;
    }
  }
  async veo_stats({
    ...rest
  }) {
    console.log("[veo_stats] start");
    try {
      return await this.r("/models/veo-3.1-generate-preview:get", rest);
    } catch (e) {
      console.error("[veo_stats] failed");
      throw e;
    }
  }
  async imagen({
    prompt,
    cnt = 1,
    ...rest
  }) {
    console.log("[imagen] start");
    try {
      return await this.r("/models/imagen-4.0-generate-001:predict", {
        instances: [{
          prompt: prompt
        }],
        parameters: {
          sampleCount: cnt,
          ...rest
        }
      });
    } catch (e) {
      console.error("[imagen] failed");
      throw e;
    }
  }
  async img({
    prompt,
    imageUrl,
    mime = "image/jpeg",
    ...rest
  }) {
    console.log("[img] start", imageUrl ? "img2img" : "txt2img");
    try {
      const data = await this._toB64(imageUrl);
      const parts = [{
        text: prompt
      }];
      if (data) parts.push({
        inline_data: {
          mime_type: mime,
          data: data
        }
      });
      const d = await this.r("/models/gemini-2.5-flash-image:generateContent", {
        contents: [{
          parts: parts
        }],
        ...rest
      });
      const pend = d?.candidates?.[0]?.content?.parts?.[0]?.pendingGeneration?.operation?.name;
      if (pend) {
        console.log("[img] pending → poll");
        return await this.p(pend);
      }
      return d;
    } catch (e) {
      console.error("[img] failed");
      throw e;
    }
  }
}
export default async function handler(req, res) {
  const {
    action,
    ...params
  } = req.method === "GET" ? req.query : req.body;
  if (!action) {
    return res.status(400).json({
      error: "Parameter 'action' wajib diisi."
    });
  }
  const api = new Gemini();
  try {
    let response;
    switch (action) {
      case "chat":
        if (!params.prompt && !params.messages) {
          return res.status(400).json({
            error: "Parameter 'prompt' atau 'messages' wajib untuk 'chat'."
          });
        }
        response = await api.chat(params);
        break;
      case "veo":
        if (!params.prompt) {
          return res.status(400).json({
            error: "Parameter 'prompt' wajib untuk 'veo'."
          });
        }
        response = await api.veo(params);
        break;
      case "veo_stats":
        response = await api.veo_stats(params);
        break;
      case "imagen":
        if (!params.prompt) {
          return res.status(400).json({
            error: "Parameter 'prompt' wajib untuk 'imagen'."
          });
        }
        response = await api.imagen(params);
        break;
      case "image":
        if (!params.prompt) {
          return res.status(400).json({
            error: "Parameter 'prompt' wajib untuk 'image'."
          });
        }
        response = await api.img(params);
        break;
      case "models":
        response = await api.listModels();
        break;
      default:
        return res.status(400).json({
          error: `Action tidak valid: ${action}. Didukung: models, chat, veo, veo_stats, imagen, image.`
        });
    }
    return res.status(200).json(response);
  } catch (error) {
    console.error(`[FATAL] action '${action}':`, error);
    return res.status(500).json({
      error: error.message || "Internal server error."
    });
  }
}
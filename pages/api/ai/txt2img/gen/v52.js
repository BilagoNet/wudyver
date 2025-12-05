import axios from "axios";
class PornWorks {
  constructor() {
    this.base = "https://pornworks.com/api/v2";
    const token = this.genCfToken();
    this.headers = {
      "cf-auth-token": token,
      "sec-ch-ua": '"Chromium";v="127", "Not)A;Brand";v="99", "Microsoft Edge Simulate";v="127", "Lemur";v="127"',
      "Accept-Language": "id-ID",
      "sec-ch-ua-mobile": "?1",
      "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Mobile Safari/537.36",
      "Content-Type": "application/json",
      Accept: "application/json, text/plain, */*",
      Referer: "https://pornworks.com/en/generate/image",
      Site: "pornworks",
      "sec-ch-ua-platform": '"Android"'
    };
  }
  genCfToken() {
    try {
      console.log("[LOG] Generating CF Auth Token...");
      const randomId = Math.random().toString(36).substring(2, 11);
      const payload = {
        x: "/generate/image?refid=undressai_com",
        lg: "en",
        dw: 424,
        dh: 942,
        cd: 24,
        to: "-480",
        u: randomId,
        z: "",
        re: "undressai_com"
      };
      const token = Buffer.from(JSON.stringify(payload)).toString("base64");
      console.log(`[LOG] Token Created: ${token.substring(0, 20)}...`);
      return token;
    } catch (e) {
      console.error("[ERR] Failed generating token:", e.message);
      return "";
    }
  }
  async req(method, path, data = null) {
    try {
      console.log(`[LOG] Requesting: ${method} ${path}`);
      const url = `${this.base}${path}`;
      const config = {
        method: method,
        url: url,
        headers: this.headers,
        data: data || undefined
      };
      const res = await axios(config);
      return res?.data;
    } catch (err) {
      console.error(`[ERR] ${method} ${path}:`, err?.message || err);
      if (err?.response?.data) console.error("[ERR] Body:", JSON.stringify(err.response.data));
      return null;
    }
  }
  async poll(id) {
    console.log(`[LOG] Start polling task: ${id}`);
    let state = "pending";
    let result = null;
    while (state === "pending") {
      await new Promise(r => setTimeout(r, 3e3));
      const rand = Math.random();
      const check = await this.req("GET", `/generations/${id}/state?r=${rand}`);
      state = check?.state || "pending";
      console.log(`[LOG] Status: ${state}`);
      if (state === "done") {
        result = check?.results;
      } else if (state === "failed") {
        console.error("[ERR] Task status returned failed");
        return null;
      }
    }
    return result;
  }
  async generate({
    prompt,
    ...rest
  }) {
    try {
      const payload = {
        checkpoint: rest.checkpoint || "real_porn_pony",
        prompt: prompt,
        negativePrompt: rest.negativePrompt || "anime, cartoon, graphic, (blur, blurry, bokeh), 3d, render, text, painting, crayon, graphite, abstract, glitch, deformed, mutated, ugly, disfigured",
        resources: rest.resources || [],
        ratio: rest.ratio || "2x3",
        sharpness: rest.sharpness ?? 5,
        cfgScale: rest.cfgScale ?? 4,
        performance: rest.performance || "express",
        denoisingStrength: rest.denoisingStrength ?? 1,
        fast: rest.fast ? true : false,
        nsfw: rest.nsfw ? true : false
      };
      console.log("[LOG] Sending generation payload...");
      const init = await this.req("POST", "/generate/text2image", payload);
      const id = init?.id;
      if (!id) throw new Error("Gagal mendapatkan Generation ID");
      console.log(`[LOG] Task Created ID: ${id}`);
      const finalData = await this.poll(id);
      return finalData ? {
        success: true,
        ...finalData
      } : {
        success: false,
        message: "Task finished but no result found"
      };
    } catch (e) {
      console.error("[ERR] Generate Process Failed:", e.message);
      return {
        success: false,
        error: e.message
      };
    }
  }
}
export default async function handler(req, res) {
  const params = req.method === "GET" ? req.query : req.body;
  if (!params.prompt) {
    return res.status(400).json({
      error: "Parameter 'prompt' diperlukan"
    });
  }
  const api = new PornWorks();
  try {
    const data = await api.generate(params);
    return res.status(200).json(data);
  } catch (error) {
    const errorMessage = error.message || "Terjadi kesalahan saat memproses URL";
    return res.status(500).json({
      error: errorMessage
    });
  }
}
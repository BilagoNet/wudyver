import axios from "axios";
import {
  CookieJar
} from "tough-cookie";
import {
  wrapper
} from "axios-cookiejar-support";
class FishAudioTTS {
  constructor() {
    this.baseUrl = "https://fish.audio";
    this.jar = new CookieJar();
    this.client = wrapper(axios.create({
      jar: this.jar
    }));
    this.models = [];
    this.nextAction = "";
    this.routerState = "";
  }
  async init() {
    console.log("[FishAudio] Menginisialisasi cookie dan model...");
    try {
      const res = await this.client.get(this.baseUrl, {
        headers: {
          accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "accept-language": "id-ID",
          "user-agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Mobile Safari/537.36"
        }
      });
      const html = res?.data || "";
      const actionStart = html.indexOf("6058df959fde32a8eb327f897197538e5cf96bcadd");
      this.nextAction = actionStart > -1 ? "6058df959fde32a8eb327f897197538e5cf96bcadd" : "";
      const stateKey = "next-router-state-tree";
      const statePos = html.indexOf(stateKey);
      if (statePos > -1) {
        const contentPos = html.indexOf('content="', statePos);
        if (contentPos > -1) {
          const start = contentPos + 9;
          const end = html.indexOf('"', start);
          this.routerState = end > -1 ? html.substring(start, end) : "";
        }
      }
      if (!this.routerState) {
        this.routerState = "%5B%22%22%2C%7B%22children%22%3A%5B%5B%22lng%22%2C%22en%22%2C%22d%22%5D%2C%7B%22children%22%3A%5B%22(landing)%22%2C%7B%22children%22%3A%5B%22__PAGE__%22%2C%7B%7D%2Cnull%2Cnull%5D%7D%2Cnull%2Cnull%5D%7D%2Cnull%2Cnull%2Ctrue%5D%7D%2Cnull%2Cnull%5D";
      }
      const scriptKey = 'self.__next_f.push([1,"1d:';
      const scriptStart = html.indexOf(scriptKey);
      if (scriptStart > -1) {
        const dataStart = scriptStart + scriptKey.length;
        const scriptEnd = html.indexOf('"])<\/script>', dataStart);
        if (scriptEnd > -1) {
          let jsonStr = html.substring(dataStart, scriptEnd);
          jsonStr = jsonStr.replace(/\\"/g, '"').replace(/\\u0026/g, "&");
          const modelsKey = '"models":{';
          const modelsStart = jsonStr.indexOf(modelsKey);
          if (modelsStart > -1) {
            let depth = 0;
            let inString = false;
            let escape = false;
            let modelsEnd = -1;
            for (let i = modelsStart + modelsKey.length - 1; i < jsonStr.length; i++) {
              const char = jsonStr[i];
              if (escape) {
                escape = false;
                continue;
              }
              if (char === "\\") {
                escape = true;
                continue;
              }
              if (char === '"') {
                inString = !inString;
                continue;
              }
              if (!inString) {
                if (char === "{") depth++;
                if (char === "}") {
                  depth--;
                  if (depth === 0) {
                    modelsEnd = i + 1;
                    break;
                  }
                }
              }
            }
            if (modelsEnd > -1) {
              const modelsJson = jsonStr.substring(modelsStart, modelsEnd);
              try {
                const parsed = JSON.parse(`{${modelsJson}}`);
                this.models = Object.values(parsed?.models || {}).flat();
                console.log(`[FishAudio] Berhasil load ${this.models?.length || 0} model`);
              } catch (parseErr) {
                console.error(`[FishAudio] Parse JSON gagal: ${parseErr?.message || parseErr}`);
              }
            }
          }
        }
      }
      console.log(`[FishAudio] Init selesai. Cookie: ${this.jar.getCookiesSync(this.baseUrl)?.length || 0} items`);
      return {
        success: true,
        models: this.models?.length || 0
      };
    } catch (err) {
      console.error(`[FishAudio] Init gagal: ${err?.message || err}`);
      throw err;
    }
  }
  async list() {
    console.log("[FishAudio] Mengambil list model...");
    if (!this.models?.length) {
      await this.init();
    }
    return this.models?.map((m, i) => ({
      index: i,
      id: m?._id || "",
      title: m?.title || "",
      cover: m?.cover_image || "",
      text: m?.default_text || "",
      sample: m?.samples?.[0]?.audio || ""
    })) || [];
  }
  async findVoice(input) {
    if (!input) return this.models?.[0]?._id || "";
    if (!this.models?.length) {
      await this.init();
    }
    const idx = parseInt(input);
    if (!isNaN(idx) && idx >= 0 && idx < this.models?.length) {
      const found = this.models[idx];
      console.log(`[FishAudio] Voice via index ${idx}: ${found?.title || "Unknown"}`);
      return found?._id || "";
    }
    const lower = input?.toLowerCase()?.trim() || "";
    const found = this.models?.find(m => m?._id?.toLowerCase() === lower || m?.title?.toLowerCase()?.includes(lower));
    if (found) {
      console.log(`[FishAudio] Voice ditemukan: "${input}" -> ${found?.title || ""}`);
      return found?._id || input;
    }
    console.warn(`[FishAudio] Voice "${input}" tidak ditemukan, gunakan raw`);
    return input;
  }
  async generate({
    text = "諦めない気持ちは誰にも負けない。どんな壁だって、一人じゃ越えられない時もある。でも仲間となら、必ず道が開ける。だから、最後まで走り抜けるんだ。俺はまだ終わらない。待ってろよ。",
    voice = "c496c7d0e93640a59a0befd78b47f39e",
    ...rest
  }) {
    if (!text) {
      throw new Error("Parameter 'text' wajib diisi");
    }
    console.log("[FishAudio] Generate audio...");
    const voiceId = await this.findVoice(voice);
    if (!this.nextAction || !this.routerState) {
      console.log("[FishAudio] Reinit karena data kosong...");
      await this.init();
    }
    const payload = [voiceId, text];
    try {
      const res = await this.client.post(this.baseUrl, JSON.stringify(payload), {
        headers: {
          accept: "text/x-component",
          "accept-language": "id-ID",
          "content-type": "text/plain;charset=UTF-8",
          "next-action": this.nextAction || "6058df959fde32a8eb327f897197538e5cf96bcadd",
          "next-router-state-tree": this.routerState,
          origin: this.baseUrl,
          referer: `${this.baseUrl}/`,
          "user-agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Mobile Safari/537.36",
          ...rest?.headers
        }
      });
      const data = res?.data || "";
      let audioUrl = "";
      const httpPos = data.indexOf("https://");
      if (httpPos > -1) {
        const mp3Marker = ".mp3";
        let searchPos = httpPos;
        while (searchPos > -1 && searchPos < data.length) {
          const mp3Pos = data.indexOf(mp3Marker, searchPos);
          if (mp3Pos > -1) {
            let urlEnd = mp3Pos + mp3Marker.length;
            while (urlEnd < data.length) {
              const char = data[urlEnd];
              if (char === '"' || char === "'" || char === " " || char === "\n" || char === "\r") {
                break;
              }
              urlEnd++;
            }
            let urlStart = mp3Pos;
            while (urlStart > 0) {
              const check = data.substring(urlStart - 8, urlStart);
              if (check === "https://") {
                urlStart = urlStart - 8;
                break;
              }
              urlStart--;
            }
            audioUrl = data.substring(urlStart, urlEnd);
            if (audioUrl.indexOf("https://") === 0 && audioUrl.indexOf(".mp3") > -1) {
              break;
            }
            searchPos = mp3Pos + 1;
          } else {
            break;
          }
        }
      }
      if (!audioUrl) {
        throw new Error("Audio URL tidak ditemukan di response");
      }
      console.log(`[FishAudio] Berhasil generate audio`);
      return {
        success: true,
        voice: voiceId,
        audioUrl: audioUrl
      };
    } catch (err) {
      console.error(`[FishAudio] Generate gagal: ${err?.message || err}`);
      throw err;
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
      error: "Parameter 'action' wajib"
    });
  }
  const api = new FishAudioTTS();
  try {
    let response;
    switch (action) {
      case "init":
        response = await api.init();
        return res.status(200).json(response);
      case "list":
        response = await api.list();
        return res.status(200).json({
          success: true,
          count: response?.length || 0,
          models: response
        });
      case "generate":
        if (!params.text) {
          return res.status(400).json({
            error: "Parameter 'text' wajib"
          });
        }
        response = await api.generate(params);
        return res.status(200).json(response);
      default:
        return res.status(400).json({
          error: `Action invalid: ${action}. Didukung: 'init', 'list', 'generate'`
        });
    }
  } catch (err) {
    console.error(`[FATAL] Action '${action}':`, err);
    return res.status(500).json({
      error: err?.message || "Internal server error"
    });
  }
}
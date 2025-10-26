import axios from "axios";
import {
  CookieJar
} from "tough-cookie";
import {
  wrapper
} from "axios-cookiejar-support";
import {
  randomBytes
} from "crypto";
import apiConfig from "@/configs/apiConfig";
import SpoofHead from "@/lib/spoof-head";
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
class WudysoftAPI {
  constructor() {
    this.client = axios.create({
      baseURL: `https://${apiConfig.DOMAIN_URL}/api`
    });
  }
  async createEmail() {
    try {
      console.log("[WUDYSOFT] Membuat email sementara...");
      const res = await this.client.get("/mails/v9", {
        params: {
          action: "create"
        }
      });
      const email = res.data?.email;
      if (!email) throw new Error("Email tidak ditemukan");
      console.log(`[SUCCESS] Email: ${email}`);
      return email;
    } catch (err) {
      console.error(`[ERROR] createEmail: ${err.response?.data || err.message}`);
      throw err;
    }
  }
  async getVerificationCode(email) {
    try {
      console.log(`[WUDYSOFT] Menunggu kode verifikasi untuk ${email}...`);
      for (let i = 0; i < 30; i++) {
        const res = await this.client.get("/mails/v9", {
          params: {
            action: "message",
            email: email
          }
        });
        const msg = res.data?.data?.[0];
        if (msg?.text_content) {
          const match = msg.text_content.match(/Your verification code is:\s*(\d{6})/);
          if (match) {
            console.log(`[SUCCESS] Kode: ${match[1]}`);
            return match[1];
          }
        }
        await sleep(3e3);
      }
      throw new Error("Timeout: Kode verifikasi tidak ditemukan");
    } catch (err) {
      console.error(`[ERROR] getVerificationCode: ${err.message}`);
      throw err;
    }
  }
  async createPaste(title, content) {
    try {
      const res = await this.client.get("/tools/paste/v1", {
        params: {
          action: "create",
          title: title,
          content: content
        }
      });
      const key = res.data?.key;
      if (!key) throw new Error("Key paste tidak ditemukan");
      console.log(`[SUCCESS] Paste dibuat: ${key}`);
      return key;
    } catch (err) {
      console.error(`[ERROR] createPaste: ${err.response?.data || err.message}`);
      throw err;
    }
  }
  async getPaste(key) {
    try {
      const res = await this.client.get("/tools/paste/v1", {
        params: {
          action: "get",
          key: key
        }
      });
      if (!res.data?.content) throw new Error("Paste kosong atau tidak ditemukan");
      return res.data.content;
    } catch (err) {
      console.error(`[ERROR] getPaste(${key}): ${err.response?.data || err.message}`);
      return null;
    }
  }
}
async function logCookies(jar, url, label = "") {
  try {
    const cookies = await jar.getCookies(url);
    console.log(`\n[COOKIES${label ? " " + label : ""}] ${url}`);
    if (cookies.length === 0) {
      console.log("  - (Tidak ada cookie)");
      return;
    }
    for (const c of cookies) {
      const val = c.value?.substring(0, 80) || "(null)";
      const ellipsis = c.value?.length > 80 ? "..." : "";
      console.log(`  - ${c.key} = ${val}${ellipsis}`);
    }
  } catch (err) {
    console.error(`[ERROR] logCookies: ${err.message}`);
  }
}
class NanoBananaAPI {
  constructor() {
    this.cookieJar = new CookieJar();
    this.baseURL = "https://nanobanana.ai/api";
    this.wudysoft = new WudysoftAPI();
    const headers = {
      accept: "*/*",
      "accept-language": "id-ID",
      "cache-control": "no-cache",
      "content-type": "application/json",
      origin: "https://nanobanana.ai",
      pragma: "no-cache",
      "sec-ch-ua": '"Chromium";v="127", "Not)A;Brand";v="99", "Microsoft Edge Simulate";v="127", "Lemur";v="127"',
      "sec-ch-ua-mobile": "?1",
      "sec-ch-ua-platform": '"Android"',
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-origin",
      "user-agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Mobile Safari/537.36",
      ...SpoofHead()
    };
    this.api = wrapper(axios.create({
      baseURL: this.baseURL,
      jar: this.cookieJar,
      headers: headers,
      timeout: 3e4
    }));
  }
  _random() {
    return Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
  }
  async _getCsrfToken() {
    try {
      const res = await this.api.get("/auth/csrf");
      const token = res.data.csrfToken;
      console.log(`[CSRF] Token: ${token.substring(0, 20)}...`);
      return token;
    } catch (err) {
      console.error(`[ERROR] _getCsrfToken: ${err.response?.data || err.message}`);
      throw err;
    }
  }
  async _sendCode(email) {
    try {
      await this.api.post("/auth/send-code", {
        email: email,
        locale: "en"
      });
      console.log(`[SUCCESS] Kode verifikasi dikirim ke ${email}`);
    } catch (err) {
      console.error(`[ERROR] _sendCode: ${err.response?.data || err.message}`);
      throw err;
    }
  }
  async _verifyCode(email, code) {
    try {
      await this.api.post("/auth/callback/credentials", {
        email: email,
        code: code,
        callbackUrl: "/generator"
      });
      console.log(`[SUCCESS] Verifikasi kode berhasil`);
    } catch (err) {
      console.error(`[ERROR] _verifyCode: ${err.response?.data || err.message}`);
      throw err;
    }
  }
  async _downloadImage(imageInput) {
    try {
      let buffer;
      if (Buffer.isBuffer(imageInput)) {
        buffer = imageInput;
      } else if (typeof imageInput === "string") {
        if (imageInput.startsWith("http")) {
          console.log(`[DOWNLOAD] Mengunduh: ${imageInput.substring(0, 50)}...`);
          const res = await axios.get(imageInput, {
            responseType: "arraybuffer",
            timeout: 15e3
          });
          buffer = Buffer.from(res.data);
        } else if (imageInput.startsWith("data:image/")) {
          buffer = Buffer.from(imageInput.split(",")[1], "base64");
        } else {
          throw new Error("Format tidak didukung");
        }
      } else {
        throw new Error("imageInput harus string atau Buffer");
      }
      console.log(`[SUCCESS] Gambar diunduh: ${(buffer.length / 1024).toFixed(2)} KB`);
      return buffer;
    } catch (err) {
      console.error(`[ERROR] _downloadImage: ${err.message}`);
      throw err;
    }
  }
  async _uploadImageToR2(buffer, fileName) {
    try {
      console.log(`[UPLOAD] Mengunggah: ${fileName}`);
      const {
        uploadUrl,
        publicUrl
      } = (await this.api.post("/get-upload-url", {
        fileName: fileName,
        contentType: "image/jpeg",
        fileSize: buffer.length
      })).data;
      await axios.put(uploadUrl, buffer, {
        headers: {
          "Content-Type": "image/jpeg"
        },
        timeout: 2e4
      });
      console.log(`[SUCCESS] Upload selesai: ${publicUrl}`);
      return publicUrl;
    } catch (err) {
      console.error(`[ERROR] _uploadImageToR2: ${err.response?.data || err.message}`);
      throw err;
    }
  }
  async _uploadMultipleImages(imageInputs) {
    const urls = [];
    let index = 0;
    for (const input of imageInputs) {
      index++;
      try {
        const buffer = await this._downloadImage(input);
        const fileName = `upload-${Date.now()}-${index}-${this._random()}.jpg`;
        const url = await this._uploadImageToR2(buffer, fileName);
        urls.push(url);
      } catch (err) {
        console.error(`[ERROR] Gagal upload gambar ke-${index}: ${err.message}`);
      }
    }
    if (urls.length === 0) throw new Error("Semua upload gagal");
    return urls;
  }
  async _ensureSession({
    key
  } = {}) {
    let session = null;
    let currentKey = key;
    if (key) {
      try {
        console.log(`[SESSION] Memuat dari key: ${key}`);
        const saved = await this.wudysoft.getPaste(key);
        if (saved) session = JSON.parse(saved);
      } catch (err) {
        console.warn(`[WARN] Gagal baca paste: ${err.message}`);
      }
    }
    if (!session) {
      console.log("[SESSION] Membuat sesi baru...");
      const email = await this.wudysoft.createEmail();
      await this._getCsrfToken();
      await this._sendCode(email);
      const code = await this.wudysoft.getVerificationCode(email);
      await this._verifyCode(email, code);
      const cookies = await this.cookieJar.getCookies("https://nanobanana.ai");
      const sessionToken = cookies.find(c => c.key === "__Secure-next-auth.session-token")?.value;
      if (!sessionToken) throw new Error("Session token tidak ditemukan");
      session = {
        email: email,
        sessionToken: sessionToken
      };
      currentKey = await this.wudysoft.createPaste(`nanobanana-session-${this._random()}`, JSON.stringify(session));
      console.log(`[SUCCESS] Sesi baru disimpan. Key: ${currentKey}`);
    } else {
      await this.cookieJar.setCookie(`__Secure-next-auth.session-token=${session.sessionToken}; Domain=.nanobanana.ai; Path=/; Secure; HttpOnly; SameSite=Lax`, "https://nanobanana.ai");
    }
    await logCookies(this.cookieJar, "https://nanobanana.ai", "SESSION");
    return {
      session: session,
      key: currentKey
    };
  }
  async register() {
    try {
      const {
        key,
        session
      } = await this._ensureSession();
      return {
        key: key,
        email: session.email
      };
    } catch (err) {
      console.error(`[ERROR] register: ${err.message}`);
      throw err;
    }
  }
  async txt2img({
    prompt,
    styleId = "realistic",
    resolution = "1024*1024",
    key
  }) {
    try {
      const {
        key: currentKey
      } = await this._ensureSession({
        key: key
      });
      console.log(`[TXT2IMG] Prompt: "${prompt.substring(0, 60)}..."`);
      const task = await this.api.post("/generate-image", {
        prompt: prompt,
        styleId: styleId,
        mode: "text",
        imageSize: "auto",
        quality: "standard",
        numImages: 1,
        outputFormat: "png",
        model: "nano-banana",
        resolution: resolution,
        aspectRatio: "1:1"
      });
      console.log(`[SUCCESS] Task dibuat: ${task.data.taskId}`);
      return {
        ...task.data,
        key: currentKey
      };
    } catch (err) {
      console.error(`[ERROR] txt2img: ${err.response?.data || err.message}`);
      throw err;
    }
  }
  async img2img({
    prompt,
    imageUrl,
    styleId = "realistic",
    resolution = "1024*1024",
    key
  }) {
    try {
      const {
        key: currentKey
      } = await this._ensureSession({
        key: key
      });
      console.log(`[IMG2IMG] Prompt: "${prompt.substring(0, 60)}..."`);
      const imageInputs = Array.isArray(imageUrl) ? imageUrl : [imageUrl];
      const uploadedUrls = await this._uploadMultipleImages(imageInputs);
      const task = await this.api.post("/generate-image", {
        prompt: prompt,
        styleId: styleId,
        mode: "image",
        imageUrl: uploadedUrls[0],
        imageUrls: uploadedUrls,
        imageSize: "auto",
        quality: "standard",
        numImages: 1,
        outputFormat: "png",
        model: "nano-banana",
        resolution: resolution,
        aspectRatio: "1:1"
      });
      console.log(`[SUCCESS] Task img2img: ${task.data.taskId}`);
      return {
        ...task.data,
        key: currentKey
      };
    } catch (err) {
      console.error(`[ERROR] img2img: ${err.response?.data || err.message}`);
      throw err;
    }
  }
  async status({
    taskId,
    key,
    poll = false,
    interval = 5e3
  }) {
    try {
      await this._ensureSession({
        key: key
      });
      console.log(`[STATUS] Polling task: ${taskId}`);
      if (!poll) {
        const res = await this.api.get(`/generate-image/status?taskId=${taskId}`);
        return {
          ...res.data,
          key: key
        };
      }
      for (let i = 0; i < 60; i++) {
        const res = await this.api.get(`/generate-image/status?taskId=${taskId}`);
        const data = res.data;
        console.log(`[POLL ${i + 1}] Status: ${data.status} | Progress: ${data.progress || 0}%`);
        if (data.status === "completed") {
          console.log(`[SUCCESS] Selesai! URL: ${data.imageUrl}`);
          return {
            ...data,
            key: key
          };
        }
        if (data.status === "failed") throw new Error("Generation failed");
        await sleep(interval);
      }
      throw new Error("Polling timeout");
    } catch (err) {
      console.error(`[ERROR] status: ${err.message}`);
      throw err;
    }
  }
  async credits({
    key
  } = {}) {
    try {
      const {
        key: currentKey
      } = await this._ensureSession({
        key: key
      });
      const res = await this.api.get("/user/credits");
      console.log(`[CREDITS] Tersisa: ${res.data.credits}`);
      return {
        ...res.data,
        key: currentKey
      };
    } catch (err) {
      console.error(`[ERROR] credits: ${err.response?.data || err.message}`);
      throw err;
    }
  }
}
export default async function handler(req, res) {
  const {
    action,
    ...params
  } = req.method === "GET" ? req.query : req.body;
  if (!action) return res.status(400).json({
    error: "action required"
  });
  const api = new NanoBananaAPI();
  try {
    let result;
    switch (action) {
      case "register":
        result = await api.register();
        break;
      case "txt2img":
        if (!params.prompt) return res.status(400).json({
          error: "prompt required"
        });
        result = await api.txt2img(params);
        break;
      case "img2img":
        if (!params.prompt || !params.imageUrl) return res.status(400).json({
          error: "prompt & imageUrl required"
        });
        result = await api.img2img(params);
        break;
      case "status":
        if (!params.taskId) return res.status(400).json({
          error: "taskId required"
        });
        result = await api.status(params);
        break;
      case "credits":
        result = await api.credits(params);
        break;
      default:
        return res.status(400).json({
          error: "Invalid action"
        });
    }
    res.status(200).json(result);
  } catch (err) {
    console.error(`[FATAL] ${action}: ${err.message}`);
    res.status(500).json({
      error: err.message
    });
  }
}
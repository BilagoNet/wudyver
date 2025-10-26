import axios from "axios";
import {
  CookieJar
} from "tough-cookie";
import {
  wrapper
} from "axios-cookiejar-support";
import {
  randomBytes,
  createHash
} from "crypto";
import apiConfig from "@/configs/apiConfig";
import SpoofHead from "@/lib/spoof-head";
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function base64URLEncode(str) {
  return str.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest();
}
async function logCookies(jar, url, label) {
  try {
    const cookies = await jar.getCookies(url);
    console.log(`\n[COOKIES ${label}] URL: ${url}`);
    if (cookies.length === 0) {
      console.log("  - (Tidak ada cookie)");
      return;
    }
    cookies.forEach(c => {
      const valuePreview = c.value ? c.value.substring(0, 80) : "(null)";
      const ellipsis = c.value && c.value.length > 80 ? "..." : "";
      console.log(`  - ${c.key} = ${valuePreview}${ellipsis}`);
    });
  } catch (e) {
    console.error(`[ERROR] Gagal membaca cookie untuk ${url}: ${e.message}`);
  }
}
class WudysoftAPI {
  constructor() {
    this.client = axios.create({
      baseURL: `https://${apiConfig.DOMAIN_URL}/api`
    });
  }
  async createEmail() {
    try {
      console.log("[WUDYSOFT] Membuat email sementara...");
      const response = await this.client.get("/mails/v9", {
        params: {
          action: "create"
        }
      });
      const email = response.data?.email;
      if (!email) throw new Error("Email tidak ditemukan di response");
      console.log(`[SUCCESS] Email dibuat: ${email}`);
      return email;
    } catch (error) {
      console.error(`[ERROR] Gagal membuat email: ${error.response?.data || error.message}`);
      throw error;
    }
  }
  async checkMessages(email) {
    try {
      console.log(`[WUDYSOFT] Mengecek pesan untuk: ${email}`);
      const response = await this.client.get("/mails/v9", {
        params: {
          action: "message",
          email: email
        }
      });
      const content = response.data?.data?.[0]?.text_content;
      if (!content) {
        console.log(`[INFO] Belum ada pesan untuk ${email}`);
        return null;
      }
      const match = content.match(/https:\/\/www\.imideo\.net\/api\/auth\/verify-email\?token=([a-z0-9\-]+)/);
      if (!match) {
        console.log(`[INFO] Link verifikasi belum ada di pesan`);
        return null;
      }
      const link = `https://www.imideo.net/api/auth/verify-email?token=${match[1]}`;
      console.log(`[SUCCESS] Link verifikasi ditemukan: ${link}`);
      return link;
    } catch (error) {
      console.error(`[ERROR] Gagal cek pesan untuk ${email}: ${error.message}`);
      return null;
    }
  }
  async createPaste(title, content) {
    try {
      console.log(`[WUDYSOFT] Membuat paste: ${title}`);
      const response = await this.client.get("/tools/paste/v1", {
        params: {
          action: "create",
          title: title,
          content: content
        }
      });
      const key = response.data?.key;
      if (!key) throw new Error("Key paste tidak ditemukan");
      console.log(`[SUCCESS] Paste dibuat. Key: ${key}`);
      return key;
    } catch (error) {
      console.error(`[ERROR] Gagal create paste: ${error.response?.data || error.message}`);
      throw error;
    }
  }
  async getPaste(key) {
    try {
      console.log(`[WUDYSOFT] Mengambil paste dengan key: ${key}`);
      const response = await this.client.get("/tools/paste/v1", {
        params: {
          action: "get",
          key: key
        }
      });
      const content = response.data?.content;
      if (!content) throw new Error("Paste tidak ditemukan atau kosong");
      console.log(`[SUCCESS] Paste berhasil diambil`);
      return content;
    } catch (error) {
      console.error(`[ERROR] Gagal get paste ${key}: ${error.response?.data || error.message}`);
      return null;
    }
  }
}
class IMideoAPI {
  constructor() {
    this.cookieJar = new CookieJar();
    this.baseURL = "https://www.imideo.net/api";
    const commonHeaders = {
      "accept-language": "id-ID",
      origin: "https://www.imideo.net",
      referer: "https://www.imideo.net/sora-2",
      "sec-ch-ua": '"Chromium";v="127", "Not)A;Brand";v="99", "Microsoft Edge Simulate";v="127", "Lemur";v="127"',
      "sec-ch-ua-mobile": "?1",
      "sec-ch-ua-platform": '"Android"',
      "user-agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Mobile Safari/537.36",
      ...SpoofHead()
    };
    this.api = wrapper(axios.create({
      baseURL: this.baseURL,
      jar: this.cookieJar,
      withCredentials: true,
      headers: {
        ...commonHeaders,
        accept: "*/*",
        "content-type": "application/json",
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin"
      }
    }));
    this.wudysoft = new WudysoftAPI();
  }
  _random() {
    return Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
  }
  async _downloadOrParseImage(imageInput) {
    try {
      let buffer;
      if (Buffer.isBuffer(imageInput)) {
        console.log("[IMAGE] Input adalah Buffer");
        buffer = imageInput;
      } else if (typeof imageInput === "string") {
        if (imageInput.startsWith("http://") || imageInput.startsWith("https://")) {
          console.log(`[IMAGE] Mengunduh dari URL: ${imageInput.substring(0, 60)}...`);
          const response = await axios.get(imageInput, {
            responseType: "arraybuffer",
            timeout: 15e3
          });
          buffer = Buffer.from(response.data);
        } else if (imageInput.startsWith("data:image/")) {
          console.log("[IMAGE] Parsing dari data:image base64");
          buffer = Buffer.from(imageInput.replace(/^data:image\/\w+;base64,/, ""), "base64");
        } else {
          throw new Error("Format imageUrl tidak didukung. Gunakan: URL, data:image, atau Buffer");
        }
      } else {
        throw new Error("imageUrl harus string (URL/base64) atau Buffer");
      }
      if (!buffer || buffer.length === 0) throw new Error("Gambar kosong");
      console.log(`[SUCCESS] Gambar berhasil diproses. Ukuran: ${(buffer.length / 1024).toFixed(2)} KB`);
      return buffer;
    } catch (error) {
      console.error(`[ERROR] Gagal memproses gambar: ${error.message}`);
      throw error;
    }
  }
  async _uploadImage(buffer, fileName) {
    try {
      console.log(`[UPLOAD] Mengunggah gambar: ${fileName}`);
      const base64Data = `data:image/jpeg;base64,${buffer.toString("base64")}`;
      const payload = {
        base64Data: base64Data,
        fileName: fileName
      };
      const response = await this.api.post("/upload-image", payload);
      if (!response.data.success) throw new Error(response.data.message || "Upload gagal");
      const url = response.data.data.downloadUrl;
      console.log(`[SUCCESS] Upload berhasil: ${url}`);
      return url;
    } catch (error) {
      console.error(`[ERROR] Upload gambar gagal: ${error.response?.data || error.message}`);
      throw error;
    }
  }
  async _getSessionToken() {
    try {
      const cookies = await this.cookieJar.getCookies("https://www.imideo.net");
      const sessionCookie = cookies.find(c => c.key === "__Secure-authjs.session-token");
      if (!sessionCookie) {
        console.warn("[WARNING] Session token tidak ditemukan di cookie");
        return null;
      }
      console.log(`[SUCCESS] Session token ditemukan (panjang: ${sessionCookie.value.length})`);
      return sessionCookie.value;
    } catch (error) {
      console.error(`[ERROR] Gagal membaca session token: ${error.message}`);
      return null;
    }
  }
  async _performRegistration() {
    try {
      console.log("\n[IMIDEO] ====== MEMULAI REGISTRASI ======");
      const email = await this.wudysoft.createEmail();
      const nickname = `User${Date.now()}${this._random()}`;
      const password = `Pass${Date.now()}${this._random()}`;
      console.log(`[IMIDEO] Mendaftar dengan email: ${email}, nickname: ${nickname}`);
      await this.api.post("/auth/signup", {
        email: email,
        password: password,
        nickname: nickname
      });
      console.log("[IMIDEO] Menunggu email verifikasi...");
      let verifyLink = null;
      for (let i = 0; i < 60; i++) {
        verifyLink = await this.wudysoft.checkMessages(email);
        if (verifyLink) break;
        console.log(`[IMIDEO] Menunggu... (${i + 1}/60)`);
        await sleep(3e3);
      }
      if (!verifyLink) throw new Error("Timeout: Link verifikasi tidak ditemukan");
      console.log(`[IMIDEO] Mengakses link verifikasi: ${verifyLink}`);
      const verifyClient = wrapper(axios.create({
        jar: this.cookieJar
      }));
      await verifyClient.get(verifyLink, {
        maxRedirects: 10
      });
      console.log("[IMIDEO] Validasi kredensial...");
      await this.api.post("/auth/validate-credentials", {
        email: email,
        password: password
      });
      await this.api.get("/auth/session");
      const sessionToken = await this._getSessionToken();
      if (!sessionToken) throw new Error("Session token tidak ditemukan setelah login");
      console.log("[SUCCESS] Registrasi & login berhasil!");
      return {
        email: email,
        password: password,
        nickname: nickname,
        sessionToken: sessionToken
      };
    } catch (error) {
      console.error(`[ERROR] Registrasi gagal: ${error.message}`);
      throw error;
    }
  }
  async _ensureValidSession({
    key
  }) {
    let sessionData = null;
    let currentKey = key;
    try {
      if (key) {
        console.log(`[SESSION] Memuat sesi dari key: ${key}`);
        const saved = await this.wudysoft.getPaste(key);
        if (saved) {
          sessionData = JSON.parse(saved);
          console.log(`[SUCCESS] Sesi berhasil dimuat dari key`);
        } else {
          console.warn(`[WARNING] Key ${key} tidak ditemukan di Wudysoft`);
        }
      }
    } catch (error) {
      console.warn(`[WARNING] Gagal memuat sesi dari key: ${error.message}`);
    }
    if (!sessionData) {
      console.log("[SESSION] Key tidak valid atau tidak ada → Membuat sesi baru");
      const newSession = await this._performRegistration();
      const toSave = JSON.stringify({
        email: newSession.email,
        password: newSession.password,
        sessionToken: newSession.sessionToken
      });
      currentKey = await this.wudysoft.createPaste(`imideo-session-${this._random()}`, toSave);
      sessionData = newSession;
      console.log(`[SUCCESS] Sesi baru disimpan. Gunakan key: ${currentKey}`);
    }
    try {
      await this.cookieJar.setCookie(`__Secure-authjs.session-token=${sessionData.sessionToken}; Domain=.imideo.net; Path=/; Secure; HttpOnly; SameSite=Lax`, "https://www.imideo.net");
      console.log(`[SESSION] Cookie session token berhasil di-set`);
    } catch (error) {
      console.error(`[ERROR] Gagal set cookie: ${error.message}`);
    }
    return {
      sessionData: sessionData,
      key: currentKey
    };
  }
  async register() {
    try {
      console.log("[ACTION] register → Memulai...");
      const {
        key,
        sessionData
      } = await this._ensureValidSession({});
      console.log(`[SUCCESS] Registrasi selesai. Key: ${key}, Email: ${sessionData.email}`);
      return {
        key: key,
        email: sessionData.email
      };
    } catch (error) {
      console.error(`[ERROR] register gagal: ${error.message}`);
      throw error;
    }
  }
  async _queueVideo(payload) {
    try {
      console.log(`[VIDEO] Mengirim task ke queue...`);
      const response = await this.api.post("/video-generation/queue-v2", payload);
      if (!response.data.taskId) throw new Error("taskId tidak ada di response");
      console.log(`[SUCCESS] Task berhasil dibuat: ${response.data.taskId}`);
      return response.data;
    } catch (error) {
      console.error(`[ERROR] Queue video gagal: ${error.response?.data || error.message}`);
      throw error;
    }
  }
  async txt2vid(params) {
    try {
      console.log(`[ACTION] txt2vid → Prompt: "${params.prompt.substring(0, 60)}..."`);
      const {
        key: currentKey
      } = await this._ensureValidSession({
        key: params.key
      });
      const payload = {
        prompt: params.prompt,
        videoMode: "text-to-video",
        aspectRatio: params.aspectRatio || "9:16",
        resolution: params.resolution || "480p",
        duration: params.duration || "5",
        model: params.model || "wan-video",
        modelType: params.model || "wan-video",
        requiredCredits: 4
      };
      const task = await this._queueVideo(payload);
      console.log(`[SUCCESS] txt2vid berhasil. taskId: ${task.taskId}`);
      return {
        ...task,
        key: currentKey
      };
    } catch (error) {
      console.error(`[ERROR] txt2vid gagal: ${error.message}`);
      throw error;
    }
  }
  async img2vid(params) {
    try {
      console.log(`[ACTION] img2vid → Prompt: "${params.prompt.substring(0, 60)}..."`);
      const {
        key: currentKey
      } = await this._ensureValidSession({
        key: params.key
      });
      const imageBuffer = await this._downloadOrParseImage(params.imageUrl);
      const fileName = `upload-start-${Date.now()}-edited-image-${this._random()}.jpg`;
      const uploadedImageUrl = await this._uploadImage(imageBuffer, fileName);
      const payload = {
        prompt: params.prompt,
        image: uploadedImageUrl,
        imageUploadMode: params.imageUploadMode || "start",
        videoMode: "image-to-video",
        aspectRatio: params.aspectRatio || "9:16",
        resolution: params.resolution || "480p",
        duration: params.duration || "5",
        model: params.model || "wan-video",
        modelType: params.model || "wan-video",
        requiredCredits: 4
      };
      const task = await this._queueVideo(payload);
      console.log(`[SUCCESS] img2vid berhasil. taskId: ${task.taskId}`);
      return {
        ...task,
        key: currentKey
      };
    } catch (error) {
      console.error(`[ERROR] img2vid gagal: ${error.message}`);
      throw error;
    }
  }
  async status(params) {
    try {
      console.log(`[ACTION] status → task_id: ${params.task_id}`);
      const {
        key: currentKey
      } = await this._ensureValidSession({
        key: params.key
      });
      const response = await this.api.get(`/video-generation/progress/${params.task_id}`);
      console.log(`[SUCCESS] Status: ${response.data.status || "unknown"}`);
      return {
        ...response.data,
        key: currentKey
      };
    } catch (error) {
      console.error(`[ERROR] status gagal: ${error.response?.data || error.message}`);
      throw error;
    }
  }
  async credits(params) {
    try {
      console.log(`[ACTION] credits → Mengecek kredit...`);
      const {
        key: currentKey
      } = await this._ensureValidSession({
        key: params.key
      });
      const response = await this.api.get("/user/credits");
      const credits = response.data.data.credits;
      console.log(`[SUCCESS] Kredit tersisa: ${credits}`);
      return {
        ...response.data.data,
        key: currentKey
      };
    } catch (error) {
      console.error(`[ERROR] credits gagal: ${error.response?.data || error.message}`);
      throw error;
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
  const api = new IMideoAPI();
  try {
    let response;
    switch (action) {
      case "register":
        response = await api.register();
        break;
      case "txt2vid":
        if (!params.prompt) return res.status(400).json({
          error: "prompt wajib"
        });
        response = await api.txt2vid(params);
        break;
      case "img2vid":
        if (!params.imageUrl || !params.prompt) return res.status(400).json({
          error: "imageUrl & prompt wajib"
        });
        response = await api.img2vid(params);
        break;
      case "status":
        if (!params.task_id) return res.status(400).json({
          error: "task_id wajib"
        });
        response = await api.status(params);
        break;
      case "credits":
        response = await api.credits(params);
        break;
      default:
        return res.status(400).json({
          error: `Action tidak valid: ${action}. Gunakan: register, txt2vid, img2vid, status, credits`
        });
    }
    res.status(200).json(response);
  } catch (error) {
    console.error(`[FATAL] Action '${action}' gagal: ${error.message}`);
    res.status(500).json({
      error: error.message
    });
  }
}
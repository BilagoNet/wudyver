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
import FormData from "form-data";
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
    console.error(`Gagal membaca cookie untuk ${url}: ${e.message}`);
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
      const response = await this.client.get("/mails/v9", {
        params: {
          action: "create"
        }
      });
      return response.data?.email;
    } catch (error) {
      console.error(`[ERROR] Gagal dalam 'WudysoftAPI.createEmail': ${error.message}`);
      throw error;
    }
  }
  async checkMessagesSoro2(email) {
    try {
      const response = await this.client.get("/mails/v9", {
        params: {
          action: "message",
          email: email
        }
      });
      const content = response.data?.data?.[0]?.text_content;
      if (content) {
        const match = content.match(/Your verification code is: (\d{6})/);
        return match ? match[1] : null;
      }
      return null;
    } catch (error) {
      console.error(`[ERROR] Gagal dalam 'WudysoftAPI.checkMessages' untuk email ${email}: ${error.message}`);
      return null;
    }
  }
  async createPaste(title, content) {
    try {
      const response = await this.client.get("/tools/paste/v1", {
        params: {
          action: "create",
          title: title,
          content: content
        }
      });
      return response.data?.key || null;
    } catch (error) {
      console.error(`[ERROR] Gagal dalam 'WudysoftAPI.createPaste': ${error.message}`);
      throw error;
    }
  }
  async getPaste(key) {
    try {
      const response = await this.client.get("/tools/paste/v1", {
        params: {
          action: "get",
          key: key
        }
      });
      return response.data?.content || null;
    } catch (error) {
      console.error(`[ERROR] Gagal dalam 'WudysoftAPI.getPaste' untuk kunci ${key}: ${error.message}`);
      return null;
    }
  }
  async listPastes() {
    try {
      const response = await this.client.get("/tools/paste/v1", {
        params: {
          action: "list"
        }
      });
      return response.data || [];
    } catch (error) {
      console.error(`[ERROR] Gagal dalam 'WudysoftAPI.listPastes': ${error.message}`);
      return [];
    }
  }
  async delPaste(key) {
    try {
      const response = await this.client.get("/tools/paste/v1", {
        params: {
          action: "delete",
          key: key
        }
      });
      return response.data || null;
    } catch (error) {
      console.error(`[ERROR] Gagal dalam 'WudysoftAPI.delPaste' untuk kunci ${key}: ${error.message}`);
      return false;
    }
  }
}
class Soro2API {
  constructor() {
    this.cookieJar = new CookieJar();
    this.config = {
      baseURL: "https://soro2.ai",
      endpoints: {
        csrf: "/api/auth/csrf",
        emailVerification: "/api/auth/email-verification",
        callback: "/api/auth/callback/email-verification",
        session: "/api/auth/session",
        userInfo: "/api/get-user-info",
        dailyCredits: "/api/claim-daily-credits",
        upload: "/api/upload",
        imageCreate: "/api/image-generation-nano-banana/create",
        imageStatus: "/api/image-generation-nano-banana/status",
        videoCreate: "/api/video-generation-sora2/create",
        videoStatus: "/api/video-generation-sora2/status"
      },
      models: {
        "nano-banana": {
          create: "/api/image-generation-nano-banana/create",
          status: "/api/image-generation-nano-banana/status",
          defaults: {
            output_format: "png",
            image_size: "auto",
            enable_translation: false,
            steps: 20,
            guidance_scale: 7.5,
            is_public: false
          }
        },
        sora2: {
          create: "/api/video-generation-sora2/create",
          status: "/api/video-generation-sora2/status",
          defaults: {
            aspect_ratio: "portrait",
            modelType: "fast",
            generationType: "text",
            isPublic: false
          }
        }
      }
    };
    const commonHeaders = {
      "accept-language": "id-ID",
      "cache-control": "no-cache",
      pragma: "no-cache",
      priority: "u=1, i",
      "sec-ch-ua": '"Chromium";v="127", "Not)A;Brand";v="99", "Microsoft Edge Simulate";v="127", "Lemur";v="127"',
      "sec-ch-ua-mobile": "?1",
      "sec-ch-ua-platform": '"Android"',
      "user-agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Mobile Safari/537.36",
      ...SpoofHead()
    };
    this.api = wrapper(axios.create({
      baseURL: this.config.baseURL,
      jar: this.cookieJar,
      withCredentials: true,
      headers: {
        ...commonHeaders,
        accept: "*/*",
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin"
      }
    }));
    this.wudysoft = new WudysoftAPI();
  }
  _random() {
    return Math.random().toString(36).substring(2, 12);
  }
  async _getTokenFromKey(key) {
    console.log(`Proses: Memuat sesi dari kunci: ${key}`);
    const savedSession = await this.wudysoft.getPaste(key);
    if (!savedSession) throw new Error(`Sesi dengan kunci "${key}" tidak ditemukan.`);
    try {
      const sessionData = JSON.parse(savedSession);
      if (!sessionData.session_token) throw new Error("Session token tidak valid dalam sesi tersimpan.");
      console.log("Proses: Sesi berhasil dimuat.");
      return sessionData;
    } catch (e) {
      throw new Error(`Gagal memuat sesi: ${e.message}`);
    }
  }
  async _performRegistration() {
    console.log("\n====== MEMULAI PROSES REGISTRASI SORO2.AI ======");
    const email = await this.wudysoft.createEmail();
    if (!email) throw new Error("Gagal membuat email sementara.");
    console.log(`Proses: Email dibuat: ${email}`);
    await this.api.get(this.config.endpoints.csrf);
    const cookies = await this.cookieJar.getCookies(this.config.baseURL);
    const csrfCookie = cookies.find(c => c.key === "__Host-authjs.csrf-token");
    if (!csrfCookie) throw new Error("Gagal mendapatkan CSRF token");
    const csrfToken = csrfCookie.value.split("|")[0];
    console.log("Proses: CSRF token didapatkan");
    await this.api.post(this.config.endpoints.emailVerification, {
      email: email
    });
    console.log("Proses: Permintaan kode verifikasi dikirim");
    let verificationCode = null;
    for (let i = 0; i < 60; i++) {
      verificationCode = await this.wudysoft.checkMessagesSoro2(email);
      if (verificationCode) break;
      console.log(`Proses: Menunggu kode verifikasi... (${i + 1}/60)`);
      await sleep(3e3);
    }
    if (!verificationCode) throw new Error("Gagal menemukan kode verifikasi setelah 3 menit.");
    console.log(`Proses: Kode verifikasi ditemukan: ${verificationCode}`);
    const verifyPayload = {
      email: email,
      code: verificationCode,
      redirect: false,
      csrfToken: csrfToken,
      callbackUrl: "https://soro2.ai/ai-video/sora2"
    };
    await this.api.post(this.config.endpoints.callback, new URLSearchParams(verifyPayload));
    await this.api.get(this.config.endpoints.session);
    const sessionCookies = await this.cookieJar.getCookies(this.config.baseURL);
    const sessionTokenCookie = sessionCookies.find(c => c.key === "__Secure-authjs.session-token");
    if (!sessionTokenCookie) throw new Error("Gagal mendapatkan session token");
    await this.api.post(this.config.endpoints.userInfo, {}, {
      data: ""
    });
    await this.api.post(this.config.endpoints.dailyCredits, {}, {
      data: ""
    });
    console.log("\n[SUCCESS] Registrasi Soro2.ai berhasil!");
    const sessionData = {
      session_token: sessionTokenCookie.value,
      email: email
    };
    return sessionData;
  }
  async register() {
    try {
      console.log("Proses: Mendaftarkan sesi baru Soro2.ai...");
      const sessionData = await this._performRegistration();
      const sessionToSave = JSON.stringify(sessionData);
      const sessionTitle = `soro2-session-${this._random()}`;
      const newKey = await this.wudysoft.createPaste(sessionTitle, sessionToSave);
      if (!newKey) throw new Error("Gagal menyimpan sesi baru.");
      console.log(`-> Sesi baru berhasil didaftarkan. Kunci Anda: ${newKey}`);
      return {
        key: newKey,
        email: sessionData.email
      };
    } catch (error) {
      console.error(`Proses registrasi gagal: ${error.message}`);
      throw error;
    }
  }
  async _ensureValidSession({
    key
  }) {
    let sessionData;
    let currentKey = key;
    if (key) {
      try {
        sessionData = await this._getTokenFromKey(key);
      } catch (error) {
        console.warn(`[PERINGATAN] ${error.message}. Mendaftarkan sesi baru...`);
      }
    }
    if (!sessionData) {
      console.log("Proses: Kunci tidak valid, mendaftarkan sesi baru...");
      const newSession = await this.register();
      currentKey = newSession.key;
      sessionData = await this._getTokenFromKey(currentKey);
    }
    await this.cookieJar.setCookie(`__Secure-authjs.session-token=${sessionData.session_token}; Domain=.soro2.ai; Path=/; Secure; SameSite=Lax`, this.config.baseURL);
    return {
      sessionData: sessionData,
      key: currentKey
    };
  }
  async list_key() {
    try {
      console.log("Proses: Mengambil daftar semua kunci sesi...");
      const allPastes = await this.wudysoft.listPastes();
      return allPastes.filter(paste => paste.title && paste.title.startsWith("soro2-session-")).map(paste => paste.key);
    } catch (error) {
      console.error("Gagal mengambil daftar kunci:", error.message);
      throw error;
    }
  }
  async del_key({
    key
  }) {
    if (!key) {
      console.error("Kunci tidak disediakan untuk dihapus.");
      return false;
    }
    try {
      console.log(`Proses: Mencoba menghapus kunci: ${key}`);
      const success = await this.wudysoft.delPaste(key);
      console.log(success ? `Kunci ${key} berhasil dihapus.` : `Gagal menghapus kunci ${key}.`);
      return success;
    } catch (error) {
      console.error(`Terjadi error saat menghapus kunci ${key}:`, error.message);
      throw error;
    }
  }
  async _uploadImage(imageBuffer) {
    try {
      console.log("Proses: Mengunggah gambar...");
      const form = new FormData();
      form.append("file", imageBuffer, {
        filename: `image-${Date.now()}.jpg`,
        contentType: "image/jpeg"
      });
      const response = await this.api.post(this.config.endpoints.upload, form, {
        headers: form.getHeaders()
      });
      console.log("Proses: Gambar berhasil diunggah.");
      return response.data.url;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message;
      console.error(`Proses unggah gambar gagal: ${errorMessage}`);
      throw error;
    }
  }
  async txt2img({
    key,
    prompt,
    width = 1024,
    height = 1024
  }) {
    try {
      const {
        key: currentKey
      } = await this._ensureValidSession({
        key: key
      });
      console.log(`Proses: Membuat gambar dari teks...`);
      const payload = {
        prompt: prompt,
        width: width,
        height: height,
        ...this.config.models["nano-banana"].defaults
      };
      const response = await this.api.post(this.config.models["nano-banana"].create, payload);
      console.log("Proses: Tugas txt2img berhasil dibuat.");
      return {
        ...response.data,
        key: currentKey
      };
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message;
      console.error(`Proses txt2img gagal: ${errorMessage}`);
      throw new Error(errorMessage);
    }
  }
  async img2img({
    key,
    prompt,
    imageUrl,
    width = 1024,
    height = 1024
  }) {
    try {
      const {
        key: currentKey
      } = await this._ensureValidSession({
        key: key
      });
      console.log(`Proses: Membuat gambar dari gambar...`);
      let imageUrls = Array.isArray(imageUrl) ? imageUrl : [imageUrl];
      const uploadedUrls = [];
      for (const url of imageUrls) {
        let imageBuffer;
        if (Buffer.isBuffer(url)) {
          imageBuffer = url;
        } else if (typeof url === "string" && url.startsWith("http")) {
          const response = await axios.get(url, {
            responseType: "arraybuffer"
          });
          imageBuffer = Buffer.from(response.data);
        } else {
          imageBuffer = Buffer.from(url.replace(/^data:image\/\w+;base64,/, ""), "base64");
        }
        const uploadedUrl = await this._uploadImage(imageBuffer);
        uploadedUrls.push(uploadedUrl);
      }
      const payload = {
        prompt: prompt,
        image_urls: uploadedUrls,
        width: width,
        height: height,
        ...this.config.models["nano-banana"].defaults
      };
      const response = await this.api.post(this.config.models["nano-banana"].create, payload);
      console.log("Proses: Tugas img2img berhasil dibuat.");
      return {
        ...response.data,
        key: currentKey
      };
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message;
      console.error(`Proses img2img gagal: ${errorMessage}`);
      throw new Error(errorMessage);
    }
  }
  async txt2vid({
    key,
    prompt,
    aspect_ratio = "portrait"
  }) {
    try {
      const {
        key: currentKey
      } = await this._ensureValidSession({
        key: key
      });
      console.log(`Proses: Membuat video dari teks...`);
      const payload = {
        prompt: prompt,
        aspect_ratio: aspect_ratio,
        ...this.config.models["sora2"].defaults
      };
      const response = await this.api.post(this.config.models["sora2"].create, payload);
      console.log("Proses: Tugas txt2vid berhasil dibuat.");
      return {
        ...response.data,
        key: currentKey
      };
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message;
      console.error(`Proses txt2vid gagal: ${errorMessage}`);
      throw new Error(errorMessage);
    }
  }
  async status({
    key,
    task_id,
    video = true
  }) {
    try {
      const {
        key: currentKey
      } = await this._ensureValidSession({
        key: key
      });
      const endpoint = video ? this.config.models["sora2"].status : this.config.models["nano-banana"].status;
      console.log(`Proses: Mengecek status untuk task_id ${task_id}...`);
      const response = await this.api.post(endpoint, {
        taskId: task_id
      });
      console.log("Proses: Status berhasil didapatkan.");
      return {
        ...response.data,
        key: currentKey
      };
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message;
      console.error(`Proses status gagal: ${errorMessage}`);
      throw new Error(errorMessage);
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
  const api = new Soro2API();
  try {
    let response;
    switch (action) {
      case "register":
        response = await api.register();
        break;
      case "txt2img":
        if (!params.prompt) {
          return res.status(400).json({
            error: "Parameter 'prompt' wajib diisi untuk action 'txt2img'."
          });
        }
        response = await api.txt2img(params);
        break;
      case "img2img":
        if (!params.imageUrl) {
          return res.status(400).json({
            error: "Parameter 'imageUrl' wajib diisi untuk action 'img2img'."
          });
        }
        response = await api.img2img(params);
        break;
      case "txt2vid":
        if (!params.prompt) {
          return res.status(400).json({
            error: "Parameter 'prompt' wajib diisi untuk action 'txt2vid'."
          });
        }
        response = await api.txt2vid(params);
        break;
      case "status":
        if (!params.key || !params.task_id) {
          return res.status(400).json({
            error: "Parameter 'key' dan 'task_id' wajib diisi untuk action 'status'."
          });
        }
        response = await api.status(params);
        break;
      case "list_key":
        response = await api.list_key();
        break;
      case "del_key":
        if (!params.key) {
          return res.status(400).json({
            error: "Parameter 'key' wajib diisi untuk action 'del_key'."
          });
        }
        response = await api.del_key(params);
        break;
      default:
        return res.status(400).json({
          error: `Action tidak valid: ${action}. Action yang didukung: 'register', 'txt2img', 'img2img', 'txt2vid', 'status', 'list_key', 'del_key'.`
        });
    }
    return res.status(200).json(response);
  } catch (error) {
    console.error(`[FATAL ERROR] Kegagalan pada action '${action}':`, error);
    return res.status(500).json({
      error: error.message || "Terjadi kesalahan internal pada server."
    });
  }
}
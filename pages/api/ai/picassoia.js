import axios from "axios";
import CryptoJS from "crypto-js";
import {
  CookieJar
} from "tough-cookie";
import {
  wrapper
} from "axios-cookiejar-support";
const COLORS = {
  reset: "[0m",
  bright: "[1m",
  dim: "[2m",
  red: "[31m",
  green: "[32m",
  yellow: "[33m",
  blue: "[34m",
  cyan: "[36m",
  white: "[37m",
  gray: "[90m"
};
const VALID_ASPECT_RATIOS = ["match_input_image", "1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"];
class Logger {
  constructor(prefix = "PicassoAI") {
    this.prefix = prefix;
  }
  _ts() {
    return new Date().toISOString().split("T")[1].slice(0, -1);
  }
  _fmt(lvl, col, tag, msg) {
    return `${COLORS.gray}[${this._ts()}]${COLORS.reset} ${col}[${lvl}]${COLORS.reset} ${COLORS.cyan}[${tag}]${COLORS.reset} ${msg}`;
  }
  info(tag, msg, data = null) {
    console.log(this._fmt("INFO", COLORS.green, tag, msg));
    if (data) console.log(COLORS.dim, JSON.stringify(data, null, 2), COLORS.reset);
  }
  warn(tag, msg) {
    console.log(this._fmt("WARN", COLORS.yellow, tag, msg));
  }
  error(tag, msg, err = null) {
    console.log(this._fmt("ERROR", COLORS.red, tag, msg));
    if (err?.response) {
      console.log(`${COLORS.red}  >>> St: ${err.response.status}${COLORS.reset}`);
      console.log(`${COLORS.red}  >>> Dt: ${JSON.stringify(err.response.data, null, 2)}${COLORS.reset}`);
    } else if (err) console.log(`${COLORS.red}  >>> ${err.message || err}${COLORS.reset}`);
  }
  debug(tag, msg, data = null) {
    if (true) {
      console.log(this._fmt("DEBUG", COLORS.blue, tag, msg));
      if (data) console.log(COLORS.gray, JSON.stringify(data, null, 2), COLORS.reset);
    }
  }
}

function decrypt(cipher, key) {
  try {
    return JSON.parse(CryptoJS.AES.decrypt(cipher, key).toString(CryptoJS.enc.Utf8));
  } catch {
    return null;
  }
}

function encrypt(data, key) {
  try {
    return CryptoJS.AES.encrypt(JSON.stringify(data), key).toString();
  } catch {
    return null;
  }
}

function parseField(f) {
  if (!f) return null;
  const k = Object.keys(f)[0],
    v = f[k];
  if (k === "mapValue") {
    const r = {};
    for (const i in v.fields) r[i] = parseField(v.fields[i]);
    return r;
  }
  if (k === "arrayValue") return v.values ? v.values.map(parseField) : [];
  return k.endsWith("Value") ? v : null;
}
class PicassoAI {
  constructor() {
    this.log = new Logger();
    this.jar = new CookieJar();
    this.client = wrapper(axios.create({
      jar: this.jar,
      headers: {
        accept: "*/*",
        "accept-language": "id-ID",
        origin: "https://picassoia.com",
        referer: "https://picassoia.com/",
        "sec-ch-ua": '"Chromium";v="127", "Not)A;Brand";v="99", "Microsoft Edge Simulate";v="127", "Lemur";v="127"',
        "sec-ch-ua-mobile": "?1",
        "sec-ch-ua-platform": '"Android"',
        "user-agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Mobile Safari/537.36",
        "x-client-data": "CLjxygE=",
        "x-client-version": "Chrome/JsCore/9.10.0/FirebaseCore-web",
        "x-firebase-gmpid": "1:848355355730:web:5a018aca672793fb19438b"
      }
    }));
    this.key = "AIzaSyDRaQ_WwRJPPLeHIweKj3rLwICqPa2XZfQ";
    this.secret = "2d9adfd8a1e5c57e82731e9d4c6a1cffae41b546d1fcbaf119366cc0926071db";
    this.uid = null;
    this.token = null;
  }
  validateAspectRatio(ratio) {
    if (!ratio) return true;
    if (!VALID_ASPECT_RATIOS.includes(ratio)) {
      this.log.warn("Validate", `Invalid aspect_ratio: ${ratio}. Valid options: ${VALID_ASPECT_RATIOS.join(", ")}`);
      return false;
    }
    return true;
  }
  async auth() {
    try {
      if (this.token) return true;
      this.log.info("Auth", "Signing up...");
      const email = `${Math.random().toString(36).substring(2)}@emailhook.site`;
      const {
        data
      } = await this.client.post(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${this.key}`, {
        returnSecureToken: true,
        email: email,
        password: email
      });
      this.token = data.idToken;
      this.uid = data.localId;
      return true;
    } catch (e) {
      this.log.error("Auth", "Failed", e);
      return false;
    }
  }
  async up(input) {
    try {
      this.log.info("Upload", "Uploading image...");
      let buf;
      if (Buffer.isBuffer(input)) buf = input;
      else if (input.startsWith("http")) buf = (await axios.get(input, {
        responseType: "arraybuffer"
      })).data;
      else if (input.startsWith("data:")) buf = Buffer.from(input.split(",")[1], "base64");
      else buf = Buffer.from(input, "base64");
      const name = `text-to-image/${this.uid}/p-image-edit/client-uploads/${Date.now()}-init`;
      const boundary = "3677459144467556406621357147072393";
      const meta = JSON.stringify({
        name: name,
        contentType: "image/jpeg"
      });
      const payload = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=utf-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: image/jpeg\r\n\r\n`), buf, Buffer.from(`\r\n--${boundary}--`)]);
      await this.client.post(`https://firebasestorage.googleapis.com/v0/b/picassoai/o?name=${encodeURIComponent(name)}`, payload, {
        headers: {
          Authorization: `Firebase ${this.token}`,
          "Content-Type": `multipart/related; boundary=${boundary}`,
          "x-goog-upload-protocol": "multipart"
        }
      });
      const {
        data
      } = await this.client.get(`https://firebasestorage.googleapis.com/v0/b/picassoai/o/${encodeURIComponent(name)}`, {
        headers: {
          Authorization: `Firebase ${this.token}`
        }
      });
      return `https://firebasestorage.googleapis.com/v0/b/picassoai/o/${encodeURIComponent(name)}?alt=media&token=${data.downloadTokens}`;
    } catch (e) {
      this.log.error("Upload", "Failed", e);
      return null;
    }
  }
  async task(payload, model) {
    try {
      this.log.info("Task", `Invoking ${model}`);
      const enc = encrypt(payload, this.secret);
      await this.client.post("https://us-central1-picassoai.cloudfunctions.net/invoke_ai", {
        data: {
          uid: this.uid,
          d: enc
        }
      }, {
        headers: {
          Authorization: `Bearer ${this.token}`
        }
      });
      return true;
    } catch (e) {
      this.log.error("Task", "Failed", e);
      return false;
    }
  }
  async poll() {
    this.log.info("Poll", "Querying Firestore...");
    const url = "https://firestore.googleapis.com/v1/projects/picassoai/databases/(default)/documents:runQuery";
    const query = {
      structuredQuery: {
        from: [{
          collectionId: "predicts"
        }],
        where: {
          fieldFilter: {
            field: {
              fieldPath: "uid"
            },
            op: "EQUAL",
            value: {
              stringValue: this.uid
            }
          }
        },
        orderBy: [{
          field: {
            fieldPath: "created_at"
          },
          direction: "DESCENDING"
        }],
        limit: 1
      }
    };
    const start = Date.now();
    while (Date.now() - start < 6e4) {
      try {
        const {
          data
        } = await this.client.post(url, query, {
          headers: {
            Authorization: `Bearer ${this.token}`
          }
        });
        if (data?.[0]?.document?.fields) {
          const doc = {};
          for (const k in data[0].document.fields) doc[k] = parseField(data[0].document.fields[k]);
          const status = doc.status || doc.prediction_data?.status;
          process.stdout.write(`\r${COLORS.yellow}[Poll] Status: ${status}...${COLORS.reset}`);
          if (status === "succeeded") {
            console.log("");
            let imgs = [];
            if (doc.output?.length) imgs = doc.output.map(x => x.url);
            else if (doc.prediction_data?.output?.length) imgs = doc.prediction_data.output;
            if (imgs.length) return imgs;
          } else if (status === "failed") return [];
        }
      } catch {}
      await new Promise(r => setTimeout(r, 3e3));
    }
    return [];
  }
  async generate({
    prompt,
    imageUrl,
    aspect_ratio,
    ...rest
  }) {
    this.log.info("Core", "--- New Generation ---");
    if (aspect_ratio && !this.validateAspectRatio(aspect_ratio)) {
      return {
        success: false,
        error: `Invalid aspect_ratio. Valid options: ${VALID_ASPECT_RATIOS.join(", ")}`
      };
    }
    if (!await this.auth()) return {
      success: false,
      error: "Auth failed"
    };
    let payload, model;
    if (imageUrl) {
      model = "prunaai/p-image-edit";
      const imageUrls = Array.isArray(imageUrl) ? imageUrl : [imageUrl];
      const uploadedUrls = [];
      for (const url of imageUrls) {
        this.log.info("Upload", `Processing image ${uploadedUrls.length + 1}/${imageUrls.length}`);
        const upUrl = await this.up(url);
        if (!upUrl) {
          return {
            success: false,
            error: `Upload failed for image ${uploadedUrls.length + 1}`
          };
        }
        uploadedUrls.push(upUrl);
      }
      payload = {
        model_input: {
          model: model,
          input: {
            turbo: true,
            images: uploadedUrls,
            prompt: prompt || "",
            aspect_ratio: aspect_ratio || "match_input_image",
            disable_safety_checker: true,
            ...rest
          }
        },
        config: {
          folder_bucket_to_save_predict: `text-to-image/${this.uid}/p-image-edit`,
          is_llm: false,
          category: "text-to-image",
          model: model,
          token_quantity: .2
        }
      };
    } else {
      model = "black-forest-labs/flux-schnell";
      payload = {
        model_input: {
          model: model,
          input: {
            prompt: prompt,
            go_fast: true,
            megapixels: "1",
            num_outputs: 2,
            aspect_ratio: aspect_ratio || "1:1",
            output_format: "webp",
            output_quality: 80,
            num_inference_steps: 4,
            disable_safety_checker: true,
            ...rest
          }
        },
        config: {
          folder_bucket_to_save_predict: `text-to-image/${this.uid}/flux-schnell`,
          is_llm: false,
          category: "text-to-image",
          model: model,
          token_quantity: .1
        }
      };
    }
    if (await this.task(payload, model)) {
      const images = await this.poll();
      return images.length ? {
        success: true,
        images: images,
        model: model
      } : {
        success: false,
        error: "No result"
      };
    }
    return {
      success: false,
      error: "Task failed"
    };
  }
}
export default async function handler(req, res) {
  const params = req.method === "GET" ? req.query : req.body;
  if (!params.prompt && !params.imageUrl) {
    return res.status(400).json({
      error: "Parameter 'prompt' atau 'imageUrl' diperlukan"
    });
  }
  const api = new PicassoAI();
  try {
    const data = await api.generate(params);
    return res.status(200).json(data);
  } catch (error) {
    const errorMessage = error.message || "Terjadi kesalahan saat memproses.";
    return res.status(500).json({
      error: errorMessage
    });
  }
}
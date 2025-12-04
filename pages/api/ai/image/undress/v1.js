import axios from "axios";
import crypto from "crypto";
class UndressAI {
  constructor() {
    this.apiKey = "AIzaSyD_omM03MyUQdBNAQ3lW0RzjRS5x29GDnM";
    this.authUrl = "https://identitytoolkit.googleapis.com/v1/accounts";
    this.apiHosts = ["https://kkz3mmrmm6.us-east-1.awsapprunner.com", "https://awh5tmpjds.us-east-1.awsapprunner.com"];
    this.apiUrl = this.apiHosts[Math.floor(Math.random() * this.apiHosts.length)];
    this.maskUrl = "https://mkv2.undressaitools.net";
    this.genUrl = "https://igv2.undressaitools.net";
    this.headers = {
      "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Mobile Safari/537.36",
      "Accept-Language": "id-ID",
      Origin: "https://undressaitools.net",
      Referer: "https://undressaitools.net/",
      "x-client-version": "Chrome/JsCore/10.12.1/FirebaseCore-web",
      "x-firebase-gmpid": "1:786150664182:web:f2c1c95933d234095a09d7",
      "sec-ch-ua": '"Chromium";v="127", "Not)A;Brand";v="99", "Microsoft Edge Simulate";v="127", "Lemur";v="127"',
      "sec-ch-ua-mobile": "?1",
      "sec-ch-ua-platform": '"Android"'
    };
    this.basicAuth = "Basic cG9ybmdlbjpwb3JuZ2Vu";
  }
  log(msg) {
    console.log(`[UndressAI] ${new Date().toLocaleTimeString()} -> ${msg}`);
  }
  randHex(len) {
    return crypto.randomBytes(len).toString("hex");
  }
  genFp(uid) {
    const a = Math.floor(Math.random() * 9e15) + 1e15;
    const combined = uid + a.toString();
    const hash = crypto.createHash("md5").update(combined).digest("hex");
    return `${a}_${hash}`;
  }
  async sign() {
    try {
      const email = `${this.randHex(8)}-${this.randHex(4)}@emailhook.site`;
      const password = this.randHex(12) + "Aa1";
      this.log(`Signing up: ${email}`);
      const res = await axios.post(`${this.authUrl}:signUp?key=${this.apiKey}`, {
        returnSecureToken: true,
        email: email,
        password: password,
        clientType: "CLIENT_TYPE_WEB"
      }, {
        headers: this.headers
      });
      return res?.data;
    } catch (e) {
      this.log(`Sign Error: ${e.message}`);
      return null;
    }
  }
  async lookup(idToken) {
    try {
      this.log("Lookup account...");
      const res = await axios.post(`${this.authUrl}:lookup?key=${this.apiKey}`, {
        idToken: idToken
      }, {
        headers: this.headers
      });
      return res?.data?.users?.[0];
    } catch (e) {
      this.log(`Lookup Error: ${e.message}`);
      return null;
    }
  }
  async reg(uid, email) {
    try {
      this.log(`Registering to backend (${this.apiUrl})...`);
      const fingerprint = this.genFp(uid);
      const res = await axios.post(`${this.apiUrl}/users`, {
        user: {
          firebase_id: uid,
          email: email,
          product_enum: "UT",
          browser_fingerprint: fingerprint,
          metadata: {
            utm_source: "porndude",
            utm_content: "aiundress"
          }
        }
      }, {
        headers: {
          ...this.headers,
          Authorization: this.basicAuth,
          "Content-Type": "application/json"
        }
      });
      return res?.data?.user_id;
    } catch (e) {
      this.log(`Reg Error: ${e.response?.status} - ${JSON.stringify(e.response?.data)}`);
      return null;
    }
  }
  async bal(userId) {
    try {
      this.log(`Checking balance: ${userId}`);
      const res = await axios.get(`${this.apiUrl}/balance`, {
        params: {
          user_id: userId
        },
        headers: {
          ...this.headers,
          Authorization: this.basicAuth,
          "X-Client": "fantasy-new"
        }
      });
      const data = res?.data || [];
      const gem = data.find(x => x.amount >= 0) || {};
      return gem.amount ?? -1;
    } catch (e) {
      this.log(`Bal Error: ${e.message}`);
      return -1;
    }
  }
  async processImg(input) {
    try {
      if (Buffer.isBuffer(input)) return input.toString("base64");
      if (typeof input === "string") {
        if (input.startsWith("http")) {
          this.log("Fetching image...");
          const r = await axios.get(input, {
            responseType: "arraybuffer"
          });
          return Buffer.from(r.data).toString("base64");
        }
        return input.replace(/^data:image\/\w+;base64,/, "");
      }
      return null;
    } catch (e) {
      return null;
    }
  }
  async mask(userId, b64) {
    try {
      this.log("Generating mask...");
      const taskId = this.randHex(16);
      const res = await axios.post(`${this.maskUrl}/mask`, {
        task_id: taskId,
        image_base64: `data:image/jpeg;base64,${b64}`,
        user_id: userId,
        operation: "undress",
        continent: "NA",
        country: "US"
      }, {
        headers: {
          ...this.headers,
          Authorization: this.basicAuth
        }
      });
      return {
        tid: res?.data?.task_id || taskId,
        mask: res?.data?.mask_base64,
        orig: res?.data?.image_base64
      };
    } catch (e) {
      this.log(`Mask Error: ${e.message}`);
      throw e;
    }
  }
  async exec(p) {
    try {
      this.log("Executing undress...");
      const res = await axios.post(`${this.genUrl}/undress_get_resuls`, {
        uiid: p.tid,
        uid: p.uid,
        masks: p.mask,
        original: p.orig,
        operation: "undress",
        breast_size: 0,
        pubic_hair: 0,
        body_size: 0,
        product: "UT",
        image_format: "base64",
        prompt: p.prompt || "",
        watermark: "",
        quality: "low"
      }, {
        headers: {
          ...this.headers,
          Authorization: this.basicAuth
        }
      });
      if (res?.data?.code === 6100) return res.data.data;
      throw new Error(res?.data?.msg || "Gen Failed");
    } catch (e) {
      this.log(`Exec Error: ${e.message}`);
      throw e;
    }
  }
  async generate({
    prompt = "",
    imageUrl,
    ...rest
  }) {
    let user = null;
    let tryCount = 0;
    while (!user && tryCount < 5) {
      tryCount++;
      this.log(`--- Account Attempt #${tryCount} ---`);
      const s = await this.sign();
      if (!s?.localId) continue;
      const l = await this.lookup(s.idToken);
      if (!l) continue;
      const uid = await this.reg(s.localId, s.email);
      if (!uid) continue;
      const c = await this.bal(uid);
      this.log(`Credit: ${c}`);
      if (c >= 0) user = {
        uid: uid,
        email: s.email
      };
    }
    if (!user) throw new Error("Failed to get valid account");
    const b64 = await this.processImg(imageUrl);
    if (!b64) throw new Error("Bad Image");
    const m = await this.mask(user.uid, b64);
    const finalB64 = await this.exec({
      tid: m.tid,
      uid: user.uid,
      mask: m.mask,
      orig: m.orig || `data:image/jpeg;base64,${b64}`,
      prompt: prompt,
      ...rest
    });
    const buffer = Buffer.from(finalB64, "base64");
    return buffer;
  }
}
export default async function handler(req, res) {
  const params = req.method === "GET" ? req.query : req.body;
  if (!params.imageUrl) {
    return res.status(400).json({
      error: "Parameter 'imageUrl' diperlukan"
    });
  }
  const api = new UndressAI();
  try {
    const result = await api.generate(params);
    res.setHeader("Content-Type", "image/png");
    return res.status(200).send(result);
  } catch (error) {
    const errorMessage = error.message || "Terjadi kesalahan saat memproses URL";
    return res.status(500).json({
      error: errorMessage
    });
  }
}
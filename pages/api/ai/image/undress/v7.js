import axios from "axios";
import apiConfig from "@/configs/apiConfig";
class AiDeepNude {
  constructor() {
    this.baseApi = "https://api.ai-deep-nude.com";
    this.mailApi = `https://${apiConfig.DOMAIN_URL}/api/mails/v9`;
    this.headers = {
      accept: "*/*",
      "accept-language": "id-ID",
      "content-type": "application/json",
      origin: "https://ai-deep-nude.com",
      referer: "https://ai-deep-nude.com/",
      "user-agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Mobile Safari/537.36",
      priority: "u=1, i"
    };
    this.cookies = "";
  }
  log(msg) {
    console.log(`[${new Date().toLocaleTimeString()}] > ${msg}`);
  }
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  async procImg(source) {
    try {
      this.log("Processing image source...");
      let buffer;
      let mime = "image/jpeg";
      if (Buffer.isBuffer(source)) {
        buffer = source;
      } else if (typeof source === "string") {
        if (source.startsWith("http")) {
          const res = await axios.get(source, {
            responseType: "arraybuffer"
          });
          buffer = Buffer.from(res.data);
          const contentType = res.headers["content-type"];
          if (contentType) mime = contentType;
        } else if (source.startsWith("data:image")) {
          return source;
        } else {
          buffer = Buffer.from(source, "base64");
        }
      } else {
        throw new Error("Invalid image format");
      }
      return `data:${mime};base64,${buffer.toString("base64")}`;
    } catch (e) {
      throw new Error(`Image processing failed: ${e.message}`);
    }
  }
  async mkMail() {
    try {
      this.log("Creating temp email...");
      const {
        data
      } = await axios.get(`${this.mailApi}?action=create`);
      const email = data?.email || data?.data?.email;
      if (!email) throw new Error("Failed to create email");
      this.log(`Email created: ${email}`);
      return email;
    } catch (e) {
      this.log(`Create mail error: ${e.message}`);
      throw e;
    }
  }
  async reqLink(email) {
    try {
      this.log(`Requesting magic link for ${email}...`);
      await axios.post(`${this.baseApi}/auth/magic-link`, {
        email: email
      }, {
        headers: this.headers
      });
      this.log("Magic link request sent.");
      return true;
    } catch (e) {
      this.log(`Req link error: ${e.message}`);
      throw e;
    }
  }
  async getUrl(email) {
    this.log("Polling for verification email...");
    let attempts = 0;
    const max = 60;
    while (attempts < max) {
      try {
        await this.sleep(3e3);
        attempts++;
        const {
          data
        } = await axios.get(`${this.mailApi}?action=message&email=${email}`);
        const msgs = data?.data || [];
        const targetMsg = msgs.find(m => m.text_content?.includes("api.ai-deep-nude.com/auth/magic-login"));
        if (targetMsg) {
          const match = targetMsg.text_content.match(/(https:\/\/api\.ai-deep-nude\.com\/auth\/magic-login\?token=[^\s\n]+)/);
          if (match?.[1]) {
            this.log("Verification link found!");
            return match[1];
          }
        }
      } catch (e) {}
    }
    throw new Error("Polling timeout: Verification email not received.");
  }
  async sign(url) {
    try {
      this.log("Verifying token...");
      const res = await axios.get(url, {
        headers: this.headers,
        maxRedirects: 0,
        validateStatus: status => status >= 200 && status < 400
      });
      const setCookie = res.headers["set-cookie"];
      if (!setCookie) throw new Error("No cookies received from verification");
      this.cookies = setCookie.map(c => c.split(";")[0]).join("; ");
      this.log("Login successful, session captured.");
      return true;
    } catch (e) {
      this.log(`Sign error: ${e.message}`);
      throw e;
    }
  }
  async generate({
    prompt,
    imageUrl,
    type,
    ...rest
  }) {
    try {
      this.log("=== Starting Task ===");
      const email = await this.mkMail();
      await this.reqLink(email);
      const verifyUrl = await this.getUrl(email);
      await this.sign(verifyUrl);
      let payload = {};
      if (imageUrl) {
        this.log("Mode: Undress (Image Generation)");
        const base64Img = await this.procImg(imageUrl);
        payload = {
          image: base64Img,
          type: type || "WOMAN",
          mask: rest.mask || null,
          source_img: rest.source_img || "",
          prompt: prompt || ""
        };
      } else {
        this.log("Mode: Txt2Img (Prompt Generation)");
        if (!prompt) throw new Error("Prompt is required for text-to-image mode.");
        const allowedTypes = ["REAL_PROMPT", "HENTAI_PROMPT"];
        const selectedType = allowedTypes.includes(type) ? type : "REAL_PROMPT";
        payload = {
          prompt: prompt,
          type: selectedType
        };
      }
      this.log("Sending generation request...");
      const {
        data
      } = await axios.post(`${this.baseApi}/generation`, payload, {
        headers: {
          ...this.headers,
          cookie: this.cookies
        }
      });
      this.log("Generation completed.");
      const resultData = typeof data === "object" ? JSON.stringify(data) : data;
      return Buffer.from(resultData, "base64");
    } catch (e) {
      const errMsg = e.response?.data ? JSON.stringify(e.response.data) : e.message;
      this.log(`Generate Error: ${errMsg}`);
      return null;
    }
  }
}
export default async function handler(req, res) {
  const params = req.method === "GET" ? req.query : req.body;
  if (!params.imageUrl && !params.prompt) {
    return res.status(400).json({
      error: "Parameter 'imageUrl' atau 'prompt' diperlukan (salah satu harus ada)"
    });
  }
  const api = new AiDeepNude();
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
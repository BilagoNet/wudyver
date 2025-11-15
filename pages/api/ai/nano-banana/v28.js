import axios from "axios";
import FormData from "form-data";
import crypto from "crypto";
const serviceConfig = {
  baseUrl: "https://new-maketoon-754894832194.europe-west1.run.app",
  endpoints: {
    img2img: "/transform_replicate",
    text2img: "/text_to_image"
  },
  payload: {
    model: "replicate",
    style: "anime",
    prompt: "",
    user_tier: "free",
    remove_watermark: "false",
    priority: "",
    name: "",
    accessories: "",
    background_color: "",
    custom_prompt: ""
  }
};
class MakeToon {
  constructor(baseUrl) {
    this.config = {
      ...serviceConfig,
      baseUrl: baseUrl ?? serviceConfig.baseUrl
    };
  }
  l = (...args) => console.log("[StyleConv]", ...args);
  async styles() {
    try {
      const response = await axios.get("https://api.thekmobile.com/services.json");
      return response.data.styles || this.getFallbackStyles();
    } catch (error) {
      this.l("Error fetching styles, using fallback:", error.message);
      return this.getFallbackStyles();
    }
  }
  getFallbackStyles() {
    return ["anime", "shonen", "comic", "game", "clay", "stock", "90s"];
  }
  async i(imageUrl) {
    try {
      this.l("Processing image input...");
      if (Buffer.isBuffer(imageUrl)) {
        this.l("Input: Buffer");
        return imageUrl;
      }
      if (typeof imageUrl === "string" && imageUrl.startsWith("data:")) {
        this.l("Input: Base64");
        const b64 = imageUrl.split(",")[1];
        return Buffer.from(b64, "base64");
      }
      if (typeof imageUrl === "string" && imageUrl.startsWith("http")) {
        this.l("Input: URL → downloading...");
        const {
          data
        } = await axios.get(imageUrl, {
          responseType: "arraybuffer"
        });
        return Buffer.from(data);
      }
      throw new Error("imageUrl must be URL, base64, or Buffer");
    } catch (e) {
      this.l("Image input error:", e.message);
      throw e;
    }
  }
  async generate({
    model,
    style,
    prompt,
    imageUrl,
    isProUser = true,
    ...rest
  }) {
    const userId = crypto.randomUUID();
    const isImg2Img = !!imageUrl;
    const endpoint = isImg2Img ? this.config.endpoints.img2img : this.config.endpoints.text2img;
    const url = `${this.config.baseUrl}${endpoint}`;
    this.l(`Mode: ${isImg2Img ? "Image-to-Image" : "Text-to-Image"}`);
    this.l("Random User ID:", userId);
    this.l("Endpoint:", endpoint);
    const form = new FormData();
    try {
      const defaults = this.config.payload;
      const fields = {
        ...defaults,
        ...rest
      };
      if (model !== undefined) fields.model = model;
      if (style !== undefined) fields.style = style;
      if (prompt !== undefined) fields.prompt = prompt;
      form.append("prompt", fields.prompt);
      form.append("model", fields.model);
      form.append("user_id", userId);
      if (isImg2Img) {
        const imgBuffer = await this.i(imageUrl);
        const ext = typeof imageUrl === "string" && imageUrl.split(".").pop()?.split("?")[0] || "jpg";
        const filename = `input.${ext}`;
        form.append("image", imgBuffer, {
          filename: filename
        });
        this.l("Image attached:", filename, imgBuffer.length, "bytes");
      }
      form.append("style", fields.style);
      form.append("user_tier", fields.user_tier);
      form.append("remove_watermark", isProUser ? "true" : fields.remove_watermark);
      if (isProUser) {
        form.append("priority", "high");
      } else if (fields.priority && fields.priority.toString().length > 0) {
        form.append("priority", fields.priority.toString());
      }
      ["name", "accessories", "background_color", "custom_prompt"].forEach(k => {
        const val = fields[k];
        if (val && val.toString().length > 0) {
          form.append(k, val.toString());
        }
      });
      this.l("Sending request...");
      const res = await axios.post(url, form, {
        headers: form.getHeaders(),
        timeout: 18e4,
        maxBodyLength: Infinity
      });
      this.l("API raw response:", res.data);
      return res.data;
    } catch (e) {
      const err = e.response?.data || {
        error: e.message
      };
      this.l("API error:", err);
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
      error: "Parameter 'action' wajib diisi."
    });
  }
  const api = new MakeToon();
  try {
    let response;
    switch (action) {
      case "generate":
        if (!params.prompt && !params.imageUrl) {
          return res.status(400).json({
            error: "Parameter 'prompt' atau 'imageUrl' wajib diisi untuk action 'generate'."
          });
        }
        response = await api.generate(params);
        break;
      case "styles":
        response = await api.styles();
        break;
      default:
        return res.status(400).json({
          error: `Action tidak valid: ${action}. Action yang didukung: 'generate' dan 'styles'.`
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
import axios from "axios";
import FormData from "form-data";
import SpoofHead from "@/lib/spoof-head";
const TOKEN = "wvebnyu6668756h45gfecdfegnhmu6kj5h64g53fvrbgny5";
const PAYLOAD_KEY = "image";
const MAX_FILE_SIZE = 5 * 1024 * 1024;
class RevivaClient {
  constructor() {
    this.base = "https://reviva.aculix.net";
    this.auth = TOKEN;
  }
  async downloadImage(url) {
    try {
      const response = await axios.get(url, {
        responseType: "arraybuffer",
        maxContentLength: MAX_FILE_SIZE,
        timeout: 3e4
      });
      const buffer = Buffer.from(response.data);
      if (buffer.length > MAX_FILE_SIZE) {
        throw new Error(`Image size exceeds ${MAX_FILE_SIZE / (1024 * 1024)}MB limit`);
      }
      const mimeType = response.headers["content-type"] || "image/jpeg";
      return {
        buffer: buffer,
        mimeType: mimeType
      };
    } catch (error) {
      throw new Error(`Download failed: ${error.message}`);
    }
  }
  async prepareImage(image) {
    let buffer;
    let filename = "image.jpg";
    let mimeType = "image/jpeg";
    if (typeof image === "string") {
      if (image.startsWith("http")) {
        const result = await this.downloadImage(image);
        buffer = result.buffer;
        mimeType = result.mimeType;
        const ext = mimeType.split("/")[1] || "jpg";
        filename = `image.${ext}`;
      } else {
        const b64 = image.startsWith("data:") ? image.split(",")[1] : image;
        buffer = Buffer.from(b64, "base64");
        if (image.startsWith("data:")) {
          const mimeMatch = image.match(/data:(image\/\w+);base64/);
          if (mimeMatch) {
            mimeType = mimeMatch[1];
            filename = `image.${mimeType.split("/")[1]}`;
          }
        }
      }
    } else if (Buffer.isBuffer(image)) {
      buffer = image;
    } else {
      throw new Error("Image must be URL, base64 string, or Buffer");
    }
    if (buffer.length > MAX_FILE_SIZE) {
      throw new Error(`Image size exceeds ${MAX_FILE_SIZE / (1024 * 1024)}MB limit`);
    }
    return {
      buffer: buffer,
      filename: filename,
      mimeType: mimeType
    };
  }
  async colorize({
    image
  } = {}) {
    if (!image) throw new Error("image required");
    const {
      buffer,
      filename,
      mimeType
    } = await this.prepareImage(image);
    for (let attempt = 1; attempt <= 30; attempt++) {
      try {
        const form = new FormData();
        form.append(PAYLOAD_KEY, buffer, {
          filename: filename,
          contentType: mimeType
        });
        const {
          data
        } = await axios.post(`${this.base}/colorize`, form, {
          headers: {
            Authorization: this.auth,
            ...form.getHeaders(),
            ...SpoofHead()
          },
          timeout: 36e4,
          maxContentLength: Infinity,
          maxBodyLength: Infinity
        });
        return data?.result || data;
      } catch (error) {
        if (attempt < 3 && error.response?.status !== 400) {
          const delay = 3e3;
          console.warn(`Request failed (attempt ${attempt}). Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          if (error.response) {
            const status = error.response.status;
            const statusText = error.response.statusText;
            const errorData = error.response.data;
            throw new Error(`API Error ${status}: ${statusText}${errorData ? ` - ${JSON.stringify(errorData)}` : ""}`);
          }
          throw error;
        }
      }
    }
  }
}
export default async function handler(req, res) {
  const params = req.method === "GET" ? req.query : req.body;
  if (!params.image) {
    return res.status(400).json({
      error: "Parameter 'image' diperlukan"
    });
  }
  const api = new RevivaClient();
  try {
    const data = await api.colorize(params);
    return res.status(200).json(data);
  } catch (error) {
    const errorMessage = error.message || "Terjadi kesalahan saat memproses URL";
    return res.status(500).json({
      error: errorMessage
    });
  }
}
import axios from "axios";
class GeminiAPI {
  constructor() {
    this.encKey = ["QUl6YVN5RGtha2QtMWNiR3FlU1Y2eHJ3WTk4Q0o4SVF5LUpqeUgw", "QUl6YVN5Q2dTVmc4Mms1aUt2Tng2LTNEUmFCSE5Ham5CbGNxaTJZ", "QUl6YVN5Q1dlZUVPVHlqT2Vwc0kyTjg0SDRDMUd4bDlwWk45X3Zr", "QUl6YVN5RGQzM0VBejJXR3BqdkM4R0xJV09sNFJFRXRQSWJCVjBz", "QUl6YVN5QW92M2ZZV0hOejNGaWpQaVNFRG81MnJrTFlBWWsxaEFz", "QUl6YVN5Q2JJVXhPZUVmWl90ajhEbk1BYWhmNG9pNXBuTVh6OXRr", "QUl6YVN5QnlSSjk5eEhkV2ozWFl6YmdZQUFkbTRDUUF6NzBUYXBj", "QUl6YVN5RExyU2FoV3I0WWFWS3l0MmdUbmtwSTBiSUZPVkVQVjdZ", "QUl6YVN5Q0Q0YV9hc2NVcGd4UGREQ0hWa0pteXk2cExROFd6bkJJ", "QUl6YVN5QklMVUtWcDNBaGR4aVM3RmtjUFFGZlM4R0d0YWJZLW40"];
    this.baseUrl = "https://generativelanguage.googleapis.com/v1beta/models/";
    this.headers = {
      "content-type": "application/json",
      "user-agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36"
    };
  }
  async getData(imageUrl) {
    try {
      const response = await axios.get(imageUrl, {
        responseType: "arraybuffer",
        timeout: 1e4
      });
      const mimeType = response.headers["content-type"] || "image/jpeg";
      if (!mimeType.startsWith("image/")) {
        throw new Error(`Invalid MIME type: ${mimeType}`);
      }
      return {
        inline_data: {
          mime_type: mimeType,
          data: Buffer.from(response.data).toString("base64")
        }
      };
    } catch (error) {
      throw new Error(`Failed to fetch image from ${imageUrl}: ${error.message}`);
    }
  }
  async tryRequest(url, body, usedKeys = []) {
    const availableKeys = this.encKey.filter(k => !usedKeys.includes(k));
    if (availableKeys.length === 0) {
      throw new Error("All API keys failed or are rate-limited.");
    }
    const ranKey = availableKeys[Math.floor(Math.random() * availableKeys.length)];
    const decKey = Buffer.from(ranKey, "base64").toString("utf-8");
    const finalUrl = `${url}?key=${decKey}`;
    try {
      const response = await axios.post(finalUrl, body, {
        headers: this.headers,
        timeout: 3e4
      });
      return response.data;
    } catch (error) {
      const status = error.response?.status;
      const isRetryable = [403, 429, 500, 503].includes(status);
      if (isRetryable && availableKeys.length > 1) {
        console.warn(`Key failed (status ${status}), trying another key...`);
        usedKeys.push(ranKey);
        return await this.tryRequest(url, body, usedKeys);
      } else {
        const msg = error.response?.data?.error?.message || error.message;
        throw new Error(`Gemini API error: ${msg} (status: ${status})`);
      }
    }
  }
  async chat({
    model = "gemini-1.5-flash",
    prompt,
    imageUrl = null,
    ...rest
  }) {
    if (!prompt) throw new Error("Prompt is required");
    const parts = [];
    if (imageUrl) {
      const urls = Array.isArray(imageUrl) ? imageUrl : [imageUrl];
      for (const url of urls) {
        try {
          const imagePart = await this.getData(url);
          parts.push(imagePart);
        } catch (error) {
          console.error("Image download failed:", error.message);
        }
      }
    }
    parts.push({
      text: prompt
    });
    const body = {
      contents: [{
        parts: parts
      }],
      ...rest
    };
    const url = `${this.baseUrl}${model}:generateContent`;
    return await this.tryRequest(url, body);
  }
}
export default async function handler(req, res) {
  const params = req.method === "GET" ? req.query : req.body;
  if (!params.prompt) {
    return res.status(400).json({
      error: "Prompt is required"
    });
  }
  const gemini = new GeminiAPI();
  try {
    const data = await gemini.chat(params);
    return res.status(200).json(data);
  } catch (error) {
    console.error("Handler error:", error.message);
    return res.status(500).json({
      error: "Failed to process request",
      details: error.message
    });
  }
}
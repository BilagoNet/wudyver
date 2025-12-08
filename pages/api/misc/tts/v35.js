import axios from "axios";
import FormData from "form-data";
import apiConfig from "@/configs/apiConfig";
class LoveVoiceClient {
  constructor() {
    this.baseURL = "https://lovevoice.ai";
    this.cfSiteKey = "0x4AAAAAABARovuA2Qj0mtMA";
    this.cfURL = "https://lovevoice.ai/";
  }
  async getCfToken() {
    try {
      console.log("Getting Cloudflare token...");
      const cfURL = `https://${apiConfig.DOMAIN_URL}/api/tools/cf-token?mode=turnstile-min&sitekey=${this.cfSiteKey}&url=${this.cfURL}`;
      const response = await axios.get(cfURL);
      const token = response?.data?.token;
      if (!token) {
        throw new Error("No CF token received");
      }
      console.log("CF token obtained successfully");
      return token;
    } catch (error) {
      console.error("Error getting CF token:", error.message);
      throw error;
    }
  }
  async generate({
    text,
    voice,
    ...rest
  }) {
    try {
      console.log(`Starting TTS generation for text: "${text?.substring(0, 50)}..."`);
      const form = new FormData();
      form.append("text", text || "");
      form.append("voice", voice || "voice-195");
      form.append("rate", rest?.rate || 0);
      form.append("volume", rest?.volume || 0);
      form.append("pitch", rest?.pitch || 0);
      const cfToken = await this.getCfToken();
      form.append("cf-turnstile-response", cfToken);
      const headers = {
        accept: "*/*",
        "accept-language": "id-ID",
        origin: this.baseURL,
        referer: `${this.baseURL}/`,
        "sec-ch-ua": '"Chromium";v="127", "Not)A;Brand";v="99", "Microsoft Edge Simulate";v="127", "Lemur";v="127"',
        "sec-ch-ua-mobile": "?1",
        "sec-ch-ua-platform": '"Android"',
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
        "user-agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Mobile Safari/537.36",
        ...form.getHeaders()
      };
      console.log("Sending request to LoveVoice API...");
      const response = await axios.post(`${this.baseURL}/api/text-to-speech`, form, {
        headers: headers,
        responseType: "arraybuffer"
      });
      const contentType = response.headers["content-type"];
      const contentLength = response.headers["content-length"];
      console.log(`Audio received: ${contentType}, size: ${contentLength || "unknown"} bytes`);
      return {
        buffer: response.data,
        contentType: contentType || "audio/mpeg"
      };
    } catch (error) {
      console.error("Error in TTS generation:", error.message);
      throw error;
    }
  }
}
export default async function handler(req, res) {
  const params = req.method === "GET" ? req.query : req.body;
  if (!params.text) {
    return res.status(400).json({
      error: "Text is required"
    });
  }
  try {
    const api = new LoveVoiceClient();
    const result = await api.generate(params);
    res.setHeader("Content-Type", result.contentType);
    res.setHeader("Content-Disposition", 'inline; filename="generated_audio.mp3"');
    return res.status(200).send(result.buffer);
  } catch (error) {
    console.error("Terjadi kesalahan di handler API:", error.message);
    return res.status(500).json({
      error: error.message || "Internal Server Error"
    });
  }
}
import axios from "axios";
class GeminiAPI {
  constructor() {
    this.baseUrl = "https://us-central1-infinite-chain-295909.cloudfunctions.net/gemini-proxy-staging-v1";
    this.headers = {
      accept: "*/*",
      "accept-language": "id-ID,id;q=0.9",
      "content-type": "application/json",
      priority: "u=1, i",
      "sec-ch-ua": '"Chromium";v="131", "Not_A Brand";v="24", "Microsoft Edge Simulate";v="131", "Lemur";v="131"',
      "sec-ch-ua-mobile": "?1",
      "sec-ch-ua-platform": '"Android"',
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "cross-site",
      "user-agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36"
    };
  }
  async getData(imageUrl) {
    try {
      const response = await axios.get(imageUrl, {
        responseType: "arraybuffer"
      });
      return {
        inline_data: {
          mime_type: response.headers["content-type"],
          data: Buffer.from(response.data, "binary").toString("base64")
        }
      };
    } catch (error) {
      console.error(`Error fetching image from ${imageUrl}:`, error);
      throw new Error(`Failed to fetch image from ${imageUrl}`);
    }
  }
  async chat({
    model = "gemini-2.0-flash-lite",
    prompt,
    imageUrl = null,
    ...rest
  }) {
    if (!prompt) throw new Error("Prompt is required");
    const url = this.baseUrl;
    const parts = [];
    if (imageUrl) {
      const urls = Array.isArray(imageUrl) ? imageUrl : [imageUrl];
      try {
        for (const url of urls) {
          const imagePart = await this.getData(url);
          parts.push(imagePart);
        }
      } catch (error) {
        console.error("An image failed to download, stopping process:", error);
        throw error;
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
    try {
      const response = await axios.post(url, body, {
        headers: this.headers
      });
      return response.data;
    } catch (error) {
      console.error("Error fetching Gemini response:", error.response ? error.response.data : error.message);
      throw error;
    }
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
    res.status(500).json({
      error: "Internal Server Error"
    });
  }
}
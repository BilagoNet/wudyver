import fetch from "node-fetch";
import CryptoJS from "crypto-js";
class VideoAPI {
  constructor() {
    this.baseConfig = {
      pictory: {
        clientId: "7n3gkamqknqc4eisek9q3gniv0",
        clientSecret: "AQICAHj6D/xxh0/2YyK+uvq1tF8IPsJO/sPk3uFhnRuOfl6yvAEWf1VYFWcGcp/HlovktLToAAAAlDCBkQYJKoZIhvcNAQcGoIGDMIGAAgEAMHsGCSqGSIb3DQEHATAeBglghkgBZQMEAS4wEQQMENmzlyBkvHcc+T6tAgEQgE5siNOW1jc7LvHSVhMq5Qy9tOgcT+f0u69mhbjO5k7ejbD075+C9ulWDPk9XVtF3taBmY3nHPZ3KZ3fEP4C20De2Tjvn4f0euvds1nZfSs="
      },
      piapi: {
        apiKey: "5f9a4bd59e9d6881772eccc6c29db164342cc65a3452ed372970afba80545ccb"
      },
      "302ai": {
        apiKey: "sk-edt1IAghrAOSZUPS9xW4ShmS5nxmiCnacAqYC76VrvCrAzg9"
      }
    };
  }
  getAvailableProviders() {
    return [{
      name: "pictory",
      description: "Membutuhkan otentikasi (mengembalikan token) sebelum memulai tugas (start task).",
      required_params: ["prompt"],
      optional_params: ["duration", "aspectRatio"]
    }, {
      name: "302ai",
      description: "Generasi video menggunakan API 302.ai.",
      required_params: ["prompt"],
      optional_params: ["duration", "model"]
    }, {
      name: "piapi",
      description: "Generasi video menggunakan Piapi.",
      required_params: ["prompt"],
      optional_params: ["duration"]
    }, {
      name: "sora",
      description: "Generasi video menggunakan model Sora (melalui 302.ai).",
      required_params: ["prompt"],
      optional_params: ["duration"]
    }, {
      name: "veo3",
      description: "Hanya untuk pengecekan status tugas Veo3 (tidak ada generate).",
      required_params: ["taskId"],
      optional_params: []
    }];
  }
  async generate({
    provider,
    ...rest
  }) {
    console.log(`🔄 Generating video with provider: ${provider}`);
    try {
      let result;
      switch (provider) {
        case "pictory":
          result = await this._generatePictory(rest);
          break;
        case "302ai":
          result = await this._generate302AI(rest);
          break;
        case "piapi":
          result = await this._generatePiapi(rest);
          break;
        case "sora":
          result = await this._generateSora(rest);
          break;
        default:
          throw new Error(`Unsupported provider: ${provider}`);
      }
      console.log(`✅ Video generation completed for ${provider}`);
      return result;
    } catch (error) {
      console.error(`❌ Generation failed for ${provider}:`, error.message);
      throw error;
    }
  }
  async status({
    provider,
    ...rest
  }) {
    console.log(`🔍 Checking status with provider: ${provider}`);
    try {
      let status;
      switch (provider) {
        case "pictory":
          status = await this._statusPictory(rest);
          break;
        case "302ai":
          status = await this._status302AI(rest);
          break;
        case "piapi":
          status = await this._statusPiapi(rest);
          break;
        case "sora":
          status = await this._statusSora(rest);
          break;
        case "veo3":
          status = await this._statusVeo3(rest);
          break;
        default:
          throw new Error(`Unsupported provider: ${provider}`);
      }
      console.log(`✅ Status check completed for ${provider}`);
      return status;
    } catch (error) {
      console.error(`❌ Status check failed for ${provider}:`, error.message);
      throw error;
    }
  }
  async _generatePictory({
    prompt,
    duration = 5,
    aspectRatio = "16:9"
  }) {
    console.log("🔄 Getting Pictory access token...");
    const authResponse = await fetch("https://api.pictory.ai/pictoryapis/v1/oauth2/token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        client_id: this.baseConfig.pictory.clientId,
        client_secret: this.baseConfig.pictory.clientSecret
      })
    });
    if (!authResponse.ok) {
      throw new Error(`Pictory auth failed: ${authResponse.status}`);
    }
    const authData = await authResponse.json();
    return authData;
  }
  async _generate302AI({
    prompt,
    duration = 8,
    model = "veo3.1"
  }) {
    const response = await fetch("https://api.302.ai/302/submit/veo3-v2", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.baseConfig["302ai"].apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        prompt: prompt,
        aspect_ratio: "16:9",
        model: model,
        duration: duration?.toString() || "8"
      })
    });
    if (!response.ok) {
      throw new Error(`302.ai generation failed: ${response.status}`);
    }
    return await response.json();
  }
  async _generatePiapi({
    prompt,
    duration = 5
  }) {
    const response = await fetch("https://api.piapi.ai/api/v1/generate", {
      method: "POST",
      headers: {
        "x-api-key": this.baseConfig.piapi.apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        prompt: prompt,
        duration: duration?.toString() || "5",
        model: "piano"
      })
    });
    if (!response.ok) {
      throw new Error(`Piapi generation failed: ${response.status}`);
    }
    return await response.json();
  }
  async _generateSora({
    prompt,
    duration = 8
  }) {
    const response = await fetch("https://api.302.ai/openai/v1/videos", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.baseConfig["302ai"].apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        prompt: prompt,
        seconds: duration?.toString() || "8",
        size: "1:1",
        model: "sora-2"
      })
    });
    if (!response.ok) {
      throw new Error(`Sora generation failed: ${response.status}`);
    }
    return await response.json();
  }
  async _statusPictory({
    taskId,
    accessToken
  }) {
    const response = await fetch(`https://api.pictory.ai/pictoryapis/v1/tasks/${taskId}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      }
    });
    if (!response.ok) {
      throw new Error(`Pictory status check failed: ${response.status}`);
    }
    return await response.json();
  }
  async _status302AI({
    taskId,
    id
  }) {
    const taskIdentifier = taskId || id;
    const response = await fetch(`https://api.302.ai/klingai/task/${taskIdentifier}/fetch?geo=global`, {
      headers: {
        Authorization: `Bearer ${this.baseConfig["302ai"].apiKey}`,
        "Content-Type": "application/json"
      }
    });
    if (!response.ok) {
      throw new Error(`302.ai status check failed: ${response.status}`);
    }
    return await response.json();
  }
  async _statusPiapi({
    taskId,
    id
  }) {
    const taskIdentifier = taskId || id;
    const response = await fetch(`https://api.piapi.ai/api/v1/task/${taskIdentifier}`, {
      headers: {
        "x-api-key": this.baseConfig.piapi.apiKey,
        "Content-Type": "application/json"
      }
    });
    if (!response.ok) {
      throw new Error(`Piapi status check failed: ${response.status}`);
    }
    return await response.json();
  }
  async _statusSora({
    taskId,
    id
  }) {
    const taskIdentifier = taskId || id;
    const response = await fetch(`https://api.302.ai/openai/v1/videos/${taskIdentifier}/content`, {
      headers: {
        Authorization: `Bearer ${this.baseConfig["302ai"].apiKey}`,
        "Content-Type": "application/json"
      }
    });
    if (!response.ok) {
      throw new Error(`Sora status check failed: ${response.status}`);
    }
    return await response.json();
  }
  async _statusVeo3({
    taskId,
    id
  }) {
    const taskIdentifier = taskId || id;
    const encodedOp = encodeURIComponent(taskIdentifier);
    const response = await fetch(`https://salesupp.net/check-status?operation=${encodedOp}`);
    if (!response.ok) {
      throw new Error(`Veo3 status check failed: ${response.status}`);
    }
    return await response.json();
  }
  _getSignature(data) {
    const jsonString = typeof data === "string" ? data : JSON.stringify(data);
    return CryptoJS.HmacSHA256(jsonString, "8f23b7c0ae4d4c9c8d91babc9ef8c3fa").toString();
  }
  _getVideoDimensions(aspectRatio = "16:9") {
    const [widthRatio, heightRatio] = aspectRatio.split(":").map(Number);
    const baseWidth = 400;
    const height = baseWidth * heightRatio / widthRatio;
    return {
      width: baseWidth,
      height: Math.round(height)
    };
  }
}
export default async function handler(req, res) {
  const {
    action,
    ...params
  } = req.method === "GET" ? req.query : req.body;
  if (!action) {
    return res.status(400).json({
      error: "Parameter 'action' wajib diisi.",
      available_actions: ["generate", "status", "providers"]
    });
  }
  const api = new VideoAPI();
  try {
    let response;
    switch (action) {
      case "generate":
        if (!params.provider) {
          const providers = api.getAvailableProviders();
          return res.status(400).json({
            error: "Parameter 'provider' wajib diisi untuk action 'generate'.",
            available_providers: providers.map(p => ({
              name: p.name,
              description: p.description,
              required_params: p.required_params,
              optional_params: p.optional_params
            }))
          });
        }
        if (!params.prompt) {
          return res.status(400).json({
            error: "Parameter 'prompt' wajib diisi untuk action 'generate'."
          });
        }
        response = await api.generate(params);
        break;
      case "status":
        if (!params.provider) {
          const providers = api.getAvailableProviders();
          return res.status(400).json({
            error: "Parameter 'provider' wajib diisi untuk action 'status'.",
            available_providers: providers.map(p => ({
              name: p.name,
              description: p.description
            }))
          });
        }
        if (!params.id && !params.taskId) {
          return res.status(400).json({
            error: "Parameter 'id' (Task ID) wajib diisi untuk action 'status'."
          });
        }
        response = await api.status(params);
        break;
      case "providers":
        response = api.getAvailableProviders();
        break;
      default:
        return res.status(400).json({
          error: `Action tidak valid: ${action}.`,
          available_actions: ["generate", "status", "providers"]
        });
    }
    return res.status(200).json(response);
  } catch (error) {
    console.error(`[FATAL ERROR] Kegagalan pada action '${action}':`, error);
    if (error.message.includes("provider") || error.message.includes("Unsupported")) {
      const providers = api.getAvailableProviders();
      return res.status(400).json({
        error: error.message,
        available_providers: providers.map(p => ({
          name: p.name,
          description: p.description,
          required_params: p.required_params,
          optional_params: p.optional_params
        }))
      });
    }
    return res.status(500).json({
      error: error.message || "Terjadi kesalahan internal pada server."
    });
  }
}
import axios from "axios";
import https from "https";
import crypto from "crypto";
import SpoofHead from "@/lib/spoof-head";
class MusicGenerator {
  constructor() {
    this.baseUrl = "https://api.magicmusic.pro";
    this.expoUrl = "https://exp.host/--/api/v2/push/updateDeviceToken";
    this.appId = "1:548000895841:android:8b6c7fe1808a3e6ee7ab20";
    this.projectId = "song-ai-f2539";
    this.httpClient = axios.create({
      baseURL: this.baseUrl,
      timeout: 15e3,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...SpoofHead()
      },
      httpsAgent: new https.Agent({
        rejectUnauthorized: false
      })
    });
  }
  async getDevicePushToken() {
    try {
      const deviceId = crypto.randomUUID().toLowerCase();
      const deviceToken = crypto.randomBytes(32).toString("hex");
      const type = "fcm";
      const payload = {
        appId: this.appId,
        deviceId: deviceId,
        deviceToken: deviceToken,
        type: type,
        projectId: this.projectId,
        development: "production"
      };
      const response = await axios.post(this.expoUrl, payload, {
        headers: {
          "Content-Type": "application/json"
        }
      });
      if (!response.data || response.data.errors) {
        throw new Error(`Expo API error: ${JSON.stringify(response.data.errors)}`);
      }
      return deviceToken;
    } catch (error) {
      if (error.name === "AbortError") {
        console.warn("Push token update aborted");
        return null;
      }
      console.error("Error fetching Expo token:", error.message);
      throw new Error(`ERR_NOTIFICATIONS_NETWORK_ERROR: Error encountered while fetching Expo token: ${error.message}`);
    }
  }
  async generate({
    prompt,
    ...rest
  }) {
    try {
      if (!prompt || typeof prompt !== "string") {
        throw new Error("Prompt is required and must be a string");
      }
      const pushToken = await this.getDevicePushToken();
      const payload = {
        prompt: prompt,
        make_instrumental: false,
        wait_audio: false,
        pushToken: pushToken || undefined,
        notificationBody: {
          fromPath: "home"
        },
        pro: true,
        ...rest
      };
      return await this.httpClient.post("/api/generate", payload);
    } catch (error) {
      console.error("Song generation failed:", error.message);
      throw new Error(`Song generation failed: ${error.message}`);
    }
  }
  async status({
    task_id,
    ...rest
  }) {
    try {
      if (!task_id || typeof task_id !== "string") {
        throw new Error("Task ID is required and must be a string");
      }
      return await this.httpClient.get(`/api/get?ids=${task_id}`, {
        params: rest
      });
    } catch (error) {
      console.error("Error fetching song status:", error.message);
      throw new Error(`Error fetching song status: ${error.message}`);
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
  const api = new MusicGenerator();
  try {
    let response;
    const validActions = ["generate", "status"];
    if (!validActions.includes(action)) {
      return res.status(400).json({
        error: `Action tidak valid: ${action}. Action yang didukung: ${validActions.join(", ")}.`
      });
    }
    switch (action) {
      case "generate":
        if (!params.prompt) {
          return res.status(400).json({
            error: "Parameter 'prompt' wajib diisi."
          });
        }
        response = await api.generate(params);
        break;
      case "status":
        if (!params.task_id) {
          return res.status(400).json({
            error: "Parameter 'task_id' wajib diisi."
          });
        }
        response = await api.status(params);
        break;
    }
    return res.status(200).json(response);
  } catch (error) {
    console.error(`[FATAL ERROR] Kegagalan pada action '${action}':`, error);
    return res.status(500).json({
      error: error.message || "Terjadi kesalahan internal pada server."
    });
  }
}
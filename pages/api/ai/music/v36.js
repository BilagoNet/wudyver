import fetch from "node-fetch";
import {
  Agent as HttpsAgent
} from "https";
const httpsAgent = new HttpsAgent({
  keepAlive: true
});
const MAX_ATTEMPTS = 3;

function getAgent(url) {
  if (url.startsWith("https")) {
    return httpsAgent;
  }
  return null;
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
class Api302Service {
  constructor() {
    this.config = {
      endpoint: "https://api.302.ai",
      basePath: "/suno",
      defaultHeaders: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: "Bearer " + this.decode("c2stWVpoak9pNTl0MVNvNnVWS1RFSE95ZnhmMXNWekl6ZHphSTg5UndIQk5HbkZHSUVw")
      }
    };
  }
  decode(str) {
    try {
      return JSON.parse(Buffer.from(str, "base64").toString());
    } catch {
      return Buffer.from(str, "base64").toString();
    }
  }
  async _attemptReq(params, attempt = 1) {
    const {
      path,
      method
    } = params;
    const url = `${this.config.endpoint}${this.config.basePath}${path}`;
    let response;
    let responseText;
    try {
      const options = {
        method: method,
        headers: {
          ...this.config.defaultHeaders,
          ...params.headers
        },
        agent: getAgent(url)
      };
      if (params.data && (method === "POST" || method === "PUT")) {
        options.body = JSON.stringify(params.data);
      }
      console.log(`[API_REQ] (Attempt ${attempt}/${MAX_ATTEMPTS}) 🌐 ${method} ${url}`);
      response = await fetch(url, options);
      responseText = await response.text();
      console.log(`[API_RES] 📡 Status: ${response.status} for ${path}`);
      if (!response.ok) {
        if (response.status >= 500 && response.status < 600 && attempt < MAX_ATTEMPTS) {
          console.warn(`[RETRY] Status ${response.status}. Retrying in ${attempt * 1}s...`);
          await sleep(attempt * 1e3);
          return await this._attemptReq(params, attempt + 1);
        }
        throw new Error(`HTTP ${response.status}: ${responseText}`);
      }
      let result = {};
      try {
        result = JSON.parse(responseText);
      } catch (e) {
        console.warn(`[API_WARN] Response OK, but not valid JSON for ${path}. Body: ${responseText.substring(0, 50)}...`);
      }
      return result;
    } catch (error) {
      const isNetworkError = !response || response && (error.message.includes("fetch") || error.message.includes("ECONN") || error.message.includes("EHOST"));
      if (isNetworkError && attempt < MAX_ATTEMPTS) {
        console.warn(`[RETRY] Network Error: ${error.message}. Retrying in ${attempt * 1}s...`);
        await sleep(attempt * 1e3);
        return this._attemptReq(params, attempt + 1);
      }
      const errorMessage = error.message.includes("HTTP") ? error.message : `Network Error: ${error.message}`;
      console.error(`[API_FAIL] ❌ Request failed (Final attempt) for ${path}: ${errorMessage}`);
      throw new Error(`Request to ${url} failed: ${error.message}`);
    }
  }
  async _req(params) {
    return await this._attemptReq(params);
  }
  async generate({
    custom = false,
    continue: isContinue = false,
    ...rest
  }) {
    try {
      const path = "/submit/music";
      let data = {
        mv: "chirp-v3-5",
        make_instrumental: false,
        ...rest
      };
      let logMsg = "";
      if (isContinue) {
        const {
          taskId,
          continueClipId,
          prompt,
          tags,
          title,
          continueAt = 0
        } = rest;
        data = {
          ...data,
          prompt: prompt,
          tags: tags,
          title: title,
          task_id: taskId,
          continue_clip_id: continueClipId,
          continue_at: continueAt
        };
        logMsg = `⏩ Continuing song: "${title}" (Task ID: ${taskId})`;
      } else if (custom) {
        const {
          prompt,
          tags,
          title,
          makeInstrumental = false
        } = rest;
        data = {
          ...data,
          prompt: prompt,
          tags: tags,
          title: title,
          make_instrumental: makeInstrumental
        };
        logMsg = `🎼 Generating custom music: "${title}"`;
      } else {
        const {
          prompt,
          makeInstrumental = false
        } = rest;
        data = {
          ...data,
          gpt_description_prompt: prompt,
          make_instrumental: makeInstrumental
        };
        logMsg = `🎵 Generating automatic music: "${prompt.substring(0, 30)}..."`;
      }
      console.log(`[PROCESS] ${logMsg}`);
      return await this._req({
        method: "POST",
        path: path,
        data: data
      });
    } catch (error) {
      console.error(`[ERROR] ❌ Failed to generate music: ${error.message}`);
      throw error;
    }
  }
  async status({
    task_id
  }) {
    try {
      console.log(`[PROCESS] 🔍 Fetching status for task: ${task_id}`);
      return await this._req({
        method: "GET",
        path: `/fetch/${task_id}`
      });
    } catch (error) {
      console.error(`[ERROR] ❌ Failed to fetch task status ${task_id}: ${error.message}`);
      throw error;
    }
  }
  async lyrics({
    prompt
  }) {
    try {
      console.log(`[PROCESS] 📝 Generating lyrics with prompt: "${prompt}"`);
      return await this._req({
        method: "POST",
        path: "/submit/lyrics",
        data: {
          prompt: prompt
        }
      });
    } catch (error) {
      console.error(`[ERROR] ❌ Failed to generate lyrics: ${error.message}`);
      throw error;
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
      error: "Paramenter 'action' wajib diisi."
    });
  }
  const api = new Api302Service();
  try {
    let result;
    switch (action) {
      case "generate":
        if (!params.prompt && !params.lyrics) {
          return res.status(400).json({
            error: "Paramenter 'prompt', atau 'lyrics' wajib diisi."
          });
        }
        result = await api.generate(params);
        break;
      case "status":
        if (!params.task_id) {
          return res.status(400).json({
            error: "Paramenter 'task_id' wajib diisi."
          });
        }
        result = await api.status(params);
        break;
      case "lyrics":
        if (!params.prompt) {
          return res.status(400).json({
            error: "Paramenter 'prompt' wajib diisi."
          });
        }
        result = await api.lyrics(params);
        break;
      default:
        return res.status(400).json({
          error: `Action tidak valid: ${action}. Gunakan: generate, status.`
        });
    }
    return res.status(200).json(result);
  } catch (error) {
    console.error(`[ERROR] Action '${action}':`, error.message);
    return res.status(500).json({
      success: false,
      error: error.message || "Terjadi kesalahan internal."
    });
  }
}
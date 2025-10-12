import axios from "axios";
import * as cheerio from "cheerio";
import FormData from "form-data";
import PROXY from "@/configs/proxy-url";
class TextEffectGenerator {
  constructor() {
    this.corsProxy = PROXY.url;
    console.log("CORS proxy", PROXY.url);
    this.urlMap = {
      textpro: `${this.corsProxy}https://textpro.me/search?q=`,
      ephoto: `${this.corsProxy}https://en.ephoto360.com/index/search?q=`,
      photooxy: `${this.corsProxy}https://photooxy.com/search?q=`,
      textproJson: `${this.corsProxy}https://raw.githubusercontent.com/AyGemuy/Textpro-Theme/master/textprome.json`
    };
    this.defaultHeaders = {
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36 Edg/115.0.1901.188"
    };
    this.supportedTypes = Object.keys(this.urlMap);
  }
  validateUrl(url) {
    try {
      new URL(url);
      if (/https?:\/\/(ephoto360|photooxy|textpro)\.(com|me)/i.test(url)) {
        return {
          valid: false,
          message: "URL must be a specific effect page, not the main domain"
        };
      }
      return {
        valid: true
      };
    } catch {
      return {
        valid: false,
        message: "Invalid URL format"
      };
    }
  }
  getSupportedTypes() {
    return `Supported types: ${this.supportedTypes.join(", ")}`;
  }
  async search({
    query = "",
    type = ""
  }) {
    if (!type) {
      throw new Error(`Type is required. ${this.getSupportedTypes()}`);
    }
    if (!this.urlMap[type]) {
      throw new Error(`Invalid type: ${type}. ${this.getSupportedTypes()}`);
    }
    if (!query.trim()) {
      throw new Error("Query cannot be empty");
    }
    try {
      const response = await axios.get(`${this.urlMap[type]}${encodeURIComponent(query)}`, {
        headers: this.defaultHeaders,
        timeout: 1e4
      });
      const body = response.data;
      let items = [];
      if (type === "textpro") {
        const $ = cheerio.load(body);
        items = $(".row .col-md-4").map((_, el) => ({
          link: `https://textpro.me${$(el).find(".div-effect a").attr("href") || ""}`,
          title: $(el).find(".title-effect-home").text().trim() || "Untitled"
        })).get();
        if (items.length === 0) {
          const jsonResponse = await axios.get(this.urlMap.textproJson, {
            headers: this.defaultHeaders,
            timeout: 1e4
          });
          const jsonBody = jsonResponse.data;
          items = jsonBody.map(item => ({
            title: (item.title || "Untitled").trim(),
            link: (item.url || "").trim()
          }));
        }
      } else {
        const $ = cheerio.load(body);
        switch (type) {
          case "ephoto":
            items = $(".row .col-md-4").map((_, el) => ({
              link: `https://en.ephoto360.com${$(el).find(".div-effect a").attr("href") || ""}`,
              title: $(el).find(".title-effect-home").text().trim() || "Untitled"
            })).get();
            break;
          case "photooxy":
            items = $(".row.col-sm-12").map((_, el) => ({
              link: `https://photooxy.com${$(el).find(".title-effect-home a").attr("href") || ""}`,
              title: $(el).find(".title-effect-home a").text().trim() || "Untitled"
            })).get();
            break;
        }
      }
      return [...new Set(items.map(JSON.stringify))].map(JSON.parse).filter(item => item.link && item.title);
    } catch (error) {
      console.error("Error fetching data:", error.message);
      throw new Error(`Failed to fetch data: ${error.message}`);
    }
  }
  async generate({
    url = "",
    text = ""
  }) {
    const urlValidation = this.validateUrl(url);
    if (!urlValidation.valid) {
      throw new Error(urlValidation.message);
    }
    let textArray = [];
    if (typeof text === "string") {
      if (!text.trim()) {
        throw new Error("Text cannot be empty");
      }
      textArray = [text.trim()];
    } else if (Array.isArray(text)) {
      textArray = text.map(t => t.trim()).filter(t => t);
      if (textArray.length === 0) {
        throw new Error("Text array cannot be empty or contain only empty strings");
      }
    } else {
      throw new Error("Text must be a string or an array of strings");
    }
    try {
      const origin = new URL(url).origin;
      const proxiedUrl = `${this.corsProxy}${url}`;
      const initialResponse = await axios.get(proxiedUrl, {
        headers: {
          ...this.defaultHeaders,
          Origin: origin,
          Referer: url
        },
        timeout: 1e4
      });
      const $ = cheerio.load(initialResponse.data);
      const server = $("#build_server").val() || "";
      const serverId = $("#build_server_id").val() || "0";
      const token = $("#token").val() || "";
      const submit = $("#submit").val() || "Create";
      const types = [];
      $('input[name="radio0[radio]"]').each((i, elem) => {
        types.push($(elem).attr("value") || "");
      });
      if (!server || !token) {
        throw new Error("Required form fields are missing");
      }
      const post = types.length ? {
        "radio0[radio]": types[Math.floor(Math.random() * types.length)],
        submit: submit,
        token: token,
        build_server: server,
        build_server_id: Number(serverId)
      } : {
        submit: submit,
        token: token,
        build_server: server,
        build_server_id: Number(serverId)
      };
      const form = new FormData();
      for (const key in post) {
        form.append(key, post[key]);
      }
      for (const t of textArray) {
        form.append("text[]", t);
      }
      const postResponse = await axios.post(proxiedUrl, form, {
        headers: {
          ...this.defaultHeaders,
          ...form.getHeaders(),
          Origin: origin,
          Referer: url,
          Cookie: initialResponse.headers["set-cookie"]?.join("; ") || ""
        },
        timeout: 1e4
      });
      const $post = cheerio.load(postResponse.data);
      const out = $post("#form_value").first().text() || $post("#form_value_input").first().text() || $post("#form_value").first().val() || $post("#form_value_input").first().val();
      if (!out) {
        throw new Error("Failed to retrieve form data for image creation");
      }
      const finalResponse = await axios.post(`${this.corsProxy}${origin}/effect/create-image`, JSON.parse(out), {
        headers: {
          Accept: "*/*",
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          Origin: origin,
          Referer: url,
          "User-Agent": this.defaultHeaders["User-Agent"],
          Cookie: initialResponse.headers["set-cookie"]?.join("; ") || ""
        },
        timeout: 1e4
      });
      if (!finalResponse.data?.success) {
        throw new Error("Image creation failed");
      }
      return {
        status: finalResponse.data.success,
        imageUrl: server + (finalResponse.data.fullsize_image || finalResponse.data.image || ""),
        session: finalResponse.data.session_id || ""
      };
    } catch (error) {
      console.error("Error generating effect:", error.message);
      throw new Error(`Failed to generate effect: ${error.message}`);
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
      error: "Parameter 'action' is required."
    });
  }
  const textEffect = new TextEffectGenerator();
  const supportedActions = ["search", "generate"];
  try {
    let response;
    switch (action) {
      case "search":
        if (!params.query) {
          return res.status(400).json({
            error: "Parameter 'query' is required for action 'search'."
          });
        }
        if (!params.type) {
          return res.status(400).json({
            error: "Parameter 'type' is required for action 'search'."
          });
        }
        response = await textEffect.search({
          query: params.query,
          type: params.type
        });
        break;
      case "generate":
        if (!params.url) {
          return res.status(400).json({
            error: "Parameter 'url' is required for action 'generate'."
          });
        }
        if (!params.text) {
          return res.status(400).json({
            error: "Parameter 'text' is required for action 'generate'."
          });
        }
        const textInput = typeof params.text === "string" ? params.text : params.text;
        response = await textEffect.generate({
          url: params.url,
          text: textInput
        });
        break;
      default:
        return res.status(400).json({
          error: `Invalid action: ${action}. Supported actions: ${supportedActions.join(", ")}.`
        });
    }
    return res.status(200).json(response);
  } catch (error) {
    console.error(`[FATAL ERROR] Failure on action '${action}':`, error);
    return res.status(500).json({
      error: error.message || "Internal server error occurred."
    });
  }
}
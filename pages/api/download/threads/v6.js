import axios from "axios";
import * as cheerio from "cheerio";
import apiConfig from "@/configs/apiConfig";
class Downloader {
  constructor() {
    this.apiHtml = `https://${apiConfig.DOMAIN_URL}/api/tools/web/html/v6`;
    this.maxRetries = 3;
    this.timeout = 3e4;
  }
  async download({
    url,
    retryCount = 0
  }) {
    try {
      console.log(`🔍 Fetching URL: ${url} (attempt ${retryCount + 1})`);
      const {
        data
      } = await axios.get(`${this.apiHtml}?url=${encodeURIComponent(url)}`, {
        timeout: this.timeout
      });
      console.log("✅ HTML fetched successfully");
      const $ = cheerio.load(data);
      const meta = {};
      const scripts = $("script").map((_, el) => $(el).html()).get();
      $("meta[property^='og:']").each((_, el) => {
        meta[$(el).attr("property")] = $(el).attr("content");
      });
      console.log(`📊 Found ${scripts.length} scripts and ${Object.keys(meta).length} meta tags`);
      const result = this.findTranscriptionData(scripts);
      if (result) {
        console.log("✅ Successfully extracted transcription data");
        return {
          success: true,
          meta: meta,
          data: result,
          rawData: result
        };
      } else {
        console.log("⚠️ No transcription data found, returning meta data only");
        return {
          success: true,
          meta: meta,
          data: null,
          message: "No transcription data found in scripts"
        };
      }
    } catch (error) {
      console.error(`💥 Error in download (attempt ${retryCount + 1}):`, error.message);
      if (retryCount < this.maxRetries && this.isRetryableError(error)) {
        console.log(`🔄 Retrying... (${retryCount + 1}/${this.maxRetries})`);
        await this.delay(1e3 * (retryCount + 1));
        return this.download({
          url: url,
          retryCount: retryCount + 1
        });
      }
      return {
        success: false,
        error: "Fetch failed",
        errorDetails: {
          message: error.message,
          code: error.code,
          url: url,
          attempts: retryCount + 1
        }
      };
    }
  }
  findTranscriptionData(scripts) {
    try {
      const transcriptionScript = scripts.find(s => s && s.includes("transcription_data"));
      if (transcriptionScript) {
        console.log("🔍 Found transcription_data script");
        return this.extractFromTranscriptionScript(transcriptionScript);
      }
      const jsonLdScript = scripts.find(s => s && s.includes('"@type":"SocialMediaPosting"'));
      if (jsonLdScript) {
        console.log("🔍 Found JSON-LD data");
        return this.extractFromJsonLd(jsonLdScript);
      }
      for (const script of scripts) {
        if (!script) continue;
        const jsonMatch = script.match(/\{"@context":.*?\}$/);
        if (jsonMatch) {
          try {
            const jsonData = JSON.parse(jsonMatch[0]);
            if (jsonData.text || jsonData.content) {
              console.log("🔍 Found JSON data with post content");
              return jsonData;
            }
          } catch (e) {}
        }
      }
      return null;
    } catch (error) {
      console.error("💥 Error in findTranscriptionData:", error.message);
      return null;
    }
  }
  extractFromTranscriptionScript(script) {
    try {
      console.log("🔧 Extracting from transcription script...");
      const extractionStrategies = [() => {
        const jsonData = JSON.parse(script);
        return this.deepFindPostData(jsonData);
      }, () => {
        const jsonMatch = script.match(/\{"require":.*?\}$/);
        if (jsonMatch) {
          const jsonData = JSON.parse(jsonMatch[0]);
          return this.deepFindPostData(jsonData);
        }
        return null;
      }, () => {
        if (script.includes("__bbox") && script.includes("result")) {
          const jsonData = JSON.parse(script);
          return this.traverseAndFindPost(jsonData);
        }
        return null;
      }];
      for (const strategy of extractionStrategies) {
        try {
          const result = strategy();
          if (result) return result;
        } catch (e) {
          console.log(`⚠️ Extraction strategy failed: ${e.message}`);
        }
      }
      return null;
    } catch (error) {
      console.error("💥 Error extracting from transcription script:", error.message);
      return null;
    }
  }
  deepFindPostData(obj, path = "") {
    try {
      if (!obj || typeof obj !== "object") return null;
      if (this.isPostObject(obj)) {
        console.log(`✅ Found post data at path: ${path}`);
        return obj;
      }
      if (Array.isArray(obj)) {
        for (let i = 0; i < obj.length; i++) {
          const result = this.deepFindPostData(obj[i], `${path}[${i}]`);
          if (result) return result;
        }
      } else {
        for (const key in obj) {
          if (obj.hasOwnProperty(key)) {
            const result = this.deepFindPostData(obj[key], `${path}.${key}`);
            if (result) return result;
          }
        }
      }
      return null;
    } catch (error) {
      console.error(`💥 Error in deepFindPostData at path ${path}:`, error.message);
      return null;
    }
  }
  traverseAndFindPost(obj) {
    try {
      if (obj && obj.require && Array.isArray(obj.require)) {
        for (const item of obj.require) {
          if (Array.isArray(item) && item.length >= 4) {
            const bboxData = item[3];
            if (bboxData && bboxData.__bbox) {
              const result = bboxData.__bbox.result;
              if (result && result.data) {
                console.log("✅ Found post data through specific traversal");
                return this.extractPostFromResult(result);
              }
            }
          }
        }
      }
      return null;
    } catch (error) {
      console.error("💥 Error in traverseAndFindPost:", error.message);
      return null;
    }
  }
  extractPostFromResult(result) {
    try {
      const edges = result?.data?.data?.edges;
      if (edges && edges.length > 0) {
        const node = edges[0]?.node;
        if (node?.thread_items && node.thread_items.length > 0) {
          return node.thread_items[0]?.post;
        }
      }
      return null;
    } catch (error) {
      console.error("💥 Error in extractPostFromResult:", error.message);
      return null;
    }
  }
  isPostObject(obj) {
    return obj && (obj.text_post_app_info !== undefined || obj.user !== undefined || obj.caption !== undefined || obj.pk !== undefined);
  }
  extractFromJsonLd(script) {
    try {
      const jsonMatch = script.match(/{.*}/);
      if (jsonMatch) {
        const jsonData = JSON.parse(jsonMatch[0]);
        return jsonData;
      }
      return null;
    } catch (error) {
      console.error("💥 Error extracting from JSON-LD:", error.message);
      return null;
    }
  }
  isRetryableError(error) {
    return !error.response || error.response.status >= 500 || error.code === "ECONNABORTED" || error.code === "ENOTFOUND";
  }
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
export default async function handler(req, res) {
  const params = req.method === "GET" ? req.query : req.body;
  if (!params.url) {
    return res.status(400).json({
      error: "Url is required"
    });
  }
  const threads = new Downloader();
  try {
    const data = await threads.download(params);
    return res.status(200).json(data);
  } catch (error) {
    res.status(500).json({
      error: "Internal Server Error"
    });
  }
}
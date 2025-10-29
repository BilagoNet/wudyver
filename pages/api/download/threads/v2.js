import axios from "axios";
import * as cheerio from "cheerio";
import apiConfig from "@/configs/apiConfig";
class Downloader {
  constructor() {
    this.apiHtml = `https://${apiConfig.DOMAIN_URL}/api/tools/web/html/v1`;
    this.maxRetries = 3;
    this.timeout = 3e5;
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
      $("meta[property^='og:']").each((_, el) => {
        meta[$(el).attr("property")] = $(el).attr("content");
      });
      const result = this.findTranscriptionData(data);
      if (result) {
        console.log("✅ Successfully extracted transcription data");
        return {
          success: true,
          meta: meta,
          data: result
        };
      } else {
        if (retryCount < this.maxRetries) {
          console.log(`⚠️ No transcription data found, retrying... (${retryCount + 1}/${this.maxRetries})`);
          await this.delay(1500 * (retryCount + 1));
          return this.download({
            url: url,
            retryCount: retryCount + 1
          });
        }
        console.log("❌ Max retries reached, returning meta only");
        return {
          success: true,
          meta: meta,
          data: null,
          message: "No transcription data found"
        };
      }
    } catch (error) {
      console.error(`💥 Error in download (attempt ${retryCount + 1}):`, error.message);
      if (retryCount < this.maxRetries && this.isRetryableError(error)) {
        console.log(`🔄 Retrying due to error... (${retryCount + 1}/${this.maxRetries})`);
        await this.delay(1500 * (retryCount + 1));
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
  findTranscriptionData(content) {
    try {
      const $ = cheerio.load(content);
      let scriptContent;
      $("script").each((_, script) => {
        const data = script.children[0]?.data;
        if (data?.includes("username") && data?.includes("original_width")) {
          scriptContent = data;
          return false;
        }
      });
      if (!scriptContent) return null;
      const parsedData = JSON.parse(scriptContent);
      console.log(scriptContent);
      const result = parsedData.require?.[0]?.[3]?.[0]?.__bbox?.require?.[0]?.[3]?.[1]?.__bbox?.result;
      const post = result?.data?.data?.edges?.[0]?.node?.thread_items?.[0]?.post;
      if (!post) return null;
      const attachments = [];
      if (post.video_versions?.length) attachments.push({
        type: "Video",
        url: post.video_versions[0].url
      });
      if (post.carousel_media?.length) {
        for (const item of post.carousel_media) {
          if (item.image_versions2?.candidates?.length) attachments.push({
            type: "Photo",
            url: item.image_versions2.candidates[0].url
          });
          if (item.video_versions?.length) attachments.push({
            type: "Video",
            url: item.video_versions[0].url
          });
        }
      }
      if (post.audio?.audio_src) attachments.push({
        type: "Audio",
        url: post.audio.audio_src
      });
      return {
        id: post.pk,
        message: post.caption?.text || "Không có tiêu đề",
        like_count: post.like_count || 0,
        reply_count: post.text_post_app_info?.direct_reply_count || 0,
        repost_count: post.text_post_app_info?.repost_count || 0,
        quote_count: post.text_post_app_info?.quote_count || 0,
        author: post.user?.username,
        short_code: post.code,
        taken_at: post.taken_at,
        attachments: attachments
      };
    } catch (error) {
      console.error("💥 Error in findTranscriptionData:", error.message);
      return null;
    }
  }
  isRetryableError(error) {
    return !error.response || error.response.status >= 500 || ["ECONNABORTED", "ENOTFOUND"].includes(error.code);
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
import axios from "axios";
import * as cheerio from "cheerio";
class ScribdFetcher {
  id(url) {
    const m = url?.match(/\/(?:doc|document|embeds)\/(\d+)/);
    return m?.[1] || null;
  }
  async req(url) {
    console.log(`[LOG] Fetching: ${url}`);
    const res = await axios.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
      }
    });
    return res?.data || "";
  }
  extract(html, docId) {
    const $ = cheerio.load(html);
    const list = [];
    $(".absimg").each((_, el) => {
      const src = $(el).attr("src") || $(el).attr("orig") || $(el).attr("data-src");
      src?.startsWith("http") && list.push(src);
    });
    let title = $("title").text() || "Unknown";
    const scriptContent = $("script").map((_, el) => $(el).html()).get().join(" ");
    const titleMatch = scriptContent?.match(/"title":"(.*?)"/);
    if (titleMatch?.[1]) {
      title = titleMatch[1];
    }
    return {
      id: docId,
      title: title,
      total_pages: list.length,
      result: [...new Set(list)]
    };
  }
  async download({
    url,
    ...rest
  }) {
    try {
      console.log(`[LOG] Starting process...`);
      const docId = this.id(url);
      if (!docId) throw new Error("Invalid URL or ID not found");
      const targetUrl = `https://www.scribd.com/embeds/${docId}/content`;
      const html = await this.req(targetUrl);
      const data = this.extract(html, docId);
      const status = data.result?.length ? "Success" : "Failed/Empty";
      console.log(`[LOG] Status: ${status}`);
      console.log(`[LOG] Document: ${data.title} (${data.total_pages} Pages)`);
      return data;
    } catch (err) {
      console.error(`[ERR] ${err?.message || "Unknown error"}`);
      return {
        result: [],
        error: err?.message
      };
    }
  }
}
export default async function handler(req, res) {
  const params = req.method === "GET" ? req.query : req.body;
  if (!params.url) {
    return res.status(400).json({
      error: "Parameter 'url' diperlukan"
    });
  }
  const api = new ScribdFetcher();
  try {
    const data = await api.download(params);
    return res.status(200).json(data);
  } catch (error) {
    const errorMessage = error.message || "Terjadi kesalahan saat memproses URL";
    return res.status(500).json({
      error: errorMessage
    });
  }
}
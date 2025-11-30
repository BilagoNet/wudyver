import axios from "axios";
import * as cheerio from "cheerio";
class AnimeKuIndo {
  constructor() {
    this.baseURL = "https://animekuindo.live";
    this.headers = {
      authority: "www.blogger.com",
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
      "accept-language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
      referer: "https://animekuindo.live/",
      "user-agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Mobile Safari/537.36",
      "sec-ch-ua": '"Chromium";v="127", "Not)A;Brand";v="99", "Microsoft Edge Simulate";v="127", "Lemur";v="127"',
      "sec-ch-ua-mobile": "?1",
      "sec-ch-ua-platform": '"Android"',
      "sec-fetch-dest": "document",
      "sec-fetch-mode": "navigate",
      "sec-fetch-site": "none",
      "upgrade-insecure-requests": "1",
      priority: "u=0, i"
    };
  }
  cleanText(str) {
    return str?.replace(/\n/g, " ")?.replace(/\s+/g, " ")?.trim() || "";
  }
  async fetchHtml(url, customHeaders = {}) {
    const finalHeaders = {
      ...this.headers,
      ...customHeaders
    };
    try {
      console.log(`[LOG] HTTP GET: ${url}`);
      const {
        data
      } = await axios.get(url, {
        headers: finalHeaders
      });
      return data;
    } catch (error) {
      console.error(`[ERROR] Fetch Fail [${url}]: ${error.message}`);
      return null;
    }
  }
  async search({
    query,
    limit = 5,
    detail = false,
    download = false
  }) {
    const resultContainer = [];
    try {
      const searchUrl = `${this.baseURL}/?s=${encodeURIComponent(query)}`;
      console.log(`[LOG] Search Start: ${query}`);
      const html = await this.fetchHtml(searchUrl);
      if (!html) return {
        status: false,
        message: "Empty HTML"
      };
      const $ = cheerio.load(html);
      const articles = $(".listupd article.bs").toArray();
      let count = 0;
      for (const el of articles) {
        if (count >= limit) break;
        try {
          const node = $(el);
          let aTag = node.find(".bsx a.tip");
          if (aTag.length === 0) aTag = node.find('.bsx a[itemprop="url"]');
          const href = aTag.attr("href");
          if (href && !href.includes("t.me") && href.startsWith("http")) {
            const baseInfo = {
              title: this.cleanText(node.find(".tt h2").text()),
              url: href,
              thumb: node.find("img").attr("src"),
              type: this.cleanText(node.find(".typez").text()),
              status: this.cleanText(node.find(".status").text()) || "Ongoing",
              ep: this.cleanText(node.find(".bt .epx").text())
            };
            if (detail) {
              console.log(`[LOG] Getting Detail for: ${baseInfo.title}`);
              const detailData = await this.detail({
                url: href
              });
              if (detailData.status) {
                baseInfo.details = detailData.data;
                if (download && detailData.data.episode_list?.length > 0) {
                  const epTarget = detailData.data.episode_list[0];
                  if (epTarget && epTarget.url) {
                    console.log(`[LOG] Getting Stream Data for Ep: ${epTarget.title}`);
                    const dlData = await this.download({
                      url: epTarget.url
                    });
                    if (dlData.status) {
                      baseInfo.latest_episode_stream = dlData.data;
                    }
                  }
                }
              }
            }
            resultContainer.push(baseInfo);
            count++;
          }
        } catch (innerErr) {
          console.error(`[WARN] Error parsing item ${count}: ${innerErr.message}`);
        }
      }
      return {
        status: true,
        count: resultContainer.length,
        data: resultContainer
      };
    } catch (err) {
      console.error("[ERROR] Search Process:", err.message);
      return {
        status: false,
        message: err.message
      };
    }
  }
  async detail({
    url
  }) {
    try {
      const html = await this.fetchHtml(url);
      if (!html) throw new Error("Empty detail HTML");
      const $ = cheerio.load(html);
      const metaInfo = {};
      $(".spe span").each((i, el) => {
        const node = $(el);
        let key = node.find("b").text().replace(":", "").trim();
        node.find("b").remove();
        let val = node.text().trim();
        if (node.find("a").length > 0) {
          val = node.find("a").map((_, a) => $(a).text().trim()).get().join(", ");
        }
        if (key) {
          key = key.toLowerCase().replace(/\s/g, "_");
          metaInfo[key] = val;
        }
      });
      const episodes = [];
      $(".eplister ul li").each((i, el) => {
        try {
          episodes.push({
            title: this.cleanText($(el).find(".epl-title").text()),
            num: this.cleanText($(el).find(".epl-num").text()),
            date: this.cleanText($(el).find(".epl-date").text()),
            url: $(el).find("a").attr("href")
          });
        } catch (e) {}
      });
      const result = {
        title: this.cleanText($(".infox h1.entry-title").text()),
        alt_title: this.cleanText($(".infox .alter").text()),
        thumb: $(".thumb img").attr("src"),
        rating: $(".rating strong").text().replace("Rating", "").trim(),
        synopsis: this.cleanText($('.entry-content[itemprop="description"]').text()),
        genres: $(".genxed a").map((_, el) => $(el).text().trim()).get(),
        metadata: metaInfo,
        episode_list: episodes
      };
      return {
        status: true,
        data: result
      };
    } catch (e) {
      console.error("[ERROR] Detail Scraper:", e.message);
      return {
        status: false
      };
    }
  }
  async download({
    url
  }) {
    try {
      console.log(`[LOG] Extracting Video Page: ${url}`);
      const html = await this.fetchHtml(url);
      if (!html) throw new Error("Empty download HTML");
      const $ = cheerio.load(html);
      const title = this.cleanText($(".entry-title").text());
      const targetUrls = new Set();
      const mainFrame = $("#pembed iframe").attr("src") || $("#embed_holder iframe").attr("src");
      if (mainFrame) targetUrls.add(mainFrame);
      $("select.mirror option").each((i, el) => {
        const val = $(el).val();
        if (val && !$(el).text().includes("Pilih")) {
          let decoded = val;
          if (!val.startsWith("http") && val.length > 20) {
            try {
              const buffer = Buffer.from(val, "base64").toString("utf-8");
              const matchSrc = buffer.match(/src="([^"]+)"/);
              if (matchSrc) decoded = matchSrc[1];
              else if (buffer.startsWith("http")) decoded = buffer;
            } catch (e) {}
          }
          if (decoded.startsWith("http")) targetUrls.add(decoded);
        }
      });
      const blogLinks = [];
      targetUrls.forEach(u => {
        if (u.includes("blogger.com") || u.includes("video.g")) blogLinks.push(u);
      });
      console.log(`[LOG] Found ${blogLinks.length} blogger/google video sources to process.`);
      const finalStreams = [];
      const blogHeaders = {
        Authority: "www.blogger.com",
        Referer: this.baseURL + "/",
        "User-Agent": this.headers["user-agent"]
      };
      for (const blogUrl of blogLinks) {
        try {
          const frameHtml = await this.fetchHtml(blogUrl, blogHeaders);
          if (frameHtml) {
            const $f = cheerio.load(frameHtml);
            let extracted = false;
            $f("script").each((_, sc) => {
              if (extracted) return;
              const content = $f(sc).html();
              if (content && content.includes("VIDEO_CONFIG")) {
                const match = content.match(/var\s+VIDEO_CONFIG\s*=\s*(\{.*\});?/);
                if (match && match[1]) {
                  try {
                    const json = JSON.parse(match[1]);
                    if (json.streams && Array.isArray(json.streams)) {
                      json.streams.forEach(st => {
                        if (!finalStreams.find(s => s.url === st.play_url)) {
                          let qName = `Unknown (ID:${st.format_id})`;
                          if (st.format_id == 18) qName = "360p (MP4)";
                          else if (st.format_id == 22) qName = "720p (MP4)";
                          else if (st.format_id == 37) qName = "1080p (MP4)";
                          finalStreams.push({
                            quality: qName,
                            format_id: st.format_id,
                            url: st.play_url
                          });
                        }
                      });
                      extracted = true;
                    }
                  } catch (jsonErr) {
                    console.log(`[WARN] JSON Parse Failed for ${blogUrl}: ${jsonErr.message}`);
                  }
                }
              }
            });
          }
        } catch (blogErr) {
          console.error(`[WARN] Failed accessing ${blogUrl}: ${blogErr.message}`);
        }
      }
      finalStreams.sort((a, b) => b.format_id - a.format_id);
      const manualLinks = [];
      $(".entry-content p a").each((_, a) => {
        const lnk = $(a).attr("href");
        if (lnk && lnk.startsWith("http") && !lnk.match(/facebook|twitter/)) {
          manualLinks.push({
            label: $(a).text(),
            url: lnk
          });
        }
      });
      return {
        status: true,
        data: {
          episode_title: title,
          video_streams: finalStreams,
          manual_links: manualLinks,
          mirrors_list: Array.from(targetUrls)
        }
      };
    } catch (e) {
      console.error("[ERROR] Download Scraper:", e.message);
      return {
        status: false,
        message: e.message
      };
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
      error: "Parameter 'action' wajib diisi.",
      actions: ["home", "search", "detail", "download"]
    });
  }
  const api = new AnimeKuIndo();
  try {
    let response;
    switch (action) {
      case "home":
        response = await api.home();
        break;
      case "search":
        if (!params.query) {
          return res.status(400).json({
            error: "Parameter 'query' wajib diisi untuk action 'search'."
          });
        }
        response = await api.search(params);
        break;
      case "detail":
        if (!params.url) {
          return res.status(400).json({
            error: "Parameter 'url' wajib diisi untuk action 'detail'. Contoh url: https://animekuindo.live/anime/boku-no-hero.../"
          });
        }
        response = await api.detail(params);
        break;
      case "download":
        if (!params.url) {
          return res.status(400).json({
            error: "Parameter 'url' wajib diisi untuk action 'download'. URL harus berupa halaman episode, bukan halaman info anime."
          });
        }
        response = await api.download(params);
        break;
      default:
        return res.status(400).json({
          error: `Action tidak valid: ${action}.`,
          valid_actions: ["home", "search", "detail", "download"]
        });
    }
    return res.status(200).json(response);
  } catch (error) {
    console.error(`[FATAL ERROR] Kegagalan pada action '${action}':`, error);
    return res.status(500).json({
      status: false,
      error: error.message || "Terjadi kesalahan internal pada server."
    });
  }
}
import axios from "axios";
import * as cheerio from "cheerio";
class TgstatScraper {
  constructor() {
    this.base_url = "https://tgstat.com";
    this.headers = {
      Accept: "*/*",
      "Accept-Language": "id-ID,id;q=0.9",
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Mobile Safari/537.36",
      "X-Requested-With": "XMLHttpRequest",
      Origin: this.base_url,
      Referer: `${this.base_url}/channel/XWcyP8XkkNk4NGI1`,
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "same-origin"
    };
  }
  async search({
    query,
    limit = 5
  }) {
    try {
      const response = await axios.post(`${this.base_url}/channels/global-search`, `query=${encodeURIComponent(query)}`, {
        headers: this.headers
      });
      const {
        html
      } = response.data;
      const $ = cheerio.load(html);
      const results = [];
      const items = $(".dropdown-item.notify-item.px-2.py-0").slice(0, limit);
      items.each((index, el) => {
        const $item = $(el);
        const isTag = $item.is('a[href^="/tag/"]');
        if (isTag) {
          const tagLink = $item.attr("href") || "";
          const tagName = $item.find("h5").text().trim() || "";
          const countText = $item.find("small").text().trim() || "";
          const count = parseInt(countText.match(/(\d+)/)?.[1]) || 0;
          results.push({
            type: "tag",
            rank: index + 1,
            link: `${this.base_url}${tagLink}`,
            name: tagName,
            count: count
          });
        } else {
          const mediaBody = $item.find(".media-body");
          const channelLink = mediaBody.find("a").attr("href") || "";
          const channelTitle = mediaBody.find("h5").text().trim() || "";
          const avatarUrl = $item.find(".my-1.mr-1 img").attr("src") || "";
          const subscribersText = mediaBody.find("small").text().trim() || "";
          const subscribersMatch = subscribersText.match(/(\d+\.?\d*)k/);
          const subscribers = subscribersMatch ? parseFloat(subscribersMatch[1]) * 1e3 : parseInt(subscribersText.match(/(\d+)/)?.[1]) || 0;
          results.push({
            type: "channel",
            rank: index + 1,
            link: channelLink,
            title: channelTitle,
            subscribers: subscribers,
            avatar_url: avatarUrl
          });
        }
      });
      return {
        success: true,
        query: query,
        limit: limit,
        count: results.length,
        results: results
      };
    } catch (error) {
      console.error(error);
      return {
        success: false,
        error: error.message || "Internal Server Error",
        query: query,
        limit: limit,
        count: 0,
        results: []
      };
    }
  }
}
export default async function handler(req, res) {
  const params = req.method === "GET" ? req.query : req.body;
  if (!params.query) {
    return res.status(400).json({
      error: "Paramenter 'query' is required."
    });
  }
  const tgstatScraper = new TgstatScraper();
  try {
    const search_response = await tgstatScraper.search(params);
    return res.status(200).json(search_response);
  } catch (error) {
    res.status(500).json({
      error: error.message || "Internal Server Error"
    });
  }
}
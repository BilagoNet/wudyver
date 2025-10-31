import axios from "axios";
import * as cheerio from "cheerio";
import {
  CookieJar
} from "tough-cookie";
import {
  wrapper
} from "axios-cookiejar-support";
class DramaScraper {
  constructor() {
    this.baseUrl = "https://www.dramaboxdb.com";
    const jar = new CookieJar();
    this.client = wrapper(axios.create({
      jar: jar,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36"
      }
    }));
    console.log("[Info] Scraper diinisialisasi dengan dukungan cookie.");
  }
  async _fetch(url) {
    try {
      const {
        data
      } = await this.client.get(url);
      return data;
    } catch (error) {
      console.error(`[Gagal Fetch] URL: ${url} | Error: ${error.message}`);
      return null;
    }
  }
  async search({
    query
  }) {
    const searchUrl = `${this.baseUrl}/in/search?searchValue=${encodeURIComponent(query)}`;
    console.log(`[Proses] Mencari: "${query}"`);
    try {
      const html = await this._fetch(searchUrl);
      if (!html) throw new Error("HTML tidak diterima.");
      const $ = cheerio.load(html);
      const results = [];
      const headerInfo = {
        result_count: $(".search_searchHeader__bL0IU span").first().text().trim() || "N/A",
        query_term: $(".search_searchHeader__bL0IU span").last().text().trim() || query
      };
      $("div.SearchBookList_imageItem1Wrap__dvPmc").each((i, el) => {
        const element = $(el);
        const urlPath = element.find("a.SearchBookList_bookImage__UZXmx")?.attr("href") || element.find("a.SearchBookList_bookName__b9_My")?.attr("href") || "";
        results.push({
          title: element.find("a.SearchBookList_bookName__b9_My")?.text()?.trim() || "N/A",
          url: urlPath ? `${this.baseUrl}${urlPath}` : "N/A",
          thumbnail: element.find("img.image_imageItem__IZeBT")?.attr("src") || "N/A",
          synopsis: element.find("a.SearchBookList_intro__njsZB")?.text()?.trim() || "N/A",
          episode_info: element.find("a.SearchBookList_bookLine2__AwS01")?.text()?.trim() || "N/A",
          genre: element.find("a.SearchBookList_bookLine3__iajIo")?.text()?.trim() || "N/A",
          action_button: {
            text: element.find("a.SearchBookList_readBtn__cuC88")?.text()?.trim() || "N/A",
            url: (element.find("a.SearchBookList_readBtn__cuC88")?.attr("href") || "").startsWith("http") ? element.find("a.SearchBookList_readBtn__cuC88")?.attr("href") : this.baseUrl + (element.find("a.SearchBookList_readBtn__cuC88")?.attr("href") || "")
          }
        });
      });
      console.log(results.length > 0 ? `[Sukses] Ditemukan ${results.length} hasil.` : "[Info] Tidak ada hasil ditemukan.");
      return {
        search_info: headerInfo,
        results: results
      };
    } catch (error) {
      console.error(`[Gagal Search] Terjadi kesalahan: ${error.message}`);
      return {
        search_info: {},
        results: []
      };
    }
  }
  async detail({
    url
  }) {
    console.log(`[Proses] Mengambil detail dari: ${url}`);
    try {
      const initialHtml = await this._fetch(url);
      if (!initialHtml) throw new Error("Gagal mengambil halaman awal.");
      let $ = cheerio.load(initialHtml);
      let movieUrl = url;
      if (url.includes("/ep/")) {
        const moviePath = $('a[href*="/in/movie/"]')?.attr("href");
        if (!moviePath) throw new Error("URL film utama tidak ditemukan.");
        movieUrl = `${this.baseUrl}${moviePath}`;
      }
      const movieHtml = url === movieUrl ? initialHtml : await this._fetch(movieUrl);
      if (!movieHtml) throw new Error("Gagal mengambil halaman detail film.");
      $ = cheerio.load(movieHtml);
      const episodes = [];
      $(".pcSeries_listItem__sd0Xp").each((i, el) => {
        const linkEl = $(el).find("a.pcSeries_rightIntro__UFC_8");
        const path = linkEl.attr("href");
        episodes.push({
          title: linkEl.find(".pcSeries_title__R9vip")?.text()?.trim() || "N/A",
          episode: linkEl.find(".pcSeries_pageNum__xkXBk")?.text()?.trim() || `Eps ${i + 1}`,
          url: path ? `${this.baseUrl}${path}` : "N/A",
          thumbnail: $(el).find("img")?.attr("src") || "N/A"
        });
      });
      const shareButtons = [];
      $("div.share_shareBox__barw_ img").each((i, el) => {
        shareButtons.push($(el).attr("title") || "N/A");
      });
      const detailData = {
        title: $("h1.film_bookName__ys_T3")?.text()?.trim() || "N/A",
        total_episodes: $("p.film_pcEpiNum__9Ja7z")?.text()?.trim() || "N/A",
        thumbnail: $("img.film_bookCover__YRcsa")?.attr("src") || "N/A",
        synopsis: $("p.film_pcIntro__BB1Ox")?.text()?.trim() || "N/A",
        genres: $("a.film_tagItem__qLwLn").map((i, el) => $(el).text()).get(),
        breadcrumbs: $(".breadcrumb_crumbItem__gzO8K").map((i, el) => $(el).text().trim()).get(),
        play_button_url: this.baseUrl + ($(".film_playBtn__yM_Mp")?.attr("href") || ""),
        share_on: shareButtons,
        episodes: episodes
      };
      console.log(`[Sukses] Detail untuk "${detailData.title}" berhasil diambil.`);
      return detailData;
    } catch (error) {
      console.error(`[Gagal Detail] Terjadi kesalahan: ${error.message}`);
      return {};
    }
  }
  async download({
    url
  }) {
    console.log(`[Proses] Mengekstrak link video dari: ${url}`);
    try {
      const html = await this._fetch(url);
      if (!html) throw new Error("HTML tidak diterima.");
      const $ = cheerio.load(html);
      const videoElement = $("video#videoId");
      let videoUrl = videoElement?.attr("src");
      if (!videoUrl) {
        console.log("[Info] Atribut src kosong, mencoba fallback dengan regex match...");
        const regex = /(https?:\/\/[^"']+\.m3u8\?[^"']+)/;
        const match = html.match(regex);
        videoUrl = match ? match[0] : null;
      }
      const episodeList = [];
      $(".RightList_tabContent__E2D_a a").each((i, el) => {
        const link = $(el);
        const path = link.attr("href");
        episodeList.push({
          episode_number: link.text().trim(),
          url: path ? `${this.baseUrl}${path}` : "N/A",
          is_active: link.hasClass("RightList_linkTextActive__i__9F"),
          is_locked: link.hasClass("RightList_linkTextLock__zb1G6")
        });
      });
      const result = {
        source: videoUrl || "Tidak Ditemukan",
        poster: videoElement?.attr("poster") || "N/A",
        episode_title: $(".breadcrumb_lastTxt__cdw0_").text() || "N/A",
        current_episode_info: $(".RightList_current__B8KDw").text() || "N/A",
        available_episodes: episodeList
      };
      console.log(result.source !== "Tidak Ditemukan" ? "[Sukses] Link video ditemukan." : "[Peringatan] Link video tidak ditemukan.");
      return result;
    } catch (error) {
      console.error(`[Gagal Download] Terjadi kesalahan: ${error.message}`);
      return {};
    }
  }
}
export default async function handler(req, res) {
  const {
    action,
    ...params
  } = req.method === "GET" ? req.query : req.body;
  const scraper = new DramaScraperAPI();
  try {
    let result;
    switch (action) {
      case "search":
        if (!params.query) {
          return res.status(400).json({
            error: "Paramenter 'query' dibutuhkan untuk action 'search'"
          });
        }
        result = await scraper.search(params);
        break;
      case "detail":
        if (!params.url) {
          return res.status(400).json({
            error: "Paramenter 'url' dibutuhkan untuk action 'detail'"
          });
        }
        result = await scraper.detail(params);
        break;
      case "download":
        if (!params.url) {
          return res.status(400).json({
            error: "Paramenter 'url' dibutuhkan untuk action 'download'"
          });
        }
        result = await scraper.download(params);
        break;
      default:
        return res.status(400).json({
          error: `Action tidak valid: '${action}'. Pilihan yang tersedia: search | detail | download`
        });
    }
    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({
      error: "Terjadi kesalahan pada server",
      details: error.message
    });
  }
}
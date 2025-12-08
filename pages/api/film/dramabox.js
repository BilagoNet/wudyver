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
    this.apiBaseUrl = "https://sapi.dramaboxdb.com/drama-box";
    const jar = new CookieJar();
    this.client = wrapper(axios.create({
      jar: jar,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36"
      }
    }));
    this.tokenData = {
      token: "ZXlKMGVYQWlPaUpLVjFRaUxDSmhiR2NpT2lKSVV6STFOaUo5LmV5SnlaV2RwYzNSbGNsUjVjR1VpT2lKVVJVMVFJaXdpZFhObGNrbGtJam96TlRjME5Ua3lOemw5LjRFekRoVlRpY1FNczF6d2ZjdldXaS0zNkM2ekNsbERYWml1RTlmMHVuOXc=",
      deviceid: "55187861-d428-42c2-845a-a96d14eb8d36",
      androidid: "ffffffffc118ce9a06dcd189e61a564b16144f0d00000000"
    };
    console.log("[Info] Scraper diinisialisasi dengan dukungan cookie dan API.");
  }
  setTokenData(tokenData) {
    this.tokenData = tokenData;
  }
  _getApiHeaders() {
    if (!this.tokenData) {
      throw new Error("Token data belum di-set. Gunakan setTokenData() terlebih dahulu.");
    }
    return {
      "User-Agent": "okhttp/4.10.0",
      "Accept-Encoding": "gzip",
      "Content-Type": "application/json",
      tn: `Bearer ${this.tokenData.token}`,
      version: "430",
      vn: "4.3.0",
      cid: "DRA1000042",
      "package-name": "com.storymatrix.drama",
      apn: "1",
      "device-id": this.tokenData.deviceid,
      language: "in",
      "current-language": "in",
      p: "43",
      "time-zone": "+0800",
      "content-type": "application/json; charset=UTF-8"
    };
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
  async _apiPost(endpoint, data) {
    try {
      const headers = this._getApiHeaders();
      const response = await axios.post(`${this.apiBaseUrl}${endpoint}`, data, {
        headers: headers
      });
      return response.data;
    } catch (error) {
      console.error(`[Gagal API] Endpoint: ${endpoint} | Error: ${error.message}`);
      throw error;
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
  async theater({
    pageNo = 1,
    index = 1,
    channelId = 43
  } = {}) {
    console.log(`[Proses API] Mengambil theater list - Page: ${pageNo}`);
    try {
      const data = {
        newChannelStyle: 1,
        isNeedRank: 1,
        pageNo: pageNo,
        index: index,
        channelId: channelId
      };
      const response = await this._apiPost("/he001/theater", data);
      console.log(`[Sukses API] Theater list berhasil diambil.`);
      return response.data;
    } catch (error) {
      console.error(`[Gagal API Theater] ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }
  async batch({
    bookId,
    index = 1
  } = {}) {
    if (!bookId) {
      throw new Error("Parameter 'bookId' wajib diisi untuk action 'batch'");
    }
    console.log(`[Proses API] Mengambil batch data - BookID: ${bookId}, Episode: ${index}`);
    try {
      const data = {
        boundaryIndex: 0,
        comingPlaySectionId: -1,
        index: index,
        currencyPlaySource: "discover_new_rec_new",
        needEndRecommend: 0,
        currencyPlaySourceName: "",
        preLoad: false,
        rid: "",
        pullCid: "",
        loadDirection: 0,
        startUpKey: "",
        bookId: bookId
      };
      const response = await this._apiPost("/chapterv2/batch/load", data);
      console.log(`[Sukses API] Batch data berhasil diambil.`);
      return response.data;
    } catch (error) {
      console.error(`[Gagal API Batch] ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }
  async suggest({
    keyword
  } = {}) {
    if (!keyword) {
      throw new Error("Parameter 'keyword' wajib diisi untuk action 'suggest'");
    }
    console.log(`[Proses API] Mencari dengan suggest - Keyword: "${keyword}"`);
    try {
      const data = {
        keyword: keyword
      };
      const response = await this._apiPost("/search/suggest", data);
      console.log(`[Sukses API] Suggest list berhasil diambil.`);
      return response.data;
    } catch (error) {
      console.error(`[Gagal API Suggest] ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }
}
export default async function handler(req, res) {
  const {
    action,
    ...params
  } = req.method === "GET" ? req.query : req.body;
  const scraper = new DramaScraper();
  try {
    let result;
    switch (action) {
      case "search":
        if (!params.query) {
          return res.status(400).json({
            error: "Parameter 'query' dibutuhkan untuk action 'search'"
          });
        }
        result = await scraper.search(params);
        break;
      case "detail":
        if (!params.url) {
          return res.status(400).json({
            error: "Parameter 'url' dibutuhkan untuk action 'detail'"
          });
        }
        result = await scraper.detail(params);
        break;
      case "download":
        if (!params.url) {
          return res.status(400).json({
            error: "Parameter 'url' dibutuhkan untuk action 'download'"
          });
        }
        result = await scraper.download(params);
        break;
      case "theater":
        result = await scraper.theater(params);
        break;
      case "batch":
        if (!params.bookId) {
          return res.status(400).json({
            error: "Parameter 'bookId' dibutuhkan untuk action 'batch'"
          });
        }
        result = await scraper.batch(params);
        break;
      case "suggest":
        if (!params.keyword) {
          return res.status(400).json({
            error: "Parameter 'keyword' dibutuhkan untuk action 'suggest'"
          });
        }
        result = await scraper.suggest(params);
        break;
      default:
        return res.status(400).json({
          error: `Action tidak valid: '${action}'. Pilihan: search | detail | download | theater | batch | suggest`
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
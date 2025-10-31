import axios from "axios";
class AnimeKita {
  constructor() {
    this.client = axios.create({
      baseURL: "https://apps.animekita.org/api/v1.1.9",
      headers: {
        "user-agent": "Dart/3.1 (dart:io)",
        "accept-encoding": "gzip",
        host: "apps.animekita.org"
      }
    });
  }
  async do_request({
    path = "",
    ...rest
  }) {
    try {
      console.log(`[REQUEST] ${path}`);
      const {
        data
      } = await this.client(path, rest);
      console.log(`[SUCCESS] ${path}`);
      return data;
    } catch (err) {
      console.error(`[ERROR] ${path}:`, err?.message || "Unknown error");
      throw new Error(err?.message || "Request failed");
    }
  }
  async new_uploads({
    page = "1"
  } = {}) {
    if (isNaN(page)) throw new Error("Invalid page");
    return await this.do_request({
      path: `/baruupload.php?page=${page}`
    });
  }
  async movie_list() {
    return await this.do_request({
      path: "/movie.php"
    });
  }
  async get_schedule() {
    return await this.do_request({
      path: "/jadwal.php"
    });
  }
  async anime_list() {
    return await this.do_request({
      path: "/anime-list.php"
    });
  }
  async get_genre({
    genre = "",
    page = "1"
  } = {}) {
    const valid_genres = ["action", "adventure", "comedy", "demons", "drama", "ecchi", "fantasy", "game", "harem", "historical", "horror", "josei", "magic", "martial-arts", "mecha", "military", "music", "mystery", "psychological", "parody", "police", "romance", "samurai", "school", "sci-fi", "seinen", "shoujo", "shoujo-ai", "shounen", "slice-of-life", "sports", "space", "super-power", "supernatural", "thriller", "vampire", "yaoi", "yuri"];
    if (!valid_genres.includes(genre)) throw new Error(`Valid genres: ${valid_genres.join(", ")}`);
    if (isNaN(page)) throw new Error("Invalid page");
    return await this.do_request({
      path: `/genreseries.php?url=${genre}/&page=${page}`
    });
  }
  async search_anime({
    query = ""
  } = {}) {
    if (!query) throw new Error("Query required");
    return await this.do_request({
      path: `/search.php?keyword=${query}`
    });
  }
  async get_detail({
    url = ""
  } = {}) {
    if (!url) throw new Error("URL required");
    return await this.do_request({
      path: `/series.php?url=${url}`
    });
  }
  async get_episode({
    url = "",
    reso = "720p"
  } = {}) {
    const valid_resolutions = ["320p", "480p", "720p", "1080p", "4K"];
    if (!url) throw new Error("URL required");
    if (!valid_resolutions.includes(reso)) throw new Error(`Valid resolutions: ${valid_resolutions.join(", ")}`);
    return await this.do_request({
      path: `/chapter.php?url=${url}&reso=${reso}`
    });
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
  const api = new AnimeKita();
  try {
    let response;
    switch (action) {
      case "new_uploads":
        response = await api.new_uploads(params);
        break;
      case "movie_list":
        response = await api.movie_list();
        break;
      case "schedule":
        response = await api.get_schedule();
        break;
      case "anime_list":
        response = await api.anime_list();
        break;
      case "genre":
        if (!params.genre) {
          return res.status(400).json({
            error: "Paramenter 'genre' wajib diisi untuk action 'genre'."
          });
        }
        response = await api.get_genre(params);
        break;
      case "search":
        if (!params.query) {
          return res.status(400).json({
            error: "Paramenter 'query' wajib diisi untuk action 'search'."
          });
        }
        response = await api.search_anime(params);
        break;
      case "detail":
        if (!params.url) {
          return res.status(400).json({
            error: "Paramenter 'url' wajib diisi untuk action 'detail'."
          });
        }
        response = await api.get_detail(params);
        break;
      case "episode":
        if (!params.url) {
          return res.status(400).json({
            error: "Paramenter 'url' wajib diisi untuk action 'episode'."
          });
        }
        response = await api.get_episode(params);
        break;
      default:
        return res.status(400).json({
          error: `Action tidak valid: ${action}. Action yang didukung: 'new_uploads', 'movie_list', 'schedule', 'anime_list', 'genre', 'search', 'detail', dan 'episode'.`
        });
    }
    return res.status(200).json(response);
  } catch (error) {
    console.error(`[FATAL ERROR] Kegagalan pada action '${action}':`, error);
    return res.status(500).json({
      error: error?.message || "Terjadi kesalahan internal pada server."
    });
  }
}
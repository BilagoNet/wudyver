import axios from "axios";
import {
  wrapper
} from "axios-cookiejar-support";
import {
  CookieJar
} from "tough-cookie";
import qs from "qs";
import SpoofHead from "@/lib/spoof-head";
class FreePdfDownloader {
  constructor() {
    this.jar = new CookieJar();
    this.client = wrapper(axios.create({
      jar: this.jar,
      withCredentials: true,
      headers: {
        authority: "anydebrid.com",
        accept: "*/*",
        "accept-language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
        "user-agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Mobile Safari/537.36",
        "sec-ch-ua": '"Chromium";v="127", "Not)A;Brand";v="99"',
        "sec-ch-ua-mobile": "?1",
        "sec-ch-ua-platform": '"Android"',
        origin: "https://anydebrid.com",
        referer: "https://anydebrid.com/",
        "upgrade-insecure-requests": "1",
        ...SpoofHead()
      }
    }));
    this.baseUrl = "https://anydebrid.com";
  }
  solveObfuscation(html) {
    try {
      const dataMatch = html.match(/var\s+_0xd4t4\s*=\s*'([^']+)'/);
      const keyMatch = html.match(/var\s+_0xk3y\s*=\s*'([^']+)'/);
      const noiseMatch = html.match(/var\s+_0xn0is3\s*=\s*'([^']+)'/);
      if (!dataMatch || !keyMatch || !noiseMatch) return null;
      const _0xd4t4 = dataMatch[1];
      const _0xk3y = keyMatch[1];
      const _0xn0is3 = noiseMatch[1];
      let s = _0xd4t4.substring(8, _0xd4t4.length - 8);
      s = s.split(_0xn0is3).join("");
      s = s.split("").reverse().join("");
      s = Buffer.from(s, "base64").toString("binary");
      s = s.replace(/[a-zA-Z]/g, function(c) {
        const code = c.charCodeAt(0) + 13;
        const limit = c <= "Z" ? 90 : 122;
        return String.fromCharCode(limit >= code ? code : code - 26);
      });
      const keyBytes = [];
      for (let i = 0; i < _0xk3y.length; i += 2) {
        keyBytes.push(parseInt(_0xk3y.substr(i, 2), 16));
      }
      let result = "";
      for (let i = 0; i < s.length; i++) {
        result += String.fromCharCode(s.charCodeAt(i) ^ keyBytes[i % keyBytes.length]);
      }
      return JSON.parse(result);
    } catch (e) {
      console.error("[ERROR] Gagal mendekode obfuskasi:", e.message);
      return null;
    }
  }
  atob(str) {
    return Buffer.from(str || "", "base64").toString("utf-8");
  }
  async postApi(params) {
    const {
      link,
      lang,
      token
    } = params;
    const payload = {
      link: link,
      lang: lang || "",
      chck: ",",
      chck2: ","
    };
    const targetUrl = `${this.baseUrl}/api?mode=plg&token=${token || "__"}`;
    const res = await this.client.post(targetUrl, qs.stringify(payload), {
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        referer: "https://anydebrid.com/article/cloud-computing-technology"
      }
    });
    return res?.data;
  }
  async fetchFile(encLink, ticket, next) {
    const finalUrl = this.atob(encLink);
    console.log(`[LOG] Mengunduh dari: ${finalUrl}`);
    const res = await this.client.post(finalUrl, qs.stringify({
      ticket: ticket || "",
      next: next || ""
    }), {
      responseType: "arraybuffer",
      maxRedirects: 5,
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        referer: this.baseUrl
      }
    });
    const disposition = res.headers["content-disposition"];
    let filename = `downloaded_${Date.now()}.pdf`;
    if (disposition && disposition.includes("filename=")) {
      const match = disposition.match(/filename=["']?([^"';]+)["']?/);
      if (match && match[1]) {
        filename = match[1];
      }
    }
    return {
      buffer: res.data,
      filename: filename,
      mimetype: res.headers["content-type"] || "application/pdf",
      size: res.headers["content-length"] || res.data.length
    };
  }
  async upload({
    buffer,
    filename
  }) {
    console.log(`[LOG] Uploading to put.icu (${filename})...`);
    try {
      const res = await axios.put("https://put.icu/upload/", buffer, {
        headers: {
          Accept: "application/json",
          "X-File-Name": filename,
          "Content-Type": "application/octet-stream"
        }
      });
      return res?.data;
    } catch (e) {
      console.log("[WARN] Upload gagal, mengembalikan null.");
      return null;
    }
  }
  async download({
    url
  }) {
    try {
      console.log("[LOG] Memulai proses AnyDebrid...");
      if (!url) throw new Error("URL Scribd diperlukan.");
      console.log("[LOG] Mengambil halaman utama & memecahkan token...");
      const pageRes = await this.client.get(`${this.baseUrl}/`);
      const config = this.solveObfuscation(pageRes.data);
      if (!config || !config.lang) {
        throw new Error("Gagal mendapatkan parameter lang/token dari halaman.");
      }
      const lang = config.lang;
      const token = config.token || "__";
      console.log(`[LOG] Token didapat: ${token}, Lang length: ${lang.length}`);
      console.log("[LOG] Mengirim request convert...");
      const apiRes = await this.postApi({
        link: url,
        lang: lang,
        token: token
      });
      if (apiRes?.error_code || !apiRes?.link) {
        if (apiRes?.left) throw new Error(`Limit Scribd AnyDebrid: ${apiRes.left}`);
        throw new Error("Gagal generate link. Response: " + JSON.stringify(apiRes));
      }
      console.log(`[LOG] File ditemukan: ${apiRes.name} (Host: ${apiRes.host})`);
      const fileData = await this.fetchFile(apiRes.link, apiRes.ticket, apiRes.next);
      console.log(`[LOG] Download selesai. Ukuran: ${(fileData.size / 1024 / 1024).toFixed(2)} MB`);
      const finalName = apiRes.name ? `${apiRes.name}.pdf` : fileData.filename;
      const uploadRes = await this.upload({
        buffer: fileData.buffer,
        filename: finalName
      });
      console.log("[LOG] Selesai!");
      return {
        status: true,
        name: finalName,
        size: fileData.size,
        mime: fileData.mimetype,
        title: apiRes?.name,
        host: apiRes?.host,
        ...uploadRes
      };
    } catch (error) {
      console.log("[ERROR]", error?.message || error);
      return {
        status: false,
        message: error?.message || "Terjadi kesalahan"
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
  const api = new FreePdfDownloader();
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
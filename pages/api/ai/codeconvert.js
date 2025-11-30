import axios from "axios";
import SpoofHead from "@/lib/spoof-head";
class CodeConvert {
  constructor() {
    this.cfg = {
      base: "https://www.codeconvert.ai/api",
      ep: {
        generate: "/free-generate",
        convert: "/free-convert",
        explain: "/free-explain",
        remove: "/free-remove-code-comments"
      },
      langs: ["C++", "Golang", "Java", "JavaScript", "Python", "R", "C", "Csharp", "Julia", "Perl", "Matlab", "Kotlin", "PHP", "Ruby", "Rust", "TypeScript", "Lua", "SAS", "Fortran", "Lisp", "Scala", "Assembly", "ActionScript", "Clojure", "CoffeeScript", "Dart", "COBOL", "Elixir", "Groovy", "Erlang", "Haskell", "Pascal", "Swift", "Scheme", "Racket", "OCaml", "Elm", "Haxe", "Crystal", "Fsharp", "Tcl", "VB.NET", "Objective_C", "Ada", "Vala", "PySpark", "SQL", "PostgreSQL", "MySQL", "MongoDB", "CQL", "Redis", "Elasticsearch", "VB6", "VBA", "VBScript", "PowerShell", "Bash", "Delphi", "Zig", "Carbon", "Nim", "Grain", "Gleam", "Wren"],
      hdr: {
        accept: "*/*",
        "accept-language": "id-ID",
        "content-type": "application/json",
        origin: "https://www.codeconvert.ai",
        referer: "https://www.codeconvert.ai",
        "user-agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Mobile Safari/537.36",
        ...SpoofHead()
      },
      rules: {
        generate: ["code", "lang"],
        convert: ["code", "lang", "target"],
        explain: ["code", "lang"],
        remove: ["code", "lang"]
      },
      map: {
        generate: {
          code: "inputText",
          lang: "inputLang"
        },
        convert: {
          code: "inputCodeText",
          lang: "inputLang",
          target: "outputLang",
          instruction: "customInstruction"
        },
        explain: {
          code: "inputCodeText",
          lang: "inputLang",
          instruction: "customInstruction"
        },
        remove: {
          code: "inputCodeText",
          lang: "inputLang"
        }
      }
    };
  }
  validLang(lang) {
    return lang && this.cfg.langs.includes(lang);
  }
  validMode(mode) {
    return mode && this.cfg.ep?.[mode];
  }
  validInput(mode, data) {
    const rules = this.cfg.rules?.[mode] || [];
    const missing = rules.filter(k => !data?.[k]);
    if (missing.length > 0) {
      return {
        valid: false,
        message: `Missing required fields: ${missing.join(", ")}`
      };
    }
    if (data?.lang && !this.validLang(data.lang)) {
      return {
        valid: false,
        message: `Invalid lang: ${data.lang}`
      };
    }
    if (data?.target && !this.validLang(data.target)) {
      return {
        valid: false,
        message: `Invalid target: ${data.target}`
      };
    }
    return {
      valid: true,
      message: "Validation passed"
    };
  }
  mapInput(mode, data) {
    const mapping = this.cfg.map?.[mode] || {};
    const payload = {};
    Object.keys(data).forEach(k => {
      const key = mapping[k] || k;
      payload[key] = data[k];
    });
    return payload;
  }
  parseResult(data) {
    const result = data?.outputCodeText || data?.outputText || null;
    const {
      outputCodeText,
      outputText,
      ...info
    } = data || {};
    return {
      result: result,
      ...info
    };
  }
  req(url, data) {
    return axios.post(url, data, {
      headers: this.cfg.hdr
    });
  }
  async chat({
    mode,
    ...rest
  }) {
    console.log(`[chat] Mode: ${mode || "undefined"}`);
    if (!this.validMode(mode)) {
      const err = {
        error: true,
        message: `Invalid mode: ${mode}`
      };
      console.error(`[chat]`, err.message);
      return err;
    }
    const validation = this.validInput(mode, rest);
    if (!validation.valid) {
      const err = {
        error: true,
        message: validation.message
      };
      console.error(`[chat]`, err.message);
      return err;
    }
    const payload = this.mapInput(mode, rest);
    const ep = this.cfg.ep[mode];
    const url = `${this.cfg.base}${ep}`;
    console.log(`[chat] Request ->`, url);
    try {
      const res = await this.req(url, payload);
      const parsed = this.parseResult(res?.data);
      console.log(`[chat] Success:`, parsed?.result?.substring(0, 100) || parsed);
      return {
        error: false,
        ...parsed,
        message: "Success"
      };
    } catch (err) {
      const error = {
        error: true,
        message: err?.message || "Request failed",
        result: null
      };
      console.error(`[chat] Error:`, error.message);
      return error;
    }
  }
}
export default async function handler(req, res) {
  const params = req.method === "GET" ? req.query : req.body;
  const api = new CodeConvert();
  try {
    const data = await api.chat(params);
    return res.status(200).json(data);
  } catch (error) {
    const errorMessage = error.message || "Terjadi kesalahan saat memproses.";
    return res.status(500).json({
      error: errorMessage
    });
  }
}
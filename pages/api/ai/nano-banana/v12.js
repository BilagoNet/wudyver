import axios from 'axios';
import FormData from 'form-data';

/**
 * Class untuk berinteraksi dengan BananaAI API menggunakan CORS proxy dengan fallback.
 */
class BananaAIClient {
    /**
     * @param {object} [options] - Opsi konfigurasi.
     * @param {string[]} [options.proxies] - Daftar URL CORS proxy yang akan digunakan.
     */
    constructor(options = {}) {
        const defaultProxies = [
            'https://akinator.jack04309487.workers.dev',
            'https://cors.caliph.my.id'
        ];
        this.proxies = options.proxies || defaultProxies;
        this.targetUrl = 'https://bananaai.live';

        this.api = axios.create({
            headers: {
                'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Mobile Safari/537.36',
                'Referer': `${this.targetUrl}/`,
                'Origin': this.targetUrl,
            }
        });
    }

    /** @internal */
    async _fetchUrlAsBuffer(url) {
        try {
            const response = await this.api.get(url, { responseType: 'arraybuffer' });
            return Buffer.from(response.data);
        } catch (error) {
            console.error(`Gagal mengambil gambar dari URL: ${url}`, error.message);
            return null;
        }
    }

    /** @internal */
    async _normalizeImageToBuffer(data) {
        if (Buffer.isBuffer(data)) return data;
        if (typeof data === 'string') {
            return data.startsWith('http') ? this._fetchUrlAsBuffer(data) : Buffer.from(data, 'base64');
        }
        console.error('Format gambar tidak didukung:', typeof data);
        return null;
    }

    /**
     * Menghasilkan gambar berdasarkan prompt, dengan logika retry menggunakan proxy yang berbeda.
     * @returns {Promise<object>} Objek yang berisi URL hasil dan info lainnya.
     */
    async generate({ prompt, imageUrl, ...rest }) {
        for (const proxy of this.proxies) {
            try {
                const baseUrl = `${proxy}/${this.targetUrl}`;
                this.api.defaults.baseURL = baseUrl;
                console.log(`\n--- Mencoba dengan proxy: ${proxy} ---`);

                console.log('1. Mendapatkan token CSRF...');
                const csrfResponse = await this.api.get('/api/auth/csrf');
                const csrfToken = csrfResponse.data?.csrfToken || '';
                const csrfCookie = csrfResponse.headers['set-cookie']?.[0]?.split(';')[0] || '';

                if (!csrfToken || !csrfCookie) throw new Error('Gagal mendapatkan token CSRF.');
                console.log('   -> Token CSRF diterima.');

                const form = new FormData();
                const mode = imageUrl ? 'image-to-image' : 'text-to-image';
                form.append('prompt', prompt);
                form.append('mode', mode);

                if (imageUrl) {
                    const images = Array.isArray(imageUrl) ? imageUrl : [imageUrl];
                    console.log(`2. Memproses ${images.length} gambar untuk mode ${mode}...`);
                    for (const img of images) {
                        const buffer = await this._normalizeImageToBuffer(img);
                        if (buffer) form.append('images', buffer, { filename: 'image.png', contentType: 'image/png' });
                    }
                } else {
                    console.log(`2. Memulai mode ${mode}...`);
                }

                console.log('3. Membuat tugas generasi...');
                const createResponse = await this.api.post('/api/generate/create', form, {
                    headers: { ...form.getHeaders(), 'Cookie': `${csrfCookie}; __Host-authjs.csrf-token=${encodeURIComponent(csrfToken)}` }
                });

                const taskId = createResponse.data?.data?.taskId || null;
                if (!taskId) throw new Error('Gagal membuat tugas. Respons: ' + JSON.stringify(createResponse.data));
                console.log(`   -> Tugas dibuat dengan ID: ${taskId}`);

                console.log('4. Memulai polling untuk hasil gambar...');
                let finalStatusData;
                while (true) {
                    await new Promise(resolve => setTimeout(resolve, 3000));
                    const statusResponse = await this.api.get(`/api/generate/status?taskId=${taskId}`, { headers: { 'Cookie': csrfCookie } });
                    
                    const currentStatusData = statusResponse.data?.data;
                    const state = currentStatusData?.state || 'checking';
                    const resultUrl = currentStatusData?.response?.resultImageUrl;

                    // --- LOGIKA POLLING YANG DIPERBARUI ---
                    if (resultUrl) {
                        console.log(`   -> URL gambar hasil ditemukan. Tugas selesai (status: ${state}).`);
                        finalStatusData = currentStatusData;
                        break; // Keluar dari loop jika URL hasil sudah ada
                    }
                    
                    console.log(`   -> Status saat ini: ${state}, menunggu URL hasil...`);

                    if (state === 'error') {
                         throw new Error(`Tugas gagal: ${currentStatusData?.errorMessage || 'API Error'}`);
                    }
                }

                console.log('5. Proses berhasil diselesaikan dengan proxy ini.');
                return {
                    result: finalStatusData?.response?.resultImageUrl,
                    mode: mode
                };
            } catch (error) {
                console.error(`Proxy ${proxy} gagal. Error: ${error.message}. Mencoba proxy berikutnya...`);
            }
        }
        
        throw new Error('Semua proxy gagal. Tidak dapat menyelesaikan permintaan.');
    }
}

// Contoh Penggunaan
export default async function handler(req, res) {
  const params = req.method === "GET" ? req.query : req.body;
  if (!params.prompt) {
    return res.status(400).json({
      error: "Prompt are required"
    });
  }
  try {
    const ai = new BananaAIClient();
    const response = await ai.generate(params);
    return res.status(200).json(response);
  } catch (error) {
    res.status(500).json({
      error: error.message || "Internal Server Error"
    });
  }
}
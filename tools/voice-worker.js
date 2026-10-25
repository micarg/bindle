// Bindle voice relay for Cloudflare Workers (free plan).
// Turns text into speech with the Microsoft Edge read-aloud voices (e.g. el-GR-AthinaNeural).
const TOK = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const ALLOWED = ['https://micarg.github.io', 'http://localhost:8765'];

async function gec() {
  const t = Math.floor(Date.now() / 1000) + 11644473600;
  const ticks = BigInt(t - (t % 300)) * 10000000n;
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ticks.toString() + TOK));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}
const uid = () => crypto.randomUUID().replace(/-/g, '');
const esc = t => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export default {
  async fetch(req) {
    const origin = req.headers.get('Origin') || '';
    const cors = {
      'Access-Control-Allow-Origin': ALLOWED.includes(origin) ? origin : ALLOWED[0],
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'content-type',
    };
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (req.method !== 'POST') return new Response('Bindle voice relay is running.', { headers: cors });
    if (!ALLOWED.includes(origin)) return new Response('forbidden', { status: 403, headers: cors });

    let body;
    try { body = await req.json(); } catch { return new Response('bad json', { status: 400, headers: cors }); }
    const text = String(body.text || '').slice(0, 6000);
    const voice = /^[a-z]{2}-[A-Z]{2}-\w+Neural$/.test(body.voice || '') ? body.voice : 'el-GR-AthinaNeural';
    const rate = /^[+-]\d{1,3}%$/.test(body.rate || '') ? body.rate : '+0%';
    if (!text.trim()) return new Response('no text', { status: 400, headers: cors });

    const url = `https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${TOK}&Sec-MS-GEC=${await gec()}&Sec-MS-GEC-Version=1-140.0.3485.14&ConnectionId=${uid()}`;
    const up = await fetch(url, {
      headers: {
        Upgrade: 'websocket',
        Origin: 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0',
      },
    });
    const ws = up.webSocket;
    if (!ws) return new Response('upstream refused: ' + up.status, { status: 502, headers: cors });
    ws.accept();

    const audio = await new Promise((resolve, reject) => {
      const parts = [];
      const timer = setTimeout(() => { try { ws.close(); } catch {} reject(new Error('timeout')); }, 25000);
      ws.addEventListener('message', e => {
        if (typeof e.data === 'string') {
          if (e.data.includes('Path:turn.end')) { clearTimeout(timer); try { ws.close(); } catch {} resolve(parts); }
          return;
        }
        const buf = e.data, v = new DataView(buf), hl = v.getUint16(0);
        const head = new TextDecoder().decode(new Uint8Array(buf, 2, hl));
        if (head.includes('Path:audio')) parts.push(new Uint8Array(buf, 2 + hl));
      });
      ws.addEventListener('close', () => { clearTimeout(timer); parts.length ? resolve(parts) : reject(new Error('closed')); });
      const ts = new Date().toString();
      ws.send(`X-Timestamp:${ts}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}`);
      ws.send(`X-RequestId:${uid()}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${ts}Z\r\nPath:ssml\r\n\r\n<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='el-GR'><voice name='${voice}'><prosody pitch='+0Hz' rate='${rate}' volume='+0%'>${esc(text)}</prosody></voice></speak>`);
    }).catch(e => e);

    if (audio instanceof Error) return new Response('voice failed: ' + audio.message, { status: 502, headers: cors });
    return new Response(new Blob(audio, { type: 'audio/mpeg' }), { headers: { ...cors, 'Content-Type': 'audio/mpeg' } });
  },
};

// Bindle voice relay for Cloudflare Workers (free plan).
// Turns text into speech with the Microsoft Edge read-aloud voices (e.g. el-GR-AthinaNeural).
import { secMsGec } from './gec.js';

const TOK = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const CHROMIUM = '143.0.3650.75';
const MAJOR = CHROMIUM.split('.')[0];
let skew = 0; // seconds between this server's clock and Microsoft's
const muid = () => [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
function openVoice() {
  const url = `https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${TOK}&ConnectionId=${uid()}&Sec-MS-GEC=${secMsGec(TOK, Date.now() / 1000 + skew)}&Sec-MS-GEC-Version=2-${CHROMIUM}`;
  return fetch(url, {
    headers: {
      Upgrade: 'websocket',
      Pragma: 'no-cache',
      'Cache-Control': 'no-cache',
      Origin: 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
      'Sec-WebSocket-Version': '13',
      'User-Agent': `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${MAJOR}.0.0.0 Safari/537.36 Edg/${MAJOR}.0.0.0`,
      'Accept-Language': 'en-US,en;q=0.9',
      Cookie: `muid=${muid()};`,
    },
  });
}
const ALLOWED = ['https://micarg.github.io', 'http://localhost:8765'];

const uid = () => crypto.randomUUID().replace(/-/g, '');
const esc = t => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');


/* ---- Route 1: Microsoft Translator app endpoint (plain HTTP, works from cloud servers) ----
   Approach adapted from zuoban/tts (MIT licence): https://github.com/zuoban/tts */
const MT_KEY = 'oik6PdDdMnOXemTbwvMn9de/h9lFnfBaCWbGMMZqqoSaQaqUOqjVGm5NqsmjcBI1x+sS9ugjB55HEJWRiFXYFw==';
let mtEndpoint = null, mtExp = 0;
async function mtSign(urlStr) {
  const id = uid();
  const date = (new Date().toUTCString().replace(/GMT/, '').trim() + 'GMT').toLowerCase();
  const msg = `MSTranslatorAndroidApp${encodeURIComponent(urlStr.split('://')[1])}${date}${id}`.toLowerCase();
  const key = await crypto.subtle.importKey('raw', Uint8Array.from(atob(MT_KEY), c => c.charCodeAt(0)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg)));
  return `MSTranslatorAndroidApp::${btoa(String.fromCharCode(...sig))}::${date}::${id}`;
}
async function mtGetEndpoint(force) {
  if (!force && mtEndpoint && Date.now() / 1000 < mtExp - 300) return mtEndpoint;
  const url = 'https://dev.microsofttranslator.com/apps/endpoint?api-version=1.0';
  const r = await fetch(url, { method: 'POST', headers: {
    'Accept-Language': 'en-US', 'X-ClientVersion': '4.0.530a 5fe1dc6c', 'X-UserId': uid().slice(0, 16),
    'X-HomeGeographicRegion': 'en-US', 'X-ClientTraceId': uid(), 'X-MT-Signature': await mtSign(url),
    'User-Agent': 'okhttp/4.5.0', 'Content-Type': 'application/json', 'Content-Length': '0', 'Accept-Encoding': 'gzip' } });
  if (!r.ok) throw new Error('endpoint ' + r.status);
  mtEndpoint = await r.json();
  try { mtExp = JSON.parse(atob(mtEndpoint.t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).exp; } catch { mtExp = Date.now() / 1000 + 600; }
  return mtEndpoint;
}
async function mtSpeak(text, voice, rate, parts) {
  const ssml = `<speak xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="http://www.w3.org/2001/mstts" version="1.0" xml:lang="el-GR"><voice name="${voice}"><prosody rate="${rate}">${parts && parts.length ? parts.map(esc).join('<break time="350ms"/>') : esc(text)}</prosody></voice></speak>`;
  for (let attempt = 0; attempt < 2; attempt++) {
    const ep = await mtGetEndpoint(attempt > 0);
    const r = await fetch(`https://${ep.r}.tts.speech.microsoft.com/cognitiveservices/v1`, { method: 'POST', headers: {
      Authorization: ep.t, 'Content-Type': 'application/ssml+xml', 'User-Agent': 'okhttp/4.5.0', 'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3' }, body: ssml });
    if (r.ok) return await r.arrayBuffer();
    if (attempt) throw new Error('tts ' + r.status + ' ' + (await r.text()).slice(0, 100));
  }
}

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
    const parts = Array.isArray(body.parts) ? body.parts.slice(0, 200).map(x => String(x).slice(0, 2000)).filter(x => x.trim()) : null;

    let route1 = '';
    try {
      const buf = await mtSpeak(text, voice, rate, parts);
      return new Response(buf, { headers: { ...cors, 'Content-Type': 'audio/mpeg' } });
    } catch (e) { route1 = String(e && e.message || e); }

    let up = await openVoice();
    if (!up.webSocket && up.headers.get('Date')) {
      // clock may be off: line it up with Microsoft's and try once more
      const server = Date.parse(up.headers.get('Date')) / 1000;
      if (!isNaN(server)) { skew += server - (Date.now() / 1000 + skew); up = await openVoice(); }
    }
    const ws = up.webSocket;
    if (!ws) { let why = ''; try { why = (await up.text()).slice(0, 120); } catch {} return new Response('upstream refused: ' + up.status + ' ' + why + ' / route1: ' + route1, { status: 502, headers: cors }); }
    ws.accept();

    const audio = await new Promise((resolve, reject) => {
      const parts = []; let lastText = '';
      const timer = setTimeout(() => { try { ws.close(); } catch {} reject(new Error('timeout')); }, 25000);
      ws.addEventListener('message', e => {
        if (typeof e.data === 'string') {
          lastText = e.data.slice(0, 160);
          if (e.data.includes('Path:turn.end')) { clearTimeout(timer); try { ws.close(); } catch {} resolve(parts); }
          return;
        }
        const buf = e.data, v = new DataView(buf), hl = v.getUint16(0);
        const head = new TextDecoder().decode(new Uint8Array(buf, 2, hl));
        if (head.includes('Path:audio')) parts.push(new Uint8Array(buf, 2 + hl));
      });
      ws.addEventListener('close', ev => { clearTimeout(timer); parts.length ? resolve(parts) : reject(new Error('closed ' + ev.code + ' ' + (ev.reason || '') + ' ' + lastText.replace(/\r\n/g, ' | '))); });
      const ts = new Date().toString();
      ws.send(`X-Timestamp:${ts}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"true","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}\r\n`);
      ws.send(`X-RequestId:${uid()}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${ts}Z\r\nPath:ssml\r\n\r\n<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'><voice name='${voice}'><prosody pitch='+0Hz' rate='${rate}' volume='+0%'>${esc(text)}</prosody></voice></speak>`);
    }).catch(e => e);

    if (audio instanceof Error) return new Response('voice failed: ' + audio.message + ' / route1: ' + route1, { status: 502, headers: cors });
    return new Response(new Blob(audio, { type: 'audio/mpeg' }), { headers: { ...cors, 'Content-Type': 'audio/mpeg' } });
  },
};

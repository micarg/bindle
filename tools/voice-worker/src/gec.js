// Sec-MS-GEC v2 token for Microsoft Edge read-aloud voices.
// Ported to JavaScript from edge-tts (https://github.com/rany2/edge-tts, src/edge_tts/drm.py, LGPLv3).
const M = 0xFFFFFFFFn;
const H = v => BigInt(v);
const INITIAL = [0x6A09E667,0xBB67AE85,0x3C6EF372,0xA54FF53A,0x510E527F,0x9B05688C,0x1F83D9AB,0x5BE0CD19].map(H);
const STATE = [0xFD9FBEA2,0x91243CE7,0xBE499094,0xCD2E1E0A,0x6C006F49,0x04BD35AB,0xFEB0A7E4,0x03EFFBD2].map(H);
const SCHEDULE = [0xEB24BF9E,0x1558691F,0xA0C09EE2,0x0CFA32BA,0xA622EE8C,0xD1DD9491,0xC0DD25A0,0xF9E70AB6,0xF0C31573,0x7058CE4E,0x7188E606,0x00E5AB33,0xD258B060,0x72766564].map(H);
const RC = [0x428A2F98,0x71374491,0xB5C0FBCF,0xE9B5DBA5,0x3956C25B,0x59F111F1,0x923F82A4,0xAB1C5ED5,0xD807AA98,0x12835B01,0x243185BE,0x550C7DC3,0x72BE5D74,0x80DEB1FE,0x9BDC06A7,0xC19BF174,0xE49B69C1,0xEFBE4786,0x0FC19DC6,0x240CA1CC,0x2DE92C6F,0x4A7484AA,0x5CB0A9DC,0x76F988DA,0x983E5152,0xA831C66D,0xB00327C8,0xBF597FC7,0xC6E00BF3,0xD5A79147,0x06CA6351,0x14292967,0x27B70A85,0x2E1B2138,0x4D2C6DFC,0x53380D13,0x650A7354,0x766A0ABB,0x81C2C92E,0x92722C85,0xA2BFE8A1,0xA81A664B,0xC24B8B70,0xC76C51A3,0xD192E819,0xD6990624,0xF40E3585,0x106AA070,0x19A4C116,0x1E376C08,0x2748774C,0x34B0BCB5,0x391C0CB3,0x4ED8AA4A,0x5B9CCA4F,0x682E6FF3,0x748F82EE,0x78A5636F,0x84C87814,0x8CC70208,0x90BEFFFA,0xA4506CEB,0xBEF9A3F7,0xC67178F2].map(H);
const ADJ = 0xC9DC06A7n;
const BLOCK_RC = [...RC.slice(0, 14), ADJ, ...RC.slice(15)];
const SIG0_ADJ = 0x059C0B80n, SIG1_ADJ = 0x000B92C0n;
const CS64 = [[0xE82E91B1,0xB32700D0],[0x44DE24C6,0x88DFF51D],[0x3BEB65BC,0x29514038],[0xC89C5933,0xB328CBDF],[0x8D1EC211,0xD405B4D5],[0x314EF5D5,0x26E55F3C],[0xE92491B1,0x607801C6],[0xF0A5B9D5,0x82B2C1FB],[0x06064CF3,0xFA51A3DA],[0xDA79FA60,0x207CC464],[0xBED20560,0x3C3C74F3],[0x89F9C9F8,0xD2D14B61],[0x35FA38C6,0xBB04A2C1],[0xCB49E3C6,0xC5626167]].map(([a, b]) => [H(a), H(b)]);
const CS64_FACTOR = 0x82893933n, CS64_ADJ0 = 0xF2F90B1An, CS64_ADJ1 = 0x0B1A0000n;

const rol16 = v => { v &= M; return ((v << 16n) | (v >> 16n)) & M; };
const sigma0 = v => ((v >> 7n) ^ (v << 25n) ^ (v >> 18n) ^ (v << 14n) ^ (v >> 3n)) & M;
const sigma1 = v => ((v >> 17n) ^ (v << 15n) ^ (v >> 19n) ^ (v << 13n) ^ (v >> 10n)) & M;
const be = (b, o, n) => { let v = 0n; for (let i = 0; i < n; i++) v = (v << 8n) | H(b[o + i]); return v; };
const le32 = (b, o) => H(b[o]) | (H(b[o + 1]) << 8n) | (H(b[o + 2]) << 16n) | (H(b[o + 3]) << 24n);

function rounds(state, w, first = 0) {
  let [a, b, c, d, e, f, g, h] = state;
  const K = first === 14 ? BLOCK_RC : RC, X = 0x100000001n;
  for (let i = first; i < 64; i++) {
    const re = e * X, ra = a * X;
    const t1 = h + ((re >> 6n) ^ (re >> 11n) ^ (re >> 25n)) + (g ^ (e & (f ^ g))) + K[i] + w[i];
    const t2 = ((ra >> 2n) ^ (ra >> 13n) ^ (ra >> 22n)) + ((a & b) | (c & (a | b)));
    [a, b, c, d, e, f, g, h] = [(t1 + t2) & M, a, b, c, (d + t1) & M, e, f, g];
  }
  return [a, b, c, d, e, f, g, h];
}
function expand(w, first = 16) {
  for (let i = first; i < 64; i++) {
    const x = w[i - 2], y = w[i - 15];
    const s1 = (x >> 17n) ^ (x << 15n) ^ (x >> 19n) ^ (x << 13n) ^ (x >> 10n);
    const s0 = (y >> 7n) ^ (y << 25n) ^ (y >> 18n) ^ (y << 14n) ^ (y >> 3n);
    w.push((s1 + w[i - 7] + s0 + w[i - 16]) & M);
  }
}
function init(d7) {
  const w = new Array(14).fill(0n);
  w.push(be(d7, 0, 3)); w.push(be(d7, 3, 4));
  for (let i = 16; i < 30; i++) {
    let v = SCHEDULE[i - 16];
    if (i - 2 >= 14) v += i === 16 ? (sigma1(w[i - 2]) ^ SIG1_ADJ) : sigma1(w[i - 2]);
    if (i - 7 >= 14) v += w[i - 7];
    if (i - 15 >= 14) v += i === 29 ? (sigma0(w[i - 15]) ^ SIG0_ADJ) : sigma0(w[i - 15]);
    w.push(v & M);
  }
  w.push((sigma1(w[28]) + w[23] + sigma0(w[15]) + w[14] + ADJ - RC[14]) & M);
  expand(w, 31);
  const r = rounds(STATE, w, 14);
  return INITIAL.map((x, i) => (x + r[i]) & M);
}
function sha(data) {
  const len = 57 + data.length;
  const padLen = (((55 - len) % 64) + 64) % 64;
  const p = new Uint8Array(data.length - 7 + 1 + padLen + 8);
  p.set(data.slice(7)); p[data.length - 7] = 0x80;
  let bits = H(len * 8);
  for (let i = 0; i < 8; i++) { p[p.length - 1 - i] = Number(bits & 0xFFn); bits >>= 8n; }
  let s = init(data.slice(0, 7));
  for (let o = 0; o < p.length; o += 64) {
    const w = []; for (let i = 0; i < 16; i++) w.push(be(p, o + i * 4, 4));
    expand(w);
    const r = rounds(s, w);
    s = s.map((x, i) => (x + r[i]) & M);
  }
  const out = new Uint8Array(32);
  s.forEach((v, i) => { for (let j = 0; j < 4; j++) out[i * 4 + j] = Number((v >> H(24 - 8 * j)) & 0xFFn); });
  return out;
}
function cs64(data, digest) {
  let ka = le32(digest, 0) | 1n, kb = le32(digest, 4) | 1n;
  const fac = [(ka * CS64_FACTOR) & M, (kb * CS64_FACTOR) & M];
  const terms = CS64.map(([c], i) => (c * fac[i % 2]) & M), offs = CS64.map(([, o]) => o);
  const raw = new Uint8Array(1 + data.length); raw.set(data, 1);
  const padded = new Uint8Array(Math.ceil(raw.length / 4) * 4); padded.set(raw);
  const words = []; for (let o = 0; o < padded.length; o += 4) words.push(le32(padded, o));
  if (words.length % 2) words.push(0n);
  words.forEach((wd, i) => {
    let term = wd * (i % 2 === 0 ? ka : kb), off = rol16(wd) * (i % 2 === 0 ? 0xEF0569FBn : 0xC31713DBn);
    if (i === 0) { term += CS64_ADJ0 * fac[0]; off += CS64_ADJ1; }
    terms.push(term & M); offs.push(off & M);
  });
  let sa = 0n, sl = 0n, st = 0n, acc = 0n;
  for (let i = 0; i < terms.length; i += 2) {
    const x = terms[i], y = terms[i + 1];
    let t = rol16((offs[i] + x) & M), q = (t * 0x76F50F34n) & M;
    sa += (rol16(q) * 0xC3EFEA97n + q) & M;
    t = rol16((offs[i + 1] + y) & M); q = (t * 0x1881CE3Cn) & M;
    sl = (rol16(q) * 0x35BD1EC9n + q) & M;
    sa = (sa + sl) & M;
    st = (st * ka + x) & M;
    st = (rol16(st) * 0xCF98B111n) & M;
    st = (rol16(st) * 0x87085B9Fn) & M;
    st = (rol16(st) * 0x12CEB96Dn) & M;
    st = (rol16(st) * 0x257E1D83n) & M;
    acc += st;
    t = (st * kb + y) & M;
    t = (rol16(t) * 0xA27416F5n) & M;
    t = (rol16(t) * 0xD38396FFn) & M;
    st = (rol16((rol16(t) * 0x7C932B89n) & M) * 0xBFA49F69n) & M;
    acc = (acc + st) & M;
  }
  return [sl ^ st, sa ^ acc];
}
const hex = b => [...b].map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase();
export function secMsGec(token, unixSeconds = Date.now() / 1000) {
  let t = unixSeconds + 11644473600;
  t -= t % 300;
  t *= 1e9 / 100;
  const data = new TextEncoder().encode(BigInt(t).toString() + token);
  const d = sha(data);
  const [x, y] = cs64(data, d);
  const le = v => { const o = new Uint8Array(4); for (let i = 0; i < 4; i++) o[i] = Number((v >> H(8 * i)) & 0xFFn); return o; };
  return hex(le(x)) + hex(le(y)) + '-' + hex(d);
}

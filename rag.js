// Paideia · Recuperación de fragmentos con fuente (funciona sin IA y sin conexión).
// Todo se calcula en el navegador; nada se envía a ningún servidor.

const STOP = new Set(('de la que el en y a los del se las por un para con no una su al lo como mas pero sus le ya o este si porque esta entre cuando muy sin sobre tambien me hasta hay donde quien desde todo nos durante todos uno les ni contra otros ese eso ante ellos e esto mi antes algunos que unos yo otro otras otra el tanto esa estos mucho quienes nada muchos cual poco ella estar estas algunas algo nosotros mis tu te ti tus ellas nosotras vosotros vosotras os mio mia mios mias tuyo tuya suyo suya nuestro nuestra vuestro esos esas estoy estas esta estamos estan sea sean ser es son fue era eran sido han ha he hemos haber habia tiene tienen tener cual cuales cuanto cuanta que qué como cómo puede pueden debe deben segun asi aqui alli explica explicame dime cual cuál significa sobre respecto acerca tema puedes favor hola gracias').split(' '));

export const norm = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function stem(w) {
  if (/^\d/.test(w)) return w;
  if (w.length > 7 && w.endsWith('mente')) w = w.slice(0, -5);
  if (w.length > 6 && w.endsWith('ciones')) return w.slice(0, -2);
  if (w.length > 5 && w.endsWith('es') && !w.endsWith('ces')) return w.slice(0, -2);
  if (w.length > 5 && w.endsWith('ces')) return w.slice(0, -3) + 'z';
  if (w.length > 4 && w.endsWith('s')) return w.slice(0, -1);
  return w;
}

export function tokens(text) {
  const raw = norm(text).match(/[a-z0-9ñ]+(?:-[0-9a-z]+)*/g) || [];
  const out = [];
  for (const w of raw) {
    if (STOP.has(w)) continue;
    if (w.length < 3 && !/^\d+$/.test(w)) continue;
    out.push(stem(w));
  }
  return out;
}

// Divide una página en fragmentos de ~700 caracteres respetando oraciones y párrafos.
export function chunkText(text, target = 700, max = 1100) {
  const clean = String(text || '').replace(/\r/g, '').replace(/[ \t]+/g, ' ').trim();
  if (!clean) return [];
  const parts = clean.split(/(?<=[.;:!?])\s+|\n{1,}/).map(s => s.trim()).filter(Boolean);
  const sentences = [];
  for (const p of parts) {
    if (p.length <= max) { sentences.push(p); continue; }
    for (let i = 0; i < p.length; i += max - 100) sentences.push(p.slice(i, i + max));
  }
  const chunks = []; let cur = [];
  let len = 0;
  for (const s of sentences) {
    // Un encabezado de artículo inicia fragmento nuevo para no mezclar artículos.
    const isArticle = /^art[íi]culo\s+\d+/i.test(s);
    if (cur.length && (len + s.length > max || (isArticle && len > 200))) {
      chunks.push(cur.join(' '));
      const last = cur[cur.length - 1];
      cur = isArticle || last.length > 300 ? [] : [last]; len = cur.reduce((a, b) => a + b.length, 0);
    }
    cur.push(s); len += s.length + 1;
    if (len >= target && !isArticle) { chunks.push(cur.join(' ')); const last = cur[cur.length - 1]; cur = last.length > 300 ? [] : [last]; len = cur.reduce((a, b) => a + b.length, 0); }
  }
  if (cur.length) { const t = cur.join(' '); if (!chunks.length || !chunks[chunks.length - 1].endsWith(t)) chunks.push(t); }
  return chunks.filter(c => c.replace(/\s/g, '').length > 20);
}

// ---------- Clasificación jurídica de la fuente ----------
const FOREIGN = [
  ['España', /\bespana\b|\b(?:codigo|ley|constitucion|derecho|ordenamiento|tribunal|legislacion|jurisprudencia)\s+(?:civil\s+|penal\s+|procesal\s+|laboral\s+|constitucional\s+|supremo\s+)?espanol(?:a)?\b|\bboe\b/],
  ['México', /\bmexic(?:o|ano|ana)\b/], ['Argentina', /\bargentin(?:a|o)\b/], ['Colombia', /\bcolombi(?:a|ano|ana)\b/],
  ['Chile', /\bchile(?:no|na)?\b/], ['Ecuador', /\becuador(?:iano|iana)?\b/], ['Bolivia', /\bbolivi(?:a|ano|ana)\b/],
  ['Venezuela', /\bvenezol(?:ano|ana)\b|\bvenezuela\b/], ['Uruguay', /\buruguay(?:o|a)?\b/], ['Paraguay', /\bparaguay(?:o|a)?\b/],
  ['Costa Rica', /\bcosta ?rica\b|\bcostarricense\b/], ['Estados Unidos', /\bestados unidos\b|\bestadounidense\b/],
  ['Francia', /\bfrancia\b|\b(?:codigo|ley|derecho)\s+(?:civil\s+)?frances\b/], ['Italia', /\bitalia\b|\b(?:codigo|ley|derecho)\s+(?:civil\s+)?italiano\b/],
  ['Alemania', /\balemania\b|\b(?:codigo|ley|derecho)\s+(?:civil\s+)?aleman\b/], ['Guatemala', /\bguatemal(?:a|teco)\b/], ['Cuba', /\bcuba(?:no|na)?\b/]
];
export function foreignMentions(text) {
  const t = norm(text);
  return FOREIGN.filter(([, re]) => re.test(t)).map(([n]) => n);
}

const isPeru = c => /^per[uú]$/i.test(String(c || '').trim());

export function sourceInfo(doc, fragmentText = '') {
  const kind = doc.kind || 'Apuntes';
  let tipo, oficial = false;
  if (kind === 'Norma') { oficial = true; tipo = doc.verified ? `Norma oficial · vigencia verificada por ti el ${doc.verified}` : 'Norma · vigencia no verificada'; }
  else if (kind === 'Jurisprudencia') tipo = 'Jurisprudencia · verifica la fuente oficial';
  else if (kind === 'Documento oficial') tipo = 'Documento oficial · verifica la versión vigente';
  else if (kind === 'Web no oficial') tipo = 'Fuente web no oficial';
  else tipo = 'Apuntes / material de estudio (no oficial)';
  const country = (doc.country || '').trim();
  const foreign = [], mentions = [];
  if (country && !isPeru(country) && !/general|varios/i.test(country)) foreign.push(country);
  for (const f of foreignMentions(fragmentText)) if (!foreign.includes(f)) (isPeru(country) ? mentions : foreign).push(f);
  const pais = country || (kind === 'Web no oficial' ? 'general / varios países' : 'no indicado');
  const art = (String(fragmentText).match(/^\s*(art[íi]culo\s+\d+[°º]?(?:[-\s]?[A-Z](?![a-z]))?)/i) || [])[1];
  return { tipo, oficial, pais, foreign, mentions, art: art ? art.replace(/\s+/g, ' ') : '' };
}

// Sinónimos jurídicos frecuentes (peso reducido) para compensar la búsqueda por palabras.
const SYN = { laboral: ['trabajo', 'trabajador'], trabajo: ['laboral'], trabajador: ['laboral'], apelar: ['apelacion'], apelacion: ['apelar', 'impugnacion'], impugnar: ['impugnacion', 'apelacion'], despido: ['despedido', 'extincion'], cts: ['compensacion', 'servicio'], plazo: ['termino', 'dia'], sueldo: ['remuneracion'], salario: ['remuneracion'], remuneracion: ['sueldo'], juez: ['juzgado', 'magistrado'], demanda: ['demandante'], vacacion: ['descanso'], gratificacion: ['gratificacione'], contrato: ['contratacion'] };
const expand = qt => { const out = new Map(qt.map(t => [t, 1])); for (const t of qt) for (const x of SYN[t] || []) { const k = stem(x); if (!out.has(k)) out.set(k, 0.5); } return out; };

// ---------- Índice BM25 ----------
let cache = { sig: '', idx: null };
const NT = new WeakMap(); // tokens del nombre del documento (no se guardan en los datos)
const nameTokens = d => { let t = NT.get(d); if (!t) NT.set(d, t = new Set(tokens(d.name))); return t; };
const signature = docs => docs.length + ':' + docs.map(d => d.id + '/' + d.pages.length + '/' + d.pages.reduce((a, p) => a + (p.text?.length || 0), 0)).join('|');

export function buildIndex(docs) {
  const sig = signature(docs);
  if (cache.sig === sig && cache.idx) return cache.idx;
  const chunks = []; const df = new Map(); let total = 0;
  for (const d of docs) for (const p of d.pages) {
    for (const text of chunkText(p.text)) {
      const toks = tokens(text);
      if (!toks.length) continue;
      const tf = new Map(); for (const t of toks) tf.set(t, (tf.get(t) || 0) + 1);
      for (const t of tf.keys()) df.set(t, (df.get(t) || 0) + 1);
      const head = (norm(text).match(/^\s*articulo\s+(\d+[a-z]?)/) || [])[1] || '';
      chunks.push({ doc: d, page: p.page || 'página no disponible', text, tf, len: toks.length, normText: norm(text), head, nameToks: nameTokens(d) });
      total += toks.length;
    }
  }
  const idx = { chunks, df, avg: total / Math.max(1, chunks.length), N: chunks.length };
  cache = { sig, idx };
  return idx;
}

export function invalidate() { cache = { sig: '', idx: null }; }

// Devuelve fragmentos ordenados con puntuación y cobertura de términos de la consulta.
export function retrieve(docs, query, k = 5) {
  const idx = buildIndex(docs);
  const qt = [...new Set(tokens(query))];
  if (!qt.length || !idx.N) return { results: [], terms: qt, sufficient: false };
  const k1 = 1.2, b = 0.75, qw = expand(qt);
  const qn = norm(query);
  const bigrams = (qn.match(/[a-z0-9ñ]{3,}/g) || []).filter(w => !STOP.has(w));
  const wantArt = (qn.match(/\bart(?:iculo|\.)?\s*(?:n[°ºo.]?\s*)?(\d+[a-z]?)\b/) || [])[1];
  const scored = [];
  for (const c of idx.chunks) {
    let s = 0, matched = 0;
    for (const [t, w] of qw) {
      const f = c.tf.get(t); if (!f) continue;
      if (w === 1) matched++;
      const n = idx.df.get(t) || 0;
      const idf = Math.log(1 + (idx.N - n + 0.5) / (n + 0.5));
      s += w * idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * c.len / idx.avg));
    }
    let nameHits = 0; for (const t of qt) if (c.nameToks.has(t)) nameHits++;
    if (!matched) continue;
    s *= 0.4 + 0.6 * (matched / qt.length);
    s += nameHits * 1.0;
    if (wantArt && c.head === wantArt) s += 12 + nameHits * 3;
    for (let i = 0; i + 1 < bigrams.length; i++) if (c.normText.includes(bigrams[i] + ' ' + bigrams[i + 1])) s += 0.8;
    scored.push({ ...c, score: s, coverage: matched / qt.length, matched });
  }
  scored.sort((a, b2) => b2.score - a.score);
  // Evita fragmentos casi idénticos (solapamientos).
  const out = [];
  for (const r of scored) {
    if (out.some(o => o.doc === r.doc && o.page === r.page && (o.text.includes(r.text.slice(0, 120)) || r.text.includes(o.text.slice(0, 120))))) continue;
    out.push(r); if (out.length >= k) break;
  }
  const missing = qt.filter(t => !idx.df.has(t) && !/^\d/.test(t));
  const need = qt.length <= 2 ? 1 : Math.ceil(qt.length * 0.6);
  const sufficient = out.some(r => r.matched >= need || (wantArt && r.head === wantArt));
  return { results: out, terms: qt, sufficient, missing };
}

// ---------- Control contra invenciones ----------
const NUM_WORDS = { un: '1', uno: '1', una: '1', dos: '2', tres: '3', cuatro: '4', cinco: '5', seis: '6', siete: '7', ocho: '8', nueve: '9', diez: '10', once: '11', doce: '12', quince: '15', veinte: '20', treinta: '30', sesenta: '60', noventa: '90' };
const refPatterns = [
  ['artículo', /\bart(?:iculo|\.|s\.)?s?\s*(?:n[°ºo.]?\s*)?(\d+(?:[-–]?[a-z])?(?:\.\d+)?)\b/g],
  ['ley', /\bley\s*(?:n[°ºo.]?\s*)?(\d[\d.]*\d|\d)\b/g],
  ['decreto', /\b(?:d\.?\s?s\.?|d\.?\s?leg\.?|d\.?\s?u\.?|decreto\s+(?:supremo|legislativo|de urgencia|ley))\s*(?:n[°ºo.]?\s*)?(\d[\d-]*\d(?:-[a-z]+)?)/g],
  ['casación/expediente', /\b(?:casacion|cas\.|expediente|exp\.|stc|sentencia)\s*(?:n[°ºo.]?\s*)?(\d[\d\-/]*\d(?:-[a-z]+)?)/g],
  ['plazo', /\b(\d+|un|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|quince|veinte|treinta|sesenta|noventa)\s+(?:\(\d+\)\s+)?(dias?|meses?|anos?|horas?)(?:\s+(habiles|calendario|naturales))?\b/g]
];
const canonNum = s => (NUM_WORDS[s] || s).replace(/[.\s]/g, '');
const canonUnit = u => u.replace(/s$/, '').replace(/^mese$/, 'mes');

export function extractRefs(text) {
  const t = norm(text); const refs = [];
  for (const [type, re] of refPatterns) {
    re.lastIndex = 0; let m;
    while ((m = re.exec(t))) {
      if (type === 'plazo') refs.push({ type, key: canonNum(m[1]) + ' ' + canonUnit(m[2]), label: m[0] });
      else refs.push({ type, key: m[1].replace(/[.–]/g, s => (s === '–' ? '-' : '')), label: m[0] });
    }
  }
  // Citas textuales entre comillas
  const q = String(text).match(/[«“"]([^«»“”"]{25,})[»”"]/g) || [];
  for (const s of q) refs.push({ type: 'cita', key: norm(s.slice(1, -1)).replace(/\s+/g, ' ').trim(), label: s.length > 70 ? s.slice(0, 67) + '…”' : s });
  return refs;
}

// Comprueba que artículos, normas, plazos y citas de la respuesta existan en los fragmentos usados.
export function verifyAnswer(answer, fragments) {
  const ctx = fragments.map(f => (f.doc?.name ? f.doc.name.replace(/\.(docx?|pdf|txt|html?)$/i, '') + '\n' : '') + f.text).join('\n');
  const ctxRefs = extractRefs(ctx);
  const ctxNorm = norm(ctx).replace(/\s+/g, ' ');
  const have = new Set(ctxRefs.map(r => r.type + ':' + r.key));
  const unverified = [];
  for (const r of extractRefs(answer)) {
    if (r.type === 'cita') { if (!ctxNorm.includes(r.key.slice(0, 60))) unverified.push(r); continue; }
    if (have.has(r.type + ':' + r.key)) continue;
    // Tolerancia: un número de artículo presente en el texto con otra forma ("art. 5" vs "artículo 5").
    if (r.type !== 'plazo' && new RegExp('(?:^|[^0-9])' + r.key.replace(/[-/]/g, '[-/]') + '(?:[^0-9]|$)').test(ctxNorm) && r.type !== 'ley') continue;
    if (!unverified.some(u => u.type === r.type && u.key === r.key)) unverified.push(r);
  }
  const cites = [...String(answer).matchAll(/\[F(\d+)\]/g)].map(m => +m[1]);
  const badCites = cites.filter(n => n < 1 || n > fragments.length);
  return { unverified, cites: [...new Set(cites)].filter(n => n >= 1 && n <= fragments.length), badCites: [...new Set(badCites)] };
}

export const NO_SUPPORT = 'No encuentro sustento suficiente en tus materiales para responder esto.';

// Pregunta de práctica sin IA: completar el espacio en blanco con un término relevante del fragmento.
export function clozeCard(text, docs, prefer = '') {
  const pref = new Set(tokens(prefer));
  const idx = buildIndex(docs);
  const sentences = String(text).split(/(?<=[.;:!?])\s+/).filter(s => s.length > 40 && s.length < 400);
  let best = null;
  for (const s of sentences) {
    const words = s.match(/[A-Za-zÁÉÍÓÚáéíóúÑñü]{6,}/g) || [];
    for (const w of words) {
      const t = stem(norm(w)); if (STOP.has(norm(w)) || /(?:ar|er|ir|arlo|erlo|irlo|ndo|ado|ada|ido|ida|ados|idos|mente)$/.test(norm(w))) continue;
      const n = idx.df.get(t) || 1; const idf = Math.log(1 + idx.N / n) + w.length / 20 + (pref.has(t) ? 3 : 0);
      if (!best || idf > best.score) best = { s, w, score: idf };
    }
  }
  if (!best) return null;
  const blank = best.s.replace(new RegExp('\\b' + best.w + '\\b'), '_____');
  return { question: 'Completa: ' + blank, answer: best.w + '\n\nTexto completo: ' + best.s };
}

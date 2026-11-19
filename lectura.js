// Paideia · «Norma del día»: plan de lectura diaria por artículos, avisos emergentes y exámenes.
// Todo funciona sin IA y sin conexión; la IA solo se usa en «Explícamelo».
import * as IA from './ia.js';

let ctx; // {data, save, toast, esc, dialog, closeDialog, openCard, today}
const $ = s => document.querySelector(s);
export function init(c) { ctx = c; }

// ---------- Artículos ----------
const cacheArts = new WeakMap();
const HEAD = /^\s*Art[íi]culo\s+(\d+[°º]?(?:[-\s]?[A-Z](?=[\s.\-–—]))?)\s*[°º]?\s*\.?\s*[-–—:]?\s*(.*)$/;
export function articles(doc) {
  if (!doc) return [];
  let a = cacheArts.get(doc); if (a) return a;
  // Un decreto aprobatorio y el texto aprobado (TUO, Código) reinician la numeración: se separan en bloques
  // y se conserva el bloque más extenso (la norma principal).
  const blocks = [[]]; let seen = new Set(), cur = null;
  const push = () => {
    if (cur) {
      cur.text = cur.lines.join('\n').trim(); delete cur.lines;
      if (cur.text.length > 15) {
        if (seen.has(cur.num)) { if (cur.num === '1' || parseInt(cur.num) < parseInt([...seen].pop())) { blocks.push([]); seen = new Set(); } else { cur = null; return; } }
        seen.add(cur.num); blocks[blocks.length - 1].push(cur);
      }
    }
    cur = null;
  };
  for (const p of doc.pages) for (const line of String(p.text || '').split('\n')) {
    const m = line.match(HEAD);
    if (m) {
      push();
      const num = m[1].replace(/[°º]/g, '').replace(/\s+/g, '-'), rest = m[2].trim();
      const isTitle = rest && rest.length <= 110 && !/[.;:]$/.test(rest.replace(/\(\*\)$/, '').trim()) || /^[^.]{3,110}\.$/.test(rest) && rest.split(' ').length <= 12;
      cur = { num, title: isTitle ? rest.replace(/\.$/, '') : '', lines: isTitle ? [] : [rest], page: p.page || 'página no disponible' };
    } else if (cur) {
      if (/^(T[ÍI]TULO|CAP[ÍI]TULO|SUBCAP[ÍI]TULO|SECCI[ÓO]N|DISPOSICIONES?\s+(COMPLEMENTARIAS?|FINALES?|TRANSITORIAS?|DEROGATORIAS?))\b/i.test(line.trim())) { push(); continue; }
      cur.lines.push(line);
    }
  }
  push();
  a = blocks.reduce((m, b) => b.length > m.length ? b : m, []);
  cacheArts.set(doc, a); return a;
}
const shortName = d => d.name.replace(/\.(docx?|pdf|txt|html?)$/i, '');
export const normsWithArticles = () => ctx.data.docs.filter(d => articles(d).length >= 3);

// ---------- Estado ----------
const S = () => (ctx.data.study ||= { plan: null, log: {} });
const T = () => ctx.today();
const dayLog = (d = T()) => (S().log[d] ||= { read: [], exam: null });
const nowHM = () => new Date().toTimeString().slice(0, 5);
function streak() {
  let n = 0; const d = new Date();
  for (;;) { const k = d.toLocaleDateString('en-CA'); const l = S().log[k]; if (l && (l.read.length || l.exam)) { n++; d.setDate(d.getDate() - 1); } else if (k === T() && n === 0) { d.setDate(d.getDate() - 1); } else break; if (n > 3650) break; }
  return n;
}
const planDoc = () => ctx.data.docs.find(d => d.id === S().plan?.docId);
const arts = () => articles(planDoc());
const curArt = () => arts()[Math.min(S().plan.pos, arts().length - 1)];

// ---------- Pantalla ----------
export function render() {
  const st = S();
  if (!st.plan || !planDoc()) return setupView();
  const p = st.plan, list = arts(), a = curArt(), log = dayLog(), done = log.read.length;
  const pct = Math.round(100 * Math.min(done, p.goal) / p.goal), normPct = Math.round(100 * p.pos / Math.max(1, list.length));
  return `<div class="grid">
    <div class="card"><div class="label">Hoy</div><p class="number">${done}/${p.goal}</p><div class="progress"><div style="width:${pct}%"></div></div><span class="muted">artículos leídos</span></div>
    <div class="card"><div class="label">${ctx.esc(shortName(planDoc()))}</div><p class="number">${normPct}%</p><div class="progress"><div style="width:${normPct}%"></div></div><span class="muted">artículo ${Math.min(p.pos + 1, list.length)} de ${list.length}</span></div>
    <div class="card"><div class="label">Constancia</div><p class="number">${streak()}</p><span class="muted">día(s) seguidos · ${log.exam ? `examen de hoy: ${log.exam.score}/${log.exam.total}` : 'examen de hoy pendiente'}</span></div></div>
  ${p.pos >= list.length ? `<section class="card"><h2>¡Terminaste la norma!</h2><p>Leíste los ${list.length} artículos. Puedes repasar con un simulacro o elegir otra norma.</p><div class="row"><button data-lec="restart" class="secondary">Empezar de nuevo</button><button data-lec="change">Elegir otra norma</button></div></section>` : articleCard(a, true)}
  <section class="card" style="margin-top:18px"><h2>Evalúate</h2><p>Las preguntas se generan de los artículos sin IA: «¿qué artículo regula…?», contenido del artículo, plazos y cantidades, y verdadero o falso. Los errores pueden convertirse en fichas de repaso.</p>
  <div class="row"><button data-lec="exam-day" ${done ? '' : 'disabled title="Lee al menos un artículo hoy"'}>Examen del día (${Math.min(done * 2, 20) || 0} preguntas)</button><button class="secondary" data-lec="exam-week">Repaso de la semana</button><button class="secondary" data-lec="sim-setup">Simulacro cronometrado</button></div>
  ${historyHtml()}</section>
  <details class="classify"><summary>Configurar plan y avisos</summary>${planForm(p)}<div class="row" style="margin-top:12px"><button data-lec="save-plan">Guardar</button><button class="secondary" data-lec="change">Cambiar de norma</button><button class="secondary" data-lec="test-popup">Probar aviso</button></div></details>`;
}

function setupView() {
  const norms = normsWithArticles();
  if (!norms.length) return `<section class="card"><h2>Norma del día</h2><p>Para empezar, importa una norma en Biblioteca (por ejemplo, la exportación .doc del SPIJ de la Ley 29497) o añade tu paquete de normas en Ajustes. Paideia la dividirá en artículos.</p><button data-go="biblioteca">Ir a Biblioteca</button></section>`;
  return `<section class="card"><h2>Elige la norma que estudiarás cada día</h2><p>Paideia te mostrará sus artículos en orden, con avisos durante el día, y al final un examen sobre lo leído.</p>
  <label for="lecdoc">Norma</label><select id="lecdoc">${norms.map(d => `<option value="${ctx.esc(d.id)}" ${/29497/.test(d.name) ? 'selected' : ''}>${ctx.esc(shortName(d))} · ${articles(d).length} artículos</option>`).join('')}</select>
  ${planForm({ goal: 10, start: '08:00', end: '20:00', every: 45, popups: true, examAt: '20:00' })}
  <div class="warn" style="margin-top:12px">Los avisos aparecen mientras Paideia esté abierta. Las normas importadas figuran con vigencia no verificada: contrasta con el SPIJ.</div>
  <p><button data-lec="start">Comenzar plan</button></p></section>`;
}

function planForm(p) {
  return `<div class="row">
  <div><label for="lecgoal">Artículos por día</label><input id="lecgoal" type="number" min="1" max="60" value="${p.goal}"></div>
  <div><label for="lecstart">Avisos desde</label><input id="lecstart" type="time" value="${p.start}"></div>
  <div><label for="lecend">hasta</label><input id="lecend" type="time" value="${p.end}"></div>
  <div><label for="lecevery">Cada (minutos)</label><input id="lecevery" type="number" min="5" max="240" value="${p.every}"></div>
  <div><label for="lecexam">Recordar examen a las</label><input id="lecexam" type="time" value="${p.examAt || p.end}"></div></div>
  <label style="display:flex;gap:8px;align-items:center;font-weight:400"><input type="checkbox" id="lecpop" style="width:auto" ${p.popups ? 'checked' : ''}> Mostrar el siguiente artículo en una ventana emergente (y notificación de Windows si la autorizas)</label>`;
}

function articleCard(a, main) {
  if (!a) return '';
  const d = planDoc(), ai = IA.status().loaded;
  return `<section class="card art"><div class="row between"><span class="eyebrow">${main ? 'ARTÍCULO DE HOY' : 'NORMA DEL DÍA'}</span><span class="pill">${ctx.esc(shortName(d))}</span></div>
  <h2 style="margin-top:10px">Artículo ${ctx.esc(a.num)}${a.title ? '.- ' + ctx.esc(a.title) : ''}</h2>
  <div class="prose arttext">${ctx.esc(a.text)}</div>
  <div class="source">${ctx.esc(shortName(d))} · art. ${ctx.esc(a.num)} · ${ctx.esc(a.page)} · ${d.kind === 'Norma' && d.verified ? 'vigencia verificada el ' + ctx.esc(d.verified) : 'vigencia no verificada'}</div>
  <div class="row" style="margin-top:14px"><button data-lec="read">✓ Leído</button><button class="secondary" data-lec="later">Repasar después (crear ficha)</button><button class="secondary" data-lec="explain" ${ai ? '' : 'disabled title="Activa la IA en Consultar materiales"'}>Explícamelo</button><button class="secondary" data-lec="prev">◀ Anterior</button><button class="secondary" data-lec="next">Siguiente ▶</button></div>
  <div id="explainbox"></div></section>`;
}

function historyHtml() {
  const days = Object.entries(S().log).filter(([, l]) => l.exam).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 7);
  if (!days.length) return '';
  return `<p class="muted" style="margin-top:14px">Últimos exámenes: ${days.map(([k, l]) => `${k.slice(5)} → ${l.exam.score}/${l.exam.total}`).join(' · ')}</p>`;
}

// ---------- Acciones ----------
function readForm(p) {
  const v = id => $('#' + id)?.value;
  return { ...p, goal: Math.max(1, Math.min(60, +v('lecgoal') || 10)), start: v('lecstart') || '08:00', end: v('lecend') || '20:00', every: Math.max(5, +v('lecevery') || 45), examAt: v('lecexam') || v('lecend') || '20:00', popups: !!$('#lecpop')?.checked };
}

async function markRead(a) {
  const log = dayLog(), key = S().plan.docId + '#' + a.num;
  if (!log.read.includes(key)) log.read.push(key);
  S().plan.pos = Math.min(arts().length, arts().indexOf(a) + 1);
  await ctx.save();
  if (log.read.length === S().plan.goal) setTimeout(() => goalPopup(), 300);
}

function cardFromArticle(a, d) {
  return { question: `¿Qué establece el artículo ${a.num}${a.title ? ' («' + a.title + '»)' : ''} de la ${shortName(d)}?`, answer: a.text.slice(0, 1500), source: shortName(d), page: `${a.page} (art. ${a.num})`, origin: 'Norma del día', note: 'Revisa y resume la respuesta con tus palabras antes de guardarla.' };
}

export async function handleClick(b) {
  const k = b.dataset.lec; if (!k) return false;
  const st = S();
  if (k === 'start') {
    const docId = $('#lecdoc').value; st.plan = { docId, pos: 0, lastPopup: 0, ...readForm({}) };
    await ctx.save(); rerender(); ctx.toast('Plan iniciado. ¡A leer!'); askNotify(); return true;
  }
  if (k === 'save-plan') { st.plan = readForm(st.plan); await ctx.save(); rerender(); askNotify(); ctx.toast('Plan guardado.'); return true; }
  if (k === 'change') { if (confirm('¿Cambiar de norma? Se conserva tu historial de lectura y exámenes.')) { st.plan = null; await ctx.save(); rerender(); } return true; }
  if (k === 'restart') { st.plan.pos = 0; await ctx.save(); rerender(); return true; }
  if (k === 'read') { const a = curArt(); await markRead(a); if (b.closest('dialog')) ctx.closeDialog(); rerender(); return true; }
  if (k === 'next' || k === 'prev') { st.plan.pos = Math.max(0, Math.min(arts().length - 1, st.plan.pos + (k === 'next' ? 1 : -1))); await ctx.save(); rerender(); return true; }
  if (k === 'later') { const a = curArt(); if (b.closest('dialog')) ctx.closeDialog(); ctx.openCard(cardFromArticle(a, planDoc())); return true; }
  if (k === 'snooze') { st.plan.lastPopup = Date.now(); await ctx.save(); ctx.closeDialog(); return true; }
  if (k === 'explain') { await explain(curArt()); return true; }
  if (k === 'test-popup') { articlePopup(true); return true; }
  if (k === 'exam-day') { startExam(examFromRead([T()]), 'Examen del día'); return true; }
  if (k === 'exam-week') {
    const days = [...Array(7)].map((_, i) => { const d = new Date(); d.setDate(d.getDate() - i); return d.toLocaleDateString('en-CA'); });
    const q = examFromRead(days, 25); if (!q.length) { ctx.toast('Aún no has leído artículos esta semana.'); return true; }
    startExam(q, 'Repaso de la semana'); return true;
  }
  if (k === 'sim-setup') { simSetup(); return true; }
  if (k === 'sim-start') {
    const ids = [...document.querySelectorAll('.simdoc:checked')].map(x => x.value); const n = +$('#simn').value || 20, min = +$('#simmin').value || 30;
    if (!ids.length) { ctx.toast('Elige al menos una norma.'); return true; }
    const pool = ids.flatMap(id => { const d = ctx.data.docs.find(x => x.id === id); return articles(d).map(a => ({ a, d })); });
    ctx.closeDialog(); startExam(buildQuestions(shuffle(pool).slice(0, n * 2), n), `Simulacro · ${n} preguntas`, min * 60); return true;
  }
  if (k === 'opt') { answer(+b.dataset.i); return true; }
  if (k === 'qnext') { exam.i++; drawQ(); return true; }
  if (k === 'exam-cards') { await errorsToCards(); return true; }
  if (k === 'exam-close') { ctx.closeDialog(); rerender(); return true; }
  return false;
}

function rerender() { if (ctx.page() === 'lectura') ctx.render(); }

async function askNotify() {
  if (S().plan?.popups && 'Notification' in window && Notification.permission === 'default') { try { await Notification.requestPermission(); } catch {} }
}

async function explain(a) {
  const box = $('#explainbox'); if (!box || !a) return;
  box.innerHTML = '<div class="answer ai"><span class="muted">Explicando…</span></div>';
  const d = planDoc();
  const msgs = [{ role: 'system', content: 'Eres un profesor de derecho peruano. Explica en español sencillo, en 4 a 6 líneas, SOLO lo que dice el artículo entregado. Respeta las negaciones y excepciones. No agregues otras normas, plazos ni casaciones. Si das un ejemplo, que se desprenda directamente del texto.' }, { role: 'user', content: `${shortName(d)} · Artículo ${a.num}${a.title ? ' – ' + a.title : ''}\n\n${a.text.slice(0, 2500)}\n\nExplícalo de forma sencilla.` }];
  try { const t = await IA.generate(msgs, { maxTokens: 300, onToken: x => { const el = box.querySelector('.answer'); if (el) el.textContent = x; } }); box.innerHTML = `<div class="answer ai">${ctx.esc(t)}</div><p class="muted">Explicación generada por la IA local a partir del artículo; puede contener errores.</p>`; }
  catch (e) { box.innerHTML = `<div class="warn">No se pudo explicar: ${ctx.esc(e.message)}</div>`; }
}

// ---------- Avisos ----------
export function tick() {
  const p = S().plan; if (!p || !planDoc() || !p.popups) return;
  if ($('#dialog').open || exam) return;
  const t = nowHM(), log = dayLog();
  if (t >= p.start && t <= p.end && log.read.length < p.goal && p.pos < arts().length && Date.now() - (p.lastPopup || 0) >= p.every * 60000) articlePopup();
  else if (t >= (p.examAt || p.end) && !log.exam && log.read.length && p.examRemind !== T()) { p.examRemind = T(); ctx.save(); examPopup(); }
}

function articlePopup(test = false) {
  const p = S().plan, a = curArt(); if (!a) return;
  p.lastPopup = Date.now(); ctx.save();
  const left = p.goal - dayLog().read.length;
  ctx.dialog(`<span class="eyebrow">NORMA DEL DÍA · faltan ${Math.max(0, left)} de ${p.goal}</span><h2 style="margin-top:8px">Artículo ${ctx.esc(a.num)}${a.title ? '.- ' + ctx.esc(a.title) : ''}</h2><p class="muted">${ctx.esc(shortName(planDoc()))} · vigencia no verificada</p><div class="prose">${ctx.esc(a.text)}</div><div class="row" style="margin-top:12px"><button data-lec="read">✓ Leído</button><button class="secondary" data-lec="later">Repasar después</button><button class="secondary" data-lec="snooze">Más tarde</button></div>`);
  if (!test && document.hidden && 'Notification' in window && Notification.permission === 'granted') {
    try { new Notification(`Norma del día · Art. ${a.num}`, { body: (a.title || a.text).slice(0, 120), icon: 'owl.svg', tag: 'paideia-articulo' }).onclick = () => window.focus(); } catch {}
  }
}

function goalPopup() {
  ctx.dialog(`<h2>¡Meta de hoy cumplida! 🎉</h2><p>Leíste ${S().plan.goal} artículos de la ${ctx.esc(shortName(planDoc()))}. ¿Haces ahora el examen del día?</p><div class="row"><button data-lec="exam-day">Hacer el examen</button><button class="secondary" onclick="document.querySelector('#dialog').close()">Después</button></div>`);
}
function examPopup() {
  ctx.dialog(`<h2>Es hora del examen del día</h2><p>Hoy leíste ${dayLog().read.length} artículo(s). Un examen corto te ayuda a fijarlos.</p><div class="row"><button data-lec="exam-day">Empezar</button><button class="secondary" onclick="document.querySelector('#dialog').close()">Hoy no</button></div>`);
  if (document.hidden && 'Notification' in window && Notification.permission === 'granted') { try { new Notification('Paideia · Examen del día', { body: 'Repasa lo que leíste hoy.', icon: 'owl.svg' }); } catch {} }
}

// ---------- Generación de preguntas (sin IA) ----------
const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pick = (a, n) => shuffle(a).slice(0, n);
const firstSentence = t => { const s = t.replace(/\s+/g, ' ').replace(/^\(\*\)\s*/, '').trim(); const m = s.match(/^.{40,260}?[.;:](?=\s|$)/); return (m ? m[0] : s.slice(0, 220) + '…'); };
const NUMW = { uno: 1, un: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, quince: 15, veinte: 20, treinta: 30, sesenta: 60, noventa: 90, cien: 100, setenta: 70, cuarenta: 40, cincuenta: 50 };
const WORD = Object.fromEntries(Object.entries(NUMW).filter(([w]) => !['un', 'una'].includes(w)).map(([w, n]) => [n, w]));
const UNIT = '(d[íi]as?\\s+h[áa]biles|d[íi]as?\\s+calendario|d[íi]as?\\s+naturales|d[íi]as?|meses|mes|años?|horas?|semanas?|Unidades de Referencia Procesal|URP|Unidades Impositivas Tributarias|UIT|remuneraciones?(?:\\s+mínimas?\\s+vitales?)?|por ciento|%)';
const NUMRE = new RegExp(`\\b((?:[a-záéíóú]+\\s+)?\\(?\\d+\\)?|${Object.keys(NUMW).join('|')})\\s+${UNIT}`, 'gi');

function numberFacts(text) {
  const out = [];
  for (const m of String(text).matchAll(NUMRE)) {
    const raw = m[1]; const d = raw.match(/\d+/); const w = raw.toLowerCase().match(/^[a-záéíóú]+/);
    const n = d ? +d[0] : NUMW[w?.[0]]; if (!n || n > 5000) continue;
    out.push({ phrase: m[0], n, unit: m[2], index: m.index });
  }
  return out;
}
const fmtNum = (n, unit, sample) => /\(\d+\)/.test(sample) && WORD[n] ? `${WORD[n]} (${n}) ${unit}` : `${n} ${unit}`;
function distractNums(n, words = false) { const c = new Set(); const base = words ? Object.keys(WORD).map(Number) : [n * 2, Math.round(n / 2), n + 5, n - 2, n + 10, n * 3, 3, 5, 10, 15, 30, 60, 90]; for (const x of base) if (x > 0 && x !== n && x < 10000) c.add(x); const near = [...c].sort((x, y) => Math.abs(x - n) - Math.abs(y - n)).slice(0, 6); return pick(near, 3); }
function sentenceAround(text, idx) { const s = text.lastIndexOf('.', idx) + 1, e = text.indexOf('.', idx); return text.slice(s, e < 0 ? undefined : e + 1).replace(/\s+/g, ' ').trim(); }

function buildQuestions(items, max = 20) {
  // items: [{a, d}] artículos de los que salen las preguntas
  const qs = [];
  const byDoc = new Map(); for (const { d } of items) if (!byDoc.has(d)) byDoc.set(d, articles(d));
  for (const { a, d } of items) {
    const all = byDoc.get(d), others = all.filter(x => x.num !== a.num), src = { doc: shortName(d), num: a.num, title: a.title, text: a.text };
    const kinds = shuffle(['title', 'content', 'number', 'tf']);
    for (const kind of kinds) {
      let q = null;
      if (kind === 'title' && a.title) {
        const opts = pick(others.filter(x => x.title && x.title !== a.title), 3);
        if (opts.length === 3) q = { type: 'Sumilla', prompt: `En la ${shortName(d)}, ¿qué regula el artículo ${a.num}?`, options: shuffle([a.title, ...opts.map(x => x.title)]), correct: a.title };
      }
      if (kind === 'content') {
        const opts = pick(others.filter(x => x.text.length > 60), 3);
        if (opts.length === 3) { const c = firstSentence(a.text); q = { type: 'Contenido', prompt: `¿Cuál de estos textos corresponde al artículo ${a.num}${a.title ? ' («' + a.title + '»)' : ''} de la ${shortName(d)}?`, options: shuffle([c, ...opts.map(x => firstSentence(x.text))]), correct: c }; }
      }
      if (kind === 'number') {
        const f = pick(numberFacts(a.text), 1)[0];
        if (f) { const sent = sentenceAround(a.text, f.index); if (sent.length > 30 && sent.length < 500) { const ok = fmtNum(f.n, f.unit, f.phrase); q = { type: 'Plazos y cantidades', prompt: `Completa (art. ${a.num}, ${shortName(d)}):\n«${sent.replace(f.phrase, '_____')}»`, options: shuffle([ok, ...distractNums(f.n, /\(\d+\)/.test(f.phrase)).map(x => fmtNum(x, f.unit, f.phrase))]), correct: ok }; } }
      }
      if (kind === 'tf') {
        const f = pick(numberFacts(a.text), 1)[0];
        if (f) { const sent = sentenceAround(a.text, f.index); if (sent.length > 30 && sent.length < 400) { const truth = Math.random() < 0.5; const alt = fmtNum(distractNums(f.n, /\(\d+\)/.test(f.phrase))[0], f.unit, f.phrase); q = { type: 'Verdadero o falso', prompt: `Según el artículo ${a.num} de la ${shortName(d)}:\n«${truth ? sent : sent.replace(f.phrase, alt)}»`, options: ['Verdadero', 'Falso'], correct: truth ? 'Verdadero' : 'Falso', note: truth ? '' : `El texto dice «${f.phrase}».` }; } }
      }
      if (q) { qs.push({ ...q, src }); break; }
    }
    if (qs.length >= max) break;
  }
  return shuffle(qs);
}

function examFromRead(days, max = 20) {
  const keys = [...new Set(days.flatMap(d => S().log[d]?.read || []))];
  const items = keys.map(k => { const [id, num] = k.split('#'); const d = ctx.data.docs.find(x => x.id === id); const a = d && articles(d).find(x => x.num === num); return a && { a, d }; }).filter(Boolean);
  // Hasta 2 preguntas por artículo leído cuando son pocos.
  const pool = items.length * 2 <= max ? [...items, ...items] : items;
  return buildQuestions(shuffle(pool), Math.min(max, Math.max(3, items.length * 2)));
}

function simSetup() {
  const norms = normsWithArticles();
  ctx.dialog(`<h2>Simulacro cronometrado</h2><p>Preguntas al azar de las normas que elijas (no solo de lo leído). Útil para el concurso.</p><div class="simlist">${norms.map(d => `<label style="display:flex;gap:8px;font-weight:400;margin:4px 0"><input type="checkbox" class="simdoc" style="width:auto" value="${ctx.esc(d.id)}" ${/29497|003-97-TR|Constituci/.test(d.name) ? 'checked' : ''}> ${ctx.esc(shortName(d))} (${articles(d).length})</label>`).join('')}</div><div class="row"><div><label for="simn">Preguntas</label><input id="simn" type="number" value="20" min="5" max="100"></div><div><label for="simmin">Minutos</label><input id="simmin" type="number" value="30" min="5" max="180"></div></div><p><button data-lec="sim-start">Empezar simulacro</button></p>`);
}

// ---------- Examen ----------
let exam = null, timer = null;
function startExam(qs, title, seconds = 0) {
  if (!qs.length) { ctx.toast('No hay suficientes artículos con contenido para generar preguntas.'); return; }
  exam = { qs, title, i: 0, ok: 0, wrong: [], answered: false, end: seconds ? Date.now() + seconds * 1000 : 0 };
  clearInterval(timer); if (seconds) timer = setInterval(() => { const t = $('#examtimer'); if (!exam) return clearInterval(timer); const left = Math.max(0, Math.round((exam.end - Date.now()) / 1000)); if (t) t.textContent = `⏱ ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`; if (!left) { clearInterval(timer); exam.i = exam.qs.length; drawQ(); } }, 1000);
  drawQ();
}
function drawQ() {
  if (exam.i >= exam.qs.length) return finish();
  const q = exam.qs[exam.i]; exam.answered = false;
  ctx.dialog(`<div class="row between"><span class="eyebrow">${ctx.esc(exam.title)} · ${exam.i + 1}/${exam.qs.length} · ${ctx.esc(q.type)}</span><span class="pill" id="examtimer">${exam.end ? '⏱' : `${exam.ok} aciertos`}</span></div>
  <p class="question" style="font-size:20px;white-space:pre-wrap">${ctx.esc(q.prompt)}</p><div class="list" id="opts">${q.options.map((o, i) => `<button class="secondary opt" data-lec="opt" data-i="${i}" style="text-align:left">${ctx.esc(o)}</button>`).join('')}</div><div id="feedback"></div>`, true);
}
function answer(i) {
  if (!exam || exam.answered) return; exam.answered = true;
  const q = exam.qs[exam.i], chosen = q.options[i], ok = chosen === q.correct;
  if (ok) exam.ok++; else exam.wrong.push(q);
  document.querySelectorAll('.opt').forEach((b, j) => { b.disabled = true; if (q.options[j] === q.correct) b.classList.add('right'); else if (j === i) b.classList.add('wrongopt'); });
  $('#feedback').innerHTML = `<div class="${ok ? 'ok' : 'warn'}" style="margin-top:12px"><b>${ok ? '¡Correcto!' : 'Incorrecto.'}</b> ${q.note ? ctx.esc(q.note) + ' ' : ''}<br><span class="muted">Art. ${ctx.esc(q.src.num)}${q.src.title ? ' – ' + ctx.esc(q.src.title) : ''} · ${ctx.esc(q.src.doc)}</span><div class="prose" style="max-height:140px;margin-top:6px">${ctx.esc(q.src.text.slice(0, 900))}</div></div><p><button data-lec="qnext">${exam.i + 1 < exam.qs.length ? 'Siguiente pregunta' : 'Ver resultado'}</button></p>`;
}
async function finish() {
  clearInterval(timer);
  const { ok, qs, wrong, title } = exam;
  if (title === 'Examen del día') { dayLog().exam = { score: ok, total: qs.length }; await ctx.save(); }
  else { const l = dayLog(); (l.other ||= []).push({ title, score: ok, total: qs.length }); await ctx.save(); }
  const pct = Math.round(100 * ok / qs.length);
  ctx.dialog(`<h2>${ctx.esc(title)}: ${ok}/${qs.length} (${pct} %)</h2><p>${pct >= 80 ? '¡Excelente! Vas muy bien.' : pct >= 60 ? 'Buen avance. Repasa los artículos fallados.' : 'Conviene releer estos artículos antes de seguir.'}</p>${wrong.length ? `<h3>Para repasar</h3><div class="list">${[...new Map(wrong.map(q => [q.src.doc + q.src.num, q])).values()].map(q => `<div class="item">Art. ${ctx.esc(q.src.num)}${q.src.title ? ' – ' + ctx.esc(q.src.title) : ''} · <span class="muted">${ctx.esc(q.src.doc)}</span></div>`).join('')}</div><p><button data-lec="exam-cards">Crear fichas de repaso con los errores</button></p>` : ''}<p><button class="secondary" data-lec="exam-close">Cerrar</button></p>`);
}
async function errorsToCards() {
  const uniq = [...new Map(exam.wrong.map(q => [q.src.doc + q.src.num, q])).values()];
  for (const q of uniq) ctx.data.cards.push({ id: crypto.randomUUID(), question: `¿Qué establece el artículo ${q.src.num}${q.src.title ? ' («' + q.src.title + '»)' : ''} de la ${q.src.doc}?`, answer: q.src.text.slice(0, 1500), source: q.src.doc, page: `art. ${q.src.num}`, origin: 'Examen', due: ctx.today(), interval: 0 });
  await ctx.save(); ctx.toast(`${uniq.length} ficha(s) creadas; aparecerán en Estudiar.`); exam = null; ctx.closeDialog(); rerender();
}
export function closeExamIfOpen() { exam = null; clearInterval(timer); }
// Para pruebas
export const __test = { buildQuestions, numberFacts, articles };

// ---------- Fichas automáticas por artículo ----------
// Una ficha por artículo («¿Qué establece…?») y, si el artículo tiene un plazo o cantidad, otra para completarlo.
// Las fichas nuevas se reparten en el calendario (por defecto 10 por día) para no saturar los repasos.
export function makeCards(doc, perDay) {
  const list = articles(doc); if (!list.length) return { created: 0, articles: 0 };
  perDay = Math.max(1, +perDay || +ctx.data.settings.newPerDay || 10);
  const have = new Set(ctx.data.cards.filter(c => c.artKey).map(c => c.artKey));
  const name = shortName(doc); let created = 0, slot = 0;
  // Cada norma se programa desde hoy: N artículos nuevos por día (más sus fichas de plazos).
  const dayFor = n => { const d = new Date(); d.setDate(d.getDate() + Math.floor(n / perDay)); return d.toLocaleDateString('en-CA'); };
  for (const a of list) {
    const key = doc.id + '#' + a.num;
    if (!have.has(key)) {
      ctx.data.cards.push({ id: crypto.randomUUID(), question: `¿Qué establece el artículo ${a.num}${a.title ? ' («' + a.title + '»)' : ''} de la ${name}?`, answer: a.text.slice(0, 1500), source: name, page: `art. ${a.num}`, origin: 'Norma (automática)', artKey: key, due: dayFor(slot++), interval: 0 });
      created++;
    }
    const nkey = key + '#n';
    const f = numberFacts(a.text)[0];
    if (f && !have.has(nkey)) {
      const sent = sentenceAround(a.text, f.index);
      if (sent.length > 30 && sent.length < 450) {
        ctx.data.cards.push({ id: crypto.randomUUID(), question: `Completa (art. ${a.num}, ${name}):\n«${sent.replace(f.phrase, '_____')}»`, answer: f.phrase + '\n\n' + sent, source: name, page: `art. ${a.num}`, origin: 'Norma (automática)', artKey: nkey, due: dayFor(slot - 1), interval: 0 });
        created++;
      }
    }
  }
  return { created, articles: list.length, days: Math.ceil(list.length / perDay) };
}
export function removeAutoCards(doc) {
  const before = ctx.data.cards.length;
  ctx.data.cards = ctx.data.cards.filter(c => !(c.artKey && c.artKey.startsWith(doc.id + '#')));
  return before - ctx.data.cards.length;
}
export const countAutoCards = doc => ctx.data.cards.filter(c => c.artKey && c.artKey.startsWith(doc.id + '#')).length;

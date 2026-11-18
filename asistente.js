// Paideia · Pantalla «Consultar materiales»: búsqueda con fuentes + asistente de IA local.
import { retrieve, sourceInfo, verifyAnswer, NO_SUPPORT, clozeCard } from './rag.js';
import * as IA from './ia.js';

export const SITES = [
  { name: 'SPIJ – Sistema Peruano de Información Jurídica (MINJUSDH)', url: 'https://spij.minjus.gob.pe/', official: true, desc: 'Normas sistematizadas y concordadas. Usa «Normativa de acceso libre». Fuente recomendada para comprobar textos actualizados.' },
  { name: 'Diario Oficial El Peruano – Normas Legales', url: 'https://diariooficial.elperuano.pe/Normas', official: true, desc: 'Publicación oficial de normas (versión publicada, sin consolidar modificaciones).' },
  { name: 'Archivo Digital de la Legislación del Perú (Congreso)', url: 'https://leyes.congreso.gob.pe/', official: true, desc: 'Leyes, decretos legislativos y textos originales con sus modificaciones.' },
  { name: 'Tribunal Constitucional – Jurisprudencia', url: 'https://www.tc.gob.pe/jurisprudencia/', official: true, desc: 'Sentencias y autos del TC (precedentes y doctrina jurisprudencial).' },
  { name: 'Poder Judicial del Perú', url: 'https://www.pj.gob.pe/', official: true, desc: 'Portal del Poder Judicial: jurisprudencia, plenos y acuerdos jurisdiccionales.' },
  { name: 'Junta Nacional de Justicia', url: 'https://www.jnj.gob.pe/', official: true, desc: 'Convocatorias, bases y reglamentos de concursos de jueces y fiscales.' },
  { name: 'LP Pasión por el Derecho', url: 'https://lpderecho.pe/', search: 'https://lpderecho.pe/?s=', official: false, desc: 'Portal jurídico peruano muy consultado (normas, jurisprudencia, comentarios). No es fuente oficial: contrasta con SPIJ o El Peruano.' }
];
const OFFICIAL_HOST = h => /(^|\.)gob\.pe$|(^|\.)elperuano\.pe$/.test(h);

let ctx; // {data, save, toast, esc, safeUrl, openCard}
let last = { query: '', results: [], answer: '', fragments: [], mode: 'responder' };
let busy = false;
const $ = s => document.querySelector(s);

export function init(c) { ctx = c; }

const MODES = {
  responder: { label: 'Responder una pregunta', ask: q => `Responde la pregunta usando solo los fragmentos.\n\nPREGUNTA: ${q}` },
  explicar: { label: 'Explicar de forma sencilla', ask: q => `Explica de forma sencilla, como a un estudiante que empieza, lo que dicen los fragmentos sobre: ${q}. Usa un ejemplo breve solo si se desprende de los fragmentos.` },
  resumir: { label: 'Resumir', ask: q => `Resume en 3 a 6 viñetas lo que dicen los fragmentos sobre: ${q}. Cada viñeta con su cita.` },
  practica: { label: 'Crear pregunta de práctica', ask: q => `Redacta UNA pregunta de práctica con su respuesta sobre «${q}», basada solo en los fragmentos. Usa exactamente este formato:\nPREGUNTA: (la pregunta)\nRESPUESTA: (la respuesta, con citas [F1], [F2]...)` }
};

const SYSTEM = `Eres el asistente de estudio jurídico de Paideia. Respondes siempre en español y únicamente con la información de los FRAGMENTOS que te entrega el usuario.
Reglas obligatorias:
1. No uses conocimientos propios ni externos. Si los fragmentos no contienen información suficiente, responde exactamente: «${NO_SUPPORT}» y di brevemente qué información faltaría.
2. Indica la fuente de cada afirmación con la etiqueta del fragmento, por ejemplo [F2].
3. No inventes normas, artículos, plazos, fechas, citas textuales, casaciones ni referencias. Solo menciona números de artículos, leyes, expedientes o plazos que aparezcan literalmente en los fragmentos.
4. Respeta el tipo de fuente: los apuntes y las webs no oficiales no son normas oficiales. No afirmes que una norma está vigente salvo que el fragmento diga «vigencia verificada».
5. Si un fragmento indica otro país, advierte que no corresponde necesariamente al derecho peruano.
6. Sé claro y breve (máximo 250 palabras). No des consejos legales sobre casos reales; es material de estudio.`;

function fragmentHeader(f, i) {
  const info = sourceInfo(f.doc, f.text);
  return `[F${i + 1}] Fuente: ${f.doc.name}${info.art ? ' · ' + info.art : ''} · ${f.page} · Tipo: ${info.tipo} · País: ${info.pais}${info.foreign.length ? ' · OTRO PAÍS: ' + info.foreign.join(', ') : ''}${info.mentions.length ? ' · menciona a: ' + info.mentions.join(', ') : ''}`;
}

export function buildMessages(mode, query, fragments) {
  const ctxText = fragments.map((f, i) => fragmentHeader(f, i) + '\n' + f.text).join('\n\n');
  return [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: `FRAGMENTOS:\n${ctxText}\n\n${MODES[mode].ask(query)}` }
  ];
}

// ---------- Render ----------
export function render() {
  const s = ctx.data.settings.ai ||= { model: 'ligero' };
  return `<div class="split"><section class="card"><h2>Consulta tus materiales</h2>
  <p>Escribe una pregunta o un tema. Paideia busca primero los fragmentos más pertinentes de tu biblioteca y, si la IA local está activa, redacta la respuesta citando esas fuentes.</p>
  <label for="query">¿Qué deseas consultar en lo guardado?</label>
  <textarea id="query" placeholder="Ej. plazo para apelar sentencia">${ctx.esc(last.query)}</textarea>
  <label for="mode">¿Qué necesitas?</label>
  <select id="mode">${Object.entries(MODES).map(([k, m]) => `<option value="${k}" ${k === last.mode ? 'selected' : ''}>${m.label}</option>`).join('')}</select>
  <div class="row" style="margin-top:14px"><button data-action="ask" id="askbtn">✧ Preguntar a la IA</button><button class="secondary" data-action="search">Solo buscar fragmentos</button><button class="secondary hidden" data-action="stopai" id="stopbtn">Detener</button></div>
  <div id="answerbox"></div>
  <div id="results"></div>
  <details class="webtopic"><summary>Fuentes jurídicas del Perú en internet</summary>
  <p class="muted">Abre la fuente en una pestaña nueva, busca la norma o sentencia y descárgala (por ejemplo, la exportación .doc del SPIJ o el PDF de El Peruano). Luego impórtala en Biblioteca, o pega aquí su texto. Paideia no envía tus documentos ni preguntas a estos sitios.</p>
  <label for="webterm">Término para buscar (se copiará para que lo pegues en el buscador del sitio)</label><input id="webterm" placeholder="Ej. Ley 29497 artículo 16">
  <div class="sites">${SITES.map((x, i) => `<div class="site"><div><b>${ctx.esc(x.name)}</b> <span class="pill ${x.official ? '' : 'unoff'}">${x.official ? 'Oficial' : 'No oficial'}</span><br><span class="muted">${ctx.esc(x.desc)}</span></div><button class="secondary small" data-site="${i}">Abrir</button></div>`).join('')}</div>
  <details class="pasteweb"><summary>Guardar el texto de una página consultada</summary>
  <label for="wtitle">Título</label><input id="wtitle" placeholder="Ej. Ley 29497 – texto actualizado (SPIJ)">
  <label for="wurl">Dirección (https://…)</label><input id="wurl" placeholder="https://spij.minjus.gob.pe/...">
  <label for="wkind">Tipo</label><select id="wkind"><option>Norma</option><option>Jurisprudencia</option><option>Documento oficial</option><option>Web no oficial</option></select>
  <label for="wtext">Texto copiado de la página</label><textarea id="wtext" style="min-height:140px"></textarea>
  <p class="muted">Si la dirección no pertenece a un portal oficial (gob.pe, elperuano.pe), se guardará como «Web no oficial». Se registra la fecha de consulta; la vigencia queda «no verificada» hasta que la marques.</p>
  <button data-action="saveweb">Guardar en mi biblioteca</button></details>
  </details>
  </section>
  <aside class="card aipanel" id="aipanel">${panel()}</aside></div>`;
}

let prep = { state: 'idle', progress: 0, text: '', error: '', support: null, cached: null };

function panel() {
  const s = ctx.data.settings.ai || { model: 'ligero' };
  const st = IA.status();
  const sup = prep.support;
  const f16 = sup?.f16 ?? true;
  const modelCards = Object.entries(IA.MODELS).map(([k, m]) => `<label class="model ${s.model === k ? 'sel' : ''}"><input type="radio" name="aimodel" value="${k}" ${s.model === k ? 'checked' : ''} ${prep.state === 'loading' ? 'disabled' : ''}><span><b>${m.name}</b> <span class="pill">${m.tag}</span><br><span class="muted">Descarga ${m.download} · memoria de video ≈ ${(m.vram[f16 ? 'f16' : 'f32'] / 1024).toFixed(1).replace('.', ',')} GB · ${m.ram}</span><br><span class="muted">Licencia ${m.license}</span><br><span class="muted">${m.note}</span></span></label>`).join('');
  let stateHtml = '';
  if (st.loaded) stateHtml = `<div class="ok">● IA local lista: ${ctx.esc(IA.MODELS[s.model]?.name || st.id)}. Funciona sin conexión mientras el navegador conserve el modelo.</div>`;
  else if (prep.state === 'loading') stateHtml = `<div class="progress"><div style="width:${Math.round(prep.progress * 100)}%"></div></div><p class="muted" id="progtext">${ctx.esc(prep.text || 'Preparando…')}</p>`;
  else if (sup && !sup.ok) stateHtml = `<div class="warn"><b>Este navegador o equipo no puede ejecutar la IA local.</b><br>${sup.problems.map(ctx.esc).join('<br>')}<br><br><b>Alternativa:</b> puedes seguir usando «Solo buscar fragmentos», que muestra los pasajes de tus materiales con su fuente y página, y crear fichas a partir de ellos.</div>`;
  else if (prep.error) stateHtml = `<div class="warn"><b>No se pudo activar la IA.</b> ${ctx.esc(prep.error)}<br>La búsqueda de fragmentos con fuentes sigue disponible.</div>`;
  else if (prep.cached) stateHtml = `<div class="ok">El modelo ya está descargado en este navegador. Pulsa «Activar IA» (no requiere internet).</div>`;
  else stateHtml = `<p class="muted">La IA aún no está descargada. La primera descarga necesita internet; después puede usarse sin conexión.</p>`;
  const warn = sup?.warnings?.length ? `<div class="warn">${sup.warnings.map(ctx.esc).join('<br>')}</div>` : '';
  const free = sup?.freeMB != null ? `<p class="muted">Espacio disponible para este sitio: ≈ ${(sup.freeMB / 1024).toFixed(1).replace('.', ',')} GB${sup.gpu ? ' · Gráficos: ' + ctx.esc(sup.gpu) : ''}${sup.ok ? ' · formato ' + (sup.f16 ? 'f16' : 'f32 (compatibilidad)') : ''}</p>` : '';
  const actions = st.loaded
    ? `<button class="secondary" data-action="aiunload">Desactivar (liberar memoria)</button>`
    : `<button data-action="aiload" ${prep.state === 'loading' || (sup && !sup.ok) ? 'disabled' : ''}>${prep.cached ? 'Activar IA' : 'Descargar y activar IA'}</button>`;
  return `<h3>IA local</h3>
  <p class="muted">El modelo se ejecuta en tu computadora con WebGPU. Tus documentos, preguntas y avances <b>no se envían</b> a ningún servidor de IA.</p>
  <div class="models">${modelCards}</div>
  ${stateHtml}${warn}${free}
  <div class="row" style="margin-top:12px">${actions}${prep.cached && !st.loaded && prep.state !== 'loading' ? '<button class="danger" data-action="airemove">Quitar modelo del equipo</button>' : ''}</div>
  <div class="warn" style="margin-top:14px">Las respuestas se basan solo en tus materiales y pueden contener errores. Las normas importadas no se consideran vigentes sin comprobación en la fuente oficial (p. ej., el SPIJ).</div>`;
}

export function refreshPanel() { const p = $('#aipanel'); if (p) p.innerHTML = panel(); updateAskBtn(); }

function updateAskBtn() {
  const b = $('#askbtn'); if (!b) return;
  b.textContent = IA.status().loaded ? '✧ Preguntar a la IA' : '✧ Preguntar (activa la IA primero)';
  b.disabled = busy;
}

export async function afterRender() {
  updateAskBtn();
  if (last.results.length) drawResults(last.results, last.sufficient);
  if (last.answer) drawAnswer(last.answer, last.fragments, last.mode, false);
  if (!prep.support) { prep.support = await IA.checkSupport(); refreshPanel(); }
  if (prep.support.ok && prep.cached === null) {
    const s = ctx.data.settings.ai || { model: 'ligero' };
    prep.cached = await IA.isCached(s.model, prep.support.f16);
    refreshPanel();
  }
}

// ---------- Búsqueda ----------
export function search(q) {
  last.query = q;
  const r = retrieve(ctx.data.docs, q, 6);
  last.results = r.results; last.sufficient = r.sufficient; last.missing = r.missing || [];
  drawResults(r.results, r.sufficient);
  return r;
}

function srcLine(f) {
  const info = sourceInfo(f.doc, f.text);
  const d = f.doc;
  return `<div class="source"><b>${ctx.esc(d.name)}</b>${info.art ? ' · ' + ctx.esc(info.art) : ''} · ${ctx.esc(f.page || 'página no disponible')} · ${ctx.esc(info.tipo)} · País: ${ctx.esc(info.pais)}${info.foreign.length ? ` · <span class="flag">Se refiere a otro país: ${ctx.esc(info.foreign.join(', '))}</span>` : ''}${info.mentions.length ? ` · <span class="flag">Menciona a: ${ctx.esc(info.mentions.join(', '))}</span>` : ''}${d.url ? ` · <a href="${ctx.esc(ctx.safeUrl(d.url))}" target="_blank" rel="noopener noreferrer">Abrir fuente</a> · consultado ${ctx.esc(d.retrieved || 'fecha no disponible')}` : ''}</div>`;
}

function drawResults(results, sufficient) {
  const el = $('#results'); if (!el) return;
  if (!results.length) { el.innerHTML = `<p class="warn" style="margin-top:14px">No encontré pasajes relacionados en tu biblioteca. Prueba otros términos o importa una fuente.</p>`; return; }
  const ai = IA.status().loaded;
  el.innerHTML = `<h3 style="margin-top:22px">Fragmentos encontrados</h3>${sufficient ? '' : '<p class="warn">Los fragmentos coinciden solo parcialmente con tu consulta; puede que tus materiales no traten el tema. La IA no redactará una respuesta sin sustento suficiente.</p>'}${last.missing?.length ? `<p class="muted">Términos que no aparecen en ningún material: ${ctx.esc(last.missing.join(', '))}</p>` : ''}` + results.map((r, i) => `<div class="item frag" style="margin-top:12px"><span class="pill">F${i + 1}</span><div class="fragtext">${ctx.esc(r.text)}</div>${srcLine(r)}
  <div class="row" style="margin-top:10px"><button class="secondary small" data-frag="explicar" data-i="${i}" ${ai ? '' : 'disabled title="Activa la IA local"'}>Explicar sencillo</button><button class="secondary small" data-frag="resumir" data-i="${i}" ${ai ? '' : 'disabled title="Activa la IA local"'}>Resumir</button><button class="secondary small" data-frag="practica" data-i="${i}">${ai ? 'Pregunta de práctica' : 'Pregunta para completar (sin IA)'}</button><button class="secondary small" data-frag="ficha" data-i="${i}">Crear ficha</button></div></div>`).join('');
}

// ---------- IA ----------
async function runAI(mode, query, fragments) {
  if (busy) return;
  last.mode = mode; last.fragments = fragments;
  const box = $('#answerbox');
  if (!fragments.length) { last.answer = NO_SUPPORT; drawAnswer(NO_SUPPORT, [], mode, false, 'No hay fragmentos pertinentes en tu biblioteca: la IA no se consultó para evitar respuestas sin fuente.'); return; }
  busy = true; updateAskBtn(); $('#stopbtn')?.classList.remove('hidden');
  box.innerHTML = `<div class="answer ai"><span class="muted">Redactando con base en ${fragments.length} fragmento(s)…</span></div>`;
  try {
    const text = await IA.generate(buildMessages(mode, query, fragments), { onToken: t => { const a = box.querySelector('.answer'); if (a) a.textContent = t; } });
    last.answer = text || NO_SUPPORT;
    drawAnswer(last.answer, fragments, mode, true);
  } catch (e) {
    console.error(e);
    box.innerHTML = `<div class="warn">No se pudo generar la respuesta: ${ctx.esc(IA.friendlyError(e).message)}. Los fragmentos con sus fuentes siguen disponibles abajo.</div>`;
  } finally { busy = false; updateAskBtn(); $('#stopbtn')?.classList.add('hidden'); }
}

function drawAnswer(text, fragments, mode, fresh, note = '') {
  const box = $('#answerbox'); if (!box) return;
  const v = verifyAnswer(text, fragments);
  const noSupport = text.includes(NO_SUPPORT.slice(0, 30));
  const warns = [];
  if (note) warns.push(note);
  if (v.unverified.length) warns.push(`<b>Atención:</b> la respuesta menciona referencias que <b>no aparecen</b> en los fragmentos usados: ${v.unverified.map(u => ctx.esc(u.label)).join('; ')}. No las uses sin comprobarlas en la fuente original.`);
  if (v.badCites.length) warns.push(`La respuesta cita fragmentos inexistentes (${v.badCites.map(n => 'F' + n).join(', ')}).`);
  if (!noSupport && fragments.length && !v.cites.length) warns.push('La respuesta no indica qué fragmento respalda cada idea. Contrástala con las fuentes de abajo.');
  const used = v.cites.length ? v.cites.map(n => fragments[n - 1]) : fragments;
  const srcs = fragments.length ? `<div class="usedsrc"><b>Fuentes consultadas:</b>${fragments.map((f, i) => `<div>${v.cites.includes(i + 1) ? '✔' : '·'} [F${i + 1}] ${ctx.esc(f.doc.name)}${sourceInfo(f.doc, f.text).art ? ' · ' + ctx.esc(sourceInfo(f.doc, f.text).art) : ''} · ${ctx.esc(f.page || 'página no disponible')} · ${ctx.esc(sourceInfo(f.doc, f.text).tipo)}</div>`).join('')}</div>` : '';
  box.innerHTML = `<h3 style="margin-top:22px">Respuesta ${noSupport ? '' : 'de la IA local'}</h3><div class="answer ai">${ctx.esc(text)}</div>${warns.map(w => `<div class="warn" style="margin-top:8px">${w}</div>`).join('')}${srcs}
  ${noSupport ? '' : `<div class="row" style="margin-top:10px"><button data-action="answercard">${mode === 'practica' ? 'Revisar y guardar como ficha' : 'Crear ficha con esta respuesta'}</button></div>`}`;
  last.used = used;
  if (fresh && mode === 'practica' && !noSupport) openPractice(text, used);
}

function parsePractice(text) {
  const m = text.match(/PREGUNTA\s*:\s*([\s\S]*?)\n\s*RESPUESTA\s*:\s*([\s\S]*)/i);
  return m ? { q: m[1].trim(), a: m[2].trim() } : { q: '', a: text.trim() };
}

function cardSource(frags) {
  const names = [...new Set(frags.map(f => f.doc.name))];
  const pages = [...new Set(frags.map(f => { const art = sourceInfo(f.doc, f.text).art; return `${frags.length > 1 && names.length > 1 ? f.doc.name + ': ' : ''}${f.page || 'página no disponible'}${art ? ' (' + art + ')' : ''}`; }))];
  return { source: names.join('; '), page: pages.join('; ') };
}

function openPractice(text, frags) {
  const p = parsePractice(text); const s = cardSource(frags);
  ctx.openCard({ question: p.q, answer: p.a, source: s.source, page: s.page, origin: 'IA local', note: 'Ficha generada por la IA local. Revísala y corrígela antes de guardarla; comprueba que la respuesta coincida con la fuente.' });
}

export async function handleClick(b) {
  const a = b.dataset.action;
  if (a === 'search') { search($('#query').value); return true; }
  if (a === 'ask') {
    const q = $('#query').value.trim(); if (!q) { ctx.toast('Escribe una pregunta o un tema.'); return true; }
    const mode = $('#mode').value;
    if (!IA.status().loaded) { search(q); ctx.toast('La IA local no está activa: se muestran los fragmentos con sus fuentes.'); $('#aipanel')?.scrollIntoView({ behavior: 'smooth' }); return true; }
    const r = search(q);
    await runAI(mode, q, r.sufficient ? r.results.slice(0, 5) : []);
    return true;
  }
  if (b.dataset.site) {
    const x = SITES[+b.dataset.site]; const term = ($('#webterm')?.value || '').trim();
    if (term) { try { await navigator.clipboard.writeText(term); ctx.toast('Término copiado: pégalo en el buscador del sitio.'); } catch {} }
    window.open(term && x.search ? x.search + encodeURIComponent(term) : x.url, '_blank', 'noopener');
    return true;
  }
  if (a === 'saveweb') {
    const title = $('#wtitle').value.trim(), text = $('#wtext').value.trim(); let url = $('#wurl').value.trim(), kind = $('#wkind').value;
    if (!title || text.length < 40) { ctx.toast('Escribe un título y pega el texto de la página.'); return true; }
    let host = '';
    if (url) { try { const u = new URL(url); if (u.protocol !== 'https:') throw 0; host = u.hostname; url = u.href; } catch { ctx.toast('La dirección debe empezar con https://'); return true; } }
    let note = '';
    if (!host || !OFFICIAL_HOST(host)) { if (kind !== 'Web no oficial') note = ' Se guardó como «Web no oficial» porque la dirección no es de un portal oficial.'; kind = 'Web no oficial'; }
    ctx.addDoc({ name: title, kind, url: url || undefined, retrieved: new Date().toLocaleDateString('en-CA'), country: 'Perú', pages: [{ page: 'página no disponible', text }] });
    await ctx.save(); ['wtitle', 'wurl', 'wtext'].forEach(i => $('#' + i).value = '');
    ctx.toast('Fuente guardada en tu biblioteca.' + note); return true;
  }
  if (a === 'stopai') { IA.stop(); return true; }
  if (a === 'answercard') {
    const frags = last.used || last.fragments; const s = cardSource(frags);
    if (last.mode === 'practica') openPractice(last.answer, frags);
    else ctx.openCard({ question: last.query, answer: last.answer.replace(/\s*\[F\d+\]/g, ''), source: s.source, page: s.page, origin: 'IA local', note: 'Respuesta generada por la IA local. Revísala y edítala antes de guardarla.' });
    return true;
  }
  if (b.dataset.frag) {
    const f = last.results[+b.dataset.i]; if (!f) return true;
    const kind = b.dataset.frag;
    if (kind === 'ficha') { ctx.openCard({ question: '', answer: f.text, source: f.doc.name, page: f.page + (sourceInfo(f.doc, f.text).art ? ' (' + sourceInfo(f.doc, f.text).art + ')' : ''), origin: 'Fragmento', note: 'Escribe la pregunta y ajusta la respuesta antes de guardar.' }); return true; }
    if (kind === 'practica' && !IA.status().loaded) {
      const c = clozeCard(f.text, ctx.data.docs, last.query);
      if (!c) { ctx.toast('No pude generar una pregunta de este fragmento. Crea la ficha manualmente.'); return true; }
      ctx.openCard({ ...c, source: f.doc.name, page: f.page, origin: 'Completar (sin IA)', note: 'Pregunta para completar generada sin IA. Revísala y edítala antes de guardar.' });
      return true;
    }
    if (!IA.status().loaded) { ctx.toast('Activa la IA local para esta acción.'); return true; }
    await runAI(kind, last.query || 'el fragmento', [f]);
    return true;
  }
  if (a === 'aiload') { await prepare(); return true; }
  if (a === 'aiunload') { await IA.unload(); refreshPanel(); if (last.results.length) drawResults(last.results, last.sufficient); ctx.toast('IA desactivada. El modelo sigue guardado en el navegador.'); return true; }
  if (a === 'airemove') {
    if (!confirm('¿Quitar el modelo de este navegador? Tendrás que descargarlo de nuevo para usar la IA. Tus documentos y fichas no se tocan.')) return true;
    const s = ctx.data.settings.ai; await IA.removeFromDevice(s.model, prep.support?.f16 ?? true); prep.cached = false; refreshPanel(); ctx.toast('Modelo eliminado de este navegador.'); return true;
  }
  return false;
}

export async function handleChange(e) {
  if (e.target.name === 'aimodel') {
    ctx.data.settings.ai = { ...(ctx.data.settings.ai || {}), model: e.target.value }; await ctx.save();
    prep.error = ''; prep.cached = prep.support?.ok ? await IA.isCached(e.target.value, prep.support.f16) : null; refreshPanel(); return true;
  }
  return false;
}

async function prepare() {
  const sup = prep.support = await IA.checkSupport(true);
  if (!sup.ok) { refreshPanel(); return; }
  const key = ctx.data.settings.ai?.model || 'ligero';
  const m = IA.MODELS[key];
  const cached = await IA.isCached(key, sup.f16);
  if (!cached) {
    if (!navigator.onLine) { prep.error = 'Necesitas internet para la primera descarga del modelo.'; refreshPanel(); return; }
    if (sup.freeMB != null && sup.freeMB < m.downloadMB * 1.2) { prep.error = `El navegador solo permite guardar ≈ ${(sup.freeMB / 1024).toFixed(1)} GB en este sitio y el modelo ocupa ${m.download}. Libera espacio en disco o elige el modelo recomendado.`; refreshPanel(); return; }
    if (!confirm(`Se descargará ${m.name} (${m.download}) desde Hugging Face. Se recomienda una conexión estable y sin límite de datos. Tus documentos no se envían. ¿Continuar?`)) return;
  }
  prep.state = 'loading'; prep.error = ''; prep.progress = 0; prep.text = cached ? 'Cargando el modelo desde este equipo…' : 'Iniciando descarga…';
  refreshPanel();
  try {
    await IA.load(key, sup.f16, p => {
      prep.progress = p.progress || 0; prep.text = translateProgress(p.text, cached);
      const bar = document.querySelector('.progress div'); if (bar) bar.style.width = Math.round(prep.progress * 100) + '%';
      const t = $('#progtext'); if (t) t.textContent = prep.text;
    });
    prep.state = 'idle'; prep.cached = true;
    ctx.data.settings.ai = { ...ctx.data.settings.ai, model: key, ready: IA.modelId(key, sup.f16) }; await ctx.save();
    ctx.toast('IA local lista.');
  } catch (e) {
    console.error(e); prep.state = 'idle'; prep.error = e.message;
  }
  refreshPanel(); if (last.results.length) drawResults(last.results, last.sufficient);
}

function translateProgress(t = '', cached) {
  let m;
  if ((m = t.match(/\[(\d+)\/(\d+)\]:\s*([\d.]+)\s*MB/i))) return `${cached ? 'Cargando' : 'Descargando'} el modelo: parte ${m[1]} de ${m[2]} · ${Math.round(+m[3])} MB${/(\d+)% completed/.test(t) ? ' · ' + t.match(/(\d+)% completed/)[1] + ' %' : ''}`;
  if (/Loading model from cache/i.test(t)) return 'Cargando el modelo en la tarjeta gráfica…';
  if (/shader|compil/i.test(t)) return 'Preparando la tarjeta gráfica (puede tardar la primera vez)…';
  if (/Finish loading/i.test(t)) return 'Modelo cargado.';
  return t ? t.replace(/Fetching param cache/i, 'Descargando parámetros').replace(/Loading/i, 'Cargando') : 'Preparando…';
}

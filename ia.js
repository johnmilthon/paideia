// Paideia · IA local en el navegador (WebLLM + WebGPU). Ningún texto sale del equipo:
// solo se descargan los archivos del modelo la primera vez (Hugging Face y GitHub).

export const MODELS = {
  ligero: {
    base: 'Qwen3-1.7B', name: 'Qwen3 1.7B', tag: 'Más rápido', download: '≈ 1 GB', downloadMB: 1000,
    vram: { f16: 2037, f32: 2635 }, ram: '8 GB de RAM o más', license: 'Apache 2.0 (uso gratuito, incluso comercial)',
    note: 'Liviano: funciona en la mayoría de computadoras con Windows 10/11. En las pruebas respondió en 15–30 s, pero llegó a invertir el sentido de una negación; Paideia avisa cuando lo detecta. Revisa siempre la fuente.'
  },
  calidad: {
    base: 'Qwen3-4B', name: 'Qwen3 4B', tag: 'Más preciso', download: '≈ 2,3 GB', downloadMB: 2300,
    vram: { f16: 3432, f32: 4328 }, ram: '16 GB de RAM o tarjeta gráfica con 4 GB o más', license: 'Apache 2.0 (uso gratuito, incluso comercial)',
    note: 'Recomendado si tu equipo tiene 16 GB de RAM o más. En las pruebas acertó en todas las preguntas, pero tardó 40–70 s por respuesta con gráficos integrados.'
  }
};

export const modelId = (key, f16) => MODELS[key].base + (f16 ? '-q4f16_1-MLC' : '-q4f32_1-MLC');

let lib = null, engine = null, loadedId = null, worker = null, supportCache = null;
// Modo escritorio: Paideia Escritorio sirve la app desde llama-server (llama.cpp) en 127.0.0.1,
// que ejecuta el modelo de forma nativa en Windows (procesador o gráficos integrados) sin navegador WebGPU.
let server = null, abortCtl = null;
export async function detectServer() {
  if (server) return server;
  if (!/^(127\.0\.0\.1|localhost)$/.test(location.hostname)) return null;
  try {
    const r = await fetch('./v1/models', { signal: AbortSignal.timeout(3000) });
    if (!r.ok) return null;
    const j = await r.json();
    const id = j.data?.[0]?.id || j.models?.[0]?.name || 'modelo local';
    server = { id: String(id).split(/[\\/]/).pop().replace(/\.gguf$/i, '') };
    return server;
  } catch { return null; }
}
export const serverInfo = () => server;
const getLib = async () => (lib ||= await import('./vendor/web-llm.js'));

// Comprueba navegador, WebGPU, memoria y almacenamiento ANTES de descargar.
export async function checkSupport(force = false) {
  if (supportCache && !force) return supportCache;
  const r = { ok: false, f16: false, gpu: '', problems: [], warnings: [], quotaMB: null, freeMB: null };
  if (!window.isSecureContext) r.problems.push('La página debe abrirse con https:// (GitHub Pages lo cumple).');
  if (!('gpu' in navigator)) r.problems.push('Este navegador no ofrece WebGPU. Usa Google Chrome o Microsoft Edge actualizados (versión 113 o superior); Firefox 141+ en Windows también puede funcionar.');
  if (typeof Worker === 'undefined') r.problems.push('El navegador no admite procesos en segundo plano (Web Workers).');
  if (!r.problems.length) {
    try {
      const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
      if (!adapter) r.problems.push('WebGPU está desactivado o la tarjeta gráfica no está disponible para el navegador. Revisa que la aceleración por hardware esté activada (Configuración › Sistema) y que los controladores de video estén actualizados.');
      else {
        r.f16 = adapter.features.has('shader-f16');
        const info = adapter.info || {};
        r.gpu = [info.vendor, info.architecture, info.description].filter(Boolean).join(' ') || 'tarjeta gráfica compatible';
        r.maxBufferMB = Math.round((adapter.limits?.maxBufferSize || 0) / 1048576);
        if (adapter.isFallbackAdapter || /swiftshader|basic render|microsoft basic/i.test(r.gpu)) r.warnings.push('El navegador usa un adaptador gráfico por software: la IA sería extremadamente lenta. Actualiza los controladores de video.');
      }
    } catch (e) { r.problems.push('No se pudo consultar la tarjeta gráfica: ' + e.message); }
  }
  if (navigator.deviceMemory && navigator.deviceMemory < 8) r.warnings.push(`El navegador informa ${navigator.deviceMemory} GB de memoria o menos; cierra otras pestañas y usa el modelo recomendado.`);
  try {
    const est = await navigator.storage?.estimate?.();
    if (est?.quota) { r.quotaMB = Math.round(est.quota / 1048576); r.freeMB = Math.round((est.quota - (est.usage || 0)) / 1048576); }
  } catch {}
  r.ok = !r.problems.length;
  return (supportCache = r);
}

export async function isCached(key, f16) {
  try { const l = await getLib(); return await l.hasModelInCache(modelId(key, f16)); } catch { return false; }
}

export function status() { return server ? { loaded: true, id: server.id, desktop: true } : { loaded: !!engine, id: loadedId }; }

// Descarga (si hace falta) y carga el modelo. onProgress recibe {progress: 0..1, text}.
export async function load(key, f16, onProgress) {
  const id = modelId(key, f16);
  if (engine && loadedId === id) return engine;
  await unload();
  const l = await getLib();
  try { await navigator.storage?.persist?.(); } catch {}
  worker = new Worker(new URL('./ia-worker.js', import.meta.url), { type: 'module' });
  try {
    engine = await l.CreateWebWorkerMLCEngine(worker, id, { initProgressCallback: p => onProgress?.(p) });
    loadedId = id;
    return engine;
  } catch (e) { await unload(); throw friendlyError(e); }
}

export async function unload() {
  try { await engine?.unload?.(); } catch {}
  try { worker?.terminate(); } catch {}
  engine = null; loadedId = null; worker = null;
}

export async function removeFromDevice(key, f16) {
  const l = await getLib();
  if (loadedId === modelId(key, f16)) await unload();
  await l.deleteModelAllInfoInCache(modelId(key, f16));
}

export function friendlyError(e) {
  const m = String(e?.message || e);
  let msg = m;
  if (/fetch|network|Failed to fetch|NetworkError|Cannot fetch/i.test(m)) msg = navigator.onLine ? 'No se pudieron descargar los archivos del modelo. Revisa tu conexión o inténtalo más tarde; la descarga continuará desde donde quedó.' : 'Sin conexión y el modelo no está completo en este navegador. Conéctate a internet para terminar la descarga.';
  else if (/shader-f16|f16/i.test(m)) msg = 'Tu tarjeta gráfica no admite el formato f16. Paideia usará el formato compatible (f32); vuelve a intentarlo.';
  else if (/QuotaExceeded|quota|storage/i.test(m)) msg = 'No hay espacio suficiente para guardar el modelo en el navegador. Libera espacio en disco o elige el modelo recomendado.';
  else if (/out of memory|OOM|device was lost|Device lost|buffer/i.test(m)) msg = 'La tarjeta gráfica se quedó sin memoria. Cierra otras pestañas o programas, o usa el modelo recomendado.';
  else if (/WebGPU|adapter/i.test(m)) msg = 'WebGPU no está disponible en este navegador o equipo.';
  const err = new Error(msg); err.detail = m; return err;
}

// Genera texto en streaming. Devuelve el texto completo (sin bloques de «pensamiento»).
export async function generate(messages, { onToken, maxTokens = 700, temperature = 0.2 } = {}) {
  if (server) return generateServer(messages, { onToken, maxTokens, temperature });
  if (!engine) throw new Error('La IA no está cargada.');
  const stream = await engine.chat.completions.create({
    messages, stream: true, temperature, top_p: 0.9, max_tokens: maxTokens,
    extra_body: { enable_thinking: false }
  });
  let text = '';
  for await (const chunk of stream) {
    text += chunk.choices?.[0]?.delta?.content || '';
    onToken?.(clean(text));
  }
  return clean(text);
}

async function generateServer(messages, { onToken, maxTokens, temperature }) {
  abortCtl = new AbortController();
  const r = await fetch('./v1/chat/completions', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: abortCtl.signal,
    body: JSON.stringify({ messages, stream: true, temperature, top_p: 0.9, max_tokens: maxTokens, cache_prompt: true, chat_template_kwargs: { enable_thinking: false } })
  });
  if (!r.ok || !r.body) throw new Error('El motor de IA de escritorio no respondió (' + r.status + '). Cierra y vuelve a abrir Paideia.');
  const reader = r.body.getReader(), dec = new TextDecoder();
  let buf = '', text = '';
  try {
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (!line.startsWith('data:')) continue;
        const d = line.slice(5).trim(); if (d === '[DONE]') continue;
        try { text += JSON.parse(d).choices?.[0]?.delta?.content || ''; onToken?.(clean(text)); } catch {}
      }
    }
  } catch (e) { if (e.name !== 'AbortError') throw e; }
  return clean(text);
}

export function stop() { try { abortCtl?.abort(); } catch {} try { engine?.interruptGenerate(); } catch {} }

const clean = t => t.replace(/<think>[\s\S]*?(<\/think>|$)/g, '').replace(/^\s+/, '');

// Permite a las pruebas automatizadas sustituir el motor sin descargar modelos.
export function __setTestEngine(e, id = 'prueba') { engine = e; loadedId = id; }

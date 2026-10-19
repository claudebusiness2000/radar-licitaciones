// Radar gratis por NIT: la misma lógica de product/radar.py, en el navegador y contra la API pública de datos.gov.co.
// Solo lee datos abiertos (CC BY-SA 4.0). No guarda nada fuera de sessionStorage del propio visitante.
"use strict";

const API = "https://www.datos.gov.co/resource/";
const CONTRATOS = API + "jbjy-vk9h.json";
const PROCESOS = API + "p6dx-8zbt.json";
const GENERICAS = new Set(CFG.GENERICAS);
const MARCAS = new RegExp(CFG.MARCAS_EMPRESA, "i");
const MESES = "enero febrero marzo abril mayo junio julio agosto septiembre octubre noviembre diciembre".split(" ");

const hoyLocal = new Date();
const iso = d => d.toLocaleDateString("en-CA");
const HOY = iso(hoyLocal);
const menosDias = n => iso(new Date(hoyLocal.getTime() - n * 86400000));
const D365 = menosDias(365), D730 = menosDias(730);
const SUPERFICIE = new Map();

// ---------------------------------------------------------------- texto (idéntico a radar.py)
function norm(s) {
  return (s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^\x00-\x7F]/g, "");
}
function raiz(w) {
  if (w.length > 4 && w.endsWith("s")) w = w.slice(0, -1);
  if (w.length > 5 && w.endsWith("e")) w = w.slice(0, -1);
  return w;
}
function raices(texto) {
  const out = new Set();
  for (const original of ((texto || "").toLowerCase().match(/[a-záéíóúüñ]{4,}/g) || [])) {
    const w = norm(original);
    if (GENERICAS.has(w)) continue;
    const r = raiz(w);
    if (!SUPERFICIE.has(r)) SUPERFICIE.set(r, new Map());
    const m = SUPERFICIE.get(r);
    m.set(original, (m.get(original) || 0) + 1);
    out.add(r);
  }
  return out;
}
function legible(r) {
  const m = SUPERFICIE.get(r);
  if (!m) return r;
  let mejor = r, n = -1;
  for (const [k, v] of m) if (v > n) { mejor = k; n = v; }
  return mejor;
}
const esEmpresa = n => !!n && MARCAS.test(n);
function corto(s, n) {
  s = (s || "").trim().replace(/\s+/g, " ");
  if (s.length <= n) return s;
  const cabeza = s.slice(0, n);
  const cut = cabeza.includes(" ") ? cabeza.slice(0, cabeza.lastIndexOf(" ")) : cabeza;
  return cut.replace(/[ ,;:.\-(/]+$/, "") + "…";
}
function oracion(s) {
  s = (s || "").trim().replace(/\s+/g, " ");
  return s && s.toUpperCase() === s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : s;
}
function pyRound(x) { // round() de Python: mitades al par
  const f = Math.floor(x), d = x - f;
  if (Math.abs(d - 0.5) < 1e-9) return f % 2 === 0 ? f : f + 1;
  return Math.round(x);
}
const pct = x => (x === null || x === undefined) ? "—" : pyRound(100 * x) + " %";
const cop = x => "$" + String(pyRound(x)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
function fechaLarga(s) { const [y, m, d] = s.slice(0, 10).split("-").map(Number); return d + " de " + MESES[m - 1]; }
function mediana(a) {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y), k = s.length >> 1;
  return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2;
}
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#x27;" }[c]));

// ---------------------------------------------------------------- datos
async function soda(base, params) {
  const qs = Object.entries(params).map(([k, v]) => encodeURIComponent(k) + "=" + encodeURIComponent(v)).join("&");
  let err;
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(base + "?" + qs);
      if (!r.ok) throw new Error("HTTP " + r.status);
      return await r.json();
    } catch (e) { err = e; await new Promise(ok => setTimeout(ok, 1500 * (i + 1))); }
  }
  throw err;
}
function guardar(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sin almacenamiento: seguimos */ } }
function leer(k) { try { const v = sessionStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }

async function abiertos() {
  let filas = leer("abiertos-" + HOY);
  if (!filas) {
    const wp = "estado_del_procedimiento in ('Publicado','Abierto') AND adjudicado='No' AND estado_de_apertura_del_proceso='Abierto' " +
      "AND modalidad_de_contratacion != 'Contratación directa' AND fecha_de_recepcion_de >= '" + HOY + "T00:00:00' " +
      "AND precio_base > 0 AND precio_base < " + CFG.MAX_VALOR;
    const crudas = await soda(PROCESOS, {
      "$select": "entidad,nit_entidad,departamento_entidad,ciudad_entidad,id_del_proceso,nombre_del_procedimiento," +
        "descripci_n_del_procedimiento,modalidad_de_contratacion,precio_base,fecha_de_recepcion_de,urlproceso,fecha_de_ultima_publicaci",
      "$where": wp, "$order": "fecha_de_recepcion_de,id_del_proceso", "$limit": "50000"});
    const unicos = new Map();
    for (const r of crudas) {
      const k = r.id_del_proceso;
      if (k && (!unicos.has(k) || (r.fecha_de_ultima_publicaci || "") > (unicos.get(k).fecha_de_ultima_publicaci || ""))) unicos.set(k, r);
    }
    filas = [];
    for (const r of unicos.values()) {
      const u = r.urlproceso; delete r.urlproceso;
      r.url = (u && typeof u === "object") ? (u.url || "") : (u || "");
      r.precio_base = parseFloat(r.precio_base || 0);
      r.cierre = (r.fecha_de_recepcion_de || "").slice(0, 10);
      filas.push(r);
    }
    guardar("abiertos-" + HOY, filas);
  }
  // mismo proceso con dos avisos: misma entidad, presupuesto y cierre cuentan como uno (el más reciente)
  const vistos = new Set(), unicas = [];
  for (const r of [...filas].sort((a, b) => (b.fecha_de_ultima_publicaci || "").localeCompare(a.fecha_de_ultima_publicaci || ""))) {
    const k = r.nit_entidad + "|" + r.precio_base + "|" + r.cierre;
    if (!vistos.has(k)) { vistos.add(k); unicas.push(r); }
  }
  for (const r of unicas) r.raices = raices((r.nombre_del_procedimiento || "") + " " + (r.descripci_n_del_procedimiento || ""));
  return unicas;
}
function frecuencias(ab) { const f = new Map(); for (const r of ab) for (const w of r.raices) f.set(w, (f.get(w) || 0) + 1); return f; }

async function perfil(nit) {
  const filas = await soda(CONTRATOS, {
    "$select": "proveedor_adjudicado,objeto_del_contrato,descripcion_del_proceso,nombre_entidad,departamento,valor_del_contrato,fecha_de_firma",
    "$where": "documento_proveedor='" + nit + "' AND tipodocproveedor='NIT' AND fecha_de_firma >= '" + D365 + "T00:00:00' AND " +
      CFG.COMPETITIVAS + " AND valor_del_contrato > 0 AND valor_del_contrato < " + CFG.MAX_VALOR,
    "$order": "fecha_de_firma DESC", "$limit": "600"});
  if (!filas.length) return null;
  const df = new Map(), ents = new Map(), deps = new Map();
  let total = 0;
  for (const r of filas) {
    for (const w of raices((r.objeto_del_contrato || "") + " " + (r.descripcion_del_proceso || ""))) df.set(w, (df.get(w) || 0) + 1);
    ents.set(r.nombre_entidad || "", (ents.get(r.nombre_entidad || "") || 0) + 1);
    deps.set(r.departamento || "", (deps.get(r.departamento || "") || 0) + 1);
    total += parseFloat(r.valor_del_contrato);
  }
  const orden = m => [...m.entries()].sort((a, b) => b[1] - a[1]);
  return {nit, nombre: filas[0].proveedor_adjudicado || "", n: filas.length, total, df, nDocs: filas.length,
    entidades: orden(ents).slice(0, 3), departamentos: orden(deps).slice(0, 3).map(x => x[0]).filter(d => d && d !== "No Definido")};
}
function palabrasClave(df, nDocs, freqAb, nAb, k = 10) {
  const minimo = nDocs >= 4 ? Math.max(2, Math.ceil(0.12 * nDocs)) : 1;
  const cands = [];
  for (const [w, c] of df) {
    const dfo = freqAb.get(w) || 0;
    if (c < minimo || dfo === 0 || dfo > 0.04 * nAb) continue;
    cands.push([(c / nDocs) * Math.log((nAb + 1) / (dfo + 1)), w]);
  }
  cands.sort((a, b) => b[0] - a[0] || (b[1] > a[1] ? 1 : -1));
  return cands.slice(0, k).map(([p, w]) => [w, p]);
}
function cruzar(ab, claves, deps) {
  const pesos = new Map(claves), freq = frecuencias(ab);
  const fuertes = new Set(claves.slice(0, 1).filter(([w]) => (freq.get(w) || 0) <= 0.015 * ab.length).map(([w]) => w));
  const nucleo = new Set(claves.slice(0, 3).map(([w]) => w));
  const res = [];
  for (const r of ab) {
    const hits = [...r.raices].filter(w => pesos.has(w)).sort();
    if (!hits.length || !hits.some(w => nucleo.has(w)) || (hits.length === 1 && !fuertes.has(hits[0]))) continue;
    const s = hits.reduce((a, w) => a + pesos.get(w), 0) * (deps.includes(r.departamento_entidad) ? 1.2 : 1);
    res.push({score: s, proceso: r, hits});
  }
  res.sort((a, b) => b.score - a.score || a.proceso.cierre.localeCompare(b.proceso.cierre));
  return res.length ? res.filter(m => m.score >= CFG.UMBRAL_AFIN * res[0].score) : res;
}
function objeto(m) {
  const n = m.proceso.nombre_del_procedimiento || "";
  const rn = raices(n);
  return m.hits.some(w => rn.has(w)) ? n : (m.proceso.descripci_n_del_procedimiento || n);
}
async function entidad(nitEnt, clavesOrden) {
  const k = "ent-" + nitEnt;
  let filas = leer(k);
  if (!filas) {
    filas = await soda(PROCESOS, {
      "$select": "id_del_proceso,nombre_del_procedimiento,precio_base,valor_total_adjudicacion,proveedores_unicos_con,respuestas_al_procedimiento,nombre_del_proveedor,fecha_adjudicacion",
      "$where": "nit_entidad='" + nitEnt + "' AND adjudicado='Si' AND modalidad_de_contratacion != 'Contratación directa' AND precio_base > 0 AND precio_base < " +
        CFG.MAX_VALOR + " AND valor_total_adjudicacion > 0 AND fecha_adjudicacion >= '" + D730 + "T00:00:00'",
      "$order": "fecha_adjudicacion DESC", "$limit": "3000"});
    guardar(k, filas);
  }
  const unicos = new Map(); for (const r of filas) if (r.id_del_proceso) unicos.set(r.id_del_proceso, r);
  const ratios = [], oferentes = [], similares = [];
  const nucleo = new Set(clavesOrden.slice(0, 3)), top1 = clavesOrden[0];
  for (const r of unicos.values()) {
    const p = parseFloat(r.precio_base), v = parseFloat(r.valor_total_adjudicacion), q = v / p;
    if (q >= 0.3 && q <= 1.2) ratios.push(q);
    const o = Math.trunc(parseFloat(r.proveedores_unicos_con || r.respuestas_al_procedimiento || 0));
    if (o > 0) oferentes.push(o);
    const comunes = [...raices(r.nombre_del_procedimiento || "")].filter(w => nucleo.has(w));
    if ((comunes.length >= 2 || (top1 && comunes.includes(top1))) && q >= 0.3 && q <= 1.2) similares.push(r);
  }
  similares.sort((a, b) => (b.fecha_adjudicacion || "").localeCompare(a.fecha_adjudicacion || ""));
  return {n: unicos.size, ratio: mediana(ratios), nRatio: ratios.length, oferentes: mediana(oferentes), nOferentes: oferentes.length,
    unaOferta: oferentes.length ? oferentes.filter(o => o === 1).length / oferentes.length : null,
    similares: similares.slice(0, 3).map(r => ({nombre: oracion(corto(r.nombre_del_procedimiento || "", 110)),
      ganador: esEmpresa(r.nombre_del_proveedor || "") ? r.nombre_del_proveedor : "una persona natural",
      ratio: parseFloat(r.valor_total_adjudicacion) / parseFloat(r.precio_base), fecha: (r.fecha_adjudicacion || "").slice(0, 10)}))};
}
function textoEntidad(e) {
  if (!e || e.n < 3) return "Sin historial suficiente de esta entidad en 24 meses.";
  const partes = [];
  if (e.oferentes !== null && e.nOferentes >= 3) {
    const of = e.oferentes.toFixed(1).replace(".0", "").replace(".", ",");
    partes.push(of + " oferente" + (e.oferentes === 1 ? "" : "s") + " por proceso (mediana)");
    partes.push(pct(e.unaOferta) + " de sus procesos tuvo un solo oferente");
  }
  if (e.ratio !== null && e.nRatio >= 3) partes.push("valor adjudicado típico: " + pct(e.ratio) + " del presupuesto");
  let base = partes.length ? "En 24 meses adjudicó " + e.n + " procesos competitivos: " + partes.join("; ") + "." :
    "En 24 meses adjudicó " + e.n + " procesos competitivos.";
  for (const s of e.similares.slice(0, 2))
    base += " Similar: «" + s.nombre + "», ganado por " + s.ganador + " al " + pct(s.ratio) + " del presupuesto (" + s.fecha + ").";
  return base;
}

// ---------------------------------------------------------------- interfaz
const $ = id => document.getElementById(id);
function limpiarNit(t) {
  const base = (t || "").split("-")[0].replace(/\D/g, "");
  return base.length === 10 && "89".includes(base[0]) ? base.slice(0, 9) : base;
}
const nitJuridico = n => /^[89]\d{8}$/.test(n);
function estado(msg) { $("estado").textContent = msg; $("estado").hidden = !msg; }
function cta(nit) {
  const asunto = encodeURIComponent("Quiero el Radar de Licitaciones cada lunes");
  const cuerpo = encodeURIComponent("Hola, quiero las 2 semanas gratis del Radar de Licitaciones. NIT de mi empresa: " + (nit || ""));
  return '<div class="cta"><p><b>¿Le sirve?</b> Cada lunes le enviamos todos los procesos que encajan con su empresa, con este análisis de cada entidad. ' +
    "Las dos primeras semanas son gratis y sin tarjeta; después cuesta " + CFG.PRECIO_USD + " USD al mes (unos " + CFG.PRECIO_COP_APROX +
    ' pesos, más el IVA que aplique), sin permanencia.</p><div class="acciones">' +
    '<a class="btn btn-primario" href="mailto:claudebusiness2000@gmail.com?subject=' + asunto + "&amp;body=" + cuerpo + '">Recibir esto cada lunes: 2 semanas gratis</a>' +
    '<a class="btn btn-secundario" href="' + CFG.CHECKOUT + '" rel="noopener">Suscribirme: ' + CFG.PRECIO_USD + " USD al mes</a></div></div>";
}
async function correr(nit) {
  $("resultado").innerHTML = "";
  if (!nitJuridico(nit)) {
    $("resultado").innerHTML = '<p class="aviso-error">El radar gratis funciona con el NIT de una empresa: 9 dígitos que empiezan por 8 o 9, sin dígito de verificación.</p>';
    return;
  }
  history.replaceState(null, "", "?nit=" + nit);
  try {
    estado("1/3 · Leyendo los contratos que su empresa ganó en SECOP II…");
    const [perf, ab] = await Promise.all([perfil(nit), (estado("1/3 · Leyendo contratos y procesos abiertos de hoy…"), abiertos())]);
    if (!perf) { estado(""); $("resultado").innerHTML = '<p class="aviso-error">No encontramos contratos de procesos competitivos de este NIT en los últimos 12 meses en SECOP II, así que no podemos calcular qué procesos encajan con su empresa. Si quiere, escríbanos y armamos su radar a partir de lo que vende.</p>' + cta(nit); return; }
    estado("2/3 · Cruzando su perfil con " + ab.length + " procesos abiertos hoy…");
    const claves = palabrasClave(perf.df, perf.nDocs, frecuencias(ab), ab.length);
    const matches = claves.length ? cruzar(ab, claves, perf.departamentos) : [];
    const items = matches.slice(0, 15), orden = claves.map(([w]) => w), intel = new Map();
    let i = 0;
    for (const m of items.slice(0, 10)) {
      const ne = m.proceso.nit_entidad;
      if (ne && !intel.has(ne)) { estado("3/3 · Analizando cómo adjudica cada entidad (" + (++i) + ")…"); intel.set(ne, await entidad(ne, orden)); }
    }
    estado("");
    pintar(perf, claves, matches, items, intel);
  } catch (e) {
    estado("");
    $("resultado").innerHTML = '<p class="aviso-error">No pudimos consultar los datos abiertos de datos.gov.co en este momento (' + esc(e.message) + "). Intente de nuevo en unos minutos.</p>";
  }
}
function pintar(perf, claves, matches, items, intel) {
  const ents = perf.entidades.filter(([n]) => n).map(([n, c]) => esc(n) + " (" + c + ")").join("; ");
  let h = '<div class="resumen"><p>En los últimos 12 meses, <b>' + esc(perf.nombre) + "</b> ganó <b>" + perf.n + " contratos</b> por procesos competitivos en SECOP II, por " +
    esc(cop(perf.total)) + " en total. Entidades con más contratos: " + ents + ".</p>" +
    (claves.length ? "<p>Palabras que definen su perfil: " + esc(claves.map(([w]) => legible(w)).join(", ")) + ".</p>" : "") + "</div>";
  if (!items.length) {
    h += '<p class="aviso-error">Hoy no encontramos procesos abiertos que encajen con claridad con su perfil. Los procesos cambian cada día: vuelva mañana o pida el radar semanal.</p>';
  } else {
    h += "<h2>Procesos abiertos que encajan (" + matches.length + " hoy; aquí los " + items.length + " más afines)</h2>";
    items.forEach((m, k) => {
      const p = m.proceso, e = intel.get(p.nit_entidad);
      h += '<div class="op"><h3>' + (k + 1) + ". " + esc(oracion(corto(objeto(m), 220))) + '</h3><p class="meta"><b>' + esc(p.entidad) + "</b> · " +
        esc(p.ciudad_entidad) + ", " + esc(p.departamento_entidad) + '</p><p class="meta">Presupuesto: <b>' + esc(cop(p.precio_base)) +
        "</b> · Recibe ofertas hasta el <b>" + esc(fechaLarga(p.cierre)) + "</b> · " + esc(p.modalidad_de_contratacion) + "</p>" +
        (e ? '<p class="intel">' + esc(textoEntidad(e)) + "</p>" : "") +
        '<p class="meta">Coincide por: ' + esc(m.hits.map(legible).join(", ")) + ' · <a href="' + esc(p.url) + '" rel="noopener">Ver el proceso en SECOP II</a></p></div>';
    });
  }
  $("resultado").innerHTML = h + cta(perf.nit);
}
document.addEventListener("DOMContentLoaded", () => {
  $("form").addEventListener("submit", ev => { ev.preventDefault(); correr(limpiarNit($("nit").value)); });
  const q = new URLSearchParams(location.search).get("nit");
  if (q) { $("nit").value = q; correr(limpiarNit(q)); }
});

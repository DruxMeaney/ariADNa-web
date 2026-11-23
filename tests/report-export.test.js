/*!
 * ariADNa — pruebas del reporte exportado con figuras
 *
 * El reporte base (sin `extras.figures`) lo fija la referencia congelada en engine.test.js.
 * Aquí se prueba la versión que exporta la app: la misma lectura que la pantalla, con sus
 * figuras, en un documento que se abre solo y no puede cargar ni ejecutar nada.
 *
 *   node --test
 */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const E = require("../js/engine.js");
const R = require("../js/report.js");

// charts.js es un script de navegador: se carga sobre un `self` global, como en engine.test.js.
global.self = global;
global.AriadnaEngine = E;
require("../js/charts.js");
const C = global.AriadnaCharts;

const FIXTURES = path.join(__dirname, "fixtures");
const fixture = (name) => fs.readFileSync(path.join(FIXTURES, name), "utf8");

const META_ANON = { case_id: "Omitido", child_id: "Omitido", parent_id: "Omitido", report_mode: "anonimizado; omite identificadores, conserva genotipos" };
const META_IDENT = { case_id: "CASO-XYZ-77", child_id: "H-XYZ-77", parent_id: "PA-XYZ-77", report_mode: "con identificadores capturados" };
const LIMITS = ["<strong>Es un triaje preliminar.</strong> Orienta y prioriza.", "<strong>Es un análisis de dúo.</strong> No modela mutaciones."];

function fromCsv(name, assay) {
  return E.analyzeMarkers(assay, E.canonicalizeRows(E.readCsvRows(fixture(name)), assay), 0.5);
}

function fromVcf(name) {
  const text = fixture(name);
  const samples = E.readVcfSampleNames(text);
  return E.analyzeMarkers("snp_panel", E.canonicalizeRows(E.readVcfSnpRows(text, samples[0], samples[1]), "snp_panel"), 0.5);
}

// Los mismos añadidos que arma la app al exportar (app.js › reportExtras).
function extrasFor(result) {
  return {
    cap_posterior: true,
    verdict: E.bannerMeta(result),
    conclusion: result.conclusion,
    insights: E.triageInsights(result),
    limits: LIMITS,
    figures: C.reportFigures(result),
  };
}

const exported = (result, metadata) => R.buildHtmlReport(result, metadata || META_ANON, extrasFor(result));
const count = (text, needle) => text.split(needle).length - 1;
const str = (marker, c1, c2, p1, p2, pi) => ({ marker, child_a1: c1, child_a2: c2, parent_a1: p1, parent_a2: p2, pi: pi || "", note: "", validation_warning: "" });

const CASES = {
  "STR capilar compatible": () => fromCsv("ejemplos/str_ce_compatible.csv", "str_ce"),
  "STR capilar con incongruencias": () => fromCsv("ejemplos/str_ce_no_compatible.csv", "str_ce"),
  "GlobalFiler compatible": () => fromCsv("simulacion/compatible/1_str_ce_globalfiler_compatible.csv", "str_ce"),
  "GlobalFiler exclusión": () => fromCsv("simulacion/exclusion/1_str_ce_globalfiler_exclusion.csv", "str_ce"),
  "STR por secuenciación": () => fromCsv("ejemplos/str_mps_compatible.csv", "str_mps"),
  "panel SNP": () => fromCsv("ejemplos/snp_panel_compatible.csv", "snp_panel"),
  "panel SNP desde VCF": () => fromVcf("ejemplos/snp_panel_no_compatible.vcf"),
  microhaplotipos: () => fromCsv("ejemplos/microhap_compatible.csv", "microhap"),
};

test("exportado · las figuras son opcionales y no alteran la plantilla base", () => {
  const r = CASES["STR capilar compatible"]();
  const base = R.buildHtmlReport(r, META_ANON);
  const extras = extrasFor(r);
  const withoutFigures = Object.assign({}, extras, { figures: undefined });
  assert.equal(R.buildHtmlReport(r, META_ANON, undefined), base);
  assert.ok(R.buildHtmlReport(r, META_ANON, withoutFigures).includes('class="banner '), "sin figuras se conserva la plantilla base");
  assert.ok(!R.buildHtmlReport(r, META_ANON, withoutFigures).includes('<svg class="sup"'));
  const html = R.buildHtmlReport(r, META_ANON, extras);
  assert.ok(html.includes('<svg class="sup"') && !html.includes('class="banner '), "con figuras se usa la plantilla nueva");
});

test("exportado · lleva la misma lectura y las mismas cifras que la pantalla", () => {
  const r = CASES["STR capilar compatible"]();
  const html = exported(r);
  const top = C.headline(r);
  const sup = C.support(r);
  assert.equal(top.posterior, C.formatPosterior(sup.posterior, 2));
  assert.ok(html.includes("<span>Patrón compatible</span>"), "titular sin el prefijo «Triaje:»");
  assert.ok(html.includes('<span class="num">' + top.posterior + "</span>"));
  assert.ok(html.includes('<span class="level level-' + top.level.key + '">' + top.level.label + "</span>"));
  assert.ok(html.includes('<span class="num">' + top.cpi + "</span>") && html.includes(top.cpiNote));
  assert.ok(html.includes(r.compatible_markers + '<span class="of"> / ' + r.total_markers + "</span>"));
  // las frases que explican la figura son las de la pantalla
  const sen = C.supportSentences(r);
  for (const text of [sen.distance, sen.composition, sen.prior]) assert.ok(html.includes(E.escapeHtml(text)), text);
  // y se conservan las cifras exactas del resumen de texto
  assert.ok(html.includes("Cifras exactas") && html.includes(E.pyFormatG(r.cpi, 6)));
  assert.ok(html.includes("Lectura de triaje · preliminar") && html.includes("No sustituye el dictamen"));
});

test("exportado · incluye la figura de soporte, la franja de la previa y un esquema por marcador", () => {
  for (const [name, build] of Object.entries(CASES)) {
    const r = build();
    const html = exported(r);
    const hasSupport = C.support(r) !== null;
    assert.equal(count(html, '<svg class="sup"'), hasSupport ? 2 : 0, `${name}: figura de soporte (ancha y angosta)`);
    assert.equal(count(html, '<svg class="ag '), r.markers.length, `${name}: un esquema de alelos por marcador`);
    const used = r.markers.filter((m) => C.isUsed(m)).length;
    assert.equal(count(html, '<svg class="pi-bar"'), used, `${name}: una barra por índice usado en el CPI`);
    assert.equal(count(html, '<svg class="pi-axis"'), used ? 1 : 0, `${name}: eje de las barras`);
    assert.equal(count(html, '<tr class="mk mk-'), r.markers.length, `${name}: una fila por marcador`);
    for (const m of r.markers) assert.ok(html.includes('<span class="mk-name">' + E.escapeHtml(m.marker) + "</span>"), `${name}: ${m.marker}`);
  }
});

test("exportado · sin CPI no hay figura de soporte y se explica por qué", () => {
  const r = CASES["STR capilar con incongruencias"]();
  const html = exported(r);
  assert.equal(r.cpi, null);
  assert.ok(!html.includes("Soporte estadístico"));
  assert.ok(html.includes(E.escapeHtml(C.blockedReason(r))), "el motivo aparece bajo la probabilidad posterior");
  assert.ok(html.includes('<span class="num is-empty">—</span>'));
  // lo que hay que revisar va primero, como en la pantalla
  const review = r.markers.filter((m) => ["bad", "warn"].includes(E.statusClass(m))).length;
  assert.ok(html.includes("Para revisar (" + review + ")") && html.includes("Resto (" + (r.markers.length - review) + ")"));
  assert.ok(html.indexOf("Para revisar (") < html.indexOf('<tr class="mk mk-bad') && html.indexOf('<tr class="mk mk-bad') < html.indexOf("Resto ("));
  assert.ok(html.includes('<tr class="mk-noterow">'), "las notas de cada incongruencia van bajo su fila");
});

test("exportado · resalta el alelo compartido y dice cuándo un índice no se usó", () => {
  const r = E.analyzeMarkers("str_ce", [str("D8S1179", "12", "13", "13", "14", "2.5"), str("TH01", "6", "9.3", "7", "9", "1.8")], 0.5);
  const html = exported(r);
  assert.ok(html.includes('<td class="mk-al mk-child">12, <b>13</b></td>') && html.includes('<td class="mk-al mk-parent"><b>13</b>, 14</td>'));
  assert.ok(html.includes('<td class="mk-al mk-child">6, 9.3</td>'), "sin alelo compartido no se resalta nada");
  assert.ok(html.includes('1.8<span class="pi-unused">no usado</span>'), "el PI de un marcador incongruente se muestra, pero se marca como no usado");
});

test("exportado · es un documento autónomo: sin scripts, sin recursos externos y con su propia política", () => {
  for (const [name, build] of Object.entries(CASES)) {
    const html = exported(build(), META_IDENT);
    assert.match(html, /^<!doctype html>\n<html lang="es">/, name);
    assert.ok(html.includes(`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">`), name);
    assert.ok(!/<script\b/i.test(html), `${name}: sin scripts`);
    assert.ok(!/\son[a-z]+\s*=/i.test(html.replace(/>[^<]*</g, "><")), `${name}: sin manejadores de eventos`);
    assert.ok(!/\s(?:src|href|action|srcset|data)\s*=/i.test(html.replace(/>[^<]*</g, "><")), `${name}: sin enlaces ni recursos`);
    assert.ok(!/@import|url\(/i.test(html), `${name}: los estilos no cargan nada`);
    assert.ok(!/\sstyle\s*=/i.test(html.replace(/>[^<]*</g, "><")), `${name}: sin estilos en línea (todo va por clases)`);
    assert.equal(count(html, "<style>"), 1, name);
  }
});

test("exportado · sólo aparecen los identificadores que se le pasan", () => {
  const r = CASES["GlobalFiler compatible"]();
  const anonymous = exported(r, META_ANON);
  const identified = exported(r, META_IDENT);
  for (const id of [META_IDENT.case_id, META_IDENT.child_id, META_IDENT.parent_id]) {
    assert.ok(!anonymous.includes(id), `el reporte anónimo no contiene ${id}`);
    assert.ok(identified.includes(id), `el reporte con identificadores contiene ${id}`);
  }
  assert.ok(anonymous.includes("<title>Reporte ariADNa · Omitido</title>") && anonymous.includes("anonimizado; omite identificadores"));
  // las figuras salen sólo del resultado: el mismo caso da las mismas figuras con o sin identificadores
  const figuresOf = (html) => html.match(/<svg[\s\S]*?<\/svg>/g).join("");
  assert.equal(figuresOf(anonymous), figuresOf(identified));
  assert.equal(C.reportFigures.length, 1, "reportFigures sólo recibe el resultado");
});

test("exportado · escapa los datos importados, también dentro de las figuras", () => {
  const evil = '<img src=x onerror=alert(1)>';
  const r = E.analyzeMarkers("str_ce", [str(evil, "12", "13", "13", "14", "2.5"), str("D1", '"><script>alert(2)</script>', "8", "9", "8", "3")], 0.5);
  const html = R.buildHtmlReport(r, { case_id: evil, child_id: "<b>x</b>", parent_id: '"q"', report_mode: "<i>modo</i>" }, extrasFor(r));
  assert.ok(!html.includes("<img") && !html.includes("<script") && !html.includes("<b>x</b>") && !html.includes("<i>modo</i>"));
  // (el motor parte los alelos en «/», así que el segundo llega en dos trozos)
  assert.ok(html.includes("&lt;img src=x onerror=alert(1)&gt;") && html.includes("&lt;script&gt;alert(2)&lt;"));
  assert.ok(html.includes("&lt;b&gt;x&lt;/b&gt;") && html.includes("&lt;i&gt;modo&lt;/i&gt;"));
  const figures = JSON.stringify(C.reportFigures(r));
  assert.ok(!figures.includes("<img") && !figures.includes("<script"), "charts.js escapa nombres y alelos en las figuras");
});

test("exportado · figuras ausentes o que no son SVG no rompen el documento ni se incrustan", () => {
  const r = CASES["STR capilar compatible"]();
  const base = extrasFor(r);
  const empty = R.buildHtmlReport(r, META_ANON, Object.assign({}, base, { figures: {} }));
  assert.ok(empty.includes('<table class="mk-table">') && !empty.includes("<svg class=\"sup\"") && !empty.includes('<col class="c-glyph">'));
  assert.equal(count(empty, '<tr class="mk mk-'), r.markers.length);
  assert.ok(!empty.includes("No calculada") && empty.includes("Cifras exactas"), "sin cabecera calculada se usan las cifras exactas del motor");
  const hostile = R.buildHtmlReport(r, META_ANON, Object.assign({}, base, {
    figures: { support: "<script>alert(1)</script>", prior: 42, glyphs: ["<img src=x>", null, "texto"], bars: "no es una lista", piAxis: "<p>eje</p>" },
  }));
  assert.ok(!hostile.includes("<script") && !hostile.includes("<img") && !hostile.includes("<p>eje</p>") && !hostile.includes(">texto<"));
  assert.equal(count(hostile, '<tr class="mk mk-'), r.markers.length);
});

test("exportado · en paneles grandes el esquema se dibuja sólo donde hay algo que revisar", () => {
  const rows = [];
  for (let i = 0; i < 420; i++) rows.push({ marker: "rs" + (1000 + i), child_genotype: "A/G", parent_genotype: i === 7 || i === 300 ? "C/C" : "G/G", pi: "", note: "", validation_warning: "" });
  const r = E.analyzeMarkers("snp_panel", rows, 0.5);
  const figures = C.reportFigures(r);
  assert.equal(figures.glyphsPartial, true);
  assert.equal(figures.glyphs.filter(Boolean).length, 2);
  const html = exported(r);
  assert.equal(count(html, '<tr class="mk mk-'), 420, "todas las filas siguen en el documento");
  assert.equal(count(html, '<svg class="ag '), 2);
  assert.ok(html.includes("sólo se dibuja en los marcadores por revisar"));
  assert.ok(html.length < 400000, `tamaño razonable (${html.length} caracteres)`);
});

test("exportado · cada clase que usan las figuras tiene estilo en el documento", () => {
  // clases que sólo sirven de ancla en la app (sin regla propia en css/styles.css)
  const HOOKS = new Set(["cs", "pk", "ag-ok", "ag-bad", "ag-warn", "ag-skip"]);
  const classes = new Set();
  let style = "";
  for (const build of Object.values(CASES)) {
    const html = exported(build());
    style = /<style>([\s\S]*?)<\/style>/.exec(html)[1];
    for (const svg of html.match(/<svg[\s\S]*?<\/svg>/g)) {
      for (const m of svg.matchAll(/class="([^"]+)"/g)) m[1].split(/\s+/).forEach((name) => classes.add(name));
    }
  }
  assert.ok(classes.size > 25, "se recorrieron las figuras");
  for (const name of classes) {
    if (HOOKS.has(name)) continue;
    assert.ok(new RegExp("\\." + name.replace(/[-]/g, "\\-") + "(?![\\w-])").test(style), `la clase «${name}» no tiene estilo en el reporte exportado`);
  }
});

test("exportado · usa los colores del tema claro de la app", () => {
  const css = fs.readFileSync(path.join(__dirname, "..", "css", "styles.css"), "utf8");
  const tokens = (block) => Object.fromEntries([...block.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim().toLowerCase()]));
  const app = tokens(/:root\s*\{([\s\S]*?)\n\}/.exec(css)[1]);
  const html = exported(CASES["STR capilar compatible"]());
  const report = tokens(/:root\s*\{([\s\S]*?)\}/.exec(/<style>([\s\S]*?)<\/style>/.exec(html)[1])[1]);
  const colors = Object.keys(report).filter((name) => !name.startsWith("--font-"));
  assert.ok(colors.length >= 25);
  for (const name of colors) assert.equal(report[name], app[name], `${name} difiere del tema claro de la app`);
});

test("exportado · HTML bien formado, con versión para pantallas angostas y para imprimir", () => {
  for (const [name, build] of Object.entries(CASES)) {
    const html = exported(build());
    for (const tag of ["html", "head", "body", "main", "header", "footer", "section", "div", "table", "thead", "tbody", "colgroup", "tr", "th", "td", "ul", "li", "dl", "dt", "dd", "p", "h1", "h2", "span", "b", "strong", "svg", "text", "title", "style"]) {
      assert.equal(count(html, "<" + tag + ">") + count(html, "<" + tag + " "), count(html, "</" + tag + ">"), `${name}: <${tag}> abre y cierra las mismas veces`);
    }
    const style = /<style>([\s\S]*?)<\/style>/.exec(html)[1];
    assert.equal(count(style, "{"), count(style, "}"), `${name}: llaves del CSS equilibradas`);
    assert.ok(style.includes("@media print") && style.includes("@page") && style.includes("@media (max-width: 640px)"), name);
    if (C.support(build()) !== null) assert.ok(html.includes('class="fig fig-wide"') && html.includes('class="fig fig-narrow"'), name);
  }
});

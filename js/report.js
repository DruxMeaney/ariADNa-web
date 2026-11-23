/*!
 * ariADNa — reporte HTML y resumen de texto
 *
 * El HTML generado se verifica byte a byte contra la referencia congelada
 * (tests/engine.test.js).
 */
(function (root, factory) {
  "use strict";
  var engine =
    typeof module === "object" && module.exports ? require("./engine.js") : root.AriadnaEngine;
  var api = factory(engine);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.AriadnaReport = api;
  }
})(typeof self !== "undefined" ? self : this, function (E) {
  "use strict";

  var REPORT_COLORS = {
    primary: "#102033",
    primary_dark: "#081522",
    accent: "#39FF14",
    surface: "#FFFFFF",
    surface_alt: "#FFFFFF",
    border: "#C9FFD4",
    text: "#14213A",
    text_muted: "#5A6B87",
    ok: "#0A6B4A",
    ok_bg: "#FFFFFF",
    ok_border: "#A7FFB8",
    warn: "#8A5A00",
    warn_bg: "#FFFFFF",
    warn_border: "#ECD08A",
    bad: "#B5402F",
    bad_bg: "#FFFFFF",
    bad_border: "#E6B3AE",
    skip: "#6B7280",
    skip_bg: "#FFFFFF",
    skip_border: "#D7DEE8",
  };

  function esc(value) {
    if (value === null || value === undefined) return E.escapeHtml("");
    return E.escapeHtml(typeof value === "number" ? E.pyRepr(value) : String(value));
  }

  function meta(metadata, key) {
    var v = metadata[key];
    return v === undefined ? "" : v;
  }

  /* ---------------------------------------------------------------------
   * Añadidos opcionales de la versión web (`extras`). Sin ellos, el texto y el
   * HTML son idénticos byte a byte a la referencia congelada.
   *   extras.cap_posterior  nunca imprime 100 %, "inf" ni "nan"
   *   extras.verdict        [tono, titular] ya ajustado por las observaciones
   *   extras.conclusion     conclusión ya ajustada
   *   extras.insights       [{level, title, text}] observaciones de control
   *   extras.limits         [html] alcances y límites
   * ------------------------------------------------------------------- */
  function usedLogs(result) {
    return result.markers
      .filter(function (m) { return m.pi !== null && m.pi > 0 && m.paternity_informative && m.compatible === true; })
      .map(function (m) { return Math.log10(m.pi); });
  }

  function cpiText(result, extras) {
    if (extras && extras.cap_posterior && !Number.isFinite(result.cpi)) {
      var lc = usedLogs(result).reduce(function (a, b) { return a + b; }, 0);
      return "≈ 10^" + Math.round(lc) + " (fuera del rango numérico)";
    }
    return E.pyFormatG(result.cpi, 6);
  }

  function posteriorText(result, extras) {
    var p = result.posterior_probability;
    if (extras && extras.cap_posterior) {
      if (!Number.isFinite(p)) {
        var prior = result.prior_probability_used;
        var lc = usedLogs(result).reduce(function (a, b) { return a + b; }, 0);
        p = 1 / (1 + Math.pow(10, -(lc + Math.log10(prior / (1 - prior)))));
      }
      var text = E.pyFormatF(p * 100, 6);
      if (Number.parseFloat(text) >= 100) return ">99.999999%";
      if (Number.parseFloat(text) <= 0) return "<0.000001%";
      return text + "%";
    }
    return E.pyFormatF(p * 100, 6) + "%";
  }

  function plain(html) {
    return String(html).replace(/<[^>]+>/g, "");
  }

  function resultToText(result, extras) {
    var lines = [
      "Ensayo: " + result.assay_label,
      "Marcadores capturados: " + result.captured_markers,
      "Marcadores útiles de paternidad/maternidad: " + result.total_markers,
      "Marcadores informativos: " + result.informative_markers,
      "Compatibles: " + result.compatible_markers,
      "Incongruencias/exclusiones: " + result.exclusions,
      "Datos incompletos: " + result.missing_markers,
      "No informativos excluidos: " + result.non_informative_markers,
    ];
    if (result.cpi !== null) lines.push("CPI capturado: " + cpiText(result, extras));
    if (result.posterior_probability !== null) {
      lines.push("Probabilidad previa usada: " + E.pyFormatF(result.prior_probability_used, 2));
      lines.push("Probabilidad posterior: " + posteriorText(result, extras));
    }
    lines.push("Versión del algoritmo: " + result.algorithm_version);
    lines.push("");
    lines.push("Lectura de triaje: " + (extras && extras.conclusion ? extras.conclusion : result.conclusion));
    if (result.warnings.length) {
      lines.push("");
      lines.push("Advertencias:");
      result.warnings.forEach(function (w) { lines.push("- " + w); });
    }
    if (extras && extras.insights && extras.insights.length) {
      lines.push("");
      lines.push("Observaciones de control:");
      extras.insights.forEach(function (o) { lines.push("- " + o.title + ": " + o.text); });
    }
    if (extras) {
      lines.push("");
      lines.push("Lectura preliminar: no sustituye el dictamen de un laboratorio acreditado ni la revisión pericial.");
    }
    return lines.join("\n");
  }

  /* ---------------------------------------------------------------------
   * Reporte con figuras (`extras.figures`): la misma lectura que la pantalla.
   *
   * La app genera las figuras con js/charts.js (`AriadnaCharts.reportFigures`) y aquí sólo
   * se colocan en el documento. Sin `extras.figures` se usa la plantilla base, que es la
   * que fija la referencia congelada.
   *   figures.headline        {posterior, level, cpi, cpiNote, blocked}: cifras de cabecera
   *   figures.support/prior   SVG de la figura de soporte y de la franja de la previa
   *   figures.supportNarrow/priorNarrow   las mismas, para pantallas angostas
   *   figures.sentences       {distance, composition, compositionAlert, prior}
   *   figures.glyphs[i]       SVG del esquema de alelos del marcador i ("" = no se dibuja)
   *   figures.bars[i]         SVG de la barra del PI del marcador i ("" = sin barra)
   *   figures.piAxis          SVG del eje de las barras
   *   figures.glyphsPartial   el esquema sólo se dibujó en los marcadores por revisar
   *   figures.repeatScale     en el esquema, un punto equivale a una repetición
   * ------------------------------------------------------------------- */
  var GENERIC_OK_NOTE = "Comparte al menos un alelo/haplotipo con el hijo/a.";
  var STATUS_MARK = { ok: "✓", bad: "✕", warn: "!", skip: "–" };
  var VERDICT_ICON = {
    ok: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M12 6v8"/><path d="M12 18.5v.01"/></svg>',
    bad: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17"/></svg>',
  };
  var TRI_UP = '<svg class="tri tri-child" viewBox="0 0 10 10" aria-hidden="true"><path d="M5 1l4.5 8h-9z"/></svg>';
  var TRI_DOWN = '<svg class="tri tri-parent" viewBox="0 0 10 10" aria-hidden="true"><path d="M5 9l4.5-8h-9z"/></svg>';

  // Colores del tema claro de la app (css/styles.css). Una prueba verifica que no se desfasen.
  var FIGURE_CSS = `
    :root {
      --surface: #ffffff; --ink: #0b1a2a; --text: #27374b; --muted: #566679;
      --line: #dfe5eb; --line-strong: #c2cbd5; --field-line: #7d8a97;
      --accent-bright: #39ff14; --wordmark: #16c60c;
      --match: #0b8a4c; --match-text: #0b7a43; --match-soft: #ddf5e6;
      --child: #0b1a2a; --parent: #6f8198; --skip-peak: #7f8da0;
      --ok: #0b7a43; --ok-bg: #e4f5eb; --ok-line: #a9dfbf;
      --warn: #8f5400; --warn-bg: #fbf1dc; --warn-line: #ecd08a;
      --bad: #b8392a; --skip: #5c6b80;
      --zone-limited: #e9edec; --zone-limited-text: #4a5a6c;
      --zone-moderate: #c9dccf; --zone-moderate-text: #1f4d35;
      --zone-high: #5fae82; --zone-high-text: #04301b;
      --tone-ok: #e9f7ef; --tone-warn: #fcf3e2; --tone-bad: #fcece8;
      --font-sans: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      --font-display: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      --font-mono: ui-monospace, "SF Mono", "Cascadia Mono", Menlo, Consolas, "DejaVu Sans Mono", monospace;
    }
    @page { margin: 12mm; }
    * { box-sizing: border-box; }
    html { -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
    body { margin: 0; background: #ffffff; color: var(--text); font-family: var(--font-sans); font-size: 15px; line-height: 1.5; }
    h1, h2, p, dl, dd, ul { margin: 0; }
    .sheet { max-width: 900px; margin: 0 auto; }
    .mono { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
    .muted { color: var(--muted); }
    .small { font-size: 12.5px; color: var(--muted); }
    .eyebrow { font-family: var(--font-mono); font-size: 11.5px; letter-spacing: .12em; text-transform: uppercase; color: var(--muted); }
    header.brand { position: relative; overflow: hidden; padding: 20px 32px; border-bottom: 2px solid var(--accent-bright); }
    header.brand .wordmark { font-size: 22px; font-weight: 700; letter-spacing: .3px; color: var(--ink); }
    header.brand .wordmark .adn { color: var(--wordmark); }
    header.brand .tagline { color: var(--muted); font-size: 13px; margin-top: 2px; }
    header.brand .watermark { position: absolute; right: 28px; top: 50%; width: 64px; height: 64px; margin-top: -34px; opacity: .22; }
    .body { padding: 22px 32px 34px; }
    .body > * + * { margin-top: 16px; }
    .report-head { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr); gap: 24px; padding: 24px 26px;
                   border: 1px solid var(--line); border-radius: 16px; background: var(--surface); }
    .report-head.tone-ok { background: linear-gradient(135deg, var(--tone-ok), var(--surface) 70%); }
    .report-head.tone-warn { background: linear-gradient(135deg, var(--tone-warn), var(--surface) 70%); }
    .report-head.tone-bad { background: linear-gradient(135deg, var(--tone-bad), var(--surface) 70%); }
    .verdict { display: flex; align-items: center; gap: 12px; margin-top: 10px; font-family: var(--font-display);
               font-size: 32px; line-height: 1.08; letter-spacing: -.02em; }
    .verdict-mark { width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center; flex-shrink: 0; color: #ffffff; }
    .verdict-mark svg { width: 21px; height: 21px; }
    .tone-ok .verdict { color: var(--ok); }
    .tone-ok .verdict-mark { background: var(--ok); }
    .tone-warn .verdict { color: var(--warn); }
    .tone-warn .verdict-mark { background: var(--warn); }
    .tone-bad .verdict { color: var(--bad); }
    .tone-bad .verdict-mark { background: var(--bad); }
    .conclusion { margin-top: 12px; font-size: 15.5px; }
    .disclaimer-line { margin-top: 12px; font-size: 12.5px; color: var(--muted); }
    .stats { display: grid; grid-template-columns: 1fr 1fr; gap: 16px 20px; align-content: center; }
    .stat { border-top: 1px solid var(--line-strong); padding-top: 8px; min-width: 0; }
    .stat-main { grid-column: 1 / -1; }
    .stat dt { font-family: var(--font-mono); font-size: 11px; letter-spacing: .1em; text-transform: uppercase; color: var(--muted); }
    .stat dd { margin-top: 4px; display: flex; align-items: baseline; flex-wrap: wrap; gap: 6px 10px; }
    .num { font-family: var(--font-display); font-weight: 700; font-variant-numeric: tabular-nums; font-size: 26px; line-height: 1.1;
           color: var(--ink); overflow-wrap: anywhere; }
    .num.is-empty { color: var(--muted); font-weight: 400; }
    .stat-main .num { font-size: 38px; letter-spacing: -.02em; }
    .of { color: var(--muted); font-size: .62em; }
    .sub { font-size: 13px; color: var(--muted); }
    .level { display: inline-block; font-size: 13px; font-weight: 700; padding: 2px 11px; border-radius: 999px; border: 1px solid; white-space: nowrap; }
    .level-high { color: var(--ok); background: var(--ok-bg); border-color: var(--ok-line); }
    .level-moderate { color: var(--zone-moderate-text); background: var(--zone-moderate); border-color: var(--ok-line); }
    .level-limited, .level-unknown { color: var(--warn); background: var(--warn-bg); border-color: var(--warn-line); }
    .meta { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
    .field { border: 1px solid var(--line); border-radius: 10px; padding: 9px 12px; min-width: 0; }
    .field .k { font-family: var(--font-mono); font-size: 10.5px; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }
    .field .v { font-size: 14px; margin-top: 2px; color: var(--ink); overflow-wrap: anywhere; }
    .panel { border: 1px solid var(--line); border-radius: 16px; padding: 16px 20px 18px; background: var(--surface); }
    .panel-head { display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px 14px; margin-bottom: 12px; }
    .panel-head h2 { font-family: var(--font-display); font-size: 17px; line-height: 1.2; color: var(--ink); }
    .hint { font-size: 12.5px; color: var(--muted); }
    .panel-warn { background: var(--warn-bg); border-color: var(--warn-line); }
    .panel-warn h2 { color: var(--warn); }
    .warn-list { padding-left: 20px; }
    .warn-list li + li { margin-top: 5px; }
    .insight-list { list-style: none; padding: 0; display: grid; gap: 10px; }
    .insight { display: flex; gap: 11px; align-items: flex-start; }
    .insight strong { color: var(--ink); }
    .insight p { margin-top: 2px; font-size: 14px; }
    .insight-mark { width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; flex-shrink: 0; margin-top: 1px;
                    font-size: 12px; font-weight: 800; color: #ffffff; background: var(--muted); }
    .insight-alert .insight-mark { background: var(--warn); }
    .fig svg { max-width: 100%; height: auto; }
    .fig-narrow { display: none; }
    .fig-prior { margin-top: 14px; }
    .takeaways { margin-top: 10px; font-size: 14.5px; }
    .takeaways p + p { margin-top: 2px; }
    .takeaways .is-alert { font-weight: 700; color: var(--warn); }
    .mk-scroll { overflow-x: auto; }
    .mk-table { width: 100%; min-width: 600px; table-layout: fixed; border-collapse: collapse; font-size: 14px; }
    col.c-al { width: 16%; }
    col.c-glyph { width: 212px; }
    col.c-pi { width: 60px; }
    col.c-bar { width: 104px; }
    .mk-table thead th { text-align: left; vertical-align: bottom; font-family: var(--font-mono); font-size: 10.5px; font-weight: 400;
                         letter-spacing: .06em; text-transform: uppercase; color: var(--muted); padding: 6px 12px 8px 0;
                         border-bottom: 1px solid var(--line-strong); }
    .mk-table td, .mk-table tbody th { text-align: left; vertical-align: middle; font-weight: 400; padding: 4px 12px 4px 0; border-top: 1px solid var(--line); }
    .grp { display: inline-flex; align-items: center; gap: 6px; }
    .tri { width: 9px; height: 9px; flex-shrink: 0; }
    .tri-child { fill: var(--child); }
    .tri-parent { fill: var(--parent); }
    .mk-name { display: block; font-family: var(--font-mono); font-weight: 700; color: var(--ink); overflow-wrap: anywhere; }
    .st { display: block; font-size: 12.5px; font-weight: 700; }
    .st-ok { color: var(--ok); }
    .st-bad { color: var(--bad); }
    .st-warn { color: var(--warn); }
    .st-skip { color: var(--skip); }
    .mk-al { font-family: var(--font-mono); font-size: 13.5px; overflow-wrap: anywhere; }
    .mk-al b { color: var(--match-text); font-weight: 700; }
    .mk-long col.c-al { width: 19%; }
    .mk-long .mk-al { font-size: 12px; }
    .mk-table .mk-pi { font-family: var(--font-mono); font-variant-numeric: tabular-nums; text-align: right; overflow-wrap: anywhere; }
    .pi-unused { display: block; font-family: var(--font-sans); font-size: 11.5px; color: var(--muted); }
    .mk-table .mk-bar { padding-right: 0; }
    .mk-glyph svg, .mk-bar svg { max-width: 100%; height: auto; }
    .mk-table tr.has-note > * { padding-bottom: 0; }
    .mk-noterow td { border-top: 0; padding: 0 0 8px; font-size: 12.5px; color: var(--muted); }
    .mk-group th { border-top: 0; padding: 14px 0 6px; font-family: var(--font-display); font-size: 13px; font-weight: 700; color: var(--ink); }
    .counts { margin-top: 12px; }
    .limits-list { list-style: none; padding: 0; display: grid; gap: 8px; }
    .limits-list li { position: relative; padding-left: 22px; font-size: 13.5px; }
    .limits-list li::before { content: ""; position: absolute; left: 4px; top: .5em; width: 8px; height: 8px; border-radius: 2px; background: var(--warn); }
    footer.disclaimer { padding-top: 14px; border-top: 1px solid var(--line); color: var(--muted); font-size: 12px; }
    /* vocabulario de las figuras: mismas clases y colores que la app */
    .sup, .pri, .ag, .pi-axis, .pi-bar { display: block; overflow: visible; }
    .zone-limited { fill: var(--zone-limited); }
    .zone-moderate { fill: var(--zone-moderate); }
    .zone-high { fill: var(--zone-high); }
    .zone-label { font-family: var(--font-display); font-weight: 700; font-size: 11px; }
    .zone-limited-text { fill: var(--zone-limited-text); }
    .zone-moderate-text { fill: var(--zone-moderate-text); }
    .zone-high-text { fill: var(--zone-high-text); }
    .thr { stroke: var(--ink); stroke-width: 1; stroke-dasharray: 2 3; }
    .neutral { stroke: var(--muted); stroke-width: 1; }
    .cs-a { fill: var(--ok); }
    .cs-b { fill: #59a57f; }
    .cs-t { fill: var(--surface); font-family: var(--font-mono); font-size: 10px; }
    .cs-neg { fill: none; stroke: var(--warn); stroke-width: 1.5; }
    .axis-tick { stroke: var(--field-line); }
    .axis-label { fill: var(--muted); font-family: var(--font-mono); font-size: 11px; }
    .axis-label.is-strong { fill: var(--ink); font-weight: 700; }
    .sup-n { font-size: 8.5px; }
    .axis-caption { fill: var(--muted); font-family: var(--font-sans); font-size: 11.5px; }
    .pin-line { stroke: var(--ink); stroke-width: 1.5; }
    .pin-caret { fill: var(--ink); }
    .pin-label { fill: var(--ink); font-family: var(--font-display); font-weight: 700; font-size: 13px; }
    .ag-base { stroke: var(--field-line); stroke-width: 1; }
    .ag-base.is-bad { stroke: var(--bad); stroke-dasharray: 4 3; }
    .ag-dot { fill: var(--muted); }
    .ag-link { fill: var(--match-soft); }
    .pk-child { fill: var(--child); }
    .pk-parent { fill: var(--parent); }
    .pk-shared { fill: var(--match); }
    .pk-skip { fill: var(--skip-peak); }
    .ag-t { fill: var(--muted); font-family: var(--font-mono); font-size: 9.5px; }
    .ag-t.is-shared { fill: var(--match-text); font-weight: 700; }
    .ag-empty { fill: var(--muted); font-family: var(--font-sans); font-style: italic; font-size: 11px; }
    .w-pos { fill: var(--ok); }
    .w-neg { fill: none; stroke: var(--warn); stroke-width: 1.5; }
    .w-axis { stroke: var(--muted); }
    @media (max-width: 640px) {
      header.brand { padding: 16px; }
      .body { padding: 16px 16px 26px; }
      .report-head { grid-template-columns: minmax(0, 1fr); padding: 18px; }
      .verdict { font-size: 26px; }
      .stat-main .num { font-size: 32px; }
      .meta { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .panel { padding: 14px 14px 16px; }
      .fig-wide { display: none; }
      .fig-narrow { display: block; }
      .mk-scroll { overflow: visible; }
      .mk-table { min-width: 0; }
      .mk-table colgroup { display: none; }
      .mk-table thead { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0); }
      .mk-table, .mk-table tbody, .mk-noterow, .mk-group, .mk-noterow td, .mk-group th { display: block; }
      .mk-table tr.mk { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 4px 12px; align-items: start;
                        padding: 8px 0; border-top: 1px solid var(--line); }
      .mk-table tr.mk > * { border: 0; padding: 0; min-width: 0; }
      .mk-table tr.mk > th { grid-column: 1; grid-row: 1; }
      .mk-table tr.mk > .mk-pi { grid-column: 2; grid-row: 1; }
      .mk-table tr.mk > .mk-child { grid-column: 1; grid-row: 2; }
      .mk-table tr.mk > .mk-parent { grid-column: 2; grid-row: 2; }
      .mk-table tr.mk > .mk-glyph { grid-column: 1 / -1; grid-row: 3; }
      .mk-table tr.mk > .mk-bar { display: none; }
      .mk-child::before { content: "Hijo/a "; }
      .mk-parent::before { content: "Progenitor/a "; }
      .mk-pi::before { content: "PI "; }
      .mk-child::before, .mk-parent::before, .mk-pi::before { font-family: var(--font-sans); font-size: 11.5px; font-weight: 400; color: var(--muted); }
      .mk-table tr.has-note { padding-bottom: 2px; }
    }
    @media print {
      body { font-size: 13px; }
      .sheet { max-width: none; }
      header.brand { padding: 0 0 12px; }
      .body { padding: 14px 0 0; }
      .report-head, .panel, .level, .insight-mark, .verdict-mark, .limits-list li::before {
        -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .panel { padding: 12px 14px 14px; }
      .mk-scroll { overflow: visible; }
      .mk-table { min-width: 0; font-size: 12.5px; }
      .mk-table thead { display: table-header-group; }
      .mk-table thead th { font-size: 9.5px; }
      .st { font-size: 12px; }
      col.c-glyph { width: 190px; }
      col.c-pi { width: 54px; }
      col.c-bar { width: 94px; }
      tr.mk, .report-head, .panel-head, .insight, .limits-list li, .fig, .takeaways { break-inside: avoid; }
      .panel-head, .mk-group, tr.has-note { break-after: avoid; }
      .panel-head + * { break-before: avoid; }
    }`;

  // El índice de un marcador entra al CPI sólo si el marcador es compatible e informativo.
  function isUsed(m) {
    return m.pi !== null && m.pi > 0 && m.paternity_informative && m.compatible === true;
  }

  // "Triaje: patrón compatible" → "Patrón compatible", como en la pantalla.
  function sentence(text) {
    var t = String(text === null || text === undefined ? "" : text).replace(/^Triaje:\s*/, "");
    return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
  }

  // Sólo se incrusta lo que es un SVG generado por la app.
  function svgOf(value) {
    return typeof value === "string" && /^<svg[\s>]/.test(value) ? value : "";
  }

  function sharedKeys(m) {
    if (!m.paternity_informative) return new Set();
    var parent = new Set(m.alleged_parent.map(E.alleleKey));
    return new Set(m.child.map(E.alleleKey).filter(function (k) { return parent.has(k); }));
  }

  function alleleCell(list, shared) {
    if (!list.length) return '<span class="muted">—</span>';
    return list.map(function (a) { return shared.has(E.alleleKey(a)) ? "<b>" + esc(a) + "</b>" : esc(a); }).join(", ");
  }

  function buildFigureReport(result, metadata, extras) {
    var fig = extras.figures || {};
    var banner = extras.verdict || E.bannerMeta(result);
    var tone = /^(ok|warn|bad)$/.test(banner[0]) ? banner[0] : "warn";
    var top = fig.headline || {
      posterior: result.posterior_probability === null ? null : posteriorText(result, extras),
      level: null,
      cpi: result.cpi === null ? null : cpiText(result, extras),
      cpiNote: "",
      blocked: "",
    };
    var levelKey = top.level && /^(high|moderate|limited)$/.test(top.level.key) ? top.level.key : "unknown";
    var reportMode = metadata.report_mode === undefined ? "con identificadores" : metadata.report_mode;
    var caseId = esc(meta(metadata, "case_id"));
    var childId = esc(meta(metadata, "child_id"));
    var parentId = esc(meta(metadata, "parent_id"));

    var panelHead = function (title, hint) {
      return '<div class="panel-head"><h2>' + title + "</h2>" + (hint ? '<span class="hint">' + hint + "</span>" : "") + "</div>";
    };

    /* cabecera: veredicto y tres cifras */
    var stats = '<div class="stat stat-main"><dt>Probabilidad posterior</dt><dd>';
    if (top.posterior) {
      stats += '<span class="num">' + esc(top.posterior) + "</span>";
      if (top.level) stats += '<span class="level level-' + levelKey + '">' + esc(top.level.label) + "</span>";
    } else {
      stats += '<span class="num is-empty">—</span><span class="sub">' + esc(top.blocked || "No calculada") + "</span>";
    }
    stats += '</dd></div><div class="stat"><dt>CPI</dt><dd>';
    if (top.cpi) stats += '<span class="num">' + esc(top.cpi) + "</span>" + (top.cpiNote ? '<span class="sub">' + esc(top.cpiNote) + "</span>" : "");
    else stats += '<span class="num is-empty">—</span><span class="sub">' + esc(top.cpiNote || "No calculado") + "</span>";
    var sub = [result.exclusions === 1 ? "1 incongruencia" : result.exclusions + " incongruencias"];
    if (result.missing_markers) sub.push(result.missing_markers + " incompleto(s)");
    stats +=
      '</dd></div><div class="stat"><dt>Compatibles</dt><dd><span class="num">' + result.compatible_markers +
      '<span class="of"> / ' + result.total_markers + '</span></span><span class="sub">' + esc(sub.join(" · ")) + "</span></dd></div>";

    var exact = "";
    if (result.cpi !== null && result.posterior_probability !== null) {
      exact =
        '\n      <p class="small">Cifras exactas: CPI <span class="mono">' + esc(cpiText(result, extras)) +
        '</span> · probabilidad posterior <span class="mono">' + esc(posteriorText(result, extras)) + "</span>.</p>";
    }

    /* observaciones de control y advertencias */
    var insightsPanel = "";
    if (extras.insights && extras.insights.length) {
      insightsPanel =
        '\n      <section class="panel">' + panelHead("Observaciones de control", "Comprobaciones automáticas sobre los datos capturados") +
        '<ul class="insight-list">' +
        extras.insights
          .map(function (o) {
            var alert = o.level === "alert";
            return '<li class="insight' + (alert ? " insight-alert" : "") + '"><span class="insight-mark" aria-hidden="true">' + (alert ? "!" : "i") +
              "</span><div><strong>" + esc(o.title) + "</strong><p>" + esc(o.text) + "</p></div></li>";
          })
          .join("") +
        "</ul></section>";
    }
    var warningsPanel = "";
    if (result.warnings.length) {
      warningsPanel =
        '\n      <section class="panel panel-warn">' + panelHead("Advertencias", String(result.warnings.length)) + '<ul class="warn-list">' +
        result.warnings.map(function (w) { return "<li>" + esc(w) + "</li>"; }).join("") + "</ul></section>";
    }

    /* soporte estadístico: sólo cuando hay CPI */
    var figure = function (wide, narrow, extraClass) {
      var cls = "fig" + (extraClass ? " " + extraClass : "");
      return '<div class="' + cls + (narrow ? " fig-wide" : "") + '">' + wide + "</div>" + (narrow ? '<div class="' + cls + ' fig-narrow">' + narrow + "</div>" : "");
    };
    var supportPanel = "";
    var supportSvg = svgOf(fig.support);
    if (supportSvg) {
      var sen = fig.sentences || {};
      supportPanel = '\n      <section class="panel">' + panelHead("Soporte estadístico", "Dónde cae el CPI y cómo lo construyen los índices del laboratorio") +
        figure(supportSvg, svgOf(fig.supportNarrow));
      if (sen.distance || sen.composition) {
        supportPanel += '<div class="takeaways">' + (sen.distance ? "<p>" + esc(sen.distance) + "</p>" : "") +
          (sen.composition ? "<p" + (sen.compositionAlert ? ' class="is-alert"' : "") + ">" + esc(sen.composition) + "</p>" : "") + "</div>";
      }
      var priorSvg = svgOf(fig.prior);
      if (priorSvg) supportPanel += figure(priorSvg, svgOf(fig.priorNarrow), "fig-prior");
      if (sen.prior) supportPanel += '<div class="takeaways"><p>' + esc(sen.prior) + "</p></div>";
      supportPanel += "</section>";
    }

    /* alelos comparados */
    var glyphs = Array.isArray(fig.glyphs) ? fig.glyphs : [];
    var bars = Array.isArray(fig.bars) ? fig.bars : [];
    var hasGlyphs = glyphs.some(function (g) { return !!svgOf(g); });
    var hasBars = bars.some(function (b) { return !!svgOf(b); });
    var columns = 4 + (hasGlyphs ? 1 : 0) + (hasBars ? 1 : 0);
    var row = function (m, i) {
      var klass = E.statusClass(m);
      var shared = sharedKeys(m);
      var note = m.note || "";
      if (note.indexOf(GENERIC_OK_NOTE) === 0) note = note.slice(GENERIC_OK_NOTE.length).trim();
      var pi;
      if (m.pi === null) pi = '<span class="muted">—</span>';
      else if (!isUsed(m)) pi = esc(m.pi) + '<span class="pi-unused">no usado</span>';
      else pi = esc(m.pi);
      var html =
        '<tr class="mk mk-' + klass + (note ? " has-note" : "") + '">' +
        '<th scope="row"><span class="mk-name">' + esc(m.marker) + '</span><span class="st st-' + klass + '"><span aria-hidden="true">' + STATUS_MARK[klass] +
        "</span> " + esc(E.statusLabel(m)) + "</span></th>" +
        '<td class="mk-al mk-child">' + alleleCell(m.child, shared) + "</td>" +
        '<td class="mk-al mk-parent">' + alleleCell(m.alleged_parent, shared) + "</td>" +
        (hasGlyphs ? '<td class="mk-glyph">' + svgOf(glyphs[i]) + "</td>" : "") +
        '<td class="mk-pi">' + pi + "</td>" +
        (hasBars ? '<td class="mk-bar">' + svgOf(bars[i]) + "</td>" : "") +
        "</tr>";
      if (note) html += '\n<tr class="mk-noterow"><td colspan="' + columns + '">' + esc(note) + "</td></tr>";
      return html;
    };
    var review = [];
    var rest = [];
    result.markers.forEach(function (m, i) {
      var klass = E.statusClass(m);
      (klass === "bad" || klass === "warn" ? review : rest).push(i);
    });
    var group = function (title, list) {
      return '<tr class="mk-group"><th colspan="' + columns + '" scope="colgroup">' + title + " (" + list.length + ")</th></tr>";
    };
    var rows = [];
    if (review.length && rest.length) {
      rows.push(group("Para revisar", review));
      review.forEach(function (i) { rows.push(row(result.markers[i], i)); });
      rows.push(group("Resto", rest));
      rest.forEach(function (i) { rows.push(row(result.markers[i], i)); });
    } else {
      result.markers.forEach(function (m, i) { rows.push(row(m, i)); });
    }
    var longAlleles = result.markers.some(function (m) {
      return m.child.concat(m.alleged_parent).some(function (a) { return Array.from(String(a)).length > 12; });
    });
    var glyphHint = !hasGlyphs
      ? ""
      : "Esquema: la posición indica el alelo; la altura no representa señal del equipo." +
        (fig.repeatScale ? " Un punto equivale a una repetición." : "") +
        (fig.glyphsPartial ? " Por el tamaño del panel, sólo se dibuja en los marcadores por revisar." : "");
    var markersPanel =
      '\n      <section class="panel">' + panelHead("Alelos comparados", glyphHint) +
      '<div class="mk-scroll"><table class="mk-table' + (longAlleles ? " mk-long" : "") + '">' +
      '<colgroup><col class="c-name"><col class="c-al"><col class="c-al">' + (hasGlyphs ? '<col class="c-glyph">' : "") + '<col class="c-pi">' +
      (hasBars ? '<col class="c-bar">' : "") + "</colgroup>" +
      '<thead><tr><th scope="col">Marcador</th><th scope="col"><span class="grp">' + TRI_UP + 'Hijo/a</span></th><th scope="col"><span class="grp">' + TRI_DOWN +
      "Progenitor/a</span></th>" +
      (hasGlyphs ? '<th scope="col">Esquema</th>' : "") +
      '<th scope="col" class="mk-pi">PI</th>' + (hasBars ? '<th scope="col" class="mk-bar">' + svgOf(fig.piAxis) + "</th>" : "") +
      "</tr></thead>\n<tbody>\n" + rows.join("\n") + "\n</tbody></table></div>" +
      '<p class="small counts">Marcadores capturados: ' + result.captured_markers + " · útiles: " + result.total_markers + " · informativos: " +
      result.informative_markers + " · datos incompletos: " + result.missing_markers + " · no informativos excluidos: " + result.non_informative_markers +
      ".</p></section>";

    var limitsPanel = "";
    if (extras.limits && extras.limits.length) {
      // textos fijos de la aplicación (no datos del usuario): se insertan tal cual
      limitsPanel =
        '\n      <section class="panel">' + panelHead("Alcances y límites de este análisis", "") + '<ul class="limits-list">' +
        extras.limits.map(function (t) { return "<li>" + t + "</li>"; }).join("") + "</ul></section>";
    }

    var helix =
      '<svg class="watermark" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<path d="M22 12 C42 22, 42 30, 22 40 C2 50, 2 58, 22 64" fill="none" stroke="#39FF14" stroke-width="3" stroke-linecap="round"/>' +
      '<path d="M42 12 C22 22, 22 30, 42 40 C62 50, 62 58, 42 64" fill="none" stroke="#C9D6E2" stroke-width="3" stroke-linecap="round"/>' +
      '<line x1="26" y1="20" x2="38" y2="20" stroke="#39FF14" stroke-width="2.4" stroke-linecap="round"/>' +
      '<line x1="26" y1="32" x2="38" y2="32" stroke="#39FF14" stroke-width="2.4" stroke-linecap="round"/>' +
      '<line x1="26" y1="44" x2="38" y2="44" stroke="#39FF14" stroke-width="2.4" stroke-linecap="round"/>' +
      "</svg>";

    // El documento no lleva scripts ni recursos externos, y su propia política lo impide
    // aunque alguien lo modifique después.
    return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
  <meta name="referrer" content="no-referrer">
  <meta name="color-scheme" content="light">
  <title>Reporte ariADNa · ${caseId || "preliminar"}</title>
  <style>${FIGURE_CSS}
  </style>
</head>
<body>
  <div class="sheet">
    <header class="brand">
      ${helix}
      <div class="wordmark">ari<span class="adn">ADN</span>a</div>
      <div class="tagline">Reporte preliminar de compatibilidad genética · paternidad/maternidad</div>
    </header>
    <main class="body">
      <section class="report-head tone-${tone}">
        <div class="verdict-block">
          <p class="eyebrow">Lectura de triaje · preliminar</p>
          <h1 class="verdict"><span class="verdict-mark">${VERDICT_ICON[tone]}</span><span>${esc(sentence(banner[1]))}</span></h1>
          <p class="conclusion">${esc(sentence(extras.conclusion || result.conclusion))}</p>
          <p class="disclaimer-line">No sustituye el dictamen de un laboratorio acreditado ni la revisión pericial.</p>
        </div>
        <dl class="stats">${stats}</dl>
      </section>${exact}
      <div class="meta">
        <div class="field"><div class="k">Caso</div><div class="v">${caseId || "—"}</div></div>
        <div class="field"><div class="k">Hijo/a</div><div class="v">${childId || "—"}</div></div>
        <div class="field"><div class="k">Progenitor/a alegado/a</div><div class="v">${parentId || "—"}</div></div>
        <div class="field"><div class="k">Prob. previa usada</div><div class="v mono">${E.pyFormatF(result.prior_probability_used, 2)}</div></div>
      </div>
      <p class="small">Ensayo: ${esc(result.assay_label)}. Versión del algoritmo: <span class="mono">${esc(result.algorithm_version)}</span>. Modo de reporte: ${esc(reportMode)}.</p>${insightsPanel}${warningsPanel}${supportPanel}${markersPanel}${limitsPanel}
      <footer class="disclaimer">
        Este reporte no sustituye el dictamen de un laboratorio acreditado ni una evaluación pericial.
        No prueba ni descarta legalmente una relación biológica. Requiere consentimiento/autorización,
        cadena de custodia, validación de datos y revisión profesional.
        Privacidad: puede contener datos genéticos sensibles aunque omita nombres; usa identificadores anónimos y conserva el archivo
        sólo en ubicaciones autorizadas. ariADNa no calcula PI/LR real desde frecuencias poblacionales y no está
        validada externamente para uso pericial.
      </footer>
    </main>
  </div>
</body>
</html>
`;
  }

  // Devuelve el documento HTML (equivale a write_html_report sin escribir a disco).
  function buildHtmlReport(result, metadata, extras) {
    metadata = metadata || {};
    if (extras && extras.figures) return buildFigureReport(result, metadata, extras);
    var c = REPORT_COLORS;
    var reportMode = metadata.report_mode === undefined ? "con identificadores" : metadata.report_mode;
    var banner = extras && extras.verdict ? extras.verdict : E.bannerMeta(result);
    var conclusion = extras && extras.conclusion ? extras.conclusion : result.conclusion;
    var bannerClass = banner[0];
    var verdict = banner[1];

    var chipTone = {
      ok: [c.ok, c.ok_bg],
      warn: [c.warn, c.warn_bg],
      bad: [c.bad, c.bad_bg],
      skip: [c.skip, c.skip_bg],
    };
    var markerRows = result.markers.map(function (marker) {
      var klass = E.statusClass(marker);
      var tone = chipTone[klass];
      var chip =
        '<span class="chip" style="color:' + tone[0] + "; background:" + tone[1] + ';">' +
        esc(E.statusLabel(marker)) + "</span>";
      return (
        '<tr class="' + klass + '">' +
        "<td class='marker'>" + esc(marker.marker) + "</td>" +
        "<td class='mono'>" + esc(marker.child.join(", ")) + "</td>" +
        "<td class='mono'>" + esc(marker.alleged_parent.join(", ")) + "</td>" +
        "<td>" + chip + "</td>" +
        "<td class='mono'>" + esc(marker.pi !== null ? marker.pi : "—") + "</td>" +
        "<td class='note'>" + esc(marker.note) + "</td>" +
        "</tr>"
      );
    });

    var posterior = result.posterior_probability === null ? "No calculada" : posteriorText(result, extras);
    var cpi = result.cpi === null ? "No calculado" : cpiText(result, extras);
    var incColor = result.exclusions ? c.bad : c.text;
    var compColor = result.compatible_markers ? c.ok : c.text;
    var skipColor = result.non_informative_markers ? c.skip : c.text;

    var warningsBlock = "";
    if (result.warnings.length) {
      var items = result.warnings.map(function (w) { return "<li>" + esc(w) + "</li>"; }).join("");
      warningsBlock = '<div class="warning"><strong>Advertencias</strong><ul>' + items + "</ul></div>";
    }

    var extraCss = "";
    var insightsBlock = "";
    var limitsBlock = "";
    if (extras) {
      extraCss =
        "\n    .insights { border: 1px solid var(--border); border-left: 4px solid " + c.text_muted + "; border-radius: 10px; padding: 12px 16px; margin: 18px 0; }" +
        "\n    .insights li.alert strong { color: " + c.warn + "; }" +
        "\n    .limits { margin-top: 22px; padding: 12px 16px; border: 1px solid var(--border); border-radius: 10px; font-size: 12.5px; }" +
        "\n    .limits ul, .insights ul { margin: 8px 0 0; padding-left: 20px; }";
      if (extras.insights && extras.insights.length) {
        insightsBlock =
          '<div class="insights"><strong>Observaciones de control</strong><ul>' +
          extras.insights
            .map(function (o) { return '<li class="' + (o.level === "alert" ? "alert" : "info") + '"><strong>' + esc(o.title) + ".</strong> " + esc(o.text) + "</li>"; })
            .join("") +
          "</ul></div>\n      ";
      }
      if (extras.limits && extras.limits.length) {
        // textos fijos de la aplicación (no datos del usuario): se insertan tal cual
        limitsBlock =
          '<div class="limits"><strong>Alcances y límites de este análisis</strong><ul>' +
          extras.limits.map(function (t) { return "<li>" + t + "</li>"; }).join("") +
          "</ul></div>\n      ";
      }
    }

    var helix =
      '<svg class="watermark" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<path d="M22 12 C42 22, 42 30, 22 40 C2 50, 2 58, 22 64" fill="none" stroke="#39FF14" stroke-width="3" stroke-linecap="round"/>' +
      '<path d="M42 12 C22 22, 22 30, 42 40 C62 50, 62 58, 42 64" fill="none" stroke="#EAF6F0" stroke-width="3" stroke-linecap="round"/>' +
      '<line x1="26" y1="20" x2="38" y2="20" stroke="#39FF14" stroke-width="2.4" stroke-linecap="round"/>' +
      '<line x1="26" y1="32" x2="38" y2="32" stroke="#39FF14" stroke-width="2.4" stroke-linecap="round"/>' +
      '<line x1="26" y1="44" x2="38" y2="44" stroke="#39FF14" stroke-width="2.4" stroke-linecap="round"/>' +
      "</svg>";

    var caseId = esc(meta(metadata, "case_id"));
    var childId = esc(meta(metadata, "child_id"));
    var parentId = esc(meta(metadata, "parent_id"));
    var prior = E.pyFormatF(result.prior_probability_used, 2);

    return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Reporte ariADNa · ${caseId || "preliminar"}</title>
  <style>
    :root {
      --primary: ${c.primary}; --accent: ${c.accent}; --text: ${c.text};
      --muted: ${c.text_muted}; --border: ${c.border};
    }
    * { box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            margin: 0; color: var(--text); line-height: 1.5; background: #FFFFFF; }
    .sheet { max-width: 900px; margin: 0 auto; background: #FFFFFF; }
    .mono { font-family: 'SF Mono','Cascadia Mono','Consolas','DejaVu Sans Mono',monospace; font-variant-numeric: tabular-nums; }
    header.brand { position: relative; overflow: hidden; background: #FFFFFF;
                    color: var(--text); padding: 22px 32px; border-bottom: 2px solid var(--accent); }
    header.brand .wordmark { font-size: 22px; font-weight: 700; letter-spacing: .3px; }
    header.brand .wordmark .adn { color: var(--accent); }
    header.brand .tagline { color: var(--muted); font-size: 13px; margin-top: 2px; }
    header.brand .watermark { position: absolute; right: 18px; top: -6px; width: 120px; height: 120px; opacity: .18; }
    .body { padding: 26px 32px 34px; }
    h1 { font-size: 20px; margin: 0 0 2px; }
    .subtitle { color: var(--muted); margin: 0 0 18px; font-size: 14px; }
    .banner { border-radius: 12px; padding: 16px 18px; margin: 0 0 8px;
               box-shadow: 0 1px 2px rgba(20,33,58,.06), 0 6px 18px rgba(20,33,58,.06); }
    .banner .verdict { font-size: 17px; font-weight: 700; }
    .banner .detail { color: #33465F; margin-top: 3px; }
    .banner.ok { background: ${c.ok_bg}; border: 1px solid ${c.ok_border}; }
    .banner.ok .verdict { color: ${c.ok}; }
    .banner.warn { background: ${c.warn_bg}; border: 1px solid ${c.warn_border}; }
    .banner.warn .verdict { color: ${c.warn}; }
    .banner.bad { background: ${c.bad_bg}; border: 1px solid ${c.bad_border}; }
    .banner.bad .verdict { color: ${c.bad}; }
    .footnote-chip { display: inline-block; background: ${c.surface_alt}; color: var(--muted);
                      font-size: 11px; padding: 3px 10px; border-radius: 999px; margin: 6px 0 18px; }
    .meta { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 6px 0 18px; }
    .meta .field { background: #FFFFFF; border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; }
    .meta .k { font-size: 10px; letter-spacing: .5px; color: var(--muted); text-transform: uppercase; }
    .meta .v { font-size: 14px; margin-top: 2px; word-break: break-word; }
    .cards { display: grid; grid-template-columns: repeat(6, 1fr); gap: 12px; margin: 8px 0 18px; }
    .card { background: #FFFFFF; border: 1px solid var(--border); border-radius: 12px; padding: 12px;
             box-shadow: 0 1px 2px rgba(20,33,58,.06), 0 4px 12px rgba(20,33,58,.06); }
    .card .label { color: var(--muted); font-size: 10px; letter-spacing: .5px; text-transform: uppercase; }
    .card .value { font-size: 22px; margin-top: 5px; font-family: 'SF Mono','Consolas',monospace; }
    table { border-collapse: collapse; width: 100%; margin-top: 6px; border: 1px solid var(--border);
             border-radius: 12px; overflow: hidden; }
    thead th { background: #FFFFFF; color: var(--primary); border-bottom: 2px solid var(--accent);
                padding: 10px; font-size: 12px; text-align: left; }
    tbody td { border-bottom: 1px solid #E1E8F2; padding: 8px 10px; font-size: 13px; vertical-align: top; }
    tbody tr:nth-child(even) { background: #FFFFFF; }
    td.marker { color: var(--text); }
    td.note { color: var(--muted); font-size: 12px; }
    tr.ok td.marker { border-left: 4px solid ${c.ok}; }
    tr.warn td.marker { border-left: 4px solid ${c.warn}; }
    tr.bad td.marker { border-left: 4px solid ${c.bad}; }
    tr.skip td.marker { border-left: 4px solid ${c.skip}; }
    .chip { display: inline-block; font-size: 12px; padding: 2px 9px; border-radius: 9px; white-space: nowrap; }
    .warning { background: ${c.warn_bg}; border: 1px solid ${c.warn_border}; border-left: 4px solid ${c.warn};
                border-radius: 10px; padding: 12px 16px; margin: 18px 0; }
    .warning strong { color: ${c.warn}; }
    .small { color: var(--muted); font-size: 12px; }
    footer.disclaimer { margin-top: 22px; padding-top: 14px; border-top: 1px solid var(--border);
                         color: var(--muted); font-size: 12px; }
    @media print { body { background: #fff; } .sheet { max-width: none; }
                    .banner, .card { box-shadow: none; } }${extraCss}
  </style>
</head>
<body>
  <div class="sheet">
    <header class="brand">
      ${helix}
      <div class="wordmark">ari<span class="adn">ADN</span>a</div>
      <div class="tagline">Reporte preliminar de compatibilidad genética · paternidad/maternidad</div>
    </header>
    <div class="body">
      <h1>Lectura de triaje</h1>
      <p class="subtitle">Ensayo: ${esc(result.assay_label)}</p>
      <div class="banner ${bannerClass}">
        <div class="verdict">${esc(verdict)}</div>
        <div class="detail">${esc(conclusion)}</div>
      </div>
      <span class="footnote-chip">Resultado preliminar · no sustituye dictamen pericial</span>
      <div class="meta">
        <div class="field"><div class="k">Caso</div><div class="v">${caseId || "—"}</div></div>
        <div class="field"><div class="k">Hijo/a</div><div class="v">${childId || "—"}</div></div>
        <div class="field"><div class="k">Progenitor/a alegado/a</div><div class="v">${parentId || "—"}</div></div>
        <div class="field"><div class="k">Prob. previa usada</div><div class="v mono">${prior}</div></div>
      </div>
      <p class="small">Versión del algoritmo: <span class="mono">${esc(result.algorithm_version)}</span>. Modo de reporte: ${esc(reportMode)}.</p>
      <div class="cards">
        <div class="card"><div class="label">Útiles</div><div class="value">${result.total_markers}</div></div>
        <div class="card"><div class="label">Compatibles</div><div class="value" style="color:${compColor};">${result.compatible_markers}</div></div>
        <div class="card"><div class="label">Incongruencias</div><div class="value" style="color:${incColor};">${result.exclusions}</div></div>
        <div class="card"><div class="label">No inform.</div><div class="value" style="color:${skipColor};">${result.non_informative_markers}</div></div>
        <div class="card"><div class="label">CPI</div><div class="value">${esc(cpi)}</div></div>
        <div class="card"><div class="label">Posterior</div><div class="value">${esc(posterior)}</div></div>
      </div>
      <p class="small">Marcadores capturados: ${result.captured_markers}. Datos incompletos: ${result.missing_markers}. No informativos excluidos: ${result.non_informative_markers}.</p>
      ${warningsBlock}${insightsBlock}
      <table>
        <thead>
          <tr><th>Marcador</th><th>Hijo/a</th><th>Progenitor/a alegado/a</th><th>Estado</th><th>Índice</th><th>Nota</th></tr>
        </thead>
        <tbody>
${markerRows.join("\n")}
        </tbody>
      </table>
      ${limitsBlock}<footer class="disclaimer">
        Este reporte no sustituye el dictamen de un laboratorio acreditado ni una evaluación pericial.
        No prueba ni descarta legalmente una relación biológica. Requiere consentimiento/autorización,
        cadena de custodia, validación de datos y revisión profesional.
        Privacidad: puede contener datos genéticos sensibles aunque omita nombres; usa identificadores anónimos y conserva el archivo
        sólo en ubicaciones autorizadas. ariADNa no calcula PI/LR real desde frecuencias poblacionales y no está
        validada externamente para uso pericial.
      </footer>
    </div>
  </div>
</body>
</html>
`;
  }

  return {
    REPORT_COLORS: REPORT_COLORS,
    resultToText: resultToText,
    buildHtmlReport: buildHtmlReport,
  };
});

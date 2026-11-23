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

  // Devuelve el documento HTML (equivale a write_html_report sin escribir a disco).
  function buildHtmlReport(result, metadata, extras) {
    metadata = metadata || {};
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

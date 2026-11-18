/*!
 * ariADNa — gráficos de resultados (SVG generado, sin dependencias)
 *
 * Mismos cuatro gráficos que la pestaña Resultados del complemento QGIS:
 * marcadores por estado, CPI capturado, probabilidad posterior e índice por marcador.
 * Los colores salen de clases CSS (la CSP no permite estilos en línea).
 */
(function (root) {
  "use strict";
  var E = root.AriadnaEngine;
  var esc = E.escapeHtml;

  function empty(message) {
    return '<div class="chart-empty"><p>' + esc(message) + "</p></div>";
  }

  // Formato del valor del CPI como en la tarjeta del complemento.
  function formatCpi(value) {
    if (value === 0) return "0";
    var a = Math.abs(value);
    if (a >= 0.001 && a < 1e6) return E.pyFormatG(value, 6);
    return E.pyFormatE(value, 3);
  }

  // Posterior para mostrar en pantalla: nunca "100.00%" (siempre queda incertidumbre).
  function formatPosterior(p, decimals) {
    var text = E.pyFormatF(p * 100, decimals);
    if (Number.parseFloat(text) >= 100) return ">" + E.pyFormatF(100 - Math.pow(10, -decimals), decimals) + "%";
    return text + "%";
  }

  function statusBars(result) {
    if (!result || !result.captured_markers) return empty("Analiza para ver la distribución de marcadores.");
    var rows = [
      ["Compatibles", result.compatible_markers, "c-ok"],
      ["Incongruencias", result.exclusions, "c-bad"],
      ["Incompletos", result.missing_markers, "c-warn"],
      ["No inform.", result.non_informative_markers, "c-skip"],
    ];
    var W = 440;
    var labelW = 112;
    var valueW = 44;
    var barW = W - labelW - valueW;
    var rowH = 36;
    var H = rows.length * rowH;
    var total = result.captured_markers;
    var aria =
      "Compatibles " + result.compatible_markers + ", incongruencias " + result.exclusions + ", incompletos " +
      result.missing_markers + ", no informativos " + result.non_informative_markers + ", de " + total + " capturados.";
    var s = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + esc(aria) + '">';
    rows.forEach(function (row, i) {
      var y = i * rowH;
      var w = (row[1] / total) * barW;
      if (row[1] > 0) w = Math.max(w, 8);
      s += '<text class="t-label" x="0" y="' + (y + 21) + '">' + row[0] + "</text>";
      s += '<rect class="c-track" x="' + labelW + '" y="' + (y + 9) + '" width="' + barW + '" height="16" rx="8"/>';
      if (row[1] > 0) s += '<rect class="' + row[2] + '" x="' + labelW + '" y="' + (y + 9) + '" width="' + w.toFixed(2) + '" height="16" rx="8"/>';
      s += '<text class="t-value" x="' + W + '" y="' + (y + 22) + '" text-anchor="end">' + row[1] + "</text>";
    });
    return s + "</svg>";
  }

  function cpiCard(result) {
    if (!result || result.cpi === null) {
      return (
        '<div class="cpi-box na"><div class="cpi-value">N/D</div>' +
        '<p class="muted">Requiere PI válidos y datos sin incongruencias críticas.</p></div>'
      );
    }
    return (
      '<div class="cpi-box"><div class="cpi-value">' + esc(formatCpi(result.cpi)) + "</div>" +
      '<p class="muted">producto de PI válidos</p><span class="rule" aria-hidden="true"></span></div>'
    );
  }

  function donut(result) {
    var p = result ? result.posterior_probability : null;
    var S = 200;
    var c = S / 2;
    var r = 72;
    var sw = 20;
    var circumference = 2 * Math.PI * r;
    var valid = p !== null && Number.isFinite(p);
    var aria = valid ? "Probabilidad posterior " + formatPosterior(p, 2) : "Probabilidad posterior no disponible: requiere PI";
    var s = '<svg viewBox="0 0 ' + S + " " + S + '" role="img" aria-label="' + esc(aria) + '">';
    s += '<circle class="s-track" cx="' + c + '" cy="' + c + '" r="' + r + '" fill="none" stroke-width="' + sw + '"/>';
    if (!valid) {
      s += '<text class="t-big" x="' + c + '" y="' + (c + 4) + '" text-anchor="middle" font-size="22">N/D</text>';
      s += '<text class="t-muted" x="' + c + '" y="' + (c + 26) + '" text-anchor="middle">requiere PI</text>';
      return s + "</svg>";
    }
    var cls = p >= 0.99 ? "s-ok" : p >= 0.95 ? "s-mid" : "s-warn";
    var len = Math.max(0, Math.min(1, p)) * circumference;
    s +=
      '<circle class="' + cls + '" cx="' + c + '" cy="' + c + '" r="' + r + '" fill="none" stroke-width="' + sw +
      '" stroke-linecap="round" stroke-dasharray="' + len.toFixed(2) + " " + circumference.toFixed(2) +
      '" transform="rotate(-90 ' + c + " " + c + ')"/>';
    s += '<text class="t-big" x="' + c + '" y="' + (c + 6) + '" text-anchor="middle" font-size="24">' + esc(formatPosterior(p, 2)) + "</text>";
    s += '<text class="t-muted" x="' + c + '" y="' + (c + 28) + '" text-anchor="middle">posterior</text>';
    return s + "</svg>";
  }

  function truncate(name, n) {
    var chars = Array.from(name);
    return chars.length > n ? chars.slice(0, n - 1).join("") + "…" : name;
  }

  function piChart(result) {
    var all = result
      ? result.markers.filter(function (m) { return m.pi !== null && m.paternity_informative && m.compatible === true; })
      : [];
    if (!all.length) {
      return empty("Sin índice útil capturado. Añade el índice del laboratorio en marcadores informativos para comparar el peso de cada marcador.");
    }
    var markers = all.slice(0, 14);
    var logs = markers.map(function (m) { return m.pi > 0 ? Math.log10(m.pi) : -3; });
    var scale = Math.max(0.3, Math.max.apply(null, logs.map(Math.abs)));
    var W = 760;
    var nameW = 128;
    var pad = 60;
    var rowH = 28;
    var top = 28;
    var plotL = nameW + pad;
    var plotR = W - pad;
    var mid = (plotL + plotR) / 2;
    var half = (plotR - plotL) / 2;
    var H = top + markers.length * rowH + 30;
    var s = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Índice de laboratorio por marcador, escala logarítmica alrededor de PI = 1">';
    s += '<line class="s-axis" x1="' + mid + '" y1="' + (top - 8) + '" x2="' + mid + '" y2="' + (H - 26) + '" stroke-width="1.5" stroke-dasharray="4 4"/>';
    s += '<text class="t-muted" x="' + mid + '" y="' + (top - 14) + '" text-anchor="middle">PI = 1</text>';
    markers.forEach(function (m, i) {
      var y = top + i * rowH;
      var w = Math.max(2, (Math.abs(logs[i]) / scale) * half);
      var positive = m.pi >= 1;
      var x = positive ? mid : mid - w;
      var label = E.pyFormatG(m.pi);
      s += '<text class="t-label" x="' + (nameW - 8) + '" y="' + (y + 17) + '" text-anchor="end">' + esc(truncate(m.marker, 16)) + "</text>";
      s += '<rect class="' + (positive ? "c-ok" : "c-warn") + '" x="' + x.toFixed(2) + '" y="' + (y + 6) + '" width="' + w.toFixed(2) + '" height="15" rx="4"/>';
      if (positive) {
        s += '<text class="t-value" x="' + (mid + w + 6).toFixed(2) + '" y="' + (y + 18) + '">' + esc(label) + "</text>";
      } else {
        s += '<text class="t-value" x="' + (mid - w - 6).toFixed(2) + '" y="' + (y + 18) + '" text-anchor="end">' + esc(label) + "</text>";
      }
    });
    s += '<text class="t-muted" x="' + plotL + '" y="' + (H - 6) + '">◀ menor peso (PI&lt;1)</text>';
    s += '<text class="t-muted" x="' + plotR + '" y="' + (H - 6) + '" text-anchor="end">mayor peso (PI&gt;1) ▶</text>';
    s += "</svg>";
    if (all.length > markers.length) {
      s += '<p class="footnote">Se muestran 14 de ' + all.length + " marcadores con índice válido.</p>";
    }
    return s;
  }

  root.AriadnaCharts = {
    statusBars: statusBars,
    cpiCard: cpiCard,
    donut: donut,
    piChart: piChart,
    formatCpi: formatCpi,
    formatPosterior: formatPosterior,
  };
})(typeof self !== "undefined" ? self : this);

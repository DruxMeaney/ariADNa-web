/*!
 * ariADNa — visualizaciones (SVG generado, sin dependencias)
 *
 *  - supportScale: escala logarítmica del CPI con las zonas limitado/moderado/alto.
 *  - markerLane:   carril tipo gel, una banda por marcador coloreada por estado.
 *  - trace:        electroferograma comparado de un marcador (hijo/a ▲, progenitor/a ▼).
 *  - weight:       peso del índice del laboratorio en escala logarítmica alrededor de PI = 1.
 *
 * Todas reciben el ancho real del contenedor (1 unidad = 1 px) para que el texto
 * conserve su tamaño en cualquier pantalla. Los colores salen de clases CSS
 * (la CSP no permite estilos en línea).
 */
(function (root) {
  "use strict";
  var E = root.AriadnaEngine;
  var esc = E.escapeHtml;

  /* ------------------------------------------------------------ formatos */
  function formatCpi(value) {
    if (value === 0) return "0";
    var a = Math.abs(value);
    if (a >= 0.001 && a < 1e6) return E.pyFormatG(value, 6);
    return E.pyFormatE(value, 3);
  }

  // Posterior en pantalla: nunca "100.00%" (siempre queda incertidumbre).
  function formatPosterior(p, decimals) {
    var text = E.pyFormatF(p * 100, decimals);
    if (Number.parseFloat(text) >= 100) return ">" + E.pyFormatF(100 - Math.pow(10, -decimals), decimals) + "%";
    return text + "%";
  }

  // Mismos umbrales que la conclusión de triaje (alto ≥ 0.999, moderado ≥ 0.95).
  function supportLevel(p) {
    if (p >= 0.999) return { key: "high", cls: "s-ok", label: "soporte alto" };
    if (p >= 0.95) return { key: "moderate", cls: "s-mid", label: "soporte moderado" };
    return { key: "limited", cls: "s-warn", label: "soporte limitado" };
  }

  // CPI necesario para que la posterior alcance `t` con la probabilidad previa dada.
  function cpiThreshold(t, prior) {
    return (t / (1 - t)) * ((1 - prior) / prior);
  }

  function blockedReason(result) {
    var w = result.warnings.join(" ");
    if (!result.total_markers) return "Sin marcadores útiles: no hay base para el soporte estadístico.";
    if (result.exclusions) return "Bloqueado: hay incongruencias que requieren revisión.";
    if (w.indexOf("PI inválidos") !== -1 || w.indexOf("PI=0") !== -1) return "Bloqueado: revisa los índices (PI) capturados.";
    if (w.indexOf("advertencias críticas") !== -1) return "Bloqueado: advertencias críticas de importación o calidad.";
    return "Sin índices del laboratorio: sólo compatibilidad mendeliana.";
  }

  function decadeLabel(n) {
    var sup = { "-": "⁻", 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" };
    if (n === -1) return "0.1";
    if (n >= 0 && n <= 3) return String(Math.pow(10, n));
    return "10" + String(n).split("").map(function (c) { return sup[c]; }).join("");
  }

  function fmt(x) {
    return (Math.round(x * 100) / 100).toString();
  }

  /* ------------------------------------------------------ escala de soporte */
  function supportScale(result, width) {
    var W = Math.max(280, Math.round(width));
    var compact = W < 560;
    var H = 104;
    var prior = result.prior_probability_used;
    var l95 = Math.log10(cpiThreshold(0.95, prior));
    var l999 = Math.log10(cpiThreshold(0.999, prior));
    var cpi = result.cpi;
    var valid = cpi !== null && Number.isFinite(cpi) && cpi > 0;
    var lc = valid ? Math.log10(cpi) : null;
    var lo = Math.floor(Math.min(-1, l95 - 2, valid ? lc - 1 : 0));
    var hi = Math.ceil(Math.max(6, l999 + 2, valid ? lc + 1 : 0));
    hi = Math.min(hi, lo + 40);
    var padL = 12;
    var padR = 12;
    var x = function (v) { return padL + ((v - lo) / (hi - lo)) * (W - padL - padR); };
    var clampX = function (v) { return x(Math.max(lo, Math.min(hi, v))); };
    var bandY = 36;
    var bandH = 26;
    var aria = valid
      ? "Escala de soporte: CPI " + formatCpi(cpi) + ", probabilidad posterior " + formatPosterior(result.posterior_probability, 2) +
        ", " + supportLevel(result.posterior_probability).label + "."
      : "Escala de soporte sin CPI. " + blockedReason(result);
    var s = '<svg class="scale' + (valid ? "" : " is-off") + '" viewBox="0 0 ' + W + " " + H + '" width="' + W + '" height="' + H +
      '" role="img" aria-label="' + esc(aria) + '">';

    var zones = [
      ["zone-limited", lo, l95, "limitado", "limitado · < 95 %"],
      ["zone-moderate", l95, l999, "moderado", "moderado · 95–99.9 %"],
      ["zone-high", l999, hi, "alto", "alto · ≥ 99.9 %"],
    ];
    var textW = function (text) { return Array.from(text).length * 7 + 16; };
    var pinX = valid ? clampX(lc) : null;
    zones.forEach(function (z, i) {
      var x0 = clampX(z[1]);
      var x1 = clampX(z[2]);
      if (x1 - x0 < 1) return;
      s += '<rect class="' + z[0] + '" x="' + fmt(x0) + '" y="' + bandY + '" width="' + fmt(x1 - x0) + '" height="' + bandH + '"' +
        (i === 0 ? ' rx="6"' : i === 2 ? ' rx="6"' : "") + "/>";
      // tramos libres de la zona: si el pin cae dentro, la etiqueta va al lado con más espacio
      var spans = pinX !== null && pinX > x0 && pinX < x1 ? [[x0, pinX - 8], [pinX + 8, x1]] : [[x0, x1]];
      spans.sort(function (a, b) { return (b[1] - b[0]) - (a[1] - a[0]); });
      var room = spans[0];
      var text = [z[4], z[3]].filter(function (t) { return textW(t) <= room[1] - room[0]; })[0];
      if (text) {
        s += '<text class="zone-label ' + z[0] + '-text" x="' + fmt((room[0] + room[1]) / 2) + '" y="' + (bandY + 17) + '" text-anchor="middle">' + esc(text) + "</text>";
      }
    });
    // esquinas interiores rectas: tapar los redondeos entre zonas
    [l95, l999].forEach(function (v) {
      var xv = clampX(v);
      s += '<line class="zone-sep" x1="' + fmt(xv) + '" y1="' + bandY + '" x2="' + fmt(xv) + '" y2="' + (bandY + bandH) + '"/>';
    });

    // ticks de décadas
    var step = hi - lo > (compact ? 8 : 14) ? 2 : 1;
    for (var d = lo; d <= hi; d++) {
      var xd = x(d);
      s += '<line class="axis-tick" x1="' + fmt(xd) + '" y1="' + (bandY + bandH + 2) + '" x2="' + fmt(xd) + '" y2="' + (bandY + bandH + 6) + '"/>';
      if ((d - lo) % step === 0) {
        var anchor = d === lo ? "start" : d === hi ? "end" : "middle";
        s += '<text class="axis-label" x="' + fmt(xd) + '" y="' + (bandY + bandH + 19) + '" text-anchor="' + anchor + '">' + decadeLabel(d) + "</text>";
      }
    }
    s += '<text class="axis-caption" x="' + (W - padR) + '" y="' + (H - 2) + '" text-anchor="end">CPI (escala logarítmica)</text>';

    if (valid) {
      var xc = clampX(lc);
      var label = "CPI " + formatCpi(cpi) + " · " + formatPosterior(result.posterior_probability, 2);
      var anchorPin = xc < W * 0.18 ? "start" : xc > W * 0.82 ? "end" : "middle";
      var tx = anchorPin === "start" ? xc - 4 : anchorPin === "end" ? xc + 4 : xc;
      s += '<line class="pin-line" x1="' + fmt(xc) + '" y1="' + (bandY - 14) + '" x2="' + fmt(xc) + '" y2="' + (bandY + bandH + 4) + '"/>';
      s += '<circle class="pin-dot" cx="' + fmt(xc) + '" cy="' + (bandY + bandH / 2) + '" r="6"/>';
      s += '<text class="pin-label" x="' + fmt(tx) + '" y="' + (bandY - 20) + '" text-anchor="' + anchorPin + '">' + esc(label) + "</text>";
    } else {
      s += '<text class="off-label" x="' + fmt(W / 2) + '" y="' + (bandY - 12) + '" text-anchor="middle">' + esc(blockedReason(result)) + "</text>";
    }
    return s + "</svg>";
  }

  /* ---------------------------------------------------- carril de marcadores */
  function markerLane(result, width) {
    var W = Math.max(200, Math.round(width));
    var barH = 18;
    var n = result.markers.length;
    if (!n) return "";
    var gap = n <= 60 ? 3 : n <= 240 ? 1 : 0;
    var w = (W - gap * (n - 1)) / n;
    var labels = w >= 40;
    var H = labels ? barH + 18 : barH;
    var s = '<svg class="lane" viewBox="0 0 ' + W + " " + H + '" width="' + W + '" height="' + H +
      '" role="img" aria-label="Carril de marcadores: un segmento por marcador, coloreado por estado.">';
    result.markers.forEach(function (m, i) {
      var klass = E.statusClass(m);
      var x0 = i * (w + gap);
      s += '<rect class="lane-' + klass + '" x="' + fmt(x0) + '" y="0" width="' + fmt(Math.max(w, 0.6)) + '" height="' + barH + '" rx="' +
        (w > 6 ? 3 : 0) + '"><title>' + esc(m.marker + " · " + E.statusLabel(m)) + "</title></rect>";
      if (labels) {
        s += '<text class="ln-label" x="' + fmt(x0 + w / 2) + '" y="' + (barH + 13) + '" text-anchor="middle">' +
          esc(fitLabel(m.marker, Math.floor(w / 6.6))) + "</text>";
      }
    });
    return s + "</svg>";
  }

  /* --------------------------------------------- electroferograma comparado */
  var NUMERIC = /^\d+(?:\.\d+)?$/;

  function uniq(list) {
    var seen = new Set();
    return list.filter(function (a) {
      if (seen.has(a)) return false;
      seen.add(a);
      return true;
    });
  }

  function countOf(list, a) {
    return list.filter(function (b) { return b === a; }).length;
  }

  function peakPath(x, base, h, hw) {
    var top = base - h;
    return "M" + fmt(x - hw) + " " + base + "C" + fmt(x - hw * 0.42) + " " + base + " " + fmt(x - hw * 0.34) + " " + fmt(top) + " " +
      fmt(x) + " " + fmt(top) + "C" + fmt(x + hw * 0.34) + " " + fmt(top) + " " + fmt(x + hw * 0.42) + " " + base + " " + fmt(x + hw) + " " + base + "Z";
  }

  function fitLabel(text, maxChars) {
    var chars = Array.from(text);
    if (chars.length <= maxChars) return text;
    return chars.slice(0, Math.max(1, maxChars - 1)).join("") + "…";
  }

  function trace(m, width) {
    var W = Math.max(180, Math.round(width));
    var H = 88;
    var base = 44;
    var peakMax = 26;
    var hw = 10;
    var informative = m.paternity_informative;
    var child = m.child;
    var parent = m.alleged_parent;
    var all = uniq(child.concat(parent));
    var parentSet = new Set(parent);
    var shared = new Set(informative ? child.filter(function (a) { return parentSet.has(a); }) : []);
    var klass = E.statusClass(m);
    var aria =
      "Hijo/a: " + (child.join(", ") || "sin datos") + ". Progenitor/a alegado/a: " + (parent.join(", ") || "sin datos") + "." +
      (shared.size ? " Comparten: " + Array.from(shared).join(", ") + "." : informative && child.length && parent.length ? " No comparten alelos." : "");
    var s = '<svg class="trace trace-' + klass + '" viewBox="0 0 ' + W + " " + H + '" width="' + W + '" height="' + H +
      '" role="img" aria-label="' + esc(aria) + '">';

    // marcas laterales ▲ hijo/a, ▼ progenitor/a
    s += '<path class="side-child" d="M4 ' + (base - 10) + "l4 -7 4 7z" + '"/>';
    s += '<path class="side-parent" d="M4 ' + (base + 10) + "l4 7 4 -7z" + '"/>';

    var left = 22;
    var right = W - 10;
    var xs = {};
    var numeric = all.length > 0 && all.every(function (a) { return NUMERIC.test(a); });
    if (numeric) {
      // eje de repeticiones: posición proporcional al valor del alelo
      var vals = all.map(Number);
      var mn = Math.min.apply(null, vals);
      var mx = Math.max.apply(null, vals);
      var margin = Math.max(1, (mx - mn) * 0.18);
      var lo = mn - margin;
      var hi = mx + margin;
      all.forEach(function (a) { xs[a] = left + ((Number(a) - lo) / (hi - lo)) * (right - left); });
      if (hi - lo <= 40) {
        for (var r = Math.ceil(lo); r <= Math.floor(hi); r++) {
          var xr = left + ((r - lo) / (hi - lo)) * (right - left);
          s += '<line class="tr-tick" x1="' + fmt(xr) + '" y1="' + (base - 2) + '" x2="' + fmt(xr) + '" y2="' + (base + 2) + '"/>';
        }
      }
    } else {
      // bases, haplotipos o secuencias: posiciones equidistantes en orden
      var ordered = all.slice().sort(function (a, b) { return a.localeCompare(b, "es"); });
      var step = (right - left) / Math.max(1, ordered.length);
      ordered.forEach(function (a, i) { xs[a] = left + (i + 0.5) * step; });
    }
    var positions = all.map(function (a) { return xs[a]; }).sort(function (a, b) { return a - b; });
    var spacing = right - left;
    for (var p = 1; p < positions.length; p++) spacing = Math.min(spacing, positions[p] - positions[p - 1]);
    var maxChars = Math.max(3, Math.floor(Math.max(spacing, 26) / 6.6));

    s += '<line class="tr-base' + (klass === "bad" ? " is-bad" : "") + '" x1="' + left + '" y1="' + base + '" x2="' + right + '" y2="' + base + '"/>';

    // banda que une el alelo compartido arriba y abajo (detrás de los picos)
    shared.forEach(function (a) {
      s += '<rect class="tr-link" x="' + fmt(xs[a] - hw - 4) + '" y="' + (base - peakMax - 2) + '" width="' + (2 * hw + 8) + '" height="' +
        (2 * peakMax + 4) + '" rx="5"/>';
    });

    function side(list, up) {
      if (!list.length) {
        var yEmpty = up ? base - 12 : base + 18;
        return '<text class="tr-empty" x="' + fmt((left + right) / 2) + '" y="' + yEmpty + '" text-anchor="middle">sin datos</text>';
      }
      var out = "";
      uniq(list).forEach(function (a) {
        var h = peakMax * (countOf(list, a) >= 2 ? 1 : 0.8);
        var cls = !informative ? "pk-skip" : shared.has(a) ? "pk-shared" : up ? "pk-child" : "pk-parent";
        var path = peakPath(xs[a], base, up ? h : -h, hw);
        out += '<path class="pk ' + cls + (up ? " pk-up" : " pk-down") + '" d="' + path + '"/>';
        var ly = up ? base - h - 5 : base + h + 13;
        out += '<text class="tr-label' + (shared.has(a) ? " is-shared" : "") + '" x="' + fmt(xs[a]) + '" y="' + fmt(ly) + '" text-anchor="middle">' +
          esc(fitLabel(a, maxChars)) + (Array.from(a).length > maxChars ? "<title>" + esc(a) + "</title>" : "") + "</text>";
      });
      return out;
    }
    s += side(child, true);
    s += side(parent, false);
    return s + "</svg>";
  }

  /* ------------------------------------------------------------------ peso */
  function weightScale(result) {
    var logs = result.markers
      .filter(function (m) { return m.pi !== null && m.pi > 0 && m.paternity_informative && m.compatible === true; })
      .map(function (m) { return Math.abs(Math.log10(m.pi)); });
    return Math.max(0.3, Math.max.apply(null, [0].concat(logs)));
  }

  function weight(m, scale, width) {
    if (m.pi === null) return "";
    var W = Math.max(60, Math.round(width));
    var H = 12;
    var mid = W / 2;
    var used = m.paternity_informative && m.compatible === true;
    var log = m.pi > 0 ? Math.log10(m.pi) : -scale;
    var len = Math.max(2, (Math.min(Math.abs(log), scale) / scale) * (mid - 1));
    var positive = m.pi >= 1;
    var cls = !used ? "w-off" : positive ? "w-pos" : "w-neg";
    var s = '<svg class="weight" viewBox="0 0 ' + W + " " + H + '" width="' + W + '" height="' + H + '" aria-hidden="true">';
    s += '<rect class="w-track" x="0" y="4" width="' + W + '" height="4" rx="2"/>';
    s += '<rect class="' + cls + '" x="' + fmt(positive ? mid : mid - len) + '" y="2" width="' + fmt(len) + '" height="8" rx="2"/>';
    s += '<line class="w-axis" x1="' + fmt(mid) + '" y1="0" x2="' + fmt(mid) + '" y2="' + H + '"/>';
    return s + "</svg>";
  }

  root.AriadnaCharts = {
    formatCpi: formatCpi,
    formatPosterior: formatPosterior,
    supportLevel: supportLevel,
    cpiThreshold: cpiThreshold,
    blockedReason: blockedReason,
    supportScale: supportScale,
    markerLane: markerLane,
    trace: trace,
    weightScale: weightScale,
    weight: weight,
  };
})(typeof self !== "undefined" ? self : this);

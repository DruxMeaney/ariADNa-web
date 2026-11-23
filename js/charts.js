/*!
 * ariADNa — visualizaciones (SVG generado, sin dependencias)
 *
 *  - supportFigure: una sola figura sobre el eje log del CPI: zonas de lectura, aporte de cada
 *                   marcador (franja de composición), eje del CPI y eje de probabilidad posterior.
 *  - priorStrip:    con qué probabilidades previas cambiaría la lectura para el CPI capturado.
 *  - alleleGlyph:   esquema espejo de un marcador (hijo/a arriba, progenitor/a abajo). La altura
 *                   NO representa señal del equipo; la posición indica el alelo.
 *  - laneNav:       carril navegable, un trazo por marcador codificado por color y forma.
 *  - piAxis/piBar:  índice del laboratorio en escala logarítmica que empieza en PI = 1.
 *
 * Todas reciben el ancho real del contenedor (1 unidad = 1 px). Los colores salen de clases CSS
 * (la CSP no permite estilos en línea).
 */
(function (root) {
  "use strict";
  var E = root.AriadnaEngine;
  var esc = E.escapeHtml;
  var keyOf = E.alleleKey || function (a) { return a; };

  var SUP = { "-": "⁻", 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" };

  function fmt(x) {
    return (Math.round(x * 100) / 100).toString();
  }

  function chars(text) {
    return Array.from(String(text)).length;
  }

  /* ------------------------------------------------------------ formatos */
  // Forma larga, idéntica a la del resumen de texto y el reporte exportado.
  function formatCpi(value) {
    if (value === 0) return "0";
    if (!Number.isFinite(value)) return "—";
    var a = Math.abs(value);
    if (a >= 0.001 && a < 1e6) return E.pyFormatG(value, 6);
    return E.pyFormatE(value, 3);
  }

  // Forma corta para pantalla a partir de log10(CPI): "431", "3.4 × 10⁸". Nunca "inf".
  function cpiShortFromLog(lc) {
    if (lc === null || Number.isNaN(lc)) return "—";
    if (lc >= -2 && lc < 5) return String(Number(Math.pow(10, lc).toPrecision(3)));
    var e = Math.floor(lc);
    var mant = Math.pow(10, lc - e);
    if (Number(mant.toFixed(1)) >= 10) {
      mant = 1;
      e += 1;
    }
    return mant.toFixed(1) + " × 10" + String(e).split("").map(function (c) { return SUP[c]; }).join("");
  }

  function cpiShort(value) {
    if (value === 0) return "0";
    if (value === null || !(value > 0)) return "—";
    return cpiShortFromLog(Math.log10(value));
  }

  // Posterior en pantalla: nunca "100 %", nunca "0 %", nunca "nan"; y el número mostrado
  // no cruza un umbral (95 % / 99.9 %) que el valor real no alcanzó.
  function formatPosterior(p, decimals) {
    if (p === null || p === undefined || !Number.isFinite(p)) return "—";
    var unit = Math.pow(10, -decimals);
    var text = E.pyFormatF(p * 100, decimals);
    var shown = Number.parseFloat(text);
    if (shown >= 100) return ">" + E.pyFormatF(100 - unit, decimals) + " %";
    if (shown <= 0) return "<" + E.pyFormatF(unit, decimals) + " %";
    [[95, 0.95], [99.9, 0.999]].forEach(function (t) {
      if (shown >= t[0] && p < t[1]) text = E.pyFormatF(t[0] - unit, decimals);
    });
    return text + " %";
  }

  // Valores "redondos" de probabilidad para rotular el eje: 50 %, 99 %, 99.99 %…
  function nines(p) {
    var pct = p * 100;
    if (p < 0.99) return (Math.round(pct * 10) / 10).toString() + " %";
    var d = Math.max(0, Math.ceil(-Math.log10(1 - p) - 1e-9) - 2);
    return pct.toFixed(d) + " %";
  }

  // Mismos umbrales que la conclusión de triaje (alto ≥ 0.999, moderado ≥ 0.95).
  function supportLevel(p) {
    if (p === null || p === undefined || Number.isNaN(p)) return { key: "unknown", label: "soporte no calculable" };
    if (p >= 0.999) return { key: "high", label: "soporte alto" };
    if (p >= 0.95) return { key: "moderate", label: "soporte moderado" };
    return { key: "limited", label: "soporte limitado" };
  }

  // CPI necesario para que la posterior alcance `t` con la probabilidad previa dada.
  function cpiThreshold(t, prior) {
    return (t / (1 - t)) * ((1 - prior) / prior);
  }

  function blockedReason(result) {
    var w = result.warnings.join(" ");
    if (!result.total_markers) return "Sin marcadores útiles: no hay base para el soporte estadístico.";
    if (result.exclusions) return "Bloqueado: hay incongruencias que requieren revisión.";
    if (w.indexOf("marcadores repetidos") !== -1) return "Bloqueado: hay marcadores repetidos.";
    if (w.indexOf("PI inválidos") !== -1 || w.indexOf("PI=0") !== -1) return "Bloqueado: revisa los índices (PI) capturados.";
    if (w.indexOf("advertencias críticas") !== -1) return "Bloqueado: advertencias críticas de importación o calidad.";
    return "Sin índices del laboratorio: sólo compatibilidad mendeliana.";
  }

  /* ------------------------------------------------------------- soporte */
  function isUsed(m) {
    return m.pi !== null && m.pi > 0 && m.paternity_informative && m.compatible === true;
  }

  function usedMarkers(result) {
    var out = [];
    result.markers.forEach(function (m, i) {
      if (isUsed(m)) out.push({ m: m, i: i, l: Math.log10(m.pi) });
    });
    return out;
  }

  // Lectura numérica robusta: trabaja en logaritmos, así un CPI enorme no se vuelve "inf"/"nan".
  function support(result) {
    if (result.cpi === null) return null;
    var used = usedMarkers(result);
    if (!used.length) return null;
    var prior = result.prior_probability_used;
    var finite = Number.isFinite(result.cpi) && result.cpi > 0;
    var lc = finite ? Math.log10(result.cpi) : used.reduce(function (s, o) { return s + o.l; }, 0);
    var p = result.posterior_probability;
    if (p === null || !Number.isFinite(p) || !finite) p = 1 / (1 + Math.pow(10, -(lc + Math.log10(prior / (1 - prior)))));
    return { used: used, prior: prior, log10Cpi: lc, posterior: p, level: supportLevel(p), degenerate: !finite };
  }

  function supportFigure(result, width) {
    var sup = support(result);
    if (!sup) return "";
    var W = Math.max(264, Math.round(width));
    var compact = W < 560;
    var prior = sup.prior;
    var thr = function (t) { return Math.log10(cpiThreshold(t, prior)); };
    var l95 = thr(0.95);
    var l999 = thr(0.999);
    var lc = sup.log10Cpi;
    var lo = Math.floor(Math.min(-1, l95 - 1, lc - 0.5));
    var hi = Math.ceil(Math.max(l999 + 1, lc + 0.5));
    if (hi - lo < 4) hi = lo + 4;
    var offScale = false;
    if (hi - lo > 40) {
      // rango enorme: se conserva la parte legible y el pin se marca "fuera de escala"
      lo = Math.floor(Math.min(-1, l95 - 1));
      hi = lo + 40;
      offScale = lc > hi || lc < lo;
    }
    var gl = compact ? 10 : 132;
    var gr = 14;
    var x = function (v) { return gl + ((v - lo) / (hi - lo)) * (W - gl - gr); };
    var cx = function (v) { return x(Math.max(lo, Math.min(hi, v))); };

    var pos = sup.used.filter(function (o) { return o.l > 0; }).sort(function (a, b) { return b.l - a.l; });
    var neg = sup.used.filter(function (o) { return o.l < 0; }).sort(function (a, b) { return a.l - b.l; });
    var bandY = 24;
    var bandH = 14;
    var stripY = 46;
    var stripH = compact ? 10 : 16;
    var negY = stripY + stripH + 2;
    var negH = 6;
    var axisY = (neg.length ? negY + negH : stripY + stripH) + 6;
    var H = axisY + 40;

    var pinText = "CPI " + cpiShortFromLog(lc) + " · " + formatPosterior(sup.posterior, 2);
    var aria = "Soporte estadístico: " + pinText + ", " + sup.level.label + ". Umbrales con previa " + E.pyFormatF(prior, 2) +
      ": moderado desde CPI " + cpiShortFromLog(l95) + ", alto desde CPI " + cpiShortFromLog(l999) + ".";
    var s = '<svg class="sup" viewBox="0 0 ' + W + " " + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="' + esc(aria) + '">';

    // zonas de lectura: rampa de luminosidad (dato ordenado), con la palabra cuando cabe
    [["zone-limited", lo, l95, "limitado"], ["zone-moderate", l95, l999, "moderado"], ["zone-high", l999, hi, "alto"]].forEach(function (z) {
      var x0 = cx(z[1]);
      var x1 = cx(z[2]);
      if (x1 - x0 < 1) return;
      s += '<rect class="' + z[0] + '" x="' + fmt(x0) + '" y="' + bandY + '" width="' + fmt(x1 - x0) + '" height="' + bandH + '"/>';
      if (x1 - x0 > z[3].length * 6.6 + 10) {
        s += '<text class="zone-label ' + z[0] + '-text" x="' + fmt((x0 + x1) / 2) + '" y="' + (bandY + 10.5) + '" text-anchor="middle">' + z[3] + "</text>";
      }
    });
    // umbrales (línea discontinua a través de todas las filas) y punto neutro CPI = 1
    [l95, l999].forEach(function (v) {
      if (v < lo || v > hi) return;
      s += '<line class="thr" x1="' + fmt(x(v)) + '" y1="' + (bandY - 3) + '" x2="' + fmt(x(v)) + '" y2="' + (axisY + 4) + '"/>';
    });
    s += '<line class="neutral" x1="' + fmt(x(0)) + '" y1="' + (stripY - 3) + '" x2="' + fmt(x(0)) + '" y2="' + (axisY + 4) + '"/>';

    // franja de composición: de CPI = 1 hasta el pin, un segmento por índice usado
    var segs = pos.map(function (o) { return { items: [o], l: o.l }; });
    var pxPerDecade = (W - gl - gr) / (hi - lo);
    var firstSmall = segs.findIndex(function (g) { return g.l * pxPerDecade < 3; });
    if (firstSmall !== -1 && segs.length - firstSmall > 1) {
      var tail = segs.slice(firstSmall);
      segs = segs.slice(0, firstSmall).concat([{
        items: tail.map(function (g) { return g.items[0]; }),
        l: tail.reduce(function (t, g) { return t + g.l; }, 0),
      }]);
    }
    var cur = 0;
    segs.forEach(function (g, k) {
      var x0 = cx(cur);
      var x1 = cx(cur + g.l);
      var w = x1 - x0;
      var single = g.items.length === 1;
      var name = single ? g.items[0].m.marker : "resto · " + g.items.length + " marcadores";
      var title = single ? name + " · PI " + E.pyRepr(g.items[0].m.pi) : name;
      s += '<rect class="cs ' + (k % 2 ? "cs-b" : "cs-a") + '"' + (single ? ' data-i="' + g.items[0].i + '"' : "") + ' x="' + fmt(x0) + '" y="' + stripY +
        '" width="' + fmt(Math.max(0.5, w - (w > 4 ? 1 : 0))) + '" height="' + stripH + '"><title>' + esc(title) + "</title></rect>";
      if (!compact && w > chars(name) * 6.1 + 8) {
        s += '<text class="cs-t" x="' + fmt(x0 + (w - 1) / 2) + '" y="' + (stripY + 11.5) + '" text-anchor="middle">' + esc(name) + "</text>";
      }
      cur += g.l;
    });
    neg.forEach(function (o) {
      var x1 = cx(cur);
      var x0 = cx(cur + o.l);
      s += '<rect class="cs-neg" data-i="' + o.i + '" x="' + fmt(x0) + '" y="' + negY + '" width="' + fmt(Math.max(2, x1 - x0)) + '" height="' + negH +
        '"><title>' + esc(o.m.marker + " · PI " + E.pyRepr(o.m.pi) + " (resta)") + "</title></rect>";
      cur += o.l;
    });

    // eje del CPI: décadas
    var maxLabels = Math.max(2, Math.floor((W - gl - gr) / 46));
    var step = Math.max(1, Math.ceil((hi - lo) / (maxLabels - 1)));
    for (var d = lo; d <= hi; d++) {
      s += '<line class="axis-tick" x1="' + fmt(x(d)) + '" y1="' + axisY + '" x2="' + fmt(x(d)) + '" y2="' + (axisY + 4) + '"/>';
      if ((d - lo) % step !== 0) continue;
      var anchor = d === hi ? "end" : d === lo ? "start" : "middle";
      var lab = d >= -2 && d <= 3 ? String(Number(Math.pow(10, d).toPrecision(1))) : null;
      s += '<text class="axis-label" x="' + fmt(x(d)) + '" y="' + (axisY + 16) + '" text-anchor="' + anchor + '">' +
        (lab !== null ? lab : '10<tspan class="sup-n" dy="-4">' + d + "</tspan>") + "</text>";
    }
    // eje de probabilidad posterior: umbrales primero, luego la previa, luego valores redondos si caben
    var cand = [[0.95, true, null], [0.999, true, null], [prior, false, "previa " + nines(prior)]];
    [0.5, 0.9, 0.99, 0.9999, 0.99999, 0.999999].forEach(function (p) { cand.push([p, false, null]); });
    var placed = [];
    cand.forEach(function (c) {
      var v = thr(c[0]);
      if (v < lo || v > hi) return;
      var label = c[2] || nines(c[0]);
      var wpx = chars(label) * 6.3 + 10;
      var px = Math.min(W - gr - wpx / 2 + 5, Math.max(gl + wpx / 2 - 5, x(v)));
      if (placed.some(function (q) { return Math.abs(q.x - px) < (q.w + wpx) / 2; })) return;
      placed.push({ x: px, w: wpx });
      s += '<text class="axis-label' + (c[1] ? " is-strong" : "") + '" x="' + fmt(px) + '" y="' + (axisY + 32) + '" text-anchor="middle">' + esc(label) + "</text>";
    });
    if (!compact) {
      [["Lectura", bandY + 10.5], ["Aporte por marcador", stripY + 11.5], ["CPI (escala log)", axisY + 16], ["Prob. posterior", axisY + 32]].forEach(function (c) {
        s += '<text class="axis-caption" x="' + (gl - 12) + '" y="' + c[1] + '" text-anchor="end">' + c[0] + "</text>";
      });
    }

    // pin: etiqueta acotada al lienzo + cuña sobre la banda + guía bajo la banda
    var xc = cx(lc);
    var label = (offScale ? (lc > hi ? "fuera de escala → " : "← fuera de escala ") : "") + pinText;
    var half = chars(label) * 7.4 / 2 + 2;
    var tx = Math.min(W - half, Math.max(half, xc));
    s += '<line class="pin-line" x1="' + fmt(xc) + '" y1="' + (bandY + bandH + 1) + '" x2="' + fmt(xc) + '" y2="' + (axisY + 4) + '"/>';
    s += '<path class="pin-caret" d="M' + fmt(xc - 5) + " " + (bandY - 9) + 'h10l-5 7z"/>';
    s += '<text class="pin-label" x="' + fmt(tx) + '" y="11" text-anchor="middle">' + esc(label) + "</text>";
    return s + "</svg>";
  }

  function times(factor) {
    if (factor < 10) return (Math.round(factor * 10) / 10).toString();
    return cpiShort(factor);
  }

  // Frases que dicen la lectura con palabras; sólo usan campos del resultado.
  function supportSentences(result) {
    var sup = support(result);
    if (!sup) return null;
    var prior = sup.prior;
    var l95 = Math.log10(cpiThreshold(0.95, prior));
    var l999 = Math.log10(cpiThreshold(0.999, prior));
    var lc = sup.log10Cpi;
    var distance;
    if (sup.level.key === "high") {
      distance = "El CPI capturado supera el umbral de soporte alto (CPI ≥ " + cpiShortFromLog(l999) + ") por un factor de " + times(Math.pow(10, lc - l999)) + ".";
    } else if (sup.level.key === "moderate") {
      distance = "Para soporte alto (≥ 99.9 %) haría falta CPI ≥ " + cpiShortFromLog(l999) + ": " + times(Math.pow(10, l999 - lc)) + " veces el capturado.";
    } else {
      distance = "Para soporte moderado (≥ 95 %) haría falta CPI ≥ " + cpiShortFromLog(l95) + ": " + times(Math.pow(10, l95 - lc)) + " veces el capturado.";
    }

    var pos = sup.used.filter(function (o) { return o.l > 0; }).sort(function (a, b) { return b.l - a.l; });
    var sumPos = pos.reduce(function (t, o) { return t + o.l; }, 0);
    var composition = "";
    var alert = false;
    if (sup.used.length === 1) {
      composition = "El CPI proviene de un solo índice (" + sup.used[0].m.marker + ", PI " + E.pyRepr(sup.used[0].m.pi) + ").";
    } else if (pos.length) {
      var top = pos[0];
      var share = Math.round((top.l / sumPos) * 100);
      alert = share >= 40 && sup.used.length >= 4;
      composition = alert
        ? top.m.marker + " aporta por sí solo el " + share + " % del peso del CPI (PI " + E.pyRepr(top.m.pi) + "): verifica su transcripción."
        : sup.used.length + " índices; el de mayor peso (" + top.m.marker + ", PI " + E.pyRepr(top.m.pi) + ") aporta el " + share + " % del peso del CPI.";
    }

    // previa necesaria para cada lectura con el CPI capturado
    var need = function (t) { return 1 / (1 + Math.pow(10, lc) * (1 - t) / t); };
    var p95 = need(0.95);
    var p999 = need(0.999);
    var f2 = function (p) { return E.pyFormatF(p, 2); };
    var priorText;
    if (p999 <= 0.01) priorText = "Con este CPI la lectura sería «alto» con cualquier previa entre 0.01 y 0.99.";
    else if (p95 >= 0.99) priorText = "Con este CPI la lectura sería «limitado» con cualquier previa entre 0.01 y 0.99.";
    else if (p999 >= 0.99) priorText = "Con este CPI la lectura sería «moderado» con previas ≥ " + f2(p95) + " y «limitado» por debajo; no llegaría a «alto» con ninguna previa hasta 0.99.";
    else if (p95 < 0.01) priorText = "Con este CPI la lectura sería «alto» con previas ≥ " + f2(p999) + " y «moderado» por debajo.";
    else priorText = "Con este CPI la lectura sería «alto» con previas ≥ " + f2(p999) + ", «moderado» desde " + f2(p95) + " y «limitado» por debajo.";

    return { distance: distance, composition: composition, compositionAlert: alert, prior: priorText, p95: p95, p999: p999 };
  }

  // Franja de sensibilidad: eje lineal de la previa (el mismo del deslizador), partido en las tres lecturas.
  function priorStrip(result, width) {
    var sen = supportSentences(result);
    if (!sen || sen.p999 <= 0.01 || sen.p95 >= 0.99) return "";
    var W = Math.max(264, Math.round(width));
    var compact = W < 560;
    var gl = compact ? 10 : 132;
    var gr = 14;
    var prior = result.prior_probability_used;
    var x = function (p) { return gl + p * (W - gl - gr); };
    var H = 34;
    var s = '<svg class="pri" viewBox="0 0 ' + W + " " + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="' + esc(sen.prior) + '">';
    [["zone-limited", 0, sen.p95], ["zone-moderate", sen.p95, sen.p999], ["zone-high", sen.p999, 1]].forEach(function (z) {
      var x0 = x(z[1]);
      var x1 = x(z[2]);
      if (x1 - x0 >= 0.5) s += '<rect class="' + z[0] + '" x="' + fmt(x0) + '" y="6" width="' + fmt(x1 - x0) + '" height="8"/>';
    });
    var ends = [[0, "0", "start"], [1, "1", "end"]];
    [sen.p95, sen.p999].forEach(function (p) {
      if (p < 0.005 || p > 0.995) return;
      s += '<line class="thr" x1="' + fmt(x(p)) + '" y1="3" x2="' + fmt(x(p)) + '" y2="18"/>';
      s += '<text class="axis-label is-strong" x="' + fmt(x(p)) + '" y="30" text-anchor="middle">' + E.pyFormatF(p, 2) + "</text>";
      ends = ends.filter(function (e) { return Math.abs(x(e[0]) - x(p)) > 26; });
    });
    ends.forEach(function (e) {
      s += '<text class="axis-label" x="' + fmt(x(e[0])) + '" y="30" text-anchor="' + e[2] + '">' + e[1] + "</text>";
    });
    s += '<path class="pin-caret" d="M' + fmt(x(prior) - 5) + ' 0h10l-5 6z"/>';
    if (!compact) s += '<text class="axis-caption" x="' + (gl - 12) + '" y="14" text-anchor="end">Si la previa fuera…</text>';
    return s + "</svg>";
  }

  /* ------------------------------------------------------ alelos comparados */
  // Posición en "repeticiones" de un alelo STR x.y (y = bases sueltas; motivo de 4 nt salvo excepciones).
  var MOTIF = { PENTAD: 5, PENTAE: 5, D22S1045: 3 };

  function repeatPos(allele, marker) {
    var m = /^(\d+)(?:\.(\d))?$/.exec(allele);
    if (!m) return null;
    var motif = MOTIF[String(marker).toUpperCase().replace(/[^A-Z0-9]/g, "")] || 4;
    return Number(m[1]) + (m[2] ? Math.min(Number(m[2]), motif - 1) / motif : 0);
  }

  function uniq(list) {
    var seen = new Set();
    return list.filter(function (a) {
      if (seen.has(a)) return false;
      seen.add(a);
      return true;
    });
  }

  function isNumericMarker(m) {
    var all = m.child.concat(m.alleged_parent);
    return all.length > 0 && all.every(function (a) { return repeatPos(a, m.marker) !== null; });
  }

  function sharedKeys(m) {
    if (!m.paternity_informative) return new Set();
    var parent = new Set(m.alleged_parent.map(keyOf));
    return new Set(m.child.map(keyOf).filter(function (k) { return parent.has(k); }));
  }

  // Unidad común: los mismos px por repetición en todas las filas (cada fila centrada en su rango).
  function glyphUnit(result, width) {
    var maxSpan = 0;
    result.markers.forEach(function (m) {
      if (!isNumericMarker(m)) return;
      var v = m.child.concat(m.alleged_parent).map(function (a) { return repeatPos(a, m.marker); });
      maxSpan = Math.max(maxSpan, Math.ceil(Math.max.apply(null, v)) - Math.floor(Math.min.apply(null, v)) + 2);
    });
    if (!maxSpan) return 30;
    return Math.max(4, Math.min(30, (Math.round(width) - 16) / maxSpan));
  }

  function midEllipsis(text, maxChars) {
    var list = Array.from(text);
    if (list.length <= maxChars) return text;
    var keep = Math.max(2, maxChars - 1);
    var head = Math.ceil(keep / 2);
    return list.slice(0, head).join("") + "…" + list.slice(list.length - (keep - head)).join("");
  }

  function alleleGlyph(m, unit, width) {
    var W = Math.max(120, Math.round(width));
    var H = 52;
    var base = 26;
    var hw = 6;
    var ph = 10;
    var child = m.child;
    var parent = m.alleged_parent;
    var klass = E.statusClass(m);
    var shared = sharedKeys(m);
    var isShared = function (a) { return shared.has(keyOf(a)); };
    var sharedList = uniq(child.filter(isShared));
    var aria =
      "Hijo/a: " + (child.join(", ") || "sin datos") + ". Progenitor/a alegado/a: " + (parent.join(", ") || "sin datos") + "." +
      (sharedList.length ? " Comparten: " + sharedList.join(", ") + "." : m.paternity_informative && child.length && parent.length ? " No comparten alelos." : "");
    var s = '<svg class="ag ag-' + klass + '" viewBox="0 0 ' + W + " " + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="' + esc(aria) + '">';

    // una posición por alelo distinto (según la clave de comparación del motor)
    var keys = uniq(child.concat(parent).map(keyOf));
    var labelOf = {};
    child.concat(parent).forEach(function (a) { if (labelOf[keyOf(a)] === undefined) labelOf[keyOf(a)] = a; });
    if (!keys.length) {
      return s + '<text class="ag-empty" x="' + fmt(W / 2) + '" y="' + (base + 4) + '" text-anchor="middle">sin datos</text></svg>';
    }
    var posOf = {};
    var maxChars = 99;
    var numeric = isNumericMarker(m);
    var x0;
    var x1;
    if (numeric) {
      var v = keys.map(function (k) { return repeatPos(labelOf[k], m.marker); });
      var mn = Math.floor(Math.min.apply(null, v)) - 1;
      var mx = Math.ceil(Math.max.apply(null, v)) + 1;
      var u = Math.min(unit, (W - 16) / (mx - mn));
      x0 = W / 2 - ((mx - mn) / 2) * u;
      x1 = x0 + (mx - mn) * u;
      keys.forEach(function (k, i) { posOf[k] = x0 + (v[i] - mn) * u; });
      s += '<line class="ag-base' + (klass === "bad" ? " is-bad" : "") + '" x1="' + fmt(x0) + '" y1="' + base + '" x2="' + fmt(x1) + '" y2="' + base + '"/>';
      if (u >= 5) {
        for (var t = mn; t <= mx; t++) s += '<circle class="ag-dot" cx="' + fmt(x0 + (t - mn) * u) + '" cy="' + base + '" r="1.3"/>';
      }
    } else {
      // bases, haplotipos o secuencias: casillas equidistantes; la posición no significa distancia
      var ord = keys.slice().sort(function (a, b) { return a.localeCompare(b, "es", { numeric: true }); });
      var slot = Math.min(72, (W - 12) / ord.length);
      x0 = W / 2 - (ord.length * slot) / 2;
      x1 = x0 + ord.length * slot;
      ord.forEach(function (k, i) { posOf[k] = x0 + (i + 0.5) * slot; });
      maxChars = Math.max(3, Math.floor(slot / 5.9));
      s += '<line class="ag-base' + (klass === "bad" ? " is-bad" : "") + '" x1="' + fmt(x0) + '" y1="' + base + '" x2="' + fmt(x1) + '" y2="' + base + '"/>';
    }

    // banda que une el alelo compartido arriba y abajo (detrás de las marcas)
    shared.forEach(function (k) {
      s += '<rect class="ag-link" x="' + fmt(posOf[k] - hw - 3) + '" y="2" width="' + (2 * hw + 6) + '" height="' + (H - 4) + '" rx="4"/>';
    });

    function side(list, up) {
      var out = "";
      var lastX = -99;
      var lastShift = false;
      var seen = uniq(list.map(keyOf)).sort(function (a, b) { return posOf[a] - posOf[b]; });
      seen.forEach(function (k) {
        var n = list.filter(function (b) { return keyOf(b) === k; }).length;
        var cls = !m.paternity_informative ? "pk-skip" : shared.has(k) ? "pk-shared" : up ? "pk-child" : "pk-parent";
        var X = posOf[k];
        var y1 = up ? base - ph : base + ph;
        out += '<path class="pk ' + cls + '" d="M' + fmt(X - hw) + " " + base + "L" + fmt(X) + " " + y1 + "L" + fmt(X + hw) + " " + base + 'z"/>';
        // etiquetas vecinas a menos de 14 px se escalonan para no encimarse
        var shift = X - lastX < 14 && !lastShift;
        var ly = up ? base - ph - 3 - (shift ? 9 : 0) : base + ph + 10 + (shift ? 9 : 0);
        var full = labelOf[k] + (n > 1 ? "×2" : "");
        var text = numeric ? full : midEllipsis(labelOf[k], maxChars) + (n > 1 ? "×2" : "");
        out += '<text class="ag-t' + (shared.has(k) ? " is-shared" : "") + '" x="' + fmt(X) + '" y="' + ly + '" text-anchor="middle">' + esc(text) +
          (text !== full ? "<title>" + esc(full) + "</title>" : "") + "</text>";
        lastX = X;
        lastShift = shift;
      });
      return out;
    }
    s += side(child, true) + side(parent, false);
    return s + "</svg>";
  }

  /* ---------------------------------------------------- carril de marcadores */
  var RANK = { bad: 3, warn: 2, ok: 1, skip: 0 };
  var STATUS_WORD = { ok: "Compatible", bad: "Incongruencia", warn: "Incompleto", skip: "No informativo" };

  // Un trazo por marcador (o por grupo de marcadores cuando no caben), con el peor estado del grupo.
  // Estado por color Y por forma: compatible = barra baja; incongruencia = barra alta; incompleto = caja hueca;
  // no informativo = línea fina.
  function laneNav(result, width) {
    var W = Math.max(200, Math.round(width));
    var H = 22;
    var n = result.markers.length;
    if (!n) return "";
    var bins = Math.max(1, Math.min(n, Math.floor(W / 4)));
    var bw = W / bins;
    var counts = { ok: 0, bad: 0, warn: 0, skip: 0 };
    result.markers.forEach(function (m) { counts[E.statusClass(m)] += 1; });
    var aria = "Carril de marcadores: " + counts.ok + " compatibles, " + counts.bad + " incongruencias, " + counts.warn + " incompletos, " +
      counts.skip + " no informativos.";
    var s = '<svg class="lane" viewBox="0 0 ' + W + " " + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="' + esc(aria) + '">';
    var front = "";
    for (var b = 0; b < bins; b++) {
      var a = Math.floor((b * n) / bins);
      var z = Math.max(a + 1, Math.floor(((b + 1) * n) / bins));
      var worst = E.statusClass(result.markers[a]);
      var idx = a;
      for (var i = a + 1; i < z; i++) {
        var k = E.statusClass(result.markers[i]);
        if (RANK[k] > RANK[worst]) {
          worst = k;
          idx = i;
        }
      }
      var x0 = b * bw;
      var w = Math.max(1, bw - (bw > 5 ? 2 : bw > 3 ? 1 : 0));
      var title = "<title>" + esc(z - a === 1 ? result.markers[idx].marker + " · " + STATUS_WORD[worst] : (z - a) + " marcadores · peor estado: " + STATUS_WORD[worst]) + "</title>";
      if (worst === "ok") s += '<rect class="lane-ok" data-i="' + idx + '" x="' + fmt(x0) + '" y="10" width="' + fmt(w) + '" height="8">' + title + "</rect>";
      else if (worst === "bad") front += '<rect class="lane-bad" data-i="' + idx + '" x="' + fmt(x0) + '" y="0" width="' + fmt(Math.max(3, w)) + '" height="22">' + title + "</rect>";
      else if (worst === "warn") s += '<rect class="lane-warn" data-i="' + idx + '" x="' + fmt(x0 + 0.75) + '" y="5.75" width="' + fmt(Math.max(2.5, w - 1.5)) + '" height="12.5">' + title + "</rect>";
      else s += '<rect class="lane-skip" data-i="' + idx + '" x="' + fmt(x0) + '" y="16" width="' + fmt(w) + '" height="2">' + title + "</rect>";
    }
    return s + front + "</svg>"; // las incongruencias se pintan al final: nunca quedan tapadas
  }

  /* ------------------------------------------------------- índice (PI) */
  // El eje empieza en PI = 1 y termina en la potencia de diez siguiente al mayor PI usado.
  function piAxisMax(result) {
    var top = 1;
    result.markers.forEach(function (m) { if (isUsed(m)) top = Math.max(top, m.pi); });
    return Math.max(10, Math.pow(10, Math.ceil(Math.log10(top) - 1e-9)));
  }

  var PI_RESERVE = 14; // espacio a la izquierda de PI = 1 para los índices menores que 1

  function piX(pi, max, W) {
    return PI_RESERVE + (Math.log10(pi) / Math.log10(max)) * (W - PI_RESERVE - 2);
  }

  function piAxis(max, width) {
    var W = Math.max(60, Math.round(width));
    var ticks = max === 10 ? [1, 2, 5, 10] : [];
    if (!ticks.length) {
      var decades = Math.round(Math.log10(max));
      var stepD = Math.max(1, Math.ceil(decades / 3));
      for (var d = 0; d <= decades; d += stepD) ticks.push(Math.pow(10, d));
      if (ticks[ticks.length - 1] !== max) ticks.push(max);
    }
    var s = '<svg class="pi-axis" viewBox="0 0 ' + W + ' 14" width="' + W + '" height="14" aria-hidden="true">';
    ticks.forEach(function (t, i) {
      var label = t >= 1e4 ? "10" + String(Math.round(Math.log10(t))).split("").map(function (c) { return SUP[c]; }).join("") : String(t);
      s += '<text class="axis-label" x="' + fmt(piX(t, max, W)) + '" y="11" text-anchor="' + (i === ticks.length - 1 ? "end" : i === 0 ? "start" : "middle") + '">' + label + "</text>";
    });
    return s + "</svg>";
  }

  // Barra del índice. Devuelve "" si el marcador no tiene PI o si su PI no entra en el CPI.
  function piBar(m, max, width) {
    if (!isUsed(m)) return "";
    var W = Math.max(60, Math.round(width));
    var one = piX(1, max, W);
    var s = '<svg class="pi-bar" viewBox="0 0 ' + W + ' 12" width="' + W + '" height="12" aria-hidden="true">';
    if (m.pi >= 1) {
      s += '<rect class="w-pos" x="' + fmt(one) + '" y="2" width="' + fmt(Math.max(1, piX(Math.min(m.pi, max), max, W) - one)) + '" height="8" rx="1.5"/>';
    } else {
      var len = Math.max(3, Math.min(1, -Math.log10(m.pi)) * (PI_RESERVE - 2));
      s += '<rect class="w-neg" x="' + fmt(one - len) + '" y="2.75" width="' + fmt(len) + '" height="6.5" rx="1.5"/>';
    }
    s += '<line class="w-axis" x1="' + fmt(one) + '" y1="0" x2="' + fmt(one) + '" y2="12"/>';
    return s + "</svg>";
  }

  root.AriadnaCharts = {
    formatCpi: formatCpi,
    cpiShort: cpiShort,
    cpiShortFromLog: cpiShortFromLog,
    formatPosterior: formatPosterior,
    supportLevel: supportLevel,
    cpiThreshold: cpiThreshold,
    blockedReason: blockedReason,
    isUsed: isUsed,
    support: support,
    supportFigure: supportFigure,
    supportSentences: supportSentences,
    priorStrip: priorStrip,
    repeatPos: repeatPos,
    sharedKeys: sharedKeys,
    glyphUnit: glyphUnit,
    alleleGlyph: alleleGlyph,
    laneNav: laneNav,
    piAxisMax: piAxisMax,
    piAxis: piAxis,
    piBar: piBar,
  };
})(typeof self !== "undefined" ? self : this);

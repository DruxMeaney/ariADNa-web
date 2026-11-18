/*!
 * ariADNa — interfaz web
 * Todo ocurre en el navegador: no hay peticiones de red ni almacenamiento de datos del caso.
 */
(function () {
  "use strict";

  var E = window.AriadnaEngine;
  var R = window.AriadnaReport;
  var C = window.AriadnaCharts;
  var esc = E.escapeHtml;

  var MAX_IMPORT_BYTES = 10 * 1024 * 1024;
  var MAX_IMPORT_ROWS = 5000;
  var DEFAULT_ROWS = 10;
  var ADD_ROWS = 10;
  var PAGE = 200;
  var ASSAYS = ["str_ce", "str_mps", "snp_panel", "microhap"];

  var COLUMNS = {
    str_ce: [
      { key: "marker", label: "Locus", group: "marker" },
      { key: "child_a1", label: "Alelo 1", group: "child", aria: "Hijo/a alelo 1" },
      { key: "child_a2", label: "Alelo 2", group: "child", aria: "Hijo/a alelo 2" },
      { key: "parent_a1", label: "Alelo 1", group: "parent", aria: "Progenitor/a alelo 1" },
      { key: "parent_a2", label: "Alelo 2", group: "parent", aria: "Progenitor/a alelo 2" },
      { key: "pi", label: "Índice laboratorio", group: "pi" },
      { key: "note", label: "Notas", group: "note" },
    ],
    str_mps: [
      { key: "marker", label: "Locus", group: "marker" },
      { key: "child_a1", label: "Secuencia/alelo 1", group: "child", aria: "Hijo/a secuencia/alelo 1" },
      { key: "child_a2", label: "Secuencia/alelo 2", group: "child", aria: "Hijo/a secuencia/alelo 2" },
      { key: "parent_a1", label: "Secuencia/alelo 1", group: "parent", aria: "Progenitor/a secuencia/alelo 1" },
      { key: "parent_a2", label: "Secuencia/alelo 2", group: "parent", aria: "Progenitor/a secuencia/alelo 2" },
      { key: "pi", label: "Índice laboratorio", group: "pi" },
      { key: "note", label: "Notas", group: "note" },
    ],
    snp_panel: [
      { key: "marker", label: "Marcador/rsID", group: "marker" },
      { key: "child_genotype", label: "Genotipo", group: "child", aria: "Hijo/a genotipo" },
      { key: "parent_genotype", label: "Genotipo", group: "parent", aria: "Progenitor/a genotipo" },
      { key: "pi", label: "Índice laboratorio", group: "pi" },
      { key: "note", label: "Notas", group: "note" },
    ],
    microhap: [
      { key: "marker", label: "Microhaplotipo", group: "marker" },
      { key: "child_a1", label: "Haplotipo 1", group: "child", aria: "Hijo/a haplotipo 1" },
      { key: "child_a2", label: "Haplotipo 2", group: "child", aria: "Hijo/a haplotipo 2" },
      { key: "parent_a1", label: "Haplotipo 1", group: "parent", aria: "Progenitor/a haplotipo 1" },
      { key: "parent_a2", label: "Haplotipo 2", group: "parent", aria: "Progenitor/a haplotipo 2" },
      { key: "pi", label: "Índice laboratorio", group: "pi" },
      { key: "note", label: "Notas", group: "note" },
    ],
  };

  var RAW_OUTPUT_TYPES = [
    [
      "STR capilar: electroferograma .fsa/.hid",
      "Salida cruda o semiprocesada del equipo de electroforesis capilar. Para ariADNa pide al laboratorio una tabla por locus con alelos del hijo/a, alelos del progenitor/a alegado/a e índice por locus si aplica.",
    ],
    [
      "MPS/NGS: FASTQ / FASTQ.gz",
      "Lecturas crudas con calidades. Requieren demultiplexado, control de calidad y llamada de alelos, SNP o haplotipos antes de poder usarse aquí.",
    ],
    [
      "MPS/NGS alineado: BAM / CRAM",
      "Lecturas alineadas. Todavía falta llamar genotipos, STR o microhaplotipos y validarlos antes de cargarlos en ariADNa.",
    ],
    [
      "Illumina: BCL",
      "Base calls por ciclo del secuenciador. Normalmente se convierten a FASTQ y luego a genotipos o alelos procesados.",
    ],
    [
      "SNP array: IDAT / CEL / GTC",
      "Intensidades o llamadas propias del array. Pide al laboratorio genotipos en tabla CSV/TSV o VCF.",
    ],
    [
      "PDF, imagen o reporte no estructurado",
      "Sirve para lectura humana, pero no para importar. Pide una tabla CSV/TSV/VCF con marcadores y genotipos/alelos comparables.",
    ],
  ];

  var CHILD_TERMS = ["hijo", "hija", "child", "menor", "descendiente"];
  var PARENT_TERMS = ["progenitor", "padre", "madre", "parent", "father", "mother", "alegado", "alleged"];

  /* ------------------------------------------------------------- estado */
  var state = {
    view: "analysis",
    mode: "processed",
    assay: "str_ce",
    tables: { str_ce: [], str_mps: [], snp_panel: [], microhap: [] },
    visible: PAGE,
    result: null,
    hadResult: false,
    exported: false,
    notice: null,
  };

  /* ---------------------------------------------------------------- DOM */
  function $(id) {
    return document.getElementById(id);
  }
  var dom = {
    tabs: Array.prototype.slice.call(document.querySelectorAll(".tab")),
    views: { analysis: $("view-analysis"), results: $("view-results"), about: $("view-about") },
    resultsDot: $("results-dot"),
    caseId: $("case-id"),
    childId: $("child-id"),
    parentId: $("parent-id"),
    prior: $("prior"),
    priorRange: $("prior-range"),
    priorError: $("prior-error"),
    modeButtons: Array.prototype.slice.call(document.querySelectorAll(".segmented [data-mode]")),
    processedPanel: $("processed-panel"),
    rawPanel: $("raw-panel"),
    rawType: $("raw-type"),
    rawTitle: $("raw-title"),
    rawDesc: $("raw-desc"),
    assay: $("assay"),
    importBtn: $("import-btn"),
    fileInput: $("file-input"),
    examplesMenu: $("examples-menu"),
    examplesPanel: $("examples-panel"),
    noticeSlot: $("notice-slot"),
    grid: $("grid"),
    tableWrap: $("table-wrap"),
    addRows: $("add-rows"),
    showMore: $("show-more"),
    clearTable: $("clear-table"),
    rowCount: $("row-count"),
    dataCard: $("data-card"),
    dropOverlay: $("drop-overlay"),
    actionbar: $("actionbar"),
    status: $("status"),
    statusText: $("status-text"),
    clearCase: $("clear-case"),
    exportBtn: $("export-btn"),
    exportBtn2: $("export-btn-2"),
    analyzeBtn: $("analyze-btn"),
    analyzeKbd: $("analyze-kbd"),
    resultsRoot: $("results-root"),
    resultsActions: $("results-actions"),
    copyBtn: $("copy-btn"),
    helpBtn: $("help-btn"),
    aboutRoot: $("about-root"),
    themeToggle: $("theme-toggle"),
    iconMoon: $("icon-moon"),
    iconSun: $("icon-sun"),
    toast: $("toast"),
    dlgVcf: $("dlg-vcf"),
    vcfChild: $("vcf-child"),
    vcfParent: $("vcf-parent"),
    vcfError: $("vcf-error"),
    vcfOk: $("vcf-ok"),
    dlgExport: $("dlg-export"),
    dlgConfirm: $("dlg-confirm"),
    confirmTitle: $("confirm-title"),
    confirmText: $("confirm-text"),
    confirmOk: $("confirm-ok"),
    dlgHelp: $("dlg-help"),
  };

  /* ------------------------------------------------------------ filas */
  function blankRow() {
    var values = {};
    COLUMNS[state.assay].forEach(function (c) { values[c.key] = ""; });
    return { values: values, warning: "" };
  }

  function blankRowsFor(assay, n) {
    var rows = [];
    for (var i = 0; i < n; i++) {
      var values = {};
      COLUMNS[assay].forEach(function (c) { values[c.key] = ""; });
      rows.push({ values: values, warning: "" });
    }
    return rows;
  }

  function rowHasData(row) {
    return Object.keys(row.values).some(function (k) { return E.pyStrip(row.values[k]) !== ""; });
  }

  function currentTable() {
    return state.tables[state.assay];
  }

  function dataRowCount(assay) {
    return state.tables[assay || state.assay].filter(rowHasData).length;
  }

  function engineRows() {
    var keys = E.CANONICAL_KEYS[state.assay];
    return currentTable()
      .filter(rowHasData)
      .map(function (row) {
        var out = {};
        keys.forEach(function (k) { out[k] = E.pyStrip(row.values[k] || ""); });
        out.validation_warning = row.warning || "";
        return out;
      });
  }

  /* -------------------------------------------------------------- tabla */
  function renderTableHead() {
    var cols = COLUMNS[state.assay];
    var child = cols.filter(function (c) { return c.group === "child"; });
    var parent = cols.filter(function (c) { return c.group === "parent"; });
    var marker = cols[0];
    var pi = cols.filter(function (c) { return c.group === "pi"; })[0];
    var note = cols.filter(function (c) { return c.group === "note"; })[0];
    var h = "<thead>";
    h += '<tr class="groups">';
    h += '<th class="idx rs" rowspan="2" scope="col"><span class="sr-only">Fila</span>#</th>';
    h += '<th class="rs" rowspan="2" scope="col">' + esc(marker.label) + "</th>";
    h += '<th class="g-child g-start" colspan="' + child.length + '" scope="colgroup">Hijo/a</th>';
    h += '<th class="g-start" colspan="' + parent.length + '" scope="colgroup">Progenitor/a alegado/a</th>';
    h += '<th class="rs g-start" rowspan="2" scope="col">' + esc(pi.label) + "</th>";
    h += '<th class="rs" rowspan="2" scope="col">' + esc(note.label) + "</th>";
    h += '<th class="act rs" rowspan="2" scope="col"><span class="sr-only">Acciones</span></th>';
    h += "</tr>";
    h += '<tr class="cols">';
    child.forEach(function (c, i) { h += '<th class="g-child' + (i === 0 ? " g-start" : "") + '" scope="col">' + esc(c.label) + "</th>"; });
    parent.forEach(function (c, i) { h += '<th class="' + (i === 0 ? "g-start" : "") + '" scope="col">' + esc(c.label) + "</th>"; });
    h += "</tr></thead>";
    return h;
  }

  function cellClass(col, cols) {
    var classes = [];
    if (col.group === "child") classes.push("g-child");
    var groupCols = cols.filter(function (c) { return c.group === col.group; });
    if ((col.group === "child" || col.group === "parent" || col.group === "pi") && groupCols[0] === col) classes.push("g-start");
    return classes.join(" ");
  }

  function renderTable() {
    var cols = COLUMNS[state.assay];
    var table = currentTable();
    var shown = Math.min(table.length, state.visible);
    var body = "<tbody>";
    for (var r = 0; r < shown; r++) {
      var row = table[r];
      body += "<tr>";
      var idx = String(r + 1);
      if (row.warning) {
        idx =
          '<span class="warn-mark" title="' + esc("Advertencia de importación: " + row.warning) + '" aria-label="' +
          esc("Advertencia de importación: " + row.warning) + '">⚠</span> ' + idx;
      }
      body += '<td class="idx">' + idx + "</td>";
      cols.forEach(function (c) {
        var aria = (c.aria || c.label) + " · fila " + (r + 1);
        body +=
          '<td class="' + cellClass(c, cols) + '"><input class="cell' + (c.key === "note" ? " note" : "") + '" data-r="' + r +
          '" data-k="' + c.key + '" value="' + esc(row.values[c.key] || "") + '" aria-label="' + esc(aria) +
          '" autocomplete="off" spellcheck="false"></td>';
      });
      body +=
        '<td class="act"><button class="row-del" type="button" data-del="' + r + '" aria-label="Eliminar fila ' + (r + 1) +
        '" title="Eliminar fila">×</button></td>';
      body += "</tr>";
    }
    body += "</tbody>";
    dom.grid.className = "grid-table" + (state.assay === "snp_panel" ? " cols-snp" : "");
    dom.grid.innerHTML = renderTableHead() + body;
    var remaining = table.length - shown;
    dom.showMore.hidden = remaining <= 0;
    if (remaining > 0) dom.showMore.textContent = "Mostrar " + Math.min(PAGE, remaining) + " filas más (quedan " + remaining + ")";
    updateCount();
  }

  function updateCount() {
    var table = currentTable();
    var n = dataRowCount();
    var shown = Math.min(table.length, state.visible);
    var text = n === 1 ? "1 marcador con datos" : n + " marcadores con datos";
    if (shown < table.length) text += " · mostrando " + shown + " de " + table.length + " filas";
    dom.rowCount.textContent = text;
  }

  /* ------------------------------------------------------ aviso en línea */
  function setNotice(notice) {
    state.notice = notice;
    renderNotice();
  }

  function renderNotice() {
    var n = state.notice;
    if (!n) {
      dom.noticeSlot.innerHTML = "";
      return;
    }
    var glyph = { ok: "✓", warn: "!", error: "✕", info: "i" }[n.tone] || "i";
    var h = '<div class="notice ' + n.tone + '"' + (n.tone === "error" ? ' role="alert"' : "") + ">";
    h += '<span class="glyph" aria-hidden="true">' + glyph + "</span><div>";
    h += '<div class="notice-title">' + esc(n.title) + "</div>";
    if (n.body) h += '<div class="notice-body">' + esc(n.body) + "</div>";
    if (n.items && n.items.length) {
      h += '<div class="notice-body"><strong>' + esc(n.itemsTitle || "") + "</strong></div><ul>";
      n.items.forEach(function (item) { h += "<li>" + esc(item) + "</li>"; });
      h += "</ul>";
    }
    h += '</div><button class="close" type="button" data-dismiss aria-label="Cerrar aviso">×</button></div>';
    dom.noticeSlot.innerHTML = h;
  }

  function warningItems(warnings) {
    var unique = [];
    warnings.forEach(function (w) { if (w && unique.indexOf(w) === -1) unique.push(w); });
    var items = unique.slice(0, 5);
    if (unique.length > 5) items.push("Y " + (unique.length - 5) + " advertencia(s) más; revisa notas por marcador.");
    return items;
  }

  /* ------------------------------------------------- estado y botones */
  function updateStatus() {
    var text;
    var cls = "";
    if (state.mode === "raw") {
      text = "Datos crudos: guía de preparación; no se analizan en ariADNa";
    } else if (state.result) {
      text = state.exported ? "Reporte exportado" : "Análisis realizado";
      cls = "done";
    } else {
      var n = dataRowCount();
      text = n === 0 ? "Sin datos capturados" : n === 1 ? "1 marcador capturado" : n + " marcadores capturados";
      if (n > 0) cls = "ready";
    }
    dom.statusText.textContent = text;
    dom.status.className = "status " + cls;
  }

  function updateButtons() {
    var hasResult = !!state.result;
    dom.exportBtn.disabled = !hasResult;
    dom.exportBtn2.disabled = !hasResult;
    dom.analyzeBtn.disabled = state.mode === "raw";
    dom.importBtn.disabled = state.mode === "raw";
    dom.resultsDot.hidden = !hasResult || state.view === "results";
  }

  function invalidate() {
    if (state.result) {
      state.result = null;
      state.exported = false;
      renderResults();
    }
    updateStatus();
    updateButtons();
  }

  /* -------------------------------------------------------- resultados */
  function alleleTokens(alleles, shared) {
    if (!alleles.length) return '<span class="allele none">—</span>';
    return alleles
      .map(function (a) { return '<span class="allele' + (shared.has(a) ? " shared" : "") + '">' + esc(a) + "</span>"; })
      .join("");
  }

  var STATUS_GLYPH = { ok: "✓", bad: "✕", warn: "△", skip: "–" };

  function renderResults() {
    var r = state.result;
    dom.resultsActions.hidden = !r;
    if (!r) {
      var title = state.hadResult ? "Los datos cambiaron" : "Aquí verás el resultado";
      var text = state.hadResult
        ? "Modificaste la tabla o los parámetros. Vuelve a pulsar Analizar para actualizar la lectura de triaje."
        : "Carga marcadores y pulsa Analizar.";
      dom.resultsRoot.innerHTML =
        '<div class="empty-state"><h2>' + esc(title) + "</h2><p>" + esc(text) +
        '</p><button class="btn btn-primary" type="button" data-goto="analysis">Ir a Análisis</button></div>';
      return;
    }

    var meta = E.bannerMeta(r);
    var tone = meta[0];
    var glyph = { ok: "✓", warn: "△", bad: "✕" }[tone];
    var posterior = r.posterior_probability === null ? "—" : C.formatPosterior(r.posterior_probability, 4);
    var cpi = r.cpi === null ? "—" : C.formatCpi(r.cpi);

    var h = '<div class="stack">';
    h +=
      '<div class="banner ' + tone + '"><span class="glyph" aria-hidden="true">' + glyph + "</span><div>" +
      '<div class="verdict">' + esc(meta[1]) + "</div>" +
      '<p class="conclusion">' + esc(r.conclusion) + "</p>" +
      '<div class="chips"><span>Resultado preliminar · no sustituye dictamen pericial</span><span>Uso sujeto a autorización y revisión profesional</span></div>' +
      "</div></div>";

    function kpi(label, value, cls) {
      return '<div class="kpi"><div class="k">' + label + '</div><div class="v' + (cls ? " " + cls : "") + '">' + esc(String(value)) + "</div></div>";
    }
    h += '<div class="kpis">';
    h += kpi("Útiles", r.total_markers);
    h += kpi("Compatibles", r.compatible_markers, r.compatible_markers ? "ok" : "");
    h += kpi("Incongruencias", r.exclusions, r.exclusions ? "bad" : "");
    h += kpi("No inform.", r.non_informative_markers, r.non_informative_markers ? "skip" : "");
    h += kpi("CPI", cpi);
    h += kpi("Posterior", posterior);
    h += "</div>";

    h +=
      '<p class="meta-line">Ensayo: ' + esc(r.assay_label) + " · Probabilidad previa usada: " +
      E.pyFormatF(r.prior_probability_used, 2) + " · Algoritmo: " + esc(r.algorithm_version) +
      " · Marcadores capturados: " + r.captured_markers + " · Datos incompletos: " + r.missing_markers + "</p>";

    h += '<div class="charts">';
    h += '<section class="chart-card"><h3>Marcadores por estado</h3>' + C.statusBars(r) + "</section>";
    h += '<section class="chart-card"><h3>CPI capturado</h3>' + C.cpiCard(r) + "</section>";
    h += '<section class="chart-card"><h3>Probabilidad posterior</h3>' + C.donut(r) + "</section>";
    h += "</div>";
    h += '<section class="chart-card"><h3>Índice de laboratorio por marcador</h3><div class="table-scroll-x">' + C.piChart(r) + "</div></section>";

    if (r.warnings.length) {
      h += '<section class="card"><div class="card-head"><h2>Advertencias</h2><span class="hint">' + r.warnings.length + "</span></div>";
      h += '<ul class="warn-list">' + r.warnings.map(function (w) { return "<li>" + esc(w) + "</li>"; }).join("") + "</ul></section>";
    }

    h += '<section class="card"><div class="card-head"><h2>Detalle por marcador</h2><span class="spacer"></span>';
    h += '<div class="legend"><span><span class="allele shared">13</span> alelo compartido</span><span>' + r.markers.length + " marcador(es)</span></div></div>";
    h += '<div class="table-wrap"><table class="marker-table"><thead><tr>';
    h += "<th>Marcador</th><th>Estado</th><th>Hijo/a</th><th>Progenitor/a alegado/a</th><th>Índice</th><th>Nota</th>";
    h += "</tr></thead><tbody>";
    r.markers.forEach(function (m) {
      var klass = E.statusClass(m);
      var shared = new Set();
      if (m.paternity_informative) {
        var parentSet = new Set(m.alleged_parent);
        m.child.forEach(function (a) { if (parentSet.has(a)) shared.add(a); });
      }
      h += "<tr>";
      h += '<td class="m-name">' + esc(m.marker) + "</td>";
      h += '<td><span class="status-chip ' + klass + '"><span aria-hidden="true">' + STATUS_GLYPH[klass] + "</span>" + esc(E.statusLabel(m)) + "</span></td>";
      h += '<td><div class="alleles">' + alleleTokens(m.child, shared) + "</div></td>";
      h += '<td><div class="alleles">' + alleleTokens(m.alleged_parent, shared) + "</div></td>";
      h += '<td class="mono">' + (m.pi === null ? "—" : esc(E.pyRepr(m.pi))) + "</td>";
      h += '<td class="m-note">' + esc(m.note) + "</td>";
      h += "</tr>";
    });
    h += "</tbody></table></div></section>";

    h +=
      '<p class="footnote">Este resultado es preliminar y debe validarse con laboratorio acreditado, cadena de custodia y revisión pericial. ' +
      "Privacidad: usa sólo datos autorizados e identificadores anónimos; los datos genéticos son sensibles.</p>";
    h += "</div>";
    dom.resultsRoot.innerHTML = h;
  }

  /* ------------------------------------------------------------- vistas */
  var VIEW_HASH = { analysis: "analisis", results: "resultados", about: "acerca" };

  function showView(view, opts) {
    opts = opts || {};
    state.view = view;
    Object.keys(dom.views).forEach(function (key) { dom.views[key].hidden = key !== view; });
    dom.tabs.forEach(function (tab) {
      var active = tab.dataset.view === view;
      tab.setAttribute("aria-selected", active ? "true" : "false");
      tab.tabIndex = active ? 0 : -1;
    });
    dom.actionbar.hidden = view !== "analysis";
    document.body.classList.toggle("with-actionbar", view === "analysis");
    updateButtons();
    if (!opts.keepHash) {
      try {
        history.replaceState(null, "", "#" + VIEW_HASH[view]);
      } catch (err) {
        /* file:// o entorno sin history */
      }
    }
    if (!opts.keepScroll) window.scrollTo(0, 0);
  }

  function routeFromHash() {
    var hash = decodeURIComponent((location.hash || "").replace(/^#/, ""));
    if (!hash || hash === "analisis") return showView("analysis", { keepHash: true });
    if (hash === "resultados") return showView("results", { keepHash: true });
    if (hash === "acerca") return showView("about", { keepHash: true });
    var target = document.getElementById(hash);
    if (target && dom.views.about.contains(target)) {
      showView("about", { keepHash: true, keepScroll: true });
      target.scrollIntoView({ block: "start" });
    }
  }

  /* -------------------------------------------------------- diálogos */
  // Se resuelve de forma síncrona al pulsar un botón (o Escape): no depende del
  // evento `close`, que el navegador entrega de forma asíncrona.
  function openDialog(dlg, onAction) {
    return new Promise(function (resolve) {
      var settled = false;
      function finish(value) {
        if (settled) return;
        settled = true;
        dlg.removeEventListener("click", onClick);
        dlg.removeEventListener("cancel", onCancel);
        dlg.removeEventListener("close", onClose);
        if (dlg.open) dlg.close(value);
        resolve(value);
      }
      function onClick(event) {
        var btn = event.target.closest("[data-close]");
        if (btn) finish(btn.dataset.close);
        else if (onAction) onAction(event, finish);
      }
      function onCancel() {
        finish("cancel");
      }
      function onClose() {
        finish(dlg.returnValue || "cancel");
      }
      dlg.addEventListener("click", onClick);
      dlg.addEventListener("cancel", onCancel);
      dlg.addEventListener("close", onClose);
      dlg.returnValue = "";
      dlg.showModal();
    });
  }

  function confirmDialog(title, text, okLabel) {
    dom.confirmTitle.textContent = title;
    dom.confirmText.textContent = text;
    dom.confirmOk.textContent = okLabel || "Continuar";
    return openDialog(dom.dlgConfirm).then(function (v) { return v === "ok"; });
  }

  function defaultSampleIndexes(samples) {
    function find(terms) {
      for (var i = 0; i < samples.length; i++) {
        var low = samples[i].toLowerCase();
        if (terms.some(function (t) { return low.indexOf(t) !== -1; })) return i;
      }
      return -1;
    }
    var child = find(CHILD_TERMS);
    if (child < 0) child = 0;
    var parent = find(PARENT_TERMS);
    if (parent < 0) parent = Math.min(1, samples.length - 1);
    if (child === parent && samples.length > 1) parent = child !== 1 ? 1 : 0;
    return [child, parent];
  }

  function chooseVcfSamples(samples) {
    var options = samples.map(function (s, i) { return '<option value="' + i + '">' + esc(s) + "</option>"; }).join("");
    dom.vcfChild.innerHTML = options;
    dom.vcfParent.innerHTML = options;
    var defaults = defaultSampleIndexes(samples);
    dom.vcfChild.value = String(defaults[0]);
    dom.vcfParent.value = String(defaults[1]);
    dom.vcfError.hidden = true;
    return openDialog(dom.dlgVcf, function (event, finish) {
      if (event.target === dom.vcfOk || dom.vcfOk.contains(event.target)) {
        if (dom.vcfChild.value === dom.vcfParent.value) {
          dom.vcfError.hidden = false;
          return;
        }
        finish("ok");
      }
    }).then(function (value) {
      if (value !== "ok") return null;
      return { child: samples[Number(dom.vcfChild.value)], parent: samples[Number(dom.vcfParent.value)] };
    });
  }

  /* ---------------------------------------------------------- importar */
  function userError(message) {
    var err = new Error(message);
    err.name = "ValueError";
    return err;
  }

  function checkRowLimit(n) {
    if (n > MAX_IMPORT_ROWS) {
      throw userError(
        "El archivo trae " + n + " filas. Límite actual: " + MAX_IMPORT_ROWS +
          ". Reduce el archivo a los marcadores del caso antes de importarlo."
      );
    }
  }

  function showImportError(err) {
    var known = err && err.name === "ValueError";
    setNotice({
      tone: "error",
      title: "No pudimos importar el archivo.",
      body: (known ? err.message : "Detalles técnicos: " + (err && err.message ? err.message : String(err))) +
        " Revisa que tenga columnas reconocibles de marcador y genotipos/alelos.",
    });
  }

  function importFile(file) {
    if (!file || state.mode !== "processed") return;
    if (file.size > MAX_IMPORT_BYTES) {
      showImportError(
        userError(
          "El archivo es demasiado grande para esta versión beta: " + E.pyFormatF(file.size / 1048576, 1) +
            " MB. Límite actual: 10.0 MB. Divide el archivo o importa sólo los marcadores necesarios."
        )
      );
      return;
    }
    file
      .text()
      .then(function (text) { return importText(file.name, text, {}); })
      .catch(showImportError);
  }

  function importText(name, text, opts) {
    var isVcf = /\.vcf$/i.test(name);
    var switched = false;
    if (isVcf && state.assay !== "snp_panel") {
      setAssay("snp_panel");
      switched = true;
    }
    var assay = state.assay;
    var flow;
    if (isVcf) {
      var samples = E.readVcfSampleNames(text);
      flow = chooseVcfSamples(samples).then(function (choice) {
        if (!choice) return null;
        var raw = E.readVcfSnpRows(text, choice.child, choice.parent);
        checkRowLimit(raw.length);
        return {
          rows: E.canonicalizeRows(raw, "snp_panel"),
          warnings: E.vcfSampleSelectionWarnings(samples, choice.child, choice.parent).concat(E.markerInputWarnings(raw, "snp_panel")),
          detail: " Hijo/a: " + choice.child + "; progenitor/a alegado/a: " + choice.parent + ".",
        };
      });
    } else {
      var raw = E.readCsvRows(text);
      E.validateCsvColumns(raw, assay);
      checkRowLimit(raw.length);
      flow = Promise.resolve({
        rows: E.canonicalizeRows(raw, assay),
        warnings: E.markerInputWarnings(raw, assay),
        detail: "",
      });
    }
    return flow.then(function (out) {
      if (!out) return;
      var keys = COLUMNS[assay].map(function (c) { return c.key; });
      state.tables[assay] = out.rows.map(function (r) {
        var values = {};
        keys.forEach(function (k) { values[k] = r[k] || ""; });
        return { values: values, warning: r.validation_warning || "" };
      });
      state.visible = PAGE;
      invalidate();
      renderTable();
      var body = "Cargamos " + out.rows.length + " marcador(es) desde " + name + "." + out.detail + " Revisa la tabla y pulsa Analizar.";
      if (switched) body += " Cambiamos el ensayo a «SNP panels / SNP arrays», donde se importan los VCF.";
      if (opts.example) body += " Son datos sintéticos de ejemplo, no reales.";
      var items = warningItems(out.warnings);
      setNotice({
        tone: items.length ? "warn" : "ok",
        title: opts.example ? "Ejemplo cargado" : "Datos importados",
        body: body,
        itemsTitle: "Advertencias de importación:",
        items: items,
      });
      updateStatus();
    });
  }

  function loadExample(id) {
    var ex = (window.AriadnaExamples || []).filter(function (e) { return e.id === id; })[0];
    if (!ex) return;
    var targetHasData = dataRowCount(ex.assay) > 0;
    var go = targetHasData
      ? confirmDialog("Cargar ejemplo", "Se reemplazarán los marcadores de la tabla de «" + E.ASSAY_TYPES[ex.assay].label + "» con datos sintéticos. ¿Quieres continuar?", "Reemplazar")
      : Promise.resolve(true);
    go.then(function (ok) {
      if (!ok) return;
      if (state.assay !== ex.assay) setAssay(ex.assay);
      Promise.resolve()
        .then(function () { return importText(ex.filename, ex.text, { example: true }); })
        .catch(showImportError);
    });
  }

  /* ----------------------------------------------------------- análisis */
  function readPrior() {
    var raw = dom.prior.value.trim().replace(",", ".");
    if (raw === "") {
      setPriorError("");
      return 0.5;
    }
    var value = /^[+]?(\d+\.?\d*|\.\d+)$/.test(raw) ? Number(raw) : NaN;
    if (!Number.isFinite(value) || value < 0.01 || value > 0.99) {
      setPriorError("Usa un valor entre 0.01 y 0.99, o déjalo vacío para usar 0.50.");
      return null;
    }
    setPriorError("");
    return value;
  }

  function setPriorError(message) {
    dom.priorError.textContent = message;
    dom.priorError.hidden = !message;
    if (message) dom.prior.setAttribute("aria-invalid", "true");
    else dom.prior.removeAttribute("aria-invalid");
  }

  function analyze() {
    if (state.mode === "raw") return;
    var prior = readPrior();
    if (prior === null) {
      dom.prior.focus();
      return;
    }
    var rows = engineRows();
    if (!rows.length) {
      setNotice({ tone: "warn", title: "Faltan datos", body: "Agrega o importa al menos un marcador." });
      dom.noticeSlot.scrollIntoView({ block: "nearest" });
      return;
    }
    try {
      state.result = E.analyzeMarkers(state.assay, rows, prior);
      state.hadResult = true;
      state.exported = false;
    } catch (err) {
      state.result = null;
      setNotice({
        tone: "error",
        title: "No pudimos completar el análisis.",
        body: (err.name === "ValueError" ? err.message + " " : "Detalles técnicos: " + err.message + " ") +
          "Revisa que haya datos del hijo/a y del progenitor/a alegado/a.",
      });
      updateStatus();
      updateButtons();
      return;
    }
    renderResults();
    updateStatus();
    showView("results");
  }

  /* ---------------------------------------------------------- exportar */
  function safeName(text) {
    return Array.from(text)
      .map(function (ch) { return /[\p{L}\p{N}_-]/u.test(ch) ? ch : "_"; })
      .join("");
  }

  function download(filename, content, type) {
    var blob = new Blob([content], { type: type });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  function exportFlow() {
    if (!state.result) return;
    openDialog(dom.dlgExport).then(function (choice) {
      if (choice !== "anon" && choice !== "ident") return;
      var ids = {
        case_id: dom.caseId.value.trim(),
        child_id: dom.childId.value.trim(),
        parent_id: dom.parentId.value.trim(),
      };
      var metadata;
      var filename = "reporte_ariadna.html";
      if (choice === "anon") {
        metadata = {
          case_id: "Omitido",
          child_id: "Omitido",
          parent_id: "Omitido",
          report_mode: "anonimizado; omite identificadores, conserva genotipos",
        };
      } else {
        metadata = { case_id: ids.case_id, child_id: ids.child_id, parent_id: ids.parent_id, report_mode: "con identificadores capturados" };
        if (ids.case_id) filename = "reporte_ariadna_" + safeName(ids.case_id) + ".html";
      }
      try {
        download(filename, R.buildHtmlReport(state.result, metadata), "text/html;charset=utf-8");
      } catch (err) {
        toast("No pudimos guardar el reporte.");
        return;
      }
      state.exported = true;
      updateStatus();
      toast("Reporte descargado: " + filename);
    });
  }

  function copySummary() {
    if (!state.result) return;
    var text = R.resultToText(state.result);
    var done = function () { toast("Resumen copiado al portapapeles"); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text) && done(); });
    } else if (fallbackCopy(text)) {
      done();
    }
  }

  function fallbackCopy(text) {
    var area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.className = "sr-only";
    document.body.appendChild(area);
    area.select();
    var ok = false;
    try {
      ok = document.execCommand("copy");
    } catch (err) {
      ok = false;
    }
    area.remove();
    if (!ok) toast("No pudimos copiar; selecciona el texto manualmente.");
    return ok;
  }

  /* ---------------------------------------------------------- limpiar */
  function anyCaseData() {
    var ids = dom.caseId.value || dom.childId.value || dom.parentId.value;
    var tables = ASSAYS.some(function (a) { return dataRowCount(a) > 0; });
    return !!(ids || tables || state.result || state.exported);
  }

  function clearCase() {
    var go = anyCaseData()
      ? confirmDialog(
          "Limpiar caso",
          "Se borrarán identificadores, marcadores capturados y resultados en memoria. No se borran archivos HTML que ya hayas exportado. ¿Quieres continuar?",
          "Limpiar caso"
        )
      : Promise.resolve(true);
    go.then(function (ok) {
      if (!ok) return;
      dom.caseId.value = "";
      dom.childId.value = "";
      dom.parentId.value = "";
      dom.prior.value = "0.50";
      dom.priorRange.value = "0.5";
      setPriorError("");
      ASSAYS.forEach(function (a) { state.tables[a] = []; });
      state.tables[state.assay] = blankRowsFor(state.assay, DEFAULT_ROWS);
      state.visible = PAGE;
      state.result = null;
      state.hadResult = false;
      state.exported = false;
      dom.fileInput.value = "";
      renderTable();
      renderResults();
      updateStatus();
      updateButtons();
      setNotice({ tone: "ok", title: "Caso limpio", body: "Se borraron los datos en memoria. Usa identificadores anónimos al capturar un nuevo caso." });
    });
  }

  function clearTable() {
    var go = dataRowCount() > 0
      ? confirmDialog("Vaciar tabla", "Se borrarán los marcadores capturados. ¿Quieres continuar?", "Vaciar tabla")
      : Promise.resolve(true);
    go.then(function (ok) {
      if (!ok) return;
      state.tables[state.assay] = blankRowsFor(state.assay, DEFAULT_ROWS);
      state.visible = PAGE;
      state.notice = null;
      renderNotice();
      renderTable();
      invalidate();
    });
  }

  /* -------------------------------------------------------- modo/ensayo */
  function setAssay(assay) {
    state.assay = assay;
    dom.assay.value = assay;
    if (!state.tables[assay].length) state.tables[assay] = blankRowsFor(assay, DEFAULT_ROWS);
    state.visible = PAGE;
    state.notice = null;
    renderNotice();
    renderTable();
    updateStatus();
  }

  function setMode(mode) {
    state.mode = mode;
    dom.modeButtons.forEach(function (b) { b.setAttribute("aria-pressed", b.dataset.mode === mode ? "true" : "false"); });
    dom.processedPanel.hidden = mode !== "processed";
    dom.rawPanel.hidden = mode !== "raw";
    updateStatus();
    updateButtons();
  }

  function renderRawType() {
    var item = RAW_OUTPUT_TYPES[Number(dom.rawType.value) || 0];
    dom.rawTitle.textContent = item[0];
    dom.rawDesc.textContent = item[1];
  }

  /* -------------------------------------------------------------- toast */
  var toastTimer = null;
  function toast(message) {
    dom.toast.textContent = message;
    dom.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { dom.toast.hidden = true; }, 2800);
  }

  /* -------------------------------------------------------------- tema */
  function effectiveTheme() {
    var forced = document.documentElement.getAttribute("data-theme");
    if (forced) return forced;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function syncThemeIcon() {
    var dark = effectiveTheme() === "dark";
    dom.iconMoon.hidden = dark;
    dom.iconSun.hidden = !dark;
    dom.themeToggle.setAttribute("aria-label", dark ? "Cambiar a tema claro" : "Cambiar a tema oscuro");
  }

  function toggleTheme() {
    var next = effectiveTheme() === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      window.localStorage.setItem("ariadna-theme", next);
    } catch (err) {
      /* sin almacenamiento: el tema dura esta sesión */
    }
    syncThemeIcon();
  }

  /* ----------------------------------------------------- tabla: eventos */
  function focusCell(r, key) {
    var input = dom.grid.querySelector('input[data-r="' + r + '"][data-k="' + key + '"]');
    if (input) {
      input.focus();
      input.select();
    }
  }

  function onTableInput(event) {
    var input = event.target;
    if (!input.classList || !input.classList.contains("cell")) return;
    var row = currentTable()[Number(input.dataset.r)];
    if (!row) return;
    row.values[input.dataset.k] = input.value;
    invalidate();
    updateCount();
  }

  function onTableKeydown(event) {
    var input = event.target;
    if (!input.classList || !input.classList.contains("cell")) return;
    if (event.key !== "Enter" || event.metaKey || event.ctrlKey || event.altKey) return;
    event.preventDefault();
    var r = Number(input.dataset.r) + (event.shiftKey ? -1 : 1);
    var key = input.dataset.k;
    if (r < 0) return;
    var table = currentTable();
    if (r >= table.length) {
      table.push(blankRow());
      state.visible = Math.max(state.visible, table.length);
      renderTable();
    } else if (r >= state.visible) {
      state.visible = r + 1;
      renderTable();
    }
    focusCell(r, key);
  }

  function onTablePaste(event) {
    var input = event.target;
    if (!input.classList || !input.classList.contains("cell")) return;
    var text = (event.clipboardData || window.clipboardData).getData("text/plain") || "";
    var trimmed = text.replace(/\r/g, "").replace(/\n+$/, "");
    if (!/[\t\n]/.test(trimmed)) return;
    event.preventDefault();
    var grid = trimmed.split("\n").map(function (line) { return line.split("\t"); });
    var cols = COLUMNS[state.assay];
    var startRow = Number(input.dataset.r);
    var startCol = cols.map(function (c) { return c.key; }).indexOf(input.dataset.k);
    var table = currentTable();
    if (startRow + grid.length > MAX_IMPORT_ROWS) {
      toast("Demasiadas filas para pegar (límite " + MAX_IMPORT_ROWS + ").");
      return;
    }
    grid.forEach(function (cells, i) {
      var r = startRow + i;
      while (table.length <= r) table.push(blankRow());
      cells.forEach(function (value, j) {
        var col = cols[startCol + j];
        if (col) table[r].values[col.key] = value.trim();
      });
    });
    state.visible = Math.max(state.visible, Math.min(table.length, startRow + grid.length));
    renderTable();
    invalidate();
    toast("Pegamos " + grid.length + " fila(s).");
    focusCell(startRow, input.dataset.k);
  }

  function onTableClick(event) {
    var del = event.target.closest("[data-del]");
    if (!del) return;
    var r = Number(del.dataset.del);
    currentTable().splice(r, 1);
    if (!currentTable().length) state.tables[state.assay] = blankRowsFor(state.assay, 1);
    renderTable();
    invalidate();
  }

  /* -------------------------------------------------------------- init */
  function init() {
    // selectores
    dom.assay.innerHTML = ASSAYS.map(function (a) {
      return '<option value="' + a + '">' + esc(E.ASSAY_TYPES[a].label) + "</option>";
    }).join("");
    dom.rawType.innerHTML = RAW_OUTPUT_TYPES.map(function (t, i) { return '<option value="' + i + '">' + esc(t[0]) + "</option>"; }).join("");
    renderRawType();

    var short = { str_ce: "STR CE", str_mps: "STR MPS", snp_panel: "SNP", microhap: "Microhap" };
    dom.examplesPanel.insertAdjacentHTML(
      "beforeend",
      (window.AriadnaExamples || [])
        .map(function (ex) {
          return '<button class="menu-item" type="button" data-example="' + esc(ex.id) + '">' + esc(ex.label) +
            '<span class="tag">' + esc(/\.vcf$/i.test(ex.filename) ? "VCF" : short[ex.assay]) + "</span></button>";
        })
        .join("")
    );

    document.getElementById("algo-version").textContent = E.ALGORITHM_VERSION;
    dom.aboutRoot.innerHTML = window.AriadnaAbout.html;
    var aboutAlgo = document.getElementById("about-algo");
    if (aboutAlgo) aboutAlgo.textContent = E.ALGORITHM_VERSION;

    var isMac = /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || "");
    dom.analyzeKbd.textContent = isMac ? "⌘ ↵" : "Ctrl ↵";

    state.tables.str_ce = blankRowsFor("str_ce", DEFAULT_ROWS);
    renderTable();
    renderResults();
    updateStatus();
    updateButtons();
    syncThemeIcon();

    // pestañas
    dom.tabs.forEach(function (tab, i) {
      tab.addEventListener("click", function () { showView(tab.dataset.view); });
      tab.addEventListener("keydown", function (event) {
        var next = null;
        if (event.key === "ArrowRight") next = (i + 1) % dom.tabs.length;
        else if (event.key === "ArrowLeft") next = (i - 1 + dom.tabs.length) % dom.tabs.length;
        else if (event.key === "Home") next = 0;
        else if (event.key === "End") next = dom.tabs.length - 1;
        if (next === null) return;
        event.preventDefault();
        dom.tabs[next].focus();
        showView(dom.tabs[next].dataset.view);
      });
    });
    window.addEventListener("hashchange", routeFromHash);
    document.addEventListener("click", function (event) {
      var go = event.target.closest("[data-goto]");
      if (go) showView(go.dataset.goto);
      var dismiss = event.target.closest("[data-dismiss]");
      if (dismiss) setNotice(null);
      if (dom.examplesMenu.open && !dom.examplesMenu.contains(event.target)) dom.examplesMenu.open = false;
    });

    // caso y parámetros
    dom.prior.addEventListener("input", function () {
      var v = readPrior();
      if (v !== null) dom.priorRange.value = String(v);
      invalidate();
    });
    dom.prior.addEventListener("blur", function () {
      var v = readPrior();
      if (v !== null && dom.prior.value.trim() !== "") dom.prior.value = E.pyFormatF(v, 2);
    });
    dom.priorRange.addEventListener("input", function () {
      dom.prior.value = E.pyFormatF(Number(dom.priorRange.value), 2);
      setPriorError("");
      invalidate();
    });

    // datos
    dom.modeButtons.forEach(function (b) { b.addEventListener("click", function () { setMode(b.dataset.mode); }); });
    dom.rawType.addEventListener("change", renderRawType);
    dom.assay.addEventListener("change", function () { setAssay(dom.assay.value); });
    dom.importBtn.addEventListener("click", function () { dom.fileInput.click(); });
    dom.fileInput.addEventListener("change", function () {
      var file = dom.fileInput.files && dom.fileInput.files[0];
      dom.fileInput.value = "";
      importFile(file);
    });
    dom.examplesPanel.addEventListener("click", function (event) {
      var item = event.target.closest("[data-example]");
      if (!item) return;
      dom.examplesMenu.open = false;
      loadExample(item.dataset.example);
    });
    dom.grid.addEventListener("input", onTableInput);
    dom.grid.addEventListener("keydown", onTableKeydown);
    dom.grid.addEventListener("paste", onTablePaste);
    dom.grid.addEventListener("click", onTableClick);
    dom.addRows.addEventListener("click", function () {
      var table = currentTable();
      for (var i = 0; i < ADD_ROWS; i++) table.push(blankRow());
      state.visible = Math.max(state.visible, table.length);
      renderTable();
    });
    dom.showMore.addEventListener("click", function () {
      state.visible += PAGE;
      renderTable();
    });
    dom.clearTable.addEventListener("click", clearTable);

    // arrastrar y soltar
    var dragDepth = 0;
    dom.dataCard.addEventListener("dragenter", function (event) {
      if (state.mode !== "processed" || !event.dataTransfer || Array.prototype.indexOf.call(event.dataTransfer.types, "Files") === -1) return;
      event.preventDefault();
      dragDepth += 1;
      dom.dropOverlay.hidden = false;
    });
    dom.dataCard.addEventListener("dragover", function (event) {
      if (state.mode !== "processed") return;
      event.preventDefault();
    });
    dom.dataCard.addEventListener("dragleave", function () {
      dragDepth = Math.max(0, dragDepth - 1);
      if (!dragDepth) dom.dropOverlay.hidden = true;
    });
    dom.dataCard.addEventListener("drop", function (event) {
      event.preventDefault();
      dragDepth = 0;
      dom.dropOverlay.hidden = true;
      var file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
      importFile(file);
    });
    window.addEventListener("dragover", function (event) { event.preventDefault(); });
    window.addEventListener("drop", function (event) { event.preventDefault(); });

    // acciones
    dom.analyzeBtn.addEventListener("click", analyze);
    dom.exportBtn.addEventListener("click", exportFlow);
    dom.exportBtn2.addEventListener("click", exportFlow);
    dom.copyBtn.addEventListener("click", copySummary);
    dom.helpBtn.addEventListener("click", function () { openDialog(dom.dlgHelp); });
    dom.clearCase.addEventListener("click", clearCase);
    dom.themeToggle.addEventListener("click", toggleTheme);
    if (window.matchMedia) {
      var mq = window.matchMedia("(prefers-color-scheme: dark)");
      if (mq.addEventListener) mq.addEventListener("change", syncThemeIcon);
    }
    document.addEventListener("keydown", function (event) {
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && state.view === "analysis") {
        event.preventDefault();
        analyze();
      }
      if (event.key === "Escape" && dom.examplesMenu.open) dom.examplesMenu.open = false;
    });

    routeFromHash();
  }

  init();
})();

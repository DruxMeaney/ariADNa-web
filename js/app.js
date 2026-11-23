/*!
 * ariADNa — interfaz web
 * Todo ocurre en el navegador: no hay peticiones de red ni almacenamiento de datos del caso.
 */
(function () {
  "use strict";

  var E = window.AriadnaEngine;
  var R = window.AriadnaReport;
  var C = window.AriadnaCharts;
  var P = window.AriadnaPrefs;
  var esc = E.escapeHtml;

  var MAX_IMPORT_BYTES = 10 * 1024 * 1024;
  var MAX_IMPORT_ROWS = 5000;
  var DEFAULT_ROWS = 10;
  var ADD_ROWS = 10;
  var PAGE = 200;
  var MARKER_PAGE = 120;
  var REVIEW_CAP = 200;
  var ASSAYS = ["str_ce", "str_mps", "snp_panel", "microhap"];

  // Etiquetas cortas sólo para la interfaz (el reporte conserva la etiqueta del motor).
  var ASSAY_SHORT = {
    str_ce: "STR · electroforesis capilar",
    str_mps: "STR · secuenciación (MPS/NGS)",
    snp_panel: "SNP · panel o array",
    microhap: "Microhaplotipos · MPS/NGS",
  };

  var PI_LABEL = "PI del laboratorio";
  var PI_TITLE = "Índice de paternidad por marcador que reporta el laboratorio. Opcional: sin PI sólo se revisa la compatibilidad.";

  var COLUMNS = {
    str_ce: [
      { key: "marker", label: "Locus", group: "marker" },
      { key: "child_a1", label: "Alelo 1", group: "child", aria: "Hijo/a alelo 1" },
      { key: "child_a2", label: "Alelo 2", group: "child", aria: "Hijo/a alelo 2" },
      { key: "parent_a1", label: "Alelo 1", group: "parent", aria: "Progenitor/a alelo 1" },
      { key: "parent_a2", label: "Alelo 2", group: "parent", aria: "Progenitor/a alelo 2" },
      { key: "pi", label: PI_LABEL, group: "pi" },
      { key: "note", label: "Notas", group: "note" },
    ],
    str_mps: [
      { key: "marker", label: "Locus", group: "marker" },
      { key: "child_a1", label: "Secuencia/alelo 1", group: "child", aria: "Hijo/a secuencia/alelo 1" },
      { key: "child_a2", label: "Secuencia/alelo 2", group: "child", aria: "Hijo/a secuencia/alelo 2" },
      { key: "parent_a1", label: "Secuencia/alelo 1", group: "parent", aria: "Progenitor/a secuencia/alelo 1" },
      { key: "parent_a2", label: "Secuencia/alelo 2", group: "parent", aria: "Progenitor/a secuencia/alelo 2" },
      { key: "pi", label: PI_LABEL, group: "pi" },
      { key: "note", label: "Notas", group: "note" },
    ],
    snp_panel: [
      { key: "marker", label: "Marcador/rsID", group: "marker" },
      { key: "child_genotype", label: "Genotipo", group: "child", aria: "Hijo/a genotipo" },
      { key: "parent_genotype", label: "Genotipo", group: "parent", aria: "Progenitor/a genotipo" },
      { key: "pi", label: PI_LABEL, group: "pi" },
      { key: "note", label: "Notas", group: "note" },
    ],
    microhap: [
      { key: "marker", label: "Microhaplotipo", group: "marker" },
      { key: "child_a1", label: "Haplotipo 1", group: "child", aria: "Hijo/a haplotipo 1" },
      { key: "child_a2", label: "Haplotipo 2", group: "child", aria: "Hijo/a haplotipo 2" },
      { key: "parent_a1", label: "Haplotipo 1", group: "parent", aria: "Progenitor/a haplotipo 1" },
      { key: "parent_a2", label: "Haplotipo 2", group: "parent", aria: "Progenitor/a haplotipo 2" },
      { key: "pi", label: PI_LABEL, group: "pi" },
      { key: "note", label: "Notas", group: "note" },
    ],
  };

  // Ejemplo fantasma en la primera fila de una tabla vacía: enseña el formato sin escribir datos.
  var PLACEHOLDERS = {
    str_ce: { marker: "D8S1179", child_a1: "12", child_a2: "13", parent_a1: "13", parent_a2: "14", pi: "2.15", note: "opcional" },
    str_mps: { marker: "D8S1179", child_a1: "12", child_a2: "13", parent_a1: "13", parent_a2: "14", pi: "2.15", note: "opcional" },
    snp_panel: { marker: "rs1799971", child_genotype: "A/G", parent_genotype: "G/G", pi: "opcional", note: "opcional" },
    microhap: { marker: "mh01", child_a1: "A-C-G", child_a2: "T-C-A", parent_a1: "T-C-A", parent_a2: "G-G-T", pi: "opcional", note: "opcional" },
  };

  var CSV_TEMPLATES = {
    str_ce: "marker,child_a1,child_a2,parent_a1,parent_a2,pi,note\n",
    str_mps: "marker,child_a1,child_a2,parent_a1,parent_a2,pi,note\n",
    snp_panel: "marker,child_genotype,parent_genotype,pi,note\n",
    microhap: "marker,child_a1,child_a2,parent_a1,parent_a2,pi,note\n",
  };

  // Palabras que delatan una fila de encabezados al pegar desde una hoja de cálculo.
  var HEADER_WORDS = [
    "marker", "marcador", "locus", "loci", "rsid", "snp", "microhaplotipo", "alelo 1", "alelo 2", "haplotipo 1", "haplotipo 2",
    "genotipo", "child_a1", "child_a2", "parent_a1", "parent_a2", "child_genotype", "parent_genotype", "hijo_a1", "hijo_a2",
    "progenitor_a1", "progenitor_a2", "pi", "ip", "indice", "índice", "notas", "nota", "note", "notes", "hijo", "hija", "padre", "madre", "progenitor",
  ];

  var RAW_OUTPUT_TYPES = [
    [
      "STR capilar: electroferograma .fsa/.hid",
      "Salida cruda o semiprocesada del equipo de electroforesis capilar. Pide al laboratorio una tabla por locus con los alelos del hijo/a, los del progenitor/a alegado/a y el índice por locus si aplica.",
    ],
    [
      "MPS/NGS: FASTQ / FASTQ.gz",
      "Lecturas crudas con calidades. Requieren demultiplexado, control de calidad y llamada de alelos, SNP o haplotipos antes de poder usarse aquí.",
    ],
    [
      "MPS/NGS alineado: BAM / CRAM",
      "Lecturas alineadas. Todavía falta llamar genotipos, STR o microhaplotipos y validarlos antes de cargarlos.",
    ],
    ["Illumina: BCL", "Base calls por ciclo del secuenciador. Normalmente se convierten a FASTQ y luego a genotipos o alelos procesados."],
    ["SNP array: IDAT / CEL / GTC", "Intensidades o llamadas propias del array. Pide al laboratorio los genotipos en una tabla CSV/TSV o en VCF."],
    [
      "PDF, imagen o reporte no estructurado",
      "Sirve para lectura humana, pero no para importar. Pide una tabla CSV/TSV/VCF con marcadores y genotipos o alelos comparables.",
    ],
  ];

  // Alcances y límites: se muestran antes de analizar y al final de cada reporte.
  var LIMITS = [
    "<strong>Es un triaje preliminar.</strong> Orienta y prioriza; no es un dictamen pericial ni tiene validez legal.",
    "<strong>Sólo compara si comparten alelos.</strong> No calcula índices: usa los PI que aporte el laboratorio y no incorpora frecuencias poblacionales.",
    "<strong>Es un análisis de dúo.</strong> No modela mutaciones, alelos nulos, mezclas ni tríos, y no distingue al progenitor/a de un pariente cercano suyo (por ejemplo, un hermano), que puede dar un patrón compatible.",
    "<strong>La probabilidad posterior depende de la previa que elijas</strong> y de los índices capturados; no es la probabilidad «real» de parentesco.",
    "<strong>No verifica la identidad de las muestras,</strong> su calidad ni la cadena de custodia. Un error de captura cambia el resultado.",
    "<strong>Toda conclusión con efectos legales, clínicos o familiares</strong> debe confirmarla un laboratorio acreditado (ISO/IEC 17025) con dictamen pericial.",
    "<strong>Los datos genéticos son datos personales sensibles.</strong> Úsalos sólo con consentimiento o base legal.",
  ];

  var CHILD_TERMS = ["hijo", "hija", "child", "menor", "descendiente"];
  var PARENT_TERMS = ["progenitor", "padre", "madre", "parent", "father", "mother", "alegado", "alleged"];

  var VIEW_HASH = { home: "inicio", analysis: "analisis", results: "resultados", about: "acerca" };
  var VIEW_TITLE = { home: "Inicio", analysis: "Análisis", results: "Resultados", about: "Acerca de" };
  var BASE_TITLE = "ariADNa · Triaje preliminar de paternidad/maternidad";

  /* ------------------------------------------------------------- estado */
  var state = {
    view: "home",
    assay: "str_ce",
    tables: { str_ce: [], str_mps: [], snp_panel: [], microhap: [] },
    visible: PAGE,
    markersVisible: MARKER_PAGE,
    filter: "all",
    sort: "lab",
    result: null,
    hadResult: false,
    exported: false,
    notice: null,
    limitsAck: false,
    animate: false,
    guide: P.get("coach") === "done" ? "done" : "start", // start → wait → done
  };

  /* ---------------------------------------------------------------- DOM */
  function $(id) {
    return document.getElementById(id);
  }
  function all(selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  }
  var dom = {
    html: document.documentElement,
    shell: $("app-shell"),
    tabs: all(".tab"),
    views: { home: $("view-home"), analysis: $("view-analysis"), results: $("view-results"), about: $("view-about") },
    resultsDot: $("results-dot"),
    caseId: $("case-id"),
    childId: $("child-id"),
    parentId: $("parent-id"),
    idsDetails: $("ids-details"),
    prior: $("prior"),
    priorRange: $("prior-range"),
    priorError: $("prior-error"),
    assay: $("assay"),
    importBtn: $("import-btn"),
    fileInput: $("file-input"),
    examplesMenu: $("examples-menu"),
    examplesPanel: $("examples-panel"),
    startPanel: $("start-panel"),
    startExample: $("start-example"),
    startImport: $("start-import"),
    startType: $("start-type"),
    rawHelpBtn: $("raw-help-btn"),
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
    exportBtn2: $("export-btn-2"),
    analyzeBtn: $("analyze-btn"),
    analyzeKbd: $("analyze-kbd"),
    reportMeta: $("report-meta"),
    resultsRoot: $("results-root"),
    resultsActions: $("results-actions"),
    copyBtn: $("copy-btn"),
    helpBtn: $("help-btn"),
    aboutRoot: $("about-root"),
    settingsBtn: $("settings-btn"),
    toast: $("toast"),
    dlgVcf: $("dlg-vcf"),
    vcfChild: $("vcf-child"),
    vcfParent: $("vcf-parent"),
    vcfError: $("vcf-error"),
    vcfOk: $("vcf-ok"),
    dlgExport: $("dlg-export"),
    exportIds: $("export-ids"),
    exportIdsText: $("export-ids-text"),
    dlgConfirm: $("dlg-confirm"),
    confirmTitle: $("confirm-title"),
    confirmText: $("confirm-text"),
    confirmOk: $("confirm-ok"),
    dlgRaw: $("dlg-raw"),
    rawList: $("raw-list"),
    dlgLimits: $("dlg-limits"),
    limitsList: $("limits-list"),
    limitsSkip: $("limits-skip"),
    dlgSettings: $("dlg-settings"),
    paneLook: $("pane-look"),
    paneHelp: $("pane-help"),
    setIntro: $("set-intro"),
    setLimits: $("set-limits"),
    splash: $("splash"),
    splashCanvas: $("splash-canvas"),
    splashSkip: $("splash-skip"),
    heroCanvas: $("hero-canvas"),
    toolLoader: $("tool-loader"),
    guideStart: $("guide-start"),
    guideAnalyze: $("guide-analyze"),
  };

  /* ------------------------------------------------------------ filas */
  function blankRowsFor(assay, n) {
    var rows = [];
    for (var i = 0; i < n; i++) {
      var values = {};
      COLUMNS[assay].forEach(function (c) { values[c.key] = ""; });
      rows.push({ values: values, warning: "" });
    }
    return rows;
  }

  function blankRow() {
    return blankRowsFor(state.assay, 1)[0];
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

  function anyTableData() {
    return ASSAYS.some(function (a) { return dataRowCount(a) > 0; });
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
  var TRI_UP = '<svg class="tri tri-child" viewBox="0 0 10 10" aria-hidden="true"><path d="M5 1l4.5 8h-9z"/></svg>';
  var TRI_DOWN = '<svg class="tri tri-parent" viewBox="0 0 10 10" aria-hidden="true"><path d="M5 9l4.5-8h-9z"/></svg>';

  function renderTableHead() {
    var cols = COLUMNS[state.assay];
    var child = cols.filter(function (c) { return c.group === "child"; });
    var parent = cols.filter(function (c) { return c.group === "parent"; });
    var h = "<thead>";
    h += '<tr class="groups">';
    h += '<th class="idx rs" rowspan="2" scope="col"><span class="sr-only">Fila</span>#</th>';
    h += '<th class="rs col-marker" rowspan="2" scope="col">' + esc(cols[0].label) + "</th>";
    h += '<th class="g-child g-start" colspan="' + child.length + '" scope="colgroup"><span class="grp">' + TRI_UP + "Hijo/a</span></th>";
    h += '<th class="g-start" colspan="' + parent.length + '" scope="colgroup"><span class="grp">' + TRI_DOWN + "Progenitor/a alegado/a</span></th>";
    h += '<th class="rs g-start" rowspan="2" scope="col" title="' + esc(PI_TITLE) + '">' + esc(PI_LABEL) + ' <span class="opt">opcional</span></th>';
    h += '<th class="rs" rowspan="2" scope="col">Notas</th>';
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
    if (col.group === "marker") classes.push("col-marker");
    if (col.group === "child") classes.push("g-child");
    var groupCols = cols.filter(function (c) { return c.group === col.group; });
    if ((col.group === "child" || col.group === "parent" || col.group === "pi") && groupCols[0] === col) classes.push("g-start");
    return classes.join(" ");
  }

  function renderTable() {
    var cols = COLUMNS[state.assay];
    var table = currentTable();
    var shown = Math.min(table.length, state.visible);
    var ghost = dataRowCount() === 0 ? PLACEHOLDERS[state.assay] : null;
    var numeric = state.assay === "str_ce";
    var body = "<tbody>";
    for (var r = 0; r < shown; r++) {
      var row = table[r];
      body += "<tr>";
      var idx = String(r + 1);
      var describedBy = "";
      if (row.warning) {
        var warnText = "Advertencia de importación: " + row.warning;
        idx = '<span class="warn-mark" role="img" title="' + esc(warnText) + '" aria-label="' + esc(warnText) + '">⚠</span> ' + idx +
          '<span class="sr-only" id="rw-' + r + '">' + esc(warnText) + "</span>";
        describedBy = ' aria-describedby="rw-' + r + '"';
      }
      body += '<td class="idx">' + idx + "</td>";
      cols.forEach(function (c) {
        var aria = (c.aria || c.label) + " · fila " + (r + 1);
        var decimal = c.key === "pi" || (numeric && c.group !== "marker" && c.group !== "note");
        body +=
          '<td class="' + cellClass(c, cols) + '"><input class="cell' + (c.key === "note" ? " note" : "") + '" data-r="' + r +
          '" data-k="' + c.key + '" value="' + esc(row.values[c.key] || "") + '" aria-label="' + esc(aria) + '"' +
          (c.key === "marker" ? describedBy : "") + (decimal ? ' inputmode="decimal"' : "") +
          (ghost && r === 0 ? ' placeholder="' + esc(ghost[c.key] || "") + '"' : "") +
          ' autocomplete="off" spellcheck="false"></td>';
      });
      body +=
        '<td class="act"><button class="row-del" type="button" tabindex="-1" data-del="' + r + '" aria-label="Eliminar fila ' + (r + 1) +
        '" title="Eliminar fila (Ctrl/⌘ + Retroceso)">×</button></td>';
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
  var noticeActions = {};

  function setNotice(notice) {
    state.notice = notice;
    renderNotice();
  }

  function renderNotice() {
    var n = state.notice;
    noticeActions = {};
    if (!n) {
      dom.noticeSlot.innerHTML = "";
      return;
    }
    var glyph = { ok: "✓", warn: "!", error: "✕", info: "i" }[n.tone] || "i";
    var h = '<div class="notice ' + n.tone + '">';
    h += '<span class="glyph" aria-hidden="true">' + glyph + "</span><div>";
    h += '<div class="notice-title">' + esc(n.title) + "</div>";
    if (n.body) h += '<div class="notice-body">' + esc(n.body) + "</div>";
    if (n.items && n.items.length) {
      h += '<div class="notice-body"><strong>' + esc(n.itemsTitle || "") + "</strong></div><ul>";
      n.items.forEach(function (item) { h += "<li>" + esc(item) + "</li>"; });
      h += "</ul>";
    }
    if (n.actions && n.actions.length) {
      h += '<div class="notice-actions">';
      n.actions.forEach(function (a, i) {
        noticeActions[i] = a.run;
        h += '<button class="btn btn-sm' + (i === 0 ? "" : " btn-ghost") + '" type="button" data-notice-action="' + i + '">' + esc(a.label) + "</button>";
      });
      h += "</div>";
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
    var n = dataRowCount();
    if (state.result) {
      text = state.exported ? "Reporte exportado" : "Análisis realizado";
      cls = "done";
    } else if (n === 0) {
      text = "Sin datos · carga marcadores para analizar";
    } else {
      text = (n === 1 ? "1 marcador capturado" : n + " marcadores capturados") + " · listo para analizar";
      cls = "ready";
    }
    if (dom.statusText.textContent !== text) dom.statusText.textContent = text;
    dom.status.className = "status " + cls;
    dom.startPanel.hidden = anyTableData();
    dom.analyzeBtn.classList.toggle("btn-primary", n > 0);
    guideSync();
  }

  function updateButtons() {
    var hasResult = !!state.result;
    dom.exportBtn2.disabled = !hasResult;
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
  var GENERIC_OK_NOTE = "Comparte al menos un alelo/haplotipo con el hijo/a.";
  var VERDICT_ICON = {
    ok: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M12 6v8"/><path d="M12 18.5v.01"/></svg>',
    bad: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17"/></svg>',
  };
  var STATUS_MARK = { ok: "✓", bad: "✕", warn: "!", skip: "–" };
  var STATUS_RANK = { bad: 0, warn: 1, ok: 2, skip: 3 };
  var LEVEL_CONCLUSION = {
    high: "Patrón compatible con soporte estadístico alto capturado; requiere validación pericial.",
    moderate: "Patrón compatible con soporte estadístico moderado capturado; requiere revisión pericial.",
    limited: "Patrón compatible a nivel mendeliano, pero el soporte estadístico capturado es limitado.",
  };

  function sentence(text) {
    var t = String(text || "").replace(/^Triaje:\s*/, "");
    return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
  }

  function markerNote(m) {
    var note = m.note || "";
    if (note.indexOf(GENERIC_OK_NOTE) === 0) note = note.slice(GENERIC_OK_NOTE.length).trim();
    return note;
  }

  function insightsOf(r) {
    return typeof E.triageInsights === "function" ? E.triageInsights(r) : [];
  }

  // Lectura final que se muestra y se exporta: veredicto del motor, ajustado por las
  // observaciones de control y por la aritmética robusta cuando el CPI desborda.
  function readingOf(r) {
    var meta = E.bannerMeta(r);
    var tone = meta[0];
    var verdict = meta[1];
    var insights = insightsOf(r);
    var alerts = insights.filter(function (o) { return o.level === "alert"; });
    if (tone === "ok" && alerts.length) {
      tone = "warn"; // una alerta nunca deja el veredicto en verde
      verdict = alerts.length === 1 && alerts[0].verdict ? alerts[0].verdict : "Requiere revisión";
    }
    var sup = C.support(r);
    var conclusion = sup && sup.degenerate ? "Triaje: " + LEVEL_CONCLUSION[sup.level.key].charAt(0).toLowerCase() + LEVEL_CONCLUSION[sup.level.key].slice(1) : r.conclusion;
    return { tone: tone, verdict: verdict, conclusion: conclusion, sup: sup, insights: insights };
  }

  function renderReportMeta(r) {
    if (!r) {
      dom.reportMeta.innerHTML = "<span><b>Reporte de triaje</b></span>";
      return;
    }
    var caseId = dom.caseId.value.trim();
    var child = dom.childId.value.trim();
    var parent = dom.parentId.value.trim();
    var parts = ["<b>Reporte de triaje</b>"];
    if (caseId) parts.push("Caso " + esc(caseId));
    if (child || parent) parts.push(esc(child || "hijo/a") + " ↔ " + esc(parent || "progenitor/a"));
    parts.push(esc(ASSAY_SHORT[r.assay_type] || r.assay_label));
    parts.push("Previa " + E.pyFormatF(r.prior_probability_used, 2));
    parts.push(esc(r.algorithm_version));
    dom.reportMeta.innerHTML = parts.map(function (p) { return "<span>" + p + "</span>"; }).join("");
  }

  function alleleText(list, shared) {
    if (!list.length) return '<span class="muted">—</span><span class="sr-only"> sin datos</span>';
    var keyOf = E.alleleKey || function (a) { return a; };
    return list
      .map(function (a) { return shared.has(keyOf(a)) ? "<b>" + esc(a) + "</b>" : esc(a); })
      .join(", ");
  }

  function renderMarkerRow(r, i) {
    var m = r.markers[i];
    var klass = E.statusClass(m);
    var shared = C.sharedKeys(m);
    var note = markerNote(m);
    var used = C.isUsed(m);
    var pi;
    if (m.pi === null) pi = '<span class="muted" aria-hidden="true">—</span><span class="sr-only">sin índice</span>';
    else if (!used) pi = '<span class="pi-unused" title="PI capturado: ' + esc(E.pyRepr(m.pi)) + '">no usado</span>';
    else pi = esc(E.pyRepr(m.pi));
    var h = '<tr class="mk mk-' + klass + (note ? " has-note" : "") + '" id="mk-' + i + '" data-i="' + i + '" tabindex="-1">';
    h += '<th scope="row" class="mk-name">' + esc(m.marker) + "</th>";
    h += '<td class="mk-status"><span class="st st-' + klass + '"><span aria-hidden="true">' + STATUS_MARK[klass] + "</span> " + esc(E.statusLabel(m)) + "</span></td>";
    h += '<td class="mk-al mk-child">' + alleleText(m.child, shared) + "</td>";
    h += '<td class="mk-al mk-parent">' + alleleText(m.alleged_parent, shared) + "</td>";
    h += '<td class="mk-glyph" aria-hidden="true"><div class="chart-host" data-glyph="' + i + '"></div></td>';
    h += '<td class="mk-pi"><span class="mk-pi-k" aria-hidden="true">PI </span>' + pi + "</td>";
    h += '<td class="mk-bar" aria-hidden="true"><div class="chart-host" data-bar="' + i + '"></div></td>';
    h += "</tr>";
    if (note) h += '<tr class="mk-noterow mk-' + klass + '" data-note="' + i + '"><td colspan="7">' + esc(note) + "</td></tr>";
    return h;
  }

  // Orden y filtro de la lista de marcadores (viven sólo en memoria).
  function markerOrder(r) {
    var idx = r.markers.map(function (_, i) { return i; });
    var cls = function (i) { return E.statusClass(r.markers[i]); };
    if (state.filter !== "all") idx = idx.filter(function (i) { return cls(i) === state.filter; });
    if (state.sort === "pi") {
      var weight = function (i) { return C.isUsed(r.markers[i]) ? Math.log10(r.markers[i].pi) : -Infinity; };
      idx.sort(function (a, b) { return weight(b) - weight(a) || a - b; });
    } else if (state.sort === "status") {
      idx.sort(function (a, b) { return STATUS_RANK[cls(a)] - STATUS_RANK[cls(b)] || a - b; });
    }
    return idx;
  }

  function renderMarkerRows() {
    var r = state.result;
    var body = document.getElementById("markers-body");
    if (!r || !body) return;
    var order = markerOrder(r);
    var group = function (title, n) { return '<tr class="mk-group"><th colspan="7" scope="colgroup">' + esc(title) + " (" + n + ")</th></tr>"; };
    var h = "";
    var rest = order;
    if (state.filter === "all" && state.sort === "lab") {
      var review = order.filter(function (i) { var k = E.statusClass(r.markers[i]); return k === "bad" || k === "warn"; });
      if (review.length && review.length < order.length) {
        rest = order.filter(function (i) { return review.indexOf(i) === -1; });
        h += group("Para revisar", review.length);
        review.slice(0, REVIEW_CAP).forEach(function (i) { h += renderMarkerRow(r, i); });
        if (review.length > REVIEW_CAP) {
          h += '<tr class="mk-noterow"><td colspan="7">… y ' + (review.length - REVIEW_CAP) + " más. Usa los filtros para verlos todos.</td></tr>";
        }
        h += group("Resto", rest.length);
      }
    }
    var shown = Math.min(rest.length, state.markersVisible);
    for (var k = 0; k < shown; k++) h += renderMarkerRow(r, rest[k]);
    if (!order.length) h += '<tr class="mk-noterow"><td colspan="7">Ningún marcador con este filtro.</td></tr>';
    body.innerHTML = h;
    var more = document.getElementById("markers-more");
    var left = rest.length - shown;
    more.hidden = left <= 0;
    if (left > 0) more.textContent = "Mostrar " + Math.min(MARKER_PAGE, left) + " marcadores más (quedan " + left + ")";
    all("[data-filter]", dom.resultsRoot).forEach(function (b) { b.setAttribute("aria-pressed", b.dataset.filter === state.filter ? "true" : "false"); });
  }

  function limitsHtml() {
    return LIMITS.map(function (t) { return "<li>" + t + "</li>"; }).join("");
  }

  function renderResults() {
    var r = state.result;
    dom.resultsActions.hidden = !r;
    renderReportMeta(r);
    if (!r) {
      var title = state.hadResult ? "Los datos cambiaron" : "Aquí verás el reporte";
      var text = state.hadResult
        ? "Modificaste la tabla o los parámetros. Vuelve a pulsar Analizar para actualizar la lectura de triaje."
        : "Carga marcadores en Análisis y pulsa Analizar.";
      dom.resultsRoot.innerHTML =
        '<div class="empty-state"><h1>' + esc(title) + "</h1><p>" + esc(text) +
        '</p><button class="btn btn-primary" type="button" data-goto="analysis">Ir a Análisis</button></div>';
      return;
    }

    var reading = readingOf(r);
    var tone = reading.tone;
    var verdict = sentence(reading.verdict);
    var insights = reading.insights;
    var sup = reading.sup;
    var conclusion = sentence(reading.conclusion);
    var counts = { ok: 0, bad: 0, warn: 0, skip: 0 };
    r.markers.forEach(function (m) { counts[E.statusClass(m)] += 1; });
    var anyNumeric = r.markers.some(function (m) { return m.child.concat(m.alleged_parent).some(function (a) { return C.repeatPos(a, m.marker) !== null; }); });

    var h = '<div class="report">';

    // cabecera: veredicto + tres cifras
    h += '<section class="report-head tone-' + tone + '" aria-labelledby="verdict-title">';
    h += '<div class="verdict-block"><p class="eyebrow">Lectura de triaje · preliminar</p>';
    h += '<h1 class="verdict" id="verdict-title" tabindex="-1"><span class="verdict-mark">' + VERDICT_ICON[tone] + "</span><span>" + esc(verdict) + "</span></h1>";
    h += '<p class="conclusion">' + esc(conclusion) + "</p>";
    h += '<p class="disclaimer-line">No sustituye el dictamen de un laboratorio acreditado ni la revisión pericial.</p></div>';
    h += '<dl class="stats">';
    var top = C.headline(r); // mismas cifras que el reporte exportado
    h += '<div class="stat stat-main"><dt>Probabilidad posterior</dt><dd>';
    if (!sup) {
      h += '<span class="num is-empty" aria-hidden="true">—</span><span class="sub">' + esc(top.blocked) + "</span>";
    } else {
      h += '<span class="num">' + esc(top.posterior) + "</span>";
      h += '<span class="level level-' + top.level.key + '">' + esc(top.level.label) + "</span>";
    }
    h += "</dd></div>";
    h += '<div class="stat"><dt>CPI</dt><dd>';
    if (!sup) h += '<span class="num is-empty" aria-hidden="true">—</span><span class="sub">' + esc(top.cpiNote) + "</span>";
    else h += '<span class="num">' + esc(top.cpi) + '</span><span class="sub">' + esc(top.cpiNote) + "</span>";
    h += "</dd></div>";
    h += '<div class="stat"><dt>Compatibles</dt><dd><span class="num">' + r.compatible_markers + '<span class="of"><span aria-hidden="true"> / </span><span class="sr-only"> de </span>' + r.total_markers + "</span></span>";
    var sub = [r.exclusions === 1 ? "1 incongruencia" : r.exclusions + " incongruencias"];
    if (r.missing_markers) sub.push(r.missing_markers + " incompleto(s)");
    h += '<span class="sub">' + esc(sub.join(" · ")) + "</span></dd></div>";
    h += "</dl></section>";

    // observaciones de control (capa adicional del motor) y advertencias: califican el veredicto
    if (insights.length) {
      h += '<section class="panel panel-insights" aria-labelledby="ins-title"><div class="panel-head"><h2 id="ins-title">Observaciones de control</h2>';
      h += '<span class="hint">Comprobaciones automáticas sobre los datos capturados</span></div><ul class="insight-list">';
      insights.forEach(function (o) {
        h += '<li class="insight insight-' + esc(o.level) + '"><span class="insight-mark" aria-hidden="true">' + (o.level === "alert" ? "!" : "i") + "</span><div><strong>" +
          esc(o.title) + "</strong><p>" + esc(o.text) + "</p></div></li>";
      });
      h += "</ul></section>";
    }
    if (r.warnings.length) {
      h += '<section class="panel panel-warn" aria-labelledby="warn-title"><div class="panel-head"><h2 id="warn-title">Advertencias</h2>';
      h += '<span class="hint">' + r.warnings.length + "</span></div>";
      h += '<ul class="warn-list">' + r.warnings.map(function (w) { return "<li>" + esc(w) + "</li>"; }).join("") + "</ul></section>";
    }

    // soporte estadístico: sólo cuando hay CPI
    if (sup) {
      var sen = C.supportSentences(r);
      h += '<section class="panel" aria-labelledby="sup-title"><div class="panel-head"><h2 id="sup-title">Soporte estadístico</h2>';
      h += '<span class="hint">Dónde cae el CPI y cómo lo construyen los índices del laboratorio</span></div>';
      h += '<div class="chart-host" data-chart="support"></div>';
      h += '<div class="takeaways"><p>' + esc(sen.distance) + "</p>";
      if (sen.composition) h += "<p" + (sen.compositionAlert ? ' class="is-alert"' : "") + ">" + esc(sen.composition) + "</p>";
      h += "</div>";
      h += '<div class="chart-host prior-host" data-chart="prior"></div>';
      h += '<div class="takeaways"><p>' + esc(sen.prior) + "</p></div></section>";
    }

    // alelos comparados
    h += '<section class="panel" aria-labelledby="markers-res-title"><div class="panel-head"><h2 id="markers-res-title">Alelos comparados</h2>';
    h += '<span class="hint">Esquema: la posición indica el alelo; la altura no representa señal del equipo.</span></div>';
    h += '<div class="mk-tools"><div class="chips" role="group" aria-label="Filtrar marcadores por estado">';
    h += '<button class="chip" type="button" data-filter="all" aria-pressed="true">Todos <b>' + r.markers.length + "</b></button>";
    [["bad", "Incongruencias"], ["warn", "Incompletos"], ["skip", "No informativos"]].forEach(function (f) {
      if (!counts[f[0]]) return;
      h += '<button class="chip chip-' + f[0] + '" type="button" data-filter="' + f[0] + '" aria-pressed="false"><span aria-hidden="true">' +
        STATUS_MARK[f[0]] + "</span> " + f[1] + " <b>" + counts[f[0]] + "</b></button>";
    });
    h += '</div><label class="sort"><span>Orden</span><select class="select select-inline" id="markers-sort">' +
      '<option value="lab">del laboratorio</option><option value="pi">por peso (PI)</option><option value="status">por estado</option></select></label></div>';
    if (counts.bad + counts.warn > 0 || r.markers.length > 24) {
      h += '<div class="chart-host lane-host" data-chart="lane" title="Carril: un trazo por marcador. Pulsa uno para ir a su fila."></div>';
    }
    h += '<div class="mk-scroll"><table class="mk-table"><thead><tr>';
    h += '<th scope="col">Marcador</th><th scope="col">Estado</th>';
    h += '<th scope="col"><span class="grp">' + TRI_UP + "Hijo/a</span></th>";
    h += '<th scope="col"><span class="grp">' + TRI_DOWN + "Progenitor/a</span></th>";
    h += '<th scope="col" class="mk-glyph-h" aria-hidden="true">Alelos' + (anyNumeric ? " · 1 punto = 1 repetición" : "") + "</th>";
    h += '<th scope="col" class="mk-pi">PI</th><th scope="col" class="mk-bar" aria-hidden="true"><div class="chart-host" data-chart="piaxis"></div></th>';
    h += '</tr></thead><tbody id="markers-body"></tbody></table></div>';
    h += '<button class="btn btn-ghost markers-more" type="button" id="markers-more" hidden></button>';
    h += "</section>";

    // límites: siempre al final del reporte
    h += '<details class="panel limits-panel"><summary>Alcances y límites de este análisis</summary><ul class="limits-list">' + limitsHtml() + "</ul></details>";
    h += '<div class="report-end"><button class="btn" type="button" data-goto="analysis">← Editar datos</button>' +
      '<button class="btn btn-ghost danger" type="button" id="new-case">Nuevo caso</button></div>';
    h += "</div>";
    dom.resultsRoot.innerHTML = h;
    $("markers-sort").value = state.sort;
    renderMarkerRows();
    if (state.view === "results") paintResults();
  }

  // Los SVG se dibujan al ancho real de cada contenedor (1 unidad = 1 px).
  function paintResults() {
    var r = state.result;
    if (!r || state.view !== "results") return;
    var root = dom.resultsRoot;
    var one = function (name) { return root.querySelector('[data-chart="' + name + '"]'); };
    var host = one("support");
    if (host && host.clientWidth) {
      host.innerHTML = C.supportFigure(r, host.clientWidth);
      var prior = one("prior");
      var strip = C.priorStrip(r, prior.clientWidth);
      prior.innerHTML = strip;
      prior.hidden = !strip;
    }
    var lane = one("lane");
    if (lane && lane.clientWidth) lane.innerHTML = C.laneNav(r, lane.clientWidth);
    var glyphs = all("[data-glyph]", root);
    if (glyphs.length && glyphs[0].clientWidth) {
      var gw = glyphs[0].clientWidth;
      var unit = C.glyphUnit(r, gw);
      glyphs.forEach(function (g) { g.innerHTML = C.alleleGlyph(r.markers[Number(g.dataset.glyph)], unit, gw); });
    }
    var bars = all("[data-bar]", root);
    var axis = one("piaxis");
    var max = C.piAxisMax(r);
    var bw = bars.length ? bars[0].clientWidth : 0;
    if (axis) axis.innerHTML = bw ? C.piAxis(max, bw) : "";
    if (bw) bars.forEach(function (b) { b.innerHTML = C.piBar(r.markers[Number(b.dataset.bar)], max, bw); });
    if (state.animate) {
      // la animación de entrada ocurre una vez por análisis, no al cambiar de pestaña
      state.animate = false;
      root.classList.remove("is-animating");
      void root.offsetWidth;
      root.classList.add("is-animating");
      setTimeout(function () { root.classList.remove("is-animating"); }, 1000);
    }
  }

  // Vistas enlazadas: del carril o de la franja de aporte a la fila del marcador.
  function revealMarker(i) {
    var r = state.result;
    if (!r || !r.markers[i]) return;
    if (!document.getElementById("mk-" + i)) {
      state.filter = "all";
      state.sort = "lab";
      $("markers-sort").value = "lab";
      var k = E.statusClass(r.markers[i]);
      if (k !== "bad" && k !== "warn") {
        var rest = markerOrder(r).filter(function (j) { var c = E.statusClass(r.markers[j]); return c !== "bad" && c !== "warn"; });
        state.markersVisible = Math.max(state.markersVisible, rest.indexOf(i) + 1);
      }
      renderMarkerRows();
      paintResults();
    }
    var row = document.getElementById("mk-" + i);
    if (!row) return;
    row.scrollIntoView({ block: "center", behavior: P.reducedMotion() ? "auto" : "smooth" });
    row.classList.add("is-target");
    setTimeout(function () { row.classList.remove("is-target"); }, 1600);
  }

  function setHot(i, on) {
    all('[data-i="' + i + '"]', dom.resultsRoot).forEach(function (el) { el.classList.toggle("is-hot", on); });
  }

  /* ------------------------------------------------------------- vistas */
  var heroHandle = null;

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
    document.title = VIEW_TITLE[view] + " · ariADNa";
    updateButtons();
    if (!opts.keepHash) {
      try {
        history.replaceState(null, "", "#" + VIEW_HASH[view]);
      } catch (err) {
        /* file:// o entorno sin history */
      }
    }
    if (!opts.keepScroll) window.scrollTo(0, 0);
    if (view === "results") paintResults();
    if (view === "home") startHero();
    guideSync();
  }

  // De la portada a la herramienta: un breve cargador con el logotipo.
  function openTool() {
    if (P.reducedMotion() || !dom.toolLoader) {
      showView("analysis");
      $("tab-analysis").focus();
      return;
    }
    var loader = dom.toolLoader;
    loader.classList.remove("is-leaving");
    loader.hidden = false;
    setTimeout(function () {
      showView("analysis");
      loader.classList.add("is-leaving");
      setTimeout(function () {
        loader.hidden = true;
        loader.classList.remove("is-leaving");
        $("tab-analysis").focus();
      }, 220);
    }, 720);
  }

  function navigate(view) {
    if (view === "analysis" && state.view === "home") openTool();
    else showView(view);
  }

  function routeFromHash() {
    var hash = decodeURIComponent((location.hash || "").replace(/^#/, ""));
    if (!hash || hash === "inicio") return showView("home", { keepHash: true });
    if (hash === "analisis") return showView("analysis", { keepHash: true });
    if (hash === "resultados") return showView("results", { keepHash: true });
    if (hash === "acerca") return showView("about", { keepHash: true });
    var target = document.getElementById(hash);
    var owner = target && ["about", "home"].filter(function (v) { return dom.views[v].contains(target); })[0];
    if (owner) {
      showView(owner, { keepHash: true, keepScroll: true });
      target.scrollIntoView({ block: "start" });
    } else {
      showView("home", { keepHash: true });
    }
  }

  /* --------------------------------------------- portada y pantalla de carga */
  function startHero() {
    if (heroHandle || !window.AriadnaHelix || !dom.heroCanvas || state.view !== "home") return;
    if (dom.splash && !dom.html.classList.contains("no-splash")) return; // espera a que termine la animación de inicio
    try {
      heroHandle = window.AriadnaHelix.ambient(dom.heroCanvas, { reducedMotion: P.reducedMotion() });
    } catch (err) {
      heroHandle = null; // la ilustración es decorativa: si falla, la portada sigue funcionando
    }
  }

  function runSplash(replay) {
    var splash = dom.splash;
    if (!splash) return;
    if (replay) dom.html.classList.remove("no-splash");
    if (dom.html.classList.contains("no-splash")) {
      startHero();
      return;
    }
    var done = false;
    var handle = null;
    dom.shell.inert = true;
    function finish() {
      if (done) return;
      done = true;
      P.markIntroSeen();
      document.removeEventListener("keydown", skip, true);
      splash.removeEventListener("click", skip);
      splash.classList.add("is-leaving");
      dom.shell.inert = false;
      setTimeout(function () {
        dom.html.classList.add("no-splash");
        splash.classList.remove("is-leaving");
        startHero();
      }, 520);
    }
    function skip(event) {
      if (event && event.type === "keydown" && (event.key === "Tab" || event.key === "Shift")) return;
      if (handle) handle.skip();
      finish();
    }
    document.addEventListener("keydown", skip, true);
    splash.addEventListener("click", skip);
    try {
      handle = window.AriadnaHelix ? window.AriadnaHelix.intro(dom.splashCanvas, { reducedMotion: P.reducedMotion() }) : null;
    } catch (err) {
      handle = null;
    }
    if (handle && handle.finished) handle.finished.then(finish, finish);
    else setTimeout(finish, 900);
    if (replay && dom.splashSkip) dom.splashSkip.focus();
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
        guideSync();
      }
      function onClick(event) {
        var btn = event.target.closest("[data-close]");
        if (btn) finish(btn.dataset.close);
        else if (event.target === dlg && dlg.classList.contains("drawer")) finish("cancel"); // clic en el fondo
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
      guideSync();
    });
  }

  function dialogOpen() {
    return !!document.querySelector("dialog[open]");
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
        " Revisa que tenga columnas reconocibles de marcador y genotipos/alelos (por ejemplo: marcador, hijo_a1, hijo_a2, progenitor_a1, progenitor_a2, pi).",
    });
  }

  function importFile(file) {
    if (!file) return;
    guideStarted();
    if (file.size > MAX_IMPORT_BYTES) {
      showImportError(
        userError(
          "El archivo es demasiado grande para esta versión: " + E.pyFormatF(file.size / 1048576, 1) +
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

  // Si el CSV no corresponde al ensayo elegido pero sí a otro, lo ofrece en vez de fallar.
  function assayThatFits(raw) {
    return ASSAYS.filter(function (a) {
      if (a === state.assay) return false;
      try {
        E.validateCsvColumns(raw, a);
        return true;
      } catch (err) {
        return false;
      }
    })[0];
  }

  function importText(name, text, opts) {
    var isVcf = /\.vcf$/i.test(name);
    var switched = false;
    if (isVcf && state.assay !== "snp_panel") {
      setAssay("snp_panel", { silent: true });
      switched = true;
    }
    var flow;
    if (isVcf) {
      var samples = E.readVcfSampleNames(text);
      flow = chooseVcfSamples(samples).then(function (choice) {
        if (!choice) return null;
        var rawVcf = E.readVcfSnpRows(text, choice.child, choice.parent);
        checkRowLimit(rawVcf.length);
        return {
          rows: E.canonicalizeRows(rawVcf, "snp_panel"),
          warnings: E.vcfSampleSelectionWarnings(samples, choice.child, choice.parent).concat(E.markerInputWarnings(rawVcf, "snp_panel")),
          detail: " Hijo/a: " + choice.child + "; progenitor/a alegado/a: " + choice.parent + ".",
        };
      });
    } else {
      var raw = E.readCsvRows(text);
      var gate = Promise.resolve(true);
      try {
        E.validateCsvColumns(raw, state.assay);
      } catch (err) {
        var other = err.name === "ValueError" ? assayThatFits(raw) : null;
        if (!other) throw err;
        gate = confirmDialog(
          "Cambiar de ensayo",
          "Este archivo no tiene las columnas de «" + ASSAY_SHORT[state.assay] + "», pero sí las de «" + ASSAY_SHORT[other] + "». ¿Cambiar el ensayo e importarlo?",
          "Cambiar e importar"
        ).then(function (ok) {
          if (ok) {
            setAssay(other, { silent: true });
            switched = true;
          }
          return ok;
        });
      }
      flow = gate.then(function (ok) {
        if (!ok) return null;
        checkRowLimit(raw.length);
        return { rows: E.canonicalizeRows(raw, state.assay), warnings: E.markerInputWarnings(raw, state.assay), detail: "" };
      });
    }
    return flow.then(function (out) {
      if (!out) return;
      var assay = state.assay;
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
      if (switched) body += " Cambiamos el ensayo a «" + ASSAY_SHORT[assay] + "».";
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
      checkDecimalCommas();
    });
  }

  function loadExample(id) {
    var ex = (window.AriadnaExamples || []).filter(function (e) { return e.id === id; })[0];
    if (!ex) return;
    guideStarted();
    var go = dataRowCount(ex.assay) > 0
      ? confirmDialog("Cargar ejemplo", "Se reemplazarán los marcadores de la tabla de «" + ASSAY_SHORT[ex.assay] + "» con datos sintéticos. ¿Quieres continuar?", "Reemplazar")
      : Promise.resolve(true);
    go.then(function (ok) {
      if (!ok) return;
      if (state.assay !== ex.assay) setAssay(ex.assay, { silent: true });
      Promise.resolve()
        .then(function () { return importText(ex.filename, ex.text, { example: true }); })
        .catch(showImportError);
    });
  }

  // "9,3" en un alelo STR: el motor lo leería como dos alelos (9 y 3). Nunca se corrige en silencio.
  var DECIMAL_COMMA = /^\s*\d{1,2}\s*,\s*\d\s*$/;

  function alleleKeysOf(assay) {
    return COLUMNS[assay].filter(function (c) { return c.group === "child" || c.group === "parent"; }).map(function (c) { return c.key; });
  }

  function checkDecimalCommas() {
    if (state.assay !== "str_ce" && state.assay !== "str_mps") return;
    var keys = alleleKeysOf(state.assay);
    var hits = [];
    currentTable().forEach(function (row) {
      keys.forEach(function (k) { if (DECIMAL_COMMA.test(row.values[k] || "")) hits.push(row.values[k].trim()); });
    });
    if (!hits.length) return;
    setNotice({
      tone: "warn",
      title: "Detectamos coma decimal en " + hits.length + " alelo(s)",
      body: "Por ejemplo «" + hits[0] + "». En esta tabla la coma separa dos alelos, así que se leería como dos valores distintos. Si es un microvariante (como 9.3), conviértelo a punto.",
      actions: [
        {
          label: "Convertir a punto",
          run: function () {
            currentTable().forEach(function (row) {
              keys.forEach(function (k) { if (DECIMAL_COMMA.test(row.values[k] || "")) row.values[k] = row.values[k].replace(/\s*,\s*/, ".").trim(); });
            });
            renderTable();
            invalidate();
            setNotice({ tone: "ok", title: "Alelos convertidos", body: "Cambiamos la coma decimal por punto en " + hits.length + " alelo(s). Revisa la tabla." });
          },
        },
        { label: "Dejar como está", run: function () { setNotice(null); } },
      ],
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

  // Aviso de alcances y límites antes del primer análisis de cada visita.
  function confirmLimits() {
    if (state.limitsAck || P.get("limits") !== "on") return Promise.resolve(true);
    dom.limitsSkip.checked = false;
    return openDialog(dom.dlgLimits).then(function (v) {
      if (v !== "ok") return false;
      state.limitsAck = true;
      if (dom.limitsSkip.checked) {
        P.set("limits", "off");
        syncSettings();
      }
      return true;
    });
  }

  function analyze() {
    var prior = readPrior();
    if (prior === null) {
      dom.prior.focus();
      return;
    }
    var rows = engineRows();
    if (!rows.length) {
      setNotice({ tone: "warn", title: "Faltan datos", body: "Agrega o importa al menos un marcador." });
      dom.noticeSlot.scrollIntoView({ block: "nearest" });
      guideRestart();
      return;
    }
    confirmLimits().then(function (ok) {
      if (!ok) return;
      // la previa que se usa es exactamente la que se imprime en el reporte
      prior = Number(E.pyFormatF(prior, 2));
      dom.prior.value = E.pyFormatF(prior, 2);
      try {
        state.result = E.analyzeMarkers(state.assay, rows, prior);
        state.markersVisible = MARKER_PAGE;
        state.filter = "all";
        state.sort = "lab";
        state.hadResult = true;
        state.exported = false;
        state.animate = true;
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
      guideDone();
      renderResults();
      updateStatus();
      showView("results");
      var verdict = $("verdict-title");
      if (verdict) verdict.focus({ preventScroll: true }); // el lector de pantalla anuncia el veredicto
    });
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
    var ids = {
      case_id: dom.caseId.value.trim(),
      child_id: dom.childId.value.trim(),
      parent_id: dom.parentId.value.trim(),
    };
    var hasIds = !!(ids.case_id || ids.child_id || ids.parent_id);
    dom.exportIds.hidden = !hasIds;
    dom.exportIdsText.textContent = [ids.case_id, ids.child_id, ids.parent_id].filter(Boolean).join(" · ");
    var anonRadio = dom.exportIds.querySelector('input[value="anon"]');
    anonRadio.checked = true;
    openDialog(dom.dlgExport).then(function (choice) {
      if (choice !== "ok") return;
      var withIds = hasIds && !anonRadio.checked;
      var metadata;
      var filename = "reporte_ariadna.html";
      if (!withIds) {
        metadata = { case_id: "Omitido", child_id: "Omitido", parent_id: "Omitido", report_mode: "anonimizado; omite identificadores, conserva genotipos" };
      } else {
        metadata = { case_id: ids.case_id, child_id: ids.child_id, parent_id: ids.parent_id, report_mode: "con identificadores capturados" };
        if (ids.case_id) filename = "reporte_ariadna_" + safeName(ids.case_id) + ".html";
      }
      try {
        download(filename, R.buildHtmlReport(state.result, metadata, reportExtras(true)), "text/html;charset=utf-8");
      } catch (err) {
        toast("No pudimos guardar el reporte.");
        return;
      }
      state.exported = true;
      updateStatus();
      toast("Reporte descargado: " + filename);
    });
  }

  // Añadidos de la versión web al reporte (el motor base queda intacto si no se pasan).
  // `figures` sólo aplica al HTML exportado: lleva las mismas figuras que la pantalla.
  function reportExtras(withFigures) {
    var reading = readingOf(state.result);
    var extras = {
      cap_posterior: true,
      verdict: [reading.tone, reading.verdict],
      conclusion: reading.conclusion,
      insights: reading.insights,
      limits: LIMITS,
    };
    if (withFigures) extras.figures = C.reportFigures(state.result);
    return extras;
  }

  function copySummary() {
    if (!state.result) return;
    var text = R.resultToText(state.result, reportExtras());
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
    return !!(ids || anyTableData() || state.result || state.exported);
  }

  function clearCase() {
    var go = anyCaseData()
      ? confirmDialog(
          "Limpiar caso",
          "Se borrarán identificadores, marcadores capturados y resultados en memoria. No se borran archivos HTML que ya hayas exportado. ¿Quieres continuar?",
          "Limpiar caso"
        )
      : Promise.resolve(true);
    return go.then(function (ok) {
      if (!ok) return false;
      dom.caseId.value = "";
      dom.childId.value = "";
      dom.parentId.value = "";
      dom.idsDetails.open = false;
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
      return true;
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

  /* -------------------------------------------------------------- ensayo */
  function setAssay(assay, opts) {
    var previous = state.assay;
    var kept = previous !== assay ? dataRowCount(previous) : 0;
    state.assay = assay;
    dom.assay.value = assay;
    if (!state.tables[assay].length) state.tables[assay] = blankRowsFor(assay, DEFAULT_ROWS);
    state.visible = PAGE;
    state.notice = null;
    renderNotice();
    renderTable();
    invalidate(); // un resultado de otro ensayo ya no corresponde a lo que hay en pantalla
    if (kept && !(opts && opts.silent)) {
      setNotice({
        tone: "info",
        title: "Cambiaste de ensayo",
        body: "Tus " + kept + " marcador(es) de «" + ASSAY_SHORT[previous] + "» siguen guardados en memoria; vuelve a ese ensayo para verlos.",
      });
    }
  }

  /* -------------------------------------------------------------- toast */
  var toastTimer = null;
  function toast(message) {
    dom.toast.hidden = false;
    dom.toast.textContent = "";
    clearTimeout(toastTimer);
    // el texto se escribe con la región ya visible para que los lectores de pantalla lo anuncien
    setTimeout(function () { dom.toast.textContent = message; }, 30);
    toastTimer = setTimeout(function () {
      dom.toast.textContent = "";
      dom.toast.hidden = true;
    }, 5000);
  }

  /* ------------------------------------------------- configuración y ayuda */
  function syncSettings() {
    all("[data-theme-choice]", dom.dlgSettings).forEach(function (b) {
      b.setAttribute("aria-pressed", b.dataset.themeChoice === P.get("theme") ? "true" : "false");
    });
    all("[data-accent-choice]", dom.dlgSettings).forEach(function (b) {
      b.setAttribute("aria-pressed", b.dataset.accentChoice === P.get("accent") ? "true" : "false");
    });
    dom.setIntro.checked = P.get("intro") === "on";
    dom.setLimits.checked = P.get("limits") === "on";
  }

  function showPane(name) {
    all("[data-pane]", dom.dlgSettings).forEach(function (b) { b.setAttribute("aria-pressed", b.dataset.pane === name ? "true" : "false"); });
    dom.paneLook.hidden = name !== "look";
    dom.paneHelp.hidden = name !== "help";
  }

  function openSettings(pane, helpId) {
    syncSettings();
    showPane(pane || "look");
    var after = null;
    openDialog(dom.dlgSettings, function (event, finish) {
      var t = event.target;
      var paneBtn = t.closest("[data-pane]");
      var themeBtn = t.closest("[data-theme-choice]");
      var accentBtn = t.closest("[data-accent-choice]");
      if (paneBtn) showPane(paneBtn.dataset.pane);
      else if (themeBtn) P.set("theme", themeBtn.dataset.themeChoice);
      else if (accentBtn) P.set("accent", accentBtn.dataset.accentChoice);
      else if (t.closest("#replay-intro")) {
        after = function () { runSplash(true); };
        finish("ok");
        return;
      } else if (t.closest("#replay-coach")) {
        after = guideReplay;
        finish("ok");
        return;
      }
      syncSettings();
    }).then(function () {
      if (after) after();
      else dom.settingsBtn.focus();
    });
    if (helpId) {
      var section = document.getElementById(helpId);
      if (section) {
        section.open = true;
        section.scrollIntoView({ block: "start" });
      }
    }
  }

  /* --------------------------------------------------------- guía de inicio */
  // Una mano señala dónde empezar ("Probar con un ejemplo") y, con datos cargados, el botón Analizar.
  // Es decorativa: no recibe foco ni clics, y desaparece en cuanto la persona empieza.
  var guideTimer = null;
  var GUIDES = [
    { key: "start", el: "guideStart", target: "startExample", tip: "guide-start-tip" },
    { key: "wait", el: "guideAnalyze", target: "analyzeBtn", tip: "guide-analyze-tip" },
  ];

  function guideHide(g) {
    var el = dom[g.el];
    if (el.hidden) return;
    el.hidden = true;
    el.classList.remove("is-playing");
    dom[g.target].classList.remove("is-guided");
    dom[g.target].removeAttribute("aria-describedby");
  }

  function guidePlay(el) {
    el.classList.remove("is-playing");
    void el.offsetWidth;
    el.classList.add("is-playing");
  }

  function guideWanted() {
    if (state.guide === "done" || state.view !== "analysis" || state.result || dialogOpen()) return null;
    if (dom.splash && !dom.html.classList.contains("no-splash")) return null;
    var data = dataRowCount() > 0;
    if (state.guide === "start") return anyTableData() ? null : "start";
    return data ? "wait" : null;
  }

  function guideSync(delay) {
    if (!dom.guideStart) return;
    var wanted = guideWanted();
    GUIDES.forEach(function (g) { if (g.key !== wanted) guideHide(g); });
    clearTimeout(guideTimer);
    if (!wanted) return;
    var g = GUIDES.filter(function (x) { return x.key === wanted; })[0];
    if (!dom[g.el].hidden) return;
    guideTimer = setTimeout(function () {
      if (guideWanted() !== wanted) return;
      dom[g.el].hidden = false;
      dom[g.target].classList.add("is-guided");
      dom[g.target].setAttribute("aria-describedby", g.tip);
      guidePlay(dom[g.el]);
    }, delay === undefined ? (wanted === "start" ? 700 : 500) : delay);
  }

  function guideStarted() {
    if (state.guide !== "start") return;
    state.guide = "wait";
    guideSync();
  }

  function guideRestart() {
    if (state.guide === "done") return;
    state.guide = "start";
    var visible = !dom.guideStart.hidden;
    guideSync(0);
    if (visible) guidePlay(dom.guideStart);
  }

  function guideDone() {
    if (state.guide === "done") return;
    state.guide = "done";
    P.set("coach", "done");
    clearTimeout(guideTimer);
    GUIDES.forEach(guideHide);
  }

  function guideReplay() {
    P.set("coach", "on");
    state.guide = anyTableData() ? "wait" : "start";
    showView("analysis");
    $("tab-analysis").focus();
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
    var hadData = dataRowCount() > 0;
    row.values[input.dataset.k] = input.value;
    if (row.warning) row.warning = ""; // la advertencia de importación ya no describe una fila editada
    guideStarted();
    invalidate();
    updateCount();
    if (hadData !== dataRowCount() > 0) {
      // aparece o desaparece el ejemplo fantasma de la primera fila
      all("input.cell[data-r=\"0\"]", dom.grid).forEach(function (cell) {
        var ghost = dataRowCount() === 0 ? PLACEHOLDERS[state.assay][cell.dataset.k] : "";
        if (ghost) cell.placeholder = ghost;
        else cell.removeAttribute("placeholder");
      });
    }
    guideSync(1500); // al escribir, la guía espera a que la persona haga una pausa
  }

  function moveRow(input, delta) {
    var r = Number(input.dataset.r) + delta;
    var key = input.dataset.k;
    if (r < 0) return;
    var table = currentTable();
    if (r >= table.length) {
      if (delta !== 1) return;
      table.push(blankRow());
      state.visible = Math.max(state.visible, table.length);
      renderTable();
    } else if (r >= state.visible) {
      state.visible = r + 1;
      renderTable();
    }
    focusCell(r, key);
  }

  function deleteRow(r, focusKey) {
    currentTable().splice(r, 1);
    if (!currentTable().length) state.tables[state.assay] = blankRowsFor(state.assay, 1);
    renderTable();
    invalidate();
    var next = Math.min(r, currentTable().length - 1);
    if (focusKey) focusCell(next, focusKey);
    else {
      var btn = dom.grid.querySelector('[data-del="' + next + '"]');
      if (btn) btn.focus();
    }
  }

  function onTableKeydown(event) {
    var input = event.target;
    if (!input.classList || !input.classList.contains("cell")) return;
    var mod = event.metaKey || event.ctrlKey;
    if (event.key === "Enter" && !mod && !event.altKey) {
      event.preventDefault();
      moveRow(input, event.shiftKey ? -1 : 1);
    } else if ((event.key === "ArrowDown" || event.key === "ArrowUp") && !mod && !event.altKey && !event.shiftKey) {
      event.preventDefault();
      if (event.key === "ArrowUp" || Number(input.dataset.r) + 1 < currentTable().length) moveRow(input, event.key === "ArrowDown" ? 1 : -1);
    } else if (event.key === "Backspace" && mod) {
      event.preventDefault();
      deleteRow(Number(input.dataset.r), input.dataset.k);
    }
  }

  function looksLikeHeader(cells) {
    var hits = cells.filter(function (c) {
      var t = c.trim().toLowerCase();
      return t && HEADER_WORDS.some(function (w) { return t === w || t.indexOf(w + " ") === 0 || t.indexOf(w + "_") === 0 || t.indexOf(" " + w) !== -1; });
    }).length;
    return hits >= 2 && !cells.some(function (c) { return /^\d+(?:[.,]\d+)?$/.test(c.trim()); });
  }

  function pasteGrid(text, startRow, startKey) {
    var trimmed = text.replace(/\r/g, "").replace(/\n+$/, "");
    var grid = trimmed.split("\n").map(function (line) { return line.split("\t"); });
    var skipped = false;
    if (grid.length > 1 && looksLikeHeader(grid[0])) {
      grid.shift();
      skipped = true;
    }
    var cols = COLUMNS[state.assay];
    var startCol = Math.max(0, cols.map(function (c) { return c.key; }).indexOf(startKey));
    var table = currentTable();
    if (startRow + grid.length > MAX_IMPORT_ROWS) {
      toast("Demasiadas filas para pegar (límite " + MAX_IMPORT_ROWS + ").");
      return;
    }
    grid.forEach(function (cells, i) {
      var r = startRow + i;
      while (table.length <= r) table.push(blankRow());
      table[r].warning = "";
      cells.forEach(function (value, j) {
        var col = cols[startCol + j];
        if (col) table[r].values[col.key] = value.trim();
      });
    });
    state.visible = Math.max(state.visible, Math.min(table.length, startRow + grid.length));
    guideStarted();
    renderTable();
    invalidate();
    toast("Pegamos " + grid.length + " fila(s)." + (skipped ? " Detectamos encabezados y no los pegamos como marcador." : ""));
    focusCell(startRow, cols[startCol].key);
    checkDecimalCommas();
  }

  function onTablePaste(event) {
    var input = event.target;
    if (!input.classList || !input.classList.contains("cell")) return;
    var text = (event.clipboardData || window.clipboardData).getData("text/plain") || "";
    if (!/[\t\n]/.test(text.replace(/\r/g, "").replace(/\n+$/, ""))) return;
    event.preventDefault();
    pasteGrid(text, Number(input.dataset.r), input.dataset.k);
  }

  // Pegar sin tener una celda enfocada: la tabla se llena desde la primera fila vacía.
  function onDocumentPaste(event) {
    if (state.view !== "analysis" || dialogOpen()) return;
    var t = event.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
    var text = event.clipboardData ? event.clipboardData.getData("text/plain") || "" : "";
    if (!/[\t\n]/.test(text.replace(/\r/g, "").replace(/\n+$/, ""))) return;
    event.preventDefault();
    var table = currentTable();
    var first = table.findIndex(function (row) { return !rowHasData(row); });
    pasteGrid(text, first === -1 ? table.length : first, COLUMNS[state.assay][0].key);
  }

  function onTableClick(event) {
    var del = event.target.closest("[data-del]");
    if (del) deleteRow(Number(del.dataset.del), null);
  }

  /* -------------------------------------------------------------- init */
  function init() {
    dom.html.classList.remove("no-js");

    // contenido estático generado
    dom.assay.innerHTML = ASSAYS.map(function (a) { return '<option value="' + a + '">' + esc(ASSAY_SHORT[a]) + "</option>"; }).join("");
    dom.rawList.innerHTML = RAW_OUTPUT_TYPES.map(function (t) { return "<dt>" + esc(t[0]) + "</dt><dd>" + esc(t[1]) + "</dd>"; }).join("");
    dom.limitsList.innerHTML = limitsHtml();

    var short = { str_ce: "STR CE", str_mps: "STR MPS", snp_panel: "SNP", microhap: "Microhap" };
    dom.examplesPanel.insertAdjacentHTML(
      "beforeend",
      (window.AriadnaExamples || [])
        .map(function (ex) {
          return '<button class="menu-item" type="button" data-example="' + esc(ex.id) + '">' + esc(ex.label) +
            '<span class="tag">' + esc(/\.vcf$/i.test(ex.filename) ? "VCF" : short[ex.assay]) + "</span></button>";
        })
        .join("") +
        '<div class="menu-sep" role="separator"></div><button class="menu-item" type="button" data-template>Descargar plantilla CSV<span class="tag">ensayo actual</span></button>'
    );

    document.getElementById("algo-version").textContent = E.ALGORITHM_VERSION;
    dom.aboutRoot.innerHTML = window.AriadnaAbout.html;
    var aboutAlgo = document.getElementById("about-algo");
    if (aboutAlgo) aboutAlgo.textContent = E.ALGORITHM_VERSION;
    dom.paneHelp.innerHTML = window.AriadnaHelp ? window.AriadnaHelp.html : "";

    var isMac = /Mac/i.test(navigator.platform || navigator.userAgent || "");
    dom.analyzeKbd.textContent = isMac ? "⌘ ↵" : "Ctrl ↵";

    state.tables.str_ce = blankRowsFor("str_ce", DEFAULT_ROWS);
    renderTable();
    renderResults();
    updateStatus();
    updateButtons();
    syncSettings();

    // pestañas
    dom.tabs.forEach(function (tab, i) {
      tab.addEventListener("click", function () { navigate(tab.dataset.view); });
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
      var t = event.target;
      var go = t.closest("[data-goto]");
      if (go) {
        showView(go.dataset.goto);
        $("tab-" + go.dataset.goto).focus();
      }
      if (t.closest("[data-open-tool]")) openTool();
      if (t.closest("[data-open-help]")) {
        event.preventDefault();
        openSettings("help", t.closest("[data-open-help]").dataset.openHelp || null);
      }
      if (t.closest("[data-dismiss]")) setNotice(null);
      var action = t.closest("[data-notice-action]");
      if (action && noticeActions[action.dataset.noticeAction]) noticeActions[action.dataset.noticeAction]();
      if (t.closest("[data-guide-close]")) {
        var target = t.closest(".guide-anchor").querySelector("button:not(.guide-close)");
        guideDone();
        if (target) target.focus();
      }
      if (dom.examplesMenu.open && !dom.examplesMenu.contains(t)) dom.examplesMenu.open = false;
    });

    // caso y parámetros
    [dom.caseId, dom.childId, dom.parentId].forEach(function (input) {
      input.addEventListener("input", function () { renderReportMeta(state.result); });
    });
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
    dom.assay.addEventListener("change", function () { setAssay(dom.assay.value); });
    dom.importBtn.addEventListener("click", function () { dom.fileInput.click(); });
    dom.startImport.addEventListener("click", function () { dom.fileInput.click(); });
    dom.startExample.addEventListener("click", function () { loadExample("str_ce_compatible"); });
    dom.startType.addEventListener("click", function () {
      guideStarted();
      focusCell(0, COLUMNS[state.assay][0].key);
    });
    dom.rawHelpBtn.addEventListener("click", function () { openDialog(dom.dlgRaw).then(function () { dom.rawHelpBtn.focus(); }); });
    dom.fileInput.addEventListener("change", function () {
      var file = dom.fileInput.files && dom.fileInput.files[0];
      dom.fileInput.value = "";
      importFile(file);
    });
    dom.examplesPanel.addEventListener("click", function (event) {
      var item = event.target.closest("[data-example]");
      var template = event.target.closest("[data-template]");
      if (!item && !template) return;
      dom.examplesMenu.querySelector("summary").focus();
      dom.examplesMenu.open = false;
      if (item) loadExample(item.dataset.example);
      else download("plantilla_ariadna_" + state.assay + ".csv", CSV_TEMPLATES[state.assay], "text/csv;charset=utf-8");
    });
    dom.examplesMenu.addEventListener("focusout", function (event) {
      if (event.relatedTarget && !dom.examplesMenu.contains(event.relatedTarget)) dom.examplesMenu.open = false;
    });
    dom.grid.addEventListener("input", onTableInput);
    dom.grid.addEventListener("keydown", onTableKeydown);
    dom.grid.addEventListener("paste", onTablePaste);
    dom.grid.addEventListener("click", onTableClick);
    dom.grid.addEventListener("pointerdown", function (event) {
      if (event.target.classList && event.target.classList.contains("cell")) guideStarted();
    });
    document.addEventListener("paste", onDocumentPaste);
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
      if (!event.dataTransfer || Array.prototype.indexOf.call(event.dataTransfer.types, "Files") === -1) return;
      event.preventDefault();
      dragDepth += 1;
      dom.dropOverlay.hidden = false;
      guideStarted();
    });
    dom.dataCard.addEventListener("dragover", function (event) { event.preventDefault(); });
    dom.dataCard.addEventListener("dragleave", function () {
      dragDepth = Math.max(0, dragDepth - 1);
      if (!dragDepth) dom.dropOverlay.hidden = true;
    });
    dom.dataCard.addEventListener("drop", function (event) {
      event.preventDefault();
      dragDepth = 0;
      dom.dropOverlay.hidden = true;
      importFile(event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0]);
    });
    window.addEventListener("dragover", function (event) { event.preventDefault(); });
    window.addEventListener("drop", function (event) { event.preventDefault(); });

    // acciones
    dom.analyzeBtn.addEventListener("click", analyze);
    dom.exportBtn2.addEventListener("click", exportFlow);
    dom.copyBtn.addEventListener("click", copySummary);
    dom.helpBtn.addEventListener("click", function () { openSettings("help", "help-leer"); });
    dom.settingsBtn.addEventListener("click", function () { openSettings("look"); });
    dom.clearCase.addEventListener("click", clearCase);
    dom.setIntro.addEventListener("change", function () { P.set("intro", dom.setIntro.checked ? "on" : "off"); });
    dom.setLimits.addEventListener("change", function () { P.set("limits", dom.setLimits.checked ? "on" : "off"); });
    P.onChange(function (name) {
      if ((name === "theme" || name === "accent") && state.view === "results") paintResults();
    });

    // informe: filtros, orden, paginación y vistas enlazadas (delegación; la CSP no admite manejadores en línea)
    dom.resultsRoot.addEventListener("click", function (event) {
      if (!state.result) return;
      var t = event.target;
      var chip = t.closest("[data-filter]");
      if (chip) {
        state.filter = chip.dataset.filter;
        state.markersVisible = MARKER_PAGE;
        renderMarkerRows();
        paintResults();
        return;
      }
      if (t.closest("#markers-more")) {
        var before = all("tr.mk", dom.resultsRoot).length;
        state.markersVisible += MARKER_PAGE;
        renderMarkerRows();
        paintResults();
        var fresh = all("tr.mk", dom.resultsRoot)[before];
        if (fresh) fresh.focus();
        return;
      }
      if (t.closest("#new-case")) {
        clearCase().then(function (ok) {
          if (!ok) return;
          showView("analysis");
          $("tab-analysis").focus();
        });
        return;
      }
      var linked = t.closest("svg [data-i]");
      if (linked) revealMarker(Number(linked.dataset.i));
    });
    dom.resultsRoot.addEventListener("change", function (event) {
      if (event.target.id !== "markers-sort" || !state.result) return;
      state.sort = event.target.value;
      state.markersVisible = MARKER_PAGE;
      renderMarkerRows();
      paintResults();
    });
    ["mouseover", "mouseout"].forEach(function (type) {
      dom.resultsRoot.addEventListener(type, function (event) {
        var el = event.target.closest("[data-i]");
        if (el) setHot(el.dataset.i, type === "mouseover");
      });
    });

    var resizeTimer = null;
    var lastWidth = window.innerWidth;
    window.addEventListener("resize", function () {
      if (window.innerWidth === lastWidth) return;
      lastWidth = window.innerWidth;
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(paintResults, 120);
    });
    window.addEventListener("beforeprint", paintResults);

    document.addEventListener("keydown", function (event) {
      if (dialogOpen()) return;
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && state.view === "analysis") {
        event.preventDefault();
        analyze();
      }
      if (event.key === "Escape") {
        if (dom.examplesMenu.open) {
          dom.examplesMenu.querySelector("summary").focus();
          dom.examplesMenu.open = false;
        } else if (!dom.guideStart.hidden || !dom.guideAnalyze.hidden) {
          guideDone();
        }
      }
    });

    routeFromHash();
    runSplash(false);
  }

  init();
})();

/*!
 * ariADNa — motor de triaje (versión web)
 *
 * Traducción fiel a JavaScript de `ariADNa/genetic_analysis.py`
 * (algoritmo ariADNa-triaje-v0.1.4) del complemento QGIS.
 * Todo se ejecuta en el navegador: este módulo no hace peticiones de red.
 *
 * Paridad con Python: tests/engine.test.js compara este motor contra
 * resultados generados por el motor Python (tests/fixtures/reference.json).
 *
 * Diferencias intencionales (más estrictas, documentadas):
 *  - Dígitos: sólo se aceptan dígitos ASCII 0-9 (Python también acepta otros
 *    dígitos Unicode). Un PI escrito con dígitos no ASCII se marca inválido.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.AriadnaEngine = api;
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* =====================================================================
   * Errores
   * =================================================================== */
  class AriadnaError extends Error {
    constructor(message) {
      super(message);
      this.name = "ValueError";
    }
  }
  class CsvError extends Error {
    constructor(message) {
      super(message);
      this.name = "CsvError";
    }
  }
  function valueError(message) {
    return new AriadnaError(message);
  }

  /* =====================================================================
   * Utilidades con semántica de Python
   * =================================================================== */

  // Caracteres que Python considera espacio en blanco (str.isspace / str.strip).
  var PY_WS =
    "\\t\\n\\x0b\\x0c\\r\\x1c\\x1d\\x1e\\x1f \\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000";
  var RE_STRIP = new RegExp("^[" + PY_WS + "]+|[" + PY_WS + "]+$", "g");
  var RE_HAS_WS = new RegExp("[" + PY_WS + "]+");
  var RE_SPLIT_WS = new RegExp("[" + PY_WS + "]+");
  var RE_ALLELE_SPLIT = new RegExp("[" + PY_WS + "]*[,/|;][" + PY_WS + "]*");
  var RE_COMPACT_SNP = new RegExp("[" + PY_WS + "_-]+", "g");

  function pyStrip(text) {
    return String(text).replace(RE_STRIP, "");
  }

  function hasOwn(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
  }

  function codePointLength(text) {
    var n = 0;
    for (var _ of text) n += 1; // eslint-disable-line no-unused-vars
    return n;
  }

  function takeCodePoints(text, limit) {
    var count = 0;
    var index = 0;
    while (index < text.length && count < limit) {
      var cp = text.codePointAt(index);
      index += cp > 0xffff ? 2 : 1;
      count += 1;
    }
    return text.slice(0, index);
  }

  function countOccurrences(text, sub) {
    if (!sub) return 0;
    var count = 0;
    var pos = 0;
    while (true) {
      var found = text.indexOf(sub, pos);
      if (found === -1) return count;
      count += 1;
      pos = found + sub.length;
    }
  }

  // float() de Python: dígitos ASCII, guiones bajos entre dígitos, inf/nan.
  var FLOAT_RE = /^[+-]?(?:\d(?:_?\d)*(?:\.(?:\d(?:_?\d)*)?)?|\.\d(?:_?\d)*)(?:[eE][+-]?\d(?:_?\d)*)?$/;
  var FLOAT_SPECIAL_RE = /^[+-]?(?:inf|infinity|nan)$/i;
  function pyFloat(text) {
    var s = pyStrip(text);
    if (FLOAT_RE.test(s)) return Number(s.replace(/_/g, ""));
    if (FLOAT_SPECIAL_RE.test(s)) {
      if (/nan/i.test(s)) return NaN;
      return s.charAt(0) === "-" ? -Infinity : Infinity;
    }
    throw valueError("could not convert string to float: '" + text + "'");
  }

  // int() de Python para cadenas en base 10.
  var INT_RE = /^[+-]?\d(?:_?\d)*$/;
  function pyInt(text) {
    var s = pyStrip(text);
    if (!INT_RE.test(s)) throw valueError("invalid literal for int() with base 10: '" + text + "'");
    return parseInt(s.replace(/_/g, ""), 10);
  }

  // Indexación de listas de Python (admite índices negativos).
  function pyIndex(list, index) {
    var i = index < 0 ? index + list.length : index;
    if (i < 0 || i >= list.length || !Number.isFinite(i)) {
      var err = new RangeError("list index out of range");
      err.isIndexError = true;
      throw err;
    }
    return list[i];
  }

  function uniqueInOrder(items) {
    var seen = new Set();
    var out = [];
    items.forEach(function (item) {
      if (!seen.has(item)) {
        seen.add(item);
        out.push(item);
      }
    });
    return out;
  }

  /* ---------------------------------------------------------------------
   * Formateo numérico idéntico a Python (redondeo exacto, mitad-al-par)
   * ------------------------------------------------------------------- */

  // Representación decimal exacta de un double finito positivo: x = digits / 10^scale.
  function exactDecimal(x) {
    var view = new DataView(new ArrayBuffer(8));
    view.setFloat64(0, x);
    var hi = view.getUint32(0);
    var lo = view.getUint32(4);
    var expBits = (hi >>> 20) & 0x7ff;
    var mant = (BigInt(hi & 0xfffff) << 32n) | BigInt(lo);
    var exp2;
    if (expBits === 0) {
      exp2 = -1074;
    } else {
      mant = mant | (1n << 52n);
      exp2 = expBits - 1075;
    }
    if (exp2 >= 0) return { digits: mant << BigInt(exp2), scale: 0 };
    var k = -exp2;
    return { digits: mant * 5n ** BigInt(k), scale: k };
  }

  function roundHalfEvenDiv(value, pow10) {
    // value / 10^pow10 redondeado mitad-al-par (value >= 0, pow10 >= 1)
    var divisor = 10n ** BigInt(pow10);
    var q = value / divisor;
    var r = value % divisor;
    var twice = r * 2n;
    if (twice > divisor || (twice === divisor && q % 2n === 1n)) q += 1n;
    return q;
  }

  function specialFloat(x) {
    if (Number.isNaN(x)) return "nan";
    if (x === Infinity) return "inf";
    if (x === -Infinity) return "-inf";
    return null;
  }

  function isNegative(x) {
    return x < 0 || Object.is(x, -0);
  }

  // f"{x:.{precision}f}"
  function pyFormatF(x, precision) {
    var special = specialFloat(x);
    if (special) return special;
    var sign = isNegative(x) ? "-" : "";
    var ax = Math.abs(x);
    var rounded;
    if (ax === 0) {
      rounded = 0n;
    } else {
      var exact = exactDecimal(ax);
      if (exact.scale > precision) rounded = roundHalfEvenDiv(exact.digits, exact.scale - precision);
      else rounded = exact.digits * 10n ** BigInt(precision - exact.scale);
    }
    var s = rounded.toString();
    if (precision === 0) return sign + s;
    s = s.padStart(precision + 1, "0");
    return sign + s.slice(0, s.length - precision) + "." + s.slice(s.length - precision);
  }

  // Redondea |x| > 0 a `sig` cifras significativas: x ≈ R · 10^(e - sig + 1)
  function significant(ax, sig) {
    var exact = exactDecimal(ax);
    var n = exact.digits.toString().length;
    var e = n - 1 - exact.scale;
    var drop = n - sig;
    var R = drop > 0 ? roundHalfEvenDiv(exact.digits, drop) : exact.digits * 10n ** BigInt(-drop);
    if (R.toString().length > sig) {
      R = R / 10n;
      e += 1;
    }
    return { digits: R.toString(), exponent: e };
  }

  function formatExponent(e) {
    return (e < 0 ? "-" : "+") + String(Math.abs(e)).padStart(2, "0");
  }

  // f"{x:.{precision}g}"
  function pyFormatG(x, precision) {
    if (precision === undefined) precision = 6;
    if (precision === 0) precision = 1;
    var special = specialFloat(x);
    if (special) return special;
    var sign = isNegative(x) ? "-" : "";
    var ax = Math.abs(x);
    if (ax === 0) return sign + "0";
    var sig = significant(ax, precision);
    var ds = sig.digits;
    var e = sig.exponent;
    if (e >= -4 && e < precision) {
      var intPart;
      var fracPart;
      if (e >= 0) {
        intPart = ds.slice(0, e + 1);
        fracPart = ds.slice(e + 1);
      } else {
        intPart = "0";
        fracPart = "0".repeat(-e - 1) + ds;
      }
      fracPart = fracPart.replace(/0+$/, "");
      return sign + intPart + (fracPart ? "." + fracPart : "");
    }
    var mant = ds.charAt(0) + (ds.length > 1 ? "." + ds.slice(1) : "");
    if (mant.indexOf(".") !== -1) mant = mant.replace(/0+$/, "").replace(/\.$/, "");
    return sign + mant + "e" + formatExponent(e);
  }

  // f"{x:.{precision}e}"
  function pyFormatE(x, precision) {
    var special = specialFloat(x);
    if (special) return special;
    var sign = isNegative(x) ? "-" : "";
    var ax = Math.abs(x);
    if (ax === 0) return sign + "0" + (precision > 0 ? "." + "0".repeat(precision) : "") + "e+00";
    var sig = significant(ax, precision + 1);
    var ds = sig.digits;
    return sign + ds.charAt(0) + (precision > 0 ? "." + ds.slice(1) : "") + "e" + formatExponent(sig.exponent);
  }

  // str(float) / repr(float) de Python: dígitos más cortos que reproducen el valor.
  function pyRepr(x) {
    var special = specialFloat(x);
    if (special) return special;
    if (x === 0) return isNegative(x) ? "-0.0" : "0.0";
    var sign = x < 0 ? "-" : "";
    var parts = Math.abs(x).toExponential().split("e");
    var ds = parts[0].replace(".", "");
    var e = parseInt(parts[1], 10);
    if (e >= -4 && e < 16) {
      if (e >= 0) {
        if (ds.length <= e + 1) return sign + ds + "0".repeat(e + 1 - ds.length) + ".0";
        return sign + ds.slice(0, e + 1) + "." + ds.slice(e + 1);
      }
      return sign + "0." + "0".repeat(-e - 1) + ds;
    }
    return sign + ds.charAt(0) + (ds.length > 1 ? "." + ds.slice(1) : "") + "e" + formatExponent(e);
  }

  // html.escape(s, quote=True)
  function escapeHtml(value) {
    return String(value === null || value === undefined ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#x27;");
  }

  function pyStr(value) {
    if (typeof value === "number") return pyRepr(value);
    return String(value);
  }

  /* =====================================================================
   * Constantes (idénticas a genetic_analysis.py)
   * =================================================================== */
  var ALGORITHM_VERSION = "ariADNa-triaje-v0.1.4";
  var VCF_MIN_DP = 10;
  var VCF_MIN_GQ = 20;

  var CRITICAL_IMPORT_WARNING_PATTERNS = [
    ["vcf filter=", "VCF con FILTER distinto de PASS"],
    ["sitio vcf multialélico", "sitio VCF multialélico"],
    ["gt faltante", "genotipo VCF faltante"],
    ["gt contiene alelo fuera", "genotipo VCF fuera de REF/ALT"],
    ["format no contiene gt", "VCF sin campo GT"],
    ["fila vcf con menos columnas", "fila VCF incompleta"],
  ];

  var ASSAY_TYPES = {
    str_ce: {
      label: "STR autosómicos por PCR + electroforesis capilar",
      input:
        "Tabla por locus con dos alelos del hijo/a y dos alelos del progenitor/a alegado/a. El laboratorio puede reportar PI/MI/LR por locus.",
      result_kind: "Alelos numéricos por locus STR, por ejemplo D8S1179 = 12,13.",
      analysis_level: "Compatibilidad mendeliana + CPI si hay PI de laboratorio.",
    },
    str_mps: {
      label: "STR por MPS/NGS",
      input:
        "Tabla por locus con alelos STR definidos por secuencia o nomenclatura compatible. Puede incluir PI por locus.",
      result_kind: "Alelos STR basados en secuencia, nomenclatura o repetición, por ejemplo D21S11 secuencia/alelo.",
      analysis_level: "Compatibilidad por alelo/secuencia + CPI si hay PI de laboratorio.",
    },
    snp_panel: {
      label: "SNP panels / SNP arrays",
      input: "CSV o VCF con marcadores SNP y genotipos del hijo/a y progenitor/a alegado/a.",
      result_kind: "Genotipos por marcador, por ejemplo rs123 = A/G o VCF GT 0/1.",
      analysis_level: "Compatibilidad mendeliana preliminar; CPI solo si el laboratorio aporta PI por marcador.",
    },
    microhap: {
      label: "Microhaplotipos por NGS/MPS",
      input: "Tabla por microhaplotipo con dos haplotipos del hijo/a y dos haplotipos del progenitor/a alegado/a.",
      result_kind: "Haplotipos por marcador, por ejemplo mh01 = A-C-G / A-T-G.",
      analysis_level: "Compatibilidad por haplotipo + CPI si hay PI de laboratorio.",
    },
  };

  var CSV_COLUMN_ALIASES = {
    marker: ["marker", "marcador", "locus", "rsid", "snp", "microhap", "microhaplotipo"],
    child_genotype: ["child_genotype", "hijo_genotipo", "hijo/a genotipo", "child"],
    parent_genotype: ["parent_genotype", "progenitor_genotipo", "progenitor genotipo", "alleged_parent", "parent"],
    child_a1: ["child_a1", "hijo_a1", "hijo alelo 1", "hijo/a alelo 1", "child_h1"],
    child_a2: ["child_a2", "hijo_a2", "hijo alelo 2", "hijo/a alelo 2", "child_h2"],
    parent_a1: ["parent_a1", "progenitor_a1", "progenitor alelo 1", "parent_h1"],
    parent_a2: ["parent_a2", "progenitor_a2", "progenitor alelo 2", "parent_h2"],
  };

  var REQUIRED_COLUMN_GROUPS = {
    snp_panel: ["marker", "child_genotype", "parent_genotype"],
    str_ce: ["marker", "child_a1", "child_a2", "parent_a1", "parent_a2"],
    str_mps: ["marker", "child_a1", "child_a2", "parent_a1", "parent_a2"],
    microhap: ["marker", "child_a1", "child_a2", "parent_a1", "parent_a2"],
  };

  // Listas de alias que usa row_to_marker (pueden diferir de CSV_COLUMN_ALIASES).
  var ROW_ALIASES = {
    marker: ["marker", "marcador", "locus", "rsid", "snp", "microhap", "microhaplotipo"],
    child_genotype: ["child_genotype", "hijo_genotipo", "hijo/a genotipo", "child"],
    parent_genotype: ["parent_genotype", "progenitor_genotipo", "progenitor genotipo", "alleged_parent"],
    child_a1: ["child_a1", "hijo_a1", "hijo alelo 1", "hijo/a alelo 1", "child_h1"],
    child_a2: ["child_a2", "hijo_a2", "hijo alelo 2", "hijo/a alelo 2", "child_h2"],
    parent_a1: ["parent_a1", "progenitor_a1", "progenitor alelo 1", "parent_h1"],
    parent_a2: ["parent_a2", "progenitor_a2", "progenitor alelo 2", "parent_h2"],
    pi: ["pi", "paternity_index", "indice_paternidad", "indice de paternidad"],
    note: ["note", "notes", "nota", "notas"],
    validation_warning: ["validation_warning", "validation_warnings", "advertencia", "advertencias"],
  };

  var NA_FULL = new Set(["NA", "N/A", "ND", "NO DATA", "-", "."]);
  var NA_PIECE = new Set(["NA", "N/A", "ND", "-", "."]);
  var NA_SNP = new Set(["NA", "N/A", "ND", "NO DATA", "-", ".", "N"]);

  var IUPAC_SNP_CODES = {
    A: ["A", "A"],
    C: ["C", "C"],
    G: ["G", "G"],
    T: ["T", "T"],
    R: ["A", "G"],
    Y: ["C", "T"],
    S: ["C", "G"],
    W: ["A", "T"],
    K: ["G", "T"],
    M: ["A", "C"],
  };

  var NON_PATERNITY_MARKER_NAMES = new Set(["AMEL", "AMELX", "AMELY", "AMELOGENIN", "AMELOGENINA", "SRY"]);

  var CONTROL_MARKER_TERMS = [
    "CONTROL",
    "CTRL",
    "CONTROLNEGATIVO",
    "CONTROLPOSITIVO",
    "NEGATIVECONTROL",
    "POSITIVECONTROL",
    "BLANK",
    "NTC",
    "LADDER",
    "ALLELICLADDER",
    "STANDARD",
    "INTERNALSTANDARD",
    "ILS",
    "IPC",
    "QUALITYCONTROL",
    "QC",
  ];

  var NON_AUTOSOMAL_PREFIXES = ["DYS", "DYF", "DYZ", "DXS"];

  /* =====================================================================
   * Normalización
   * =================================================================== */
  function normalizeAlleles(value) {
    if (value === null || value === undefined) return [];
    var text = pyStrip(pyStr(value));
    if (!text || NA_FULL.has(text.toUpperCase())) return [];
    var pieces;
    if (/[,/|;]/.test(text)) {
      pieces = text.split(RE_ALLELE_SPLIT);
    } else {
      pieces = [text];
    }
    var normalized = [];
    pieces.forEach(function (piece) {
      var allele = pyStrip(piece);
      if (allele && !NA_PIECE.has(allele.toUpperCase())) normalized.push(allele);
    });
    return normalized;
  }

  function compactMarkerName(marker) {
    return String(marker).toUpperCase().replace(/[^A-Z0-9]+/g, "");
  }

  function nonInformativeMarkerReason(marker) {
    var compact = compactMarkerName(marker);
    if (!compact) return "";
    if (NON_PATERNITY_MARKER_NAMES.has(compact)) {
      return "Marcador de sexo/no autosómico; se conserva como referencia, pero no entra al triaje de paternidad/maternidad.";
    }
    if (CONTROL_MARKER_TERMS.some(function (term) { return compact.indexOf(term) !== -1; })) {
      return "Control técnico; se conserva como referencia, pero no entra al triaje de paternidad/maternidad.";
    }
    var prefixes = NON_AUTOSOMAL_PREFIXES.concat(["YSTR", "XSTR", "CHRY", "CHRX"]);
    if (prefixes.some(function (p) { return compact.indexOf(p) === 0; })) {
      return "Marcador no autosómico; esta versión solo hace triaje dúo con marcadores autosómicos.";
    }
    return "";
  }

  function normalizeSnpGenotype(value) {
    if (value === null || value === undefined) return [];
    var text = pyStrip(pyStr(value)).toUpperCase();
    if (!text || NA_SNP.has(text)) return [];
    if (/[,/|;]/.test(text)) return normalizeAlleles(text);
    if (RE_HAS_WS.test(text)) {
      var pieces = text.split(RE_SPLIT_WS).filter(function (p) { return p; });
      if (pieces.length > 1) return pieces;
    }
    var compact = text.replace(RE_COMPACT_SNP, "");
    var chars = Array.from(compact);
    if (chars.length === 1 && hasOwn(IUPAC_SNP_CODES, compact)) return IUPAC_SNP_CODES[compact].slice();
    if (chars.length === 2 && chars.every(function (b) { return "ACGT0123".indexOf(b) !== -1; })) return chars;
    return [text];
  }

  function mergeAlleleColumns(first, second) {
    return normalizeAlleles(first).concat(normalizeAlleles(second === undefined ? null : second));
  }

  function parsePiWithWarning(value) {
    if (value === null || value === undefined) return [null, ""];
    var rawText = pyStrip(pyStr(value));
    if (!rawText || NA_FULL.has(rawText.toUpperCase())) return [null, ""];
    var text = rawText.split(" ").join("");
    var piWarning = "";
    if (text.indexOf(",") !== -1 && text.indexOf(".") !== -1) {
      text = text.split(",").join("");
    } else if (text.indexOf(",") !== -1) {
      if (/^\d{1,3}(,\d{3})+$/.test(text)) {
        text = text.split(",").join("");
        piWarning =
          "PI con coma ambigua: " + rawText + ". " +
          "Usa punto decimal o quita separadores de miles antes de interpretar.";
      } else {
        text = text.split(",").join(".");
      }
    }
    var parsed;
    try {
      parsed = pyFloat(text);
    } catch (err) {
      return [null, "PI inválido: " + rawText];
    }
    if (!Number.isFinite(parsed) || parsed < 0) return [null, "PI inválido: " + rawText];
    return [parsed, piWarning];
  }

  function parsePi(value) {
    return parsePiWithWarning(value)[0];
  }

  function criticalDataWarningReason(warningText) {
    var lowered = String(warningText || "").toLowerCase();
    for (var i = 0; i < CRITICAL_IMPORT_WARNING_PATTERNS.length; i++) {
      if (lowered.indexOf(CRITICAL_IMPORT_WARNING_PATTERNS[i][0]) !== -1) return CRITICAL_IMPORT_WARNING_PATTERNS[i][1];
    }
    return "";
  }

  function markerCompatibility(child, allegedParent) {
    if (!child.length || !allegedParent.length) {
      return [null, "Faltan alelos/genotipo en hijo/a o progenitor/a alegado/a."];
    }
    var parentSet = new Set(allegedParent);
    if (child.some(function (a) { return parentSet.has(a); })) {
      return [true, "Comparte al menos un alelo/haplotipo con el hijo/a."];
    }
    return [false, "No comparte alelos/haplotipos observados; posible exclusión o requiere revisión por mutación/error."];
  }

  /* =====================================================================
   * Filas y validación
   * =================================================================== */
  function rowValue(row, keys) {
    var lowerMap = new Map();
    Object.keys(row).forEach(function (key) {
      lowerMap.set(pyStrip(String(key).toLowerCase()), row[key]);
    });
    for (var i = 0; i < keys.length; i++) {
      var found = lowerMap.get(keys[i].toLowerCase());
      if (found !== null && found !== undefined) return found;
    }
    return null;
  }

  function headerHasAlias(headers, aliases) {
    var headerSet = new Set();
    headers.forEach(function (h) {
      if (h !== null && h !== undefined) headerSet.add(pyStrip(String(h)).toLowerCase());
    });
    return aliases.some(function (alias) { return headerSet.has(alias.toLowerCase()); });
  }

  function validateCsvColumns(rows, assayType) {
    if (!hasOwn(REQUIRED_COLUMN_GROUPS, assayType)) throw valueError("Tipo de ensayo no reconocido: " + assayType);
    if (!rows || !rows.length) throw valueError("El archivo no contiene filas de datos.");
    var headers = Object.keys(rows[0]);
    var missing = REQUIRED_COLUMN_GROUPS[assayType].filter(function (group) {
      return !headerHasAlias(headers, CSV_COLUMN_ALIASES[group]);
    });
    if (missing.length) {
      var examples = {
        snp_panel: "marker, child_genotype, parent_genotype",
        str_ce: "marker, child_a1, child_a2, parent_a1, parent_a2",
        str_mps: "marker, child_a1, child_a2, parent_a1, parent_a2",
        microhap: "marker, child_a1, child_a2, parent_a1, parent_a2",
      }[assayType];
      throw valueError(
        "Faltan columnas obligatorias para este ensayo: " + missing.join(", ") +
          ". Encabezados esperados, por ejemplo: " + examples + "."
      );
    }
  }

  function appendWarning(list, message) {
    if (message && list.indexOf(message) === -1) list.push(message);
  }

  function markerDataWarnings(marker, assayType, child, allegedParent, paternityInformative) {
    var warnings = [];
    if (!paternityInformative) return warnings;
    [["hijo/a", child], ["progenitor/a alegado/a", allegedParent]].forEach(function (pair) {
      var role = pair[0];
      var alleles = pair[1];
      if (!alleles.length) appendWarning(warnings, "Datos incompletos en " + role + ".");
      else if (alleles.length === 1)
        appendWarning(warnings, "Solo un alelo/genotipo capturado en " + role + "; revisa si es homocigosis reportada o dato incompleto.");
      else if (alleles.length > 2)
        appendWarning(warnings, "Más de dos valores capturados en " + role + "; posible mezcla, multialélico o formato no esperado.");
    });
    if (assayType === "str_ce") {
      child.concat(allegedParent).forEach(function (allele) {
        if (allele && !/^\d+(?:\.\d+)?$/.test(allele))
          appendWarning(warnings, "Alelo STR capilar no numérico en " + marker + ": " + allele + ".");
      });
    }
    if (assayType === "snp_panel") {
      [["hijo/a", child], ["progenitor/a alegado/a", allegedParent]].forEach(function (pair) {
        if (pair[1].length && pair[1].length !== 2) appendWarning(warnings, "Genotipo SNP raro o incompleto en " + pair[0] + ".");
      });
      child.concat(allegedParent).forEach(function (allele) {
        if (allele && !/^[ACGT]$/.test(allele) && !/^\d+$/.test(allele))
          appendWarning(warnings, "Alelo SNP no estándar en " + marker + ": " + allele + ".");
      });
    }
    return warnings;
  }

  function rowToMarker(row, assayType) {
    var marker = pyStrip(pyStr(rowValue(row, ROW_ALIASES.marker) || ""));
    var child;
    var alleged;
    if (assayType === "snp_panel") {
      child = normalizeSnpGenotype(rowValue(row, ROW_ALIASES.child_genotype));
      alleged = normalizeSnpGenotype(rowValue(row, ROW_ALIASES.parent_genotype));
    } else {
      child = mergeAlleleColumns(rowValue(row, ROW_ALIASES.child_a1), rowValue(row, ROW_ALIASES.child_a2));
      alleged = mergeAlleleColumns(rowValue(row, ROW_ALIASES.parent_a1), rowValue(row, ROW_ALIASES.parent_a2));
    }
    var piParsed = parsePiWithWarning(rowValue(row, ROW_ALIASES.pi));
    var pi = piParsed[0];
    var piWarning = piParsed[1];
    var note = pyStrip(pyStr(rowValue(row, ROW_ALIASES.note) || ""));
    var compat = markerCompatibility(child, alleged);
    var compatible = compat[0];
    var generatedNote = compat[1];
    var reason = nonInformativeMarkerReason(marker);
    var dataWarnings = markerDataWarnings(marker || "(sin marcador)", assayType, child, alleged, !reason);
    var importedWarning = pyStrip(pyStr(rowValue(row, ROW_ALIASES.validation_warning) || ""));
    if (importedWarning) {
      importedWarning.split(";").forEach(function (part) {
        var trimmed = pyStrip(part);
        if (trimmed) dataWarnings.push(trimmed);
      });
    }
    if (generatedNote && !note) note = generatedNote;
    if (piWarning) note = pyStrip(note + " " + piWarning);
    var dataWarning = uniqueInOrder(dataWarnings).join("; ");
    if (dataWarning) note = pyStrip(note + " " + dataWarning);
    if (reason) note = pyStrip(note + " " + reason);
    return {
      marker: marker || "(sin marcador)",
      child: child,
      alleged_parent: alleged,
      compatible: compatible,
      pi: pi,
      note: note,
      pi_warning: piWarning,
      data_warning: dataWarning,
      paternity_informative: !reason,
      non_informative_reason: reason,
    };
  }

  function markerInputWarnings(rows, assayType) {
    var warnings = [];
    rows.forEach(function (row) {
      var m = rowToMarker(row, assayType);
      if (m.data_warning) {
        var message = m.marker + ": " + m.data_warning;
        if (warnings.indexOf(message) === -1) warnings.push(message);
      }
    });
    return warnings;
  }

  /* =====================================================================
   * Análisis
   * =================================================================== */
  function namesWithSuffix(list) {
    var names = list.slice(0, 5).map(function (m) { return m.marker; }).join(", ");
    var suffix = list.length <= 5 ? "" : " y " + (list.length - 5) + " más";
    return names + suffix;
  }

  function analyzeMarkers(assayType, rows, priorProbability) {
    if (priorProbability === undefined) priorProbability = 0.5;
    if (!hasOwn(ASSAY_TYPES, assayType)) throw valueError("Tipo de ensayo no reconocido: " + assayType);
    if (!(0 < priorProbability && priorProbability < 1)) throw valueError("La probabilidad previa debe estar entre 0 y 1.");

    var markers = rows.map(function (row) { return rowToMarker(row, assayType); });
    markers = markers.filter(function (m) {
      return m.marker !== "(sin marcador)" || m.child.length || m.alleged_parent.length;
    });
    var paternityMarkers = markers.filter(function (m) { return m.paternity_informative; });
    var nonInformative = markers.filter(function (m) { return !m.paternity_informative; });

    var compatible = paternityMarkers.filter(function (m) { return m.compatible === true; }).length;
    var exclusions = paternityMarkers.filter(function (m) { return m.compatible === false; }).length;
    var missing = paternityMarkers.filter(function (m) { return m.compatible === null; }).length;
    var informative = compatible + exclusions;

    var validPiMarkers = paternityMarkers.filter(function (m) { return m.pi !== null && m.compatible === true; });
    var piValues = validPiMarkers.map(function (m) { return m.pi; });
    var piWarnings = paternityMarkers.filter(function (m) { return m.pi_warning; });
    var zeroPiCompatible = paternityMarkers.filter(function (m) { return m.pi === 0 && m.compatible === true; });
    var compatibleWithoutPi = paternityMarkers.filter(function (m) { return m.compatible === true && m.pi === null; });
    var piOnUnusable = paternityMarkers.filter(function (m) { return m.pi !== null && m.compatible !== true; });
    var piOnNonInformative = nonInformative.filter(function (m) { return m.pi !== null; });
    var dataWarningMarkers = paternityMarkers.filter(function (m) { return m.data_warning; });
    var criticalWarningMarkers = paternityMarkers.filter(function (m) { return criticalDataWarningReason(m.data_warning); });

    var cpi = null;
    var posterior = null;
    var warnings = [];

    if (nonInformative.length) {
      warnings.push(nonInformative.length + " marcador(es) no informativos se excluyen de conteos/CPI: " + namesWithSuffix(nonInformative) + ".");
    }

    var canCompute = piValues.length > 0;
    if (exclusions) {
      canCompute = false;
      warnings.push("No se calcula CPI/probabilidad posterior porque hay incongruencias que requieren revisión.");
    }
    if (piWarnings.length) {
      canCompute = false;
      warnings.push("No se calcula CPI/probabilidad posterior porque hay PI inválidos en: " + namesWithSuffix(piWarnings) + ".");
    }
    if (zeroPiCompatible.length) {
      canCompute = false;
      warnings.push("Hay PI=0 en marcadores compatibles (" + namesWithSuffix(zeroPiCompatible) + "); revisa transcripción o dictamen del laboratorio.");
    }
    if (piOnUnusable.length) {
      warnings.push("Los PI capturados en marcadores incompletos o incongruentes no se usan en CPI/posterior: " + namesWithSuffix(piOnUnusable) + ".");
    }
    if (piOnNonInformative.length) {
      warnings.push("Los PI capturados en marcadores no informativos no se usan en CPI/posterior: " + namesWithSuffix(piOnNonInformative) + ".");
    }
    if (dataWarningMarkers.length) {
      warnings.push(dataWarningMarkers.length + " marcador(es) tienen advertencias de formato/calidad: " + namesWithSuffix(dataWarningMarkers) + ".");
    }
    if (criticalWarningMarkers.length) {
      canCompute = false;
      warnings.push(
        "No se calcula CPI/probabilidad posterior porque hay advertencias críticas " +
          "de importación/calidad en: " + namesWithSuffix(criticalWarningMarkers) + "."
      );
    }

    if (canCompute) {
      cpi = 1.0;
      piValues.forEach(function (v) { cpi *= v; });
      var numerator = priorProbability * cpi;
      var denominator = numerator + (1 - priorProbability);
      // Python: `numerator / denominator if denominator else None` (NaN es verdadero en Python)
      posterior = denominator !== 0 ? numerator / denominator : null;
    } else if (paternityMarkers.length && !piValues.length && !exclusions && !piWarnings.length && !piOnUnusable.length) {
      warnings.push("No se ingresaron PI por marcador; el resultado es compatibilidad preliminar, no conclusión estadística.");
    }

    if (piValues.length && compatibleWithoutPi.length && !exclusions && !piWarnings.length) {
      warnings.push(
        "CPI/probabilidad posterior usan solo los " + piValues.length + " marcador(es) con PI capturado; " +
          compatibleWithoutPi.length + " marcador(es) compatibles no tienen PI."
      );
    }

    var conclusion;
    if (exclusions >= 2) {
      conclusion = "Triaje: patrón no compatible en los datos capturados; confirma con laboratorio/peritaje antes de concluir exclusión.";
    } else if (exclusions === 1) {
      conclusion = "Triaje: una incongruencia aislada; revisa mutación, calidad, transcripción y confirma con laboratorio.";
    } else if (informative === 0) {
      conclusion = "Triaje: no hay marcadores suficientes para orientar el caso.";
    } else if (piWarnings.length || zeroPiCompatible.length) {
      conclusion = "Triaje: patrón compatible a nivel mendeliano, pero corrige los PI antes de interpretar soporte estadístico.";
    } else if (criticalWarningMarkers.length) {
      conclusion = "Triaje: patrón compatible a nivel mendeliano, pero corrige las advertencias críticas antes de interpretar soporte estadístico.";
    } else if (cpi !== null && posterior !== null) {
      if (posterior >= 0.999) {
        conclusion = "Triaje: patrón compatible con soporte estadístico alto capturado; requiere validación pericial.";
      } else if (posterior >= 0.95) {
        conclusion = "Triaje: patrón compatible con soporte estadístico moderado capturado; requiere revisión pericial.";
      } else {
        conclusion = "Triaje: patrón compatible a nivel mendeliano, pero el soporte estadístico capturado es limitado.";
      }
    } else {
      conclusion = "Triaje: patrón compatible a nivel mendeliano en los marcadores capturados; sin PI/CPI no hay conclusión estadística.";
    }

    if (missing) warnings.push(missing + " marcador(es) tienen datos incompletos.");
    if (exclusions) {
      warnings.push("Las exclusiones pueden deberse a no paternidad/maternidad, mutación, alelo nulo, mezcla, baja calidad o error de captura.");
    }
    if (paternityMarkers.length && ["snp_panel", "microhap", "str_mps"].indexOf(assayType) !== -1 && !piValues.length) {
      warnings.push("Para este ensayo se recomienda usar frecuencias poblacionales validadas o PI calculado por laboratorio/software forense.");
    }

    return {
      assay_type: assayType,
      assay_label: ASSAY_TYPES[assayType].label,
      captured_markers: markers.length,
      total_markers: paternityMarkers.length,
      informative_markers: informative,
      compatible_markers: compatible,
      exclusions: exclusions,
      missing_markers: missing,
      non_informative_markers: nonInformative.length,
      cpi: cpi,
      posterior_probability: posterior,
      prior_probability_used: priorProbability,
      algorithm_version: ALGORITHM_VERSION,
      conclusion: conclusion,
      warnings: warnings,
      markers: markers,
    };
  }

  /* =====================================================================
   * CSV — réplica de csv.Sniffer + csv.reader + csv.DictReader de Python
   * =================================================================== */
  var EXCEL = { delimiter: ",", quotechar: '"', doublequote: true, skipinitialspace: false };
  var EXCEL_TAB = { delimiter: "\t", quotechar: '"', doublequote: true, skipinitialspace: false };
  var REST_KEY = "__rest__"; // equivalente a la clave None de csv.DictReader

  var WORD_CLASS = "\\p{L}\\p{N}_"; // \w de Python (Unicode)
  var LINE_START = "(?:^|(?<=\\n))";
  var LINE_END = "(?:(?=\\n)|$)";

  function hexEscape(ch) {
    return "\\u{" + ch.codePointAt(0).toString(16) + "}";
  }

  function guessQuoteAndDelimiter(data) {
    var patterns = [
      "(?<delim>[^" + WORD_CLASS + "\\n\"'])(?<space> ?)(?<quote>[\"']).*?\\k<quote>\\k<delim>",
      "(?:" + LINE_START + "|\\n)(?<quote>[\"']).*?\\k<quote>(?<delim>[^" + WORD_CLASS + "\\n\"'])(?<space> ?)",
      "(?<delim>[^" + WORD_CLASS + "\\n\"'])(?<space> ?)(?<quote>[\"']).*?\\k<quote>(?:" + LINE_END + "|\\n)",
      "(?:" + LINE_START + "|\\n)(?<quote>[\"']).*?\\k<quote>(?:" + LINE_END + "|\\n)",
    ];
    var matches = [];
    for (var i = 0; i < patterns.length; i++) {
      matches = Array.from(data.matchAll(new RegExp(patterns[i], "gsu")));
      if (matches.length) break;
    }
    if (!matches.length) return ["", false, null, 0];

    var quotes = new Map();
    var delims = new Map();
    var spaces = 0;
    matches.forEach(function (m) {
      var g = m.groups;
      if (g.quote) quotes.set(g.quote, (quotes.get(g.quote) || 0) + 1);
      if (!hasOwn(g, "delim") || g.delim === undefined) return;
      if (g.delim) delims.set(g.delim, (delims.get(g.delim) || 0) + 1);
      if (!hasOwn(g, "space") || g.space === undefined) return;
      if (g.space) spaces += 1;
    });

    function maxKey(map) {
      var bestKey = null;
      var bestValue = -Infinity;
      map.forEach(function (value, key) {
        if (value > bestValue) {
          bestValue = value;
          bestKey = key;
        }
      });
      return bestKey;
    }

    var quotechar = maxKey(quotes);
    var delim;
    var skipinitialspace;
    if (delims.size) {
      delim = maxKey(delims);
      skipinitialspace = delims.get(delim) === spaces;
      if (delim === "\n") delim = "";
    } else {
      delim = "";
      skipinitialspace = 0;
    }

    var d = delim ? hexEscape(delim) : "";
    var notDelim = "[^" + d + "\\n]";
    var dq =
      "((" + d + ")|" + LINE_START + ")[^" + WORD_CLASS + "]*" + quotechar + notDelim + "*" + quotechar + notDelim + "*" +
      quotechar + "[^" + WORD_CLASS + "]*((" + d + ")|" + LINE_END + ")";
    var doublequote = new RegExp(dq, "u").test(data);
    return [quotechar, doublequote, delim, skipinitialspace];
  }

  function guessDelimiter(sample) {
    var data = sample.split("\n").filter(function (l) { return l !== ""; });
    var ascii = [];
    for (var c = 0; c < 127; c++) ascii.push(String.fromCharCode(c));
    var chunkLength = Math.min(10, data.length);
    var iteration = 0;
    var charFrequency = new Map();
    var modes = new Map();
    var delims = new Map();
    var start = 0;
    var end = chunkLength;

    function skipFor(delim) {
      return countOccurrences(data[0], delim) === countOccurrences(data[0], delim + " ");
    }

    while (start < data.length) {
      iteration += 1;
      data.slice(start, end).forEach(function (line) {
        ascii.forEach(function (ch) {
          var meta = charFrequency.get(ch);
          if (!meta) {
            meta = new Map();
            charFrequency.set(ch, meta);
          }
          var freq = countOccurrences(line, ch);
          meta.set(freq, (meta.get(freq) || 0) + 1);
        });
      });
      charFrequency.forEach(function (meta, ch) {
        var items = Array.from(meta.entries());
        if (items.length === 1 && items[0][0] === 0) return;
        if (items.length > 1) {
          var best = items[0];
          items.forEach(function (it) { if (it[1] > best[1]) best = it; });
          var rest = items.filter(function (it) { return it !== best; });
          var sumRest = rest.reduce(function (acc, it) { return acc + it[1]; }, 0);
          modes.set(ch, [best[0], best[1] - sumRest]);
        } else {
          modes.set(ch, items[0]);
        }
      });
      var total = Math.min(chunkLength * iteration, data.length);
      var consistency = 1.0;
      var threshold = 0.9;
      while (delims.size === 0 && consistency >= threshold) {
        modes.forEach(function (v, k) {
          if (v[0] > 0 && v[1] > 0 && v[1] / total >= consistency) delims.set(k, v);
        });
        consistency -= 0.01;
      }
      if (delims.size === 1) {
        var only = Array.from(delims.keys())[0];
        return [only, skipFor(only)];
      }
      start = end;
      end += chunkLength;
    }

    if (!delims.size) return ["", false];
    if (delims.size > 1) {
      var preferred = [",", "\t", ";", " ", ":"];
      for (var p = 0; p < preferred.length; p++) {
        if (delims.has(preferred[p])) return [preferred[p], skipFor(preferred[p])];
      }
    }
    var items = Array.from(delims.entries()).map(function (kv) { return [kv[1], kv[0]]; });
    items.sort(function (a, b) {
      if (a[0][0] !== b[0][0]) return a[0][0] - b[0][0];
      if (a[0][1] !== b[0][1]) return a[0][1] - b[0][1];
      return a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0;
    });
    var chosen = items[items.length - 1][1];
    return [chosen, skipFor(chosen)];
  }

  function sniff(sample) {
    var guess = guessQuoteAndDelimiter(sample);
    var quotechar = guess[0];
    var doublequote = guess[1];
    var delimiter = guess[2];
    var skipinitialspace = guess[3];
    if (!delimiter) {
      var dg = guessDelimiter(sample);
      delimiter = dg[0];
      skipinitialspace = dg[1];
    }
    if (!delimiter) throw new CsvError("Could not determine delimiter");
    return {
      delimiter: delimiter,
      quotechar: quotechar || '"',
      doublequote: !!doublequote,
      skipinitialspace: !!skipinitialspace,
    };
  }

  // Máquina de estados de Modules/_csv.c (sin escapechar, QUOTE_MINIMAL, strict=False).
  function readCsvRecords(text, dialect) {
    var delimiter = dialect.delimiter;
    var quotechar = dialect.quotechar;
    var doublequote = dialect.doublequote;
    var skipinitialspace = dialect.skipinitialspace;
    var lines = text.match(/[^\r\n]*(?:\r\n|\r|\n)|[^\r\n]+/g) || [];
    var records = [];
    var fields;
    var field;
    var state;

    function saveField() {
      fields.push(field);
      field = "";
    }

    function processChar(c) {
      switch (state) {
        case "START_RECORD":
          if (c === null) return;
          if (c === "\n" || c === "\r") {
            state = "EAT_CRNL";
            return;
          }
          state = "START_FIELD";
        // falls through
        case "START_FIELD":
          if (c === "\n" || c === "\r" || c === null) {
            saveField();
            state = c === null ? "START_RECORD" : "EAT_CRNL";
          } else if (c === quotechar) {
            state = "IN_QUOTED_FIELD";
          } else if (c === " " && skipinitialspace) {
            // ignora espacios al inicio del campo
          } else if (c === delimiter) {
            saveField();
          } else {
            field += c;
            state = "IN_FIELD";
          }
          return;
        case "IN_FIELD":
          if (c === "\n" || c === "\r" || c === null) {
            saveField();
            state = c === null ? "START_RECORD" : "EAT_CRNL";
          } else if (c === delimiter) {
            saveField();
            state = "START_FIELD";
          } else {
            field += c;
          }
          return;
        case "IN_QUOTED_FIELD":
          if (c === null) return;
          if (c === quotechar) state = doublequote ? "QUOTE_IN_QUOTED_FIELD" : "IN_FIELD";
          else field += c;
          return;
        case "QUOTE_IN_QUOTED_FIELD":
          if (c === quotechar) {
            field += c;
            state = "IN_QUOTED_FIELD";
          } else if (c === delimiter) {
            saveField();
            state = "START_FIELD";
          } else if (c === "\n" || c === "\r" || c === null) {
            saveField();
            state = c === null ? "START_RECORD" : "EAT_CRNL";
          } else {
            field += c;
            state = "IN_FIELD";
          }
          return;
        case "EAT_CRNL":
          if (c === "\n" || c === "\r") return;
          if (c === null) {
            state = "START_RECORD";
            return;
          }
          throw new CsvError("new-line character seen in unquoted field");
      }
    }

    var li = 0;
    outer: while (true) {
      fields = [];
      field = "";
      state = "START_RECORD";
      do {
        if (li >= lines.length) {
          if (field.length !== 0 || state === "IN_QUOTED_FIELD") {
            saveField();
            records.push(fields);
          }
          break outer;
        }
        var line = lines[li++];
        for (var ch of line) processChar(ch);
        processChar(null);
      } while (state !== "START_RECORD");
      records.push(fields);
    }
    return records;
  }

  function stripBom(text) {
    var t = String(text);
    return t.charCodeAt(0) === 0xfeff ? t.slice(1) : t;
  }

  // Equivalente de read_csv_rows(path) recibiendo el texto del archivo.
  function readCsvRows(text) {
    var content = stripBom(text);
    var sample = takeCodePoints(content, 4096);
    var dialect;
    if (pyStrip(sample)) {
      try {
        dialect = sniff(sample);
      } catch (err) {
        if (!(err instanceof CsvError)) throw err;
        dialect = sample.indexOf("\t") !== -1 ? EXCEL_TAB : EXCEL;
      }
    } else {
      dialect = EXCEL;
    }
    var records = readCsvRecords(content, dialect);
    var fieldnames = records.length ? records[0] : [];
    var normalized = fieldnames.map(function (f) { return pyStrip(String(f)).toLowerCase(); });
    var counts = new Map();
    normalized.forEach(function (f) { counts.set(f, (counts.get(f) || 0) + 1); });
    var duplicates = Array.from(new Set(normalized.filter(function (f) { return f && counts.get(f) > 1; }))).sort();
    if (duplicates.length) {
      throw valueError(
        "El archivo tiene encabezados duplicados: " + duplicates.join(", ") + ". " +
          "Corrige el archivo antes de importarlo para evitar reinterpretar columnas."
      );
    }
    var rows = [];
    for (var i = 1; i < records.length; i++) {
      var row = records[i];
      if (row.length === 0) continue;
      var d = Object.create(null);
      var n = Math.min(fieldnames.length, row.length);
      for (var j = 0; j < n; j++) d[fieldnames[j]] = row[j];
      if (fieldnames.length < row.length) {
        d[REST_KEY] = row.slice(fieldnames.length);
      } else if (fieldnames.length > row.length) {
        fieldnames.slice(row.length).forEach(function (key) { d[key] = null; });
      }
      rows.push(d);
    }
    return rows;
  }

  /* =====================================================================
   * VCF
   * =================================================================== */
  function textLines(text) {
    return stripBom(text).split(/\r\n|\r|\n/);
  }

  function readVcfSampleNames(text) {
    var lines = textLines(text);
    for (var i = 0; i < lines.length; i++) {
      var line = pyStrip(lines[i]);
      if (line.indexOf("#CHROM") === 0) {
        var samples = line.split("\t").slice(9);
        if (samples.length < 2) throw valueError("El VCF debe contener al menos dos muestras: hijo/a y progenitor/a alegado/a.");
        return samples;
      }
    }
    throw valueError("No se encontró encabezado #CHROM en el VCF.");
  }

  var CHILD_SAMPLE_TERMS = ["hijo", "hija", "child", "menor", "descendiente"];
  var PARENT_SAMPLE_TERMS = ["progenitor", "padre", "madre", "parent", "father", "mother", "alegado", "alleged"];

  function sampleNameMatches(sample, terms) {
    var lowered = String(sample).toLowerCase();
    return terms.some(function (t) { return lowered.indexOf(t) !== -1; });
  }

  function vcfSampleSelectionWarnings(samples, childSample, parentSample) {
    var warnings = [];
    if (samples.length > 2) {
      warnings.push(
        "El VCF contiene " + samples.length + " muestras; ariADNa usará solo hijo/a=" + childSample + " " +
          "y progenitor/a alegado/a=" + parentSample + "."
      );
    }
    if (sampleNameMatches(childSample, PARENT_SAMPLE_TERMS)) {
      warnings.push(
        "La muestra elegida como hijo/a (" + childSample + ") parece tener nombre de progenitor; revisa que no estén invertidas."
      );
    }
    if (sampleNameMatches(parentSample, CHILD_SAMPLE_TERMS)) {
      warnings.push(
        "La muestra elegida como progenitor/a alegado/a (" + parentSample + ") parece tener nombre de hijo/a; revisa que no estén invertidas."
      );
    }
    return warnings;
  }

  function parseOptionalFloat(value) {
    if (value === "" || value === ".") return null;
    var parsed;
    try {
      parsed = pyFloat(value);
    } catch (err) {
      return null;
    }
    return Number.isFinite(parsed) ? parsed : null;
  }

  function readVcfSnpRows(text, childSample, parentSample) {
    var rows = [];
    var samples = [];
    var childIndex = null;
    var parentIndex = null;
    var lines = textLines(text);

    for (var li = 0; li < lines.length; li++) {
      var line = pyStrip(lines[li]);
      if (!line || line.indexOf("##") === 0) continue;
      if (line.indexOf("#CHROM") === 0) {
        var header = line.split("\t");
        samples = header.slice(9);
        if (samples.length < 2) throw valueError("El VCF debe contener al menos dos muestras: hijo/a y progenitor/a alegado/a.");
        if (childSample !== null && childSample !== undefined && samples.indexOf(childSample) === -1) {
          throw valueError("La muestra del hijo/a no existe en el VCF: " + childSample);
        }
        if (parentSample !== null && parentSample !== undefined && samples.indexOf(parentSample) === -1) {
          throw valueError("La muestra del progenitor/a alegado/a no existe en el VCF: " + parentSample);
        }
        childIndex = childSample !== null && childSample !== undefined ? samples.indexOf(childSample) : 0;
        parentIndex = parentSample !== null && parentSample !== undefined ? samples.indexOf(parentSample) : 1;
        if (childIndex === parentIndex) {
          throw valueError("El hijo/a y el progenitor/a alegado/a deben ser muestras distintas en el VCF.");
        }
        continue;
      }
      if (childIndex === null || parentIndex === null) continue;

      var parts = line.split("\t");
      if (parts.length < 10) continue;
      var chrom = parts[0];
      var pos = parts[1];
      var markerId = parts[2];
      var ref = parts[3];
      var alt = parts[4];
      var filterValue = parts.length > 6 ? parts[6] : ".";
      var marker = markerId && markerId !== "." ? markerId : chrom + ":" + pos;
      var alleles = [ref].concat(alt === "." ? [] : alt.split(","));
      var rowWarnings = [];
      if (filterValue !== "PASS" && filterValue !== ".") {
        rowWarnings.push("VCF FILTER=" + filterValue + "; revisa calidad antes de interpretar.");
      }
      if (alt.indexOf(",") !== -1) rowWarnings.push("Sitio VCF multialélico; ariADNa decodifica GT, pero requiere revisión.");
      var formatKeys = parts[8].split(":");
      var gtPos = formatKeys.indexOf("GT");
      if (gtPos === -1) gtPos = null;

      var sampleMetric = (function (keys) {
        return function (fields, key) {
          var index = keys.indexOf(key);
          if (index === -1) return null;
          if (index >= fields.length) return null;
          return parseOptionalFloat(fields[index]);
        };
      })(formatKeys);

      var decode = (function (gtIndex, alleleList, metric) {
        return function (sampleField, sampleName) {
          var warnings = [];
          var fields = sampleField.split(":");
          if (gtIndex === null) {
            warnings.push("FORMAT no contiene GT para muestra " + sampleName + ".");
            return ["", warnings];
          }
          var gt = gtIndex < fields.length ? fields[gtIndex] : fields[0];
          if (gt === "" || gt === ".") {
            warnings.push("GT faltante en muestra " + sampleName + ".");
            return ["", warnings];
          }
          var tokens = gt.split(/[/|]/);
          if (tokens.indexOf(".") !== -1) warnings.push("GT faltante o parcial (" + gt + ") en muestra " + sampleName + ".");
          var decoded = [];
          tokens.forEach(function (token) {
            if (token === ".") return;
            try {
              decoded.push(pyIndex(alleleList, pyInt(token)));
            } catch (err) {
              warnings.push("GT contiene alelo fuera de REF/ALT (" + token + ") en muestra " + sampleName + ".");
              decoded.push(token);
            }
          });
          var dp = metric(fields, "DP");
          if (dp !== null && dp < VCF_MIN_DP) {
            warnings.push("DP bajo en muestra " + sampleName + ": " + pyFormatG(dp) + " (<" + VCF_MIN_DP + ").");
          }
          var gq = metric(fields, "GQ");
          if (gq !== null && gq < VCF_MIN_GQ) {
            warnings.push("GQ bajo en muestra " + sampleName + ": " + pyFormatG(gq) + " (<" + VCF_MIN_GQ + ").");
          }
          return [decoded.join("/"), warnings];
        };
      })(gtPos, alleles, sampleMetric);

      var sampleFields = parts.slice(9);
      if (sampleFields.length <= Math.max(childIndex, parentIndex)) {
        rows.push({
          marker: marker,
          child_genotype: "",
          parent_genotype: "",
          validation_warning: "Fila VCF con menos columnas de muestra que el encabezado.",
        });
        continue;
      }
      var childDecoded = decode(sampleFields[childIndex], samples[childIndex]);
      var parentDecoded = decode(sampleFields[parentIndex], samples[parentIndex]);
      var validationWarnings = rowWarnings.concat(childDecoded[1], parentDecoded[1]);
      rows.push({
        marker: marker,
        child_genotype: childDecoded[0],
        parent_genotype: parentDecoded[0],
        validation_warning: uniqueInOrder(validationWarnings).join("; "),
      });
    }
    return rows;
  }

  /* =====================================================================
   * Estado/veredicto (compartidos por el reporte y la interfaz)
   * =================================================================== */
  function statusLabel(marker) {
    if (!marker.paternity_informative) return "No informativo";
    if (marker.compatible === true) return "Compatible";
    if (marker.compatible === false) return "Incongruencia";
    return "Incompleto";
  }

  function statusClass(marker) {
    if (!marker.paternity_informative) return "skip";
    if (marker.compatible === true) return "ok";
    if (marker.compatible === false) return "bad";
    return "warn";
  }

  function bannerMeta(result) {
    if (result.exclusions >= 2) return ["bad", "Triaje: patrón no compatible"];
    if (result.total_markers === 0) return ["warn", "Sin marcadores útiles"];
    if (result.exclusions === 1 || result.missing_markers) return ["warn", "Requiere revisión"];
    return ["ok", "Triaje: patrón compatible"];
  }

  /* =====================================================================
   * Específico de la versión web: normaliza filas importadas a claves
   * canónicas usando la UNIÓN de los alias del validador y de row_to_marker,
   * para que toda columna aceptada por la validación se lea de verdad, y
   * conserva `validation_warning` (las advertencias críticas de VCF llegan
   * así al análisis, como documenta el algoritmo).
   * =================================================================== */
  function unionAliases(a, b) {
    return uniqueInOrder(a.concat(b));
  }

  var IMPORT_ALIASES = {
    marker: ROW_ALIASES.marker,
    child_genotype: unionAliases(ROW_ALIASES.child_genotype, CSV_COLUMN_ALIASES.child_genotype),
    parent_genotype: unionAliases(ROW_ALIASES.parent_genotype, CSV_COLUMN_ALIASES.parent_genotype),
    child_a1: ROW_ALIASES.child_a1,
    child_a2: ROW_ALIASES.child_a2,
    parent_a1: ROW_ALIASES.parent_a1,
    parent_a2: ROW_ALIASES.parent_a2,
    pi: ROW_ALIASES.pi,
    note: ROW_ALIASES.note,
    validation_warning: ROW_ALIASES.validation_warning,
  };

  var CANONICAL_KEYS = {
    snp_panel: ["marker", "child_genotype", "parent_genotype", "pi", "note"],
    str_ce: ["marker", "child_a1", "child_a2", "parent_a1", "parent_a2", "pi", "note"],
    str_mps: ["marker", "child_a1", "child_a2", "parent_a1", "parent_a2", "pi", "note"],
    microhap: ["marker", "child_a1", "child_a2", "parent_a1", "parent_a2", "pi", "note"],
  };

  function canonicalizeRows(rows, assayType) {
    var keys = CANONICAL_KEYS[assayType];
    return rows.map(function (row) {
      var out = {};
      keys.forEach(function (key) {
        var value = rowValue(row, IMPORT_ALIASES[key]);
        out[key] = value === null || value === undefined ? "" : pyStrip(pyStr(value));
      });
      var warning = rowValue(row, IMPORT_ALIASES.validation_warning);
      out.validation_warning = warning === null || warning === undefined ? "" : pyStrip(pyStr(warning));
      return out;
    });
  }

  return {
    // constantes
    ALGORITHM_VERSION: ALGORITHM_VERSION,
    VCF_MIN_DP: VCF_MIN_DP,
    VCF_MIN_GQ: VCF_MIN_GQ,
    ASSAY_TYPES: ASSAY_TYPES,
    CSV_COLUMN_ALIASES: CSV_COLUMN_ALIASES,
    REQUIRED_COLUMN_GROUPS: REQUIRED_COLUMN_GROUPS,
    CANONICAL_KEYS: CANONICAL_KEYS,
    REST_KEY: REST_KEY,
    // motor
    normalizeAlleles: normalizeAlleles,
    normalizeSnpGenotype: normalizeSnpGenotype,
    mergeAlleleColumns: mergeAlleleColumns,
    nonInformativeMarkerReason: nonInformativeMarkerReason,
    parsePi: parsePi,
    parsePiWithWarning: parsePiWithWarning,
    criticalDataWarningReason: criticalDataWarningReason,
    markerCompatibility: markerCompatibility,
    validateCsvColumns: validateCsvColumns,
    markerDataWarnings: markerDataWarnings,
    rowToMarker: rowToMarker,
    markerInputWarnings: markerInputWarnings,
    analyzeMarkers: analyzeMarkers,
    readCsvRows: readCsvRows,
    readVcfSampleNames: readVcfSampleNames,
    readVcfSnpRows: readVcfSnpRows,
    vcfSampleSelectionWarnings: vcfSampleSelectionWarnings,
    canonicalizeRows: canonicalizeRows,
    statusLabel: statusLabel,
    statusClass: statusClass,
    bannerMeta: bannerMeta,
    // utilidades con semántica de Python
    pyFormatF: pyFormatF,
    pyFormatG: pyFormatG,
    pyFormatE: pyFormatE,
    pyRepr: pyRepr,
    pyFloat: pyFloat,
    pyStrip: pyStrip,
    escapeHtml: escapeHtml,
    codePointLength: codePointLength,
    AriadnaError: AriadnaError,
  };
});

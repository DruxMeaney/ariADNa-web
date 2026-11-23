/* Pruebas del motor de ariADNa.
 *
 *  1. Referencia: compara el motor contra tests/fixtures/reference.json, una
 *     referencia congelada y verificada (conteos, CPI, posterior, advertencias,
 *     notas, resumen de texto y reporte HTML byte a byte).
 *  2. Casos de comportamiento del motor.
 *  3. Pruebas de la interfaz web (importación, reporte, gráficos).
 *
 * Ejecutar:  node --test
 */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const E = require("../js/engine.js");
const R = require("../js/report.js");

const FIXTURES = path.join(__dirname, "fixtures");
const REF = JSON.parse(fs.readFileSync(path.join(FIXTURES, "reference.json"), "utf8"));

const META_ANON = {
  case_id: "Omitido",
  child_id: "Omitido",
  parent_id: "Omitido",
  report_mode: "anonimizado; omite identificadores, conserva genotipos",
};
const META_IDENT = {
  case_id: "CASO-001 <b>&\"'",
  child_id: "H-001",
  parent_id: "PA-001",
  report_mode: "con identificadores capturados",
};

/* ---------- utilidades ---------- */
function enc(v) {
  if (typeof v === "number") {
    if (Number.isNaN(v)) return { $float: "nan" };
    if (v === Infinity) return { $float: "inf" };
    if (v === -Infinity) return { $float: "-inf" };
    if (Object.is(v, -0)) return { $float: "-0" };
    return v;
  }
  if (Array.isArray(v)) return v.map(enc);
  if (v && typeof v === "object") {
    const o = {};
    for (const k of Object.keys(v)) o[k] = enc(v[k]);
    return o;
  }
  return v === undefined ? null : v;
}

function parseRepr(s) {
  if (s === "inf") return Infinity;
  if (s === "-inf") return -Infinity;
  if (s === "nan") return NaN;
  return Number(s);
}

function errorOf(fn) {
  try {
    return { ok: enc(fn()) };
  } catch (err) {
    if (err && err.name === "ValueError") return { error: err.message };
    throw err;
  }
}

function sameText(actual, expected, label) {
  if (actual === expected) return;
  let i = 0;
  while (i < actual.length && i < expected.length && actual[i] === expected[i]) i++;
  const ctx = (s) => JSON.stringify(s.slice(Math.max(0, i - 60), i + 60));
  assert.fail(`${label}: difiere en el carácter ${i}\n  JS:     ${ctx(actual)}\n  Ref:    ${ctx(expected)}`);
}

function analysisBundle(assay, rows, prior, withHtml) {
  let result;
  try {
    result = E.analyzeMarkers(assay, rows, prior);
  } catch (err) {
    if (err.name === "ValueError") return { error: err.message };
    throw err;
  }
  const bundle = { result: enc(result), text: R.resultToText(result) };
  if (withHtml) {
    bundle.html_anon = R.buildHtmlReport(result, META_ANON);
    bundle.html_ident = R.buildHtmlReport(result, META_IDENT);
    bundle.html_default = R.buildHtmlReport(result, null);
  }
  return bundle;
}

function compareBundle(actual, expected, label) {
  if (expected.error !== undefined) {
    assert.deepEqual(actual, expected, label);
    return;
  }
  assert.deepEqual(actual.result, expected.result, `${label}: resultado`);
  sameText(actual.text, expected.text, `${label}: texto`);
  for (const key of ["html_anon", "html_ident", "html_default"]) {
    if (expected[key] !== undefined) sameText(actual[key], expected[key], `${label}: ${key}`);
  }
}

function readFixture(rel) {
  return fs.readFileSync(path.join(FIXTURES, rel), "utf8");
}

/* =====================================================================
 * 1. Referencia congelada
 * =================================================================== */
test("referencia · formateo numérico exacto", () => {
  for (const f of REF.formats) {
    const x = parseRepr(f.x);
    assert.equal(E.pyFormatG(x, 6), f.g6, `.6g de ${f.x}`);
    assert.equal(E.pyFormatG(x), f.g, `g de ${f.x}`);
    assert.equal(E.pyFormatF(x, 6), f.f6, `.6f de ${f.x}`);
    assert.equal(E.pyFormatF(x, 2), f.f2, `.2f de ${f.x}`);
    assert.equal(E.pyFormatE(x, 3), f.e3, `.3e de ${f.x}`);
    assert.equal(E.pyRepr(x), f.repr, `repr de ${f.x}`);
    assert.equal(E.pyFormatF(x * 100, 6), f.f6_100, `.6f de ${f.x}*100`);
  }
});

test("referencia · normalización de alelos, genotipos SNP, PI y marcadores", () => {
  const n = REF.normalize;
  for (const c of n.alleles) assert.deepEqual(E.normalizeAlleles(c.in), c.out, `alelos ${JSON.stringify(c.in)}`);
  for (const c of n.snp) assert.deepEqual(E.normalizeSnpGenotype(c.in), c.out, `snp ${JSON.stringify(c.in)}`);
  for (const c of n.pi) assert.deepEqual(enc(E.parsePiWithWarning(c.in)), c.out, `pi ${JSON.stringify(c.in)}`);
  for (const c of n.reason) assert.equal(E.nonInformativeMarkerReason(c.in), c.out, `motivo ${JSON.stringify(c.in)}`);
  for (const c of n.critical) assert.equal(E.criticalDataWarningReason(c.in), c.out, `crítica ${JSON.stringify(c.in)}`);
});

test("referencia · lectura CSV (detector de delimitador y lector)", () => {
  for (const c of REF.csv_inline) {
    assert.deepEqual(errorOf(() => E.readCsvRows(c.text)), c.rows, `CSV ${JSON.stringify(c.text.slice(0, 50))}`);
  }
});

test("referencia · lectura VCF y selección de muestras", () => {
  for (const c of REF.vcf_inline) {
    const label = JSON.stringify(c.text.slice(-60));
    assert.deepEqual(errorOf(() => E.readVcfSampleNames(c.text)), c.samples, `muestras ${label}`);
    for (const r of c.reads) {
      assert.deepEqual(
        errorOf(() => E.readVcfSnpRows(c.text, r.child, r.parent)),
        r.rows,
        `filas ${label} (${r.child}/${r.parent})`
      );
    }
  }
  for (const c of REF.selection_warnings) {
    assert.deepEqual(E.vcfSampleSelectionWarnings(c.samples, c.child, c.parent), c.out);
  }
});

test("referencia · validación de columnas y advertencias de entrada", () => {
  for (const c of REF.validations) {
    assert.deepEqual(errorOf(() => E.validateCsvColumns(c.rows, c.assay)), c.out, `validación ${c.assay}`);
  }
  for (const c of REF.input_warnings) {
    assert.deepEqual(E.markerInputWarnings(c.rows, c.assay), c.out);
  }
});

test("referencia · análisis por filas (incl. texto y reporte HTML)", () => {
  REF.row_cases.forEach((c, i) => {
    const actual = analysisBundle(c.assay, c.rows, c.prior, c.out.html_anon !== undefined);
    compareBundle(actual, c.out, `caso ${i} (${c.assay})`);
  });
});

test("referencia · archivos de ejemplo, simulación y auditoría", () => {
  for (const fx of REF.fixtures) {
    const text = readFixture(fx.file);
    if (fx.file.toLowerCase().endsWith(".vcf")) {
      assert.deepEqual(errorOf(() => E.readVcfSampleNames(text)), fx.samples, `${fx.file}: muestras`);
      if (!fx.rows) continue;
      const rows = errorOf(() => E.readVcfSnpRows(text, fx.child, fx.parent));
      assert.deepEqual(rows, fx.rows, `${fx.file}: filas`);
      assert.deepEqual(E.vcfSampleSelectionWarnings(fx.samples.ok, fx.child, fx.parent), fx.selection_warnings);
      if (rows.ok) {
        const raw = E.readVcfSnpRows(text, fx.child, fx.parent);
        assert.deepEqual(E.markerInputWarnings(raw, "snp_panel"), fx.input_warnings, `${fx.file}: advertencias`);
        compareBundle(analysisBundle("snp_panel", raw, 0.5, true), fx.analysis.snp_panel, `${fx.file}`);
      }
      continue;
    }
    const rows = errorOf(() => E.readCsvRows(text));
    assert.deepEqual(rows, fx.rows, `${fx.file}: filas`);
    if (!rows.ok) continue;
    const raw = E.readCsvRows(text);
    for (const assay of Object.keys(fx.analysis)) {
      assert.deepEqual(errorOf(() => E.validateCsvColumns(raw, assay)), fx.validation[assay], `${fx.file}: validación ${assay}`);
      assert.deepEqual(E.markerInputWarnings(raw, assay), fx.input_warnings[assay], `${fx.file}: advertencias ${assay}`);
      const expected = fx.analysis[assay];
      compareBundle(analysisBundle(assay, raw, 0.5, expected.html_anon !== undefined), expected, `${fx.file} [${assay}]`);
    }
  }
});

/* =====================================================================
 * 2. Casos de comportamiento del motor
 * =================================================================== */
function assertTriajeLanguage(text) {
  const lowered = text.toLowerCase();
  assert.ok(lowered.includes("triaje"));
  for (const forbidden of ["demuestra", "confirma la paternidad", "descarta la paternidad", "prueba legal"]) {
    assert.ok(!lowered.includes(forbidden), `lenguaje prohibido: ${forbidden}`);
  }
}

function assertAlmostEqual(a, b) {
  assert.ok(Math.round((a - b) * 1e7) === 0, `${a} ≈ ${b}`);
}

function rowsForFixture(rel) {
  const text = readFixture(rel);
  if (rel.toLowerCase().endsWith(".vcf")) {
    const samples = E.readVcfSampleNames(text);
    const child = samples.find((s) => s.toLowerCase().includes("hijo") || s.toLowerCase().includes("hija")) || samples[0];
    const parent = samples.find((s) => s !== child);
    return E.readVcfSnpRows(text, child, parent);
  }
  return E.readCsvRows(text);
}

const str = (marker, c1, c2, p1, p2, pi) => {
  const row = { marker, child_a1: c1, child_a2: c2, parent_a1: p1, parent_a2: p2 };
  if (pi !== undefined) row.pi = pi;
  return row;
};

test("motor · STR compatible con PI", () => {
  const r = E.analyzeMarkers("str_ce", [str("D8S1179", "12", "13", "13", "14", "2"), str("FGA", "22", "24", "21", "24", "3")]);
  assert.equal(r.exclusions, 0);
  assert.equal(r.compatible_markers, 2);
  assertAlmostEqual(r.cpi, 6);
  assertAlmostEqual(r.posterior_probability, 6 / 7);
  assert.equal(r.algorithm_version, E.ALGORITHM_VERSION);
  assertTriajeLanguage(r.conclusion);
});

test("motor · incompatibilidad", () => {
  const r = E.analyzeMarkers("snp_panel", [{ marker: "rs1", child_genotype: "A/G", parent_genotype: "C/C" }]);
  assert.equal(r.exclusions, 1);
  assert.equal(r.cpi, null);
  assert.equal(r.posterior_probability, null);
  assertTriajeLanguage(r.conclusion);
});

test("motor · genotipo SNP compacto se separa", () => {
  assert.deepEqual(E.normalizeSnpGenotype("AG"), ["A", "G"]);
  assert.deepEqual(E.normalizeSnpGenotype("R"), ["A", "G"]);
  const r = E.analyzeMarkers("snp_panel", [{ marker: "rs1", child_genotype: "AG", parent_genotype: "GG" }]);
  assert.equal(r.compatible_markers, 1);
  assert.equal(r.exclusions, 0);
  assertTriajeLanguage(r.conclusion);
});

test("motor · sin posterior cuando hay exclusión aunque haya PI", () => {
  const r = E.analyzeMarkers("str_ce", [str("D8S1179", "12", "13", "13", "14", "100"), str("FGA", "22", "24", "18", "19", "100")]);
  assert.equal(r.exclusions, 1);
  assert.equal(r.cpi, null);
  assert.equal(r.posterior_probability, null);
  assert.ok(r.warnings.some((w) => w.includes("No se calcula CPI")));
  assertTriajeLanguage(r.conclusion);
});

test("motor · PI inválido bloquea estadística", () => {
  const r = E.analyzeMarkers("str_ce", [str("D8S1179", "12", "13", "13", "14", "-2")]);
  assert.equal(r.compatible_markers, 1);
  assert.equal(r.cpi, null);
  assert.ok(r.warnings.some((w) => w.includes("PI inválidos")));
  assertTriajeLanguage(r.conclusion);
});

test("motor · PI=0 en marcador compatible bloquea estadística", () => {
  const r = E.analyzeMarkers("str_ce", [str("D8S1179", "12", "13", "13", "14", "0")]);
  assert.equal(r.cpi, null);
  assert.ok(r.warnings.some((w) => w.includes("PI=0")));
  assertTriajeLanguage(r.conclusion);
});

test("motor · PI con coma decimal", () => {
  const r = E.analyzeMarkers("str_ce", [str("D8S1179", "12", "13", "13", "14", "1,5")]);
  assertAlmostEqual(r.cpi, 1.5);
});

test("motor · PI con coma ambigua de miles bloquea estadística", () => {
  const r = E.analyzeMarkers("str_ce", [str("D8S1179", "12", "13", "13", "14", "1,234")]);
  assert.equal(r.cpi, null);
  assert.ok(r.markers[0].pi_warning.includes("coma ambigua"));
  assert.ok(r.warnings.some((w) => w.includes("PI inválidos")));
});

test("motor · CSV sin columnas obligatorias se rechaza", () => {
  assert.throws(
    () => E.validateCsvColumns([{ marker: "D8S1179", child_a1: "12", child_a2: "13", parent_a1: "13" }], "str_ce"),
    /parent_a2/
  );
});

test("motor · CSV con encabezados duplicados se rechaza", () => {
  assert.throws(() => E.readCsvRows("marker,child_a1,child_a1,child_a2,parent_a1,parent_a2\nD8S1179,12,99,13,13,14\n"), /duplicados/);
});

test("motor · columnas alias aceptadas", () => {
  E.validateCsvColumns([{ marcador: "rs1", hijo_genotipo: "A/G", progenitor_genotipo: "A/A" }], "snp_panel");
});

test("motor · advertencias de genotipos raros e incompletos", () => {
  const joined = E.markerInputWarnings(
    [
      { marker: "rs1", child_genotype: "A/G/T", parent_genotype: "A/Z" },
      { marker: "D8S1179", child_a1: "12", child_a2: "", parent_a1: "13", parent_a2: "14" },
    ],
    "snp_panel"
  ).join(" ");
  assert.ok(joined.includes("Más de dos valores"));
  assert.ok(joined.includes("Alelo SNP no estándar"));
});

test("motor · AMEL no informativo para conteos", () => {
  const r = E.analyzeMarkers("str_ce", [str("AMEL", "X", "Y", "X", "Y", "99"), str("D8S1179", "12", "13", "13", "14", "2")]);
  assert.equal(r.captured_markers, 2);
  assert.equal(r.total_markers, 1);
  assert.equal(r.non_informative_markers, 1);
  assert.equal(r.compatible_markers, 1);
  assert.equal(r.exclusions, 0);
  assertAlmostEqual(r.cpi, 2);
  assert.ok(r.warnings.some((w) => w.includes("no informativos")));
  assert.ok(r.warnings.some((w) => w.includes("marcadores no informativos")));
  assert.equal(r.markers[0].marker, "AMEL");
  assert.equal(r.markers[0].paternity_informative, false);
});

test("motor · controles y no autosómicos son no informativos", () => {
  const r = E.analyzeMarkers("str_ce", [
    str("CONTROL_POS", "1", "", "1", ""),
    str("DYS391", "10", "", "10", ""),
    str("DXS10135", "20", "21", "20", "21"),
    str("FGA", "22", "24", "24", "25"),
  ]);
  assert.equal(r.captured_markers, 4);
  assert.equal(r.total_markers, 1);
  assert.equal(r.non_informative_markers, 3);
  assert.equal(r.compatible_markers, 1);
  assert.equal(r.exclusions, 0);
  assert.ok(r.markers.slice(0, 3).every((m) => !m.paternity_informative));
  assertTriajeLanguage(r.conclusion);
});

test("motor · sólo marcadores no informativos", () => {
  const r = E.analyzeMarkers("str_ce", [str("AMEL", "X", "Y", "X", "Y")]);
  assert.equal(r.captured_markers, 1);
  assert.equal(r.total_markers, 0);
  assert.equal(r.non_informative_markers, 1);
  assert.equal(r.informative_markers, 0);
  assert.equal(r.cpi, null);
  assert.equal(r.posterior_probability, null);
  assert.ok(r.conclusion.includes("no hay marcadores suficientes"));
  assert.ok(!r.warnings.some((w) => w.includes("No se ingresaron PI")));
  assertTriajeLanguage(r.conclusion);
});

test("motor · ejemplo STR conocido: CPI y posterior", () => {
  const r = E.analyzeMarkers("str_ce", rowsForFixture("ejemplos/str_ce_compatible.csv"));
  const expected = 2.15 * 1.87 * 2.42 * 1.76 * 2.08 * 1.62 * 2.35 * 3.18;
  assert.equal(r.captured_markers, 8);
  assert.equal(r.total_markers, 8);
  assert.equal(r.compatible_markers, 8);
  assert.equal(r.exclusions, 0);
  assertAlmostEqual(r.cpi, expected);
  assertAlmostEqual(r.posterior_probability, expected / (expected + 1));
  assertTriajeLanguage(r.conclusion);
});

test("motor · ejemplo STR con dos incongruencias bloquea estadística", () => {
  const r = E.analyzeMarkers("str_ce", rowsForFixture("ejemplos/str_ce_no_compatible.csv"));
  assert.equal(r.exclusions, 2);
  assert.equal(r.cpi, null);
  assert.ok(r.conclusion.includes("patrón no compatible"));
  assertTriajeLanguage(r.conclusion);
});

test("motor · PI parcial usa sólo los PI capturados y avisa", () => {
  const r = E.analyzeMarkers("str_ce", [str("D8S1179", "12", "13", "13", "14", "2"), str("FGA", "22", "24", "21", "24")]);
  assert.equal(r.exclusions, 0);
  assertAlmostEqual(r.cpi, 2);
  assertAlmostEqual(r.posterior_probability, 2 / 3);
  assert.ok(r.warnings.some((w) => w.includes("solo los 1 marcador")));
  assertTriajeLanguage(r.conclusion);
});

test("motor · datos faltantes son incompletos, no exclusión", () => {
  const r = E.analyzeMarkers("str_ce", [str("D8S1179", "12", "", "", "")]);
  assert.equal(r.informative_markers, 0);
  assert.equal(r.exclusions, 0);
  assert.equal(r.missing_markers, 1);
  assert.equal(r.cpi, null);
  assertTriajeLanguage(r.conclusion);
});

test("motor · PI en marcador incompleto no se usa", () => {
  const r = E.analyzeMarkers("str_ce", [str("D8S1179", "12", "", "", "", "9")]);
  assert.equal(r.missing_markers, 1);
  assert.equal(r.cpi, null);
  assert.ok(r.warnings.some((w) => w.includes("no se usan en CPI/posterior")));
  assertTriajeLanguage(r.conclusion);
});

test("motor · ejemplo STR por MPS con secuencias", () => {
  const r = E.analyzeMarkers("str_mps", rowsForFixture("ejemplos/str_mps_compatible.csv"));
  assert.equal(r.total_markers, 4);
  assert.equal(r.compatible_markers, 4);
  assert.equal(r.exclusions, 0);
  assertAlmostEqual(r.cpi, 1.91 * 2.21 * 2.04 * 3.32);
  assertTriajeLanguage(r.conclusion);
});

test("motor · ejemplo de microhaplotipos", () => {
  const r = E.analyzeMarkers("microhap", rowsForFixture("ejemplos/microhap_compatible.csv"));
  assert.equal(r.total_markers, 4);
  assert.equal(r.compatible_markers, 4);
  assertAlmostEqual(r.cpi, 2.4 * 1.9 * 2.15 * 1.7);
  assertTriajeLanguage(r.conclusion);
});

test("motor · probabilidad previa inválida se rechaza", () => {
  assert.throws(() => E.analyzeMarkers("str_ce", [str("D8S1179", "12", "13", "13", "14")], 1.0));
});

test("motor · suite simulada compatible: resultados conocidos", () => {
  const cases = [
    ["str_ce", "1_str_ce_globalfiler_compatible.csv", 21, 336748562.72655493],
    ["str_mps", "2_str_mps_forenseq_compatible.csv", 12, 1993066.0886690607],
    ["snp_panel", "3_snp_panel_compatible.csv", 30, 78879823.96414323],
    ["snp_panel", "3_snp_panel_compatible.vcf", 30, null],
    ["microhap", "4_microhaplotipos_compatible.csv", 18, 88889137.89236185],
  ];
  for (const [assay, file, total, cpi] of cases) {
    const r = E.analyzeMarkers(assay, rowsForFixture(`simulacion/compatible/${file}`));
    const useful = file.startsWith("1_str_ce") ? total - 1 : total;
    assert.equal(r.captured_markers, total, file);
    assert.equal(r.total_markers, useful, file);
    assert.equal(r.compatible_markers, useful, file);
    assert.equal(r.exclusions, 0, file);
    if (cpi === null) {
      assert.equal(r.cpi, null);
      assert.equal(r.posterior_probability, null);
    } else {
      assertAlmostEqual(r.cpi, cpi);
      assertAlmostEqual(r.posterior_probability, cpi / (cpi + 1));
    }
    assertTriajeLanguage(r.conclusion);
  }
});

test("motor · suite simulada de exclusión: resultados conocidos", () => {
  const cases = [
    ["str_ce", "1_str_ce_globalfiler_exclusion.csv", 21, 4, 16],
    ["str_mps", "2_str_mps_forenseq_exclusion.csv", 12, 3, 9],
    ["snp_panel", "3_snp_panel_exclusion.csv", 30, 15, 15],
    ["snp_panel", "3_snp_panel_exclusion.vcf", 30, 15, 15],
    ["microhap", "4_microhaplotipos_exclusion.csv", 18, 4, 14],
  ];
  for (const [assay, file, total, compatible, exclusions] of cases) {
    const r = E.analyzeMarkers(assay, rowsForFixture(`simulacion/exclusion/${file}`));
    const useful = file.startsWith("1_str_ce") ? total - 1 : total;
    assert.equal(r.captured_markers, total, file);
    assert.equal(r.total_markers, useful, file);
    assert.equal(r.compatible_markers, compatible, file);
    assert.equal(r.exclusions, exclusions, file);
    assert.equal(r.cpi, null);
    assert.ok(r.conclusion.includes("patrón no compatible"));
    assertTriajeLanguage(r.conclusion);
  }
});

const VCF_HEAD = "##fileformat=VCFv4.2\n#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\tFORMAT\t";

test("motor · VCF con dos muestras", () => {
  const rows = E.readVcfSnpRows(VCF_HEAD + "child\tparent\n1\t100\trs1\tA\tG\t.\t.\t.\tGT\t0/1\t0/0\n");
  assert.equal(rows[0].child_genotype, "A/G");
  assert.equal(rows[0].parent_genotype, "A/A");
});

test("motor · VCF: nombres de muestras y asignación explícita", () => {
  const text = VCF_HEAD + "padre_alegado\thija\n1\t100\trs1\tA\tG\t.\t.\t.\tGT\t0/0\t0/1\n";
  assert.deepEqual(E.readVcfSampleNames(text), ["padre_alegado", "hija"]);
  const rows = E.readVcfSnpRows(text, "hija", "padre_alegado");
  assert.equal(rows[0].child_genotype, "A/G");
  assert.equal(rows[0].parent_genotype, "A/A");
});

test("motor · VCF: advertencias por FILTER, faltantes, multialélico, DP y GQ", () => {
  const rows = E.readVcfSnpRows(
    VCF_HEAD + "hija\tpadre_alegado\n1\t100\trs1\tA\tG,T\t.\tLowQual\t.\tGT:DP:GQ\t./.:4:10\t0/2:20:99\n",
    "hija",
    "padre_alegado"
  );
  assert.equal(rows[0].child_genotype, "");
  assert.equal(rows[0].parent_genotype, "A/T");
  for (const piece of ["FILTER=LowQual", "multialélico", "GT faltante", "DP bajo", "GQ bajo"]) {
    assert.ok(rows[0].validation_warning.includes(piece), piece);
  }
});

test("motor · advertencia crítica de VCF bloquea estadística", () => {
  const r = E.analyzeMarkers("snp_panel", [
    {
      marker: "rs1",
      child_genotype: "A/G",
      parent_genotype: "A/A",
      pi: "2",
      validation_warning: "VCF FILTER=LowQual; revisa calidad antes de interpretar.",
    },
  ]);
  assert.equal(r.compatible_markers, 1);
  assert.equal(r.cpi, null);
  assert.ok(r.warnings.some((w) => w.includes("advertencias críticas")));
});

test("motor · VCF sin GT queda incompleto", () => {
  const rows = E.readVcfSnpRows(
    VCF_HEAD + "hija\tpadre_alegado\n1\t100\trs1\tA\tG\t.\tPASS\t.\tDP:GQ\t20:99\t18:99\n",
    "hija",
    "padre_alegado"
  );
  assert.equal(rows[0].child_genotype, "");
  assert.equal(rows[0].parent_genotype, "");
  assert.ok(rows[0].validation_warning.includes("FORMAT no contiene GT"));
});

test("motor · advertencias de selección VCF: muestras extra y nombres invertidos", () => {
  const joined = E.vcfSampleSelectionWarnings(["padre_alegado", "hija", "madre"], "padre_alegado", "hija").join(" ");
  assert.ok(joined.includes("3 muestras"));
  assert.ok(joined.includes("parece tener nombre de progenitor"));
  assert.ok(joined.includes("parece tener nombre de hijo/a"));
});

test("motor · VCF rechaza la misma muestra", () => {
  assert.throws(() => E.readVcfSnpRows(VCF_HEAD + "a\tb\n1\t100\trs1\tA\tG\t.\t.\t.\tGT\t0/1\t0/0\n", "a", "a"));
});

test("motor · VCF rechaza una muestra inexistente", () => {
  assert.throws(() => E.readVcfSnpRows(VCF_HEAD + "a\tb\n1\t100\trs1\tA\tG\t.\t.\t.\tGT\t0/1\t0/0\n", "hija", "a"));
});

/* =====================================================================
 * 3. Interfaz web
 * =================================================================== */
test("web · canonicalizeRows lee todos los alias que acepta la validación", () => {
  // `parent` y `alleged_parent` pasan la validación del motor; aquí también se leen.
  const rows = E.canonicalizeRows(
    [
      { marcador: "rs1", child: "A/G", parent: "A/A", notes: "n1", "indice de paternidad": "2" },
      { locus: "rs2", hijo_genotipo: "C/C", alleged_parent: "C/T" },
    ],
    "snp_panel"
  );
  assert.deepEqual(rows[0], { marker: "rs1", child_genotype: "A/G", parent_genotype: "A/A", pi: "2", note: "n1", validation_warning: "" });
  assert.deepEqual(rows[1], { marker: "rs2", child_genotype: "C/C", parent_genotype: "C/T", pi: "", note: "", validation_warning: "" });
});

test("web · las advertencias críticas del VCF llegan al análisis (bloquean CPI)", () => {
  const vcf = VCF_HEAD + "hija\tpadre\n1\t100\trs1\tA\tG\t.\tLowQual\t.\tGT\t0/1\t0/0\n";
  const rows = E.canonicalizeRows(E.readVcfSnpRows(vcf, "hija", "padre"), "snp_panel");
  rows[0].pi = "5"; // aunque el usuario añada un PI a mano
  const r = E.analyzeMarkers("snp_panel", rows);
  assert.equal(r.compatible_markers, 1);
  assert.equal(r.cpi, null);
  assert.ok(r.warnings.some((w) => w.includes("advertencias críticas")));
});

test("web · dígitos no ASCII en PI se marcan inválidos", () => {
  assert.deepEqual(E.parsePiWithWarning("١٢"), [null, "PI inválido: ١٢"]);
});

test("web · el reporte escapa HTML de datos importados", () => {
  const r = E.analyzeMarkers("str_ce", [str("<img src=x onerror=alert(1)>", "12", "13", "13", "14")]);
  const html = R.buildHtmlReport(r, META_ANON);
  assert.ok(!html.includes("<img src=x"));
  assert.ok(html.includes("&lt;img src=x onerror=alert(1)&gt;"));
});

function loadCharts() {
  global.self = global;
  global.AriadnaEngine = E;
  require("../js/charts.js");
  return global.AriadnaCharts;
}

test("web · la escala de soporte usa los mismos umbrales que la conclusión", () => {
  const C = loadCharts();
  assert.equal(C.supportLevel(0.999).label, "soporte alto");
  assert.equal(C.supportLevel(0.9989999).label, "soporte moderado");
  assert.equal(C.supportLevel(0.95).label, "soporte moderado");
  assert.equal(C.supportLevel(0.9499).label, "soporte limitado");
  // ejemplo real: 8 STR con PI modestos → posterior 99.77 % = moderado (no "alto")
  const r = E.analyzeMarkers("str_ce", E.readCsvRows(readFixture("ejemplos/str_ce_compatible.csv")));
  assert.ok(r.conclusion.includes("moderado"));
  assert.equal(C.supportLevel(r.posterior_probability).key, "moderate");
  // el CPI cae entre los umbrales de 95 % y 99.9 % calculados con la previa usada
  const prior = r.prior_probability_used;
  assert.ok(r.cpi >= C.cpiThreshold(0.95, prior) && r.cpi < C.cpiThreshold(0.999, prior));
  // y la posterior de esos umbrales es exactamente la del motor
  const post = (cpi) => (cpi * prior) / (cpi * prior + (1 - prior));
  assert.ok(Math.abs(post(C.cpiThreshold(0.95, prior)) - 0.95) < 1e-12);
  assert.ok(Math.abs(post(C.cpiThreshold(0.999, prior)) - 0.999) < 1e-12);
  const svg = C.supportScale(r, 800);
  assert.ok(svg.includes('class="pin-dot"') && svg.includes("zone-moderate") && !svg.includes("is-off"));
  assert.ok(svg.includes(C.formatPosterior(r.posterior_probability, 2)));
});

test("web · sin CPI la escala se apaga y explica el motivo", () => {
  const C = loadCharts();
  const r = E.analyzeMarkers("str_ce", E.readCsvRows(readFixture("ejemplos/str_ce_no_compatible.csv")));
  assert.equal(r.cpi, null);
  const svg = C.supportScale(r, 800);
  assert.ok(svg.includes("is-off") && !svg.includes("pin-dot"));
  assert.ok(svg.includes(E.escapeHtml(C.blockedReason(r))));
});

test("web · el electroferograma une sólo los alelos compartidos", () => {
  const C = loadCharts();
  const r = E.analyzeMarkers("str_ce", [
    str("D8S1179", "12", "13", "13", "14", "1.8"),
    str("TH01", "6", "7", "9.3", "9.3"),
    str("<b>x</b>", "A", "B", "B", "C"),
  ]);
  const [ok, bad, odd] = r.markers;

  const okSvg = C.trace(ok, 600);
  assert.equal((okSvg.match(/class="tr-link"/g) || []).length, 1, "un solo alelo compartido");
  assert.equal((okSvg.match(/pk-shared/g) || []).length, 2, "el compartido aparece arriba y abajo");
  assert.ok(!okSvg.includes("is-bad"));
  // eje numérico: 12 < 13 < 14 de izquierda a derecha
  const xOf = (svg, label) => Number(new RegExp('x="([\\d.]+)"[^>]*>' + label.replace(".", "\\.") + "<").exec(svg)[1]);
  assert.ok(xOf(okSvg, "12") < xOf(okSvg, "13") && xOf(okSvg, "13") < xOf(okSvg, "14"));

  const badSvg = C.trace(bad, 600);
  assert.equal(bad.compatible, false);
  assert.ok(!badSvg.includes('class="tr-link"') && badSvg.includes("tr-base is-bad"));
  // homocigoto 9.3/9.3: un solo pico con una sola etiqueta
  assert.equal((badSvg.match(/>9\.3</g) || []).length, 1);

  const oddSvg = C.trace(odd, 600);
  assert.ok(!oddSvg.includes("<b>") && oddSvg.includes("Hijo/a: A, B"));
});

test("web · el peso del PI y el carril no inventan índices", () => {
  const C = loadCharts();
  const r = E.analyzeMarkers("str_ce", [str("A", "12", "13", "13", "14", "4"), str("B", "6", "7", "7", "8"), str("C", "6", "7", "8", "9", "3")]);
  const scale = C.weightScale(r);
  assert.ok(Math.abs(scale - Math.log10(4)) < 1e-12, "la escala sólo usa PI de marcadores compatibles");
  assert.ok(C.weight(r.markers[0], scale, 150).includes("w-pos"));
  assert.equal(C.weight(r.markers[1], scale, 150), "");
  assert.ok(C.weight(r.markers[2], scale, 150).includes("w-off"), "PI de una incongruencia no se usa");
  const lane = C.markerLane(r, 300);
  assert.deepEqual([...lane.matchAll(/class="lane-(\w+)"/g)].map((m) => m[1]), ["ok", "ok", "bad"]);
});

test("web · index.html versiona todos sus recursos con la versión de package.json", () => {
  const version = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8")).version;
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  const refs = [...html.matchAll(/(?:src|href)="((?:js|css)\/[^"]+)"/g)].map((m) => m[1]);
  assert.ok(refs.length >= 8, "se esperaban los scripts y la hoja de estilos");
  for (const ref of refs) assert.ok(ref.endsWith("?v=" + version), `${ref} debe terminar en ?v=${version}`);
});

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
// La referencia se congeló con el algoritmo v0.1.4. Las versiones posteriores deben reproducirla
// exactamente; lo único que cambia es la etiqueta de versión impresa en cada resultado.
const REF = JSON.parse(
  fs.readFileSync(path.join(FIXTURES, "reference.json"), "utf8").split("ariADNa-triaje-v0.1.4").join(E.ALGORITHM_VERSION)
);

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

const example = (name) => E.readCsvRows(readFixture("ejemplos/" + name));
const attr = (tag, name) => Number(new RegExp(name + '="(-?[\\d.]+)"').exec(tag)[1]);

test("web · la figura de soporte usa los mismos umbrales que la conclusión", () => {
  const C = loadCharts();
  assert.equal(C.supportLevel(0.999).label, "soporte alto");
  assert.equal(C.supportLevel(0.9989999).label, "soporte moderado");
  assert.equal(C.supportLevel(0.95).label, "soporte moderado");
  assert.equal(C.supportLevel(0.9499).label, "soporte limitado");
  assert.equal(C.supportLevel(NaN).key, "unknown");
  // ejemplo real: 8 STR con PI modestos → posterior 99.77 % = moderado (no "alto")
  const r = E.analyzeMarkers("str_ce", example("str_ce_compatible.csv"));
  assert.ok(r.conclusion.includes("moderado"));
  const sup = C.support(r);
  assert.equal(sup.level.key, "moderate");
  assert.equal(sup.posterior, r.posterior_probability, "en casos normales se usa la posterior del motor, sin recalcular");
  const prior = r.prior_probability_used;
  assert.ok(r.cpi >= C.cpiThreshold(0.95, prior) && r.cpi < C.cpiThreshold(0.999, prior));
  const post = (cpi) => (cpi * prior) / (cpi * prior + (1 - prior));
  assert.ok(Math.abs(post(C.cpiThreshold(0.95, prior)) - 0.95) < 1e-12);
  assert.ok(Math.abs(post(C.cpiThreshold(0.999, prior)) - 0.999) < 1e-12);

  const svg = C.supportFigure(r, 1000);
  assert.ok(svg.includes("CPI 431 · 99.77 %"), "el pin dice CPI y posterior");
  assert.ok(svg.includes(">95 %<") && svg.includes(">99.9 %<") && svg.includes("previa 50 %"), "eje de probabilidad posterior");
  // franja de composición: un segmento por índice usado, del más pesado al más ligero, que termina en el pin
  const segs = [...svg.matchAll(/<rect class="cs cs-[ab]"[^>]*>/g)].map((m) => m[0]);
  assert.equal(segs.length, 8);
  const widths = segs.map((t) => attr(t, "width"));
  assert.deepEqual(widths, [...widths].sort((a, b) => b - a));
  const end = attr(segs[7], " x") + attr(segs[7], "width");
  const pin = attr(/<line class="pin-line"[^>]*>/.exec(svg)[0], "x1");
  assert.ok(Math.abs(end - pin) < 1.5, `la franja termina en el pin (${end} vs ${pin})`);
});

test("web · sin CPI no se dibuja la figura de soporte; se explica el motivo", () => {
  const C = loadCharts();
  const r = E.analyzeMarkers("str_ce", example("str_ce_no_compatible.csv"));
  assert.equal(r.cpi, null);
  assert.equal(C.support(r), null);
  assert.equal(C.supportFigure(r, 800), "");
  assert.equal(C.priorStrip(r, 800), "");
  assert.equal(C.supportSentences(r), null);
  assert.ok(C.blockedReason(r).includes("incongruencias"));
});

test("web · un CPI que desborda no se vuelve «inf», «nan» ni «soporte limitado»", () => {
  const C = loadCharts();
  const rows = [];
  for (let i = 0; i < 5000; i++) rows.push({ marker: "rs" + i, child_genotype: "A/G", parent_genotype: "A/A", pi: "1.2" });
  const r = E.analyzeMarkers("snp_panel", rows);
  assert.equal(r.cpi, Infinity); // el motor base conserva la aritmética original
  const sup = C.support(r);
  assert.equal(sup.degenerate, true);
  assert.equal(sup.level.key, "high");
  assert.ok(Math.abs(sup.log10Cpi - 5000 * Math.log10(1.2)) < 1e-6);
  const shown = C.cpiShortFromLog(sup.log10Cpi) + " " + C.formatPosterior(sup.posterior, 2) + C.supportFigure(r, 900);
  assert.ok(!/inf|nan/i.test(shown.replace(/[^a-z]/gi, " ").replace(/\b(?!inf\b|nan\b)\w+\b/gi, "")), "ni inf ni nan en pantalla");
  assert.ok(C.supportFigure(r, 900).includes("fuera de escala"));
  // el reporte exportado con los añadidos web tampoco los imprime
  const extras = { cap_posterior: true };
  assert.ok(!/100\.000000%|\binf\b|nan%/.test(R.resultToText(r, extras)));
  assert.ok(R.resultToText(r, extras).includes(">99.999999%"));
});

test("web · la posterior mostrada nunca cruza un umbral que el valor no alcanzó", () => {
  const C = loadCharts();
  assert.equal(C.formatPosterior(0.99895, 2), "99.89 %"); // 99.895 redondearía a 99.90 con lectura «moderado»
  assert.equal(C.formatPosterior(0.999, 2), "99.90 %");
  assert.equal(C.formatPosterior(0.94996, 2), "94.99 %");
  assert.equal(C.formatPosterior(1, 2), ">99.99 %");
  assert.equal(C.formatPosterior(1e-9, 2), "<0.01 %");
  assert.equal(C.formatPosterior(NaN, 2), "—");
  assert.equal(C.cpiShort(431.203), "431");
  assert.equal(C.cpiShort(3.367e8), "3.4 × 10⁸");
  assert.equal(C.cpiShort(0.0004), "4.0 × 10⁻⁴");
});

test("web · la franja de la previa marca dónde cambiaría la lectura", () => {
  const C = loadCharts();
  const r = E.analyzeMarkers("str_ce", example("str_ce_compatible.csv"));
  const sen = C.supportSentences(r);
  const post = (prior) => (r.cpi * prior) / (r.cpi * prior + (1 - prior));
  assert.ok(Math.abs(post(sen.p95) - 0.95) < 1e-9 && Math.abs(post(sen.p999) - 0.999) < 1e-9);
  assert.ok(sen.prior.includes("≥ 0.70") && sen.prior.includes("desde 0.04"));
  assert.ok(sen.distance.includes("CPI ≥ 999") && sen.distance.includes("2.3 veces"));
  assert.equal(sen.compositionAlert, false);
  assert.ok(C.priorStrip(r, 900).includes(">0.70<"));
  // un índice mal transcrito (2.15 → 215) domina el CPI: debe decirse con palabras
  const rows = example("str_ce_compatible.csv");
  rows[0].pi = "215";
  const typo = C.supportSentences(E.analyzeMarkers("str_ce", rows));
  assert.equal(typo.compositionAlert, true);
  assert.ok(typo.composition.includes("D8S1179") && typo.composition.includes("verifica su transcripción"));
});

test("web · el esquema de alelos une sólo los compartidos y no falsea posiciones", () => {
  const C = loadCharts();
  const r = E.analyzeMarkers("str_ce", [
    str("D8S1179", "12", "13", "13", "14", "1.8"),
    str("TH01", "6", "7", "9.3", "9.3"),
    str("D21S11", "28", "32.2", "28", "30"),
    str("<b>x</b>", "A", "B", "B", "C"),
  ]);
  const [ok, bad, wide, odd] = r.markers;
  const unit = C.glyphUnit(r, 250);
  const xOf = (svg, label) => Number(new RegExp('x="([\\d.]+)"[^>]*>' + label.replace(".", "\\.") + "(?:×2)?<").exec(svg)[1]);

  const okSvg = C.alleleGlyph(ok, unit, 250);
  assert.equal((okSvg.match(/class="ag-link"/g) || []).length, 1, "un solo alelo compartido");
  assert.equal((okSvg.match(/pk-shared/g) || []).length, 2, "el compartido aparece arriba y abajo");
  assert.ok(!okSvg.includes("is-bad"));
  assert.ok(xOf(okSvg, "12") < xOf(okSvg, "13") && xOf(okSvg, "13") < xOf(okSvg, "14"));

  const badSvg = C.alleleGlyph(bad, unit, 250);
  assert.equal(bad.compatible, false);
  assert.ok(!badSvg.includes('class="ag-link"') && badSvg.includes("ag-base is-bad"));
  assert.ok(badSvg.includes(">9.3×2<"), "el homocigoto se dice con palabras, no con altura");
  // unidad común: una repetición mide lo mismo en todas las filas
  const perRepeatA = xOf(okSvg, "13") - xOf(okSvg, "12");
  const perRepeatB = xOf(badSvg, "7") - xOf(badSvg, "6");
  assert.ok(Math.abs(perRepeatA - perRepeatB) < 0.02, `${perRepeatA} vs ${perRepeatB}`);
  // 9.3 = 9 repeticiones + 3 bases de un motivo de 4 → a 3/4 del camino entre 9 y 10
  assert.equal(C.repeatPos("9.3", "TH01"), 9.75);
  assert.equal(C.repeatPos("9.3", "Penta D"), 9.6);
  // un alelo numérico nunca se abrevia (28… sería otro alelo)
  const wideSvg = C.alleleGlyph(wide, unit, 250);
  assert.ok(wideSvg.includes(">32.2<") && !wideSvg.includes("…"));

  const oddSvg = C.alleleGlyph(odd, unit, 250);
  assert.ok(!oddSvg.includes("<b>") && oddSvg.includes("Hijo/a: A, B") && !oddSvg.includes("ag-dot"));
});

test("web · PI y carril: sin barras inventadas y sin incongruencias ocultas", () => {
  const C = loadCharts();
  const r = E.analyzeMarkers("str_ce", [
    str("A", "12", "13", "13", "14", "4"),
    str("B", "6", "7", "7", "8"),
    str("C", "6", "7", "8", "9", "3"),
    str("D", "10", "11", "11", "12", "0.5"),
  ]);
  assert.equal(C.piAxisMax(r), 10);
  assert.ok(C.piBar(r.markers[0], 10, 110).includes("w-pos"));
  assert.equal(C.piBar(r.markers[1], 10, 110), "", "sin PI no hay barra");
  assert.equal(C.piBar(r.markers[2], 10, 110), "", "el PI de una incongruencia no se usa: sin barra");
  assert.ok(C.piBar(r.markers[3], 10, 110).includes("w-neg"), "PI < 1 se dibuja hacia la izquierda");
  const lane = C.laneNav(r, 300);
  assert.deepEqual([...lane.matchAll(/class="lane-(\w+)" data-i="(\d+)"/g)].map((m) => m[1] + m[2]).sort(), ["bad2", "ok0", "ok1", "ok3"]);

  // una sola incongruencia entre 5000 marcadores sigue visible (≥ 3 px) y se pinta al final
  const rows = [];
  for (let i = 0; i < 5000; i++) rows.push({ marker: "rs" + i, child_genotype: "A/G", parent_genotype: i === 3210 ? "C/C" : "A/A" });
  const big = E.analyzeMarkers("snp_panel", rows);
  const dense = C.laneNav(big, 334);
  const badMarks = [...dense.matchAll(/<rect class="lane-bad" data-i="(\d+)"[^>]*>/g)];
  assert.equal(badMarks.length, 1);
  assert.equal(badMarks[0][1], "3210");
  assert.ok(attr(badMarks[0][0], "width") >= 3);
  assert.ok(dense.lastIndexOf("lane-bad") > dense.lastIndexOf("lane-ok"));
});

test("web · los añadidos del reporte son opcionales y no alteran la salida base", () => {
  const r = E.analyzeMarkers("str_ce", [str("A", "12", "13", "13", "14", "1000000"), str("B", "6", "7", "7", "8", "1000000"), str("C", "9", "10", "10", "11", "1000000")]);
  const base = R.buildHtmlReport(r, META_ANON);
  assert.equal(R.buildHtmlReport(r, META_ANON, undefined), base);
  assert.ok(base.includes("100.000000%"), "la salida base queda como en la referencia congelada");
  const extras = {
    cap_posterior: true,
    verdict: ["warn", "Requiere revisión"],
    conclusion: "Triaje: revisar <antes>",
    insights: [{ level: "alert", title: "Perfiles <idénticos>", text: "Revisa & confirma" }],
    limits: ["<strong>Es un triaje preliminar.</strong> Orienta."],
  };
  const html = R.buildHtmlReport(r, META_ANON, extras);
  assert.ok(!html.includes("100.000000%") && html.includes("&gt;99.999999%"));
  assert.ok(html.includes('class="banner warn"') && html.includes("Triaje: revisar &lt;antes&gt;"));
  assert.ok(html.includes("Perfiles &lt;idénticos&gt;") && html.includes("Revisa &amp; confirma"));
  assert.ok(html.includes("<strong>Es un triaje preliminar.</strong>"));
  const text = R.resultToText(r, extras);
  assert.ok(text.includes("Observaciones de control:") && text.includes("Probabilidad posterior: >99.999999%"));
  assert.equal(R.resultToText(r), R.resultToText(r, undefined));
});

/* =====================================================================
 * 4. Mejoras del algoritmo v0.2.0 (no alteran la referencia congelada)
 * =================================================================== */
test("motor v0.2 · alelos equivalentes con formato distinto no son incongruencias", () => {
  assert.equal(E.alleleKey("12.0"), E.alleleKey("12"));
  assert.equal(E.alleleKey("08"), E.alleleKey("8"));
  assert.equal(E.alleleKey("9.30"), E.alleleKey("9.3"));
  assert.equal(E.alleleKey("a-c-g"), E.alleleKey("ACG"));
  assert.equal(E.alleleKey("[tcta] 11"), E.alleleKey("[TCTA]11"));
  assert.notEqual(E.alleleKey("9.3"), E.alleleKey("9"));
  assert.notEqual(E.alleleKey("12 13"), E.alleleKey("1213"), "el prefijo de tipo evita la colisión");
  const r = E.analyzeMarkers("str_ce", [str("D8", "12.0", "13.0", "14", "12", "2"), str("TH01", "9.3", "7", "9.30", "6", "1.5"), str("FGA", "22", "23", "24", "25")]);
  assert.deepEqual(r.markers.map((m) => m.compatible), [true, true, false]);
  assert.deepEqual(r.markers[0].child, ["12.0", "13.0"], "el texto capturado no se modifica");
  assert.ok(r.markers[0].data_warning.includes("Se igualaron formatos de alelo equivalentes para comparar (12.0 = 12)"));
  assert.equal(r.markers[2].data_warning, "");
  // coincidencia exacta: sin advertencia (como en la referencia)
  assert.equal(E.analyzeMarkers("str_ce", [str("D8", "12", "13", "13", "14")]).markers[0].data_warning, "");
});

test("motor v0.2 · «sin dato» nunca cuenta como alelo ni como incongruencia", () => {
  const strRes = E.analyzeMarkers("str_ce", [str("D8", "nan", "nan", "nan", "nan", "5"), str("FGA", "22", "--", "?", "23", "4")]);
  assert.deepEqual(strRes.markers.map((m) => m.compatible), [null, false]);
  assert.equal(strRes.cpi, null);
  const snp = (c, f) => E.analyzeMarkers("snp_panel", [{ marker: "rs1", child_genotype: c, parent_genotype: f, pi: "5" }]).markers[0];
  for (const token of ["--", "NN", "N/N", "NC", "NoCall", "??", "FAIL", "A/N", "AN"]) {
    assert.equal(snp(token, "AG").compatible, null, token + " es dato faltante");
    assert.equal(snp(token, token).compatible, null, token + " en ambos lados no es coincidencia");
  }
  assert.equal(snp("DI", "II").compatible, true, "indel: comparten I");
  assert.equal(snp("AB", "BB").compatible, true, "codificación A/B: comparten B");
  assert.equal(snp("AA", "BB").compatible, false);
  assert.equal(snp("0/0", "0/1").compatible, true, "0/0 es homocigoto de referencia, no un no-call");
});

test("motor v0.2 · marcadores ligados a X, Y o mitocondria no entran al triaje", () => {
  for (const name of ["AM", "Yindel", "HPRTB", "Y-GATA-H4", "X:8000", "MT:73", "chrM:73", "chrX_rs5"]) {
    assert.notEqual(E.nonInformativeMarkerReason(name), "", name);
  }
  for (const name of ["CHRNA5 rs16969968", "D8S1179", "rs1799971", "1:2345", "M1", "AMY1"]) {
    assert.equal(E.nonInformativeMarkerReason(name), "", name + " sigue siendo informativo");
  }
  const vcf = VCF_HEAD + "hijo\tpadre\n" +
    "1\t100\trs1\tA\tG\t.\tPASS\t.\tGT\t0/1\t0/0\n" +
    "X\t5000\trs900\tA\tG\t.\tPASS\t.\tGT\t1/1\t0/0\n" +
    "chrX\t6000\t.\tA\tG\t.\tPASS\t.\tGT\t1/1\t0/0\n" +
    "MT\t73\trs901\tA\tG\t.\tPASS\t.\tGT\t1/1\t0/0\n";
  const rows = E.canonicalizeRows(E.readVcfSnpRows(vcf, "hijo", "padre"), "snp_panel");
  assert.deepEqual(rows.map((x) => x.marker), ["rs1", "chrX:5000 rs900", "chrX:6000", "chrM:73 rs901"]);
  const r = E.analyzeMarkers("snp_panel", rows);
  assert.equal(r.exclusions, 0, "un padre y su hijo varón no comparten X ni ADN mitocondrial");
  assert.equal(r.non_informative_markers, 3);
});

test("motor v0.2 · un locus repetido bloquea el CPI y no duplica incongruencias", () => {
  const panel = [str("D8S1179", "12", "13", "13", "14", "20"), str("FGA", "22", "23", "23", "24", "30")];
  const once = E.analyzeMarkers("str_ce", panel);
  assert.equal(once.cpi, 600);
  const twice = E.analyzeMarkers("str_ce", panel.concat([str("d8s1179 ", "12", "13", "13", "14", "20"), str("F-G-A", "22", "23", "23", "24", "30")]));
  assert.equal(twice.cpi, null, "sin el bloqueo el CPI sería 360 000 y el soporte «alto»");
  assert.ok(twice.warnings.some((w) => w.includes("marcadores repetidos: D8S1179, FGA")));
  assert.ok(twice.conclusion.includes("hay marcadores repetidos"));
  assert.deepEqual(E.duplicateMarkers(twice.markers).map((g) => g.rows), [[0, 2], [1, 3]]);
  // la misma fila incongruente pegada dos veces es UNA incongruencia, no «patrón no compatible»
  const dup = E.analyzeMarkers("str_ce", [str("D8S1179", "12", "13", "15", "16"), str("D8S1179", "12", "13", "15", "16"), str("FGA", "22", "23", "23", "24")]);
  assert.equal(dup.exclusions, 2);
  assert.deepEqual(E.bannerMeta(dup), ["warn", "Requiere revisión"]);
  assert.ok(dup.conclusion.includes("una incongruencia aislada"));
  assert.equal(E.duplicateMarkers(E.analyzeMarkers("snp_panel", [{ marker: "1:2345", child_genotype: "AG", parent_genotype: "AA" }, { marker: "12:345", child_genotype: "AG", parent_genotype: "AA" }]).markers).length, 0);
});

test("motor v0.2 · la coma decimal en un alelo STR bloquea el CPI en vez de inventar compatibilidad", () => {
  // «9,3» + 6 frente a 9 + 7: leído como 9 y 3 "comparte" el 9 con el progenitor (falsa compatibilidad)
  const r = E.analyzeMarkers("str_ce", [str("TH01", "9,3", "6", "9", "7", "2.1"), str("FGA", "22", "23", "23", "24", "3")]);
  assert.equal(r.cpi, null);
  assert.ok(r.markers[0].data_warning.includes("Posible coma decimal en hijo/a: «9,3» se leyó como dos alelos (9 y 3)"));
  assert.ok(r.conclusion.includes("advertencias críticas"));
  assert.equal(E.analyzeMarkers("str_ce", [str("D8", "12,13", "", "13", "14", "2")]).markers[0].data_warning.includes("coma decimal"), false, "«12,13» son dos alelos");
});

test("motor v0.2 · observaciones de control", () => {
  const codes = (r) => E.triageInsights(r).map((o) => o.code + ":" + o.level);
  const example = (name, assay) => E.analyzeMarkers(assay, E.readCsvRows(readFixture("ejemplos/" + name)));
  // el ejemplo de 8 STR sólo recibe una nota informativa; no cambia su veredicto
  assert.deepEqual(codes(example("str_ce_compatible.csv", "str_ce")), ["pocos_marcadores:info"]);
  assert.deepEqual(codes(example("str_ce_no_compatible.csv", "str_ce")), ["anatomia_incongruencias:info"]);

  const loci = ["D3S1358", "vWA", "D16S539", "CSF1PO", "TPOX", "D8S1179", "D21S11", "D18S51", "D2S441", "D19S433", "TH01", "FGA"];
  const panel = (fn) => E.analyzeMarkers("str_ce", loci.map((name, i) => fn(name, i)));
  // panel normal de 12 STR: sin observaciones
  assert.deepEqual(codes(panel((n, i) => str(n, String(10 + i), String(12 + i), String(12 + i), String(14 + i), "2.5"))), []);
  // perfiles idénticos (misma muestra dos veces)
  const same = E.triageInsights(panel((n, i) => str(n, String(10 + i), String(12 + i), String(12 + i), String(10 + i), "2.5")));
  assert.deepEqual(same.map((o) => o.code), ["perfiles_identicos"]);
  assert.equal(same[0].level, "alert");
  // el laboratorio da un PI de exclusión en un marcador que comparte alelo (cálculo en trío o error)
  assert.ok(codes(panel((n, i) => str(n, String(10 + i), String(12 + i), String(12 + i), String(14 + i), i === 3 ? "0.002" : "2.5"))).includes("pi_contradice_duo:alert"));
  // un PI de 1 250 000 en un marcador: probablemente el CPI total tecleado en la columna
  assert.ok(codes(panel((n, i) => str(n, String(10 + i), String(12 + i), String(12 + i), String(14 + i), i === 0 ? "1250000" : "2.5"))).includes("pi_atipico:alert"));
  // índices en contra: CPI ≤ 1
  assert.ok(codes(panel((n, i) => str(n, String(10 + i), String(12 + i), String(12 + i), String(14 + i), "0.9"))).includes("cpi_no_apoya:alert"));
  // la previa cambia el nivel: se avisa que la diferencia no viene del ADN
  const prior = E.analyzeMarkers("str_ce", loci.map((n, i) => str(n, String(10 + i), String(12 + i), String(12 + i), String(14 + i), i === 0 ? "11" : "1")), 0.99);
  assert.ok(prior.conclusion.includes("alto"));
  const note = E.triageInsights(prior).find((o) => o.code === "nivel_depende_de_previa");
  assert.ok(note && note.level === "info" && note.text.includes("«limitado»") && note.text.includes("«alto»"));
  // muy pocos marcadores: nunca en verde
  const few = E.triageInsights(E.analyzeMarkers("str_ce", [str("D8S1179", "12", "13", "13", "14")]));
  assert.equal(few[0].verdict, "Compatible, con muy pocos marcadores");
  const snps = E.triageInsights(E.analyzeMarkers("snp_panel", [1, 2, 3, 4, 5, 6].map((i) => ({ marker: "rs" + i, child_genotype: "AG", parent_genotype: "AA" }))));
  assert.ok(snps[0].text.includes("al menos 44 de cada 100"), "cota (7/8)^6 = 44.9 %");
  // anatomía: un paso, varios pasos y homocigotos opuestos
  const steps = E.triageInsights(E.analyzeMarkers("str_ce", [str("vWA", "16", "18", "17", "19"), str("FGA", "14", "15", "19", "20"), str("TH01", "6", "6", "9", "9")]));
  const text = steps.find((o) => o.code === "anatomia_incongruencias").text;
  assert.ok(text.includes("vWA (16/18 frente a 17/19): a un paso de repetición"));
  assert.ok(text.includes("FGA (14/15 frente a 19/20): a 4 pasos de repetición"));
  assert.ok(text.includes("TH01 (6/6 frente a 9/9): homocigotos aparentes distintos"));
  // la capa es aditiva: no añade campos al resultado
  assert.ok(!("insights" in panel((n, i) => str(n, String(10 + i), String(12 + i), String(12 + i), String(14 + i)))));
});

test("web · index.html versiona todos sus recursos con la versión de package.json", () => {
  const version = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8")).version;
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  const refs = [...html.matchAll(/(?:src|href)="((?:js|css)\/[^"]+)"/g)].map((m) => m[1]);
  assert.ok(refs.length >= 8, "se esperaban los scripts y la hoja de estilos");
  for (const ref of refs) assert.ok(ref.endsWith("?v=" + version), `${ref} debe terminar en ?v=${version}`);
});

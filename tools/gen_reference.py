#!/usr/bin/env python3
"""Genera tests/fixtures/reference.json ejecutando el motor Python original.

Uso:
    python3 tools/gen_reference.py /ruta/al/plugin/ariADNa

El JSON resultante es la "verdad" contra la que tests/engine.test.js compara el
motor JavaScript: mismos conteos, CPI, posterior, advertencias, notas, texto y
reporte HTML (byte a byte).
"""
from __future__ import annotations

import dataclasses
import json
import math
import os
import sys
import tempfile

if len(sys.argv) != 2:
    sys.exit(__doc__)

PLUGIN_DIR = os.path.abspath(sys.argv[1])
sys.path.insert(0, PLUGIN_DIR)
import genetic_analysis as ga  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIXTURES = os.path.join(ROOT, "tests", "fixtures")
REST_KEY = "__rest__"
ASSAYS = ["str_ce", "str_mps", "snp_panel", "microhap"]

META_ANON = {
    "case_id": "Omitido",
    "child_id": "Omitido",
    "parent_id": "Omitido",
    "report_mode": "anonimizado; omite identificadores, conserva genotipos",
}
META_IDENT = {
    "case_id": "CASO-001 <b>&\"'",
    "child_id": "H-001",
    "parent_id": "PA-001",
    "report_mode": "con identificadores capturados",
}


def enc(value):
    """JSON-safe: floats no finitos como {"$float": ...}; claves None -> REST_KEY."""
    if isinstance(value, float) and not math.isfinite(value):
        return {"$float": "nan" if math.isnan(value) else ("inf" if value > 0 else "-inf")}
    if isinstance(value, float) and value == 0 and math.copysign(1.0, value) < 0:
        return {"$float": "-0"}
    if isinstance(value, dict):
        return {(REST_KEY if k is None else k): enc(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [enc(v) for v in value]
    return value


def result_dict(result):
    return enc(dataclasses.asdict(result))


def error_of(fn):
    try:
        return {"ok": enc(fn())}
    except ValueError as exc:
        return {"error": str(exc)}


def write_report(result, metadata):
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "r.html")
        ga.write_html_report(path, result, metadata)
        with open(path, encoding="utf-8") as handle:
            return handle.read()


def analysis_bundle(assay, rows, prior=0.5, html=False):
    try:
        result = ga.analyze_markers(assay, rows, prior)
    except ValueError as exc:
        return {"error": str(exc)}
    bundle = {"result": result_dict(result), "text": ga.result_to_text(result)}
    if html:
        bundle["html_anon"] = write_report(result, META_ANON)
        bundle["html_ident"] = write_report(result, META_IDENT)
        bundle["html_default"] = write_report(result, None)
    return bundle


def read_text(path):
    with open(path, "rb") as handle:
        return handle.read().decode("utf-8")


def assay_for(filename):
    name = filename.lower()
    if "str_ce" in name:
        return "str_ce"
    if "str_mps" in name:
        return "str_mps"
    if "snp" in name:
        return "snp_panel"
    if "microhap" in name:
        return "microhap"
    return None


# --------------------------------------------------------------------------
# 1. Formateo numérico
# --------------------------------------------------------------------------
FLOATS = [
    0.0, -0.0, 1.0, 2.15, 1.87, 6.0, 6 / 7, 2 / 3, 1 / 3, 0.5, 0.125, 0.375, 2.5, 3.5, -2.5,
    1e-5, 1.5e-7, 123456.0, 1234567.0, 999999.5, 999999.4, 0.0001, 0.00001234, 1e15, 1e16,
    1.2345678901234567e17, 3264000.0, 336748562.72655493, 1993066.0886690607, 78879823.96414323,
    88889137.89236185, 99.99997, 0.9999996936, 1e308, 5e-324, 2.2250738585072014e-308, 100.0,
    0.1, 0.2, 0.3, 1e21, 1e22, 12345.6789, 0.000999999, 9.9999995, 0.9995, 0.99949999,
    1.0000005, 1.23456e-8, -1234.5678, 431.2026617, 99.76862, 85.71428571428571, 66.66666666666667,
    0.05, 0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.95, 0.01, 0.99, 10.0, 4.0, 4.5, 19.99,
    float("inf"), float("-inf"), float("nan"),
]

formats = []
for x in FLOATS:
    formats.append({
        "x": repr(x),
        "g6": format(x, ".6g"),
        "g": format(x, "g"),
        "f6": format(x, ".6f"),
        "f2": format(x, ".2f"),
        "e3": format(x, ".3e"),
        "repr": repr(x),
        "f6_100": format(x * 100, ".6f"),
    })

# --------------------------------------------------------------------------
# 2. Normalización y PI
# --------------------------------------------------------------------------
ALLELE_INPUTS = [
    "12", " 12 ", "12,13", "12/13", "12|13", "12;13", "12 / 13", "NA", "n/a", "No data", "-", ".", "",
    "12,NA,13", "12,,13", "A-C-G", "A-C-G / A-T-G", "seq_29_TCTA6", "  ", "12\t13", "x", None, "nd",
    "12 13", "9.3", "12, 13 ,14", "N/A,12", " 12 ",
]
SNP_INPUTS = [
    "AG", "ag", "A/G", "a g", "A_G", "A-G", "R", "r", "Y", "S", "W", "K", "M", "N", "n", "NA", "A",
    "AA", "01", "0/1", "A/G/T", "A/Z", "AZ", "ACG", "rs1", "", None, "A G T", "  A/G  ", "12", "AG ",
    "A G", "B", "TT", "C|T", "no data", "a,g", "0 1",
]
PI_INPUTS = [
    "2", "2.15", " 2.15 ", "1,5", "1,234", "12,345,678", "1,234.5", "1.234,5", "1,23", "1e3", "1E-3",
    "0x10", "1_000", "-2", "-0", "0", "0.0", "inf", "Infinity", "nan", "abc", "", "NA", "-", ".",
    "2 000", "+3", ".5", "5.", "1.e5", None, "1,234,5", "001", "1\t2", "1e400", "1__0", "_1", "1_",
    "n/a", "No data", "3,1416", "99", "0,0", "1 , 5",
]
MARKER_NAMES = [
    "AMEL", "Amelogenin", "amel-x", "AMELY", "SRY", "CONTROL_POS", "ctrl", "Blank", "NTC", "Ladder",
    "ILS 600", "IPC", "QC1", "DYS391", "dxs10135", "Y-STR 1", "XSTR", "chrY:123", "chrX", "D8S1179",
    "FGA", "rs1", "mh01", "", "  ", "TPOX", "CSF1PO", "vWA", "SE33", "Penta E", "D21S11", "QCD",
    "STANDARD", "(sin marcador)", "Amelogenina", "Control negativo",
]

normalize = {
    "alleles": [{"in": v, "out": list(ga.normalize_alleles(v))} for v in ALLELE_INPUTS],
    "snp": [{"in": v, "out": list(ga.normalize_snp_genotype(v))} for v in SNP_INPUTS],
    "pi": [{"in": v, "out": enc(list(ga.parse_pi_with_warning(v)))} for v in PI_INPUTS],
    "reason": [{"in": v, "out": ga.non_informative_marker_reason(v)} for v in MARKER_NAMES],
    "critical": [
        {"in": v, "out": ga.critical_data_warning_reason(v)}
        for v in [
            "VCF FILTER=LowQual; x", "Sitio VCF multialélico; y", "GT faltante en muestra a.",
            "GT faltante o parcial (./1) en muestra a.", "GT contiene alelo fuera de REF/ALT (3) en muestra a.",
            "FORMAT no contiene GT para muestra a.", "Fila VCF con menos columnas de muestra que el encabezado.",
            "DP bajo en muestra a: 4 (<10).", "", None, "nada crítico",
        ]
    ],
}

# --------------------------------------------------------------------------
# 3. CSV en línea (detector de delimitador + lector)
# --------------------------------------------------------------------------
LONG = "marker,child_a1,child_a2,parent_a1,parent_a2,pi\n" + "".join(
    f"M{i},{i},{i + 1},{i + 1},{i + 2},{1 + i / 10}\n" for i in range(25)
)
CSV_TEXTS = [
    "marker,child_a1\nD8,12\n",
    "marker\tchild_a1\nD8\t12\n",
    "marker;child_a1;child_a2\nD8;12;13\n",
    "marker|child_a1|child_a2\nD8|12|13\n",
    "marker, child_a1, child_a2\nD8, 12, 13\n",
    "﻿marker,child_a1\r\nD8,12\r\n",
    'marker,note\nD8,"hola, mundo"\nFGA,"dice ""sí"""\n',
    "marker,child_a1,child_a2\nD8,12\n",
    "marker,child_a1\nD8,12,13,14\n",
    "",
    "marker,child_a1\n",
    "marker\nD8\nFGA\n",
    '"marker"\n"D8"\n"FGA"\n',
    "marker,child_a1\n\nD8,12\n\n",
    "a b c\n1 2 3\n",
    "marker:child\nD8:12\n",
    'marker,note\r\nD8,"multi\r\nline"\r\n',
    "marker,child_a1\rD8,12\r",
    "Marker,MARKER\nD8,FGA\n",
    " marker ,child_a1\nD8,12\n",
    ",,\n,,\n",
    "marker;child_a1,child_a2\nD8;12,13\n",
    'marker,child_genotype,parent_genotype\nrs1,"A/G","A/A"\n',
    "'marker','x'\n'a','b'\n",
    LONG,
    "marker,child_a1\nD8,12\n  \n",
    "marker,,\nD8,1,2\n",
    'marker,note\nD8,"sin cierre\n',
    "m,c\n1,2\n3,4\n5,6,7\n8\n",
    'marker,note\nD8, "con espacio"\n',
    "marker\tchild_genotype\tparent_genotype\tpi\nrs1\tA/G\tA/A\t1,5\n",
    "marker;child_a1;child_a2;parent_a1;parent_a2;pi\nD8;12;13;13;14;2,15\n",
]
def _read_csv_text(text):
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "f.csv")
        with open(path, "wb") as handle:
            handle.write(text.encode("utf-8"))
        return ga.read_csv_rows(path)


csv_inline = [{"text": t, "rows": error_of(lambda t=t: _read_csv_text(t))} for t in CSV_TEXTS]

# --------------------------------------------------------------------------
# 4. VCF en línea
# --------------------------------------------------------------------------
H = "##fileformat=VCFv4.2\n#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\tFORMAT\t"
VCF_TEXTS = [
    H + "child\tparent\n1\t100\trs1\tA\tG\t.\t.\t.\tGT\t0/1\t0/0\n",
    H + "padre_alegado\thija\n1\t100\trs1\tA\tG\t.\t.\t.\tGT\t0/0\t0/1\n",
    H + "hija\tpadre_alegado\n1\t100\trs1\tA\tG,T\t.\tLowQual\t.\tGT:DP:GQ\t./.:4:10\t0/2:20:99\n",
    H + "hija\tpadre_alegado\n1\t100\trs1\tA\tG\t.\tPASS\t.\tDP:GQ\t20:99\t18:99\n",
    H + "a\tb\n1\t100\trs1\tA\tG\t.\t.\t.\tGT\t0/1\t0/0\n",
    H + "hijo\tmadre\tpadre\n"
    "1\t100\t.\tA\tG\t.\tPASS\t.\tGT:DP\t0|1:4.5\t0/0:1e1\t1/1:nan\n"
    "1\t200\trs2\tC\t.\t.\t.\t.\tGT\t0/0\t0\t./1\n"
    "#comentario\n"
    "1\t300\trs3\tG\tA\t.\tPASS\t.\tGT\t-1/1\t+1/01\t1_0/3\n"
    "1\t400\trs4\tT\tC\t.\tPASS\t.\tGT\t0/1\n"
    "1\t500\trs5\tT\tC\t.\tPASS\n"
    "1\t600\trs6\tT\tC\t.\tPASS\t.\tGT:GQ\t.\t1/1:19.5\t0/0:.\n",
    "##solo cabecera\n",
    H + "solo_una\n1\t100\trs1\tA\tG\t.\t.\t.\tGT\t0/1\n",
    H + "x\ty\n",
    "\r\n".join((H + "child\tparent\n1\t100\trs1\tA\tG\t.\t.\t.\tGT\t0/1\t1/1\n").split("\n")),
]
SAMPLE_CHOICES = [
    (None, None), ("hija", "padre_alegado"), ("padre_alegado", "hija"), ("a", "a"), ("hija", "a"),
    ("hijo", "padre"), ("madre", "hijo"), ("child", "parent"), ("x", "y"),
]


def _vcf_path(text):
    tmp = tempfile.mkdtemp()
    path = os.path.join(tmp, "f.vcf")
    with open(path, "wb") as handle:
        handle.write(text.encode("utf-8"))
    return path


vcf_inline = []
for text in VCF_TEXTS:
    path = _vcf_path(text)
    entry = {"text": text, "samples": error_of(lambda p=path: ga.read_vcf_sample_names(p)), "reads": []}
    for child, parent in SAMPLE_CHOICES:
        entry["reads"].append({
            "child": child,
            "parent": parent,
            "rows": error_of(lambda p=path, c=child, pa=parent: ga.read_vcf_snp_rows(p, child_sample=c, parent_sample=pa)),
        })
    vcf_inline.append(entry)

selection_warnings = []
for samples, child, parent in [
    (["padre_alegado", "hija", "madre"], "padre_alegado", "hija"),
    (["hijo", "padre"], "hijo", "padre"),
    (["a", "b"], "a", "b"),
    (["Child_1", "Alleged_Father", "x"], "Alleged_Father", "Child_1"),
    (["descendiente", "progenitor"], "progenitor", "descendiente"),
    (["menor", "mother"], "menor", "mother"),
]:
    selection_warnings.append({
        "samples": samples, "child": child, "parent": parent,
        "out": ga.vcf_sample_selection_warnings(samples, child, parent),
    })

# --------------------------------------------------------------------------
# 5. Casos de análisis por filas
# --------------------------------------------------------------------------
def str_row(marker, c1, c2, p1, p2, pi=None, **extra):
    row = {"marker": marker, "child_a1": c1, "child_a2": c2, "parent_a1": p1, "parent_a2": p2}
    if pi is not None:
        row["pi"] = pi
    row.update(extra)
    return row


ROW_CASES = [
    ("str_ce", [str_row("D8S1179", "12", "13", "13", "14", "2"), str_row("FGA", "22", "24", "21", "24", "3")], 0.5),
    ("snp_panel", [{"marker": "rs1", "child_genotype": "A/G", "parent_genotype": "C/C"}], 0.5),
    ("snp_panel", [{"marker": "rs1", "child_genotype": "AG", "parent_genotype": "GG"}], 0.5),
    ("str_ce", [str_row("D8S1179", "12", "13", "13", "14", "100"), str_row("FGA", "22", "24", "18", "19", "100")], 0.5),
    ("str_ce", [str_row("D8S1179", "12", "13", "13", "14", "-2")], 0.5),
    ("str_ce", [str_row("D8S1179", "12", "13", "13", "14", "0")], 0.5),
    ("str_ce", [str_row("D8S1179", "12", "13", "13", "14", "1,5")], 0.5),
    ("str_ce", [str_row("D8S1179", "12", "13", "13", "14", "1,234")], 0.5),
    ("str_ce", [str_row("AMEL", "X", "Y", "X", "Y", "99"), str_row("D8S1179", "12", "13", "13", "14", "2")], 0.5),
    ("str_ce", [str_row("CONTROL_POS", "1", "", "1", ""), str_row("DYS391", "10", "", "10", ""),
                str_row("DXS10135", "20", "21", "20", "21"), str_row("FGA", "22", "24", "24", "25")], 0.5),
    ("str_ce", [str_row("AMEL", "X", "Y", "X", "Y")], 0.5),
    ("str_ce", [str_row("D8S1179", "12", "13", "13", "14", "2"), str_row("FGA", "22", "24", "21", "24")], 0.5),
    ("str_ce", [str_row("D8S1179", "12", "", "", "")], 0.5),
    ("str_ce", [str_row("D8S1179", "12", "", "", "", "9")], 0.5),
    ("str_ce", [str_row("D8S1179", "12", "13", "13", "14")], 1.0),
    ("str_ce", [str_row("D8S1179", "12", "13", "13", "14")], 0.0),
    ("str_ce", [str_row("D8S1179", "12", "13", "13", "14", "2")], 0.3),
    ("str_ce", [str_row("D8S1179", "12", "13", "13", "14", "2")], 0.01),
    ("str_ce", [str_row("D8S1179", "12", "13", "13", "14", "2")], 0.99),
    ("snp_panel", [{"marker": "rs1", "child_genotype": "A/G", "parent_genotype": "A/A", "pi": "2",
                    "validation_warning": "VCF FILTER=LowQual; revisa calidad antes de interpretar."}], 0.5),
    ("str_ce", [str_row("", "12", "13", "13", "14"), {"pi": "5"}, {"note": "solo nota"}, {}], 0.5),
    ("str_ce", [str_row(f"AMEL{i}", "X", "Y", "X", "Y", "2") for i in range(8)]
     + [str_row("D8", "12", "13", "13", "14", "3")], 0.5),
    ("str_ce", [str_row(f"L{i}", "12", "13", "13", "14", "abc") for i in range(7)], 0.5),
    ("str_ce", [str_row("L1", "12", "13", "13", "14", "1e308"), str_row("L2", "12", "13", "13", "14", "1e308")], 0.5),
    ("str_ce", [str_row("L1", "X", "13.2", "13.2", "Z", "2", note="nota propia")], 0.5),
    ("str_ce", [str_row("L1", "12", "13", "14", "15"), str_row("L2", "12", "13", "13", "14", "2")], 0.5),
    ("str_ce", [str_row("L1", "12/13/14", "", "13", "14", "2")], 0.5),
    ("snp_panel", [{"marker": "rs1", "child_genotype": "A/G/T", "parent_genotype": "A/Z"}], 0.5),
    ("snp_panel", [{"marcador": "rs1", "hijo_genotipo": "A/G", "progenitor_genotipo": "A/A", "indice_paternidad": "3"}], 0.5),
    ("snp_panel", [{"marker": "rs1", "child_genotype": "A/G", "parent": "A/A"}], 0.5),
    ("snp_panel", [{"marker": "rs1", "child_genotype": "N", "parent_genotype": "R", "pi": "1,2"}], 0.5),
    ("microhap", [str_row("mh01", "A-C-G", "A-T-G", "A-T-G", "G-T-G", "2.40"),
                  str_row("mh02", "C-A", "C-G", "T-A", "T-T", "1.90")], 0.5),
    ("str_mps", [str_row("D21S11", "seq_29", "seq_30", "seq_28", "seq_30", "1.91")], 0.5),
    ("str_ce", [str_row("D8", "12", "13", "13", "14", "1e-5")], 0.5),
    ("str_ce", [str_row(f"L{i}", "12", "13", "13", "14", "3") for i in range(10)], 0.5),
    ("str_ce", [str_row("L1", "12", "13", "13", "14", "1,234.5"), str_row("L2", "12", "13", "13", "14", "2 000")], 0.5),
    ("str_ce", [{"MARKER": "D8", "Child_A1": "12", "CHILD_A2": "13", "parent_a1": "13", "parent_a2": "14", "PI": "2"}], 0.5),
    ("str_ce", [{"marker": "D8", "hijo alelo 1": "12", "hijo/a alelo 2": "13", "progenitor alelo 1": "13",
                 "parent_h2": "14", "indice de paternidad": "2.5", "notas": "ok"}], 0.5),
    ("str_ce", [str_row("D8", "12", "13", "13", "14", "2", validation_warning="DP bajo; GQ bajo")], 0.5),
    ("str_ce", [str_row("D8", "12", "13", "13", "14", "2", advertencias="GT faltante en muestra x.")], 0.5),
    ("bogus", [str_row("D8", "12", "13", "13", "14")], 0.5),
    ("str_ce", [], 0.5),
    # Fronteras exactas de los umbrales de conclusión (posterior >= 0.95 / >= 0.999)
    ("str_ce", [str_row("L1", "12", "13", "13", "14", "19")], 0.5),       # posterior = 0.95 → moderado
    ("str_ce", [str_row("L1", "12", "13", "13", "14", "18.99")], 0.5),    # justo debajo → limitado
    ("str_ce", [str_row("L1", "12", "13", "13", "14", "19.5")], 0.5),     # entre 0.95 y 0.96 → moderado
    ("str_ce", [str_row("L1", "12", "13", "13", "14", "999")], 0.5),      # posterior = 0.999 → alto
    ("str_ce", [str_row("L1", "12", "13", "13", "14", "998.99")], 0.5),   # justo debajo → moderado
    ("str_ce", [str_row("L1", "12", "13", "13", "14", "44.33")], 0.3),    # previa 0.3, justo debajo de 0.95
    ("str_ce", [str_row("L1", "12", "13", "13", "14", "44.34")], 0.3),    # previa 0.3, justo encima de 0.95
    ("str_ce", [str_row("L1", "12", "13", "13", "14", "2"), str_row("L2", "12", "13", "14", "15")], 0.5),  # 1 incongruencia
]
row_cases = [
    {"assay": a, "rows": rows, "prior": p, "out": analysis_bundle(a, rows, p, html=(i < 3))}
    for i, (a, rows, p) in enumerate(ROW_CASES)
]

input_warnings = []
for assay, rows in [
    ("snp_panel", [{"marker": "rs1", "child_genotype": "A/G/T", "parent_genotype": "A/Z"},
                   {"marker": "D8S1179", "child_a1": "12", "child_a2": "", "parent_a1": "13", "parent_a2": "14"}]),
    ("str_ce", [str_row("D8", "X", "12", "", "")]),
    ("str_ce", [str_row("AMEL", "X", "Y", "X", "Y"), str_row("D8", "12", "13", "13", "14")]),
]:
    input_warnings.append({"assay": assay, "rows": rows, "out": ga.marker_input_warnings(rows, assay)})

validations = []
for assay, rows in [
    ("str_ce", [{"marker": "D8S1179", "child_a1": "12", "child_a2": "13", "parent_a1": "13"}]),
    ("snp_panel", [{"marcador": "rs1", "hijo_genotipo": "A/G", "progenitor_genotipo": "A/A"}]),
    ("snp_panel", []),
    ("bogus", [{"marker": "x"}]),
    ("microhap", [{"Microhaplotipo": "mh", "child_h1": "a", "child_h2": "b", "parent_h1": "a", "parent_h2": "c"}]),
    ("snp_panel", [{"locus": "x", "child": "A/G", "alleged_parent": "A/A"}]),
]:
    validations.append({"assay": assay, "rows": rows, "out": error_of(lambda a=assay, r=rows: ga.validate_csv_columns(r, a))})

# --------------------------------------------------------------------------
# 6. Archivos de ejemplo, simulación y auditoría
# --------------------------------------------------------------------------
fixtures = []
for sub in ["ejemplos", "simulacion/compatible", "simulacion/exclusion", "auditoria"]:
    folder = os.path.join(FIXTURES, sub)
    for name in sorted(os.listdir(folder)):
        path = os.path.join(folder, name)
        rel = f"{sub}/{name}"
        main_assay = assay_for(name)
        entry = {"file": rel}
        if name.lower().endswith(".vcf"):
            names = error_of(lambda p=path: ga.read_vcf_sample_names(p))
            entry["samples"] = names
            if "ok" in names:
                samples = names["ok"]
                child = next((s for s in samples if "hijo" in s.lower() or "hija" in s.lower()), samples[0])
                parent = next(s for s in samples if s != child)
                entry["child"], entry["parent"] = child, parent
                rows_out = error_of(lambda p=path, c=child, pa=parent: ga.read_vcf_snp_rows(p, c, pa))
                entry["rows"] = rows_out
                entry["selection_warnings"] = ga.vcf_sample_selection_warnings(samples, child, parent)
                if "ok" in rows_out:
                    rows = rows_out["ok"]
                    entry["input_warnings"] = ga.marker_input_warnings(rows, "snp_panel")
                    entry["analysis"] = {"snp_panel": analysis_bundle("snp_panel", rows, html=True)}
        else:
            rows_out = error_of(lambda p=path: ga.read_csv_rows(p))
            entry["rows"] = rows_out
            if "ok" in rows_out:
                rows = rows_out["ok"]
                entry["validation"] = {a: error_of(lambda a=a, r=rows: ga.validate_csv_columns(r, a)) for a in ASSAYS}
                entry["input_warnings"] = {a: ga.marker_input_warnings(rows, a) for a in ASSAYS}
                entry["analysis"] = {a: analysis_bundle(a, rows, html=(a == main_assay)) for a in ASSAYS}
        fixtures.append(entry)

reference = {
    "generated_with": f"Python {sys.version.split()[0]} · {ga.ALGORITHM_VERSION}",
    "formats": formats,
    "normalize": normalize,
    "csv_inline": csv_inline,
    "vcf_inline": vcf_inline,
    "selection_warnings": selection_warnings,
    "row_cases": enc(row_cases),
    "input_warnings": input_warnings,
    "validations": validations,
    "fixtures": fixtures,
}

out_path = os.path.join(FIXTURES, "reference.json")
with open(out_path, "w", encoding="utf-8") as handle:
    json.dump(reference, handle, ensure_ascii=False, indent=1, allow_nan=False)
print(f"Escrito {out_path} ({os.path.getsize(out_path):,} bytes) con {reference['generated_with']}")

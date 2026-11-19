/*! ariADNa — ejemplos sintéticos incrustados (no contienen datos reales).
 * Generado desde tests/fixtures/ (ejemplos/ y simulacion/). */
(function (root) {
  "use strict";
  root.AriadnaExamples = [
  {
    "id": "str_ce_compatible",
    "assay": "str_ce",
    "label": "STR capilar · compatible (8 marcadores)",
    "filename": "str_ce_compatible.csv",
    "text": "marker,child_a1,child_a2,parent_a1,parent_a2,pi,note\nD8S1179,12,13,13,14,2.15,\nD21S11,29,30,28,30,1.87,\nD7S820,10,11,8,11,2.42,\nCSF1PO,11,12,10,12,1.76,\nD3S1358,15,16,16,17,2.08,\nTH01,6,9.3,7,9.3,1.62,\nD13S317,11,12,12,13,2.35,\nFGA,22,24,21,24,3.18,\n"
  },
  {
    "id": "str_ce_no_compatible",
    "assay": "str_ce",
    "label": "STR capilar · dos incongruencias",
    "filename": "str_ce_no_compatible.csv",
    "text": "marker,child_a1,child_a2,parent_a1,parent_a2,pi,note\nD8S1179,12,13,13,14,2.15,\nD21S11,29,30,28,30,1.87,\nD7S820,10,11,8,9,0,No comparte alelos\nCSF1PO,11,12,10,12,1.76,\nD3S1358,15,16,17,18,0,No comparte alelos\nTH01,6,9.3,7,9.3,1.62,\nD13S317,11,12,12,13,2.35,\nFGA,22,24,21,24,3.18,\n"
  },
  {
    "id": "globalfiler_compatible",
    "assay": "str_ce",
    "label": "STR GlobalFiler · compatible (21 marcadores)",
    "filename": "1_str_ce_globalfiler_compatible.csv",
    "text": "marker,child_a1,child_a2,parent_a1,parent_a2,pi,note\r\nAMEL,X,Y,X,Y,,Marcador de sexo (amelogenina); no aporta al PI.\r\nD3S1358,15,17,16,17,3.3,\r\nvWA,16,18,17,18,2.5,\r\nD16S539,11,12,9,11,1.6,\r\nCSF1PO,10,12,11,12,3.8,\r\nTPOX,8,11,8,9,0.9,\r\nD8S1179,13,14,12,14,2.7,\r\nD21S11,29,30,28,30,2.6,\r\nD18S51,14,16,16,18,3.4,\r\nD2S441,10,11.3,11.3,14,4.2,\r\nD19S433,13,14,14,15.2,2.9,\r\nTH01,7,9.3,6,9.3,1.6,\r\nFGA,21,24,22,24,4.5,\r\nD22S1045,15,16,11,16,1.8,\r\nD5S818,11,13,12,13,3.1,\r\nD13S317,8,11,11,12,2.8,\r\nD7S820,10,12,8,10,3.0,\r\nD10S1248,13,15,14,15,2.4,\r\nD1S1656,15,16,16,17.3,3.6,\r\nD12S391,18,20,19,20,2.2,\r\nD2S1338,20,23,17,23,4.0,\r\n"
  },
  {
    "id": "globalfiler_exclusion",
    "assay": "str_ce",
    "label": "STR GlobalFiler · no compatible",
    "filename": "1_str_ce_globalfiler_exclusion.csv",
    "text": "marker,child_a1,child_a2,parent_a1,parent_a2,pi,note\r\nAMEL,X,Y,X,Y,,Marcador de sexo (amelogenina); no aporta al PI.\r\nD3S1358,15,17,15,18,,\r\nvWA,16,18,19,21,,\r\nD16S539,11,12,14,15,,\r\nCSF1PO,10,12,13,15,,\r\nTPOX,8,11,14,13,,\r\nD8S1179,13,14,13,16,,\r\nD21S11,29,30,32,33,,\r\nD18S51,14,16,17,19,,\r\nD2S441,10,11.3,13,14,,\r\nD19S433,13,14,16,17,,\r\nTH01,7,9.3,7,10,,\r\nFGA,21,24,27,26,,\r\nD22S1045,15,16,18,19,,\r\nD5S818,11,13,14,16,,\r\nD13S317,8,11,14,13,,\r\nD7S820,10,12,10,13,,\r\nD10S1248,13,15,16,18,,\r\nD1S1656,15,16,18,19,,\r\nD12S391,18,20,21,23,,\r\nD2S1338,20,23,26,25,,\r\n"
  },
  {
    "id": "str_mps_compatible",
    "assay": "str_mps",
    "label": "STR por MPS/NGS · compatible",
    "filename": "str_mps_compatible.csv",
    "text": "marker,child_a1,child_a2,parent_a1,parent_a2,pi,note\nD21S11,seq_29_TCTA6_TCTG5,seq_30_TCTA7_TCTG5,seq_28_TCTA5_TCTG5,seq_30_TCTA7_TCTG5,1.91,\nD3S1358,seq_15_A,seq_16_B,seq_14_C,seq_16_B,2.21,\nvWA,seq_17_A,seq_18_B,seq_18_B,seq_19_C,2.04,\nFGA,seq_22_A,seq_24_B,seq_21_C,seq_24_B,3.32,\n"
  },
  {
    "id": "snp_panel_compatible",
    "assay": "snp_panel",
    "label": "Panel SNP (CSV) · compatible",
    "filename": "snp_panel_compatible.csv",
    "text": "marker,child_genotype,parent_genotype,pi,note\nrs100001,A/G,A/A,1.12,\nrs100002,C/C,C/T,1.39,\nrs100003,G/T,T/T,1.28,\nrs100004,A/A,A/G,1.45,\nrs100005,C/G,G/G,1.31,\nrs100006,T/T,C/T,1.22,\n"
  },
  {
    "id": "snp_panel_no_compatible",
    "assay": "snp_panel",
    "label": "Panel SNP (VCF) · no compatible",
    "filename": "snp_panel_no_compatible.vcf",
    "text": "##fileformat=VCFv4.2\n##source=ariADNa_synthetic_example\n#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\tFORMAT\thijo\tprogenitor_alegado\n1\t100001\trs200001\tA\tG\t.\tPASS\t.\tGT\t0/1\t0/0\n1\t100002\trs200002\tC\tT\t.\tPASS\t.\tGT\t0/0\t0/1\n1\t100003\trs200003\tG\tA\t.\tPASS\t.\tGT\t0/1\t1/1\n1\t100004\trs200004\tT\tC\t.\tPASS\t.\tGT\t0/0\t1/1\n1\t100005\trs200005\tA\tC\t.\tPASS\t.\tGT\t0/0\t1/1\n"
  },
  {
    "id": "microhap_compatible",
    "assay": "microhap",
    "label": "Microhaplotipos · compatible",
    "filename": "microhap_compatible.csv",
    "text": "marker,child_a1,child_a2,parent_a1,parent_a2,pi,note\nmh01,A-C-G,A-T-G,A-T-G,G-T-G,2.40,\nmh02,C-A,C-G,T-A,C-G,1.90,\nmh03,G-A-T,G-G-T,A-A-T,G-G-T,2.15,\nmh04,T-C,T-A,T-A,C-A,1.70,\n"
  }
];
})(typeof self !== "undefined" ? self : this);

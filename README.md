# ariADNa

**Lectura de triaje preliminar de paternidad/maternidad genética, directamente en el navegador.**

👉 **Usar la app:** https://druxmeaney.github.io/ariADNa-web/

ariADNa compara al hijo/a contra una persona alegada como progenitor/a (padre o madre; análisis dúo), marcador por marcador, a partir de resultados que **un laboratorio ya procesó**. Detecta compatibilidad mendeliana e incongruencias y, sólo cuando el laboratorio aportó índices válidos por marcador (PI/MI/LR), calcula el CPI y la probabilidad posterior. Algoritmo `ariADNa-triaje-v0.1.4`.

> ariADNa es una herramienta de **apoyo y triaje**, no un dictamen. No sustituye a un laboratorio acreditado, al dictamen pericial, al consentimiento informado ni a la cadena de custodia. Lee el [aviso de uso](DISCLAIMER.md).

## Privacidad: nada sale de tu navegador

- **Sin servidor.** Es una página estática; todo el cálculo ocurre en tu equipo.
- **Bloqueo técnico de red.** La página declara una política de seguridad (`connect-src 'none'`) que impide al navegador enviar datos a cualquier dirección. Sin analíticas, cookies, fuentes ni scripts externos.
- **Sin almacenamiento del caso.** Los datos viven sólo en memoria hasta que pulsas *Limpiar caso* o cierras la pestaña. Lo único que se recuerda es tu preferencia de tema claro/oscuro.
- **Exportar es opcional.** El reporte HTML se descarga a tu equipo; puedes exportarlo anonimizado.

## Qué hace

- Ensayos: **STR por electroforesis capilar**, **STR por MPS/NGS**, **paneles/arrays SNP** (CSV o VCF) y **microhaplotipos**.
- Captura manual, **pegado desde hoja de cálculo**, importación **CSV/TSV/TXT/VCF** (botón o arrastrar y soltar) y ejemplos sintéticos para probar.
- Selección de muestras en VCF, con avisos por `FILTER`, genotipos faltantes, sitios multialélicos, `DP` y `GQ` bajos; las advertencias críticas bloquean CPI/probabilidad posterior.
- Excluye del conteo marcadores no informativos (AMEL, controles, X/Y).
- Veredicto de triaje, CPI, probabilidad posterior con su nivel de soporte (alto, moderado o limitado), gráficos y detalle por marcador con **los alelos compartidos resaltados**.
- Reporte HTML exportable, anonimizado o con identificadores.
- Modo «Datos crudos» que orienta sobre qué pedir al laboratorio cuando sólo hay FASTQ, BAM, electroferogramas, etc.

**Qué no hace:** no calcula PI/LR desde frecuencias poblacionales, no modela mutaciones, alelos nulos, coancestría ni ligamiento, no analiza tríos y no lee archivos crudos.

## Formatos de archivo

| Ensayo | Columnas (primera fila) |
|---|---|
| STR capilar, STR MPS/NGS, microhaplotipos | `marker, child_a1, child_a2, parent_a1, parent_a2, pi, note` |
| Paneles SNP | `marker, child_genotype, parent_genotype, pi, note` |
| VCF (SNP) | ≥ 2 muestras con campo `GT`; eliges hijo/a y progenitor/a al importar |

`pi` y `note` son opcionales. Se aceptan alias en español (`marcador`, `hijo_a1`, `progenitor_genotipo`, `indice_paternidad`, …). Límites: 10 MB y 5000 filas.

## Uso sin conexión

Descarga el repositorio y abre `index.html` en el navegador. No necesita instalación ni conexión.

## Desarrollo

```
index.html          estructura de la app y política de seguridad
css/styles.css      sistema visual "Modern Forensic" (tema claro y oscuro)
js/engine.js        motor de triaje
js/report.js        resumen de texto y reporte HTML
js/charts.js        gráficos SVG
js/app.js           interfaz
js/about.js         contenido de "Acerca de"
js/examples.js      ejemplos sintéticos incrustados
tests/              pruebas y referencia congelada
```

Sin dependencias ni paso de compilación. Para probar:

```bash
node --test
```

Las pruebas comparan el motor con una referencia congelada (`tests/fixtures/reference.json`) que fija conteos, CPI, probabilidad posterior, advertencias, notas, resumen de texto y el **reporte HTML byte a byte** sobre ejemplos, simulaciones, archivos adversariales y cientos de casos límite. Cualquier cambio que altere un resultado hace fallar la suite.

Al publicar cambios, sube `version` en `package.json` y el sufijo `?v=` de los recursos en `index.html` (una prueba verifica que coincidan); así ningún navegador mezcla el HTML nuevo con JavaScript en caché.

Para servirla en local:

```bash
python3 -m http.server 8765
```

## Licencia

MIT. La licencia permite usar, copiar, modificar y redistribuir el software, pero no convierte sus resultados en dictamen pericial ni elimina la obligación de cumplir consentimiento, privacidad, cadena de custodia y validación profesional.

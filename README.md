# ariADNa

**Lectura de triaje preliminar de paternidad/maternidad genética, directamente en el navegador.**

👉 **Usar la app:** https://druxmeaney.github.io/ariADNa-web/

ariADNa compara al hijo/a contra una persona alegada como progenitor/a (padre o madre; análisis dúo), marcador por marcador, a partir de resultados que **un laboratorio ya procesó**. Detecta compatibilidad mendeliana e incongruencias y, sólo cuando el laboratorio aportó índices válidos por marcador (PI/MI/LR), calcula el CPI y la probabilidad posterior. Algoritmo `ariADNa-triaje-v0.2.0`.

> ariADNa es una herramienta de **apoyo y triaje**, no un dictamen. No sustituye a un laboratorio acreditado, al dictamen pericial, al consentimiento informado ni a la cadena de custodia. Lee el [aviso de uso](DISCLAIMER.md).

## Privacidad: nada sale de tu navegador

- **Sin servidor.** Es una página estática; todo el cálculo ocurre en tu equipo.
- **Bloqueo técnico de red.** La página declara una política de seguridad (`connect-src 'none'`) que impide al navegador enviar datos a cualquier dirección. Sin analíticas, cookies, fuentes ni scripts externos.
- **Sin almacenamiento del caso.** Los datos viven sólo en memoria hasta que pulsas *Limpiar caso* o cierras la pestaña. Lo único que se recuerda en el navegador son preferencias de interfaz: tema, color, animaciones, avisos y si ya viste la guía de inicio.
- **Exportar es opcional.** El reporte HTML se descarga a tu equipo; puedes exportarlo anonimizado.

## Qué hace

- Ensayos: **STR por electroforesis capilar**, **STR por MPS/NGS**, **paneles/arrays SNP** (CSV o VCF) y **microhaplotipos**.
- Captura manual, **pegado desde hoja de cálculo**, importación **CSV/TSV/TXT/VCF** (botón o arrastrar y soltar) y ejemplos sintéticos para probar.
- Selección de muestras en VCF, con avisos por `FILTER`, genotipos faltantes, sitios multialélicos, `DP` y `GQ` bajos; las advertencias críticas bloquean CPI/probabilidad posterior.
- Excluye del conteo marcadores no informativos (AMEL, controles, X/Y).
- Veredicto de triaje, CPI y probabilidad posterior con su nivel de soporte (alto, moderado o limitado).
- **Figura de soporte** sobre el eje logarítmico del CPI: zonas de lectura, aporte de cada marcador, eje de probabilidad posterior y sensibilidad a la probabilidad previa.
- **Alelos comparados**: una fila por marcador con un esquema espejo (hijo/a arriba, progenitor/a abajo, alelo compartido resaltado), filtros, orden y carril navegable.
- **Observaciones de control**: perfiles idénticos, marcadores repetidos, índices atípicos o que contradicen la compatibilidad, pocos marcadores, anatomía de las incongruencias en STR.
- Aviso de **alcances y límites** antes de analizar y al final de cada reporte.
- Página de inicio, guía de primer uso, ayuda integrada y **configuración** (tema claro/oscuro/automático, color de la interfaz, animaciones).
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
css/styles.css      sistema visual "Modern Forensic" (temas, colores de marca)
js/theme-init.js    preferencias de interfaz (se aplica antes de pintar)
js/engine.js        motor de triaje y observaciones de control
js/report.js        resumen de texto y reporte HTML
js/charts.js        gráficos SVG del reporte
js/helix.js         animación de la doble hélice (inicio y portada)
js/app.js           interfaz
js/about.js         contenido de "Acerca de" (teoría, metodología, marco normativo)
js/help.js          ayuda y tutorial (Configuración › Ayuda)
js/examples.js      ejemplos sintéticos incrustados
tests/              pruebas del motor, prueba de la interfaz y referencia congelada
```

Sin dependencias ni paso de compilación.

### Pruebas

[![Pruebas](https://github.com/DruxMeaney/ariADNa-web/actions/workflows/tests.yml/badge.svg)](https://github.com/DruxMeaney/ariADNa-web/actions/workflows/tests.yml)

```bash
npm test          # motor: sólo necesita Node
npm run test:ui   # interfaz: Node 22 o posterior y Chrome, Chromium o Edge
```

- **Motor** (`tests/engine.test.js`). Compara el motor con una referencia congelada (`tests/fixtures/reference.json`) que fija conteos, CPI, probabilidad posterior, advertencias, notas, resumen de texto y el **reporte HTML byte a byte** sobre ejemplos, simulaciones, archivos adversariales y cientos de casos límite. Cualquier cambio que altere un resultado hace fallar la suite.
- **Interfaz** (`tests/ui/smoke.mjs`). Abre la app en un navegador real, sin ventana, y la recorre como una persona: portada, ejemplo, Analizar, aviso de límites, reporte y exportación. Comprueba que lo que se ve en pantalla coincide con el motor en todos los ejemplos incluidos; que no hay errores, peticiones fuera de la app ni violaciones de la política de seguridad; que el navegador no guarda datos del caso; que el reporte sin identificadores no los contiene; y que la app funciona abierta como archivo, en tema oscuro, en pantalla de teléfono y con «reducir movimiento». No usa dependencias (habla con el navegador por el protocolo DevTools). Si no encuentra un navegador, se omite; en integración continua, falla.

GitHub ejecuta ambas en cada cambio a `main` y en cada pull request (`.github/workflows/tests.yml`). Si la interfaz falla, la ejecución guarda una captura y un registro como artefacto.

No cubren Safari ni Firefox, lectores de pantalla, ni la validación del triaje con casos reales de laboratorio.

Al publicar cambios, sube `version` en `package.json` y el sufijo `?v=` de los recursos en `index.html` (una prueba verifica que coincidan); así ningún navegador mezcla el HTML nuevo con JavaScript en caché.

Para servirla en local:

```bash
python3 -m http.server 8765
```

## Licencia

MIT. La licencia permite usar, copiar, modificar y redistribuir el software, pero no convierte sus resultados en dictamen pericial ni elimina la obligación de cumplir consentimiento, privacidad, cadena de custodia y validación profesional.

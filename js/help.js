/*!
 * ariADNa — ayuda y tutorial (se muestra en Configuración › Ayuda)
 */
(function (root) {
  "use strict";

  function section(id, title, body, open) {
    return '<details id="' + id + '"' + (open ? " open" : "") + "><summary>" + title + '</summary><div class="prose">' + body + "</div></details>";
  }

  var html =
    '<p class="help-intro">Guía rápida de uso. La teoría, la metodología y el marco normativo están en la pestaña <a href="#acerca" data-close="cancel">Acerca de</a>.</p>' +
    '<div class="help-acc">' +

    section(
      "help-empezar",
      "Empezar en tres pasos",
      "<ol>" +
        "<li><strong>Carga los resultados.</strong> En Análisis elige el ensayo y pulsa «Probar con un ejemplo», importa un archivo o escribe los marcadores en la tabla.</li>" +
        "<li><strong>Analiza.</strong> Pulsa Analizar (o Ctrl/⌘ + Enter). La primera vez verás un aviso con los alcances y límites del análisis.</li>" +
        "<li><strong>Lee y exporta.</strong> En Resultados encontrarás el veredicto de triaje, el soporte estadístico y el detalle por marcador. Puedes copiar un resumen o exportar el reporte en HTML.</li>" +
        "</ol>" +
        '<div class="callout"><span class="tag">Qué compara</span>ariADNa compara al hijo o hija contra una sola persona alegada como progenitor/a (padre o madre). Un marcador es compatible si ambos comparten al menos un alelo, genotipo o haplotipo; si no comparten ninguno, es una incongruencia.</div>',
      true
    ) +

    section(
      "help-pantalla",
      "Mapa de la pantalla",
      "<ul>" +
        "<li><strong>Inicio.</strong> Presentación breve de la herramienta.</li>" +
        "<li><strong>Análisis.</strong> La tabla de marcadores es el centro. Arriba eliges el ensayo, importas un archivo o cargas un ejemplo. A la derecha están las opciones: la probabilidad previa y los identificadores del reporte (opcionales).</li>" +
        "<li><strong>Resultados.</strong> El reporte de triaje: veredicto, soporte estadístico y alelos comparados.</li>" +
        "<li><strong>Acerca de.</strong> Qué hace y qué no hace la app, teoría, metodología, normativa y referencias.</li>" +
        "<li><strong>Configuración</strong> (el engrane). Tema claro u oscuro, color de la interfaz, animaciones y esta ayuda.</li>" +
        "</ul>"
    ) +

    section(
      "help-capturar",
      "Capturar a mano o pegar desde una hoja de cálculo",
      "<p>En cada celda escribe un alelo. Si pones varios valores en una misma celda, sepáralos con diagonal, barra vertical o punto y coma (<code>12/14</code>). Los valores <code>NA</code>, <code>ND</code> o vacíos se ignoran. La columna «PI del laboratorio» es opcional: ariADNa no calcula ese índice, lo recibe.</p>" +
        "<p>Puedes copiar un bloque de celdas de Excel o de una hoja de cálculo y pegarlo en la tabla; si la primera fila son encabezados, se omite.</p>" +
        '<div class="callout"><span class="tag">STR · electroforesis capilar</span>D3S1358: hijo/a 15 y 16; progenitor/a 16 y 17. Comparten el 16: compatible. Si el laboratorio dio un PI (p. ej. 1.8), escríbelo en su columna. Los microvariantes llevan punto: <code>9.3</code>, no <code>9,3</code>.</div>' +
        '<div class="callout"><span class="tag">SNP · panel o array</span>Un genotipo por persona. rs1799971: hijo/a AG; progenitor/a GG. Comparten G: compatible.</div>' +
        '<div class="callout"><span class="tag">Microhaplotipos</span>Dos haplotipos por persona. mh01: hijo/a A-C-G y T-C-A; progenitor/a T-C-A y G-G-T. Comparten T-C-A: compatible.</div>'
    ) +

    section(
      "help-importar",
      "Importar CSV, TSV o VCF",
      "<p>La primera fila del archivo debe tener nombres de columna reconocibles:</p>" +
        '<div class="table-scroll"><table><thead><tr><th>Ensayo</th><th>Columnas</th></tr></thead><tbody>' +
        "<tr><td>STR y microhaplotipos</td><td><code>marker, child_a1, child_a2, parent_a1, parent_a2, pi, note</code></td></tr>" +
        "<tr><td>SNP</td><td><code>marker, child_genotype, parent_genotype, pi, note</code></td></tr>" +
        "</tbody></table></div>" +
        "<p><code>pi</code> y <code>note</code> son opcionales. Se aceptan alias en español como <code>marcador</code>, <code>hijo_a1</code>, <code>progenitor_genotipo</code> o <code>indice_paternidad</code>. En el menú «Ejemplos» puedes descargar una plantilla CSV del ensayo actual. Límites: 10 MB y 5000 filas.</p>" +
        "<p><strong>VCF</strong> (paneles SNP): al importarlo eliges qué muestra es el hijo/a y cuál el progenitor/a alegado/a. La app avisa por <code>FILTER</code>, genotipos faltantes, sitios multialélicos y <code>DP</code>/<code>GQ</code> bajos; las advertencias críticas bloquean el CPI.</p>" +
        "<p>También puedes arrastrar el archivo sobre la tabla.</p>"
    ) +

    section(
      "help-previa",
      "La probabilidad previa",
      "<p>Es la probabilidad que se asigna, <em>antes</em> de ver el ADN, a que la persona alegada sea el progenitor biológico. 0.50 significa «sin información previa». Sólo cambia el resultado cuando la tabla trae índices (PI) válidos.</p>" +
        "<pre>CPI = PI₁ × PI₂ × … × PIₙ\nW   = (CPI × previa) / (CPI × previa + (1 − previa))</pre>" +
        "<p>En el reporte, una franja muestra con qué previas cambiaría la lectura para el CPI capturado.</p>"
    ) +

    section(
      "help-leer",
      "Cómo leer el reporte",
      "<p><strong>Veredicto.</strong> Dos o más incongruencias: patrón no compatible. Una sola: requiere revisión (puede ser una mutación, un alelo nulo o un error de captura). Ninguna: patrón compatible; el soporte se describe sólo si hay índices válidos.</p>" +
        "<p><strong>Observaciones de control.</strong> Comprobaciones automáticas sobre los datos capturados (por ejemplo, perfiles idénticos, marcadores repetidos o un índice atípico). No cambian el cálculo: señalan lo que conviene revisar.</p>" +
        "<p><strong>Soporte estadístico.</strong> Una sola figura sobre el eje del CPI (escala logarítmica): la banda dice la lectura (limitado, moderado o alto), la franja muestra cuánto aporta cada marcador al CPI y los ejes dan el CPI y la probabilidad posterior equivalente. Las líneas discontinuas son los umbrales de 95 % y 99.9 %, calculados con la previa elegida.</p>" +
        "<p><strong>Alelos comparados.</strong> Una fila por marcador. El esquema muestra los alelos del hijo/a hacia arriba (▲) y los del progenitor/a hacia abajo (▼) sobre el mismo eje; el alelo compartido queda resaltado. Es un esquema: la altura no representa señal del equipo. En los STR, cada punto del eje es una repetición.</p>" +
        "<p><strong>PI.</strong> El índice del laboratorio, en una barra de escala logarítmica que empieza en PI = 1. «No usado» significa que ese índice no entró en el CPI (por ejemplo, porque el marcador es una incongruencia).</p>" +
        "<p>Con los filtros puedes ver sólo las incongruencias o los marcadores incompletos, y ordenar por peso.</p>"
    ) +

    section(
      "help-exportar",
      "Exportar y privacidad",
      "<p>«Exportar reporte» descarga un archivo HTML con el veredicto, las mismas figuras que ves en pantalla (soporte estadístico y esquema de alelos), la tabla por marcador y las advertencias. Se abre en cualquier navegador, sin conexión, y puedes imprimirlo o guardarlo como PDF. Por defecto se exporta sin identificadores. El reporte conserva los genotipos: guárdalo sólo en una ubicación autorizada.</p>" +
        "<p>Todo ocurre en tu navegador. No hay servidor ni envío de datos, y los datos del caso no se guardan: desaparecen al cerrar la pestaña o al pulsar «Limpiar caso». Lo único que se recuerda en este navegador son tus preferencias de interfaz (tema, color, animaciones y avisos).</p>"
    ) +

    section(
      "help-limites",
      "Alcances y límites",
      "<ul>" +
        "<li>Es un triaje preliminar: orienta y prioriza; no es un dictamen pericial ni tiene validez legal.</li>" +
        "<li>No calcula índices ni usa frecuencias poblacionales: el PI lo aporta el laboratorio.</li>" +
        "<li>Es un análisis de dúo: no modela mutaciones, alelos nulos, mezclas ni tríos, y un pariente cercano del verdadero progenitor puede dar un patrón compatible.</li>" +
        "<li>No verifica la identidad de las muestras, su calidad ni la cadena de custodia.</li>" +
        "<li>Toda conclusión con efectos legales, clínicos o familiares debe confirmarla un laboratorio acreditado con dictamen pericial.</li>" +
        "</ul>"
    ) +

    section(
      "help-atajos",
      "Atajos de teclado",
      "<ul>" +
        "<li><code>Ctrl/⌘ + Enter</code>: analizar.</li>" +
        "<li><code>Enter</code> / <code>Mayús + Enter</code> o <code>↓</code> / <code>↑</code>: bajar o subir de fila en la misma columna.</li>" +
        "<li><code>Ctrl/⌘ + Retroceso</code>: eliminar la fila actual.</li>" +
        "<li><code>Esc</code>: cerrar menús, diálogos o la guía de inicio.</li>" +
        "</ul>"
    ) +
    "</div>";

  root.AriadnaHelp = { html: html };
})(typeof self !== "undefined" ? self : this);

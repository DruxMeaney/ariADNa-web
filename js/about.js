/*!
 * ariADNa — contenido de "Acerca de" (adaptado de ariADNa/about.py para la versión web)
 */
(function (root) {
  "use strict";

  var toc = [
    ["que-es", "Qué es ariADNa"],
    ["tutorial", "Cómo usarla"],
    ["teoria-herencia", "Teoría 1 · herencia"],
    ["teoria-estadistica", "Teoría 2 · del índice a la probabilidad"],
    ["metodologia", "Hoja metodológica"],
    ["estandares", "Estándares y límites"],
    ["glosario", "Glosario"],
    ["faq", "Preguntas frecuentes"],
    ["uso-responsable", "Uso responsable"],
    ["referencias", "Referencias"],
  ];

  var html =
    '<div class="about">' +
    '<nav class="about-toc" aria-label="Contenido de Acerca de">' +
    toc.map(function (t) { return '<a href="#' + t[0] + '">' + t[1] + "</a>"; }).join("") +
    "</nav>" +
    '<div class="prose">' +

    /* ------------------------------------------------------------ qué es */
    '<section id="que-es">' +
    '<p class="eyebrow">Acerca de</p>' +
    "<h2>Qué es ariADNa</h2>" +
    "<p>ariADNa es una aplicación web para el análisis <strong>preliminar</strong> de paternidad o maternidad a partir de resultados moleculares que tu laboratorio ya procesó. Compara al hijo o la hija contra un progenitor/a alegado/a (padre o madre alegados; comparación tipo dúo), marcador por marcador, y te indica si los datos capturados son compatibles y qué soporte estadístico puede leerse cuando hay índices válidos del laboratorio.</p>" +
    "<p>Está pensada para personas del ámbito forense, legal o clínico que necesitan orientar y priorizar casos con criterio, sin ser genetistas. Por eso el lenguaje es cercano y las conclusiones, prudentes: ariADNa es una herramienta de apoyo y triaje, no un dictamen. También existe como <a href=\"https://github.com/DruxMeaney/ariADNa-qgis-plugin\" rel=\"noopener noreferrer\">complemento de QGIS</a>, con el mismo algoritmo.</p>" +
    '<div class="callout"><span class="tag">Antes de empezar</span>ariADNa compara al hijo/a contra una sola persona alegada como progenitor/a. Esa persona puede ser padre o madre. Esta versión no incorpora un tercer perfil adicional para análisis de trío, no usa frecuencias poblacionales y no modela mutaciones ni alelos nulos. Trabaja sobre datos ya leídos por el laboratorio y no sustituye a un laboratorio acreditado, ni al dictamen pericial, ni al consentimiento informado, ni a la cadena de custodia.</div>' +
    '<div class="callout key"><span class="tag">Privacidad</span>Los datos genéticos son sensibles. ariADNa funciona por completo en tu navegador: <strong>no hay servidor y ningún dato se envía por la red</strong> (la página lo prohíbe técnicamente con su política de seguridad). No guarda datos automáticamente: sólo crea un archivo cuando pulsas Exportar HTML. El botón Limpiar caso borra los datos cargados en memoria; no borra reportes que ya exportaste. Usa identificadores anónimos para el caso y las muestras.</div>' +
    '<div class="callout warn"><span class="tag">Aviso de uso público</span>Usa ariADNa sólo si tienes autorización o base legal para tratar los datos. Sus resultados orientan y priorizan; no prueban ni descartan legalmente una relación biológica y no deben usarse como única base para decisiones legales, clínicas, migratorias, familiares o institucionales.</div>' +
    "</section>" +

    /* ---------------------------------------------------------- tutorial */
    '<section id="tutorial">' +
    "<h2>Cómo usar ariADNa paso a paso</h2>" +
    "<p>La app compara al hijo o hija contra el progenitor/a alegado/a (padre o madre; comparación tipo dúo): un marcador es compatible si ambos comparten al menos un alelo, genotipo o haplotipo observado; si no comparten ninguno, se marca como incongruencia.</p>" +
    "<h3>a) Mapa rápido de la pantalla</h3>" +
    "<ul>" +
    "<li><strong>Pestañas.</strong> Análisis (donde trabajas), Resultados (donde lees la lectura de triaje) y Acerca de (qué hace y qué no hace la app).</li>" +
    "<li><strong>1 · Datos del caso.</strong> Campos para identificar el caso, hijo/a y progenitor/a alegado/a. Son etiquetas para el reporte; no afectan el cálculo.</li>" +
    "<li><strong>2 · Parámetros.</strong> La probabilidad previa (opcional), explicada más abajo.</li>" +
    "<li><strong>3 · Datos del laboratorio.</strong> Elige «Resultados procesados» o «Datos crudos», el tipo de ensayo, y captura o importa los marcadores en la tabla.</li>" +
    "<li><strong>Barra inferior.</strong> Analizar ejecuta la comparación; Exportar HTML genera el reporte; Limpiar caso borra los datos en memoria.</li>" +
    "</ul>" +
    "<h3>b) Los 3 pasos</h3>" +
    "<ol>" +
    "<li><strong>Elige el ensayo.</strong> Escoge el tipo de análisis que hizo tu laboratorio. Esto define qué columnas tendrá la tabla.</li>" +
    "<li><strong>Captura o importa.</strong> Escribe los datos marcador por marcador, pega celdas desde una hoja de cálculo, o importa un archivo CSV/TSV (o un VCF en la sección SNP, eligiendo qué muestra es hijo/a y cuál es progenitor/a alegado/a).</li>" +
    "<li><strong>Analiza.</strong> Pulsa Analizar. La app compara cada marcador y muestra la lectura de triaje en la pestaña Resultados.</li>" +
    "</ol>" +
    "<h3>c) Cómo capturar a mano, por tipo de ensayo</h3>" +
    "<p>En cada celda puedes escribir uno o varios valores separados por coma, diagonal, barra vertical o punto y coma. Para SNP también se aceptan genotipos compactos como <code>AG</code> o códigos IUPAC simples como <code>R</code>. Los valores <code>NA</code>, <code>ND</code> o vacíos se ignoran. La columna «Índice laboratorio» acepta el índice por marcador que aporta tu laboratorio (PI, MI o LR equivalente); es opcional y ariADNa no lo calcula.</p>" +
    '<div class="callout"><span class="tag">STR por PCR y electroforesis capilar</span>Marcador D3S1358: alelos del hijo/a = 15 y 16; alelos del progenitor = 16 y 17. Comparten el 16, así que el marcador es compatible. Si tu laboratorio dio un PI para ese marcador (p. ej. 1.8), escríbelo en la columna del índice.</div>' +
    '<div class="callout"><span class="tag">STR por MPS/NGS</span>Se captura igual que los STR capilares; cambia la tecnología, no la forma de escribirlos. Marcador vWA: hijo/a = 17 y 18; progenitor = 19 y 20. No comparten ningún alelo: es una incongruencia (posible exclusión, sujeta a revisión).</div>' +
    '<div class="callout"><span class="tag">SNP panels / SNP arrays</span>Cada marcador tiene un genotipo por persona. Marcador rs1799971: genotipo del hijo/a = AG; genotipo del progenitor = GG. Comparten el alelo G: compatible.</div>' +
    '<div class="callout"><span class="tag">Microhaplotipos por NGS/MPS</span>Cada persona presenta dos haplotipos por marcador. Marcador mh01: hijo/a = ACG y TCA; progenitor = TCA y GGT. Comparten el haplotipo TCA: compatible.</div>' +
    "<h3>d) Cómo importar CSV/TSV (y VCF)</h3>" +
    "<p>La primera fila del archivo debe contener nombres de columnas reconocibles. Según el ensayo, usa estas columnas:</p>" +
    '<div class="table-scroll"><table><thead><tr><th>Ensayo</th><th>Columnas del archivo</th></tr></thead><tbody>' +
    '<tr><td>STR capilar</td><td><code>marker, child_a1, child_a2, parent_a1, parent_a2, pi, note</code></td></tr>' +
    '<tr><td>STR por MPS/NGS</td><td><code>marker, child_a1, child_a2, parent_a1, parent_a2, pi, note</code></td></tr>' +
    '<tr><td>SNP panels / arrays</td><td><code>marker, child_genotype, parent_genotype, pi, note</code></td></tr>' +
    '<tr><td>Microhaplotipos</td><td><code>marker, child_a1, child_a2, parent_a1, parent_a2, pi, note</code></td></tr>' +
    "</tbody></table></div>" +
    "<p>Las columnas <code>pi</code> y <code>note</code> son opcionales. También se aceptan alias en español como <code>marcador</code>, <code>hijo_a1</code>, <code>progenitor_genotipo</code> o <code>indice_paternidad</code>. Límites de importación: 10 MB y 5000 filas por archivo; los encabezados duplicados se rechazan para no reinterpretar columnas.</p>" +
    '<div class="callout"><span class="tag">Nota sobre el VCF</span>Puedes importar un VCF con dos o más muestras; ariADNa te pide elegir cuál es hijo/a y cuál es progenitor/a alegado/a. Si trae más de dos muestras o los nombres parecen invertidos, la app avisa. También deja advertencias por <code>FILTER</code>, genotipos <code>./.</code>, sitios multialélicos, <code>DP</code> bajo y <code>GQ</code> bajo cuando esos campos existen; las críticas bloquean CPI/probabilidad posterior. Estas alertas no sustituyen el control de calidad del laboratorio.</div>' +
    "<h3>e) La probabilidad previa (opcional)</h3>" +
    "<p>Es la probabilidad que asignas <em>antes</em> de ver los resultados de laboratorio de que el progenitor/a alegado/a sea realmente el biológico. Si la dejas vacía, ariADNa usa 0.50, un valor neutral. Sólo influye cuando tu laboratorio aportó índices válidos. Si no hay incongruencias, índices inválidos/ambiguos ni advertencias críticas, la app combina los índices en un CPI y lo mezcla con la previa para obtener la probabilidad posterior (W):</p>" +
    "<pre>CPI = PI₁ × PI₂ × … × PIₙ\nW   = (CPI × previa) / (CPI × previa + (1 − previa))</pre>" +
    "<h3>f) Cómo leer el resultado y exportar</h3>" +
    "<ol>" +
    "<li><strong>2 o más incongruencias</strong> → no compatible en esta revisión preliminar. No se calcula CPI/probabilidad posterior hasta confirmar esos datos con laboratorio o peritaje.</li>" +
    "<li><strong>Exactamente 1 incongruencia</strong> → requiere revisión. Puede deberse a una mutación, un alelo nulo o un error de captura o de calidad.</li>" +
    "<li><strong>Sin incongruencias</strong> → patrón compatible. El soporte se describe según la probabilidad posterior sólo si hay PI válidos; sin PI, sólo compatibilidad mendeliana.</li>" +
    "</ol>" +
    "<p>Con un resultado, el botón Exportar HTML genera un reporte con los datos del caso, la tabla marcador por marcador, las incongruencias y la lectura de triaje. Puedes exportarlo anonimizado (recomendado). Ábrelo en cualquier navegador y consérvalo sólo en ubicaciones autorizadas.</p>" +
    "</section>" +

    /* --------------------------------------------------- teoría: herencia */
    '<section id="teoria-herencia">' +
    "<h2>Teoría (1): marcadores y herencia</h2>" +
    "<p>Heredaste tu ADN de dos personas, la mitad de cada progenitor. Esa regla es la base de todo el análisis de paternidad o maternidad.</p>" +
    '<div class="callout key"><span class="tag">La regla de oro</span>En condiciones ideales, uno de los dos alelos del hijo o la hija proviene del padre biológico y el otro de la madre biológica, de modo que un progenitor verdadero comparte al menos un alelo con su descendencia en cada marcador. En la práctica, una mutación, un alelo nulo o un error técnico pueden producir excepciones aisladas; por eso una sola incongruencia no basta para descartar la relación.</div>' +
    "<h3>Vocabulario mínimo</h3>" +
    "<dl>" +
    "<dt>Locus / marcador</dt><dd>Una posición concreta del genoma que se analiza. ariADNa compara marcador por marcador.</dd>" +
    "<dt>Alelo</dt><dd>Cada una de las variantes que puede tener un marcador. En cada marcador, una persona porta hasta dos alelos.</dd>" +
    "<dt>Genotipo</dt><dd>El par de alelos que una persona tiene en un marcador (por ejemplo, 12 y 15).</dd>" +
    "<dt>Homocigoto / heterocigoto</dt><dd>Los dos alelos son iguales (12 y 12) o distintos (12 y 15). Un homocigoto puede anotarse con uno o dos valores: ariADNa compara el conjunto de alelos observados.</dd>" +
    "<dt>Haplotipo</dt><dd>Una combinación de variantes que se hereda junta, como un bloque. Es el concepto clave de los microhaplotipos.</dd>" +
    "</dl>" +
    "<h3>Qué mide cada uno de los cuatro ensayos</h3>" +
    '<div class="table-scroll"><table><thead><tr><th>Ensayo</th><th>Qué mide</th><th>Cómo se representa</th><th>Unidad</th></tr></thead><tbody>' +
    "<tr><td>STR CE<br><span class=\"muted\">PCR + electroforesis capilar</span></td><td>Número de repeticiones de un motivo corto, medido por tamaño del fragmento.</td><td>Dos alelos como número de repeticiones (12, 15)</td><td>Alelo</td></tr>" +
    "<tr><td>STR MPS/NGS</td><td>Los mismos STR leyendo la secuencia; puede revelar isoalelos que la capilar no distingue.</td><td>Dos alelos como repeticiones o secuencia</td><td>Alelo</td></tr>" +
    "<tr><td>SNP<br><span class=\"muted\">paneles o arrays</span></td><td>Cambio de una sola letra (base) del ADN.</td><td>Genotipo con las dos bases (A/G, C/C)</td><td>Genotipo</td></tr>" +
    "<tr><td>Microhaplotipos</td><td>Un tramo corto con varias variantes vecinas leídas juntas como bloque.</td><td>Hasta dos haplotipos</td><td>Haplotipo</td></tr>" +
    "</tbody></table></div>" +
    "<h3>Por qué una incongruencia no siempre es una exclusión</h3>" +
    "<ul>" +
    "<li><strong>Mutación:</strong> al transmitirse, un alelo puede cambiar (más frecuente en los STR) y generar un valor que no coincide aunque la relación sea real.</li>" +
    "<li><strong>Alelo nulo:</strong> una variante que existe pero que la técnica no logra detectar, de modo que un heterocigoto se lee como homocigoto.</li>" +
    "<li><strong>Error de captura o calidad:</strong> equivocaciones al transcribir el dato, muestras de baja calidad o problemas del ensayo.</li>" +
    "</ul>" +
    "<p>Por eso ariADNa distingue el número de incongruencias: una sola marca el caso como <em>requiere revisión</em>; dos o más conducen a <em>no compatible</em>. Sin ninguna, el caso es compatible con la relación.</p>" +
    "</section>" +

    /* ------------------------------------------------- teoría: estadística */
    '<section id="teoria-estadistica">' +
    "<h2>Teoría (2): del índice de laboratorio a la probabilidad</h2>" +
    '<div class="callout key"><span class="tag">Lo esencial</span>ariADNa <strong>no calcula</strong> el índice de laboratorio: ese valor depende de las frecuencias alélicas de una población de referencia que la app no incorpora. Si introduces índices válidos y no hay incongruencias, ariADNa los multiplica y los convierte en probabilidad. Si no los introduces, son inválidos o hay incongruencias, el resultado se limita a compatibilidad o revisión preliminar.</div>' +
    "<h3>El índice por marcador</h3>" +
    "<p>El índice de un marcador —PI para paternidad, MI para maternidad o un LR equivalente— es una razón de verosimilitudes:</p>" +
    "<pre>        P(genotipo del hijo/a | el alegado ES el progenitor biológico)\nPI  =  ───────────────────────────────────────────────────────────────\n        P(genotipo del hijo/a | el alelo transmitido proviene de un\n                individuo al azar de la población de referencia)</pre>" +
    "<p>Un alelo raro compartido produce un PI alto (es improbable por azar) y un alelo común produce un PI modesto. Índice &gt; 1 favorece la relación; = 1 es neutro; = 0 suele corresponder a una exclusión. Si un marcador parece compatible pero el índice capturado es 0, la app bloquea CPI/probabilidad posterior y pide revisar transcripción o dictamen.</p>" +
    "<h3>El CPI: por qué los índices se multiplican</h3>" +
    "<p>Los marcadores se eligen en loci independientes. Cuando dos evidencias son estadísticamente independientes, sus verosimilitudes se combinan por producto, igual que la probabilidad de sacar dos caras seguidas. Por eso unos pocos marcadores con índices moderados se acumulan hasta un CPI muy grande.</p>" +
    "<h3>Del CPI a la probabilidad: el teorema de Bayes</h3>" +
    "<p>El CPI es un peso de evidencia, no una probabilidad: un CPI de 10.000 no significa «99.99 %». Para convertirlo en la probabilidad posterior W se aplica Bayes con una probabilidad previa. Con la previa neutra de 0.50 la fórmula se simplifica a <code>W = CPI / (CPI + 1)</code>. En términos de momios: <code>momios posteriores = CPI × momios previos</code>.</p>" +
    "<h3>Cómo interpretar las magnitudes (previa 0.50)</h3>" +
    '<div class="table-scroll"><table><thead><tr><th>CPI</th><th>Probabilidad posterior W</th><th>Lectura</th></tr></thead><tbody>' +
    '<tr><td class="mono">99</td><td class="mono">99.00 %</td><td>Umbral histórico externo (AABB), no un corte de la app</td></tr>' +
    '<tr><td class="mono">999</td><td class="mono">99.90 %</td><td>Soporte alto (≥ 0.999, umbral de ariADNa)</td></tr>' +
    '<tr><td class="mono">3,264,000</td><td class="mono">99.99997 %</td><td>Soporte muy alto</td></tr>' +
    "</tbody></table></div>" +
    "<p>Umbrales con que ariADNa describe el soporte: W ≥ 0.999 → soporte estadístico alto; W ≥ 0.95 → moderado (conviene revisión pericial); por debajo de 0.95 → compatible, pero con soporte limitado. Sin PI/CPI, sólo compatibilidad mendeliana. A mayor CPI, W se acerca a 100 % pero nunca lo alcanza.</p>" +
    "<h3>Mini-ejemplo numérico</h3>" +
    "<pre>D3S1358   PI = 1200   (alelo raro compartido)\nvWA       PI = 8.5\nFGA       PI = 320\n\nCPI = 1200 × 8.5 × 320 = 3,264,000\nW   = 3,264,000 / 3,264,001 ≈ 99.99997 %</pre>" +
    "<p>El laboratorio calcula cada PI a partir de frecuencias poblacionales validadas; ariADNa multiplica esos PI para obtener el CPI y aplica Bayes para obtener W.</p>" +
    "</section>" +

    /* ------------------------------------------------------- metodología */
    '<section id="metodologia">' +
    "<h2>Hoja metodológica</h2>" +
    '<p>Versión del algoritmo: <span class="mono" id="about-algo"></span>. Esta versión hace triaje de resultados ya procesados: valida columnas, rechaza encabezados duplicados, avisa genotipos raros/incompletos, añade advertencias básicas de VCF, excluye del conteo principal marcadores no informativos como AMEL/controles/X-Y, marca compatibilidad/incongruencia/incompleto por marcador útil, multiplica sólo índices válidos en marcadores compatibles y calcula W con Bayes cuando no hay incongruencias pendientes, índices ambiguos ni advertencias críticas de importación.</p>' +
    "<ul>" +
    "<li><strong>Qué sí calcula:</strong> compatibilidad mendeliana de dúo, conteo de incongruencias en marcadores útiles, CPI a partir de PI externos válidos y probabilidad posterior W con la previa elegida.</li>" +
    "<li><strong>Qué conserva pero no cuenta:</strong> marcadores de sexo como AMEL, controles técnicos y marcadores X/Y. Se muestran para trazabilidad, pero no inflan compatibles, incongruencias, CPI ni W.</li>" +
    "<li><strong>Qué avisa al importar:</strong> columnas obligatorias faltantes, encabezados duplicados, genotipos raros o incompletos, VCF con más de dos muestras, posible inversión por nombre de muestra, FILTER no PASS, genotipos ./., sitios multialélicos y valores bajos de DP/GQ cuando existen.</li>" +
    "<li><strong>Qué no calcula:</strong> PI/LR desde genotipos, frecuencias poblacionales mexicanas/latinoamericanas, mutaciones, alelos nulos, coancestría, ligamiento, mezclas, contaminación, degradación, identidad de muestras ni cadena de custodia.</li>" +
    "<li><strong>Regla clave:</strong> si hay incongruencias no resueltas, PI inválidos/ambiguos, PI=0 en marcador compatible o advertencias críticas de importación, ariADNa bloquea CPI/W y pide revisión.</li>" +
    "</ul>" +
    "<p>La versión web reproduce exactamente el motor del complemento QGIS: sus pruebas automáticas comparan cada conteo, CPI, advertencia y reporte contra el motor original en Python.</p>" +
    "</section>" +

    /* -------------------------------------------------------- estándares */
    '<section id="estandares">' +
    "<h2>Estándares y por qué es preliminar</h2>" +
    "<p>La bioestadística del parentesco tiene marcos de referencia reconocidos. La ISFG publica recomendaciones sobre la evaluación bioestadística (índices por marcador, razón de verosimilitud, mutaciones, alelos nulos y tríos). Las buenas prácticas tipo AABB describen el uso de índices por marcador, su combinación en un CPI, la probabilidad posterior y umbrales habituales de conclusión.</p>" +
    "<p>ariADNa se inspira en ese vocabulario, pero opera como apoyo y triaje preliminar. No verifica la identidad de las muestras, su origen ni su integridad legal.</p>" +
    '<div class="callout warn"><span class="tag">Comparación externa pendiente</span>La app tiene validación interna con casos sintéticos, pero todavía no se ha comparado caso por caso contra Familias, DNA-VIEW, GenoProof u otro software forense reconocido. Hasta documentar esa concordancia, debe presentarse sólo como triaje preliminar.</div>' +
    "<h3>Qué NO hace ariADNa</h3>" +
    "<ul>" +
    "<li>No interpreta cromatogramas ni electroferogramas.</li>" +
    "<li>No procesa archivos crudos de secuenciación (FASTQ / BAM); sólo tablas CSV/TSV y VCF simple.</li>" +
    "<li>No detecta ni resuelve mezclas de perfiles, contaminación ni degradación.</li>" +
    "<li>No usa frecuencias poblacionales ni calcula el PI: el PI, si existe, lo aporta el laboratorio.</li>" +
    "<li>No modela mutaciones ni alelos nulos; sólo los señala como posibles causas.</li>" +
    "<li>No analiza tríos ni parentescos complejos.</li>" +
    "</ul>" +
    "</section>" +

    /* ---------------------------------------------------------- glosario */
    '<section id="glosario">' +
    "<h2>Glosario</h2>" +
    "<dl>" +
    "<dt>STR</dt><dd>Repetición corta en tándem; marcador muy usado en identificación.</dd>" +
    "<dt>SNP</dt><dd>Polimorfismo de un solo nucleótido; variación en una sola letra del ADN.</dd>" +
    "<dt>Microhaplotipo</dt><dd>Conjunto de variantes muy próximas que se heredan juntas y se leen como una unidad.</dd>" +
    "<dt>PI / MI / LR</dt><dd>Valor por marcador que aporta el laboratorio; indica cuánto más probable es la evidencia si el progenitor/a alegado/a es el real. ariADNa no lo calcula, lo recibe.</dd>" +
    "<dt>CPI</dt><dd>Índice combinado: producto de los índices de todos los marcadores.</dd>" +
    "<dt>Probabilidad previa</dt><dd>Creencia inicial antes de ver el ADN; por defecto 0.50.</dd>" +
    "<dt>Probabilidad posterior (W)</dt><dd>Probabilidad de paternidad/maternidad tras combinar el CPI con la previa.</dd>" +
    "<dt>Incongruencia</dt><dd>Marcador en el que hijo/a y progenitor no comparten ningún alelo; requiere revisión antes de una conclusión formal.</dd>" +
    "<dt>Alelo nulo</dt><dd>Alelo real que no se detecta por un fallo técnico y puede simular una falsa incongruencia.</dd>" +
    "<dt>Mutación</dt><dd>Cambio hereditario que puede producir una incongruencia aislada sin excluir la relación.</dd>" +
    "</dl>" +
    "</section>" +

    /* --------------------------------------------------------------- faq */
    '<section id="faq">' +
    "<h2>Preguntas frecuentes</h2>" +
    "<h3>¿Puedo usar ariADNa sin PI?</h3><p>Sí. Sin PI, la herramienta evalúa sólo la compatibilidad mendeliana y no ofrece conclusión estadística: no habrá CPI ni W.</p>" +
    "<h3>¿Por qué dice «requiere revisión» con una sola incongruencia?</h3><p>Porque una única incongruencia no basta para excluir: puede deberse a una mutación, a un alelo nulo o a un error de captura o calidad.</p>" +
    "<h3>¿Qué previa uso?</h3><p>Si no tienes una razón específica, deja 0.50, que es neutral. La previa influye directamente en W.</p>" +
    "<h3>¿Sirve como prueba legal?</h3><p>No. Es apoyo preliminar y triaje. No sustituye a un laboratorio acreditado, al dictamen pericial, al consentimiento informado ni a la cadena de custodia.</p>" +
    "<h3>¿Sirve para paternidad y maternidad?</h3><p>Sí. El progenitor/a alegado/a puede ser padre o madre. Lo que esta versión no admite es un trío formal (hijo/a + progenitor conocido + alegado).</p>" +
    "<h3>¿Mis datos se suben a internet?</h3><p>No. Todo el cálculo ocurre en tu navegador y la página bloquea técnicamente cualquier conexión de red. Si exportas un reporte, el archivo se guarda en tu equipo.</p>" +
    "<h3>¿Cómo escribo alelos con varios valores?</h3><p>La herramienta separa valores por coma, diagonal, barra vertical o punto y coma, e ignora NA, ND y celdas vacías. Así, «12/14», «12,14» o «12;14» se leen igual.</p>" +
    "</section>" +

    /* --------------------------------------------------- uso responsable */
    '<section id="uso-responsable">' +
    "<h2>Uso responsable</h2>" +
    "<ul>" +
    "<li>Con marcadores compatibles y sin incongruencias, un posterior ≥ 0.999 se describe como soporte alto y ≥ 0.95 como moderado. Sin PI, la app se limita a confirmar la compatibilidad mendeliana.</li>" +
    "<li>Toda decisión con efectos legales o clínicos debe confirmarse en un laboratorio acreditado, con dictamen pericial, consentimiento informado y cadena de custodia.</li>" +
    "<li>Maneja los datos genéticos con la confidencialidad que exige tu jurisdicción. En México, la LFPDPPP exige consentimiento expreso y por escrito para datos personales sensibles cuando aplique.</li>" +
    "<li>Si trabajas con familias, niñas, niños, adolescentes, personas desaparecidas o instituciones públicas, confirma consentimiento/autorización y reglas de protección de datos antes de capturar información.</li>" +
    "<li>No digas que la herramienta está validada externamente hasta comparar sus salidas contra software forense reconocido y documentar la concordancia.</li>" +
    "</ul>" +
    "</section>" +

    /* -------------------------------------------------------- referencias */
    '<section id="referencias">' +
    "<h2>Referencias</h2>" +
    '<ol class="refs">' +
    "<li>Gjertson DW, Brenner CH, Baur MP, et al. ISFG: Recommendations on biostatistics in paternity testing. Forensic Sci Int Genet. 2007;1(3-4):223-231. doi:10.1016/j.fsigen.2007.06.006.</li>" +
    "<li>National Institute of Justice. Population Genetics and Statistics for Forensic Analysts: Probability of Paternity [recurso archivado]. Washington (DC): NIJ.</li>" +
    "<li>Forensic Science Regulator. Autosomal DNA relationship testing (FSR-GUI-0014). London: GOV.UK; 2026.</li>" +
    "<li>AABB. Standards for Relationship Testing Laboratories. 17th ed. Bethesda (MD): AABB; 2026.</li>" +
    "<li>AABB. 2024 Relationship Testing Technical Report. Bethesda (MD): AABB; 2025.</li>" +
    "<li>Familias · DNA-VIEW (Forensic Mathematics) · GenoProof (qualitype GmbH): software forense de referencia para la comparación externa pendiente.</li>" +
    "<li>Danecek P, et al. The Variant Call Format and VCFtools. Bioinformatics. 2011;27(15):2156-2158.</li>" +
    "<li>Cámara de Diputados del H. Congreso de la Unión. Ley Federal de Protección de Datos Personales en Posesión de los Particulares. México; última reforma DOF 2025.</li>" +
    "</ol>" +
    "</section>" +

    "</div></div>";

  root.AriadnaAbout = { html: html };
})(typeof self !== "undefined" ? self : this);

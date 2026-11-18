# Aviso de uso y descargo de responsabilidad

ariADNa se distribuye como herramienta de apoyo técnico y triaje preliminar. No es un dispositivo médico, no es un sistema pericial validado y no sustituye a un laboratorio acreditado, a una persona perita, al consentimiento informado ni a la cadena de custodia.

## Alcance

ariADNa puede ayudar a revisar resultados moleculares ya procesados por laboratorio. La herramienta compara perfiles tipo dúo, identifica compatibilidades/incongruencias visibles y, sólo cuando el laboratorio ya proporcionó PI válidos por marcador, calcula CPI y probabilidad posterior.

ariADNa no calcula PI/LR reales desde genotipos ni frecuencias poblacionales. Tampoco incorpora frecuencias mexicanas/latinoamericanas, modelos de mutación, coancestría, alelos nulos, ligamiento, mezcla, contaminación, degradación ni parentescos complejos.

## No es dictamen

Los resultados de ariADNa:

- no prueban ni descartan legalmente una relación biológica;
- no identifican personas desaparecidas por sí mismos;
- no reemplazan pruebas de laboratorio acreditado;
- no deben usarse como única base para decisiones legales, clínicas, migratorias, familiares o institucionales;
- no acreditan identidad de muestras, consentimiento, cadena de custodia ni trazabilidad.

Toda decisión con efectos legales, clínicos o de búsqueda debe confirmarse por vías oficiales, laboratorio acreditado y revisión pericial competente.

## Datos genéticos sensibles

Los datos genéticos son datos personales sensibles. Antes de capturar, importar, compartir o exportar información genética, la persona u organización usuaria debe contar con una base legal válida, consentimiento informado cuando aplique, medidas de seguridad y aviso de privacidad acorde con su jurisdicción.

En México, el tratamiento de datos personales sensibles exige especial cuidado. La Ley Federal de Protección de Datos Personales en Posesión de los Particulares exige consentimiento expreso y por escrito para datos sensibles y limita la creación de bases de datos sensibles a finalidades legítimas, concretas y justificadas.

## Privacidad operativa

La versión web de ariADNa funciona por completo en el navegador: no hay servidor, y la página bloquea técnicamente cualquier conexión de red (`connect-src 'none'`). No guarda datos del caso: sólo crea un archivo cuando la persona usuaria pulsa `Exportar HTML`, y ese archivo se descarga a su propio equipo.

Al exportar, la app puede omitir identificadores del caso y las muestras. Ese modo reduce exposición directa, pero el reporte sigue conteniendo genotipos y por tanto debe tratarse como información sensible.

Buenas prácticas mínimas:

- usar identificadores anónimos;
- evitar nombres reales, CURP, direcciones, teléfonos o datos de contacto;
- preferir el reporte anonimizado salvo que el expediente requiera identificadores;
- guardar reportes HTML sólo en ubicaciones autorizadas;
- borrar reportes que ya no deban conservarse;
- pulsar `Limpiar caso` antes de trabajar con otro expediente;
- no cargar datos reales en equipos compartidos o no cifrados;
- no compartir archivos genéticos por canales inseguros.

## Responsabilidad de uso

Quien usa ariADNa es responsable de verificar que tiene autorización para tratar los datos, que entiende los límites del análisis y que cualquier resultado se interpreta con apoyo profesional.

El proyecto ariADNa y sus personas colaboradoras no garantizan aptitud para fines legales, clínicos, forenses, administrativos o de identificación humana. El software se ofrece sin garantía y puede contener errores.

## Estado público correcto

La forma correcta de describir esta versión es:

```text
Herramienta abierta de apoyo y triaje preliminar para resultados genéticos procesados.
Validación interna: casos sintéticos incluidos y paridad verificada con el motor del complemento QGIS.
Comparación externa contra software forense: pendiente.
Uso pericial: no validado.
Cálculo real de PI/LR desde frecuencias poblacionales: no implementado.
```

## Revisión legal

Este aviso no sustituye asesoría legal. Antes de distribuir ariADNa en una institución, colectivo, laboratorio, fiscalía, universidad u organización pública, se recomienda revisión legal, ética y de protección de datos.

/* Aplica el tema guardado antes de pintar (sólo preferencia visual; nunca datos del caso). */
(function () {
  "use strict";
  try {
    var saved = window.localStorage.getItem("ariadna-theme");
    if (saved === "light" || saved === "dark") document.documentElement.setAttribute("data-theme", saved);
  } catch (err) {
    /* almacenamiento no disponible: se usa el tema del sistema */
  }
})();

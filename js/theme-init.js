/* ariADNa — preferencias visuales.
 * Se ejecuta en <head>, antes de pintar, para aplicar tema y color sin parpadeo.
 * Sólo guarda preferencias de interfaz (tema, color, animaciones, avisos); nunca datos del caso.
 */
(function (root) {
  "use strict";
  var doc = root.document;
  var html = doc.documentElement;

  var THEMES = ["auto", "light", "dark"];
  var ACCENTS = ["verde", "azul", "turquesa", "violeta", "grafito"];
  // clave de almacenamiento, valores válidos, valor por defecto
  var SPEC = {
    theme: ["ariadna-theme", THEMES, "auto"],
    accent: ["ariadna-accent", ACCENTS, "verde"],
    intro: ["ariadna-intro", ["on", "off"], "on"], // animación de inicio
    coach: ["ariadna-coach", ["on", "done"], "on"], // guía de inicio (mano)
    limits: ["ariadna-limits", ["on", "off"], "on"], // aviso de límites antes de analizar
  };

  function read(key) {
    try {
      return root.localStorage.getItem(key);
    } catch (err) {
      return null; // almacenamiento no disponible: se usan los valores por defecto
    }
  }

  function write(key, value) {
    try {
      root.localStorage.setItem(key, value);
    } catch (err) {
      /* sin almacenamiento: la preferencia dura esta sesión */
    }
  }

  var values = {};
  Object.keys(SPEC).forEach(function (name) {
    var saved = read(SPEC[name][0]);
    values[name] = SPEC[name][1].indexOf(saved) !== -1 ? saved : SPEC[name][2];
  });

  var darkQuery = root.matchMedia ? root.matchMedia("(prefers-color-scheme: dark)") : null;
  var motionQuery = root.matchMedia ? root.matchMedia("(prefers-reduced-motion: reduce)") : null;
  var listeners = [];

  function resolvedTheme() {
    if (values.theme !== "auto") return values.theme;
    return darkQuery && darkQuery.matches ? "dark" : "light";
  }

  function apply() {
    html.setAttribute("data-theme", resolvedTheme());
    html.setAttribute("data-accent", values.accent);
  }

  function notify(name) {
    listeners.forEach(function (fn) { fn(name); });
    try {
      doc.dispatchEvent(new CustomEvent("ariadna:theme"));
    } catch (err) {
      /* navegador sin CustomEvent: los lienzos se actualizan al recargar */
    }
  }

  function set(name, value) {
    if (!SPEC[name] || SPEC[name][1].indexOf(value) === -1 || values[name] === value) return;
    values[name] = value;
    write(SPEC[name][0], value);
    apply();
    notify(name);
  }

  if (darkQuery && darkQuery.addEventListener) {
    darkQuery.addEventListener("change", function () {
      if (values.theme !== "auto") return;
      apply();
      notify("theme");
    });
  }

  apply();

  // Animación de inicio: sólo al entrar por la portada, una vez por pestaña,
  // y nunca si la persona pidió menos movimiento o la desactivó.
  var seen = false;
  try {
    seen = root.sessionStorage.getItem("ariadna-intro-seen") === "1";
  } catch (err) {
    seen = false;
  }
  var hash = (root.location.hash || "").replace(/^#/, "");
  var atHome = hash === "" || hash === "inicio";
  var reduced = !!(motionQuery && motionQuery.matches);
  if (values.intro !== "on" || seen || reduced || !atHome) html.classList.add("no-splash");

  root.AriadnaPrefs = {
    THEMES: THEMES,
    ACCENTS: ACCENTS,
    get: function (name) { return values[name]; },
    set: set,
    resolvedTheme: resolvedTheme,
    reducedMotion: function () { return !!(motionQuery && motionQuery.matches); },
    onChange: function (fn) { listeners.push(fn); },
    markIntroSeen: function () {
      try {
        root.sessionStorage.setItem("ariadna-intro-seen", "1");
      } catch (err) {
        /* sin almacenamiento de sesión: la animación puede repetirse */
      }
    },
  };
})(window);

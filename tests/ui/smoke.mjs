/*!
 * ariADNa — prueba de humo de la interfaz
 *
 * Abre la app en Chrome sin ventana y la recorre como lo haría una persona:
 * portada → herramienta → ejemplo → Analizar → reporte → exportar. De paso comprueba
 * las promesas de la app: no hace peticiones fuera de sí misma, no viola su política de
 * seguridad (CSP), no guarda datos del caso, funciona abierta como archivo y respeta
 * tema, color y «reducir movimiento».
 *
 * Sin dependencias: habla con Chrome por el protocolo DevTools usando el WebSocket
 * nativo de Node (22 o posterior).
 *
 *   npm run test:ui
 *
 * Variables opcionales:
 *   CHROME_BIN           ruta del ejecutable de Chrome, Chromium o Edge
 *   UI_SMOKE_ARTIFACTS   carpeta donde dejar captura y registro si un escenario falla
 *   CI                   en integración continua, no encontrar Chrome es un fallo
 *                        (en una computadora personal la prueba sólo se omite)
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { homedir, tmpdir } from "node:os";
import { delimiter, dirname, extname, join, resolve, sep } from "node:path";
import { after, before, describe, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const WAIT_MS = 15_000;
const IN_CI = !!process.env.CI;

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

async function until(check, label, timeout = WAIT_MS) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`No ocurrió a tiempo (${Math.round(timeout / 1000)} s): ${label}`);
    await sleep(50);
  }
}

/* ------------------------------------------------------------ navegador */
function findChrome() {
  const explicit = process.env.CHROME_BIN || process.env.CHROME_PATH;
  if (explicit) return existsSync(explicit) ? explicit : null;
  const candidates = [];
  if (process.platform === "darwin") {
    for (const app of ["Google Chrome", "Chromium", "Microsoft Edge"]) {
      candidates.push(`/Applications/${app}.app/Contents/MacOS/${app}`, join(homedir(), `Applications/${app}.app/Contents/MacOS/${app}`));
    }
  } else if (process.platform === "win32") {
    for (const base of [process.env.PROGRAMFILES, process.env["PROGRAMFILES(X86)"], process.env.LOCALAPPDATA]) {
      if (!base) continue;
      candidates.push(join(base, "Google/Chrome/Application/chrome.exe"), join(base, "Microsoft/Edge/Application/msedge.exe"));
    }
  }
  const names =
    process.platform === "win32"
      ? ["chrome.exe", "msedge.exe"]
      : ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "microsoft-edge"];
  for (const dir of (process.env.PATH || "").split(delimiter)) {
    if (dir) for (const name of names) candidates.push(join(dir, name));
  }
  return candidates.find((path) => existsSync(path)) || null;
}

async function launchChrome(executable) {
  const profile = mkdtempSync(join(tmpdir(), "ariadna-ui-perfil-"));
  const args = [
    "--headless=new",
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-default-apps",
    "--disable-extensions",
    "--disable-sync",
    "--metrics-recording-only",
    "--mute-audio",
    "--hide-scrollbars",
    "--window-size=1280,800",
  ];
  // Los ejecutores de integración continua no permiten el aislamiento de Chrome; sólo se cargan archivos propios.
  if (IN_CI) args.push("--no-sandbox", "--disable-dev-shm-usage");
  args.push("about:blank");

  const child = spawn(executable, args, { stdio: ["ignore", "ignore", "pipe"] });
  let stderr = "";
  const wsUrl = await new Promise((done, fail) => {
    const timer = setTimeout(() => fail(new Error("Chrome no abrió su puerto de depuración a tiempo.\n" + stderr.slice(-1500))), 30_000);
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk).slice(-8000);
      const match = /DevTools listening on (ws:\/\/\S+)/.exec(stderr);
      if (match) {
        clearTimeout(timer);
        done(match[1]);
      }
    });
    child.once("error", (err) => {
      clearTimeout(timer);
      fail(err);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      fail(new Error(`Chrome terminó antes de tiempo (código ${code}).\n${stderr.slice(-1500)}`));
    });
  });
  return { child, profile, wsUrl };
}

async function stopChrome(chrome) {
  const { child } = chrome;
  if (child.exitCode === null && child.signalCode === null) {
    const exited = new Promise((done) => child.once("exit", done));
    child.kill();
    await Promise.race([exited, sleep(5000)]);
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
  }
}

/* --------------------------------------------- protocolo DevTools (CDP) */
class Cdp {
  static connect(url) {
    return new Promise((done, fail) => {
      const socket = new WebSocket(url);
      socket.addEventListener("open", () => done(new Cdp(socket)), { once: true });
      socket.addEventListener("error", () => fail(new Error("No se pudo conectar con Chrome por el protocolo DevTools.")), { once: true });
    });
  }

  constructor(socket) {
    this.socket = socket;
    this.lastId = 0;
    this.pending = new Map();
    this.handlers = new Map(); // id de sesión ("" = navegador) → manejadores
    this.closing = false;
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const waiter = this.pending.get(message.id);
        if (!waiter) return;
        this.pending.delete(message.id);
        if (message.error) waiter.fail(new Error(`${waiter.method}: ${message.error.message}`));
        else waiter.done(message.result);
      } else if (message.method) {
        for (const handler of this.handlers.get(message.sessionId || "") || []) handler(message);
      }
    });
    socket.addEventListener("close", () => {
      if (this.closing) return;
      for (const waiter of this.pending.values()) waiter.fail(new Error("Chrome cerró la conexión."));
      this.pending.clear();
    });
  }

  send(method, params = {}, sessionId) {
    const id = ++this.lastId;
    const message = { id, method, params };
    if (sessionId) message.sessionId = sessionId;
    return new Promise((done, fail) => {
      this.pending.set(id, { done, fail, method });
      this.socket.send(JSON.stringify(message));
    });
  }

  on(sessionId, handler) {
    const key = sessionId || "";
    if (!this.handlers.has(key)) this.handlers.set(key, new Set());
    this.handlers.get(key).add(handler);
    return () => this.handlers.get(key).delete(handler);
  }

  close() {
    this.closing = true;
    this.socket.close();
  }
}

/* ------------------------------------------------- servidor de archivos */
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
};

function startServer(root) {
  const server = createServer((request, response) => {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    } catch (err) {
      response.writeHead(400).end();
      return;
    }
    if (pathname.endsWith("/")) pathname += "index.html";
    const file = resolve(root, "." + pathname);
    const inside = file.startsWith(root + sep) && !pathname.split("/").some((part) => part.startsWith("."));
    let body = null;
    try {
      if (inside && statSync(file).isFile()) body = readFileSync(file);
    } catch (err) {
      body = null;
    }
    if (!body) {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("No encontrado");
      return;
    }
    response.writeHead(200, { "content-type": MIME[extname(file).toLowerCase()] || "application/octet-stream", "cache-control": "no-store" });
    response.end(request.method === "HEAD" ? undefined : body);
  });
  return new Promise((done, fail) => {
    server.once("error", fail);
    server.listen(0, "127.0.0.1", () => done({ server, origin: `http://127.0.0.1:${server.address().port}` }));
  });
}

/* ------------------------------------- utilidades que corren en la página */
// Se inyecta en cada documento antes que los scripts de la app. No se ejecuta en Node.
function pageInit() {
  document.addEventListener("securitypolicyviolation", (event) => {
    const what = event.blockedURI && event.blockedURI !== "inline" ? event.blockedURI : "contenido en línea";
    const where = event.sourceFile ? " (" + event.sourceFile + ":" + event.lineNumber + ")" : "";
    try {
      window.__smokeReport("La política de seguridad (" + event.violatedDirective + ") bloqueó " + what + where);
    } catch (err) {
      /* sin canal de aviso: el registro de la consola lo recoge igual */
    }
  });
  window.__t = {
    q: (selector, root) => (root || document).querySelector(selector),
    qa: (selector, root) => Array.from((root || document).querySelectorAll(selector)),
    clean: (text) => String(text == null ? "" : text).replace(/\s+/g, " ").trim(),
    text(selector) {
      const el = document.querySelector(selector);
      return el ? this.clean(el.textContent) : "";
    },
    visible: (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden",
    appReady: () => document.readyState === "complete" && !!window.AriadnaEngine && !document.documentElement.classList.contains("no-js"),
    describe(el) {
      if (!el) return "otra capa";
      const classes = typeof el.className === "string" && el.className.trim() ? "." + el.className.trim().split(/\s+/).join(".") : "";
      return el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + classes;
    },
    // Punto donde una persona pulsaría el elemento, sólo si de verdad está a la vista,
    // quieto y sin nada encima.
    point(selector) {
      const state = this.clickState || (this.clickState = {});
      const no = (why) => {
        state.key = null;
        return { why };
      };
      const el = document.querySelector(selector);
      if (!el) return no("no existe en la página");
      if (el.disabled) return no("está deshabilitado");
      el.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
      const box = el.getBoundingClientRect();
      if (box.width < 1 || box.height < 1) return no("no se ve");
      const x = box.left + box.width / 2;
      const y = box.top + box.height / 2;
      const hit = document.elementFromPoint(x, y);
      if (!hit || !(hit === el || el.contains(hit))) return no("lo tapa " + this.describe(hit));
      // El ratón se mueve en coordenadas de la pantalla visible; en un teléfono ésta puede estar
      // desplazada o ampliada respecto del documento.
      const view = window.visualViewport;
      const px = view ? (x - view.offsetLeft) * view.scale : x;
      const py = view ? (y - view.offsetTop) * view.scale : y;
      if (view && (px < 0 || py < 0 || px > view.width * view.scale || py > view.height * view.scale)) return no("queda fuera de la pantalla");
      const key = selector + "@" + Math.round(px) + "," + Math.round(py);
      if (state.key !== key) {
        state.key = key;
        return { why: "todavía se está moviendo" };
      }
      state.key = null;
      return { x: px, y: py };
    },
    // Luminosidad (0 = negro, 1 = blanco) del fondo de la página, sea cual sea la notación CSS del color.
    pageLuminance() {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      const ctx = canvas.getContext("2d");
      for (const el of [document.body, document.documentElement]) {
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = getComputedStyle(el).backgroundColor;
        ctx.fillRect(0, 0, 1, 1);
        const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
        if (a > 200) return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      }
      return 1;
    },
  };
}

// Lo que el reporte en pantalla le muestra a la persona.
function readReport() {
  const root = __t.q("#results-root");
  const head = __t.q(".report-head", root);
  const stats = __t.qa(".stats .stat", root);
  const num = (stat) => (stat && stat.querySelector(".num") ? __t.clean(stat.querySelector(".num").textContent) : "");
  const pair = (num(stats[2]).match(/\d+/g) || []).map(Number);
  const wide = (selector) => {
    const svg = __t.q(selector, root);
    return !!svg && svg.getBoundingClientRect().width > 40;
  };
  return {
    tone: ((head && head.className.match(/tone-(\w+)/)) || [])[1] || "",
    verdict: __t.text("#verdict-title"),
    conclusion: __t.text("#results-root .conclusion"),
    posterior: num(stats[0]),
    compatible: pair[0],
    total: pair[1],
    markers: Number(__t.text('#results-root [data-filter="all"] b')),
    rows: __t.qa("tr.mk", root).length,
    bad: __t.qa("tr.mk.mk-bad", root).length,
    support: wide('[data-chart="support"] svg'),
    glyphs: __t.qa("[data-glyph] svg", root).length,
    focus: document.activeElement ? document.activeElement.id : "",
    title: document.title,
  };
}

// Lo que el motor calcula para el mismo ejemplo, sin pasar por la interfaz.
function expectedReading(id, vcf) {
  const E = window.AriadnaEngine;
  const C = window.AriadnaCharts;
  const example = window.AriadnaExamples.find((item) => item.id === id);
  const rows = vcf
    ? E.canonicalizeRows(E.readVcfSnpRows(example.text, vcf.child, vcf.parent), "snp_panel")
    : E.canonicalizeRows(E.readCsvRows(example.text), example.assay);
  const result = E.analyzeMarkers(example.assay, rows, 0.5);
  const support = C.support(result);
  const banner = E.bannerMeta(result);
  const alerts = E.triageInsights(result).filter((item) => item.level === "alert").length;
  return {
    tone: banner[0] === "ok" && alerts ? "warn" : banner[0], // una alerta nunca deja el veredicto en verde
    total: result.total_markers,
    compatible: result.compatible_markers,
    markers: result.markers.length,
    bad: result.markers.filter((marker) => E.statusClass(marker) === "bad").length,
    posterior: support ? C.formatPosterior(support.posterior, 2) : null,
  };
}

/* ------------------------------------------------------------- páginas */
const env = { downloadsSeen: [], downloadsDone: new Map() };

function trackDownloads() {
  const onEvent = ({ method, params }) => {
    if (/\.downloadWillBegin$/.test(method) && !env.downloadsSeen.some((item) => item.guid === params.guid)) env.downloadsSeen.push(params);
    if (/\.downloadProgress$/.test(method) && params.state !== "inProgress") env.downloadsDone.set(params.guid, params.state);
  };
  env.cdp.on("", onEvent);
  return onEvent;
}

async function openPage({ width = 1280, height = 800, mobile = false, dark = false, reducedMotion = false, allowed } = {}) {
  const { cdp } = env;
  const { browserContextId } = await cdp.send("Target.createBrowserContext");
  // Las descargas van a una carpeta temporal de la prueba, nunca a la carpeta de Descargas de la persona.
  await cdp.send("Browser.setDownloadBehavior", { behavior: "allowAndName", browserContextId, downloadPath: env.downloads, eventsEnabled: true });
  const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank", browserContextId });
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
  const send = (method, params) => cdp.send(method, params, sessionId);

  const okPrefixes = (allowed || [env.origin + "/"]).concat(["data:", "blob:", "about:"]);
  const problems = [];
  const requests = [];
  const urls = new Map();
  const downloadEvents = trackDownloadsOnce();
  const off = cdp.on(sessionId, (message) => {
    const { method, params } = message;
    downloadEvents(message);
    if (method === "Runtime.consoleAPICalled" && (params.type === "error" || params.type === "assert")) {
      problems.push(`console.${params.type}: ` + params.args.map((arg) => arg.value ?? arg.description ?? arg.type).join(" "));
    } else if (method === "Runtime.exceptionThrown") {
      const details = params.exceptionDetails;
      problems.push("Excepción sin atrapar: " + (details.exception?.description || details.text) + (details.url ? ` (${details.url}:${details.lineNumber})` : ""));
    } else if (method === "Log.entryAdded" && params.entry.level === "error") {
      problems.push(`Error en la consola (${params.entry.source}): ${params.entry.text}` + (params.entry.url ? ` — ${params.entry.url}` : ""));
    } else if (method === "Runtime.bindingCalled" && params.name === "__smokeReport") {
      problems.push(params.payload);
    } else if (method === "Network.requestWillBeSent") {
      const url = params.request.url;
      urls.set(params.requestId, url);
      requests.push(url);
      if (!okPrefixes.some((prefix) => url.startsWith(prefix))) problems.push("Petición fuera de la app: " + url);
    } else if (method === "Network.responseReceived" && params.response.status >= 400) {
      problems.push(`Respuesta ${params.response.status}: ${params.response.url}`);
    } else if (method === "Network.loadingFailed" && !params.canceled) {
      problems.push(`No cargó ${urls.get(params.requestId) || "un recurso"}: ${params.errorText}` + (params.blockedReason ? ` (${params.blockedReason})` : ""));
    }
  });

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Log.enable");
  await send("Network.enable");
  await send("Runtime.addBinding", { name: "__smokeReport" });
  await send("Page.addScriptToEvaluateOnNewDocument", { source: `(${pageInit})();` });
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
  await send("Emulation.setEmulatedMedia", {
    features: [
      { name: "prefers-color-scheme", value: dark ? "dark" : "light" },
      { name: "prefers-reduced-motion", value: reducedMotion ? "reduce" : "no-preference" },
    ],
  });

  const page = {
    problems,
    requests,
    send,

    // Píxeles que el contenido se sale del ancho de la pantalla (0 = cabe). Se mide contra la pantalla
    // emulada y no contra window.innerWidth, que en un teléfono crece junto con el contenido desbordado.
    overflow: () => page.run((screenWidth) => Math.max(0, Math.round(document.documentElement.scrollWidth - screenWidth)), width),

    // Ejecuta una función en la página. Sólo recibe argumentos serializables.
    async run(fn, ...args) {
      const expression = `(${fn})(${args.map((arg) => JSON.stringify(arg)).join(", ")})`;
      const out = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true });
      if (out.exceptionDetails) throw new Error(out.exceptionDetails.exception?.description || out.exceptionDetails.text);
      return out.result.value;
    },

    async waitFor(fn, { label = "la condición esperada", args = [], timeout = WAIT_MS } = {}) {
      const deadline = Date.now() + timeout;
      let lastError = null;
      for (;;) {
        try {
          const value = await page.run(fn, ...args);
          if (value) return value;
          lastError = null;
        } catch (err) {
          lastError = err;
        }
        if (Date.now() > deadline) {
          throw new Error(`No ocurrió a tiempo (${Math.round(timeout / 1000)} s): ${label}` + (lastError ? ` — ${lastError.message}` : ""));
        }
        await sleep(50);
      }
    },

    async goto(url, { app = true } = {}) {
      const out = await send("Page.navigate", { url });
      if (out.errorText) throw new Error(`No se pudo abrir ${url}: ${out.errorText}`);
      const target = new URL(url);
      await page.waitFor(
        (protocol, host, pathname, wantsApp) =>
          location.protocol === protocol && location.host === host && location.pathname === pathname &&
          !!window.__t && (wantsApp ? __t.appReady() : document.readyState === "complete"),
        { label: `que termine de cargar ${url}`, args: [target.protocol, target.host, target.pathname, app] }
      );
    },

    async reload() {
      await page.run(() => {
        window.__stale = true;
      });
      await send("Page.reload");
      await page.waitFor(() => !window.__stale && !!window.__t && __t.appReady(), { label: "que la página se recargue" });
    },

    // Pulsa con el ratón de verdad: falla si el elemento no se ve o hay algo encima.
    async click(selector, { label = selector, timeout = WAIT_MS } = {}) {
      const deadline = Date.now() + timeout;
      let point;
      for (;;) {
        point = await page.run((sel) => __t.point(sel), selector).catch((err) => ({ why: err.message }));
        if (point && point.x !== undefined) break;
        if (Date.now() > deadline) throw new Error(`No se pudo pulsar ${label}: ${point ? point.why : "la página no respondió"}`);
        await sleep(50);
      }
      await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x, y: point.y });
      await send("Input.dispatchMouseEvent", { type: "mousePressed", x: point.x, y: point.y, button: "left", clickCount: 1 });
      await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 1 });
    },

    // Escribe en el campo que tiene el foco.
    async type(text) {
      await send("Input.insertText", { text });
    },

    // Ejecuta `trigger` y devuelve el archivo que la app descargó.
    async download(trigger) {
      const before = env.downloadsSeen.length;
      await trigger();
      const info = await until(() => env.downloadsSeen[before], "que empiece la descarga");
      await until(() => env.downloadsDone.has(info.guid), "que termine la descarga");
      assert.equal(env.downloadsDone.get(info.guid), "completed", "la descarga termina bien");
      return { name: info.suggestedFilename, text: readFileSync(join(env.downloads, info.guid), "utf8") };
    },

    async evidence(name, error) {
      mkdirSync(env.artifacts, { recursive: true });
      const slug = name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
      const base = join(env.artifacts, slug);
      const where = await page.run(() => location.href).catch(() => "desconocida");
      const lines = [`Escenario: ${name}`, `Dirección: ${where}`, "", String((error && error.stack) || error), "", "Problemas registrados por la página:"]
        .concat(problems.length ? problems.map((p) => "  - " + p) : ["  (ninguno)"])
        .concat(["", "Peticiones:"], requests.map((r) => "  " + r));
      writeFileSync(base + ".txt", lines.join("\n") + "\n");
      const shot = await send("Page.captureScreenshot", { format: "png" });
      writeFileSync(base + ".png", Buffer.from(shot.data, "base64"));
      return base;
    },

    async close() {
      off();
      await cdp.send("Target.closeTarget", { targetId }).catch(() => {});
      await cdp.send("Target.disposeBrowserContext", { browserContextId }).catch(() => {});
    },
  };
  return page;
}

function trackDownloadsOnce() {
  if (!env.onDownloadEvent) env.onDownloadEvent = trackDownloads();
  return env.onDownloadEvent;
}

function scenario(name, options, body) {
  test(name, { timeout: 120_000 }, async () => {
    const page = await openPage(options);
    try {
      await body(page);
      if (page.problems.length) throw new Error("La página registró errores, peticiones indebidas o violaciones de su política de seguridad.");
    } catch (error) {
      const base = await page.evidence(name, error).catch(() => null);
      const extra = [];
      if (page.problems.length) extra.push("Problemas registrados por la página:", ...page.problems.map((problem) => "  - " + problem));
      if (base) extra.push(`Captura y registro: ${base}.png y ${base}.txt`);
      if (extra.length) {
        // el informe de pruebas imprime la traza, así que el detalle se añade a ambos
        error.message += "\n" + extra.join("\n");
        if (typeof error.stack === "string") {
          const lines = error.stack.split("\n");
          const firstFrame = lines.findIndex((line) => /^\s+at /.test(line));
          const at = firstFrame === -1 ? lines.length : firstFrame;
          error.stack = lines.slice(0, at).concat(extra, lines.slice(at)).join("\n");
        }
      }
      throw error;
    } finally {
      await page.close();
    }
  });
}

/* --------------------------------------------------- pasos reutilizables */
const analysisVisible = () => __t.visible(__t.q("#view-analysis")) && __t.visible(__t.q("#actionbar")) && __t.q("#tool-loader").hidden;
const reportVisible = () => __t.visible(__t.q("#view-results")) && !!__t.q("#verdict-title");

async function skipIntro(page) {
  const showing = await page.run(() => !document.documentElement.classList.contains("no-splash") && __t.visible(__t.q("#splash")));
  assert.ok(showing, "al entrar por la portada se ve la animación de inicio");
  try {
    await page.click("#splash-skip", { label: "«Saltar animación»", timeout: 5000 });
  } catch (error) {
    // si la animación terminó sola antes de pulsar, también vale
    const leaving = await page.run(() => document.documentElement.classList.contains("no-splash") || __t.q("#splash").classList.contains("is-leaving"));
    if (!leaving) throw error;
  }
  await page.waitFor(() => document.documentElement.classList.contains("no-splash") && !__t.q("#app-shell").inert, { label: "que termine la animación de inicio" });
}

async function openAnalysis(page, base = env.origin + "/") {
  await page.goto(base + "#analisis");
  await page.waitFor(analysisVisible, { label: "la vista de Análisis" });
}

async function loadStartExample(page) {
  await page.click("#start-example", { label: "«Probar con un ejemplo»" });
  await page.waitFor(() => __t.text("#notice-slot").includes("Ejemplo cargado"), { label: "el aviso «Ejemplo cargado»" });
}

// Pulsa Analizar y acepta el aviso de límites si aparece. Devuelve true si apareció.
async function analyze(page) {
  await page.click("#analyze-btn", { label: "«Analizar»" });
  const state = await page.waitFor(
    () => (__t.q("#dlg-limits").open ? "limits" : __t.visible(__t.q("#view-results")) && __t.q("#verdict-title") ? "report" : ""),
    { label: "el aviso de límites o el reporte" }
  );
  if (state === "limits") {
    await page.click('#dlg-limits [data-close="ok"]', { label: "«Entiendo, analizar»" });
    await page.waitFor(reportVisible, { label: "el reporte" });
  }
  return state === "limits";
}

function assertReportMatches(shown, expected, label) {
  assert.ok(shown.verdict.length > 3, `${label}: el reporte abre con un veredicto`);
  assert.ok(shown.conclusion.length > 10, `${label}: el veredicto lleva su explicación`);
  assert.equal(shown.tone, expected.tone, `${label}: el color del veredicto corresponde a la lectura del motor`);
  assert.equal(shown.total, expected.total, `${label}: total de marcadores útiles`);
  assert.equal(shown.compatible, expected.compatible, `${label}: marcadores compatibles`);
  assert.equal(shown.markers, expected.markers, `${label}: marcadores listados`);
  assert.equal(shown.posterior, expected.posterior === null ? "—" : expected.posterior, `${label}: probabilidad posterior`);
  assert.equal(shown.support, expected.posterior !== null, `${label}: la figura de soporte aparece sólo cuando hay CPI`);
  if (expected.markers <= 120) {
    assert.equal(shown.rows, expected.markers, `${label}: una fila por marcador`);
    assert.equal(shown.bad, expected.bad, `${label}: filas marcadas como incongruencia`);
  }
  assert.ok(shown.glyphs > 0, `${label}: se dibuja el esquema de alelos`);
}

// Un reporte exportado debe poder abrirse solo: sin scripts ni recursos de fuera.
function assertStandalone(html, label) {
  assert.match(html, /^<!doctype html>/i, `${label}: es un documento HTML completo`);
  assert.ok(!/<script\b/i.test(html), `${label}: no lleva scripts`);
  assert.ok(!/(?:src|href)\s*=\s*["']?\s*(?:https?:)?\/\//i.test(html), `${label}: no enlaza recursos externos`);
  assert.ok(!/@import|url\(\s*["']?\s*(?:https?:)?\/\//i.test(html), `${label}: sus estilos no cargan nada de fuera`);
}

/* ------------------------------------------------------------ escenarios */
const chromePath = findChrome();
const skipReason =
  typeof WebSocket !== "function"
    ? "Esta prueba necesita Node 22 o posterior (usa su WebSocket nativo)."
    : !chromePath
      ? "No se encontró Chrome, Chromium ni Edge. Instala uno o indica su ruta con la variable CHROME_BIN."
      : null;

if (skipReason && IN_CI) {
  test("Interfaz de ariADNa (prueba de humo)", () => {
    throw new Error(`${skipReason} En integración continua la prueba no se puede omitir.`);
  });
} else if (skipReason) {
  console.log(`Prueba de la interfaz OMITIDA: ${skipReason}`);
  test("Interfaz de ariADNa (prueba de humo)", { skip: skipReason }, () => {});
} else {
  describe("Interfaz de ariADNa (prueba de humo)", () => {
    before(async () => {
      env.artifacts = resolve(process.env.UI_SMOKE_ARTIFACTS || join(tmpdir(), "ariadna-ui-fallos"));
      env.downloads = mkdtempSync(join(tmpdir(), "ariadna-ui-descargas-"));
      const served = await startServer(ROOT);
      env.server = served.server;
      env.origin = served.origin;
      env.chrome = await launchChrome(chromePath);
      process.once("exit", () => {
        try {
          env.chrome.child.kill("SIGKILL");
        } catch (err) {
          /* ya había terminado */
        }
      });
      env.cdp = await Cdp.connect(env.chrome.wsUrl);
      trackDownloadsOnce();
      const version = await env.cdp.send("Browser.getVersion");
      console.log(`Navegador: ${version.product} · app servida desde ${env.origin}`);
    });

    after(async () => {
      if (env.cdp) {
        await Promise.race([env.cdp.send("Browser.close").catch(() => {}), sleep(2000)]);
        env.cdp.close();
      }
      if (env.chrome) await stopChrome(env.chrome);
      if (env.server) {
        env.server.closeAllConnections();
        await new Promise((done) => env.server.close(done));
      }
      for (const dir of [env.downloads, env.chrome && env.chrome.profile]) {
        if (dir) rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      }
    });

    scenario("La portada carga, la animación de inicio se puede saltar y el botón abre la herramienta", {}, async (page) => {
      await page.goto(env.origin + "/");
      await skipIntro(page);
      const home = await page.run(() => ({
        visible: __t.visible(__t.q("#view-home")),
        version: __t.text("#algo-version"),
        engine: window.AriadnaEngine.ALGORITHM_VERSION,
        theme: document.documentElement.dataset.theme,
      }));
      assert.ok(home.visible, "la portada queda a la vista");
      assert.equal(home.version, home.engine, "el pie muestra la versión del algoritmo");
      assert.equal(home.theme, "light", "con el sistema en claro, el tema automático es claro");

      await page.click("[data-open-tool]", { label: "«Abrir la herramienta»" });
      await page.waitFor(analysisVisible, { label: "que abra la vista de Análisis" });
      assert.equal(await page.run(() => location.hash), "#analisis", "la dirección refleja la vista");

      await page.click("#tab-about", { label: "la pestaña «Acerca de»" });
      await page.waitFor(() => __t.visible(__t.q("#view-about")) && __t.qa("#about-root h2").length > 2, { label: "el contenido de «Acerca de»" });
    });

    scenario("Flujo principal: ejemplo → Analizar → aviso de límites → reporte", {}, async (page) => {
      await openAnalysis(page);
      assert.ok(await page.run(() => __t.visible(__t.q("#start-panel"))), "con la tabla vacía aparece «¿Cómo quieres empezar?»");

      await loadStartExample(page);
      const loaded = await page.run(() => ({
        rows: __t.qa('#grid input[data-k="marker"]').filter((input) => input.value.trim()).length,
        status: __t.text("#status-text"),
        startPanel: __t.visible(__t.q("#start-panel")),
      }));
      assert.ok(loaded.rows > 0, "el ejemplo llena la tabla");
      assert.match(loaded.status, /listo para analizar/, "la barra de estado invita a analizar");
      assert.equal(loaded.startPanel, false, "el panel de inicio se oculta cuando ya hay datos");

      await page.click("#analyze-btn", { label: "«Analizar»" });
      await page.waitFor(() => __t.q("#dlg-limits").open, { label: "el aviso de alcances y límites" });
      assert.ok((await page.run(() => __t.qa("#limits-list li").length)) >= 5, "el aviso enumera los límites del análisis");
      assert.ok(!(await page.run(() => __t.visible(__t.q("#view-results")))), "no hay reporte hasta aceptar el aviso");
      await page.click('#dlg-limits [data-close="ok"]', { label: "«Entiendo, analizar»" });
      await page.waitFor(reportVisible, { label: "el reporte" });

      const shown = await page.run(readReport);
      assertReportMatches(shown, await page.run(expectedReading, "str_ce_compatible", null), "ejemplo inicial");
      assert.equal(shown.focus, "verdict-title", "el foco pasa al veredicto para que el lector de pantalla lo anuncie");
      assert.equal(shown.title, "Resultados · ariADNa", "el título de la pestaña del navegador cambia con la vista");

      // editar un dato invalida el reporte: nunca queda un resultado viejo a la vista
      await page.click('#results-actions [data-goto="analysis"]', { label: "«Editar datos»" });
      await page.waitFor(analysisVisible, { label: "volver a Análisis" });
      await page.click('#grid input[data-r="0"][data-k="pi"]', { label: "la celda de PI de la primera fila" });
      await page.type("9");
      await page.waitFor(() => __t.text("#status-text").includes("listo para analizar"), { label: "que el estado vuelva a «listo para analizar»" });
      await page.click("#tab-results", { label: "la pestaña «Resultados»" });
      await page.waitFor(() => __t.text("#results-root .empty-state h1").includes("Los datos cambiaron"), { label: "el aviso de que los datos cambiaron" });

      // privacidad: el navegador sólo guarda preferencias de interfaz
      const stored = await page.run(async () => ({
        local: Object.keys(localStorage).map((key) => [key, localStorage.getItem(key)]),
        session: Object.keys(sessionStorage),
        cookies: document.cookie,
        databases: indexedDB.databases ? (await indexedDB.databases()).map((db) => db.name) : [],
        caches: window.caches ? await caches.keys() : [],
      }));
      for (const [key, value] of stored.local) {
        assert.ok(/^ariadna-(theme|accent|intro|coach|limits)$/.test(key) && value.length <= 12, `sólo se guardan preferencias de interfaz (se encontró ${key}=${value})`);
      }
      assert.deepEqual(stored.session.filter((key) => key !== "ariadna-intro-seen"), [], "la sesión no guarda datos del caso");
      assert.equal(stored.cookies, "", "no se crean cookies");
      assert.deepEqual(stored.databases, [], "no se crean bases de datos en el navegador");
      assert.deepEqual(stored.caches, [], "no se crean cachés");
    });

    scenario("Cada ejemplo incluido da un reporte que coincide con el motor", {}, async (page) => {
      await openAnalysis(page);
      const examples = await page.run(() => window.AriadnaExamples.map((item) => ({ id: item.id, filename: item.filename, vcf: /\.vcf$/i.test(item.filename) })));
      assert.ok(examples.length >= 3, "la app trae ejemplos incluidos");

      for (const example of examples) {
        await page.click("#examples-menu > summary", { label: "el menú «Ejemplos»" });
        await page.click(`[data-example="${example.id}"]`, { label: `el ejemplo ${example.id}` });
        let vcf = null;
        await until(async () => {
          const state = await page.run(
            (filename) => (__t.q("#dlg-confirm").open ? "confirm" : __t.q("#dlg-vcf").open ? "vcf" : __t.text("#notice-slot").includes(filename) ? "done" : ""),
            example.filename
          );
          if (state === "confirm") {
            await page.click('#dlg-confirm [data-close="ok"]', { label: "«Reemplazar»" });
            await page.waitFor(() => !__t.q("#dlg-confirm").open, { label: "que cierre la confirmación" });
          } else if (state === "vcf") {
            vcf = await page.run(() => ({
              child: __t.q("#vcf-child").selectedOptions[0].textContent,
              parent: __t.q("#vcf-parent").selectedOptions[0].textContent,
            }));
            await page.click("#vcf-ok", { label: "«Usar muestras»" });
            await page.waitFor(() => !__t.q("#dlg-vcf").open, { label: "que cierre la selección de muestras" });
          }
          return state === "done";
        }, `que cargue el ejemplo ${example.id}`);
        assert.equal(vcf !== null, example.vcf, `${example.id}: sólo los VCF piden elegir muestras`);

        await analyze(page);
        assertReportMatches(await page.run(readReport), await page.run(expectedReading, example.id, vcf), example.id);

        await page.click('#results-actions [data-goto="analysis"]', { label: "«Editar datos»" });
        await page.waitFor(analysisVisible, { label: "volver a Análisis" });
      }
    });

    scenario("Exportar: el reporte se descarga, se abre solo y respeta el modo sin identificadores", {}, async (page) => {
      const ids = { caso: "CASO-HUMO-7", hijo: "H-HUMO-7", progenitor: "PA-HUMO-7" };
      await openAnalysis(page);
      await page.click("#ids-details > summary", { label: "«Identificadores del reporte»" });
      for (const [selector, value] of [["#case-id", ids.caso], ["#child-id", ids.hijo], ["#parent-id", ids.progenitor]]) {
        await page.click(selector);
        await page.type(value);
      }
      await loadStartExample(page);
      await analyze(page);
      assert.ok((await page.run(() => __t.text("#report-meta"))).includes(ids.caso), "el reporte en pantalla muestra el caso capturado");

      const openExport = async () => {
        await page.click("#export-btn-2", { label: "«Exportar reporte»" });
        await page.waitFor(() => __t.q("#dlg-export").open, { label: "el diálogo de exportación" });
      };

      // por defecto, sin identificadores
      const anonymous = await page.download(async () => {
        await openExport();
        const options = await page.run(() => ({
          offered: __t.visible(__t.q("#export-ids")),
          anonymous: __t.q('#export-ids input[value="anon"]').checked,
        }));
        assert.deepEqual(options, { offered: true, anonymous: true }, "con identificadores capturados, la opción por defecto es omitirlos");
        await page.click('#dlg-export [data-close="ok"]', { label: "«Descargar reporte»" });
      });
      assert.equal(anonymous.name, "reporte_ariadna.html", "nombre del archivo sin identificadores");
      assertStandalone(anonymous.text, "reporte sin identificadores");
      for (const value of Object.values(ids)) assert.ok(!anonymous.text.includes(value), `el reporte sin identificadores no contiene «${value}»`);
      assert.ok(anonymous.text.includes("Lectura de triaje"), "el reporte trae la lectura de triaje");
      await page.waitFor(() => __t.text("#status-text") === "Reporte exportado", { label: "que el estado diga «Reporte exportado»" });

      // con identificadores, sólo si la persona lo elige
      const identified = await page.download(async () => {
        await openExport();
        await page.click('#export-ids input[value="ident"]', { label: "«Con identificadores»" });
        await page.click('#dlg-export [data-close="ok"]', { label: "«Descargar reporte»" });
      });
      assert.equal(identified.name, `reporte_ariadna_${ids.caso}.html`, "nombre del archivo con el caso");
      assertStandalone(identified.text, "reporte con identificadores");
      for (const value of Object.values(ids)) assert.ok(identified.text.includes(value), `el reporte con identificadores contiene «${value}»`);

      // el archivo exportado se abre por sí solo, sin pedir nada a nadie
      const file = join(env.downloads, "reporte-exportado.html");
      writeFileSync(file, anonymous.text);
      const viewer = await openPage({ allowed: ["file://"] });
      try {
        await viewer.goto(pathToFileURL(file).href, { app: false });
        const opened = await viewer.run(() => ({ heading: __t.text("h1"), rows: __t.qa("tbody tr").length }));
        assert.ok(opened.heading.length > 3 && opened.rows > 0, "el reporte exportado muestra su lectura y sus marcadores");
        assert.equal(await viewer.overflow(), 0, "el reporte exportado no desborda a lo ancho");
        assert.deepEqual(viewer.requests.filter((url) => !url.startsWith("file://")), [], "el reporte exportado no hace peticiones");
        assert.deepEqual(viewer.problems, [], "el reporte exportado se abre sin errores");
      } finally {
        await viewer.close();
      }
    });

    scenario("Configuración: el tema oscuro y el color se aplican, se recuerdan y el reporte se dibuja igual", {}, async (page) => {
      await openAnalysis(page);
      const light = await page.run(() => __t.pageLuminance());
      await page.click("#settings-btn", { label: "el engrane de Configuración" });
      await page.waitFor(() => __t.q("#dlg-settings").open, { label: "el panel de Configuración" });

      await page.click('[data-theme-choice="dark"]', { label: "el tema «Oscuro»" });
      await page.waitFor(() => document.documentElement.dataset.theme === "dark" && __t.pageLuminance() < 0.2, { label: "que la página se oscurezca" });
      assert.ok(light > 0.7, `el tema claro tiene fondo claro (luminosidad ${light.toFixed(2)})`);

      await page.click('[data-accent-choice="azul"]', { label: "el color «Azul»" });
      await page.waitFor(() => document.documentElement.dataset.accent === "azul", { label: "que cambie el color de la interfaz" });

      await page.click('#dlg-settings [data-pane="help"]', { label: "la pestaña «Ayuda»" });
      await page.waitFor(() => __t.visible(__t.q("#pane-help")) && __t.qa("#pane-help details").length >= 3, { label: "el tutorial dentro de Ayuda" });

      await page.click('#dlg-settings [data-close="cancel"]', { label: "cerrar Configuración" });
      await page.waitFor(() => !__t.q("#dlg-settings").open, { label: "que cierre Configuración" });

      await page.reload();
      assert.deepEqual(
        await page.run(() => ({ theme: document.documentElement.dataset.theme, accent: document.documentElement.dataset.accent })),
        { theme: "dark", accent: "azul" },
        "las preferencias se conservan al recargar"
      );

      await page.waitFor(analysisVisible, { label: "la vista de Análisis tras recargar" });
      await loadStartExample(page);
      await analyze(page);
      assertReportMatches(await page.run(readReport), await page.run(expectedReading, "str_ce_compatible", null), "reporte en tema oscuro");
    });

    scenario("Abierta como archivo, sin servidor, también funciona", { allowed: ["file://"] }, async (page) => {
      await openAnalysis(page, pathToFileURL(join(ROOT, "index.html")).href);
      await loadStartExample(page);
      await analyze(page);
      assertReportMatches(await page.run(readReport), await page.run(expectedReading, "str_ce_compatible", null), "abierta como archivo");
    });

    scenario("En pantalla de teléfono nada se desborda a lo ancho", { width: 390, height: 844, mobile: true }, async (page) => {
      const fits = async (where) => assert.equal(await page.overflow(), 0, `${where} cabe en el ancho del teléfono`);
      await page.goto(env.origin + "/");
      await skipIntro(page);
      await fits("la portada");
      await page.click("[data-open-tool]", { label: "«Abrir la herramienta»" });
      await page.waitFor(analysisVisible, { label: "que abra la vista de Análisis" });
      await fits("Análisis con la tabla vacía");
      await loadStartExample(page);
      await fits("Análisis con datos");
      await analyze(page);
      await fits("el reporte");
      assert.ok((await page.run(readReport)).verdict.length > 3, "el reporte abre con un veredicto");
    });

    scenario("Con «reducir movimiento» no hay animación de inicio ni pantalla de carga", { reducedMotion: true }, async (page) => {
      await page.goto(env.origin + "/");
      assert.ok(
        await page.run(() => document.documentElement.classList.contains("no-splash") && !__t.visible(__t.q("#splash")) && !__t.q("#app-shell").inert),
        "la portada aparece directamente"
      );
      await page.click("[data-open-tool]", { label: "«Abrir la herramienta»" });
      assert.ok(await page.run(() => __t.visible(__t.q("#view-analysis")) && __t.q("#tool-loader").hidden), "la herramienta abre en el mismo gesto, sin pantalla de carga");
    });
  });
}

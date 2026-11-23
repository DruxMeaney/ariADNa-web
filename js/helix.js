/*!
 * ariADNa — hélice de ADN formada por partículas (lienzo 2D, sin dependencias)
 *
 *   AriadnaHelix.intro(canvas, opciones)   -> { finished: Promise<void>, skip() }
 *       Animación de inicio (~3,4 s): las partículas se ensamblan en una doble hélice, un visor
 *       recorre el eje y fija tres pares de bases, y la cámara retrocede hasta el encuadre final.
 *   AriadnaHelix.ambient(canvas, opciones) -> { stop() }
 *       Giro perpetuo y barato para la portada; se detiene si la pestaña o el lienzo no se ven.
 *   opciones = { reducedMotion?, duration?, seed? }
 *
 * Es decorativa: la secuencia de bases es ilustrativa, no datos de ningún caso.
 * Colores: --helix-a, --helix-b, --helix-pair, --helix-accent y --helix-text, leídos del lienzo
 * (se releen con el evento "ariadna:theme" en document). El fondo del lienzo es transparente.
 */
(function (global) {
  'use strict';

  var TAU = Math.PI * 2;
  var FUENTE = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';
  var VARIABLES = ['--helix-a', '--helix-b', '--helix-pair', '--helix-accent', '--helix-text'];
  var POR_DEFECTO = ['#0B1A2A', '#7A8CA3', '#B4C0CC', '#0B8A4C', '#0B1A2A'];
  var LETRAS = ['A · T', 'T · A', 'G · C', 'C · G'];

  // Geometría en nanómetros, con las proporciones reales del ADN-B (eje de la hélice = eje X).
  var RADIO = 1, PASO = 3.4, VUELTAS = 4, PB_VUELTA = 10;
  var LARGO = PASO * VUELTAS, N_PARES = VUELTAS * PB_VUELTA;

  // Cámara y profundidad de campo: "f" mide el desenfoque (negativo = más cerca que el foco).
  var DIST = 20, Z_FOCO = -0.8, Z_RANGO = 2.6, F_CERCA = -1.2, F_LEJOS = 1.6;
  var CAPAS = 14, CUBOS = CAPAS * 4;                 // capas de profundidad x 4 colores
  var GUINADA_BUSCA = 0.26, GUINADA_FINAL = 0.07, ZOOM_BUSCA = 1.45, SEGUIR = 0.6;
  var GIRO_INI = 2.1, GIRO_FIN = 0.3, GIRO_TAU = 0.55; // rad/s: gira rápido al formarse y se calma

  // Guion de la intro en ms sobre una base de 3400 (se reescala con opciones.duration).
  var BASE = 3400, T_ENSAMBLE = 1100, T_ATRAS = 2820, T_SALTO = 180, T_RELEVO = 500;
  var LLEGA = [1180, 1790, 2400], SALE = [1580, 2190, 2930]; // el visor fija 3 pares de bases
  var DESTINOS = [-0.27, -0.02, 0.25];                       // dónde busca, en fracción del largo

  var ALFA_CAPA = new Float32Array(CAPAS);  // opacidad de cada capa, de la más lejana a la más cercana
  var activos = new WeakMap();              // lienzo -> función que detiene lo que esté corriendo en él
  var memoria = new WeakMap();              // lienzo -> { giro, pares, escena } para que ambient continúe la intro

  (function () {
    for (var c = 0; c < CAPAS; c++) {
      var f = F_LEJOS - (c + 0.5) * (F_LEJOS - F_CERCA) / CAPAS;
      ALFA_CAPA[c] = f > 0 ? 1 - 0.6 * Math.min(1, f / 1.5) : 1 - 0.45 * Math.min(1, -f / 1.1);
    }
  })();

  // ---------- utilidades ----------
  function limitar(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function mezclar(a, b, k) { return a + (b - a) * k; }
  function suave(a, b, x) { var k = limitar((x - a) / (b - a)); return k * k * (3 - 2 * k); }
  function cubica(k) { return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(2 - 2 * k, 3) / 2; }

  // Generador pseudoaleatorio con semilla (mulberry32): cada ejecución es reproducible.
  function aleatorio(semilla) {
    var s = semilla >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) | 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Ángulo de giro acumulado de la hélice a los t ms del guion.
  function giroEn(t) {
    var s = t / 1000;
    return GIRO_FIN * s + (GIRO_INI - GIRO_FIN) * GIRO_TAU * (1 - Math.exp(-s / GIRO_TAU));
  }

  function sinMovimiento(opciones) {
    return !!opciones.reducedMotion ||
      !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function pantallaChica() { return Math.min(global.innerWidth || 1280, global.innerHeight || 720) < 600; }

  // ---------- escena: partículas de la hélice ----------
  function crearEscena(canvas, total, semilla) {
    var azar = aleatorio(semilla == null ? 20241 : semilla);
    var porPar = Math.max(6, 2 * Math.round(total * 0.18 / N_PARES));   // partículas por peldaño
    var polvo = Math.round(total * 0.022);
    var porHebra = Math.floor((total - N_PARES * porPar - polvo) / 2);
    var finas = porHebra - N_PARES, n = 2 * porHebra + N_PARES * porPar + polvo;
    var i = 0, h, j, m, p, u, ang, borde, halo, s, r, a, x;
    var E = {
      canvas: canvas, ctx: canvas.getContext('2d'), n: n, grano: 1.3 * Math.pow(1760 / n, 0.25), w: 1, h: 1, dpr: 1, escala: 1, inclinacion: 0, apaisado: 1,
      tx: new Float32Array(n), ty: new Float32Array(n), tz: new Float32Array(n),   // sitio en la hélice
      ox: new Float32Array(n), oy: new Float32Array(n), oz: new Float32Array(n),   // dispersión inicial
      ret: new Float32Array(n), tam: new Float32Array(n), col: new Uint8Array(n), par: new Int16Array(n),
      sx: new Float32Array(n), sy: new Float32Array(n), sr: new Float32Array(n),   // proyección en pantalla
      cubo: new Uint8Array(n), orden: new Uint16Array(n),
      cuenta: new Uint16Array(CUBOS + 1), cursor: new Uint16Array(CUBOS),
      letras: new Uint8Array(N_PARES), luz: new Float32Array(N_PARES), brillo: new Float32Array(N_PARES),
      canto: new Float32Array(N_PARES),
      colores: POR_DEFECTO.slice(),
      // estado de la vista; lo rellenan el guion de la intro o el modo ambiente
      v: { giro: 0, camX: 0, zoom: 1, guinada: GUINADA_FINAL, ens: 2, alfa: 1,
           visorX: 0, visorAlfa: 0, cierre: 0, pulso: 1, etiq: -1, etiqAlfa: 0 }
    };

    function poner(px, py, pz, color, par, tam) {
      E.tx[i] = px; E.ty[i] = py; E.tz[i] = pz; E.col[i] = color; E.par[i] = par; E.tam[i] = tam;
      a = azar() * TAU; r = 1.6 + azar() * 5.4;                // de dónde llega volando
      E.ox[i] = (azar() - 0.5) * 6; E.oy[i] = Math.cos(a) * r; E.oz[i] = Math.sin(a) * r * 0.75;
      E.ret[i] = 0.34 * Math.min(1, Math.abs(px) / (LARGO / 2)) + 0.28 * azar(); // retraso: del centro a los extremos
      i++;
    }

    // Dos hebras azúcar-fosfato: una cuenta por nucleótido, una línea fina y regular de puntos
    // y, cada cinco, una mota de halo algo más suelta.
    for (h = 0; h < 2; h++) {
      for (j = 0; j < porHebra; j++) {
        m = j - N_PARES; halo = m >= 0 && m % 5 === 4;
        u = m < 0 ? (j + 0.5) / N_PARES : (m + 0.25 + 0.5 * azar()) / finas;
        ang = u * VUELTAS * TAU + h * Math.PI;
        borde = suave(0.41, 0.5, Math.abs(u - 0.5));           // los extremos se deshacen en partículas
        s = m < 0 ? 0 : (halo ? 0.1 : 0.018) * (1 + 8 * borde);
        poner((u - 0.5) * LARGO + (azar() + azar() - 1) * s,
              Math.cos(ang) * RADIO + (azar() + azar() - 1) * s,
              Math.sin(ang) * RADIO + (azar() + azar() - 1) * s,
              h, m < 0 ? j : -1,
              (m < 0 ? 1.5 : halo ? 0.55 : 0.85 + 0.2 * azar()) * (1 - 0.55 * borde));
      }
    }
    // Peldaños: cada par son dos bases (dos medias varillas) separadas por un pequeño hueco central.
    for (p = 0; p < N_PARES; p++) {
      u = (p + 0.5) / N_PARES; ang = u * VUELTAS * TAU; x = (u - 0.5) * LARGO;
      borde = suave(0.41, 0.5, Math.abs(u - 0.5));
      E.letras[p] = Math.floor(azar() * 4);
      for (j = 0; j < porPar; j++) {
        r = (j < porPar / 2 ? 1 : -1) * (0.12 + 0.74 * ((j % (porPar / 2)) + 0.5) / (porPar / 2));
        poner(x, Math.cos(ang) * r, Math.sin(ang) * r, 2, p, (porPar < 12 ? 1.05 : 0.9) * (1 - 0.5 * borde));
      }
    }
    // Motas sueltas alrededor: dan escala y profundidad de campo.
    for (j = 0; j < polvo; j++) {
      a = azar() * TAU; r = 1.7 + azar() * 2.6;
      poner((azar() - 0.5) * LARGO * 1.2, Math.cos(a) * r, Math.sin(a) * r, 1, -1, 0.4 + 0.4 * azar());
    }
    return E;
  }

  // Ajusta el búfer al tamaño CSS x min(dpr, 2) y recalcula el encuadre final.
  function medir(E) {
    var c = E.canvas, dpr = Math.min(global.devicePixelRatio || 1, 2);
    var w = c.clientWidth || 300, h = c.clientHeight || 150, ci, si;
    var bw = Math.max(1, Math.round(w * dpr)), bh = Math.max(1, Math.round(h * dpr));
    var cambio = c.width !== bw || c.height !== bh;
    if (cambio) { c.width = bw; c.height = bh; }             // (asignar el tamaño borra el lienzo)
    E.w = w; E.h = h; E.dpr = dpr;
    E.apaisado = limitar((w / h - 0.75) / 0.45);                        // 0 = retrato, 1 = apaisado
    E.inclinacion = mezclar(Math.PI / 2 - 0.2, -0.11, E.apaisado);      // casi vertical / casi horizontal
    ci = Math.abs(Math.cos(E.inclinacion)); si = Math.abs(Math.sin(E.inclinacion));
    E.escala = Math.min(0.72 * w / (LARGO * ci + 2 * si), 0.74 * h / (LARGO * si + 2 * ci)); // px por nm
    return cambio;
  }

  function leerColores(E) {
    var estilo = global.getComputedStyle(E.canvas), k, valor;
    for (k = 0; k < VARIABLES.length; k++) {
      valor = estilo.getPropertyValue(VARIABLES[k]).trim();
      E.colores[k] = valor || POR_DEFECTO[k];
    }
  }

  // ---------- dibujo de un fotograma ----------
  function pintar(E, limpiar) {
    var ctx = E.ctx, v = E.v, n = E.n, i, b, c, k, a, p, x, y, z, w, f, r, fin;
    var cg = Math.cos(v.giro), sg = Math.sin(v.giro), cq = Math.cos(v.guinada), sq = Math.sin(v.guinada);
    var ci = Math.cos(E.inclinacion), si = Math.sin(E.inclinacion);
    var esc = E.escala * v.zoom, mx = E.w / 2, my = E.h / 2;
    var grosor = Math.min(1.5, Math.max(0.85, E.escala / 67)) * E.grano * Math.pow(v.zoom, 0.4);
    var cuenta = E.cuenta, cursor = E.cursor, orden = E.orden, cubo = E.cubo, sx = E.sx, sy = E.sy, sr = E.sr;

    ctx.setTransform(E.dpr, 0, 0, E.dpr, 0, 0);
    if (limpiar) ctx.clearRect(0, 0, E.w, E.h);
    cuenta.fill(0);
    // Un peldaño visto casi de canto amontona sus puntos: se afinan para que no formen un borrón.
    for (b = 0; b < N_PARES; b++) E.canto[b] = 0.55 + 0.45 * Math.abs(Math.cos((b + 0.5) / N_PARES * VUELTAS * TAU + v.giro));

    for (i = 0; i < n; i++) {
      x = E.tx[i]; y = E.ty[i]; z = E.tz[i]; k = 0;
      if (v.ens < 1) {                                   // ensamblaje: llega en espiral a su sitio
        k = 1 - cubica(limitar((v.ens - E.ret[i]) / 0.38));
        if (k > 0) {
          a = k * 2.6; c = Math.cos(a); w = Math.sin(a);
          x += E.ox[i] * k; y += (E.oy[i] * c - E.oz[i] * w) * k; z += (E.oy[i] * w + E.oz[i] * c) * k;
        }
      }
      w = y * cg - z * sg; z = y * sg + z * cg; y = w;   // giro de la hélice sobre su eje
      x -= v.camX;                                       // travelling de la cámara a lo largo del eje
      w = x * cq + z * sq; z = z * cq - x * sq; x = w;   // guiñada: un extremo se aleja del objetivo
      p = DIST / Math.max(6, DIST + z);                  // perspectiva
      w = x * p * esc; y = y * p * esc;
      x = mx + w * ci - y * si; y = my + w * si + y * ci; // inclinación en pantalla
      if (x < -12 || y < -12 || x > E.w + 12 || y > E.h + 12) { cubo[i] = 255; continue; }
      f = (z - Z_FOCO) / Z_RANGO;                        // profundidad de campo
      r = grosor * E.tam[i] * p * (f < 0 ? 1 + 0.5 * Math.min(1.2, -f) : 1 - 0.22 * Math.min(1, f)) * (1 - 0.3 * k);
      c = E.col[i]; b = E.par[i];
      if (c === 2) r *= E.canto[b];
      if (b >= 0 && E.luz[b] > 0.5) { c = 3; r *= 1.15 + 0.45 * E.brillo[b]; } // par hallado: color de acento
      b = Math.floor((F_LEJOS - f) / (F_LEJOS - F_CERCA) * CAPAS);
      b = (b < 0 ? 0 : b >= CAPAS ? CAPAS - 1 : b) * 4 + c;
      sx[i] = x; sy[i] = y; sr[i] = r; cubo[i] = b; cuenta[b + 1]++;
    }
    // Ordenación por conteo: de lejos a cerca y, dentro de cada capa, por color (un fill por lote).
    for (b = 0; b < CUBOS; b++) { cuenta[b + 1] += cuenta[b]; cursor[b] = cuenta[b]; }
    for (i = 0; i < n; i++) if (cubo[i] !== 255) orden[cursor[cubo[i]]++] = i;
    for (b = 0; b < CUBOS; b++) {
      i = cuenta[b]; fin = cuenta[b + 1];
      if (i === fin) continue;
      c = b & 3; a = ALFA_CAPA[b >> 2];
      if (c === 3) a = 0.65 + 0.35 * a; else if (c === 2) a = 0.5 + 0.5 * a;
      ctx.globalAlpha = a * v.alfa; ctx.fillStyle = E.colores[c];
      ctx.beginPath();
      for (; i < fin; i++) {
        k = orden[i]; r = sr[k];
        if (r < 0.8) ctx.rect(sx[k] - r, sy[k] - r, r * 2, r * 2);
        else { ctx.moveTo(sx[k] + r, sy[k]); ctx.arc(sx[k], sy[k], r, 0, TAU); }
      }
      ctx.fill();
    }
    if (v.visorAlfa * v.alfa > 0.01) pintarVisor(E, esc, mx, my, ci, si, cq, sq);
    ctx.globalAlpha = 1;
  }

  // Visor circular con marcas de retícula y, al fijar un par, su etiqueta con línea guía.
  function pintarVisor(E, esc, mx, my, ci, si, cq, sq) {
    var ctx = E.ctx, v = E.v, q, a, r, dx, dy, lado, tx, ty;
    var x = v.visorX - v.camX, p = DIST / (DIST - x * sq);
    var X = mx + x * cq * p * esc * ci, Y = my + x * cq * p * esc * si;
    r = RADIO * esc * p * mezclar(1.7, 1.42, v.cierre);
    ctx.strokeStyle = E.colores[3]; ctx.lineWidth = 1;
    ctx.globalAlpha = v.visorAlfa * v.alfa * mezclar(0.5, 1, v.cierre);
    ctx.beginPath();
    ctx.arc(X, Y, r, 0, TAU);
    for (q = 0; q < 4; q++) {                              // marcas N, E, S, O
      dx = Math.cos(q * TAU / 4); dy = Math.sin(q * TAU / 4);
      ctx.moveTo(X + dx * (r - 5), Y + dy * (r - 5)); ctx.lineTo(X + dx * (r + 9), Y + dy * (r + 9));
    }
    ctx.stroke();
    if (v.pulso < 1) {                                     // eco breve al fijar
      ctx.globalAlpha = v.visorAlfa * v.alfa * 0.4 * (1 - v.pulso);
      ctx.beginPath(); ctx.arc(X, Y, r * (1 + 0.16 * v.pulso), 0, TAU); ctx.stroke();
    }
    if (v.etiq < 0 || v.etiqAlfa < 0.01) return;
    a = mezclar(-0.42, -1.2, E.apaisado);                  // retrato: a la derecha; apaisado: hacia arriba
    dx = Math.cos(a); dy = Math.sin(a);
    lado = X + dx * (r + 24) + 84 > E.w ? -1 : 1;          // si no cabe a la derecha, se refleja
    dx *= lado;
    q = limitar(v.etiqAlfa * 2); a = limitar(v.etiqAlfa * 2 - 1);
    tx = X + dx * (r + 24 * q); ty = Y + dy * (r + 24 * q);
    ctx.globalAlpha = v.visorAlfa * v.alfa;
    ctx.fillStyle = E.colores[3];
    ctx.beginPath(); ctx.arc(X + dx * r, Y + dy * r, 1.8, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.moveTo(X + dx * r, Y + dy * r); ctx.lineTo(tx, ty);
    if (a > 0) ctx.lineTo(tx + lado * 22 * a, ty);
    ctx.stroke();
    if (a <= 0) return;
    tx = Math.round(tx + lado * 30); ty = Math.round(ty);
    ctx.fillStyle = E.colores[4]; ctx.textAlign = lado > 0 ? 'left' : 'right'; ctx.textBaseline = 'middle';
    ctx.globalAlpha = v.visorAlfa * v.alfa * a;
    ctx.font = '600 13px ' + FUENTE;
    ctx.fillText(LETRAS[E.letras[v.etiq]], tx, ty);
    ctx.globalAlpha = v.visorAlfa * v.alfa * a * 0.6;
    ctx.font = '10px ' + FUENTE;
    ctx.fillText('par ' + (v.etiq + 1), tx, ty + 15);
  }

  // ---------- guion ----------
  // Elige los pares que el visor va a fijar: cerca de cada destino y, de entre ellos, el que
  // quedará de frente a la cámara (peldaño perpendicular a la mirada) justo durante la pausa.
  function prepararGuion(semilla) {
    var azar = aleatorio((semilla == null ? 20241 : semilla) ^ 0x9E3779B9);
    var G = { fase: azar() * TAU, pares: [], x: [] }, k, p, centro, mejor, nota, ang;
    for (k = 0; k < DESTINOS.length; k++) {
      centro = Math.round((DESTINOS[k] + 0.5) * N_PARES - 0.5); mejor = centro; nota = -1;
      for (p = centro - 2; p <= centro + 2; p++) {
        ang = (p + 0.5) / N_PARES * VUELTAS * TAU + G.fase + giroEn((LLEGA[k] + SALE[k]) / 2);
        if (Math.abs(Math.cos(ang)) > nota) { nota = Math.abs(Math.cos(ang)); mejor = p; }
      }
      G.pares.push(mejor); G.x.push(((mejor + 0.5) / N_PARES - 0.5) * LARGO);
    }
    return G;
  }

  // Posición del visor sobre el eje: se acerca al primer par y luego salta de par en par.
  function rutaVisor(G, t) {
    var x = G.x[0] - 2.4 * (1 - suave(200, LLEGA[0], t)), k;
    for (k = 1; k < G.x.length; k++) x += (G.x[k] - G.x[k - 1]) * suave(SALE[k - 1], LLEGA[k], t);
    return x;
  }

  // Estado de la intro a los t ms (función pura del tiempo: no acumula, así saltar es trivial).
  function guion(E, G, t) {
    var v = E.v, k, c, p, ultimo = SALE.length - 1;
    var atras = cubica(limitar((t - T_ATRAS) / (BASE - T_ATRAS)));       // retroceso final de la cámara
    v.giro = G.fase + giroEn(t);
    v.ens = t / T_ENSAMBLE;
    v.alfa = suave(0, 260, t);
    v.visorX = rutaVisor(G, t);
    v.visorAlfa = suave(860, 1040, t) * (1 - suave(SALE[ultimo], SALE[ultimo] + 200, t));
    v.cierre = 0; v.etiq = -1; v.etiqAlfa = 0; v.pulso = 1;
    for (k = 0; k < G.pares.length; k++) {
      p = G.pares[k];
      c = suave(LLEGA[k] - 50, LLEGA[k] + 90, t) * (1 - suave(SALE[k], SALE[k] + 130, t));
      E.luz[p] = suave(LLEGA[k] - 40, LLEGA[k] + 50, t);               // una vez hallado, queda encendido
      E.brillo[p] = c;
      if (c > v.cierre) {
        v.cierre = c; v.etiq = p; v.pulso = limitar((t - LLEGA[k]) / 300);
        v.etiqAlfa = suave(LLEGA[k] + 10, LLEGA[k] + 170, t) * (1 - suave(SALE[k], SALE[k] + 110, t));
      }
    }
    v.camX = SEGUIR * rutaVisor(G, t - 110) * (1 - atras);              // la cámara sigue al visor con retraso
    v.zoom = mezclar(mezclar(0.94, ZOOM_BUSCA, suave(100, 1150, t)) * (1 + 0.07 * v.cierre), 1, atras);
    v.guinada = mezclar(GUINADA_BUSCA, GUINADA_FINAL, atras);
  }

  // Prepara lienzo, colores y observadores comunes a intro y ambient.
  function montar(canvas, opciones, total) {
    var previo = activos.get(canvas), E, observador = null;
    if (previo) previo();
    E = crearEscena(canvas, total, opciones.seed);
    function alRedimensionar() { if (medir(E)) E.repintar(); }
    function alTema() { leerColores(E); E.repintar(); }
    E.repintar = function () { pintar(E, true); };
    medir(E); leerColores(E);
    if (global.ResizeObserver) { observador = new global.ResizeObserver(alRedimensionar); observador.observe(canvas); }
    else global.addEventListener('resize', alRedimensionar);
    document.addEventListener('ariadna:theme', alTema);
    E.soltar = function () {
      if (observador) observador.disconnect(); else global.removeEventListener('resize', alRedimensionar);
      document.removeEventListener('ariadna:theme', alTema);
    };
    return E;
  }

  // ---------- API: intro ----------
  function intro(canvas, opciones) {
    opciones = opciones || {};
    var E = montar(canvas, opciones, pantallaChica() ? 880 : 1760);
    var G = prepararGuion(opciones.seed);
    var ritmo = BASE / Math.max(600, opciones.duration || BASE);
    var inicio = 0, salto = -1, congelado = 0, cuadroId = 0, reloj = 0, hecho = false, resolver;
    var finished = new Promise(function (ok) { resolver = ok; });

    function terminar() {                    // deja el fotograma final, limpia y resuelve "finished"
      if (hecho) return;
      hecho = true;
      global.cancelAnimationFrame(cuadroId); global.clearTimeout(reloj);
      guion(E, G, BASE); pintar(E, true);
      memoria.set(canvas, { giro: E.v.giro, pares: G.pares, escena: E });
      E.soltar();
      if (activos.get(canvas) === terminar) activos.delete(canvas);
      resolver();
    }

    function cuadro(ahora) {
      var t, k;
      if (hecho) return;
      if (!inicio) inicio = ahora;
      t = (ahora - inicio) * ritmo;
      if (salto >= 0) {                      // saltar: fundido breve del fotograma actual al final
        if (salto === 0) { salto = ahora; congelado = t; }
        k = (ahora - salto) / T_SALTO;
        if (k >= 1) return terminar();
        guion(E, G, congelado); E.v.alfa *= 1 - k; pintar(E, true);
        guion(E, G, BASE); E.v.alfa = k; pintar(E, false);
      } else {
        if (t >= BASE) return terminar();
        guion(E, G, t); pintar(E, true);
      }
      cuadroId = global.requestAnimationFrame(cuadro);
    }

    activos.set(canvas, terminar);
    if (sinMovimiento(opciones)) {           // movimiento reducido: un único fotograma estático
      guion(E, G, BASE); pintar(E, true);
      reloj = global.setTimeout(terminar, 600);
    } else {
      guion(E, G, 0);
      cuadroId = global.requestAnimationFrame(cuadro);
      reloj = global.setTimeout(terminar, BASE / ritmo + 1500); // red de seguridad (pestaña en segundo plano)
    }
    return {
      finished: finished,
      skip: function () {
        if (hecho || salto >= 0) return;
        salto = 0;
        global.clearTimeout(reloj); reloj = global.setTimeout(terminar, T_SALTO + 40);
      }
    };
  }

  // ---------- API: ambient ----------
  function ambient(canvas, opciones) {
    opciones = opciones || {};
    var E = montar(canvas, opciones, pantallaChica() ? 880 : 900);
    var G = prepararGuion(opciones.seed);
    var recuerdo = memoria.get(canvas);      // si la intro acabó en este lienzo, se continúa desde ella
    var viejo = recuerdo && recuerdo.escena;
    var fase = recuerdo ? recuerdo.giro : G.fase + giroEn(BASE);
    var pares = recuerdo ? recuerdo.pares : G.pares;
    var cuadroId = 0, previo = 0, reloj = 0, enPantalla = true, detenido = false, vigia = null, k;

    function dibujar() {
      var relevo = viejo ? reloj / T_RELEVO : 1, v = E.v;
      v.giro = fase + GIRO_FIN * reloj / 1000;            // giro lento y una deriva casi imperceptible
      v.camX = 0.18 * Math.sin(reloj * 0.00021);
      v.guinada = GUINADA_FINAL + 0.04 * Math.sin(reloj * 0.00013);
      v.alfa = 1;
      if (relevo < 1) {                      // relevo: la escena densa de la intro se funde con la ligera
        viejo.v.giro = v.giro; viejo.v.camX = v.camX; viejo.v.guinada = v.guinada;
        viejo.v.alfa = 1 - relevo; v.alfa = relevo;
        pintar(viejo, true);
      } else viejo = null;
      pintar(E, !viejo);
    }
    function cuadro(ahora) {
      cuadroId = 0;
      if (previo) reloj += Math.min(64, ahora - previo);
      previo = ahora;
      dibujar();
      pedir();
    }
    function pedir() {                       // sólo anima si se ve: pestaña visible y lienzo en pantalla
      if (detenido || cuadroId) return;
      if (enPantalla && !document.hidden) cuadroId = global.requestAnimationFrame(cuadro);
      else previo = 0;
    }
    function stop() {
      if (detenido) return;
      detenido = true;
      global.cancelAnimationFrame(cuadroId);
      document.removeEventListener('visibilitychange', pedir);
      if (vigia) vigia.disconnect();
      E.soltar();
      memoria.set(canvas, { giro: E.v.giro, pares: pares, escena: null });
      if (activos.get(canvas) === stop) activos.delete(canvas);
    }

    for (k = 0; k < pares.length; k++) E.luz[pares[k]] = 1;
    activos.set(canvas, stop);
    memoria.delete(canvas);
    E.repintar = dibujar;
    if (viejo) { medir(viejo); leerColores(viejo); }
    if (sinMovimiento(opciones)) { viejo = null; dibujar(); }
    else {
      document.addEventListener('visibilitychange', pedir);
      if (global.IntersectionObserver) {
        vigia = new global.IntersectionObserver(function (entradas) {
          enPantalla = entradas[entradas.length - 1].isIntersecting;
          pedir();
        });
        vigia.observe(canvas);
      }
      dibujar(); pedir();
    }
    return { stop: stop };
  }

  global.AriadnaHelix = { intro: intro, ambient: ambient };
})(self);

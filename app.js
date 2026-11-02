(function () {
  // ---------- Color math (sRGB <-> OKLCH) ----------
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const toLin = c => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  const toSrgb = c => c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;

  function parseHex(s) {
    let h = s.trim().replace(/^#/, '');
    if (/^[0-9a-f]{3}$/i.test(h)) h = h.split('').map(x => x + x).join('');
    if (!/^[0-9a-f]{6}$/i.test(h)) return null;
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => v / 255);
  }
  const toHex = rgb => '#' + rgb.map(v => Math.round(clamp(v, 0, 1) * 255).toString(16).padStart(2, '0')).join('').toUpperCase();

  function rgbToOklab([r, g, b]) {
    r = toLin(r); g = toLin(g); b = toLin(b);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [
      0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
      1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
      0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
    ];
  }
  function oklabToRgbLin([L, a, b]) {
    let l = L + 0.3963377774 * a + 0.2158037573 * b;
    let m = L - 0.1055613458 * a - 0.0638541728 * b;
    let s = L - 0.0894841775 * a - 1.2914855480 * b;
    l = l * l * l; m = m * m * m; s = s * s * s;
    return [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
    ];
  }
  function rgbToOklch(rgb) {
    const [L, a, b] = rgbToOklab(rgb);
    const C = Math.hypot(a, b);
    let h = Math.atan2(b, a) * 180 / Math.PI; if (h < 0) h += 360;
    return { L, C, h: C < 1e-4 ? 0 : h };
  }
  function oklchToRgb({ L, C, h }) {
    const r = h * Math.PI / 180;
    return oklabToRgbLin([L, C * Math.cos(r), C * Math.sin(r)]).map(toSrgb);
  }
  const inGamut = rgb => rgb.every(v => v >= -0.0005 && v <= 1.0005);
  function clipToGamut(c) {
    let C = c.C;
    for (let i = 0; i < 60 && !inGamut(oklchToRgb({ L: c.L, C, h: c.h })); i++) C *= 0.94;
    return { L: c.L, C: Math.max(0, C), h: c.h };
  }
  const lum = rgb => { const [r, g, b] = rgb.map(toLin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const contrast = (a, b) => { const la = lum(a), lb = lum(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); };
  const angDist = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
  const fmtOk = c => `oklch(${(c.L * 100).toFixed(1)}% ${c.C.toFixed(3)} ${c.h.toFixed(1)})`;
  // Distancia perceptual (ΔE OK): ~0.02 apenas distinguible, <0.08 se leen como "el mismo color".
  const SIMILAR = 0.08;
  const toLab = c => { const r = c.h * Math.PI / 180; return [c.L, c.C * Math.cos(r), c.C * Math.sin(r)]; };
  const deltaE = (a, b) => { const [l1, a1, b1] = toLab(a), [l2, a2, b2] = toLab(b); return Math.hypot(l1 - l2, a1 - a2, b1 - b2); };
  const closest = (c, list) => list.reduce((best, o) => { const d = deltaE(c, o); return !best || d < best.d ? { hex: o.hex, name: o.name, d } : best; }, null);
  const mixHex = (a, b, t) => { const A = rgbToOklab(a), B = rgbToOklab(b); return toHex(oklabToRgbLin(A.map((v, i) => v + (B[i] - v) * t)).map(toSrgb)); };
  const label = o => o.name || o.hex;

  // ---------- Rules ----------
  const RULES = {
    mono: { name: 'Monocromática', offs: [0] },
    analog: { name: 'Análoga', offs: [-30, 0, 30] },
    comp: { name: 'Complementaria', offs: [0, 180] },
    split: { name: 'Complementaria dividida', offs: [0, 150, 210] },
    tri: { name: 'Triádica', offs: [0, 120, 240] },
    tetra: { name: 'Tetrádica', offs: [0, 90, 180, 270] }
  };
  const NEUTRAL_C = 0.03;
  const ACCENT_RATIO = 1.9; // por encima de esto un color destaca por croma
  const targetsFor = (rule, anchor) => RULES[rule].offs.map(o => (anchor + o + 360) % 360);

  function scoreRule(rule, anchor, chrom) {
    const t = targetsFor(rule, anchor);
    return chrom.reduce((s, c) => s + Math.min(...t.map(x => angDist(c.h, x))), 0);
  }
  function detect(chrom) {
    let best = null;
    for (const rule of Object.keys(RULES)) for (const a of chrom) {
      const sc = scoreRule(rule, a.h, chrom);
      const key = sc + RULES[rule].offs.length * 0.01; // tie-break: simpler rule wins
      if (!best || key < best.key) best = { rule, anchor: a.h, score: sc, key };
    }
    return best;
  }

  // ---------- Suggestions ----------
  function fixContrast(c, bgRgb, min) {
    // Move L away from the background until contrast is met; return the closest fix.
    const bgL = rgbToOklch(bgRgb).L;
    const dir = c.L >= bgL ? 1 : -1;
    const tryDir = d => {
      for (let L = c.L; L >= 0 && L <= 1; L += d * 0.005) {
        const cand = clipToGamut({ L, C: c.C, h: c.h });
        if (contrast(oklchToRgb(cand), bgRgb) >= min) return cand;
      }
      return null;
    };
    return tryDir(dir) || tryDir(-dir);
  }

  // ---------- Corridas (tints/shades) ----------
  // 11 pasos (50–950) en OKLCH. El base NO se fuerza al 500: aterriza en el
  // escalón cuya luz canónica tiene más cerca (un color oscuro vive en 700, uno
  // claro en 200) y la corrida se tiende desde ahí hacia las puntas. Así las
  // escalas quedan homogéneas entre sí y los extremos siempre llegan igual de
  // claro / oscuro. Tono constante salvo el giro voluntario (ht / hs) y croma
  // que se relaja hacia las puntas para no dar tints lavados ni shades sucios.
  const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
  const L_CANON = { 50: 0.985, 100: 0.94, 200: 0.87, 300: 0.79, 400: 0.71, 500: 0.62, 600: 0.53, 700: 0.45, 800: 0.37, 900: 0.29, 950: 0.22 };
  const L_TINT = L_CANON[50], L_SHADE = L_CANON[950];
  function homeStep(c) {
    // Los extremos quedan reservados: un base nunca aterriza en 50 ni en 950,
    // para que siempre haya corrida hacia ambos lados.
    return STEPS.slice(1, -1).reduce((best, k) => Math.abs(L_CANON[k] - c.L) < Math.abs(L_CANON[best] - c.L) ? k : best, 500);
  }
  function ramp(c, o) {
    const home = homeStep(c), Lh = L_CANON[home];
    return STEPS.map(k => {
      if (k === home) return { k, c: { L: c.L, C: c.C, h: c.h }, base: true };
      const tint = k < home;
      // t: 0 en el base, 1 en la punta, siguiendo las proporciones canónicas.
      const t = tint ? (L_CANON[k] - Lh) / (L_TINT - Lh) : (Lh - L_CANON[k]) / (Lh - L_SHADE);
      const L = c.L + ((tint ? L_TINT : L_SHADE) - c.L) * t;
      const C = c.C * (1 - (1 - o.cx) * t * (tint ? 1 : 0.7));
      const h = (c.h + (tint ? o.ht : o.hs) * t + 360) % 360;
      return { k, c: clipToGamut({ L, C, h }) };
    });
  }

  // ---------- UI ----------
  const $ = id => document.getElementById(id);
  const els = { colors: $('colors'), bg: $('bg'), bgSw: $('bgSw'), rule: $('rule'), tol: $('tol'), tolVal: $('tolVal'), wcag: $('wcag'), ht: $('ht'), htVal: $('htVal'), hs: $('hs'), hsVal: $('hsVal'), cx: $('cx'), cxVal: $('cxVal'), summary: $('summary'), cards: $('cards'), wheel: $('wheel'), css: $('css'), toast: $('toast') };
  const DEFAULT = { colors: '#C9A96E arena\n#8A9A7B salvia\n#F2E8DC crema\n#3B3A36 carbón\n#2F6BB0 intruso', bg: '#F2E8DC' };
  // Nombre de token: minúsculas sin acentos, espacios a guiones. Vacío = sin nombre.
  const slug = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const tokenName = (r, i) => r.name || 'color-' + (i + 1);
  const esc = s => s.replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));

  function toast(msg) { els.toast.textContent = msg; els.toast.classList.add('show'); setTimeout(() => els.toast.classList.remove('show'), 1400); }
  function copy(text) {
    navigator.clipboard.writeText(text).then(() => toast('Copiado')).catch(() => {
      const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); toast('Copiado'); } catch (e) { toast('No se pudo copiar'); }
      ta.remove();
    });
  }

  const lineOf = c => c.hex + (c.name ? ' ' + c.name : '') + (c.pin ? ' *' : '') + (c.surf ? ' @' : '');
  function readPalette() {
    // Cada entrada (línea, coma o punto y coma) es un hex con nombre opcional: "#C9A96E arena".
    // Varios hex seguidos en una entrada siguen valiendo; el texto se pega al hex anterior.
    const out = []; const bad = []; const seen = {};
    const push = (c, words) => {
      if (!c) return;
      let name = slug(words.join(' '));
      if (name) { seen[name] = (seen[name] || 0) + 1; if (seen[name] > 1) name += '-' + seen[name]; }
      out.push({ ...c, name });
    };
    els.colors.value.split(/[\n,;]+/).forEach(entry => {
      let cur = null, words = [];
      entry.split(/\s+/).filter(Boolean).forEach(tok => {
        const rgb = parseHex(tok);
        if (rgb) { push(cur, words); cur = { src: tok, hex: toHex(rgb), rgb, ...rgbToOklch(rgb), pin: false, surf: false }; words = []; }
        else if (cur && tok === '*') cur.pin = true;
        else if (cur && tok === '@') cur.surf = true;
        else if (cur) words.push(tok);
        else bad.push(tok);
      });
      push(cur, words);
    });
    return { out, bad };
  }

  function analyze() {
    const { out: colors, bad } = readPalette();
    const bgRgb = parseHex(els.bg.value) || parseHex(DEFAULT.bg);
    els.bgSw.style.background = toHex(bgRgb);
    const tol = +els.tol.value; const minC = +els.wcag.value;
    const ro = { ht: +els.ht.value, hs: +els.hs.value, cx: +els.cx.value / 100 };
    els.tolVal.textContent = tol + '°';
    els.htVal.textContent = (ro.ht > 0 ? '+' : '') + ro.ht + '°';
    els.hsVal.textContent = (ro.hs > 0 ? '+' : '') + ro.hs + '°';
    els.cxVal.textContent = els.cx.value + '%';
    try { localStorage.setItem('afinador', JSON.stringify({ colors: els.colors.value, bg: els.bg.value, rule: els.rule.value, tol, wcag: minC, ht: ro.ht, hs: ro.hs, cx: +els.cx.value, sel: selected })); } catch (e) { }
    // Permalink: el hash siempre refleja la paleta analizada (replaceState no ensucia el historial).
    try {
      const share = new URLSearchParams({ c: colors.map(c => c.hex.slice(1) + (c.name ? ':' + c.name : '') + (c.pin ? '*' : '') + (c.surf ? '@' : '')).join(','), bg: toHex(bgRgb).slice(1), r: els.rule.value, t: tol, w: els.wcag.value, ht: ro.ht, hs: ro.hs, cx: els.cx.value });
      if (selected) share.set('sel', selected.slice(1));
      history.replaceState(null, '', colors.length ? '#' + share : location.pathname + location.search);
    } catch (e) { }

    if (selected && !colors.some(c => c.hex === selected)) selected = null;
    // Superficies: colores marcados con "@" (light, dark…). Cada color pasa
    // contraste si lo cumple sobre AL MENOS una superficie; se reporta sobre
    // cuál. Sin superficies declaradas, el campo "Fondo" es la única.
    const declared = colors.filter(c => c.surf);
    const surfaces = declared.length ? declared : [{ hex: toHex(bgRgb), rgb: bgRgb, name: '', fallback: true }];
    const chrom = colors.filter(c => c.C >= NEUTRAL_C);
    // Ancla: el color fijado con "*" manda. Define el tono 0° de la regla y
    // nunca recibe propuestas de tono; los demás se acomodan respecto a él.
    const pinned = chrom.find(c => c.pin) || null;
    let rule = els.rule.value, anchor = chrom[0] ? chrom[0].h : 0, detected = false;
    if (pinned) {
      anchor = pinned.h;
      if (rule === 'auto') {
        // Con ancla fija se elige la regla que mejor explica al resto desde ese tono.
        let best = null;
        for (const rk of Object.keys(RULES)) { const sc = scoreRule(rk, anchor, chrom) + RULES[rk].offs.length * 0.01; if (!best || sc < best.sc) best = { sc, rk }; }
        rule = best.rk; detected = true;
      }
    } else if (rule === 'auto') {
      const d = chrom.length ? detect(chrom) : { rule: 'mono', anchor: 0 };
      rule = d.rule; anchor = d.anchor; detected = true;
    } else if (chrom.length) {
      // With a fixed rule, pick the anchor that fits the palette best.
      let best = null;
      for (const a of chrom) { const sc = scoreRule(rule, a.h, chrom); if (!best || sc < best.sc) best = { sc, a: a.h }; }
      anchor = best.a;
    }
    const targets = chrom.length ? targetsFor(rule, anchor) : [];
    const cMed = chrom.length ? [...chrom].sort((a, b) => a.C - b.C)[Math.floor(chrom.length / 2)].C : 0;
    // Acentos: una paleta con un color vivo y soportes apagados es una estructura
    // válida (acento + soporte), no una falla de croma. Si pocos colores (≤ un
    // tercio de los cromáticos) destacan por encima de 1.9× la mediana, se les
    // reconoce el rol de acento en vez de arrastrarlos a la mediana.
    const standouts = chrom.filter(c => cMed && c.C / cMed > ACCENT_RATIO);
    const accents = standouts.length && standouts.length <= Math.max(1, Math.floor(chrom.length / 3)) ? new Set(standouts.map(c => c.hex)) : new Set();

    const results = colors.map(c => {
      const neutral = c.C < NEUTRAL_C;
      let nearest = null, dev = 0;
      if (!neutral && targets.length) { nearest = targets.reduce((p, t) => angDist(c.h, t) < angDist(c.h, p) ? t : p, targets[0]); dev = angDist(c.h, nearest); }
      if (c.pin && !neutral) dev = 0;
      const hueOk = neutral || dev <= tol;
      const chromaRatio = neutral || !cMed ? 1 : c.C / cMed;
      const accent = accents.has(c.hex);
      const chromaWarn = !neutral && !accent && (chromaRatio > ACCENT_RATIO || chromaRatio < 0.45);
      const onSurf = surfaces.filter(sf => sf.hex !== c.hex).map(sf => { const v = contrast(c.rgb, sf.rgb); return { sf, cr: v, ok: v >= minC }; }).sort((a, b) => b.cr - a.cr);
      const best = onSurf[0] || null;
      const cr = best ? best.cr : Infinity;
      const crOk = !best || best.ok;
      const isBg = !!c.surf || (surfaces.length === 1 && c.hex === surfaces[0].hex);
      const surfRgb = best ? best.sf.rgb : bgRgb;
      const fail = !hueOk || (!crOk && !isBg);
      const others = colors.filter(o => o !== c);
      const sugg = []; const alt = [];
      if (fail) {
        const h = hueOk ? c.h : nearest;
        const s1 = clipToGamut({ L: c.L, C: c.C, h });
        if (!hueOk) sugg.push({ t: 'Tono corregido', why: `Gira ${dev.toFixed(0)}° hasta ${nearest.toFixed(0)}°; conserva luz y croma.`, c: s1 });
        const s2 = fixContrast(s1, surfRgb, minC);
        if (s2 && (!crOk || !hueOk)) {
          const r2 = contrast(oklchToRgb(s2), surfRgb);
          sugg.push({ t: 'Tono + contraste', why: `Ajusta la luz hasta ${r2.toFixed(2)}:1 sobre ${best && best.sf.name ? best.sf.name : 'el fondo'}.`, c: s2 });
        }
        if (!hueOk && cMed) sugg.push({ t: 'Croma de la paleta', why: `Lleva el croma a la mediana (${cMed.toFixed(3)}) para que pese igual que el resto.`, c: clipToGamut({ L: c.L, C: cMed, h }) });
        // Si el sustituto cercano se confunde con otro color, ofrece una versión separada en luz.
        const twin = closest(s1, others);
        if (twin && twin.d < SIMILAR) {
          const dir = c.L >= 0.5 ? -1 : 1;
          const s4 = clipToGamut({ L: clamp(c.L + dir * 0.18, 0.08, 0.96), C: c.C, h });
          sugg.push({ t: 'Mismo tono, otra luz', why: `El tono corregido se parece a ${label(twin)}; esta versión se separa en luminosidad.`, c: s4 });
        }
      } else if (chromaWarn && cMed) {
        sugg.push({ t: 'Croma de la paleta', why: `Hoy pesa ${chromaRatio.toFixed(1)}× la mediana; esto lo iguala.`, c: clipToGamut({ L: c.L, C: cMed, h: c.h }) });
      } else if (accent && cMed) {
        // Al acento no se le baja el croma: se le ofrece un compañero calmado
        // para superficies grandes (fondos, hovers) y el vivo queda para CTA.
        const calm = clipToGamut({ L: c.L, C: Math.max(cMed * 1.4, c.C * 0.45), h: c.h });
        sugg.push({ t: 'Compañero calmado', why: `Extra, no reemplazo: misma familia a ${(calm.C / cMed).toFixed(1)}× la mediana para áreas grandes; el acento vivo queda para botones y detalles.`, c: calm });
      }
      // Otras posiciones de la regla: huecos que ningún color ocupa primero, luego los ocupados.
      if (!neutral && targets.length > 1) {
        targets.filter(t => t !== nearest).forEach(t => {
          const occ = others.filter(o => o.C >= NEUTRAL_C && angDist(o.h, t) <= tol);
          alt.push({ t: `Posición ${t.toFixed(0)}°`, free: !occ.length, why: occ.length ? `Ocupado por ${occ.map(label).join(', ')}` : 'Hueco libre en la regla', c: clipToGamut({ L: c.L, C: c.C, h: t }) });
        });
        alt.sort((a, b) => (b.free - a.free));
      }
      // Marca parecidos en todas las propuestas.
      [...sugg, ...alt].forEach(s => { const tw = closest(s.c, others); s.twin = tw && tw.d < SIMILAR ? tw : null; });
      return { ...c, neutral, nearest, dev, hueOk, chromaRatio, chromaWarn, accent, pinned: !!c.pin, surface: !!c.surf, onSurf, cr, crOk, isBg, fail, sugg, alt, ramp: ramp(c, ro) };
    });

    render(results, { rule, anchor, detected, targets, bad, bgRgb, minC, cMed, pinned, surfaces: declared });
    applyTheme(bgRgb);
  }

  // ---------- Export (Figma / Tokens Studio) ----------
  // Figma pega SVG del portapapeles conservando los id como nombres de capa:
  // un grupo por color, un rect por paso (arena-500). Sin plugin ni API.
  function figmaSvg(res) {
    const S = 48, GAP = 8;
    const w = 11 * S + 10 * GAP;
    let y = 0; const rows = [];
    res.forEach((r, i) => {
      const n = tokenName(r, i);
      rows.push(`<g id="${n}">` + r.ramp.map((s, j) =>
        `<rect id="${n}-${s.k}" x="${j * (S + GAP)}" y="${y}" width="${S}" height="${S}" rx="6" fill="${toHex(oklchToRgb(s.c))}"/>`
      ).join('') + '</g>');
      y += S + GAP;
    });
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${y - GAP}" viewBox="0 0 ${w} ${y - GAP}">${rows.join('')}</svg>`;
  }
  // Formato Tokens Studio: un set "global" con grupos por color y los 11 pasos.
  function tokensJson(res) {
    const g = {};
    res.forEach((r, i) => {
      const o = {};
      r.ramp.forEach(s => { o[s.k] = { value: toHex(oklchToRgb(s.c)), type: 'color' }; });
      g[tokenName(r, i)] = o;
    });
    return JSON.stringify({ global: g }, null, 2);
  }

  let lastRes = null;
  let selected = null; // hex del color "probado" en la página
  // El fondo elegido pinta la página de verdad (también los paneles: nada de
  // blanco encima), y el tema claro/oscuro se decide por su luminosidad. Con un
  // color seleccionado, TODO el texto se vuelve de ese color —ese es el preview
  // de contraste—, el secundario como versión atenuada hacia el fondo, y los
  // acentos (botones, sliders, focus) lo acompañan.
  function applyTheme(bgRgb) {
    const root = document.documentElement;
    const bgHex = toHex(bgRgb);
    root.style.setProperty('--bg', bgHex);
    root.style.setProperty('--panel', bgHex);
    root.dataset.theme = rgbToOklch(bgRgb).L < 0.5 ? 'dark' : 'light';
    if (selected) {
      const rgb = parseHex(selected);
      root.style.setProperty('--fg', selected);
      root.style.setProperty('--muted', mixHex(rgb, bgRgb, 0.35));
      root.style.setProperty('--accent', selected);
      root.style.setProperty('--accent-ink', contrast(rgb, [1, 1, 1]) >= contrast(rgb, [0, 0, 0]) ? '#FFFFFF' : '#000000');
    } else {
      ['--fg', '--muted', '--accent', '--accent-ink'].forEach(p => root.style.removeProperty(p));
    }
  }
  function render(res, ctx) {
    lastRes = res;
    const fails = res.filter(r => r.fail).length;
    const warns = res.filter(r => !r.fail && r.chromaWarn).length;
    const hueDevs = res.filter(r => !r.neutral).map(r => r.dev);
    const avgDev = hueDevs.length ? hueDevs.reduce((a, b) => a + b, 0) / hueDevs.length : 0;
    els.summary.innerHTML = `
      <div class="stat"><span class="k">Regla</span><span class="v">${esc(RULES[ctx.rule].name)}</span><span class="s">${ctx.detected ? 'detectada' : 'fijada'} · ancla ${ctx.pinned ? label(ctx.pinned) + ' ★' : ctx.anchor.toFixed(0) + '°'}</span></div>
      <div class="stat"><span class="k">Veredicto</span><span class="v" style="color:${fails ? 'var(--bad)' : 'var(--ok)'}">${fails ? fails + (fails === 1 ? ' falla' : ' fallan') : 'Todo cuadra'}</span><span class="s">${warns ? warns + ' con aviso de croma' : res.length + ' colores evaluados'}</span></div>
      <div class="stat"><span class="k">Desvío medio</span><span class="v">${avgDev.toFixed(1)}°</span><span class="s">tolerancia ${els.tol.value}°</span></div>
      <div class="stat"><span class="k">${ctx.surfaces.length ? 'Superficies' : 'Fondo'}</span><span class="v ${ctx.surfaces.length ? '' : 'hex'}">${ctx.surfaces.length ? ctx.surfaces.map(label).map(esc).join(' · ') : toHex(ctx.bgRgb)}</span><span class="s">mínimo ${ctx.minC}:1${ctx.bad.length ? ' · ignorado: ' + esc(ctx.bad.join(', ')) : ''}</span></div>`;

    els.cards.innerHTML = res.map((r, i) => {
      const chips = [];
      if (r.pinned) chips.push(`<span class="chip accent">★ Ancla</span>`);
      if (r.neutral) chips.push(`<span class="chip neutral">Neutro · sin tono</span>`);
      else chips.push(`<span class="chip ${r.hueOk ? 'ok' : 'bad'}">Tono ${r.hueOk ? '✓' : '✗'} · Δ ${r.dev.toFixed(0)}° de ${r.nearest.toFixed(0)}°</span>`);
      if (!r.neutral) chips.push(r.accent ? `<span class="chip accent">Acento · ${r.chromaRatio.toFixed(1)}× mediana</span>` : `<span class="chip ${r.chromaWarn ? 'warn' : 'ok'}">Croma ${r.chromaRatio.toFixed(1)}× mediana</span>`);
      if (r.surface) chips.push(`<span class="chip accent">◼ Superficie</span>`);
      if (r.onSurf.length === 1 && r.onSurf[0].sf.fallback) chips.push(`<span class="chip ${r.crOk ? 'ok' : 'bad'}">Contraste ${r.cr.toFixed(2)}:1 ${r.crOk ? '✓' : '✗'}</span>`);
      else if (!r.onSurf.length) chips.push(`<span class="chip neutral">Es el fondo</span>`);
      else r.onSurf.forEach(o => chips.push(`<span class="chip ${o.ok ? 'ok' : (r.crOk || r.surface ? 'neutral' : 'bad')}" title="${esc(label(o.sf))} ${o.sf.hex}">sobre ${esc(label(o.sf))} ${o.cr.toFixed(2)}:1 ${o.ok ? '✓' : '✗'}</span>`));
      const opt = s => {
        const hex = toHex(oklchToRgb(s.c));
        const twin = s.twin ? `<span class="chip warn" style="margin-top:4px">Se parece a ${esc(label(s.twin))}</span>` : (s.free === true ? `<span class="chip ok" style="margin-top:4px">Libre</span>` : '');
        return `<div class="opt ${s.twin ? 'twin' : ''}"><div class="sw" style="background:${hex}"></div><div style="min-width:0"><div class="t">${esc(s.t)}</div><div class="hex">${hex}</div><div class="why">${esc(s.why)}</div>${twin}
          <div class="acts"><button class="small" data-apply="${i}" data-hex="${hex}">Aplicar</button><button class="small" data-copy="${hex}">Copiar</button></div></div></div>`;
      };
      const sugg = (r.sugg.length ? `<div class="sugg"><h4>${r.fail ? 'Sustitutos válidos' : 'Sugerencia'}</h4><div class="opts">${r.sugg.map(opt).join('')}</div></div>` : '')
        + (r.alt.length ? `<details class="alts" ${r.fail ? 'open' : ''}><summary>Otras posiciones de la regla (${r.alt.filter(a => a.free).length} libres)</summary><div class="opts" style="margin-top:8px">${r.alt.map(opt).join('')}</div></details>` : '');
      const n = tokenName(r, i);
      const strip = `<div class="ramp" role="group" aria-label="Corrida de ${esc(n)}">${r.ramp.map(s => {
        const hex = toHex(oklchToRgb(s.c));
        return `<button class="rstep ${s.base ? 'base' : ''}" style="background:${hex}" data-copy="${hex}" title="--${esc(n)}-${s.k} · ${hex}" aria-label="Copiar ${hex} (${esc(n)}-${s.k})"></button>`;
      }).join('')}</div>`;
      return `<article class="card ${r.fail ? 'fail' : ''}"><div class="sw selectable${selected === r.hex ? ' selected' : ''}" style="background:${r.hex}" data-sel="${r.hex}" role="button" tabindex="0" aria-pressed="${selected === r.hex}" title="${selected === r.hex ? 'Dejar de probarlo' : 'Probar este color en la página'}"></div><div class="meta">
        <div class="top">${r.name ? `<span class="name">${esc(r.name)}</span>` : ''}<span class="hex">${r.hex}</span><span class="okl">${fmtOk(r)}</span></div>
        <div class="chips">${chips.join('')}${r.neutral ? '' : `<button class="chip pinbtn" data-pin="${i}" aria-pressed="${r.pinned}" title="${r.pinned ? 'Quitar ancla' : 'Fijar como ancla: los demás se acomodan a este tono'}">${r.pinned ? 'Soltar ancla' : 'Fijar como ancla'}</button>`}<button class="chip pinbtn" data-surf="${i}" aria-pressed="${r.surface}" title="${r.surface ? 'Dejar de usarlo como superficie' : 'Marcar como superficie: los demás se miden sobre él'}">${r.surface ? 'Quitar superficie' : 'Usar como superficie'}</button></div>${strip}${sugg}</div></article>`;
    }).join('');

    drawWheel(res, ctx.targets);
    els.css.textContent = ':root {\n' + res.map((r, i) => {
      const n = tokenName(r, i);
      return [`  --${n}: ${fmtOk(r)}; /* ${r.hex}${r.fail ? ' · revisar' : ''} */`]
        .concat(r.ramp.map(s => `  --${n}-${s.k}: ${fmtOk(s.c)}; /* ${toHex(oklchToRgb(s.c))} */`))
        .join('\n');
    }).join('\n\n') + '\n}';
  }

  function drawWheel(res, targets) {
    const cx = 150, cy = 150, R = 118, maxC = Math.max(0.2, ...res.map(r => r.C));
    const pt = (h, rad) => { const a = h * Math.PI / 180; return [cx + rad * Math.cos(a), cy - rad * Math.sin(a)]; };
    let s = `<circle class="ring" cx="${cx}" cy="${cy}" r="${R}"/><circle class="ring" cx="${cx}" cy="${cy}" r="${R / 2}"/>`;
    for (let h = 0; h < 360; h += 30) {
      const [x1, y1] = pt(h, R - 5), [x2, y2] = pt(h, R + 5), [tx, ty] = pt(h, R + 16);
      s += `<line class="tick" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/><text x="${tx}" y="${ty + 3}" text-anchor="middle">${h}</text>`;
    }
    targets.forEach(t => { const [x, y] = pt(t, R); s += `<circle class="target" cx="${x}" cy="${y}" r="6"/>`; });
    res.forEach(r => {
      const rad = r.neutral ? 0 : clamp(r.C / maxC, 0.08, 1) * R;
      const [x, y] = pt(r.h, rad);
      if (r.neutral) return;
      if (!r.hueOk) { const [tx, ty] = pt(r.nearest, R); s += `<line class="link" x1="${x}" y1="${y}" x2="${tx}" y2="${ty}"/>`; }
      s += `<circle class="dot ${r.hueOk ? '' : 'bad'}" cx="${x}" cy="${y}" r="8" fill="${r.hex}"><title>${r.name ? esc(r.name) + ' · ' : ''}${r.hex} · ${r.h.toFixed(0)}°</title></circle>`;
    });
    els.wheel.innerHTML = s;
  }

  // ---------- Events ----------
  $('run').addEventListener('click', analyze);
  $('reset').addEventListener('click', () => { els.colors.value = DEFAULT.colors; els.bg.value = DEFAULT.bg; els.rule.value = 'auto'; els.tol.value = 12; els.wcag.value = '4.5'; els.ht.value = 0; els.hs.value = 0; els.cx.value = 35; analyze(); });
  ['rule', 'wcag', 'bg'].forEach(id => $(id).addEventListener('change', analyze));
  ['tol', 'ht', 'hs', 'cx'].forEach(id => $(id).addEventListener('input', analyze));
  els.colors.addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') analyze(); });
  $('copyCss').addEventListener('click', () => copy(els.css.textContent));
  $('copySvg').addEventListener('click', () => { if (lastRes && lastRes.length) copy(figmaSvg(lastRes)); });
  $('copyJson').addEventListener('click', () => { if (lastRes && lastRes.length) copy(tokensJson(lastRes)); });
  const toggleSel = hex => { selected = selected === hex ? null : hex; analyze(); };
  els.cards.addEventListener('click', e => {
    const sw = e.target.closest('[data-sel]');
    if (sw) { toggleSel(sw.dataset.sel); return; }
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.copy) copy(b.dataset.copy);
    if (b.dataset.surf !== undefined) {
      const idx = +b.dataset.surf; const { out } = readPalette();
      const on = !out[idx].surf;
      els.colors.value = out.map((c, i) => lineOf({ ...c, surf: i === idx ? on : c.surf })).join('\n');
      analyze(); toast(on ? 'Superficie: ' + label(out[idx]) : 'Ya no es superficie');
      return;
    }
    if (b.dataset.pin !== undefined) {
      const idx = +b.dataset.pin; const { out } = readPalette();
      const on = !out[idx].pin;
      els.colors.value = out.map((c, i) => lineOf({ ...c, pin: i === idx ? on : false })).join('\n');
      analyze(); toast(on ? 'Ancla: ' + label(out[idx]) : 'Ancla liberada');
      return;
    }
    if (b.dataset.apply !== undefined) {
      const idx = +b.dataset.apply; const { out } = readPalette();
      const lines = out.map((c, i) => lineOf({ ...c, hex: i === idx ? b.dataset.hex : c.hex }));
      els.colors.value = lines.join('\n'); analyze(); toast('Aplicado ' + b.dataset.hex);
    }
  });

  // ---------- Permalink ----------
  function stateFromHash() {
    if (location.hash.length < 2) return null;
    const p = new URLSearchParams(location.hash.slice(1));
    const lines = (p.get('c') || '').split(',').map(s => {
      const surf = s.endsWith('@'); if (surf) s = s.slice(0, -1);
      const pin = s.endsWith('*'); if (pin) s = s.slice(0, -1);
      const [hx, ...n] = s.split(':');
      const rgb = parseHex(hx); const name = slug(n.join(' '));
      return rgb && toHex(rgb) + (name ? ' ' + name : '') + (pin ? ' *' : '') + (surf ? ' @' : '');
    }).filter(Boolean);
    if (!lines.length) return null;
    const rule = p.get('r');
    return {
      colors: lines.join('\n'),
      bg: toHex(parseHex(p.get('bg') || '') || parseHex(DEFAULT.bg)),
      rule: rule === 'auto' || RULES[rule] ? rule : 'auto',
      tol: clamp(+p.get('t') || 12, 4, 30),
      wcag: ['3', '4.5', '7'].includes(p.get('w')) ? p.get('w') : '4.5',
      ht: clamp(+p.get('ht') || 0, -30, 30),
      hs: clamp(+p.get('hs') || 0, -30, 30),
      cx: p.get('cx') === null ? 35 : clamp(+p.get('cx') || 0, 0, 100),
      sel: parseHex(p.get('sel') || '') ? toHex(parseHex(p.get('sel'))) : null
    };
  }
  function applyState(s) { els.colors.value = s.colors; els.bg.value = s.bg; els.rule.value = s.rule; els.tol.value = s.tol; els.wcag.value = s.wcag; els.ht.value = s.ht; els.hs.value = s.hs; els.cx.value = s.cx; selected = s.sel || null; }
  window.addEventListener('hashchange', () => { const s = stateFromHash(); if (s) { applyState(s); analyze(); } });
  $('share').addEventListener('click', () => { analyze(); copy(location.href); });

  els.cards.addEventListener('keydown', e => {
    const sw = e.target.closest('[data-sel]');
    if (sw && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggleSel(sw.dataset.sel); }
  });

  const fromHash = stateFromHash();
  if (fromHash) applyState(fromHash);
  else try {
    const saved = JSON.parse(localStorage.getItem('afinador') || 'null');
    if (saved && saved.colors) { els.colors.value = saved.colors; els.bg.value = saved.bg || DEFAULT.bg; els.rule.value = saved.rule || 'auto'; els.tol.value = saved.tol || 12; els.wcag.value = String(saved.wcag || '4.5'); els.ht.value = saved.ht || 0; els.hs.value = saved.hs || 0; els.cx.value = saved.cx == null ? 35 : saved.cx; selected = saved.sel || null; }
  } catch (e) { }
  analyze();
})();

// Afinador de Paleta — lado Figma (sandbox). Lee y escribe variables de color
// con la convención del archivo: colección con variables `colors/{familia}/{paso}`
// en un modo. La capa semántica ({familia}, {familia}-tint, {familia}-shade) no
// se toca: como son alias a los pasos, se actualiza sola.
figma.showUI(__html__, { width: 1240, height: 860, themeColors: true });

const PREFIX = 'colors/';
const hexToRgb = hex => { const n = parseInt(hex.slice(1), 16); return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 }; };
const rgbToHex = c => '#' + [c.r, c.g, c.b].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('').toUpperCase();

// Solo colecciones que tengan variables de color, con su conteo.
async function listCollections() {
  const cols = await figma.variables.getLocalVariableCollectionsAsync();
  const vars = await figma.variables.getLocalVariablesAsync('COLOR');
  const count = {}; vars.forEach(v => { count[v.variableCollectionId] = (count[v.variableCollectionId] || 0) + 1; });
  return cols.filter(c => count[c.id]).map(c => ({ id: c.id, name: c.name, colorVars: count[c.id], modes: c.modes.map(m => ({ id: m.modeId, name: m.name })) }));
}

// Agrupa las variables COLOR de la colección en rampas `{familia}/{paso}`,
// con o sin grupo de prefijo (colors/primary/500 y primary/500 valen igual;
// opacity/* se ignora). Por familia devuelve el color base y, si la variable
// semántica `{familia}` existe y es alias a un paso de su rampa, ese paso
// como `home` para que el afinador no re-ancle el base por luz.
async function importPalette(collectionId, modeId) {
  const vars = await figma.variables.getLocalVariablesAsync('COLOR');
  const byName = {}; vars.forEach(v => { byName[v.name] = v; });
  const fam = {};
  for (const v of vars) {
    if (v.variableCollectionId !== collectionId) continue;
    const parts = v.name.split('/');
    if (parts.length < 2 || parts.includes('opacity')) continue;
    const step = +parts[parts.length - 1], name = parts[parts.length - 2];
    if (!STEPS.includes(step)) continue;
    (fam[name] = fam[name] || {})[step] = v;
  }
  const resolve = async (v) => {
    let val = v.valuesByMode[modeId] || Object.values(v.valuesByMode)[0];
    for (let i = 0; i < 8 && val && val.type === 'VARIABLE_ALIAS'; i++) {
      const t = await figma.variables.getVariableByIdAsync(val.id);
      if (!t) return null;
      val = t.valuesByMode[modeId] || Object.values(t.valuesByMode)[0];
    }
    return val && val.r !== undefined ? rgbToHex(val) : null;
  };
  const out = [];
  for (const name of Object.keys(fam)) {
    const sem = byName[name];
    const home = await aliasStep(sem, modeId, name);
    let hex = home !== null && fam[name][home] ? await resolve(fam[name][home]) : (sem ? await resolve(sem) : null);
    if (!hex && fam[name][500]) hex = await resolve(fam[name][500]);
    if (!hex) { const ks = Object.keys(fam[name]); hex = await resolve(fam[name][ks[Math.floor(ks.length / 2)]]); }
    if (hex) out.push({ name, hex, surf: /^(light|dark)$/.test(name), home });
  }
  return out;
}

const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
const stepIndex = k => STEPS.indexOf(+k);
const clampStep = i => STEPS[Math.max(0, Math.min(STEPS.length - 1, i))];

// Variantes de opacidad (convención CORE): colors/{familia}/opacity/{etiqueta}.
// Familias normales: etiquetas 0…100 con alfa etiqueta/100. `dark` usa las
// etiquetas de la rampa (50…950) con alfa lineal 0.10→1.00, más un 0 con
// alfa 0. El escalón 0 existe para casos como animaciones (fade desde/hacia
// el color sin cambiar de variable).
const opacityLabels = famName => famName === 'dark'
  ? [{ k: 0, a: 0 }].concat(STEPS.map((k, i) => ({ k, a: Math.round((0.10 + i * 0.09) * 100) / 100 })))
  : Array.from({ length: 11 }, (_, i) => ({ k: i * 10, a: i / 10 }));

// A qué paso apunta hoy un alias semántico ({familia}, -tint, -shade); null
// si no existe o no es alias a `…/{familia}/{paso}` (cualquier prefijo).
async function aliasStep(v, modeId, famName) {
  if (!v) return null;
  const val = v.valuesByMode[modeId] || Object.values(v.valuesByMode)[0];
  if (!val || val.type !== 'VARIABLE_ALIAS') return null;
  const t = await figma.variables.getVariableByIdAsync(val.id);
  if (!t) return null;
  const parts = t.name.split('/');
  const step = +parts[parts.length - 1];
  if (!STEPS.includes(step)) return null;
  if (famName && parts[parts.length - 2] !== famName) return null;
  return step;
}

// Escribe cada paso en su variable (creándola si falta) en el modo elegido y
// re-apunta los alias semánticos. Offsets: 'keep' conserva la distancia que
// cada -tint / -shade tenía respecto a su base anterior; un número los fija.
async function updateVariables(collectionId, modeId, families, createMissing, offsets) {
  const col = await figma.variables.getVariableCollectionByIdAsync(collectionId);
  if (!col) throw new Error('No encontré la colección.');
  const vars = await figma.variables.getLocalVariablesAsync('COLOR');
  const byName = {}; vars.forEach(v => { if (v.variableCollectionId === collectionId) byName[v.name] = v; });
  const all = {}; vars.forEach(v => { all[v.name] = v; });
  let updated = 0, created = 0, skipped = [], aliases = [], opacity = 0;
  for (const f of families) {
    // Distancias actuales (antes de tocar nada) para el modo 'keep'.
    const semBase = all[f.name], semTint = all[f.name + '-tint'], semShade = all[f.name + '-shade'];
    const oldBase = await aliasStep(semBase, modeId, f.name), oldTint = await aliasStep(semTint, modeId, f.name), oldShade = await aliasStep(semShade, modeId, f.name);
    // Prefijo real de la familia en la colección: si ya existe una rampa
    // `…/{familia}/{paso}` (con el grupo que sea), se escribe sobre ella en
    // vez de crear una paralela bajo colors/.
    let famPrefix = PREFIX + f.name + '/';
    for (const n of Object.keys(byName)) {
      const parts = n.split('/');
      if (parts.length >= 2 && parts[parts.length - 2] === f.name && STEPS.includes(+parts[parts.length - 1]) && !parts.includes('opacity')) { famPrefix = parts.slice(0, -1).join('/') + '/'; break; }
    }
    for (const s of f.steps) {
      const name = famPrefix + s.k;
      let v = byName[name];
      if (!v) {
        if (!createMissing) { skipped.push(name); continue; }
        v = figma.variables.createVariable(name, col, 'COLOR'); byName[name] = v; created++;
      } else updated++;
      v.setValueForMode(modeId, hexToRgb(s.hex));
    }
    // Variantes de opacidad: el color default de la corrida (el escalón donde
    // aterrizó el base, el mismo al que apunta el alias {familia}) replicado
    // con alfa creciente. Las existentes conservan su alfa; con "crear las que
    // falten" se completa el juego canónico.
    const homeK = f.home !== undefined ? f.home : 500;
    const baseStep = f.steps.find(s => +s.k === +homeK) || f.steps.find(s => +s.k === 500);
    if (baseStep) {
      const rgb = hexToRgb(baseStep.hex);
      const opPrefix = famPrefix + 'opacity/';
      const seen = {};
      for (const n of Object.keys(byName)) {
        if (!n.startsWith(opPrefix)) continue;
        const old = byName[n].valuesByMode[modeId];
        const a = old && typeof old === 'object' && old.a !== undefined ? old.a : 1;
        byName[n].setValueForMode(modeId, { r: rgb.r, g: rgb.g, b: rgb.b, a });
        seen[n.slice(opPrefix.length)] = true; opacity++;
      }
      if (createMissing) {
        for (const { k, a } of opacityLabels(f.name)) {
          if (seen[String(k)]) continue;
          const v = figma.variables.createVariable(opPrefix + k, col, 'COLOR');
          byName[opPrefix + k] = v;
          v.setValueForMode(modeId, { r: rgb.r, g: rgb.g, b: rgb.b, a });
          opacity++; created++;
        }
      }
    }
    // Alias semánticos: el base al escalón donde aterrizó; tint y shade a la
    // distancia elegida. Solo se re-apuntan los que ya existen.
    if (f.home === undefined) continue;
    const hi = stepIndex(f.home);
    const dist = (old, def, sign) => offsets === 'keep' && oldBase !== null && old !== null ? Math.abs(stepIndex(old) - stepIndex(oldBase)) || def : (+offsets || def);
    const point = (sem, k, labelName) => {
      const target = byName[famPrefix + k];
      if (!sem || !target) return;
      sem.setValueForMode(modeId, figma.variables.createVariableAlias(target));
      aliases.push(labelName + ' → ' + k);
    };
    point(semBase, f.home, f.name);
    point(semTint, clampStep(hi - dist(oldTint, 2)), f.name + '-tint');
    point(semShade, clampStep(hi + dist(oldShade, 2)), f.name + '-shade');
  }
  return { updated, created, skipped, aliases, opacity };
}

figma.ui.onmessage = async msg => {
  try {
    if (msg.type === 'collections') figma.ui.postMessage({ type: 'collections', collections: await listCollections() });
    else if (msg.type === 'import') figma.ui.postMessage({ type: 'palette', palette: await importPalette(msg.collectionId, msg.modeId) });
    else if (msg.type === 'update') {
      const r = await updateVariables(msg.collectionId, msg.modeId, msg.families, msg.createMissing, msg.offsets || 'keep');
      figma.ui.postMessage({ type: 'done', result: r });
      figma.notify(`Variables: ${r.updated} actualizadas, ${r.created} creadas${r.skipped.length ? ', ' + r.skipped.length + ' omitidas' : ''}; ${r.opacity} de opacidad; ${r.aliases.length} alias re-apuntados`);
    }
    else if (msg.type === 'close') figma.closePlugin();
  } catch (e) { figma.ui.postMessage({ type: 'error', message: String(e.message || e) }); }
};

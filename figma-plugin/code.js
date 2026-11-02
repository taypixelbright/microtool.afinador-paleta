// Afinador de Paleta — lado Figma (sandbox). Lee y escribe variables de color
// con la convención del archivo: colección con variables `colors/{familia}/{paso}`
// en un modo. La capa semántica ({familia}, {familia}-tint, {familia}-shade) no
// se toca: como son alias a los pasos, se actualiza sola.
figma.showUI(__html__, { width: 1240, height: 860, themeColors: true });

const PREFIX = 'colors/';
const hexToRgb = hex => { const n = parseInt(hex.slice(1), 16); return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 }; };
const rgbToHex = c => '#' + [c.r, c.g, c.b].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('').toUpperCase();

async function listCollections() {
  const cols = await figma.variables.getLocalVariableCollectionsAsync();
  return cols.map(c => ({ id: c.id, name: c.name, modes: c.modes.map(m => ({ id: m.modeId, name: m.name })) }));
}

// Lee `colors/{familia}/{paso}` y devuelve una paleta: por familia, el color
// al que apunta la variable semántica `{familia}` si existe; si no, el 500.
async function importPalette(collectionId, modeId) {
  const vars = await figma.variables.getLocalVariablesAsync('COLOR');
  const byName = {}; vars.forEach(v => { byName[v.name] = v; });
  const fam = {};
  for (const v of vars) {
    if (v.variableCollectionId !== collectionId || !v.name.startsWith(PREFIX)) continue;
    const [, name, step] = v.name.split('/');
    if (!name || !step) continue;
    (fam[name] = fam[name] || {})[step] = v;
  }
  const resolve = async (v) => {
    let val = v.valuesByMode[modeId];
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
    let hex = sem ? await resolve(sem) : null;
    if (!hex && fam[name]['500']) hex = await resolve(fam[name]['500']);
    if (!hex) { const any = Object.values(fam[name])[0]; hex = await resolve(any); }
    if (hex) out.push({ name, hex, surf: /^(light|dark)$/.test(name) });
  }
  return out;
}

const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
const stepIndex = k => STEPS.indexOf(+k);
const clampStep = i => STEPS[Math.max(0, Math.min(STEPS.length - 1, i))];

// A qué paso apunta hoy un alias semántico ({familia}, -tint, -shade) de la
// colección; null si no existe o no es alias a colors/{familia}/{paso}.
async function aliasStep(v, modeId) {
  if (!v) return null;
  const val = v.valuesByMode[modeId];
  if (!val || val.type !== 'VARIABLE_ALIAS') return null;
  const t = await figma.variables.getVariableByIdAsync(val.id);
  const m = t && t.name.match(/^colors\/[^/]+\/(\d+)$/);
  return m ? +m[1] : null;
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
  let updated = 0, created = 0, skipped = [], aliases = [];
  for (const f of families) {
    // Distancias actuales (antes de tocar nada) para el modo 'keep'.
    const semBase = all[f.name], semTint = all[f.name + '-tint'], semShade = all[f.name + '-shade'];
    const oldBase = await aliasStep(semBase, modeId), oldTint = await aliasStep(semTint, modeId), oldShade = await aliasStep(semShade, modeId);
    for (const s of f.steps) {
      const name = PREFIX + f.name + '/' + s.k;
      let v = byName[name];
      if (!v) {
        if (!createMissing) { skipped.push(name); continue; }
        v = figma.variables.createVariable(name, col, 'COLOR'); byName[name] = v; created++;
      } else updated++;
      v.setValueForMode(modeId, hexToRgb(s.hex));
    }
    // Alias semánticos: el base al escalón donde aterrizó; tint y shade a la
    // distancia elegida. Solo se re-apuntan los que ya existen.
    if (f.home === undefined) continue;
    const hi = stepIndex(f.home);
    const dist = (old, def, sign) => offsets === 'keep' && oldBase !== null && old !== null ? Math.abs(stepIndex(old) - stepIndex(oldBase)) || def : (+offsets || def);
    const point = (sem, k, labelName) => {
      const target = byName[PREFIX + f.name + '/' + k];
      if (!sem || !target) return;
      sem.setValueForMode(modeId, figma.variables.createVariableAlias(target));
      aliases.push(labelName + ' → ' + k);
    };
    point(semBase, f.home, f.name);
    point(semTint, clampStep(hi - dist(oldTint, 2)), f.name + '-tint');
    point(semShade, clampStep(hi + dist(oldShade, 2)), f.name + '-shade');
  }
  return { updated, created, skipped, aliases };
}

figma.ui.onmessage = async msg => {
  try {
    if (msg.type === 'collections') figma.ui.postMessage({ type: 'collections', collections: await listCollections() });
    else if (msg.type === 'import') figma.ui.postMessage({ type: 'palette', palette: await importPalette(msg.collectionId, msg.modeId) });
    else if (msg.type === 'update') {
      const r = await updateVariables(msg.collectionId, msg.modeId, msg.families, msg.createMissing, msg.offsets || 'keep');
      figma.ui.postMessage({ type: 'done', result: r });
      figma.notify(`Variables: ${r.updated} actualizadas, ${r.created} creadas${r.skipped.length ? ', ' + r.skipped.length + ' omitidas' : ''}; ${r.aliases.length} alias re-apuntados`);
    }
    else if (msg.type === 'close') figma.closePlugin();
  } catch (e) { figma.ui.postMessage({ type: 'error', message: String(e.message || e) }); }
};

// Empaqueta index.html + style.css + app.js + panel.html en un solo ui.html,
// que es lo que Figma exige para la UI de un plugin. Correr: node figma-plugin/build.js
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
let html = read('index.html');
html = html.replace('<link rel="stylesheet" href="style.css">', '<style>\n' + read('style.css') + '\n</style>');
html = html.replace('<script src="app.js"></script>', '<script>\n' + read('app.js') + '\n</script>\n' + read('figma-plugin/panel.html'));
// El panel de Figma va al final del aside, antes de la rueda.
html = html.replace(/(\s*<div>\s*<label class="lbl">Rueda de tono)/, '\n        <div id="figmaMount"></div>$1');
html = html.replace('</body>', '<script>document.getElementById("figmaMount").replaceWith(document.getElementById("figmaPanel"));</script>\n</body>');
fs.writeFileSync(path.join(__dirname, 'ui.html'), html);
console.log('ui.html listo (' + (html.length / 1024).toFixed(0) + ' KB)');

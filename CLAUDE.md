# Afinador de Paleta

Microtool estático (sin build, sin dependencias). Todo el color se maneja en OKLCH; nunca introducir HSL.

- `app.js` es un IIFE. Orden interno: color math → reglas (`RULES`) → sugerencias → UI/render → eventos.
- Tokens de tema viven en `:root` de `style.css`; cualquier color nuevo entra ahí en claro y en los dos bloques oscuros.
- Umbrales: `NEUTRAL_C = 0.03` (gris, no se juzga tono), `SIMILAR = 0.08` (ΔE OK, "se parece a").
- Deploy: push a `main` publica en GitHub Pages desde la raíz.

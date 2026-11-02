# Afinador de Paleta

Microtool estático (sin build, sin dependencias). Todo el color se maneja en OKLCH; nunca introducir HSL.

- `app.js` es un IIFE. Orden interno: color math → reglas (`RULES`) → sugerencias → UI/render → eventos.
- Tokens de tema viven en `:root` de `style.css`; cualquier color nuevo entra ahí en claro y en los dos bloques oscuros.
- Corridas: `L_CANON` fija la luz de cada escalón 50–950; `homeStep()` coloca el base en el más cercano (nunca 50/950) y `ramp()` interpola desde ahí. No volver a anclar el base al 500.
- Umbrales: `NEUTRAL_C = 0.03` (gris, no se juzga tono), `SIMILAR = 0.08` (ΔE OK, "se parece a").
- Deploy: cada push a `main` corre `.github/workflows/pages.yml` y publica en GitHub Pages.

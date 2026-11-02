# Afinador de Paleta

Microtool estático (sin build, sin dependencias). Todo el color se maneja en OKLCH; nunca introducir HSL.

- `app.js` es un IIFE. Orden interno: color math → reglas (`RULES`) → sugerencias → UI/render → eventos.
- Tokens de tema viven en `:root` de `style.css`; cualquier color nuevo entra ahí en claro y en los dos bloques oscuros.
- Corridas: `L_CANON` fija la luz de cada escalón 50–950; `homeStep()` coloca el base en el más cercano (nunca 50/950) y `ramp()` interpola desde ahí. No volver a anclar el base al 500.
- Corridas de superficies (`surf`): rango acotado (`RANGE_SURF_LIGHT` 0.995→0.52, `RANGE_SURF_DARK` 0.60→0.11) y croma íntegro; una superficie clara nunca llega a negro ni una oscura a blanco.
- Ancla: un `*` tras el hex (campo `pin`) fija ese color como 0° de la regla; nunca recibe propuestas de tono. En auto se elige la regla que mejor explica al resto desde ese tono. Viaja en el permalink como `hex:nombre*`.
- Superficies: `@` tras el hex (campo `surf`) declara fondos; un color pasa contraste si lo cumple sobre al menos una, y se muestra el ratio sobre cada una. Sin `@`, el campo "Fondo" es la única superficie (fallback). Permalink: `hex:nombre*@`.
- Acentos: ≤ un tercio de los cromáticos por encima de `ACCENT_RATIO` (1.9× mediana) son acento, no falla; se les ofrece un "compañero calmado", nunca bajarles el croma.
- Umbrales: `NEUTRAL_C = 0.03` (gris, no se juzga tono), `SIMILAR = 0.08` (ΔE OK, "se parece a").
- Deploy: cada push a `main` corre `.github/workflows/pages.yml` y publica en GitHub Pages.

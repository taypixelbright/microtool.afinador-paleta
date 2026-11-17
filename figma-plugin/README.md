# Afinador de Paleta — plugin de Figma

La misma herramienta, corriendo dentro de Figma, con lectura y escritura de variables.

## Instalar (desarrollo)

1. En Figma Desktop: **Plugins → Development → Import plugin from manifest…**
2. Elige `figma-plugin/manifest.json` de este repo.
3. Ábrelo desde **Plugins → Development → Afinador de Paleta**.

## Convención de variables

Trabaja con la convención del archivo: una colección (p. ej. `CORE` o `Colors`) con variables de
color `{familia}/{paso}` donde paso ∈ 50, 100, 200 … 900, 950, con o sin grupo de prefijo
(`colors/primary/500` y `primary/500` valen igual), en el modo que elijas. El selector solo
lista colecciones que tengan variables de color.

- **Importar paleta**: lee las familias de esa colección. El escalón base de cada corrida se
  detecta en este orden: (1) la variable semántica `{familia}` si existe y es alias a un paso de
  su rampa; (2) el paso cuyo color coincide (RGB, sin alfa) con las variantes
  `{familia}/opacity/*`, que llevan el color del base; (3) el punto negro del frame de swatches
  (página `Palette · …` de cachito-palette). El paso detectado entra como escalón fijado (`!800`)
  para que el afinador no re-ancle el base por luz; sin señal, cae al 500 sin anclar. `light` y
  `dark` entran marcadas como superficie (`@`).
- **Actualizar variables**: escribe los 11 pasos de cada familia en su variable, reutilizando el
  grupo que la familia ya tenga en la colección (`colors/` solo si es nueva); con "Crear las que
  falten" también crea las que no existan. Las variantes `{familia}/opacity/*` reciben el color
  del escalón base conservando su alfa; las faltantes se crean con el juego canónico (0–100, y
  en `dark` 0 + etiquetas de rampa 50–950). Después re-apunta los alias semánticos que ya
  existan: `{familia}` al escalón donde aterrizó el base (el hex exacto que metiste),
  `{familia}-tint` y `{familia}-shade` a la distancia elegida en "Alias tint / shade":
  - **Conservar distancia actual** (default): lee a cuántos escalones estaba cada tint/shade de su
    base anterior y mantiene esa misma distancia desde el base nuevo. Es lo que menos mueve el archivo.
  - **±2 / ±3 escalones**: fija la distancia para todas las familias. Se recorta a 50/950.
  Con "Crear las que falten" los alias semánticos también se crean si no existen: así el archivo
  documenta su escalón base y el próximo import lo recupera directo.

El nombre de cada color en el afinador es el nombre de familia (`#C4305B primary`).

## Rebuild

`ui.html` se genera a partir de `index.html` + `style.css` + `app.js` + `panel.html`:

```sh
node figma-plugin/build.js
```

Corre esto después de cualquier cambio en la app y vuelve a cargar el plugin en Figma.

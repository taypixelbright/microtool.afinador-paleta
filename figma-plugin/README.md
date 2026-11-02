# Afinador de Paleta — plugin de Figma

La misma herramienta, corriendo dentro de Figma, con lectura y escritura de variables.

## Instalar (desarrollo)

1. En Figma Desktop: **Plugins → Development → Import plugin from manifest…**
2. Elige `figma-plugin/manifest.json` de este repo.
3. Ábrelo desde **Plugins → Development → Afinador de Paleta**.

## Convención de variables

Trabaja con la convención del archivo: una colección (p. ej. `Colors`) con variables de color
`colors/{familia}/{paso}` donde paso ∈ 50, 100, 200 … 900, 950, en el modo que elijas.

- **Importar paleta**: lee las familias de esa colección. El color base de cada una es el que
  referencia la variable semántica `{familia}` si existe (alias); si no, el paso 500. `light` y
  `dark` entran marcadas como superficie (`@`).
- **Actualizar variables**: escribe los 11 pasos de cada familia en su variable; con "Crear las
  que falten" también crea las que no existan. Después re-apunta los alias semánticos que ya
  existan: `{familia}` al escalón donde aterrizó el base (el hex exacto que metiste),
  `{familia}-tint` y `{familia}-shade` a la distancia elegida en "Alias tint / shade":
  - **Conservar distancia actual** (default): lee a cuántos escalones estaba cada tint/shade de su
    base anterior y mantiene esa misma distancia desde el base nuevo. Es lo que menos mueve el archivo.
  - **±2 / ±3 escalones**: fija la distancia para todas las familias. Se recorta a 50/950.
  Los alias no se crean; solo se re-apuntan si existen.

El nombre de cada color en el afinador es el nombre de familia (`#C4305B primary`).

## Rebuild

`ui.html` se genera a partir de `index.html` + `style.css` + `app.js` + `panel.html`:

```sh
node figma-plugin/build.js
```

Corre esto después de cualquier cambio en la app y vuelve a cargar el plugin en Figma.

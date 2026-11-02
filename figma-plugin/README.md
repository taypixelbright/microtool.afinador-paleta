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
  que falten" también crea las que no existan. Las semánticas (`primary`, `primary-tint`,
  `primary-shade`…) no se tocan: son alias a los pasos y se actualizan solas.

El nombre de cada color en el afinador es el nombre de familia (`#C4305B primary`).

## Rebuild

`ui.html` se genera a partir de `index.html` + `style.css` + `app.js` + `panel.html`:

```sh
node figma-plugin/build.js
```

Corre esto después de cualquier cambio en la app y vuelve a cargar el plugin en Figma.

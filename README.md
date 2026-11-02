# Afinador de Paleta

Valida la armonía y el contraste de una paleta de colores en OKLCH y propone sustitutos para los colores que no cuadran.

**Demo:** https://taypixelbright.github.io/microtool.afinador-paleta/

## Qué hace

- Convierte cada hex a OKLCH y detecta la regla armónica que mejor explica la paleta (o la fijas: monocromática, análoga, complementaria, dividida, triádica, tetrádica).
- Mide por color: desvío de tono contra la regla, peso de croma respecto a la mediana y contraste WCAG sobre el fondo elegido.
- Para cada color que falla propone sustitutos con botón **Aplicar**: tono corregido, tono + luz ajustada al contraste, croma igualado, y una versión separada en luz cuando el sustituto se parece a otro color.
- Ancla: marca un color con `*` (o con el botón de su tarjeta) y la regla se construye desde su tono; ese color nunca se mueve, los demás se acomodan a él.
- Superficies: marca light y dark con `@` y cada color se mide sobre ambas; pasa si contrasta en al menos una y ves sobre cuál. Así las corridas claras no "fallan" sobre light ni las oscuras sobre dark. Las superficies además tienen corrida acotada: light baja solo hasta un gris medio y dark sube solo hasta otro, conservando su temperatura.
- Lista las otras posiciones de la regla, con los huecos libres primero.
- Genera una corrida 50–950 por color. El base aterriza en el escalón cuya luz ya tiene (un color oscuro vive en 700, uno claro en 200) en vez de forzarse al 500, así las escalas quedan homogéneas entre sí y los extremos llegan igual de claro / oscuro.
- Exporta tokens `oklch()` listos para CSS.

## Correr local

Es un sitio estático sin build. Abre `index.html` o sirve la carpeta:

```sh
npx serve .
```

## Estructura

```
index.html   marcado
style.css    tokens de tema (claro/oscuro) y estilos
app.js       conversión sRGB↔OKLCH, reglas, sugerencias y render
```

Sin dependencias; las fuentes vienen de Google Fonts.

# Afinador de Paleta

Valida la armonía y el contraste de una paleta de colores en OKLCH y propone sustitutos para los colores que no cuadran.

**Demo:** https://taypixelbright.github.io/microtool.afinador-paleta/

## Qué hace

- Convierte cada hex a OKLCH y detecta la regla armónica que mejor explica la paleta (o la fijas: monocromática, análoga, complementaria, dividida, triádica, tetrádica).
- Mide por color: desvío de tono contra la regla, peso de croma respecto a la mediana y contraste WCAG sobre el fondo elegido.
- Para cada color que falla propone sustitutos con botón **Aplicar**: tono corregido, tono + luz ajustada al contraste, croma igualado, y una versión separada en luz cuando el sustituto se parece a otro color.
- Lista las otras posiciones de la regla, con los huecos libres primero.
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

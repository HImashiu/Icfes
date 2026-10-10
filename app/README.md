# Práctica Saber 11 (prototipo)

App de práctica para exámenes ICFES. Carga un examen a la vez desde el formato `icfes-golden/1`
y, si existe, su clave de respuestas.

## Ejecutar

```bash
cd app
npm install
npm run dev        # sincroniza los exámenes y abre Vite
npm test           # pruebas unitarias con datos inventados
npm run build      # genera dist/ (incluye los exámenes que haya en la carpeta de datos)
```

Los exámenes salen de `$ICFES_DATA_DIR`, o de `/mnt/project-files/icfes/data` cuando esa carpeta existe.
El script `scripts/sync-exams.mjs` los copia a `public/exams/`, que está en `.gitignore`.
**El contenido de los exámenes nunca se versiona en este repositorio.**

## Archivos de datos

- `<nombre>.golden.json`: examen en formato `icfes-golden/1` (preguntas, grupos con textos compartidos, áreas).
- `<nombre>.key.json` (opcional): clave de respuestas.

```json
{ "format": "icfes-key/1", "answers": { "1": "B", "2": "A", "3": null } }
```

Una pregunta sin letra (`null`) o sin entrada cuenta como "clave pendiente". Sin archivo de clave,
la app muestra "Clave pendiente" y guarda las respuestas sin calcular puntaje.

## Qué hace

- Escoger examen completo o un área; modo práctica o simulacro con tiempo.
- Pantalla de respuesta con textos compartidos al lado de cada pregunta, mapa de preguntas,
  marcar para revisar, entregar con aviso de preguntas en blanco.
- Resultado por área y revisión pregunta por pregunta.
- Cada pregunta lleva la línea "Fuente: ICFES, Saber 11". Las preguntas son un recurso gratuito; practicar no requiere pago.
- Matemáticas con KaTeX (`$...$`). Funciona en teléfono.
- El intento en curso se guarda en el navegador de quien responde, así que recargar no lo borra.

## Figuras

Las imágenes del examen se reemplazan por un espacio `figure-slot` (ver `src/lib/render.js`).
Ahí irá el renderizador de gráficas nativas cuando esté listo el catálogo de figuras.

## Límites conocidos

- Los tiempos del simulacro son una referencia de práctica, no cifras oficiales del ICFES.
- Las opciones que son imágenes todavía no se muestran.
- Los textos extraídos de gráficas pueden llegar con etiquetas de ejes como texto suelto.

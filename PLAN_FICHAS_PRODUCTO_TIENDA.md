# Plan de implementación — Fichas enriquecidas de productos

Estado: especificación aprobada para iniciar implementación controlada
Proyecto: `pos-v2`
Alcance inicial: un solo producto piloto
Fecha de definición: 2026-08-05

## 1. Decisiones cerradas

- Producto piloto exacto: `Mutant - Mutant Whey 5lbs`.
- No confundir con `Mutant - Mutant Hardcore Whey 5lbs`, Mutant Mass ni Mutant ISO Surge.
- Sabor de referencia para información nutrimental: `Vainilla`.
- Código de barras de la variante de referencia: `811662020080`.
- La ficha será compartida por todas las variantes durante la primera versión.
- Los productos sin ficha publicada continuarán visibles y funcionando como hoy.
- La ficha se administrará desde una pestaña nueva de `Configuración Tienda`.
- Solo el propietario podrá investigar, editar, cambiar estados y publicar.
- Idioma público: español de México.
- Moneda: MXN.
- Se conserva la página individual de producto; no se creará un modal de detalle.
- La galería principal seguirá mostrando únicamente la fotografía frontal actual.
- La imagen de la etiqueta aparecerá dentro de la sección de información nutrimental.
- Las páginas de oferta reutilizarán la ficha enriquecida del producto asociado.
- Se medirán visitas, selección de sabores y adiciones al carrito.
- La investigación se hará con Gemini y Google Search Grounding.
- Gemini nunca publica directamente y nunca modifica inventario, precios o variantes.

## 2. Objetivo de la primera entrega

Permitir que el propietario seleccione el producto piloto, ejecute una investigación acotada, revise un borrador estructurado, lo previsualice y lo publique. Solo después de aprobar visual y funcionalmente este producto se extenderá el flujo a otros productos.

La primera entrega debe añadir estas secciones públicas:

1. Descripción corta.
2. Características o beneficios clave.
3. Tabla nutrimental estructurada.
4. Imagen de la etiqueta nutrimental.
5. Lista de ingredientes.
6. Modo de uso.
7. Presentación y número de porciones.

## 3. Fuera de alcance en esta etapa

- Fichas diferentes por sabor.
- Generación masiva para todo el catálogo.
- Publicación automática.
- Modificación de precios, stock, nombres, categorías o códigos de barras.
- Galería de fotografías del producto.
- Recomendaciones de productos, reseñas o preguntas de clientes.
- Traducciones a otros idiomas.
- Un agente autónomo que decida nuevos campos, pantallas o procesos.

## 4. Experiencia administrativa

Agregar la pestaña `Fichas de productos` en:

`src/app/(app)/configuracion-tienda/page.tsx`

### 4.1 Lista

La pestaña mostrará:

- Buscador por nombre, marca, sabor y código de barras.
- Filtros por estado.
- Foto miniatura.
- Nombre exacto del producto.
- Sabores registrados.
- Estado de contenido.
- Fecha de última investigación y última edición.

Estados:

- `missing`: estado virtual cuando no existe registro de contenido.
- `draft`: borrador editable.
- `review`: listo para revisión.
- `published`: visible públicamente.

No se debe cargar el inventario completo con joins ilimitados. La lista debe ser paginada y buscar en el servidor.

### 4.2 Editor

Al seleccionar un producto se mostrará:

- Identidad del producto proveniente del POS, en modo lectura.
- Variante de referencia.
- Botón `Investigar y generar borrador`.
- Campos editables de la ficha.
- Fuentes encontradas.
- Campos faltantes o conflictos detectados.
- Consumo de la última ejecución.
- Botones `Guardar borrador`, `Marcar para revisión`, `Previsualizar`, `Publicar` y `Retirar publicación`.

Si ya existe una investigación para la misma huella del producto, el botón principal debe decir `Usar investigación existente`. Reinvestigar requerirá una acción explícita y advertirá que habrá un nuevo consumo de API.

### 4.3 Previsualización

La previsualización debe usar el mismo componente que la tienda pública. No se debe mantener un diseño separado que pueda divergir.

Una ficha en `draft` o `review` será visible en la previsualización del propietario, pero no en la página pública.

## 5. Experiencia pública

La jerarquía visual se inspira en páginas de producto de Myprotein, adaptada a la estética de Chocholand:

- Escritorio: fotografía dominante a la izquierda; compra y sabores a la derecha.
- Móvil: fotografía, nombre, precio, sabores y compra antes del contenido extenso.
- Descripción corta visible sin interacción.
- Características clave en tarjetas oscuras compactas.
- Secciones desplegables para información nutrimental, ingredientes, modo de uso y detalles.
- Fondo negro, superficies oscuras, acento dorado para acciones y rojo para ofertas.
- La información nutrimental debe ser legible como HTML; la imagen de la etiqueta es evidencia visual complementaria.
- Mostrar: `Información nutrimental de referencia: Vainilla. Los valores pueden variar según el sabor.`

Si no hay ficha publicada, la página debe renderizar exactamente la experiencia actual.

## 6. Modelo de datos propuesto

Crear una tabla separada. No agregar todos los campos directamente a `products`.

### 6.1 `store_product_content`

Campos mínimos:

| Campo | Tipo | Regla |
|---|---|---|
| `product_id` | uuid, PK/FK | Referencia a `products(id)`, borrado en cascada |
| `status` | text | `draft`, `review` o `published` |
| `reference_variant_id` | uuid, nullable | Referencia a la variante usada como base |
| `reference_flavor` | text | Para el piloto: `Vainilla` |
| `short_description` | text | Descripción breve en español |
| `key_features` | jsonb | Arreglo ordenado de 3 a 6 textos |
| `serving_size` | text | Tamaño de porción tal como aparece en la fuente |
| `servings_per_container` | text | Número de porciones; texto para admitir aproximados |
| `presentation` | text | `5 lb (2.27 kg)` u otra forma verificada |
| `nutrition_facts` | jsonb | Filas estructuradas de la tabla |
| `ingredients` | text | Lista de ingredientes de Vainilla |
| `directions` | text | Modo de uso |
| `nutrition_label_url` | text, nullable | Imagen importada a Cloudinary |
| `research_sources` | jsonb | Fuentes recuperadas del grounding |
| `research_warnings` | jsonb | Datos faltantes o conflictos |
| `research_model` | text | Modelo utilizado |
| `research_prompt_version` | text | Versión inmutable del contrato |
| `research_input_hash` | text | Huella de identidad para caché |
| `research_usage` | jsonb | Tokens y datos de uso retornados por Gemini |
| `researched_at` | timestamptz | Fecha de investigación |
| `published_at` | timestamptz, nullable | Fecha de publicación |
| `published_by` | uuid, nullable | Propietario que publicó |
| `created_at` | timestamptz | Auditoría |
| `updated_at` | timestamptz | Auditoría |

Forma de cada fila nutrimental:

```json
{
  "name": "Proteína",
  "amount": "22",
  "unit": "g",
  "daily_value": null,
  "indent": 0
}
```

Se mantienen `amount` y `daily_value` como texto porque las etiquetas pueden incluir símbolos, valores menores que, porcentajes o datos no puramente numéricos.

### 6.2 `store_product_events`

Campos:

- `id` uuid.
- `product_id` uuid.
- `variant_id` uuid nullable.
- `event_type`: `view`, `flavor_select` o `add_to_cart`.
- `entry_point`: `catalog`, `offer` o `direct`.
- `session_key` texto anónimo generado por la tienda.
- `created_at` timestamptz.

No almacenar nombre, teléfono, correo, dirección ni texto escrito por el cliente.

## 7. Contrato de ejecución de Gemini

### 7.1 Principio

Gemini es un extractor de una sola tarea. No es un agente de implementación.

El código de la aplicación decide:

- Qué producto investigar.
- Qué campos existen.
- Qué estado tiene la ficha.
- Qué datos se guardan.
- Cuándo se puede publicar.
- Cuántas llamadas están permitidas.

Gemini solamente investiga el producto recibido y devuelve datos candidatos.

### 7.2 Presupuesto de llamadas

- Una llamada con Google Search por cada clic explícito en `Investigar`.
- Cero reintentos automáticos.
- Cero conversaciones o historial entre ejecuciones.
- Cero llamadas al abrir la pestaña, buscar productos, guardar, previsualizar o publicar.
- Bloqueo de llamadas concurrentes para el mismo producto.
- Caché por `research_input_hash + research_prompt_version`.
- En la misma huella, reutilizar el resultado existente por defecto.
- `Reinvestigar` será una acción distinta y explícita.
- Máximo sugerido: tres investigaciones manuales por producto en 24 horas.

### 7.3 Modelo y límites iniciales

- Modelo inicial: `gemini-2.5-flash` para conservar compatibilidad con la integración existente.
- `temperature`: `0.1`.
- `maxOutputTokens`: `3000`.
- Herramienta: `googleSearch`.
- Sin chat, memoria, function calling ni code execution.
- Guardar `usageMetadata` después de cada llamada.
- El límite y el modelo deben vivir en constantes del servidor, no ser elegibles desde la interfaz.

### 7.4 Entrada mínima

Enviar únicamente:

```json
{
  "product_name": "Mutant - Mutant Whey 5lbs",
  "brand": "Mutant",
  "category": "PROTEINAS",
  "presentation_hint": "5 lb / 2.27 kg",
  "reference_flavor": "Vainilla",
  "reference_barcode": "811662020080",
  "known_flavors": [
    "Chocolate Brownie",
    "Cookies N Cream",
    "Fresa",
    "Triple Chocolate",
    "Vainilla"
  ],
  "preferred_sources": [
    "https://mutant-my.com/products/mutant-whey-protein",
    "https://www.gnc.com/on/demandware.static/-/Sites-GNC2-Library/default/v1732874468680/pdf/433538_lbl.pdf"
  ],
  "language": "es-MX"
}
```

No enviar precios, stock, historial de ventas, clientes, costos ni el catálogo completo.

### 7.5 Prompt de sistema obligatorio

```text
Eres un extractor de información comercial y nutrimental para fichas de una tienda de suplementos.

Tu única tarea es investigar el producto exacto recibido y devolver un único objeto JSON.
No converses. No escribas Markdown. No propongas código, pantallas, tablas de base de datos ni nuevas funcionalidades.
No cambies el producto, sabor o presentación solicitados.

REGLAS DE IDENTIDAD:
1. El producto debe coincidir en marca, línea, presentación y, cuando exista, código de barras.
2. Rechaza resultados de productos con nombres parecidos pero líneas distintas.
3. Para MUTANT WHEY no uses datos de MUTANT HARDCORE WHEY, MUTANT MASS ni MUTANT ISO SURGE.
4. La tabla, ingredientes y porciones deben corresponder al sabor de referencia indicado.

PRIORIDAD DE FUENTES:
1. Etiqueta física, PDF de etiqueta o página oficial del fabricante.
2. Distribuidor reconocido que muestre la etiqueta completa.
3. Comercio reconocido que identifique exactamente producto, presentación y sabor.
4. Marketplace solamente como respaldo y nunca para reemplazar una etiqueta oficial disponible.

REGLAS DE EXTRACCIÓN:
1. Usa español de México.
2. Conserva cantidades y unidades exactamente como aparecen en la fuente.
3. No calcules valores nutrimentales faltantes.
4. No mezcles datos de varios sabores para completar huecos.
5. Si un dato no se encuentra, devuelve null, cadena vacía o arreglo vacío según el esquema.
6. Registra cualquier conflicto o dato faltante en research_warnings.
7. Las características clave deben ser concretas, comerciales y respaldadas por las fuentes encontradas.
8. No agregues afirmaciones que no aparezcan en las fuentes.
9. Devuelve solo las propiedades definidas. No añadas campos.
```

### 7.6 Salida esperada

Gemini deberá devolver solamente:

```json
{
  "identity_match": {
    "matched": true,
    "confidence": "high",
    "matched_name": "",
    "matched_flavor": "Vainilla",
    "matched_presentation": ""
  },
  "short_description": "",
  "key_features": [],
  "presentation": "",
  "serving_size": "",
  "servings_per_container": "",
  "nutrition_facts": [],
  "ingredients": "",
  "directions": "",
  "nutrition_label_candidates": [],
  "research_warnings": []
}
```

La lista de fuentes confiable se obtendrá de `groundingMetadata`; no se confiará en URLs inventadas dentro del texto del modelo.

### 7.7 Validación local obligatoria

Antes de guardar:

1. Extraer un único objeto JSON.
2. Rechazar propiedades desconocidas.
3. Validar tipos, longitudes y límites de arreglos.
4. Exigir `identity_match.matched === true`.
5. Exigir que el producto normalizado coincida con Mutant Whey y no contenga `Hardcore`, `Mass` o `ISO Surge`.
6. Exigir sabor de referencia `Vainilla`.
7. Limitar características a seis.
8. Limitar filas nutrimentales a cuarenta.
9. Limitar fuentes guardadas a diez.
10. Si la respuesta falla validación, mostrar el error y conservar el registro previo.

No ejecutar una llamada de reparación automática. El propietario decidirá si vuelve a investigar.

### 7.8 Importación de etiqueta

- Los candidatos de imagen o PDF son sugerencias, no contenido confiable por sí mismos.
- El servidor solo aceptará URLs HTTPS cuyo dominio también aparezca en las fuentes de grounding.
- No hacer `fetch` desde el navegador del cliente.
- Importar el recurso validado a Cloudinary para no depender permanentemente de hotlinks.
- Si el recurso es PDF y el entorno no puede convertir la página de etiqueta de manera segura, marcar `Falta imagen de etiqueta` y ofrecer carga manual.
- Nunca bloquear o sobrescribir la fotografía frontal existente.

## 8. Reglas para cambiar estados

### `draft` → `review`

Requiere:

- Identidad confirmada.
- Descripción corta.
- Entre tres y seis características.
- Presentación.
- Tamaño de porción.
- Número de porciones.
- Al menos cuatro filas nutrimentales.
- Ingredientes.
- Modo de uso.
- Al menos una fuente.
- Imagen de etiqueta o advertencia explícita de que requiere carga manual.

### `review` → `published`

- Solo propietario.
- Confirmación explícita.
- Guardar `published_at` y `published_by`.
- La publicación afecta únicamente la ficha enriquecida.

### `published` → `draft`

- Retira la ficha enriquecida de la tienda.
- El producto y sus variantes permanecen visibles y comprables con la experiencia anterior.

## 9. APIs propuestas

Todas las rutas administrativas deben comprobar sesión y rol de propietario en el servidor.

- `GET /api/store-content/products`
  - Lista paginada con búsqueda y estado.
- `GET /api/store-content/products/[productId]`
  - Producto, variantes y ficha actual.
- `PUT /api/store-content/products/[productId]`
  - Guarda campos editables del borrador.
- `POST /api/store-content/products/[productId]/research`
  - Ejecuta exactamente una investigación o devuelve el resultado en caché.
- `POST /api/store-content/products/[productId]/status`
  - Cambia de estado validando las transiciones.
- `POST /api/store/events`
  - Recibe únicamente los tres eventos públicos permitidos.

La clave de Gemini y la clave de servicio de Supabase nunca deben llegar al cliente.

## 10. Archivos previstos

### Nuevos

- `sql/store_product_content.sql`
- `src/lib/storeProductContent.ts`
- `src/lib/productResearch.ts`
- `src/app/api/store-content/products/route.ts`
- `src/app/api/store-content/products/[productId]/route.ts`
- `src/app/api/store-content/products/[productId]/research/route.ts`
- `src/app/api/store-content/products/[productId]/status/route.ts`
- `src/app/api/store/events/route.ts`
- `src/app/(app)/configuracion-tienda/TabFichasProductos.tsx`
- `src/components/tienda/ProductEnrichedContent.tsx`
- `src/components/tienda/ProductAnalytics.tsx`
- Pruebas unitarias para esquema, validaciones, caché y transiciones.

### Modificados

- `src/app/(app)/configuracion-tienda/page.tsx`
- `src/app/tienda/productos/[productId]/page.tsx`
- `src/app/tienda/ofertas/[offerId]/page.tsx`
- `src/components/tienda/FlavorSelector.tsx`
- `src/types/index.ts`

## 11. Orden obligatorio de implementación

1. Crear migración, restricciones, índices y políticas.
2. Crear tipos y validadores puros con pruebas.
3. Implementar caché, presupuesto de llamadas y cliente de investigación.
4. Probar la respuesta de Gemini sin guardar ni publicar.
5. Implementar APIs administrativas y autorización.
6. Crear la pestaña y editor de borradores.
7. Crear el componente público reutilizable.
8. Integrarlo en producto y oferta detrás del estado `published`.
9. Agregar eventos y límites de escritura.
10. Ejecutar pruebas, lint y build.
11. Investigar únicamente el producto piloto.
12. Revisar visualmente escritorio y móvil.
13. No habilitar otro producto hasta que el piloto sea aprobado.

## 12. Criterios de aceptación del piloto

- La búsqueda encuentra exactamente `Mutant - Mutant Whey 5lbs`.
- La variante de referencia es Vainilla y el código es `811662020080`.
- Una investigación manual produce como máximo una llamada con Google Search.
- Reabrir la ficha no consume Gemini.
- Guardar, previsualizar y publicar no consumen Gemini.
- Una respuesta inválida no dispara reintentos automáticos.
- Se registran tokens y modelo de cada ejecución.
- La ficha nunca usa información de Mutant Hardcore Whey, Mutant Mass o Mutant ISO Surge.
- La publicación muestra las siete secciones acordadas.
- La página de oferta muestra la misma ficha, sin duplicar contenido.
- Los demás productos conservan su comportamiento actual.
- Retirar la publicación restaura la experiencia anterior sin ocultar el producto.
- Los eventos no contienen datos personales.
- `npm run lint`, pruebas y `npm run build` terminan correctamente.

## 13. Referencias técnicas verificadas

- Google Search Grounding: https://ai.google.dev/gemini-api/docs/generate-content/google-search
- Salidas estructuradas: https://ai.google.dev/gemini-api/docs/generate-content/structured-output
- Conteo y metadatos de tokens: https://ai.google.dev/gemini-api/docs/generate-content/tokens
- Referencia visual: https://www.myprotein.es/p/nutricion-deportiva/origin-pre-entreno/12941037/
- Mutant Whey 5 lb: https://mutant-my.com/products/mutant-whey-protein
- Etiqueta de referencia Vainilla: https://www.gnc.com/on/demandware.static/-/Sites-GNC2-Library/default/v1732874468680/pdf/433538_lbl.pdf

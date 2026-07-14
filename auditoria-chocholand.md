# Auditoría de Chocholand.cloud/tienda

**Fecha:** 12 de julio de 2026
**Alcance:** Catálogo, filtros, buscador, página de producto, carrito y checkout, en escritorio (1280px) y móvil (375px). No se generó ningún pedido real; el carrito de prueba fue limpiado al terminar.

**Stack detectado:** Next.js (Turbopack), imágenes en Cloudinary, productos servidos desde `/api/store/products` (135 productos), tema oscuro con acentos rojo y dorado.

---

## 🔴 Bugs críticos (arreglar primero)

### 1. El carrito queda fuera de la pantalla en celular
- El header mide **452px de ancho en un viewport de 375px**: el link "Mi cuenta" y el botón del carrito se salen del borde derecho.
- Toda la página queda con **scroll horizontal** en móvil.
- En móvil, el botón más importante de una tienda está medio oculto.

**Medición:** el link "Mi cuenta" ocupa de x=320 a x=409; el botón del carrito de x=419 a x=452 (fuera de los 375px visibles).

### 2. La página descarga ~35–40 MB al abrirla
- Las **131 imágenes de producto cargan todas de golpe** al abrir la página (cero lazy loading, verificado con `scrollY=0`).
- Cada imagen pesa **228–511 KB**: son PNG de 600×600 sin optimizar.
- El logo es un **JPG de 1638×1638 (182 KB) mostrado a 40×40 px**, y se carga 3 veces.

**Solución (casi gratis, ya usas Cloudinary):**
- Agregar transformaciones a las URLs: `f_auto,q_auto,w_400` → cada imagen bajaría a ~20–40 KB (ahorro de ~10x).
- Agregar `loading="lazy"` a las imágenes fuera de pantalla.
- Servir el logo a 80px (`w_80`).

### 3. Los descuentos no se ven en el catálogo
- Ejemplo: **Venom Inferno** aparece en el catálogo a "$550.00" sin señal de oferta, pero en "🔥 Ofertas del mes" está a **$480 con -13%**.
- Hay **35 productos en oferta** que en el catálogo principal se ven a precio normal.
- Quien no entre específicamente al botón de ofertas nunca se entera.

**Solución:** mostrar en las tarjetas del catálogo el precio tachado + badge de descuento.

### 4. Hay ~20 productos imposibles de encontrar por categoría
El menú lateral no coincide con las categorías reales de los datos:

| Categoría en los datos | Productos | ¿Accesible desde el menú? |
|---|---|---|
| PRE-ENTRENOS | 44 | ✅ |
| PROTEINAS | 34 | ✅ |
| CREATINA | 12 | ✅ (botón "CREATINAS") |
| AMINOACIDOS Y BCCAS | 7 | ✅ (botón "AMINOACIDOS") |
| TERMOGENICOS | 8 | ✅ |
| GAINERS | 5 | ✅ (botón "GANADORES") |
| SNACKS | 4 | ✅ |
| MULTIVITAMINICOS | 6 | ❌ Solo en "TODOS" |
| Otros | 4 | ❌ Solo en "TODOS" |
| PRE-HORMONALES | 3 | ❌ Solo en "TODOS" |
| Sin categoría | 3 | ❌ Solo en "TODOS" |
| GLUTAMINAS | 2 | ❌ Solo en "TODOS" |
| CLA Y CARNITINA | 2 | ❌ Solo en "TODOS" |
| bcaa (minúsculas) | 1 | ❌ Solo en "TODOS" |

- El botón **ACCESORIOS muestra "No hay productos disponibles"** aunque existe el cinturón Durabody (está sin categoría asignada).
- La categoría "bcaa" duplica a "AMINOACIDOS Y BCCAS".
- "Fish Oil Omega3" está categorizado como GLUTAMINAS (incorrecto); "Omega3 90 Softgels" como MULTIVITAMINICOS.

**Solución:** pasada de limpieza de categorías en el punto de venta (unificar duplicados, asignar huérfanos) y generar el menú desde las categorías reales.

---

## 📱 Móvil (prioridad del negocio)

### Una columna es demasiado
- Cada tarjeta mide **327×523 px**: un producto por pantalla.
- El catálogo completo mide **71,939 px de alto** — llegar a la letra "U" (USN) requiere ~90 pantallas de scroll.

**Recomendación fuerte: 2 columnas en móvil** (tarjetas de ~160px: imagen arriba, nombre y precio abajo). Es el estándar de e-commerce móvil (Amazon, Shein, la propia Ghost) y reduce el scroll a la mitad. Las fotos de producto (botes verticales centrados) se ven perfectamente a ese tamaño.

### Las imágenes se recortan
- Fotos cuadradas (600×600) en contenedor vertical (325×406) con `object-fit: cover` → se recorta **~15% arriba y abajo**, justo donde quedan tapas y etiquetas.

**Solución:** contenedor cuadrado o `object-fit: contain`.

### Categorías casi invisibles en móvil
- El menú se convierte en una fila de chips de **40px de alto con letra de 12px**.
- **Solo 3 de los 11 botones se ven sin scroll horizontal** (ancho total de la fila: 1276px vs 327px visibles).
- "🔥 Ofertas del mes" y "🎁 Paquetes" quedan al final del carrusel, donde nadie llega.

**Propuestas:**
1. Convertir las categorías en una **cuadrícula de tiles visuales** (2 columnas, foto representativa o ícono grande + nombre) justo bajo el hero. Es lo que hace bien Ghost con sus colecciones.
2. **Banner propio para Ofertas y Paquetes** arriba del catálogo, no un chip al final.
3. Si se mantienen los chips: más altos (48px+), con contador ("Proteínas · 34") y degradado en el borde que insinúe scroll.

### Otros detalles móviles
- El buscador tiene **área de toque de ~23px** de alto (mínimo recomendado: 44px).
- El hero ocupa **una pantalla completa (747px)** antes del primer producto. En móvil conviene medio hero con CTA visible.

---

## ⚙️ Funcional / conversión

### No hay footer
Ninguna página tiene contacto, WhatsApp, dirección, redes sociales, políticas de envío o devolución. Para una tienda que cobra por adelantado, es lo primero que un comprador nuevo busca para confiar. **Probablemente la mejora de conversión más barata de toda la lista.**

### Página de producto desnuda
- Una sola foto, sin galería.
- **Sin descripción** (el campo `store_description` viene vacío desde el POS).
- Sin información de envío ni formas de pago.
- Sin productos relacionados ("quienes compraron esto también...").

Aunque sea una descripción de 2 líneas por producto, cambia mucho.

### Checkout con fricción
- Solo muestra el total y "Hacer pedido": **no dice nada de cómo se paga ni cómo llega el pedido**.
- Aparentemente requiere crear cuenta para completar.

**Recomendaciones:** pedido como invitado vía WhatsApp (en México convierte muy bien) y mostrar formas de pago/envío antes del botón.

### Sin ordenamiento
- No hay control de orden (mínimo: precio menor a mayor).
- El catálogo viene alfabético por marca, que no le sirve al comprador.

### Textos y datos
- "**1 sabores**" → debería ser "1 sabor".
- "Últimas **1 unidades**" → "¡Solo queda 1!".
- Precios sin separador de miles: "$1350.00" → "$1,350".
- Typos en nombres de producto (se ven poco profesionales):
  - "Gold Standar" → Gold Standard
  - "Muscle Sanwich" → Muscle Sandwich
  - "Roonie Coleman" → Ronnie Coleman
  - "Mnohydrate" → Monohydrate
  - "Glyecerol" → Glycerol
  - "Bcca" / "BCCAS" → BCAA
  - "Dragon Lyche" → Dragon Lychee
  - "Brazo De Limon 50" (nombre de sabor confuso)
- Duplicados aparentes: "On - Gold Standar Isolate 44serv" y "Optimum Nutrition - Gold Standar Isolate 44serv" son el mismo producto con dos nombres de marca distintos.

---

## 🎨 Estética — cómo quitarle el "look de página hecha con IA"

### Señales detectadas que delatan ese look

1. **30–41 animaciones infinitas corriendo a la vez** (glows, marquees, partículas). Es la firma clásica de página generada; además consume batería y CPU en el celular (las capturas de pantalla de la auditoría fallaban por esto). Dejar máximo una animación sutil en el hero. El marquee "CHOCHOLAND · SUPLEMENTOS DEPORTIVOS · 2025" entra en esta categoría.

2. **Tres tipografías distintas**: DM Sans, Barlow Condensed y **Syne** (esta última es *la* fuente de los sitios generados por IA). Ghost usa básicamente una sola familia condensada en pesos fuertes. Quedarse con dos: display condensada para títulos (Barlow Condensed sirve) y una neutra para el resto.

3. **Emojis en el menú** (🔥, 🎁). Ghost jamás usaría un emoji en su navegación — usa etiquetas tipográficas ("NEW", "SALE") en badges. Cambiarlos por badges de texto.

4. **Dos diseños de tarjeta distintos**: las del catálogo (con "desde") y las de ofertas (otro border-radius, estilos inline, otro layout). Unificar en un solo componente.

5. **Hero genérico**: "ELEVA TU RENDIMIENTO" + "VER CATÁLOGO" sobre fondo oscuro con glow es intercambiable con mil tiendas. Lo que haría única la página: fotos reales del local/mostrador, la gente, o un banner del producto estrella del mes. Ghost funciona porque muestra *sus productos y su comunidad*, no texto motivacional.

6. **Paleta**: el rojo neón (rgb(255,64,64)) y el dorado (rgb(240,180,41)) compiten como acentos sobre el fondo negro-azulado (rgb(13,13,18)). Elegir uno como acento principal.

### Lo que sí está bien y conviene conservar
- El tema oscuro (adecuado para el nicho).
- La búsqueda con placeholder útil ("Busca proteínas, creatinas, pre-entrenos...").
- El indicador de stock ("Últimas X unidades").
- Los badges de número de sabores.
- La estructura catálogo + sidebar en escritorio (los botones de categoría en escritorio miden 210×45px, tamaño correcto).

---

## 📊 Datos técnicos medidos

| Métrica | Valor |
|---|---|
| Productos totales | 135 |
| Payload de la API de productos | 57 KB |
| Imágenes cargadas al abrir (sin scroll) | 131 de 131 (0 lazy) |
| Peso por imagen de producto | 228–511 KB (PNG 600×600 sin transformación) |
| Descarga estimada de la página completa | ~35–40 MB |
| Logo | 1638×1638 JPG (182 KB) mostrado a 40×40, cargado 3× |
| Altura del catálogo en móvil | 71,939 px |
| Ancho real del header en móvil | 452 px (77 px de overflow sobre 375) |
| Animaciones infinitas activas | 30–41 |
| Chips de categoría visibles en móvil | 3 de 11 |
| Área de toque del buscador | ~23 px de alto |
| Tipografías cargadas | 6 archivos woff2 (DM Sans, Barlow Condensed, Syne) |
| Productos en Ofertas del mes | 35 |
| Paquetes en oferta | 6 |
| SEO básico | ✅ title, meta description, og:image, lang="es" correctos |

---

## ✅ Plan sugerido, en orden

| # | Acción | Impacto | Esfuerzo |
|---|--------|---------|----------|
| 1 | Arreglar header móvil (carrito visible, sin overflow horizontal) | Crítico | Bajo |
| 2 | Cloudinary `f_auto,q_auto,w_400` + lazy loading + logo optimizado | Crítico | Bajo |
| 3 | Mostrar precios de oferta (tachado + badge) en el catálogo | Ventas directas | Bajo |
| 4 | 2 columnas en móvil + imagen sin recorte (contain o contenedor cuadrado) | Experiencia móvil | Medio |
| 5 | Limpiar categorías en el POS + tiles visuales de categoría en móvil | Encontrabilidad | Medio |
| 6 | Footer con WhatsApp, contacto, envíos y políticas | Confianza | Bajo |
| 7 | Reducir animaciones, unificar tipografías y tarjetas, quitar emojis del menú | Look profesional | Medio |
| 8 | Descripciones de producto + info de envío/pago en checkout + orden por precio | Conversión | Medio-Alto |

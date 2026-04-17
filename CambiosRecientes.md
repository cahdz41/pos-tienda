# Cambios Recientes — 16 de Abril 2026

## Resumen

Sesión de desarrollo completa. Se agregaron 3 funcionalidades nuevas al POS y se realizaron ajustes de UX/flujo de pago. La tienda online no fue tocada.

---

## 1. Sección de Ventas (`/ventas`)

**Archivos:** `src/app/(app)/ventas/page.tsx` (nuevo), `src/components/Sidebar.tsx`

Nueva página de historial de ventas accesible desde el sidebar del POS.

**Funcionalidades:**
- Muestra las ventas del día en curso por default
- Navegación por fechas con botones `‹` `›` y selector de calendario nativo
- Botón "Hoy" que aparece cuando no estás en el día actual
- Filtro por cajero (dropdown)
- 4 tarjetas de estadísticas: Total del día, Efectivo, Tarjeta, Anuladas
- Tabla con columnas: Folio, Hora, Productos (preview), Cajero, Método (badge de color), Total
- Ventas anuladas con opacidad reducida y marca `✕`
- Panel deslizable lateral al hacer clic en una fila con detalle completo del ticket: productos, cantidades, precios, método de pago, monto pagado y cambio

**Exportador de ventas (Excel):**
- Botón "Exportar Excel" en el header de la página
- Modal con 4 opciones de período: Día actual, Esta semana, Este mes, Período personalizado (rango desde/hasta)
- Genera archivo `.xlsx` con 2 hojas:
  - **Ventas** — una fila por ticket (Folio, Fecha, Hora, Cajero, Productos, Método, Total, Pagó, Cambio, Estado)
  - **Detalle líneas** — una fila por producto vendido (Folio, Fecha, Cajero, Producto, Sabor, Cantidad, Precio unitario, Subtotal)
- Nombre del archivo incluye el período exportado

---

## 2. Exportador de Inventario

**Archivos:** `src/app/(app)/inventario/ExportModal.tsx` (nuevo), `src/app/(app)/inventario/page.tsx`

Modal modular de exportación accesible desde el botón "Exportar Excel" en la sección de Inventario.

**Opciones configurables (completamente independientes entre sí):**

| Opción | Valores disponibles |
|---|---|
| Existencias | Todos / Solo con stock / Solo sin stock |
| Categoría | Todas las categorías / Categoría específica (dropdown dinámico) |
| Precios | Todos (público + mayoreo + costo) / Solo público / Solo mayoreo / Solo costo |
| Nivel de detalle | Con variantes de sabor (1 fila por sabor) / Producto genérico (1 fila por producto, stock sumado) |

- Preview en tiempo real de cuántas filas se exportarán según los filtros activos
- En modo "Producto genérico" con variantes de distinto precio, muestra rango `min – max`
- Nombre del archivo refleja las opciones: `inventario-proteinas-con-stock-2026-04-16.xlsx`

---

## 3. Filtro "Solo con existencias" en POS

**Archivo:** `src/app/(app)/pos/ProductPanel.tsx`

Botón "Solo con existencias" agregado en el panel de productos del POS.

- Se combina con la búsqueda por texto y el filtro por categoría (todos actúan en conjunto)
- Si hay búsqueda activa y se activa el filtro, aplica sobre los resultados ya filtrados
- El botón se resalta en amarillo cuando está activo

---

## 4. Métodos de pago — Transferencia y modo Mixto

**Archivos:** `src/app/(app)/pos/PaymentModal.tsx`, `src/app/(app)/pos/Receipt.tsx`, `src/types/index.ts`, `src/app/(app)/pos/VoidSaleModal.tsx`, `src/app/(app)/ventas/page.tsx`

Rediseño completo del flujo de selección de métodos de pago en el modal de cobro del POS.

**Modo normal (default):**
- 3 botones: 💵 Efectivo · 💳 Tarjeta · 🏦 Transferencia
- Efectivo seleccionado por default
- Clic en otro método deselecciona el anterior (comportamiento radio)

**Modo Mixto (checkbox "Pago mixto"):**
- Al activarlo los botones permiten multi-selección (2 o 3 métodos simultáneos)
- Efectivo + Tarjeta → input de efectivo, tarjeta = resto automático
- Efectivo + Transferencia → input de efectivo, transferencia = resto automático
- Tarjeta + Transferencia → input de tarjeta, transferencia = resto automático
- Efectivo + Tarjeta + Transferencia → input de efectivo + input de tarjeta, transferencia = resto automático
- Resumen visual con los montos de cada método; total en verde cuando cuadra exacto

**Otros ajustes:**
- `Receipt.tsx` actualizado para imprimir Transferencia y desglose de los 3 métodos en mixto
- `METHOD_LABEL` en VoidSaleModal y página de Ventas actualizado con `Transferencia`
- `Sale.payment_method` en tipos actualizado para incluir `'transfer'`

---

## Blindaje (Tag Git)

```
v1.3-ventas-exportadores
```

Commit: `8b5081e` — incluye sección Ventas + exportadores Excel.

Los cambios del método de pago (Transferencia + mixto) están en el working tree y pendientes de commit una vez que el usuario confirme que funcionan correctamente.

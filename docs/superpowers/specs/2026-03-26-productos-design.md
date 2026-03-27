# Diseño — Sección Productos

**Fecha:** 2026-03-26
**Estado:** Aprobado

---

## Resumen

Agregar la sección `/productos` al sistema POS con tres pestañas: Productos, Combos y Proveedores. Accesible para todos los roles (`owner` y `cashier`) con los mismos permisos.

---

## 1. Navegación

- Nueva entrada "Productos" en el `Sidebar` entre Inventario y Clientes.
- Sin `ownerOnly`. Sin `offlineEnabled` (requiere conexión).
- Ícono: etiqueta/caja (SVG consistente con el estilo existente).

---

## 2. Pestaña: Productos

### Lista
Tabla con columnas: Código de barras, Nombre, Tipo, Precio venta, Costo, Mayoreo, Stock, Departamento, Proveedor, Acciones (editar / eliminar).

Incluye: buscador por nombre o barcode, filtro por departamento.

### Modal Crear / Editar (`ProductFormModal`)

| Campo | Tipo | Requerido |
|---|---|---|
| Código de barras | texto | sí |
| Nombre del producto | texto | sí |
| Tipo | dropdown: `Unidad` / `Combo-Paquete` | sí |
| Costo | número | sí |
| Precio de venta | número | sí |
| Precio de mayoreo | número | sí |
| Departamento | texto libre | no |
| Proveedor | dropdown del catálogo `suppliers` | no (opcional) |
| Cantidad a agregar | número (suma al stock actual) | no |
| Existencia mínima | número | no |

- En modo edición, "Cantidad a agregar" suma al stock existente (no lo reemplaza).
- El upsert escribe en `products` (por `name`) y `product_variants` (por `barcode`).

### Eliminar
- Si el producto no tiene ventas: `DELETE` físico.
- Si tiene ventas asociadas: `UPDATE active = false` (soft delete). Se muestra advertencia al usuario.

---

## 3. Pestaña: Combos

### Lista
Tabla con columnas: Nombre, Precio venta, N° de productos, Acciones (editar / eliminar).

### Modal Crear / Editar (`ComboFormModal`)

| Campo | Detalle |
|---|---|
| Nombre del combo | texto, requerido |
| Precio de venta | número, requerido |
| Productos | buscador de variantes + lista con cantidad por variante (mínimo 2 ítems) |

Ejemplo: `2× Refresco 600ml + 1× Papas Sabritas`

### Integración con POS
- Los combos aparecen en el `ProductPanel` como una entrada independiente (no como `product_variants`).
- Al procesar la venta, se descuenta el stock de **cada variante individual** que compone el combo según su cantidad definida.
- Si alguna variante del combo no tiene stock suficiente, se muestra advertencia antes de confirmar la venta.

---

## 4. Pestaña: Proveedores

### Lista
Tabla simple: Nombre, Teléfono, Correo, Notas, Acciones (editar / eliminar).

### Modal Crear / Editar (`SupplierFormModal`)

| Campo | Requerido |
|---|---|
| Nombre | sí |
| Teléfono | no |
| Correo | no |
| Notas | no |

- Eliminar: soft delete (`active = false`) si hay productos asociados; delete físico si no.

---

## 5. Base de datos

### Tabla nueva: `suppliers`
```sql
CREATE TABLE suppliers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  notes TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### Modificación: `products`
```sql
ALTER TABLE products ADD COLUMN supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL;
```

### Tabla nueva: `combos`
```sql
CREATE TABLE combos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  sale_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### Tabla nueva: `combo_items`
```sql
CREATE TABLE combo_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  combo_id UUID REFERENCES combos(id) ON DELETE CASCADE,
  variant_id UUID REFERENCES product_variants(id) ON DELETE CASCADE,
  quantity NUMERIC(10,2) NOT NULL DEFAULT 1
);
```

### RLS
Políticas explícitas `FOR SELECT / INSERT / UPDATE / DELETE` en `suppliers`, `combos`, `combo_items` para usuarios autenticados (mismo patrón que el resto del sistema).

---

## 6. Archivos a crear / modificar

| Archivo | Acción |
|---|---|
| `src/app/(app)/productos/page.tsx` | Crear — página principal con pestañas |
| `src/components/Sidebar.tsx` | Modificar — agregar entrada Productos |
| `src/types/index.ts` | Modificar — agregar tipos `Supplier`, `Combo`, `ComboItem` |
| `src/lib/schema_productos.sql` | Crear — migraciones SQL |
| `src/app/(app)/pos/ProductPanel.tsx` | Modificar — mostrar combos + advertencia stock |
| `src/app/(app)/pos/PaymentModal.tsx` | Modificar — descuento de stock por combo al vender |

---

## 7. Lo que NO entra en este scope

- Imágenes de productos (Cloudinary, pendiente de sesión futura).
- Combos en modo offline (quedan bloqueados sin conexión como el resto de módulos no-offline).
- Gestión de precios por proveedor / historial de compras.

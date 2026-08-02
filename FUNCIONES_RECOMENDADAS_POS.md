# Funciones recomendadas para el POS de Chocholand

**Objetivo:** convertir el POS en un sistema de control diario de ventas, margen, caja, compras, inventario y clientes, sin intentar construir desde el inicio un sistema contable completo.

## Principio de diseño

El POS debe responder diariamente cinco preguntas:

1. ¿Cuánto vendimos y cuánto margen dejamos?
2. ¿Cuánto dinero existe realmente y cuánto ya está comprometido?
3. ¿Qué debe pagarse durante los próximos 7, 15 y 30 días?
4. ¿Qué mercancía debe comprarse, con qué proveedor y cuándo?
5. ¿Qué clientes o ventas se pueden recuperar y dar seguimiento?

## Separaciones indispensables

### 1. Negocio y familia

Los gastos de casa no deben registrarse como gasto operativo de la tienda.

- renta del local, nómina, luz del local y publicidad: **gasto del negocio**;
- comida, despensa, servicios de casa e Infonavit: **retiro del propietario/gasto familiar**;
- el POS debe mostrar ambos porque ambos consumen caja, pero en reportes separados.

### 2. Compra de inventario y gasto

Pagar $13,000 a un proveedor reduce la caja, pero no significa que ese día se perdieron $13,000. El dinero se convirtió en inventario.

- la compra debe registrarse como salida de caja y entrada de inventario;
- el costo se reconoce como costo de venta cuando se vende cada producto;
- los reportes deben mostrar por separado flujo de caja y utilidad.

### 3. Capital e intereses de deuda

- capital pagado: reduce deuda;
- interés, comisión o recargo: sí es gasto financiero;
- si no se conoce la separación, permitir registrarlo provisionalmente y corregir después.

### 4. Efectivo disponible y efectivo libre

`efectivo libre = saldos utilizables - pagos comprometidos de 7 días`

El tablero nunca debe llamar “disponible” al dinero que ya se necesita para Planet, proveedor rápido, renta, familia o deuda.

## Fase 1 — Caja, pagos y cierre diario

Esta es la prioridad inmediata.

### Cuentas de dinero

Crear cuentas separadas:

- efectivo de tienda;
- cuenta bancaria;
- transferencias;
- terminal por depositar;
- otras cuentas, si existen.

Una transferencia entre cuentas no debe contarse como ingreso ni gasto.

### Registro de movimientos

Cada entrada o salida debe guardar:

| Campo | Ejemplo |
|---|---|
| Tipo | Entrada, salida o transferencia |
| Alcance | Negocio o personal/familia |
| Categoría | Renta, nómina, proveedor, comida, deuda, impuesto |
| Beneficiario/proveedor | Planet, Texas, proveedor rápido, Infonavit |
| Importe | $10,000 |
| Cuenta de pago | Banco o efectivo |
| Fecha de vencimiento | 4 de agosto |
| Fecha de pago | 4 de agosto |
| Estado | Programado, pagado, vencido o cancelado |
| Recurrencia | Semanal, mensual, cada 15–20 días o única vez |
| Prioridad | Crítica, alta, normal o aplazable |
| Comprobante | Foto, PDF o referencia opcional |
| Notas | Pedido Planet que llega el lunes |

### Pagos programados

Debe permitir registrar obligaciones futuras antes de pagarlas:

- Planet cada martes;
- proveedor rápido lunes y jueves;
- Texas cada 15–20 días;
- renta;
- nómina;
- préstamos y tarjetas;
- Infonavit;
- impuestos;
- familia;
- servicios del local y de casa.

Funciones:

- calendario diario, semanal y mensual;
- repetición automática;
- alertas 3 días antes y el día del vencimiento;
- marcar pago parcial;
- cambiar fecha dejando historial;
- alerta de saldo insuficiente.

### Cierre diario

Al finalizar el día:

- saldo inicial por cuenta;
- venta por efectivo, transferencia y terminal;
- devoluciones;
- compras y pagos;
- saldo esperado;
- saldo contado/real;
- diferencia de caja;
- causa y responsable de la diferencia;
- caja comprometida de los siguientes siete días;
- caja libre.

No debe poder modificarse un cierre sin dejar auditoría.

## Fase 2 — Compras y proveedores

### Ficha del proveedor

Guardar:

- nombre;
- contacto;
- forma y plazo de pago;
- días habituales de pedido;
- tiempo promedio real de entrega;
- pedido mínimo;
- costo de envío;
- nivel de surtimiento;
- última compra;
- devoluciones o incidencias.

### Orden de compra

Estados sugeridos:

`Borrador → Autorizada → Pagada → Enviada → Recibida parcial → Recibida completa → Cerrada`

Campos:

- proveedor;
- fecha de pedido y pago;
- entrega estimada y real;
- productos, cantidades y costos;
- costo total;
- faltantes del proveedor;
- cuenta con la que se pagó;
- usuario que autorizó;
- comprobante;
- diferencia entre lo pedido y recibido.

Cuando se reciba el pedido, el sistema debe generar automáticamente movimientos de inventario y actualizar el costo de reposición.

### Mercancía en tránsito

Mostrar existencias en tres columnas:

- disponible físicamente;
- reservado para clientes;
- en tránsito.

Esto es especialmente importante para Planet: evita volver a pedir el jueves algo que ya se pagó el martes y llegará el lunes.

### Comparador de proveedores

Para cada SKU mostrar:

| Dato | Utilidad |
|---|---|
| Costo proveedor rápido | Disponibilidad inmediata |
| Costo Planet | Ahorro con seis días de espera |
| Costo Texas | Alternativa adicional |
| Ahorro por unidad y porcentaje | Decidir si conviene esperar |
| Venta semanal | Calcular pedido |
| Días de inventario | Evitar exceso o quiebre |

El sistema debe sugerir proveedor, pero el propietario conserva la decisión final.

## Fase 3 — Margen y precios

### Dos costos diferentes

Guardar ambos:

- **costo histórico de venta:** costo vigente al momento de vender;
- **costo actual de reposición:** costo necesario para volver a comprar hoy.

No sobrescribir el costo histórico cuando el proveedor aumente precios.

### Reglas de margen

`margen = (precio - costo de reposición) / precio`

- bloquear precio debajo del costo salvo autorización del propietario;
- alerta roja: margen de 0% a 10%;
- alerta amarilla: 10% a 15%;
- alerta preventiva: 15% a 20%;
- mostrar margen final antes de cobrar;
- permitir objetivos diferentes por categoría y tipo de cliente.

### Precios personalizados

Guardar siempre:

- precio público;
- precio cobrado;
- descuento en pesos y porcentaje;
- margen resultante;
- cliente o tipo de cliente;
- motivo;
- usuario que autorizó.

El sistema debe reportar semanalmente cuánto margen se cedió por precios personalizados.

### Paquetes

El POS debe permitir armar paquetes y calcular:

- precio individual total;
- descuento total;
- costo combinado;
- ganancia bruta;
- margen combinado;
- producto que aporta el descuento.

No autorizar automáticamente paquetes con margen menor al objetivo.

## Fase 4 — Inventario inteligente

### Kardex o historial de movimientos

Cada cambio de existencia debe tener origen:

- compra recibida;
- venta;
- devolución;
- merma;
- ajuste físico;
- reserva;
- cancelación;
- transferencia.

No permitir editar la existencia directamente sin crear un movimiento y motivo.

### Punto de reorden por proveedor

`punto de reorden = demanda durante el tiempo de entrega + stock de seguridad`

- proveedor rápido: cubrir hasta el siguiente pedido, más reserva pequeña;
- Planet: cubrir desde el martes hasta el lunes siguiente;
- Texas: usar su tiempo real de entrega y frecuencia.

### Clasificación del producto

Agregar una función comercial por SKU:

- tráfico/ancla;
- generador de utilidad;
- liberación de caja;
- pedido/anticipo;
- prueba/cola larga.

Agregar clasificación de rotación:

- A: alta contribución/rotación;
- B: media;
- C: baja;
- sin venta en 30, 60 y 90 días.

### Venta perdida

Registrar:

- fecha;
- producto y presentación;
- cliente/WhatsApp opcional;
- cantidad;
- causa: agotado, precio, proveedor sin existencia, cliente no esperó u otra;
- valor estimado;
- si se recuperó después.

Un inventario bajo sólo será una alerta grave cuando genere ventas perdidas o no pueda reponerse a tiempo.

## Fase 5 — Clientes, canales y marketing

### Cliente mínimo viable

No hace falta una base compleja. Guardar:

- nombre;
- WhatsApp;
- autorización para recibir mensajes;
- fecha de alta;
- última compra;
- productos habituales;
- canal de origen;
- fecha de seguimiento;
- estado: nuevo, recurrente, inactivo o mayorista.

Evitar guardar datos médicos sensibles innecesarios.

### Datos en cada ticket

- canal: tienda, WhatsApp, Instagram, Facebook, referencia, gimnasio u otro;
- cliente opcional;
- vendedor;
- nuevo o recurrente;
- campaña u oferta;
- descuento y motivo;
- código del paquete/promoción.

### Seguimiento

- lista de producto solicitado que ya llegó;
- recompra esperada según duración del producto;
- clientes inactivos;
- mayoristas con próxima fecha estimada;
- medición de clientes contactados, respondidos y compradores.

## Tablero principal recomendado

Mostrar sin navegar por múltiples pantallas:

### Hoy

- venta;
- tickets y ticket promedio;
- margen bruto y porcentaje;
- efectivo/bancos;
- terminal pendiente de depositar;
- pagos del día;
- caja libre después de siete días;
- ventas perdidas.

### Semana

- venta contra meta de $60,000;
- margen contra meta de 23%;
- compras por proveedor;
- gastos del negocio;
- retiros familiares;
- pagos de deuda;
- inventario lento convertido en efectivo;
- ventas con margen menor a 15% y 20%.

### Próximos 7, 15 y 30 días

- saldo proyectado;
- ventas/cobros esperados;
- pedidos programados;
- obligaciones;
- déficit máximo previsto;
- día de mayor presión de caja.

## Reportes indispensables

1. Estado de resultados gerencial: venta, costo vendido, utilidad bruta, gastos del negocio y resultado operativo.
2. Flujo de caja: entradas y salidas reales por fecha.
3. Retiros familiares separados.
4. Compras por proveedor y SKU.
5. Margen por producto, categoría, cliente, canal y tipo de precio.
6. Productos agotados y ventas perdidas.
7. Inventario sin venta en 30, 60 y 90 días.
8. Próximos pagos y caja proyectada.
9. Descuentos y excepciones autorizadas.
10. Clientes nuevos, recurrentes, reactivados y mayoristas.

## Seguridad y confiabilidad

- usuarios y permisos por función;
- bitácora de cambios: quién, qué y cuándo;
- respaldo automático diario;
- exportación a Excel/CSV;
- identificadores únicos para productos, clientes, órdenes y movimientos;
- prohibir borrar operaciones: cancelar o corregir dejando historial;
- conciliación de terminal y banco;
- zona horaria y fecha de cierre controladas.

## Orden de implementación recomendado

### Sprint 1 — comenzar ahora

1. categorías de movimientos y separación negocio/familia;
2. pagos programados y recurrentes;
3. cuentas de efectivo/banco/terminal;
4. cierre diario;
5. caja comprometida y caja libre a siete días;
6. tablero básico.

### Sprint 2

1. órdenes de compra;
2. mercancía en tránsito;
3. recepción parcial/completa;
4. proveedores y comparación de costos;
5. costo histórico y costo de reposición.

### Sprint 3

1. reglas de margen y bloqueo;
2. precios personalizados con autorización;
3. paquetes con margen combinado;
4. ventas perdidas;
5. puntos de reorden por proveedor.

### Sprint 4

1. cliente mínimo viable y consentimiento;
2. canal y campaña por ticket;
3. seguimiento y recompra;
4. reportes comerciales y de marketing.

## Funciones que no conviene construir todavía

- contabilidad fiscal completa;
- nómina completa;
- campañas automáticas masivas;
- pronósticos complejos con inteligencia artificial;
- demasiados niveles de permisos;
- CRM con decenas de campos;
- automatizaciones que dependan de datos todavía incompletos.

Primero debe funcionar impecablemente el registro diario. Después se automatiza.

## Definición de éxito de la primera versión

Al terminar el Sprint 1, el propietario debe poder abrir el POS y saber en menos de un minuto:

- cuánto dinero existe;
- cuánto ya está comprometido;
- cuánto puede utilizar sin poner en riesgo los siguientes siete días;
- qué pagos vencen hoy y esta semana;
- cuánto vendió y cuánto margen generó;
- cuánto salió para negocio y cuánto para familia.

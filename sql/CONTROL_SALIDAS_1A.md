# Control de salidas 1A

## Alcance implementado

- clasificación obligatoria de movimientos nuevos como negocio o familia;
- categorías compatibles con entradas y salidas;
- beneficiario/proveedor u origen del dinero;
- concepto y notas;
- responsable tomado de la sesión activa;
- cancelación exclusiva del propietario, sin borrar el registro;
- separación de gastos del negocio, retiros familiares e históricos sin clasificar;
- movimientos cancelados excluidos del efectivo esperado y del cierre.

Los movimientos anteriores a esta migración se conservan. Su alcance, categoría,
beneficiario y responsable quedan vacíos porque no es posible deducirlos de forma
confiable; la interfaz los identifica como `Histórico sin clasificar`.

## Orden de instalación

1. Respaldar la base de datos de Supabase.
2. Abrir el SQL Editor del proyecto de Supabase.
3. Ejecutar completo `sql/control_salidas_1a.sql`.
4. Confirmar que se creó la tabla `cash_movement_categories` y que
   `cash_movements` contiene las columnas nuevas.
5. Desplegar o iniciar esta versión del POS.

La interfaz de Turnos requiere que la migración se aplique primero. Si falta, la
pantalla muestra un mensaje con el nombre del archivo SQL pendiente.

## Comprobación funcional

1. Abrir un turno.
2. Registrar una salida del negocio con categoría `Compra a proveedor`.
3. Registrar un retiro familiar.
4. Confirmar que cada importe aparece en su resumen correspondiente.
5. Entrar como propietario, cancelar uno de los movimientos e indicar el motivo.
6. Confirmar que el movimiento sigue visible como cancelado y deja de afectar el
   efectivo estimado.

No se debe intentar borrar un movimiento de caja: la base de datos bloquea esa
operación y obliga a usar la cancelación con historial.

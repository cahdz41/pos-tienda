# Control de cuentas 1B

## Modelo adaptado a Chocholand

| Cobro | Cuenta | Registro |
|---|---|---|
| Efectivo | Caja de tienda | Entrada completa |
| Transferencia | Mercado Pago | Entrada completa |
| Tarjeta | Mercado Pago | Entrada bruta y salida separada por comisión |

La comisión inicial de tarjeta es `4.05%`. Puede cambiarse posteriormente desde
la pantalla `Cuentas` sin modificar código ni afectar movimientos anteriores.

## Activación

1. Respaldar Supabase.
2. Ejecutar `sql/control_cuentas_1b.sql` en el SQL Editor.
3. Desplegar o actualizar la aplicación.
4. Iniciar sesión como propietario y abrir `Cuentas`.
5. Capturar una sola vez:
   - efectivo real existente en Caja;
   - saldo disponible mostrado por Mercado Pago.
6. Confirmar la inicialización.

El momento de confirmación establece el inicio del nuevo libro de movimientos.
No se importan ventas anteriores para evitar duplicarlas dentro del saldo inicial.

## Reglas principales

- El saldo inicial no puede configurarse dos veces.
- Las ventas se contabilizan desde `sale_payments`, incluido su desglose mixto.
- La comisión se redondea a centavos por cada cobro con tarjeta.
- El ingreso de la venta se conserva bruto; la comisión es una salida separada.
- Una venta cancelada conserva y cancela sus movimientos contables.
- Una salida manual exige elegir Caja o Mercado Pago.
- Solo los movimientos asignados a Caja modifican el efectivo esperado del turno.
- Los abonos de clientes también se asignan a Caja o Mercado Pago según su método.

## Prueba recomendada

Después de inicializar, registrar operaciones pequeñas y cancelables:

1. Venta en transferencia por `$100`: Mercado Pago aumenta `$100`.
2. Venta con tarjeta por `$100`: aparecen `+$100`, `-$4.05` y el saldo aumenta `$95.95`.
3. Salida desde Mercado Pago por `$10`: Mercado Pago disminuye `$10`, pero el efectivo esperado no cambia.
4. Salida desde Caja por `$10`: Caja y el efectivo esperado disminuyen `$10`.
5. Anular la venta con tarjeta: los dos movimientos quedan cancelados y el saldo vuelve al valor anterior.

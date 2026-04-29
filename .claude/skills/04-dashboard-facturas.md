---
name: dashboard-facturas
description: "Lee facturas, comprobantes de pago e imágenes de una carpeta y genera un dashboard visual completo con balances, ingresos, gastos, evolución temporal y métricas del negocio. Adaptado para Colombia (COP, Bold CF, Bancolombia, Nequi, PSE, retención en la fuente). Usa esta skill cuando el usuario quiera analizar facturas, ver su facturación, crear un dashboard financiero, revisar ingresos y gastos, o cualquier análisis de documentos contables. Triggers: 'analiza mis facturas', 'dashboard de facturas', 'cuánto he facturado', 'resumen financiero', 'balance de ingresos y gastos', 'métricas de mi negocio', 'gráficos de facturación', 'lee mis facturas', 'analiza mis comprobantes'."
---

# Dashboard de Facturas — Colombia

El usuario te señala una carpeta con facturas o comprobantes de pago (PDF, JPG, PNG, WEBP u otros formatos de imagen). Tú los lees uno a uno, extraes todos los datos y generas un dashboard HTML visual con el análisis financiero completo.

**Regla fundamental: solo reporta datos reales extraídos de los documentos.** No inventes cifras, no redondees para que quede bonito, no asumas datos que no están en los documentos.

---

## Paso 1 — Localizar los documentos

Las facturas y comprobantes pueden estar en:
- `facturas/ingresos/` — pagos que tú recibes (lo que cobras)
- `facturas/gastos/` — pagos que tú realizas (lo que pagas)

Formatos soportados: PDF, JPG, JPEG, PNG, WEBP, y cualquier formato de imagen que Claude pueda leer visualmente.

---

## Paso 2 — Leer los documentos

Lee cada archivo con la herramienta Read. Claude Code puede leer PDFs e imágenes nativamente — no necesitas instalar nada.

### Tipos de documento que puedes encontrar en Colombia

**Comprobante de transferencia bancaria** (Bancolombia, Davivienda, BBVA, Bold CF, Nequi, Daviplata, PSE):
- Campos a extraer: fecha y hora, monto transferido, remitente (nombre + entidad + cuenta), destinatario (nombre + entidad + cuenta/celular), referencia/concepto, número de comprobante/ID de transacción, costo de la transacción

**Factura electrónica DIAN**:
- Campos a extraer: número de factura, fecha de emisión, NIT emisor, NIT receptor, razón social emisor y receptor, concepto/descripción, subtotal, IVA (%), IVA ($), retención en la fuente (si aplica), total

**Recibo de pago / soporte contable**:
- Extraer lo que esté disponible: fecha, monto, partes involucradas, concepto

### Guardar datos extraídos

Guarda todos los datos en `facturas_datos.json`:

```json
{
  "metadata": {
    "generado": "YYYY-MM-DD",
    "rango_fechas": "Mes YYYY – Mes YYYY",
    "titular": "Nombre del titular",
    "moneda": "COP",
    "total_documentos": 9
  },
  "transacciones": [
    {
      "archivo": "nombre-archivo.jpeg",
      "tipo": "ingreso",
      "fecha": "2025-08-16",
      "monto": 490000,
      "remitente": "Yonner Jose Saavedra Rico",
      "destinatario": "Yeider Jose Freites Velasquez",
      "entidad": "Bold CF",
      "referencia": "Transferencia Bold CF",
      "id_comprobante": "0Y1UFG1RCH",
      "iva": null,
      "retencion": null,
      "notas": "comprobante de transferencia — IVA no aplicable"
    }
  ]
}
```

**Sobre IVA y retención en la fuente:**
- Si el documento es un comprobante de transferencia bancaria (Bold CF, Bancolombia, Nequi, etc.), el IVA y la retención NO son visibles — márcalos como `null` con nota "comprobante de transferencia".
- Si es una factura DIAN electrónica, extrae IVA y retención si están presentes.
- **Nunca inventes o calcules impuestos** que no aparezcan explícitamente en el documento.

Después de leer todos los archivos, muestra al usuario:
> "He leído X documentos. Y se leyeron correctamente, Z tuvieron datos incompletos. ¿Quieres revisar antes de generar el dashboard?"

---

## Paso 3 — Calcular métricas

**Ingresos:**
- Total recibido (suma de todos los ingresos)
- Número de transacciones de ingreso
- Promedio por transacción
- Mayor / menor ingreso
- Evolución mensual

**Gastos (si los hay):**
- Total pagado
- Número de transacciones de gasto
- Por proveedor/destinatario

**Balance:**
- Balance neto = total ingresos − total gastos
- Distribución ingresos vs gastos

**Temporal:**
- Evolución mes a mes
- Mejor mes / peor mes
- Meses sin actividad (gaps)
- Tendencia (comparar últimos 3 meses vs anteriores)

**Por contraparte (clientes/proveedores):**
- Ranking por monto total
- % que representa cada uno
- Alerta si un cliente concentra >40% de los ingresos

**IVA (solo si hay facturas DIAN con IVA explícito):**
- IVA generado (ingresos)
- IVA descontable (gastos)
- IVA a pagar estimado

---

## Paso 4 — Generar el dashboard HTML

Crea un archivo HTML autocontenido (`dashboard-facturacion.html`) con todo el análisis.

### Contenido obligatorio

1. **Header** — Nombre del titular, rango de fechas, total de documentos procesados

2. **KPIs principales** — 6 tarjetas grandes:
   - Si hay ingresos y gastos: total ingresos, total gastos, balance neto, nº transacciones, promedio ingreso, período
   - Números en formato colombiano: `$1.290.000` (punto como miles, sin decimales para pesos enteros)

3. **Gráfico de evolución mensual** — Barras CSS/SVG puro (sin Chart.js ni librerías externas):
   - Barras verdes: ingresos por mes
   - Barras rojas: gastos por mes (si los hay)
   - Mostrar todos los meses del rango, incluyendo meses vacíos

4. **Clientes / Proveedores** — Tabla con barra de progreso visual:
   - Para ingresos: por quién pagó (cliente/remitente)
   - Para gastos: a quién se pagó (proveedor/destinatario)

5. **Tabla de detalle** — Todos los documentos ordenados por fecha:
   - Badge de tipo (ingreso verde / gasto rojo)
   - Fecha, remitente → destinatario, entidad, referencia, monto
   - Filtrable por tipo y por mes

6. **Alertas y observaciones**:
   - Concentración en un solo cliente (>40%)
   - Meses sin actividad (gaps)
   - Documentos sin concepto claro
   - IVA no visible si hay comprobantes de transferencia (indicar que puede requerir regularización)

### Requisitos del dashboard

- Responsive (móvil y escritorio)
- Autocontenido (CSS y JS inline, sin dependencias externas)
- Imprimible / exportable a PDF
- Moneda colombiana: `$` COP, formato `$1.290.000`
- Sin columna IRPF (concepto español, no aplica en Colombia)
- Terminología colombiana: "Comprobante", "NIT/Cédula", "Retención en la fuente"
- Colores: verde para ingresos, rojo para gastos, azul/neutro para totales

---

## Paso 5 — Guardar y presentar

- Guarda el dashboard como `dashboard-facturacion.html`
- Guarda los datos en `facturas_datos.json`
- Abre el dashboard automáticamente en el navegador

Presenta un resumen:
1. Documentos leídos correctamente vs con errores
2. Las 3-4 métricas más relevantes
3. Alertas importantes
4. Pregunta si quiere ajustar algo

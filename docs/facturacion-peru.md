# Facturación electrónica en Perú — arquitectura de Nova Lab

## Cómo funciona el sistema peruano (SUNAT)

Todo comprobante de pago electrónico (CPE) en Perú debe:

1. Generarse como **XML UBL 2.1** con la estructura que define SUNAT
   (factura `01`, boleta `03`, notas de crédito/débito `07`/`08`).
2. **Firmarse digitalmente** con un certificado tributario del emisor.
3. **Enviarse a SUNAT** para su validación, que responde con un **CDR**
   (Constancia De Recepción) aceptando o rechazando el documento.
4. Cumplir reglas de numeración: **serie** (F001, B001…) + **correlativo
   ascendente** asignado por el emisor, sin reutilizar números.
5. Las **boletas** se informan además mediante Resumen Diario; la anulación
   se hace por **Comunicación de Baja** (facturas) o en el propio resumen
   (boletas), dentro de plazos de 7 días.

## Vías de integración (evaluadas)

| Vía | Descripción | Esfuerzo | Cuándo conviene |
|---|---|---|---|
| **PSE/OSE con API REST** (NubeFact, APISUNAT) | Envías JSON simple; ellos generan el XML, firman, envían a SUNAT y devuelven CDR + PDF/XML alojados | Bajo | Clínicas pequeñas/medianas: cero manejo de certificados |
| Librería propia (greenter — PHP) | Generas y firmas el XML tú mismo, envías por SOAP | Alto (y es PHP, otro stack) | No aplica a este stack |
| SEE del contribuyente (directo a SUNAT) | SOAP `billService`, ZIP+XML firmado, gestión de CDR y contingencias | Muy alto | Volumen enorme, equipo dedicado |

**Decisión: adaptador NubeFact** (`src/lib/integrations/billing/nubefact.ts`).
Es un PSE/OSE autorizado con API estable: una **ruta única** por empresa y un
**token**. Nova Lab arma el JSON (desglose de IGV, catálogo 06 de documentos
de identidad, unidad `ZZ` para servicios), NubeFact hace el resto y devuelve
los enlaces `enlace_del_pdf` / `enlace_del_xml` / CDR, que se guardan en
`LIS_invoices.pdf_url/xml_url`.

> ¿Por qué no un microservicio aparte? El patrón `BillingProvider` ya aísla
> al proveedor detrás de una interfaz; un servicio separado duplicaría
> despliegue y auth sin aportar nada a este volumen. Si algún día se
> factura desde varios sistemas, se extrae este adaptador tal cual.

## Configuración

```bash
# .env — cuenta NubeFact (menú Integraciones → API)
NUBEFACT_API_URL="https://api.nubefact.com/api/v1/xxxxxxxx-xxxx-xxxx"
NUBEFACT_TOKEN="xxxxxxxxxxxxxxxxxxxx"
```

En **Configuración → Facturación** selecciona el proveedor **NubeFact**,
define la serie (B001/F001) y el IGV. Sin credenciales, el adaptador opera
en **modo simulación** (igual que Wally) para desarrollo y demos.
También pueden guardarse credenciales por tenant en
`LIS_billing_integrations.config` (`nubefact_ruta`, `nubefact_token`).

## Detalles del adaptador

- **Correlativo**: lo asigna `billing-core` contando comprobantes emitidos
  por organización+serie (`numero = emitidas + 1`). Nota: bajo concurrencia
  extrema dos emisiones simultáneas podrían chocar; si el volumen crece,
  reemplazar por una secuencia en Postgres por serie (mismo patrón que
  `LIS_order_counters`).
- **Boleta vs factura**: `config.tipo_comprobante`. La factura exige RUC
  (catálogo 06 tipo 6); si el cliente no tiene RUC se degrada a boleta.
- **Precios**: el catálogo de Nova Lab incluye IGV; el adaptador desglosa
  `valor_unitario` (sin IGV) y `precio_unitario` (con IGV) por ítem.
- **Anulación** (pendiente): NubeFact expone `generar_anulacion` con los
  mismos ruta+token; al implementarla, transicionar `LIS_invoices` a
  `anulada` vía el flujo existente del webhook.

## Roadmap corto

1. Acción "Anular comprobante" (`generar_anulacion`) desde Facturación.
2. Selector boleta/factura por emisión (hoy es configuración fija del tenant).
3. Secuencia Postgres por serie para el correlativo.
4. Consulta de estado (`consultar_comprobante`) para reconciliar `error_sync`.

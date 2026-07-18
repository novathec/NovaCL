# Arquitectura — Nova Lab

## Principios

1. **Multi-tenant por diseño.** Cada fila pertenece a una `organization`. El
   aislamiento se aplica en la base de datos con RLS, no solo en la app.
2. **La seguridad vive en Postgres.** Roles, permisos y visibilidad se resuelven
   con funciones `SECURITY DEFINER` + políticas RLS. La app confía en la sesión.
3. **Modular y escalable.** El catálogo, la facturación y las notificaciones son
   piezas reemplazables detrás de contratos claros.
4. **Trazabilidad total.** Un trigger genérico de auditoría registra cada cambio
   de las entidades críticas con autor, estado anterior y nuevo.

---

## Capas

```
Navegador ──▶ Next.js (App Router)
                ├── Server Components  ─── leen datos con el cliente Supabase (RLS)
                ├── Server Actions     ─── mutaciones + RPC (create_order, upsert_result…)
                ├── Route/Portal       ─── portal público con service role, acotado por token
                └── Middleware         ─── refresco de sesión + protección de rutas
                        │
                        ▼
                Supabase (Postgres + Auth + Storage)
                        ├── Tablas del dominio + RLS
                        ├── Funciones app.* (autorización, rollups)
                        ├── RPC public.* (operaciones de alto nivel)
                        └── Triggers (auditoría, totales, estados)
```

### Clientes Supabase (`src/lib/supabase`)
- `client.ts` — navegador.
- `server.ts` — `createClient()` (respeta RLS con la cookie del usuario) y
  `createAdminClient()` (service role, solo servidor de confianza: portal, webhooks).
- `middleware.ts` — refresco de sesión y guardas de ruta.

### Contexto de sesión (`src/lib/auth/session.ts`)
`getSessionContext()` arma en cada request: perfil, membresías, organización y
sede activas (cookies `nova_org` / `nova_sede`) y los roles efectivos. Los helpers
puros de rol están en `roles.ts` (sin dependencias de servidor, usables en cliente).

---

## Modelo de datos

Migraciones en `supabase/migrations/` (orden numérico):

| Archivo | Contenido |
|---------|-----------|
| `0001_foundation` | Extensiones, esquema `app`, tipos enumerados, utilidades. |
| `0002_tenancy_rbac` | `LIS_organizations`, `LIS_sedes`, `LIS_profiles`, `LIS_memberships` + helpers de autorización. |
| `0003_catalog` | `LIS_test_categories`, `LIS_analytes`, `LIS_reference_ranges`, `LIS_studies`, `LIS_study_analytes`, `LIS_study_prices`, `LIS_specimen_types`. |
| `0004_patients_orders` | `LIS_patients`, `LIS_orders`, `LIS_order_items`, secuencia de códigos de orden. |
| `0005_samples_results` | `LIS_samples`, `LIS_sample_items`, `LIS_results`, evaluación de flag. |
| `0006_delivery_billing` | `LIS_report_documents`, `LIS_result_deliveries`, `LIS_billing_integrations`, `LIS_invoices`, `LIS_invoice_events`. |
| `0007_audit_trace` | `LIS_audit_log` + trigger genérico de auditoría. |
| `0008_business_logic` | Perfil al registrar usuario, totales de orden, rollup de estados, RPC `upsert_result`. |
| `0009_rls_policies` | Habilitación de RLS y políticas por tabla. |
| `0010_views_rpc` | Vista `v_order_overview`, RPC `create_order`, `bootstrap_organization`, `order_timeline`. |
| `0011_scheduling` | `LIS_appointments` (citas), enum `appointment_status`, vista `v_agenda`, RLS y auditoría. |
| `0012_analytics` | RPCs de agregación `analytics_*` (resumen, serie diaria, top estudios, categorías, estados, sedes, facturación) con `security invoker` (respetan RLS). |

### Diagrama lógico (resumen)

```
LIS_organizations 1─* LIS_sedes
LIS_organizations 1─* LIS_memberships *─1 LIS_profiles(auth.users)
LIS_organizations 1─* LIS_patients
LIS_organizations 1─* LIS_orders ─* LIS_order_items *─1 LIS_studies ─* LIS_study_analytes *─1 LIS_analytes
LIS_orders 1─* LIS_samples ─* LIS_sample_items *─1 LIS_order_items
LIS_order_items 1─* LIS_results *─1 LIS_analytes
LIS_orders 1─* LIS_result_deliveries
LIS_orders 1─* LIS_invoices ─* LIS_invoice_events
(*)             LIS_audit_log  ← trigger sobre entidades críticas
```

### Flujo de una atención

```
AGENDA (opcional): cita programada → confirmada → check-in
   └── genera la ORDEN automáticamente (estudios preseleccionados)
       o deriva a /ordenes/nueva enlazando cita → orden
Recepción crea ORDEN (create_order) → items con precio (snapshot)
   → Toma de MUESTRA (barcode, LIS_sample_items) → item pasa a "en_proceso"
      → Analista ingresa RESULTADOS (upsert_result: flag + rango automáticos)
         → Validador FIRMA → item "validado" → rollup → orden "completada"
            → ENTREGA (token de portal / email) → orden "entregada"
               → FACTURACIÓN (Wally) → invoice
Cada transición ↑ queda en LIS_audit_log (trazabilidad).
```

---

## Autorización (RLS)

Funciones `SECURITY DEFINER` en el esquema `app` evitan recursión y centralizan la
lógica:

- `app.member_org_ids()` — organizaciones del usuario.
- `app.member_sede_ids()` — sedes visibles (un `org_admin` ve todas las de su org).
- `app.has_org_role(org, roles[])` / `app.has_sede_role(sede, roles[])`.
- `app.can_admin_org(org)` — admin de organización o superadmin de plataforma.

Patrón general de políticas:
- **SELECT:** la fila pertenece a una organización/sede del usuario.
- **INSERT/UPDATE/DELETE:** además exige el rol adecuado para la operación.
- **Catálogo:** las plantillas globales (`organization_id IS NULL`) son visibles
  para todos; solo se editan las propias de la organización.
- **Auditoría:** lectura para admin/lectura; nunca escritura vía API (solo el
  trigger, que corre como definer).

---

## Puntos de extensión

### Facturación (`src/lib/integrations/billing`)
Contrato `BillingProvider` con `emitInvoice(req)`. Implementaciones: `WallyProvider`
y `ManualProvider`. El `factory` (`index.ts`) elige según la config del tenant
(`LIS_billing_integrations`). Para añadir otro proveedor (p. ej. otro PSE):
1. Crea `mi-proveedor.ts` que implemente `BillingProvider`.
2. Regístralo en `getBillingProvider()`.
Sin credenciales, Wally opera en **modo simulación** (útil para demo).

### Notificaciones (`src/lib/integrations/notifications.ts`)
`sendResultEmail()` usa Resend si hay `RESEND_API_KEY`; si no, modo dev (log).
Se puede extender a SMS/WhatsApp con el mismo patrón de adaptador.

### Catálogo modular
Categorías, analitos y estudios pueden ser **globales** (plantilla compartida,
`organization_id NULL`) o **propios** de una organización. Los estudios se componen
de analitos (`LIS_study_analytes`) y cada analito tiene rangos de referencia por sexo y
edad, con soporte de valores críticos.

### Agendamiento (`/agenda`)
Citas por sede con ciclo de vida propio (`programada → confirmada → en_espera →
atendida`) y enlace opcional a la orden generada (`order_id`). El check-in crea la
orden con `create_order` reutilizando los estudios preseleccionados (`study_ids`),
de modo que agenda y flujo de laboratorio comparten el mismo contrato. La UI ofrece
atajos de teclado (N, ←/→, H, D, S, ?) y búsqueda de paciente navegable con teclado.

### Analítica (`/analitica`)
Los submódulos (Resumen, Producción, Finanzas, Sedes) consumen RPCs `analytics_*`
declaradas `security invoker`: agregan sobre las tablas base y las políticas RLS
acotan automáticamente los datos al tenant. Añadir una métrica nueva = una función
SQL más + su tipado en `database.types.ts`; la UI no accede a tablas crudas.

### Imágenes y módulos futuros (RIS/PACS, interoperabilidad)
El patrón de adaptadores de facturación/notificaciones es el mismo que se usará
para conectar sistemas de imágenes u otros módulos clínicos:
1. Contrato en `src/lib/integrations/<modulo>.ts` (p. ej. `ImagingProvider` con
   `createWorklistEntry()` / `onStudyAvailable()` para HL7 ORM/ORU o DICOM MWL).
2. Configuración por tenant en una tabla `LIS_<modulo>_integrations` (mismo esquema
   que `LIS_billing_integrations`: `provider`, `enabled`, `config`, `credential_ref`).
3. Webhook entrante en `src/app/api/webhooks/<modulo>/route.ts` (patrón Wally).
Los catálogos ya soportan códigos LOINC (`loinc_code` en estudios y analitos), lo
que facilita el mapeo con sistemas externos y estándares HL7/FHIR.

### Roles
Añadir un rol nuevo: extender el enum `app.role`, mapear su etiqueta en
`src/lib/constants.ts` y ajustar `src/lib/nav.ts` y las políticas RLS que
correspondan.

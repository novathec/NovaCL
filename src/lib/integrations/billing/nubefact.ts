import type {
  BillingProvider,
  BillingProviderConfig,
  BillingRequest,
  BillingResult,
} from "./types";

const IGV_RATE = 0.18;

/**
 * Adaptador NubeFact — PSE/OSE autorizado por SUNAT (Perú).
 *
 * NubeFact recibe un JSON simple, genera el XML UBL 2.1, lo firma
 * digitalmente, lo envía a SUNAT y devuelve el CDR junto con los enlaces
 * del PDF/XML. La integración necesita solo dos datos de la cuenta:
 * la RUTA (URL única de la empresa) y el TOKEN.
 *
 *   env: NUBEFACT_API_URL, NUBEFACT_TOKEN
 *   o por tenant: config.nubefact_ruta, config.nubefact_token
 *
 * Sin credenciales opera en modo simulación (demo/desarrollo).
 * El correlativo (`numero`) lo asigna el sistema emisor (billing-core),
 * como exige SUNAT: ascendente y sin huecos por serie.
 */

// Catálogo 06 SUNAT: tipo de documento de identidad
const DOC_TYPE: Record<string, number | string> = {
  RUC: 6,
  DNI: 1,
  CE: 4,
  PASAPORTE: 7,
};

export class NubefactProvider implements BillingProvider {
  readonly name = "nubefact";

  constructor(private readonly cfg: BillingProviderConfig) {}

  async emitInvoice(req: BillingRequest): Promise<BillingResult> {
    const igvRate = Number(this.cfg.config.igv ?? IGV_RATE);
    // Los precios del catálogo incluyen IGV: se desglosa para SUNAT.
    const total = +req.lineas
      .reduce((s, l) => s + l.cantidad * l.precio_unitario, 0)
      .toFixed(2);
    const subtotal = +(total / (1 + igvRate)).toFixed(2);
    const impuestos = +(total - subtotal).toFixed(2);

    const esFactura =
      (this.cfg.config.tipo_comprobante ?? "boleta") === "factura";
    const serie = String(this.cfg.config.serie ?? (esFactura ? "F001" : "B001"));
    const numero = req.numero ?? Math.floor(Date.now() / 1000) % 100_000_000;

    const ruta =
      (this.cfg.config.nubefact_ruta as string | undefined) ??
      process.env.NUBEFACT_API_URL;
    const token =
      (this.cfg.config.nubefact_token as string | undefined) ??
      process.env.NUBEFACT_TOKEN;

    // Sin credenciales → simulación (misma convención que Wally)
    if (!ruta || !token || token === "your-nubefact-token") {
      return {
        ok: true,
        externalId: `${serie}-${numero}`,
        serie,
        numero: String(numero),
        subtotal,
        impuestos,
        total,
        pdfUrl: null,
        raw: { simulated: true, provider: "nubefact" },
      };
    }

    // La factura exige RUC; con otro documento se degrada a boleta.
    const tipoDoc = DOC_TYPE[req.cliente.tipo_documento.toUpperCase()] ?? "-";
    const tipoComprobante = esFactura && tipoDoc === 6 ? 1 : 2;

    const hoy = new Date().toLocaleDateString("es-PE", {
      timeZone: "America/Lima",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });

    const payload = {
      operacion: "generar_comprobante",
      tipo_de_comprobante: tipoComprobante, // 1 factura, 2 boleta
      serie,
      numero,
      sunat_transaction: 1, // venta interna
      cliente_tipo_de_documento: tipoDoc,
      cliente_numero_de_documento: req.cliente.numero_documento,
      cliente_denominacion: req.cliente.nombre,
      cliente_direccion: req.cliente.direccion ?? "",
      cliente_email: req.cliente.email ?? "",
      fecha_de_emision: hoy,
      moneda: req.moneda === "USD" ? 2 : 1,
      porcentaje_de_igv: +(igvRate * 100).toFixed(2),
      total_gravada: subtotal,
      total_igv: impuestos,
      total,
      enviar_automaticamente_a_la_sunat: true,
      enviar_automaticamente_al_cliente: Boolean(req.cliente.email),
      observaciones: `Orden ${req.referencia}`,
      items: req.lineas.map((l) => {
        const totalItem = +(l.cantidad * l.precio_unitario).toFixed(2);
        const subtotalItem = +(totalItem / (1 + igvRate)).toFixed(2);
        return {
          unidad_de_medida: "ZZ", // servicios
          codigo: l.codigo,
          descripcion: l.descripcion,
          cantidad: l.cantidad,
          valor_unitario: +(l.precio_unitario / (1 + igvRate)).toFixed(6),
          precio_unitario: l.precio_unitario,
          subtotal: subtotalItem,
          tipo_de_igv: 1, // gravado - operación onerosa
          igv: +(totalItem - subtotalItem).toFixed(2),
          total: totalItem,
          anticipo_regularizacion: false,
        };
      }),
    };

    try {
      const res = await fetch(ruta, {
        method: "POST",
        headers: {
          Authorization: `Token token="${token}"`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(30_000),
      });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;

      if (!res.ok || data.errors) {
        return {
          ok: false,
          serie,
          numero: String(numero),
          subtotal,
          impuestos,
          total,
          raw: data,
          error: String(data.errors ?? `NubeFact: HTTP ${res.status}`),
        };
      }

      return {
        ok: true,
        externalId: `${serie}-${numero}`,
        serie: String(data.serie ?? serie),
        numero: String(data.numero ?? numero),
        subtotal,
        impuestos,
        total,
        pdfUrl: (data.enlace_del_pdf as string) ?? null,
        xmlUrl: (data.enlace_del_xml as string) ?? null,
        raw: data,
      };
    } catch (e) {
      return {
        ok: false,
        serie,
        numero: String(numero),
        subtotal,
        impuestos,
        total,
        error: `NubeFact: ${(e as Error).message}`,
      };
    }
  }
}

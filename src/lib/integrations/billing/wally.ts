import type {
  BillingProvider,
  BillingProviderConfig,
  BillingRequest,
  BillingResult,
} from "./types";

const IGV_RATE = 0.18; // impuesto (Perú). Configurable por `config.igv`.

/**
 * Adaptador para Wally (facturación electrónica).
 *
 * Nota: los endpoints concretos de Wally se toman de la configuración del
 * tenant (`config`) y de variables de entorno. El mapeo del payload se aísla
 * aquí, de modo que cambios en su API no afecten al resto del sistema.
 */
export class WallyProvider implements BillingProvider {
  readonly name = "wally";

  constructor(private readonly cfg: BillingProviderConfig) {}

  async emitInvoice(req: BillingRequest): Promise<BillingResult> {
    const igvRate = Number(this.cfg.config.igv ?? IGV_RATE);
    // Convención única del sistema: los precios del catálogo INCLUYEN IGV —
    // se desglosa para el comprobante (igual que el adaptador NubeFact).
    const total = +req.lineas
      .reduce((s, l) => s + l.cantidad * l.precio_unitario, 0)
      .toFixed(2);
    const subtotal = +(total / (1 + igvRate)).toFixed(2);
    const impuestos = +(total - subtotal).toFixed(2);

    const baseUrl = this.cfg.apiBaseUrl ?? process.env.WALLY_API_BASE_URL;
    const apiKey = this.cfg.apiKey ?? process.env.WALLY_API_KEY;

    // Sin credenciales → modo simulación (SOLO desarrollo/demo). En
    // producción se falla ruidosamente: una factura simulada registrada
    // como "emitida" es un documento fiscal falso.
    if (!baseUrl || !apiKey || apiKey === "your-wally-api-key") {
      if (process.env.NODE_ENV === "production") {
        return {
          ok: false,
          subtotal,
          impuestos,
          total,
          error: "Facturación no configurada: faltan credenciales del proveedor (Wally).",
        };
      }
      return {
        ok: true,
        externalId: `SIM-${Date.now()}`,
        serie: String(this.cfg.config.serie ?? "F001"),
        numero: String(Math.floor(Math.random() * 90000) + 10000),
        subtotal,
        impuestos,
        total,
        pdfUrl: null,
        raw: { simulated: true },
      };
    }

    try {
      const payload = {
        tipo_comprobante: this.cfg.config.tipo_comprobante ?? "boleta",
        serie: this.cfg.config.serie ?? "B001",
        moneda: req.moneda,
        referencia_externa: req.referencia,
        cliente: {
          tipo_doc: req.cliente.tipo_documento,
          num_doc: req.cliente.numero_documento,
          nombre: req.cliente.nombre,
          email: req.cliente.email ?? undefined,
          direccion: req.cliente.direccion ?? undefined,
        },
        items: req.lineas.map((l) => ({
          descripcion: l.descripcion,
          codigo: l.codigo,
          cantidad: l.cantidad,
          precio_unitario: l.precio_unitario,
        })),
      };

      const res = await fetch(`${baseUrl.replace(/\/$/, "")}/v1/invoices`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const raw = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { ok: false, subtotal, impuestos, total, error: `Wally ${res.status}`, raw };
      }

      return {
        ok: true,
        externalId: raw.id ?? raw.external_id,
        serie: raw.serie,
        numero: raw.numero ?? raw.correlativo,
        subtotal: raw.subtotal ?? subtotal,
        impuestos: raw.igv ?? impuestos,
        total: raw.total ?? total,
        pdfUrl: raw.pdf_url ?? null,
        xmlUrl: raw.xml_url ?? null,
        raw,
      };
    } catch (e) {
      return { ok: false, subtotal, impuestos, total, error: (e as Error).message };
    }
  }
}

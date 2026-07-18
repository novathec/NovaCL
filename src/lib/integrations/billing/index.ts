import type { BillingProvider, BillingProviderConfig, BillingRequest, BillingResult } from "./types";
import { WallyProvider } from "./wally";
import { NubefactProvider } from "./nubefact";

/** Proveedor "manual": registra el comprobante sin integración externa. */
class ManualProvider implements BillingProvider {
  readonly name = "manual";
  constructor(private readonly cfg: BillingProviderConfig) {}
  async emitInvoice(req: BillingRequest): Promise<BillingResult> {
    const subtotal = req.lineas.reduce((s, l) => s + l.cantidad * l.precio_unitario, 0);
    const igv = +(subtotal * Number(this.cfg.config.igv ?? 0.18)).toFixed(2);
    return {
      ok: true,
      serie: String(this.cfg.config.serie ?? "M001"),
      numero: String(Date.now()).slice(-6),
      subtotal,
      impuestos: igv,
      total: +(subtotal + igv).toFixed(2),
    };
  }
}

/**
 * Factory: devuelve el adaptador de facturación según la configuración del
 * tenant. Registrar nuevos proveedores aquí sin tocar el resto del sistema.
 */
export function getBillingProvider(cfg: BillingProviderConfig): BillingProvider {
  switch (cfg.provider) {
    case "nubefact":
      return new NubefactProvider(cfg);
    case "wally":
      return new WallyProvider(cfg);
    case "manual":
    default:
      return new ManualProvider(cfg);
  }
}

export type { BillingProvider, BillingProviderConfig, BillingRequest, BillingResult };

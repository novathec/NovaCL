/**
 * Contrato común de facturación. Cualquier proveedor (Wally, manual, u otro)
 * implementa esta interfaz, de modo que el resto del sistema no dependa de un
 * proveedor concreto. Para agregar uno nuevo basta con crear otro adaptador
 * y registrarlo en el factory.
 */

export type BillingCustomer = {
  tipo_documento: string;
  numero_documento: string;
  nombre: string;
  email?: string | null;
  direccion?: string | null;
};

export type BillingLine = {
  descripcion: string;
  codigo: string;
  cantidad: number;
  precio_unitario: number;
};

export type BillingRequest = {
  moneda: string;
  cliente: BillingCustomer;
  lineas: BillingLine[];
  referencia: string; // código de la orden
  numero?: number; // correlativo SUNAT asignado por el emisor
};

export type BillingResult = {
  ok: boolean;
  externalId?: string;
  serie?: string;
  numero?: string;
  subtotal: number;
  impuestos: number;
  total: number;
  pdfUrl?: string | null;
  xmlUrl?: string | null;
  raw?: unknown;
  error?: string;
};

export interface BillingProvider {
  readonly name: string;
  emitInvoice(req: BillingRequest): Promise<BillingResult>;
}

export type BillingProviderConfig = {
  provider: string;
  enabled: boolean;
  config: Record<string, unknown>;
  apiBaseUrl?: string;
  apiKey?: string;
};

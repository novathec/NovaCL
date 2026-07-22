"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext, hasRole } from "@/lib/auth/session";
import { friendlyDbError, rpcError } from "@/lib/errors";
import type { InventoryMovementType } from "@/lib/database.types";

const ADMIN_ROLES = ["org_admin", "sede_admin"] as const;
const OPERATIVE_ROLES = [
  "org_admin",
  "sede_admin",
  "analista",
  "toma_muestra",
  "recepcion",
] as const;

type Ctx = Awaited<ReturnType<typeof getSessionContext>>;
const MAX_NUMERIC_12_2 = 999_999_999.99; // tope de numeric(12,2)

/** Guards que devuelven error manejable en lugar de lanzar (un throw en una
 *  server action rompe la UI en lugar de mostrar un toast). */
async function inventoryAdminCtx(): Promise<{ ctx: Ctx } | { error: string }> {
  const ctx = await getSessionContext();
  if (!hasRole(ctx.roles, [...ADMIN_ROLES]) && !ctx.profile?.es_superadmin) {
    return { error: "Solo un administrador puede gestionar el catálogo de inventario." };
  }
  return { ctx };
}

async function inventoryOperatorCtx(): Promise<{ ctx: Ctx } | { error: string }> {
  const ctx = await getSessionContext();
  if (!hasRole(ctx.roles, [...OPERATIVE_ROLES]) && !ctx.profile?.es_superadmin) {
    return { error: "No autorizado para registrar movimientos de inventario." };
  }
  return { ctx };
}

/** "Hoy" en la zona horaria operativa (Perú) como fecha ISO YYYY-MM-DD. */
function todayISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());
}

// ── Artículos ────────────────────────────────────────────────
const itemSchema = z.object({
  id: z.string().uuid().optional(),
  codigo: z.string().trim().min(1, "El código es obligatorio").max(40),
  nombre: z.string().trim().min(2, "El nombre es obligatorio").max(200),
  descripcion: z.string().trim().max(1000).optional(),
  categoria: z.string().trim().max(100).optional(),
  tipo: z.enum(["reactivo", "insumo", "consumible", "epp", "equipo", "otro"]),
  unidad: z.string().trim().min(1).max(30),
  stock_minimo: z.number().nonnegative().max(MAX_NUMERIC_12_2).optional(),
  stock_maximo: z.number().nonnegative().max(MAX_NUMERIC_12_2).nullish(),
  requiere_refrigeracion: z.boolean().optional(),
  controlado: z.boolean().optional(),
  ubicacion: z.string().trim().max(200).optional(),
  proveedor: z.string().trim().max(200).optional(),
  codigo_barras: z.string().trim().max(80).optional(),
  costo_referencia: z.number().nonnegative().max(MAX_NUMERIC_12_2).nullish(),
  // Solo URLs del propio bucket de Storage (nada de hotlinks externos)
  imagenes: z
    .array(
      z
        .string()
        .url()
        .refine((u) => u.includes("/storage/v1/object/public/inventory/"), {
          message: "Las imágenes deben subirse al repositorio del sistema.",
        })
    )
    .max(10)
    .optional(),
});

export type SaveItemResult = { ok: true; id: string } | { ok: false; error: string };

export async function saveItemAction(input: unknown): Promise<SaveItemResult> {
  const guard = await inventoryAdminCtx();
  if ("error" in guard) return { ok: false, error: guard.error };
  const ctx = guard.ctx;
  const parsed = itemSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  const d = parsed.data;
  const imagenes = d.imagenes ?? [];

  const supabase = await createClient();
  const row = {
    organization_id: ctx.activeOrgId!,
    codigo: d.codigo,
    nombre: d.nombre,
    descripcion: d.descripcion || null,
    categoria: d.categoria || null,
    tipo: d.tipo,
    unidad: d.unidad,
    stock_minimo: d.stock_minimo ?? 0,
    stock_maximo: d.stock_maximo ?? null,
    requiere_refrigeracion: d.requiere_refrigeracion ?? false,
    controlado: d.controlado ?? false,
    ubicacion: d.ubicacion || null,
    proveedor: d.proveedor || null,
    codigo_barras: d.codigo_barras || null,
    costo_referencia: d.costo_referencia ?? null,
    imagenes,
    imagen_url: imagenes[0] ?? null,
  };

  const query = d.id
    ? supabase.from("LIS_inventory_items").update(row).eq("id", d.id).select("id").single()
    : supabase
        .from("LIS_inventory_items")
        .insert({ ...row, created_by: ctx.user.id })
        .select("id")
        .single();

  const { data: saved, error } = await query;
  revalidatePath("/inventario");
  if (d.id) revalidatePath(`/inventario/${d.id}`);
  if (error) {
    return {
      ok: false,
      error: error.code === "23505" ? "Ya existe un artículo con ese código." : friendlyDbError(error, "No se pudo guardar el artículo."),
    };
  }
  return { ok: true, id: saved.id };
}

export async function toggleItemAction(id: string, activo: boolean) {
  const guard = await inventoryAdminCtx();
  if ("error" in guard) return { ok: false as const, error: guard.error };
  const supabase = await createClient();
  const { error } = await supabase.from("LIS_inventory_items").update({ activo }).eq("id", id);
  revalidatePath("/inventario");
  return error
    ? { ok: false as const, error: friendlyDbError(error, "No se pudo actualizar el artículo.") }
    : { ok: true as const };
}

// ── Movimientos ──────────────────────────────────────────────
const movementSchema = z.object({
  itemId: z.string().uuid(),
  tipo: z.enum(["entrada", "salida", "ajuste", "merma", "transferencia"]),
  cantidad: z.number().nonnegative().max(MAX_NUMERIC_12_2),
  lote: z.string().trim().max(80).optional(),
  vencimiento: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Vencimiento inválido")
    .optional(),
  motivo: z.string().trim().max(300).optional(),
  referencia: z.string().trim().max(120).optional(),
  sedeDestinoId: z.string().uuid().nullish(),
  costoUnitario: z.number().nonnegative().max(MAX_NUMERIC_12_2).nullish(),
});

export type MovementResult = { ok: true } | { ok: false; error: string };

export async function registerMovementAction(input: unknown): Promise<MovementResult> {
  const guard = await inventoryOperatorCtx();
  if ("error" in guard) return { ok: false, error: guard.error };
  const ctx = guard.ctx;
  const parsed = movementSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  const d = parsed.data;
  if (!ctx.activeSedeId) {
    return { ok: false, error: "Selecciona una sede activa para mover inventario." };
  }
  if (d.tipo === "transferencia" && !d.sedeDestinoId) {
    return { ok: false, error: "Elige la sede destino de la transferencia." };
  }
  // El ajuste sí admite 0 (conteo físico en cero); el resto exige cantidad > 0
  if (d.tipo !== "ajuste" && d.cantidad <= 0) {
    return { ok: false, error: "La cantidad debe ser mayor que cero." };
  }
  if (d.tipo === "entrada" && d.vencimiento && d.vencimiento < todayISO()) {
    return { ok: false, error: "El vencimiento no puede ser una fecha pasada." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("inventory_register_movement", {
    p_item_id: d.itemId,
    p_sede_id: ctx.activeSedeId,
    p_tipo: d.tipo as InventoryMovementType,
    p_cantidad: d.cantidad,
    p_lote: d.lote || null,
    p_vencimiento: d.vencimiento || null,
    p_motivo: d.motivo || null,
    p_referencia: d.referencia || null,
    p_sede_destino_id: d.sedeDestinoId ?? null,
    p_costo_unitario: d.costoUnitario ?? null,
  });

  revalidatePath("/inventario");
  revalidatePath(`/inventario/${d.itemId}`);
  if (error) return { ok: false, error: rpcError(error, "No se pudo registrar el movimiento.") };
  return { ok: true };
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext, hasRole } from "@/lib/auth/session";
import { friendlyDbError } from "@/lib/errors";
import type { ValueType } from "@/lib/database.types";

type Ctx = Awaited<ReturnType<typeof getSessionContext>>;

/** Guard de administración del catálogo: devuelve el contexto o un error
 *  manejable por la UI (nunca lanza: un throw rompe el cliente). */
async function catalogAdminCtx(): Promise<{ ctx: Ctx } | { error: string }> {
  const ctx = await getSessionContext();
  if (!hasRole(ctx.roles, ["org_admin", "sede_admin"]) && !ctx.profile?.es_superadmin) {
    return { error: "No autorizado para editar el catálogo." };
  }
  return { ctx };
}

const MAX_NUMERIC_12_2 = 999_999_999.99; // tope de numeric(12,2)

// ── Categorías ───────────────────────────────────────────────
export async function saveCategoryAction(_prev: unknown, formData: FormData) {
  const guard = await catalogAdminCtx();
  if ("error" in guard) return { error: guard.error };
  const ctx = guard.ctx;
  const id = String(formData.get("id") ?? "");
  const codigo = String(formData.get("codigo") ?? "").trim().toUpperCase();
  const nombre = String(formData.get("nombre") ?? "").trim();
  if (!codigo || !nombre) return { error: "Código y nombre son obligatorios." };
  if (codigo.length > 40 || nombre.length > 200) return { error: "Código o nombre demasiado largo." };

  const supabase = await createClient();
  const payload = { organization_id: ctx.activeOrgId!, codigo, nombre };
  const { error } = id
    ? await supabase.from("LIS_test_categories").update(payload).eq("id", id)
    : await supabase.from("LIS_test_categories").insert(payload);
  if (error) {
    return { error: error.code === "23505" ? "Ya existe una categoría con ese código." : friendlyDbError(error, "No se pudo guardar.") };
  }
  revalidatePath("/catalogo");
  return { ok: true };
}

// ── Analitos ─────────────────────────────────────────────────
export async function saveAnalyteAction(_prev: unknown, formData: FormData) {
  const guard = await catalogAdminCtx();
  if ("error" in guard) return { error: guard.error };
  const ctx = guard.ctx;
  const id = String(formData.get("id") ?? "");
  const codigo = String(formData.get("codigo") ?? "").trim().toUpperCase();
  const nombre = String(formData.get("nombre") ?? "").trim();
  const unidad = String(formData.get("unidad") ?? "").trim();
  const metodo = String(formData.get("metodo") ?? "").trim();
  const categoryId = String(formData.get("category_id") ?? "");
  const valueType = String(formData.get("value_type") ?? "numerico") as ValueType;
  const decimales = Number(formData.get("decimales") ?? 2);
  // rango de referencia (opcional, simple)
  const valorMin = formData.get("valor_min");
  const valorMax = formData.get("valor_max");

  if (!codigo || !nombre) return { error: "Código y nombre son obligatorios." };
  if (!["numerico", "texto", "opcion"].includes(valueType)) return { error: "Tipo de valor inválido." };
  if (!Number.isInteger(decimales) || decimales < 0 || decimales > 4) {
    return { error: "Decimales debe ser un entero entre 0 y 4." };
  }

  const minN = valorMin ? Number(valorMin) : null;
  const maxN = valorMax ? Number(valorMax) : null;
  for (const [label, v] of [["mínimo", minN], ["máximo", maxN]] as const) {
    if (v !== null && (!Number.isFinite(v) || Math.abs(v) > MAX_NUMERIC_12_2)) {
      return { error: `El valor ${label} del rango no es válido.` };
    }
  }
  if (minN !== null && maxN !== null && minN > maxN) {
    return { error: "El valor mínimo no puede ser mayor que el valor máximo." };
  }

  const supabase = await createClient();
  const payload = {
    organization_id: ctx.activeOrgId!,
    category_id: categoryId || null,
    codigo,
    nombre,
    unidad: unidad || null,
    metodo: metodo || null,
    value_type: valueType,
    decimales,
  };

  const { data: saved, error } = id
    ? await supabase.from("LIS_analytes").update(payload).eq("id", id).select("id").single()
    : await supabase.from("LIS_analytes").insert(payload).select("id").single();

  if (error) {
    return { error: error.code === "23505" ? "Ya existe un analito con ese código." : friendlyDbError(error, "No se pudo guardar.") };
  }

  // rango de referencia general (solo al crear, si se proporcionó)
  if (!id && valueType === "numerico" && (minN !== null || maxN !== null)) {
    const { error: rangeError } = await supabase.from("LIS_reference_ranges").insert({
      analyte_id: saved.id,
      sexo: "desconocido",
      valor_min: minN,
      valor_max: maxN,
    });
    if (rangeError) {
      return { error: friendlyDbError(rangeError, "El analito se guardó pero no su rango de referencia.") };
    }
  }

  revalidatePath("/catalogo");
  return { ok: true };
}

// ── Estudios (con composición y precio base) ─────────────────
export async function saveStudyAction(_prev: unknown, formData: FormData) {
  const guard = await catalogAdminCtx();
  if ("error" in guard) return { error: guard.error };
  const ctx = guard.ctx;
  const id = String(formData.get("id") ?? "");
  const codigo = String(formData.get("codigo") ?? "").trim().toUpperCase();
  const nombre = String(formData.get("nombre") ?? "").trim();
  const categoryId = String(formData.get("category_id") ?? "");
  const specimenTypeId = String(formData.get("specimen_type_id") ?? "");
  const tatH = formData.get("tiempo_entrega_h");
  const requiereAyuno = formData.get("requiere_ayuno") === "on";
  const precio = Number(formData.get("precio") ?? 0);
  const analyteIds = [...new Set(formData.getAll("analyte_ids").map(String).filter(Boolean))];

  if (!codigo || !nombre) return { error: "Código y nombre son obligatorios." };
  if (analyteIds.length === 0) return { error: "Selecciona al menos un analito." };
  if (!analyteIds.every((a) => z.string().uuid().safeParse(a).success)) {
    return { error: "La composición incluye un analito inválido." };
  }
  if (!Number.isFinite(precio) || precio < 0 || precio > MAX_NUMERIC_12_2) {
    return { error: "El precio debe ser un número entre 0 y 999,999,999.99." };
  }
  const tat = tatH ? Number(tatH) : null;
  if (tat !== null && (!Number.isInteger(tat) || tat < 0 || tat > 8760)) {
    return { error: "El tiempo de entrega debe ser un entero de horas válido (0-8760)." };
  }

  const supabase = await createClient();
  const payload = {
    organization_id: ctx.activeOrgId!,
    category_id: categoryId || null,
    specimen_type_id: specimenTypeId || null,
    codigo,
    nombre,
    tiempo_entrega_h: tat,
    requiere_ayuno: requiereAyuno,
  };

  const { data: study, error } = id
    ? await supabase.from("LIS_studies").update(payload).eq("id", id).select("id").single()
    : await supabase.from("LIS_studies").insert(payload).select("id").single();

  if (error) {
    return { error: error.code === "23505" ? "Ya existe un estudio con ese código." : friendlyDbError(error, "No se pudo guardar.") };
  }

  // Reemplazar composición
  const { error: delError } = await supabase.from("LIS_study_analytes").delete().eq("study_id", study.id);
  if (delError) return { error: friendlyDbError(delError, "No se pudo actualizar la composición.") };
  const { error: compError } = await supabase.from("LIS_study_analytes").insert(
    analyteIds.map((analyte_id, i) => ({ study_id: study.id, analyte_id, orden: i + 1 }))
  );
  if (compError) return { error: friendlyDbError(compError, "No se pudo guardar la composición del estudio.") };

  // Precio base (sede null). Upsert manual: borrar el base vigente y crear.
  const { error: delPriceError } = await supabase
    .from("LIS_study_prices")
    .delete()
    .eq("study_id", study.id)
    .is("sede_id", null);
  if (delPriceError) return { error: friendlyDbError(delPriceError, "No se pudo actualizar el precio.") };
  const { error: priceError } = await supabase.from("LIS_study_prices").insert({
    study_id: study.id,
    sede_id: null,
    moneda: "PEN",
    precio,
  });
  if (priceError) return { error: friendlyDbError(priceError, "El estudio se guardó pero no su precio.") };

  revalidatePath("/catalogo");
  return { ok: true };
}

export async function deleteStudyAction(studyId: string) {
  const guard = await catalogAdminCtx();
  if ("error" in guard) return { error: guard.error };
  const supabase = await createClient();
  const { error } = await supabase.from("LIS_studies").update({ activo: false }).eq("id", studyId);
  if (error) return { error: friendlyDbError(error, "No se pudo dar de baja el estudio.") };
  revalidatePath("/catalogo");
  return { ok: true };
}

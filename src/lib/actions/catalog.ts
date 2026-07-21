"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext, hasRole } from "@/lib/auth/session";
import type { ValueType } from "@/lib/database.types";

async function requireCatalogAdmin() {
  const ctx = await getSessionContext();
  if (!hasRole(ctx.roles, ["org_admin", "sede_admin"]) && !ctx.profile?.es_superadmin) {
    throw new Error("No autorizado para editar el catálogo");
  }
  return ctx;
}

// ── Categorías ───────────────────────────────────────────────
export async function saveCategoryAction(_prev: unknown, formData: FormData) {
  const ctx = await requireCatalogAdmin();
  const id = String(formData.get("id") ?? "");
  const codigo = String(formData.get("codigo") ?? "").trim().toUpperCase();
  const nombre = String(formData.get("nombre") ?? "").trim();
  if (!codigo || !nombre) return { error: "Código y nombre son obligatorios." };

  const supabase = await createClient();
  const payload = { organization_id: ctx.activeOrgId!, codigo, nombre };
  const { error } = id
    ? await supabase.from("LIS_test_categories").update(payload).eq("id", id)
    : await supabase.from("LIS_test_categories").insert(payload);
  if (error) {
    return { error: error.code === "23505" ? "Ya existe una categoría con ese código." : "No se pudo guardar." };
  }
  revalidatePath("/catalogo");
  return { ok: true };
}

// ── Analitos ─────────────────────────────────────────────────
export async function saveAnalyteAction(_prev: unknown, formData: FormData) {
  const ctx = await requireCatalogAdmin();
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

  if (valorMin && valorMax) {
    const minN = Number(valorMin);
    const maxN = Number(valorMax);
    if (Number.isFinite(minN) && Number.isFinite(maxN) && minN > maxN) {
      return { error: "El valor mínimo no puede ser mayor que el valor máximo." };
    }
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
    decimales: Number.isFinite(decimales) ? decimales : 2,
  };

  const { data: saved, error } = id
    ? await supabase.from("LIS_analytes").update(payload).eq("id", id).select("id").single()
    : await supabase.from("LIS_analytes").insert(payload).select("id").single();

  if (error) {
    return { error: error.code === "23505" ? "Ya existe un analito con ese código." : "No se pudo guardar." };
  }

  // rango de referencia general (solo al crear, si se proporcionó)
  if (!id && valueType === "numerico" && (valorMin || valorMax)) {
    await supabase.from("LIS_reference_ranges").insert({
      analyte_id: saved.id,
      sexo: "desconocido",
      valor_min: valorMin ? Number(valorMin) : null,
      valor_max: valorMax ? Number(valorMax) : null,
    });
  }

  revalidatePath("/catalogo");
  return { ok: true };
}

// ── Estudios (con composición y precio base) ─────────────────
export async function saveStudyAction(_prev: unknown, formData: FormData) {
  const ctx = await requireCatalogAdmin();
  const id = String(formData.get("id") ?? "");
  const codigo = String(formData.get("codigo") ?? "").trim().toUpperCase();
  const nombre = String(formData.get("nombre") ?? "").trim();
  const categoryId = String(formData.get("category_id") ?? "");
  const specimenTypeId = String(formData.get("specimen_type_id") ?? "");
  const tatH = formData.get("tiempo_entrega_h");
  const requiereAyuno = formData.get("requiere_ayuno") === "on";
  const precio = Number(formData.get("precio") ?? 0);
  const analyteIds = formData.getAll("analyte_ids").map(String).filter(Boolean);

  if (!codigo || !nombre) return { error: "Código y nombre son obligatorios." };
  if (analyteIds.length === 0) return { error: "Selecciona al menos un analito." };

  const supabase = await createClient();
  const payload = {
    organization_id: ctx.activeOrgId!,
    category_id: categoryId || null,
    specimen_type_id: specimenTypeId || null,
    codigo,
    nombre,
    tiempo_entrega_h: tatH ? Number(tatH) : null,
    requiere_ayuno: requiereAyuno,
  };

  const { data: study, error } = id
    ? await supabase.from("LIS_studies").update(payload).eq("id", id).select("id").single()
    : await supabase.from("LIS_studies").insert(payload).select("id").single();

  if (error) {
    return { error: error.code === "23505" ? "Ya existe un estudio con ese código." : "No se pudo guardar." };
  }

  // Reemplazar composición
  await supabase.from("LIS_study_analytes").delete().eq("study_id", study.id);
  await supabase.from("LIS_study_analytes").insert(
    analyteIds.map((analyte_id, i) => ({ study_id: study.id, analyte_id, orden: i + 1 }))
  );

  // Precio base (sede null). Upsert manual: borrar el base vigente y crear.
  if (Number.isFinite(precio)) {
    await supabase
      .from("LIS_study_prices")
      .delete()
      .eq("study_id", study.id)
      .is("sede_id", null);
    await supabase.from("LIS_study_prices").insert({
      study_id: study.id,
      sede_id: null,
      moneda: "PEN",
      precio,
    });
  }

  revalidatePath("/catalogo");
  return { ok: true };
}

export async function deleteStudyAction(studyId: string) {
  await requireCatalogAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("LIS_studies").update({ activo: false }).eq("id", studyId);
  if (error) return { error: error.message };
  revalidatePath("/catalogo");
  return { ok: true };
}

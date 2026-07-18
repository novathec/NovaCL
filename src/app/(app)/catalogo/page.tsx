import { getSessionContext, hasRole } from "@/lib/auth/session";
import { requireModuleAccess } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  CategoryDialog,
  AnalyteDialog,
  StudyDialog,
  type Option,
  type AnalyteOption,
} from "@/components/catalog/catalog-forms";
import { formatMoney } from "@/lib/utils";

export const metadata = { title: "Catálogo" };

export default async function CatalogoPage() {
  const ctx = await getSessionContext();
  await requireModuleAccess("catalogo");
  const supabase = await createClient();
  const orgId = ctx.activeOrgId!;
  const orFilter = `organization_id.is.null,organization_id.eq.${orgId}`;
  const canEdit = hasRole(ctx.roles, ["org_admin", "sede_admin"]) || !!ctx.profile?.es_superadmin;

  const [{ data: studies }, { data: analytes }, { data: categories }, { data: specimenTypes }] =
    await Promise.all([
      supabase
        .from("LIS_studies")
        .select(
          "id,codigo,nombre,requiere_ayuno,tiempo_entrega_h,category_id,specimen_type_id,organization_id, test_categories:LIS_test_categories(nombre), study_analytes:LIS_study_analytes(analyte_id), study_prices:LIS_study_prices(precio,sede_id)"
        )
        .eq("activo", true)
        .or(orFilter)
        .order("nombre"),
      supabase
        .from("LIS_analytes")
        .select("id,codigo,nombre,unidad,value_type,metodo,category_id,organization_id, test_categories:LIS_test_categories(nombre)")
        .eq("activo", true)
        .or(orFilter)
        .order("nombre"),
      supabase
        .from("LIS_test_categories")
        .select("id,codigo,nombre,organization_id")
        .or(orFilter)
        .order("orden"),
      supabase.from("LIS_specimen_types").select("id,nombre,codigo").eq("activo", true).order("nombre"),
    ]);

  const categoryOptions: Option[] = (categories ?? [])
    .filter((c) => c.organization_id === orgId) // solo se pueden asignar categorías propias
    .map((c) => ({ id: c.id, nombre: c.nombre, codigo: c.codigo }));
  const specimenOptions: Option[] = (specimenTypes ?? []).map((s) => ({ id: s.id, nombre: s.nombre }));
  const analyteOptions: AnalyteOption[] = (analytes ?? [])
    .filter((a) => a.organization_id === orgId)
    .map((a) => ({ id: a.id, nombre: a.nombre, unidad: a.unidad }));

  return (
    <>
      <PageHeader
        title="Catálogo de laboratorio"
        description="Estudios, analitos y categorías. Las plantillas globales son de solo lectura; crea las propias de tu organización."
      >
        {canEdit && (
          <>
            <CategoryDialog />
            <AnalyteDialog categories={categoryOptions} />
            <StudyDialog
              categories={categoryOptions}
              specimenTypes={specimenOptions}
              analytes={analyteOptions}
            />
          </>
        )}
      </PageHeader>

      <Tabs defaultValue="estudios">
        <TabsList>
          <TabsTrigger value="estudios">Estudios ({studies?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="analitos">Analitos ({analytes?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="categorias">Categorías ({categories?.length ?? 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="estudios">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Estudio</TableHead>
                    <TableHead>Categoría</TableHead>
                    <TableHead>Analitos</TableHead>
                    <TableHead>Precio</TableHead>
                    <TableHead>Origen</TableHead>
                    {canEdit && <TableHead className="text-right">Editar</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {studies?.map((s) => {
                    const own = s.organization_id === orgId;
                    const composition = (s.study_analytes as unknown as { analyte_id: string }[]) ?? [];
                    const prices = (s.study_prices as unknown as { precio: number; sede_id: string | null }[]) ?? [];
                    const base = prices.find((p) => p.sede_id === null)?.precio ?? 0;
                    return (
                      <TableRow key={s.id}>
                        <TableCell className="text-sm">{s.codigo}</TableCell>
                        <TableCell className="font-medium">
                          {s.nombre}
                          {s.requiere_ayuno && (
                            <Badge className="ml-2 bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                              Ayuno
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {(s.test_categories as unknown as { nombre: string } | null)?.nombre ?? "—"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{composition.length}</TableCell>
                        <TableCell className="text-sm">{formatMoney(base)}</TableCell>
                        <TableCell>
                          <Badge className={own ? "bg-primary/10 text-primary" : "bg-muted text-foreground"}>
                            {own ? "Propio" : "Global"}
                          </Badge>
                        </TableCell>
                        {canEdit && (
                          <TableCell className="text-right">
                            {own ? (
                              <StudyDialog
                                categories={categoryOptions}
                                specimenTypes={specimenOptions}
                                analytes={analyteOptions}
                                study={{
                                  id: s.id,
                                  codigo: s.codigo,
                                  nombre: s.nombre,
                                  category_id: s.category_id,
                                  specimen_type_id: s.specimen_type_id,
                                  tiempo_entrega_h: s.tiempo_entrega_h,
                                  requiere_ayuno: s.requiere_ayuno,
                                  analyteIds: composition.map((c) => c.analyte_id),
                                  precio: base,
                                }}
                              />
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analitos">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Analito</TableHead>
                    <TableHead>Unidad</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Método</TableHead>
                    <TableHead>Origen</TableHead>
                    {canEdit && <TableHead className="text-right">Editar</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analytes?.map((a) => {
                    const own = a.organization_id === orgId;
                    return (
                      <TableRow key={a.id}>
                        <TableCell className="text-sm">{a.codigo}</TableCell>
                        <TableCell className="font-medium">{a.nombre}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{a.unidad ?? "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{a.value_type}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{a.metodo ?? "—"}</TableCell>
                        <TableCell>
                          <Badge className={own ? "bg-primary/10 text-primary" : "bg-muted text-foreground"}>
                            {own ? "Propio" : "Global"}
                          </Badge>
                        </TableCell>
                        {canEdit && (
                          <TableCell className="text-right">
                            {own ? (
                              <AnalyteDialog
                                categories={categoryOptions}
                                analyte={{
                                  id: a.id,
                                  codigo: a.codigo,
                                  nombre: a.nombre,
                                  unidad: a.unidad,
                                  metodo: a.metodo,
                                  value_type: a.value_type,
                                  category_id: a.category_id,
                                }}
                              />
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="categorias">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Categoría</TableHead>
                    <TableHead>Origen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categories?.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="text-sm">{c.codigo}</TableCell>
                      <TableCell className="font-medium">{c.nombre}</TableCell>
                      <TableCell>
                        <Badge className={c.organization_id ? "bg-primary/10 text-primary" : "bg-muted text-foreground"}>
                          {c.organization_id ? "Propio" : "Global"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}

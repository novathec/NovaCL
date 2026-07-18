import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FLAG_LABELS, FLAG_COLORS } from "@/lib/constants";
import { cn, calcAge, formatDate } from "@/lib/utils";
import type { ResultFlag } from "@/lib/database.types";

export type ReportAnalyte = {
  nombre: string;
  valor: string;
  unidad: string | null;
  rango: string | null;
  flag: ResultFlag | null;
};
export type ReportStudy = { nombre: string; analytes: ReportAnalyte[] };

export type ReportData = {
  organizacion: string;
  sede: string;
  /** true si el reporte incluye resultados aún no validados. */
  preliminar: boolean;
  codigo: string;
  fecha: string;
  paciente: string;
  documento: string;
  sexo: string;
  edad: string | null;
  fechaNacimiento: string | null;
  medico: string | null;
  studies: ReportStudy[];
};

export function ResultsReport({ data }: { data: ReportData }) {
  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Organización" value={data.organizacion} />
          <Field label="Sede" value={data.sede} />
          <Field label="Orden" value={data.codigo} mono />
          <Field label="Fecha" value={formatDate(data.fecha, true)} />
          <Field label="Paciente" value={data.paciente} />
          <Field label="Documento" value={data.documento} />
          <Field
            label="Edad / Sexo"
            value={`${data.fechaNacimiento ? calcAge(data.fechaNacimiento) : data.edad ?? "—"} · ${
              data.sexo === "F" ? "F" : data.sexo === "M" ? "M" : "—"
            }`}
          />
          <Field label="Médico" value={data.medico ?? "—"} />
        </CardContent>
      </Card>

      {data.studies.map((study) => (
        <Card key={study.nombre}>
          <CardContent className="p-0">
            <div className="border-b bg-muted/40 px-4 py-2 font-semibold">{study.nombre}</div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[35%]">Analito</TableHead>
                  <TableHead>Resultado</TableHead>
                  <TableHead>Unidad</TableHead>
                  <TableHead>Valores de referencia</TableHead>
                  <TableHead>Indicador</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {study.analytes.map((a) => {
                  const abnormal = a.flag && a.flag !== "normal";
                  return (
                    <TableRow key={a.nombre}>
                      <TableCell className="font-medium">{a.nombre}</TableCell>
                      <TableCell className={cn(abnormal && "font-semibold", a.flag && FLAG_COLORS[a.flag])}>
                        {a.valor || "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{a.unidad ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{a.rango ?? "—"}</TableCell>
                      <TableCell>
                        {a.flag ? (
                          <span className={cn("text-sm", FLAG_COLORS[a.flag])}>{FLAG_LABELS[a.flag]}</span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("text-sm font-medium", mono && "font-mono")}>{value}</p>
    </div>
  );
}

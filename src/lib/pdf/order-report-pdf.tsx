import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { ReportData } from "@/components/results/results-report";
import type { ResultFlag } from "@/lib/database.types";

const FLAG_TEXT: Record<ResultFlag, string> = {
  normal: "Normal",
  bajo: "Bajo",
  alto: "Alto",
  critico_bajo: "CRÍTICO BAJO",
  critico_alto: "CRÍTICO ALTO",
  anormal: "Anormal",
};

const TEAL = "#0e8b8b";
const BLUE = "#2456b8";
const RED = "#c0392b";
const MUTED = "#6b7a86";
const BORDER = "#dde5e9";

const s = StyleSheet.create({
  page: { padding: 36, fontSize: 9, color: "#1d2b33", fontFamily: "Helvetica" },
  headerBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    borderBottomWidth: 2,
    borderBottomColor: TEAL,
    paddingBottom: 8,
    marginBottom: 12,
  },
  org: { fontSize: 14, fontFamily: "Helvetica-Bold", color: TEAL },
  headRight: { textAlign: "right", color: MUTED, fontSize: 8 },
  patientGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 4,
    padding: 8,
    marginBottom: 14,
  },
  field: { width: "25%", paddingVertical: 2, paddingRight: 8 },
  fieldLabel: { fontSize: 6.5, color: MUTED, textTransform: "uppercase" },
  fieldValue: { fontSize: 9, fontFamily: "Helvetica-Bold" },
  studyTitle: {
    backgroundColor: "#eef6f6",
    color: TEAL,
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
    paddingVertical: 4,
    paddingHorizontal: 6,
    marginTop: 10,
  },
  row: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: BORDER,
    paddingVertical: 3.5,
    paddingHorizontal: 6,
  },
  th: { fontFamily: "Helvetica-Bold", fontSize: 7, color: MUTED, textTransform: "uppercase" },
  cAnalito: { width: "34%" },
  cValor: { width: "18%" },
  cUnidad: { width: "14%" },
  cRango: { width: "22%" },
  cFlag: { width: "12%" },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 36,
    right: 36,
    borderTopWidth: 0.5,
    borderTopColor: BORDER,
    paddingTop: 6,
    fontSize: 7,
    color: MUTED,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  watermark: {
    position: "absolute",
    top: "40%",
    left: 0,
    right: 0,
    textAlign: "center",
    fontSize: 64,
    color: "#c0392b",
    opacity: 0.12,
    fontFamily: "Helvetica-Bold",
    transform: "rotate(-25deg)",
  },
});

function flagColor(flag: ResultFlag | null): string {
  if (!flag || flag === "normal") return "#1d2b33";
  if (flag === "critico_alto" || flag === "critico_bajo") return RED;
  if (flag === "anormal") return BLUE;
  return "#a3610e";
}

export function OrderReportPdf({
  data,
  version,
  preliminar = false,
}: {
  data: ReportData;
  version: number;
  preliminar?: boolean;
}) {
  const emitido = new Date().toLocaleString("es-PE", { timeZone: "America/Lima" });
  return (
    <Document
      title={`Reporte ${data.codigo} v${version}`}
      author={data.organizacion}
      subject="Reporte de resultados de laboratorio"
    >
      <Page size="A4" style={s.page}>
        {preliminar && <Text style={s.watermark}>PRELIMINAR</Text>}

        <View style={s.headerBar}>
          <View>
            <Text style={s.org}>{data.organizacion}</Text>
            <Text style={{ color: MUTED, fontSize: 8 }}>{data.sede}</Text>
          </View>
          <View style={s.headRight}>
            <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 10, color: "#1d2b33" }}>
              Reporte de resultados
            </Text>
            <Text>Orden {data.codigo} · versión {version}</Text>
          </View>
        </View>

        <View style={s.patientGrid}>
          <View style={s.field}>
            <Text style={s.fieldLabel}>Paciente</Text>
            <Text style={s.fieldValue}>{data.paciente}</Text>
          </View>
          <View style={s.field}>
            <Text style={s.fieldLabel}>Documento</Text>
            <Text style={s.fieldValue}>{data.documento}</Text>
          </View>
          <View style={s.field}>
            <Text style={s.fieldLabel}>Sexo</Text>
            <Text style={s.fieldValue}>{data.sexo || "—"}</Text>
          </View>
          <View style={s.field}>
            <Text style={s.fieldLabel}>Fecha de orden</Text>
            <Text style={s.fieldValue}>{new Date(data.fecha).toLocaleDateString("es-PE")}</Text>
          </View>
          <View style={s.field}>
            <Text style={s.fieldLabel}>Médico solicitante</Text>
            <Text style={s.fieldValue}>{data.medico ?? "—"}</Text>
          </View>
        </View>

        {data.studies.map((study) => (
          <View key={study.nombre} wrap={false}>
            <Text style={s.studyTitle}>{study.nombre}</Text>
            <View style={s.row}>
              <Text style={[s.th, s.cAnalito]}>Analito</Text>
              <Text style={[s.th, s.cValor]}>Resultado</Text>
              <Text style={[s.th, s.cUnidad]}>Unidad</Text>
              <Text style={[s.th, s.cRango]}>Referencia</Text>
              <Text style={[s.th, s.cFlag]}>Indicador</Text>
            </View>
            {study.analytes.map((a) => (
              <View key={a.nombre} style={s.row}>
                <Text style={s.cAnalito}>{a.nombre}</Text>
                <Text
                  style={[
                    s.cValor,
                    { color: flagColor(a.flag) },
                    a.flag && a.flag !== "normal" ? { fontFamily: "Helvetica-Bold" } : {},
                  ]}
                >
                  {a.valor || "—"}
                </Text>
                <Text style={[s.cUnidad, { color: MUTED }]}>{a.unidad ?? "—"}</Text>
                <Text style={[s.cRango, { color: MUTED }]}>{a.rango ?? "—"}</Text>
                <Text style={[s.cFlag, { color: flagColor(a.flag), fontSize: 7.5 }]}>
                  {a.flag ? FLAG_TEXT[a.flag] : "—"}
                </Text>
              </View>
            ))}
          </View>
        ))}

        <View style={s.footer} fixed>
          <Text>
            {preliminar
              ? "DOCUMENTO PRELIMINAR — contiene resultados sin validar."
              : "Resultados validados por el laboratorio. Consulte a su médico para la interpretación."}
          </Text>
          <Text
            render={({ pageNumber, totalPages }) =>
              `Emitido ${emitido} · pág. ${pageNumber}/${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}

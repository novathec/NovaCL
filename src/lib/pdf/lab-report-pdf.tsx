import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { ConsolidatedReport, IsoOrder } from "@/lib/consolidated-report";
import type { ResultFlag } from "@/lib/database.types";

/**
 * Informe de resultados alineado a ISO 15189:
 * - Identificación del laboratorio y del paciente repetida en cada página.
 * - Por orden: fecha de solicitud, médico, muestras con fecha de toma y
 *   recepción, método analítico por analito, intervalos de referencia.
 * - Firma de validación (quién y cuándo) por estudio.
 * - Identificador único de informe, paginación "x de y" y marca de fin.
 */

const FLAG_TEXT: Record<ResultFlag, string> = {
  normal: "Normal",
  bajo: "Bajo",
  alto: "Alto",
  critico_bajo: "CRÍTICO ↓",
  critico_alto: "CRÍTICO ↑",
  anormal: "Anormal",
};

const TEAL = "#0e8b8b";
const RED = "#c0392b";
const AMBER = "#a3610e";
const BLUE = "#2456b8";
const INK = "#1d2b33";
const MUTED = "#6b7a86";
const BORDER = "#dde5e9";

const s = StyleSheet.create({
  page: { paddingTop: 96, paddingBottom: 64, paddingHorizontal: 36, fontSize: 8.5, color: INK, fontFamily: "Helvetica" },
  // Cabecera fija (cada página): laboratorio + identificación del paciente
  fixedHeader: {
    position: "absolute",
    top: 24,
    left: 36,
    right: 36,
  },
  headTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    borderBottomWidth: 2,
    borderBottomColor: TEAL,
    paddingBottom: 6,
  },
  org: { fontSize: 13, fontFamily: "Helvetica-Bold", color: TEAL },
  headRight: { textAlign: "right", color: MUTED, fontSize: 7.5 },
  patientLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 4,
    fontSize: 7.5,
    color: MUTED,
  },
  patientStrong: { fontFamily: "Helvetica-Bold", color: INK },

  // Bloque de datos del paciente (solo primera página)
  patientGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 4,
    padding: 8,
    marginBottom: 12,
  },
  field: { width: "25%", paddingVertical: 2, paddingRight: 8 },
  fieldLabel: { fontSize: 6.5, color: MUTED, textTransform: "uppercase" },
  fieldValue: { fontSize: 9, fontFamily: "Helvetica-Bold" },

  // Sección de orden
  orderBar: {
    backgroundColor: TEAL,
    color: "#ffffff",
    borderRadius: 3,
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginTop: 10,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  orderTitle: { fontFamily: "Helvetica-Bold", fontSize: 9.5 },
  orderMeta: { fontSize: 7.5, color: MUTED, marginTop: 3, marginBottom: 2, paddingHorizontal: 2 },
  sampleLine: { fontSize: 7.5, color: MUTED, paddingHorizontal: 2 },

  studyTitle: {
    backgroundColor: "#eef6f6",
    color: TEAL,
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    paddingVertical: 3.5,
    paddingHorizontal: 6,
    marginTop: 6,
  },
  row: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: BORDER,
    paddingVertical: 3,
    paddingHorizontal: 6,
  },
  th: { fontFamily: "Helvetica-Bold", fontSize: 6.5, color: MUTED, textTransform: "uppercase" },
  cAnalito: { width: "26%" },
  cValor: { width: "14%" },
  cUnidad: { width: "11%" },
  cRango: { width: "21%" },
  cMetodo: { width: "18%" },
  cFlag: { width: "10%" },
  validacion: {
    fontSize: 7,
    color: MUTED,
    paddingHorizontal: 6,
    paddingVertical: 3,
    fontFamily: "Helvetica-Oblique",
  },

  endMark: {
    textAlign: "center",
    color: MUTED,
    fontSize: 8,
    marginTop: 16,
    letterSpacing: 2,
  },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 36,
    right: 36,
    borderTopWidth: 0.5,
    borderTopColor: BORDER,
    paddingTop: 5,
    fontSize: 6.5,
    color: MUTED,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  watermark: {
    position: "absolute",
    top: "42%",
    left: 0,
    right: 0,
    textAlign: "center",
    fontSize: 64,
    color: RED,
    opacity: 0.1,
    fontFamily: "Helvetica-Bold",
    transform: "rotate(-25deg)",
  },
});

function flagColor(flag: ResultFlag | null): string {
  if (!flag || flag === "normal") return INK;
  if (flag === "critico_alto" || flag === "critico_bajo") return RED;
  if (flag === "anormal") return BLUE;
  return AMBER;
}

const fmtDT = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("es-PE", {
        timeZone: "America/Lima",
        dateStyle: "short",
        timeStyle: "short",
      })
    : "—";

function OrderSection({ orden }: { orden: IsoOrder }) {
  return (
    <View>
      <View style={s.orderBar} wrap={false}>
        <Text style={s.orderTitle}>Orden {orden.codigo}</Text>
        <Text style={{ fontSize: 8 }}>Solicitada: {fmtDT(orden.fecha)}</Text>
      </View>
      <Text style={s.orderMeta}>
        Médico solicitante: {orden.medico ?? "—"}
        {orden.diagnostico ? ` · Dx: ${orden.diagnostico}` : ""}
      </Text>
      {orden.samples.map((m, i) => (
        <Text key={i} style={s.sampleLine}>
          Muestra: {m.tipo}
          {m.barcode ? ` · ${m.barcode}` : ""} · Toma: {fmtDT(m.tomadaAt)} · Recepción:{" "}
          {fmtDT(m.recibidaAt)}
        </Text>
      ))}

      {orden.studies.map((study) => (
        <View key={study.nombre} wrap={false}>
          <Text style={s.studyTitle}>{study.nombre}</Text>
          <View style={s.row}>
            <Text style={[s.th, s.cAnalito]}>Analito</Text>
            <Text style={[s.th, s.cValor]}>Resultado</Text>
            <Text style={[s.th, s.cUnidad]}>Unidad</Text>
            <Text style={[s.th, s.cRango]}>Intervalo de referencia</Text>
            <Text style={[s.th, s.cMetodo]}>Método</Text>
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
              <Text style={[s.cMetodo, { color: MUTED, fontSize: 7 }]}>{a.metodo ?? "—"}</Text>
              <Text style={[s.cFlag, { color: flagColor(a.flag), fontSize: 7 }]}>
                {a.flag ? FLAG_TEXT[a.flag] : "—"}
              </Text>
            </View>
          ))}
          <Text style={s.validacion}>
            {study.validadoPor
              ? `Validado por ${study.validadoPor} — ${fmtDT(study.validadoAt)}`
              : "Resultado sin validación registrada."}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function LabReportPdf({
  data,
  version,
}: {
  data: ConsolidatedReport;
  version?: number;
}) {
  const consolidado = data.ordenes.length > 1;
  const titulo = consolidado ? "Informe consolidado de resultados" : "Informe de resultados";
  return (
    <Document title={`${data.reportId} · ${data.paciente}`} author={data.organizacion} subject={titulo}>
      <Page size="A4" style={s.page}>
        {data.preliminar && <Text style={s.watermark} fixed>PRELIMINAR</Text>}

        {/* Cabecera fija: laboratorio + identificación del paciente en cada página */}
        <View style={s.fixedHeader} fixed>
          <View style={s.headTop}>
            <View>
              <Text style={s.org}>{data.organizacion}</Text>
              <Text style={{ color: MUTED, fontSize: 7.5 }}>{data.sede}</Text>
            </View>
            <View style={s.headRight}>
              <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 9.5, color: INK }}>{titulo}</Text>
              <Text>
                N.º {data.reportId}
                {version ? ` · v${version}` : ""}
              </Text>
            </View>
          </View>
          <View style={s.patientLine}>
            <Text>
              Paciente: <Text style={s.patientStrong}>{data.paciente}</Text> · {data.documento}
            </Text>
            <Text>
              {data.fechaNacimiento
                ? `Nac.: ${new Date(data.fechaNacimiento + "T12:00:00").toLocaleDateString("es-PE")}`
                : ""}
              {" · "}Sexo: {data.sexo || "—"}
            </Text>
          </View>
        </View>

        {/* Resumen (solo primera página) */}
        <View style={s.patientGrid}>
          <View style={s.field}>
            <Text style={s.fieldLabel}>Fecha de emisión</Text>
            <Text style={s.fieldValue}>{fmtDT(data.emitidoAt)}</Text>
          </View>
          <View style={s.field}>
            <Text style={s.fieldLabel}>Órdenes incluidas</Text>
            <Text style={s.fieldValue}>
              {data.ordenes.map((o) => o.codigo).join(" · ") || "—"}
            </Text>
          </View>
          <View style={s.field}>
            <Text style={s.fieldLabel}>Periodo</Text>
            <Text style={s.fieldValue}>
              {data.ordenes.length > 0
                ? `${fmtDT(data.ordenes[0].fecha).split(",")[0]} – ${fmtDT(
                    data.ordenes[data.ordenes.length - 1].fecha
                  ).split(",")[0]}`
                : "—"}
            </Text>
          </View>
          <View style={s.field}>
            <Text style={s.fieldLabel}>Documento</Text>
            <Text style={s.fieldValue}>{data.reportId}</Text>
          </View>
        </View>

        {data.ordenes.map((orden) => (
          <OrderSection key={orden.codigo} orden={orden} />
        ))}

        <Text style={s.endMark}>— FIN DEL INFORME —</Text>

        <View style={s.footer} fixed>
          <Text>
            {data.preliminar
              ? "DOCUMENTO PRELIMINAR — contiene resultados sin validar."
              : "Resultados validados. Los valores fuera del intervalo de referencia se indican con su marca. Consulte a su médico para la interpretación."}
          </Text>
          <Text
            render={({ pageNumber, totalPages }) => `${data.reportId} · pág. ${pageNumber} de ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}

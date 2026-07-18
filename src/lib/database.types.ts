/**
 * Tipos de la base de datos.
 *
 * En un entorno con Supabase CLI, regenerar con:
 *   npm run db:types   (supabase gen types typescript --local)
 *
 * Este archivo esta escrito a mano para reflejar el esquema de las migraciones
 * y dar tipado al cliente mientras no se ejecute la generacion automatica.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// ─────────────────────────────────────────────────────────────
// Enums del dominio (esquema app)
// ─────────────────────────────────────────────────────────────
export type Role =
  | "org_admin"
  | "sede_admin"
  | "recepcion"
  | "toma_muestra"
  | "analista"
  | "validador"
  | "facturacion"
  | "medico"
  | "lectura";

export type OrderStatus =
  | "registrada"
  | "en_toma"
  | "en_proceso"
  | "parcial"
  | "completada"
  | "entregada"
  | "anulada";

export type OrderPriority = "rutina" | "urgente" | "stat";

export type ItemStatus =
  | "pendiente"
  | "en_proceso"
  | "resultado_cargado"
  | "validado"
  | "rechazado"
  | "anulado";

export type SampleStatus =
  | "pendiente"
  | "tomada"
  | "en_transito"
  | "recibida"
  | "en_analisis"
  | "procesada"
  | "rechazada";

export type ResultStatus =
  | "pendiente"
  | "preliminar"
  | "validado"
  | "rechazado"
  | "corregido";

export type ResultFlag =
  | "normal"
  | "bajo"
  | "alto"
  | "critico_bajo"
  | "critico_alto"
  | "anormal";

export type AppointmentStatus =
  | "programada"
  | "confirmada"
  | "en_espera"
  | "atendida"
  | "no_asistio"
  | "cancelada";

export type ValueType = "numerico" | "texto" | "opcion" | "titulo";
export type Sex = "M" | "F" | "otro" | "desconocido";
export type DeliveryChannel = "portal" | "email" | "sms" | "whatsapp" | "impreso";
export type DeliveryStatus = "pendiente" | "enviado" | "visto" | "fallido";
export type InvoiceStatus = "borrador" | "emitida" | "pagada" | "anulada" | "error_sync";

// ─────────────────────────────────────────────────────────────
// Helper para declarar tablas de forma compacta
// ─────────────────────────────────────────────────────────────
type Table<Row> = {
  Row: Row;
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: [];
};

export interface Database {
  public: {
    Tables: {
      LIS_organizations: Table<{
        id: string;
        slug: string;
        nombre: string;
        ruc: string | null;
        logo_url: string | null;
        timezone: string;
        locale: string;
        activo: boolean;
        settings: Json;
        created_at: string;
        updated_at: string;
      }>;
      LIS_sedes: Table<{
        id: string;
        organization_id: string;
        codigo: string;
        nombre: string;
        direccion: string | null;
        telefono: string | null;
        email: string | null;
        es_procesadora: boolean;
        activo: boolean;
        settings: Json;
        created_at: string;
        updated_at: string;
      }>;
      LIS_profiles: Table<{
        id: string;
        email: string;
        nombre: string;
        telefono: string | null;
        avatar_url: string | null;
        es_superadmin: boolean;
        created_at: string;
        updated_at: string;
      }>;
      LIS_memberships: Table<{
        id: string;
        organization_id: string;
        sede_id: string | null;
        user_id: string;
        role: Role;
        activo: boolean;
        created_at: string;
        updated_at: string;
      }>;
      LIS_specimen_types: Table<{
        id: string;
        codigo: string;
        nombre: string;
        descripcion: string | null;
        activo: boolean;
      }>;
      LIS_test_categories: Table<{
        id: string;
        organization_id: string | null;
        codigo: string;
        nombre: string;
        descripcion: string | null;
        orden: number;
        activo: boolean;
        created_at: string;
      }>;
      LIS_analytes: Table<{
        id: string;
        organization_id: string | null;
        category_id: string | null;
        codigo: string;
        nombre: string;
        abreviatura: string | null;
        loinc_code: string | null;
        unidad: string | null;
        value_type: ValueType;
        opciones: Json | null;
        decimales: number;
        metodo: string | null;
        orden: number;
        activo: boolean;
        created_at: string;
        updated_at: string;
      }>;
      LIS_reference_ranges: Table<{
        id: string;
        analyte_id: string;
        sexo: Sex;
        edad_min_dias: number | null;
        edad_max_dias: number | null;
        valor_min: number | null;
        valor_max: number | null;
        critico_min: number | null;
        critico_max: number | null;
        texto_normal: string | null;
        nota: string | null;
        created_at: string;
      }>;
      LIS_studies: Table<{
        id: string;
        organization_id: string | null;
        category_id: string | null;
        specimen_type_id: string | null;
        codigo: string;
        nombre: string;
        descripcion: string | null;
        loinc_code: string | null;
        tiempo_entrega_h: number | null;
        requiere_ayuno: boolean;
        indicaciones: string | null;
        activo: boolean;
        created_at: string;
        updated_at: string;
      }>;
      LIS_study_analytes: Table<{
        id: string;
        study_id: string;
        analyte_id: string;
        orden: number;
        formula: string | null;
      }>;
      LIS_study_prices: Table<{
        id: string;
        study_id: string;
        sede_id: string | null;
        moneda: string;
        precio: number;
        vigente_desde: string;
        activo: boolean;
      }>;
      LIS_patients: Table<{
        id: string;
        organization_id: string;
        tipo_documento: string;
        numero_documento: string;
        nombres: string;
        apellidos: string;
        fecha_nacimiento: string | null;
        sexo: Sex;
        telefono: string | null;
        email: string | null;
        direccion: string | null;
        portal_user_id: string | null;
        metadata: Json;
        created_at: string;
        updated_at: string;
      }>;
      LIS_order_counters: Table<{
        organization_id: string;
        last_number: number;
      }>;
      LIS_orders: Table<{
        id: string;
        organization_id: string;
        sede_id: string;
        patient_id: string;
        codigo: string;
        status: OrderStatus;
        prioridad: OrderPriority;
        medico_solicitante: string | null;
        diagnostico: string | null;
        observaciones: string | null;
        moneda: string;
        total: number;
        created_by: string | null;
        created_at: string;
        updated_at: string;
      }>;
      LIS_order_items: Table<{
        id: string;
        order_id: string;
        study_id: string;
        status: ItemStatus;
        precio: number;
        descuento: number;
        study_nombre: string;
        study_codigo: string;
        created_at: string;
        updated_at: string;
      }>;
      LIS_samples: Table<{
        id: string;
        organization_id: string;
        order_id: string;
        specimen_type_id: string | null;
        barcode: string;
        status: SampleStatus;
        sede_toma_id: string | null;
        sede_proceso_id: string | null;
        tomada_por: string | null;
        tomada_at: string | null;
        recibida_por: string | null;
        recibida_at: string | null;
        motivo_rechazo: string | null;
        observaciones: string | null;
        created_at: string;
        updated_at: string;
      }>;
      LIS_sample_items: Table<{
        id: string;
        sample_id: string;
        order_item_id: string;
      }>;
      LIS_results: Table<{
        id: string;
        organization_id: string;
        order_item_id: string;
        analyte_id: string;
        analyte_nombre: string;
        analyte_unidad: string | null;
        valor_num: number | null;
        valor_texto: string | null;
        flag: ResultFlag | null;
        rango_texto: string | null;
        status: ResultStatus;
        metodo: string | null;
        ingresado_por: string | null;
        ingresado_at: string | null;
        validado_por: string | null;
        validado_at: string | null;
        nota: string | null;
        created_at: string;
        updated_at: string;
      }>;
      LIS_report_documents: Table<{
        id: string;
        organization_id: string;
        order_id: string;
        storage_path: string | null;
        version: number;
        hash: string | null;
        generado_por: string | null;
        created_at: string;
      }>;
      LIS_result_deliveries: Table<{
        id: string;
        organization_id: string;
        order_id: string;
        canal: DeliveryChannel;
        destino: string | null;
        status: DeliveryStatus;
        access_token: string | null;
        token_expira_at: string | null;
        enviado_at: string | null;
        visto_at: string | null;
        enviado_por: string | null;
        error_detalle: string | null;
        created_at: string;
        updated_at: string;
      }>;
      LIS_billing_integrations: Table<{
        id: string;
        organization_id: string;
        provider: string;
        enabled: boolean;
        config: Json;
        credential_ref: string | null;
        created_at: string;
        updated_at: string;
      }>;
      LIS_invoices: Table<{
        id: string;
        organization_id: string;
        order_id: string;
        provider: string;
        external_id: string | null;
        serie: string | null;
        numero: string | null;
        status: InvoiceStatus;
        moneda: string;
        subtotal: number;
        impuestos: number;
        total: number;
        pdf_url: string | null;
        xml_url: string | null;
        payload: Json | null;
        created_at: string;
        updated_at: string;
      }>;
      LIS_invoice_events: Table<{
        id: string;
        invoice_id: string;
        tipo: string;
        detalle: Json | null;
        created_at: string;
      }>;
      LIS_appointments: Table<{
        id: string;
        organization_id: string;
        sede_id: string;
        patient_id: string;
        order_id: string | null;
        fecha: string;
        hora_inicio: string;
        duracion_min: number;
        status: AppointmentStatus;
        motivo: string | null;
        study_ids: string[];
        medico_solicitante: string | null;
        canal: string;
        notas: string | null;
        recordatorio_at: string | null;
        cancel_motivo: string | null;
        created_by: string | null;
        created_at: string;
        updated_at: string;
      }>;
      LIS_audit_log: Table<{
        id: number;
        organization_id: string | null;
        sede_id: string | null;
        actor_id: string | null;
        actor_email: string | null;
        entidad: string;
        entidad_id: string | null;
        accion: string;
        cambios: Json | null;
        estado_anterior: Json | null;
        estado_nuevo: Json | null;
        contexto: Json | null;
        created_at: string;
      }>;
    };
    Views: {
      v_agenda: {
        Relationships: [];
        Row: {
          id: string;
          organization_id: string;
          sede_id: string;
          patient_id: string;
          order_id: string | null;
          fecha: string;
          hora_inicio: string;
          duracion_min: number;
          status: AppointmentStatus;
          motivo: string | null;
          study_ids: string[];
          medico_solicitante: string | null;
          canal: string;
          notas: string | null;
          created_at: string;
          sede_nombre: string;
          paciente: string;
          tipo_documento: string;
          numero_documento: string;
          telefono: string | null;
          sexo: Sex;
          fecha_nacimiento: string | null;
          order_codigo: string | null;
        };
      };
      v_order_overview: {
        Relationships: [];
        Row: {
          id: string;
          organization_id: string;
          sede_id: string;
          codigo: string;
          status: OrderStatus;
          prioridad: OrderPriority;
          total: number;
          moneda: string;
          created_at: string;
          sede_nombre: string;
          patient_id: string;
          paciente: string;
          numero_documento: string;
          sexo: Sex;
          fecha_nacimiento: string | null;
          items_total: number;
          items_validados: number;
          items_pendientes: number;
        };
      };
    };
    Functions: {
      create_order: {
        Args: {
          p_sede_id: string;
          p_patient_id: string;
          p_items: Json;
          p_prioridad?: OrderPriority;
          p_medico?: string | null;
          p_diagnostico?: string | null;
          p_observaciones?: string | null;
        };
        Returns: Database["public"]["Tables"]["LIS_orders"]["Row"];
      };
      upsert_result: {
        Args: {
          p_order_item_id: string;
          p_analyte_id: string;
          p_valor_num?: number | null;
          p_valor_texto?: string | null;
          p_nota?: string | null;
          p_validar?: boolean;
        };
        Returns: Database["public"]["Tables"]["LIS_results"]["Row"];
      };
      bootstrap_organization: {
        Args: { p_slug: string; p_nombre: string; p_sede_nombre?: string };
        Returns: Database["public"]["Tables"]["LIS_organizations"]["Row"];
      };
      order_timeline: {
        Args: { p_order_id: string };
        Returns: Database["public"]["Tables"]["LIS_audit_log"]["Row"][];
      };
      analytics_summary: {
        Args: { p_desde: string; p_hasta: string; p_sede_id?: string | null };
        Returns: Json;
      };
      analytics_daily: {
        Args: { p_desde: string; p_hasta: string; p_sede_id?: string | null };
        Returns: { dia: string; ordenes: number; ingresos: number; citas: number }[];
      };
      analytics_top_studies: {
        Args: { p_desde: string; p_hasta: string; p_sede_id?: string | null; p_limit?: number };
        Returns: { codigo: string; nombre: string; cantidad: number; ingresos: number }[];
      };
      analytics_by_category: {
        Args: { p_desde: string; p_hasta: string; p_sede_id?: string | null };
        Returns: { categoria: string; cantidad: number; ingresos: number }[];
      };
      analytics_order_status: {
        Args: { p_desde: string; p_hasta: string; p_sede_id?: string | null };
        Returns: { status: OrderStatus; cantidad: number }[];
      };
      analytics_by_sede: {
        Args: { p_desde: string; p_hasta: string };
        Returns: {
          sede_id: string;
          sede: string;
          ordenes: number;
          ingresos: number;
          citas: number;
          tat_horas: number;
        }[];
      };
      analytics_billing: {
        Args: { p_desde: string; p_hasta: string };
        Returns: { status: InvoiceStatus; cantidad: number; monto: number }[];
      };
    };
    Enums: {
      role: Role;
      order_status: OrderStatus;
      order_priority: OrderPriority;
      item_status: ItemStatus;
      sample_status: SampleStatus;
      result_status: ResultStatus;
      result_flag: ResultFlag;
      appointment_status: AppointmentStatus;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}

// Atajos utiles
export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
export type Views<T extends keyof Database["public"]["Views"]> =
  Database["public"]["Views"][T]["Row"];
export type Enums<T extends keyof Database["public"]["Enums"]> =
  Database["public"]["Enums"][T];

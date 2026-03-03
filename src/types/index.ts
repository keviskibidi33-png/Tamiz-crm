export interface TamizPayload {
    muestra: string
    numero_ot: string
    fecha_ensayo: string
    realizado_por: string

    procedimiento?: "A" | "B" | "-" | null
    tamano_maximo_nominal_visual_in?: string | null

    a_masa_recipiente_g?: number | null
    b_masa_recipiente_muestra_seca_g?: number | null
    c_masa_recipiente_muestra_seca_constante_g?: number | null
    d_masa_seca_original_muestra_g?: number | null
    e_masa_recipiente_muestra_seca_despues_lavado_g?: number | null
    f_masa_recipiente_muestra_seca_despues_lavado_constante_g?: number | null
    g_masa_seca_muestra_despues_lavado_g?: number | null
    h_porcentaje_material_fino_pct?: number | null

    balanza_01g_codigo?: string | null
    horno_110c_codigo?: string | null
    tamiz_no_200_codigo?: string | null
    tamiz_no_16_codigo?: string | null

    observaciones?: string | null
    revisado_por?: string | null
    revisado_fecha?: string | null
    aprobado_por?: string | null
    aprobado_fecha?: string | null
}

export interface TamizEnsayoSummary {
    id: number
    numero_ensayo: string
    numero_ot: string
    cliente?: string | null
    muestra?: string | null
    fecha_documento?: string | null
    estado: string
    porcentaje_material_fino_pct?: number | null
    bucket?: string | null
    object_key?: string | null
    fecha_creacion?: string | null
    fecha_actualizacion?: string | null
}

export interface TamizEnsayoDetail extends TamizEnsayoSummary {
    payload?: TamizPayload | null
}

export interface TamizSaveResponse {
    id: number
    numero_ensayo: string
    numero_ot: string
    estado: string
    porcentaje_material_fino_pct?: number | null
    bucket?: string | null
    object_key?: string | null
    fecha_creacion?: string | null
    fecha_actualizacion?: string | null
}

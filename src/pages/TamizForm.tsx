import { useCallback, useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import toast from 'react-hot-toast'
import { Beaker, Download, Loader2, Trash2 } from 'lucide-react'
import { getTamizEnsayoDetail, saveAndDownloadTamizExcel, saveTamizEnsayo } from '@/services/api'
import type { TamizPayload } from '@/types'
import FormatConfirmModal from '../components/FormatConfirmModal'


const buildFormatPreview = (sampleCode: string | undefined, materialCode: 'SU' | 'AG', ensayo: string) => {
    const currentYear = new Date().getFullYear().toString().slice(-2)
    const normalized = (sampleCode || '').trim().toUpperCase()
    const fullMatch = normalized.match(/^(\d+)(?:-[A-Z0-9. ]+)?-(\d{2,4})$/)
    const partialMatch = normalized.match(/^(\d+)(?:-(\d{2,4}))?$/)
    const match = fullMatch || partialMatch
    const numero = match?.[1] || 'xxxx'
    const year = (match?.[2] || currentYear).slice(-2)
    return `Formato N-${numero}-${materialCode}-${year} ${ensayo}`
}


const DRAFT_KEY = 'tamiz_form_draft_v1'
const DEBOUNCE_MS = 700
const REVISORES = ['-', 'FABIAN LA ROSA'] as const
const APROBADORES = ['-', 'IRMA COAQUIRA'] as const

const EQUIPO_OPTIONS = {
    balanza_01g_codigo: ['-', 'EQP-0046'],
    horno_110c_codigo: ['-', 'EQP-0049'],
    tamiz_no_200_codigo: ['-', 'INS-0199'],
    tamiz_no_16_codigo: ['-', 'INS-0171'],
} as const

const withCurrentOption = (value: string | null | undefined, base: readonly string[]) => {
    const current = (value ?? '').trim()
    if (!current || base.includes(current)) return base
    return [...base, current]
}

const parseNum = (value: string) => {
    if (value.trim() === '') return null
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
}

const getCurrentYearShort = () => new Date().getFullYear().toString().slice(-2)

const normalizeMuestraCode = (raw: string): string => {
    const value = raw.trim().toUpperCase()
    if (!value) return ''
    const compact = value.replace(/\s+/g, '')
    const year = getCurrentYearShort()
    const match = compact.match(/^(\d+)(?:-SU)?(?:-(\d{2}))?$/)
    return match ? `${match[1]}-SU-${match[2] || year}` : value
}

const normalizeNumeroOtCode = (raw: string): string => {
    const value = raw.trim().toUpperCase()
    if (!value) return ''
    const compact = value.replace(/\s+/g, '')
    const year = getCurrentYearShort()
    const patterns = [/^(?:N?OT-)?(\d+)(?:-(\d{2}))?$/, /^(\d+)(?:-(?:N?OT))?(?:-(\d{2}))?$/]
    for (const pattern of patterns) {
        const match = compact.match(pattern)
        if (match) return `${match[1]}-${match[2] || year}`
    }
    return value
}

const normalizeFlexibleDate = (raw: string): string => {
    const value = raw.trim()
    if (!value) return ''
    const digits = value.replace(/\D/g, '')
    const year = getCurrentYearShort()
    const pad2 = (part: string) => part.padStart(2, '0').slice(-2)
    const build = (d: string, m: string, y: string = year) => `${pad2(d)}/${pad2(m)}/${pad2(y)}`

    if (value.includes('/')) {
        const [d = '', m = '', yRaw = ''] = value.split('/').map((part) => part.trim())
        if (!d || !m) return value
        let yy = yRaw.replace(/\D/g, '')
        if (yy.length === 4) yy = yy.slice(-2)
        if (yy.length === 1) yy = `0${yy}`
        if (!yy) yy = year
        return build(d, m, yy)
    }

    if (digits.length === 2) return build(digits[0], digits[1])
    if (digits.length === 3) return build(digits[0], digits.slice(1, 3))
    if (digits.length === 4) return build(digits.slice(0, 2), digits.slice(2, 4))
    if (digits.length === 5) return build(digits[0], digits.slice(1, 3), digits.slice(3, 5))
    if (digits.length === 6) return build(digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 6))
    if (digits.length >= 8) return build(digits.slice(0, 2), digits.slice(2, 4), digits.slice(6, 8))
    return value
}

const getEnsayoId = () => {
    const raw = new URLSearchParams(window.location.search).get('ensayo_id')
    const n = Number(raw)
    return Number.isInteger(n) && n > 0 ? n : null
}

const initialState = (): TamizPayload => ({
    muestra: '',
    numero_ot: '',
    fecha_ensayo: '',
    realizado_por: '',
    procedimiento: '-',
    tamano_maximo_nominal_visual_in: '',
    a_masa_recipiente_g: null,
    b_masa_recipiente_muestra_seca_g: null,
    c_masa_recipiente_muestra_seca_constante_g: null,
    d_masa_seca_original_muestra_g: null,
    e_masa_recipiente_muestra_seca_despues_lavado_g: null,
    f_masa_recipiente_muestra_seca_despues_lavado_constante_g: null,
    g_masa_seca_muestra_despues_lavado_g: null,
    h_porcentaje_material_fino_pct: null,
    balanza_01g_codigo: '-',
    horno_110c_codigo: '-',
    tamiz_no_200_codigo: '-',
    tamiz_no_16_codigo: '-',
    observaciones: '',
    revisado_por: '-',
    revisado_fecha: '',
    aprobado_por: '-',
    aprobado_fecha: '',
})

function preparePayload(payload: TamizPayload): TamizPayload {
    const next: TamizPayload = { ...payload }

    if (next.d_masa_seca_original_muestra_g == null && next.c_masa_recipiente_muestra_seca_constante_g != null && next.a_masa_recipiente_g != null) {
        next.d_masa_seca_original_muestra_g = Number(
            (next.c_masa_recipiente_muestra_seca_constante_g - next.a_masa_recipiente_g).toFixed(4),
        )
    }

    if (next.g_masa_seca_muestra_despues_lavado_g == null && next.f_masa_recipiente_muestra_seca_despues_lavado_constante_g != null && next.a_masa_recipiente_g != null) {
        next.g_masa_seca_muestra_despues_lavado_g = Number(
            (next.f_masa_recipiente_muestra_seca_despues_lavado_constante_g - next.a_masa_recipiente_g).toFixed(4),
        )
    }

    if (
        next.h_porcentaje_material_fino_pct == null &&
        next.d_masa_seca_original_muestra_g != null &&
        next.g_masa_seca_muestra_despues_lavado_g != null &&
        next.d_masa_seca_original_muestra_g !== 0
    ) {
        next.h_porcentaje_material_fino_pct = Number(
            (((next.d_masa_seca_original_muestra_g - next.g_masa_seca_muestra_despues_lavado_g) / next.d_masa_seca_original_muestra_g) * 100).toFixed(4),
        )
    }

    return next
}

const FIELD_ROWS: Array<{ key: keyof TamizPayload; label: string; unit: string; code: string; formula?: string }> = [
    { code: 'A', key: 'a_masa_recipiente_g', label: 'Masa del recipiente', unit: 'g' },
    { code: 'B', key: 'b_masa_recipiente_muestra_seca_g', label: 'Masa del recipiente + muestra seca', unit: 'g' },
    { code: 'C', key: 'c_masa_recipiente_muestra_seca_constante_g', label: 'Masa del recipiente + muestra seca constante', unit: 'g' },
    { code: 'D', key: 'd_masa_seca_original_muestra_g', label: 'Masa seca original de la muestra', unit: 'g', formula: '(C - A)' },
    { code: 'E', key: 'e_masa_recipiente_muestra_seca_despues_lavado_g', label: 'Masa del recipiente + muestra seca despues del lavado', unit: 'g' },
    { code: 'F', key: 'f_masa_recipiente_muestra_seca_despues_lavado_constante_g', label: 'Masa del recipiente + muestra seca despues del lavado, constante', unit: 'g' },
    { code: 'G', key: 'g_masa_seca_muestra_despues_lavado_g', label: 'Masa seca de la muestra despues del lavado', unit: 'g', formula: '(F - A)' },
    { code: 'H', key: 'h_porcentaje_material_fino_pct', label: 'Porcentaje de material mas fino que un tamiz 75 um (N°200) por lavado', unit: '%', formula: '(D-G)/D*100' },
]

export default function TamizForm() {
    const [form, setForm] = useState<TamizPayload>(() => initialState())
    const [loading, setLoading] = useState(false)
    const [loadingEdit, setLoadingEdit] = useState(false)
    const [ensayoId, setEnsayoId] = useState<number | null>(() => getEnsayoId())

    useEffect(() => {
        const raw = localStorage.getItem(`${DRAFT_KEY}:${ensayoId ?? 'new'}`)
        if (!raw) return
        try {
            setForm({ ...initialState(), ...JSON.parse(raw) })
        } catch {
            // ignore draft corruption
        }
    }, [ensayoId])

    useEffect(() => {
        const t = window.setTimeout(() => {
            localStorage.setItem(`${DRAFT_KEY}:${ensayoId ?? 'new'}`, JSON.stringify(form))
        }, DEBOUNCE_MS)
        return () => window.clearTimeout(t)
    }, [form, ensayoId])

    useEffect(() => {
        if (!ensayoId) return
        let cancel = false
        const run = async () => {
            setLoadingEdit(true)
            try {
                const detail = await getTamizEnsayoDetail(ensayoId)
                if (!cancel && detail.payload) setForm({ ...initialState(), ...detail.payload })
            } catch {
                toast.error('No se pudo cargar ensayo Tamiz.')
            } finally {
                if (!cancel) setLoadingEdit(false)
            }
        }
        void run()
        return () => {
            cancel = true
        }
    }, [ensayoId])

    const computedPayload = useMemo(() => preparePayload(form), [form])

    const setField = useCallback(<K extends keyof TamizPayload>(k: K, v: TamizPayload[K]) => {
        setForm((prev) => ({ ...prev, [k]: v }))
    }, [])

    const clearAll = useCallback(() => {
        if (!window.confirm('Se limpiaran los datos no guardados. Deseas continuar?')) return
        localStorage.removeItem(`${DRAFT_KEY}:${ensayoId ?? 'new'}`)
        setForm(initialState())
    }, [ensayoId])
    const [pendingFormatAction, setPendingFormatAction] = useState<boolean | null>(null)


    const save = useCallback(async (download: boolean) => {
        if (!form.muestra || !form.numero_ot || !form.realizado_por) return toast.error('Complete Muestra, N OT y Realizado por.')
        setLoading(true)
        try {
            const payload = preparePayload(form)
            if (download) {
                const { blob, filename } = await saveAndDownloadTamizExcel(payload, ensayoId ?? undefined)
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = filename || `${buildFormatPreview(form.muestra, 'AG', 'TAMIZ')}.xlsx`
                a.click()
                URL.revokeObjectURL(url)
            } else {
                await saveTamizEnsayo(payload, ensayoId ?? undefined)
            }
            localStorage.removeItem(`${DRAFT_KEY}:${ensayoId ?? 'new'}`)
            setForm(initialState())
            setEnsayoId(null)
            if (window.parent !== window) window.parent.postMessage({ type: 'CLOSE_MODAL' }, '*')
            toast.success(download ? 'Tamiz guardado y descargado.' : 'Tamiz guardado.')
        } catch (err) {
            const msg = axios.isAxiosError(err) ? err.response?.data?.detail || 'No se pudo generar Tamiz.' : 'No se pudo generar Tamiz.'
            toast.error(msg)
        } finally {
            setLoading(false)
        }
    }, [ensayoId, form])

    const selectedA = form.procedimiento === 'A'
    const selectedB = form.procedimiento === 'B'

    const denseInputClass =
        'h-8 w-full rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-900 shadow-sm transition focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-500/35'

    return (
        <div className="min-h-screen bg-slate-100 p-4 md:p-6">
            <div className="mx-auto max-w-[1280px] space-y-4">
                <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white/95 px-4 py-3 shadow-sm">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 bg-slate-50">
                        <Beaker className="h-5 w-5 text-slate-900" />
                    </div>
                    <div>
                        <h1 className="text-base font-semibold text-slate-900 md:text-lg">TAMIZ - ASTM C117-23</h1>
                        <p className="text-xs text-slate-600">Replica del formato Excel oficial</p>
                    </div>
                </div>

                {loadingEdit ? (
                    <div className="flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-600 shadow-sm">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Cargando ensayo...
                    </div>
                ) : null}

                <div className="overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-sm">
                    <div className="border-b border-slate-300 bg-slate-50 px-4 py-4 text-center">
                        <p className="text-2xl font-semibold leading-tight text-slate-900">LABORATORIO DE ENSAYO DE MATERIALES</p>
                        <p className="text-xl font-semibold leading-tight text-slate-900">FORMATO N° F-LEM-P-AG-23.01</p>
                    </div>

                    <div className="border-b border-slate-300 bg-white px-3 py-3">
                        <table className="w-full table-fixed border border-slate-300 text-sm">
                            <thead className="bg-slate-100 text-xs font-semibold text-slate-800">
                                <tr>
                                    <th className="border-r border-slate-300 py-1">MUESTRA</th>
                                    <th className="border-r border-slate-300 py-1">N° OT</th>
                                    <th className="border-r border-slate-300 py-1">FECHA DE ENSAYO</th>
                                    <th className="py-1">REALIZADO</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td className="border-r border-t border-slate-300 p-1">
                                        <input className={`${denseInputClass} text-center`} value={form.muestra} onChange={(e) => setField('muestra', e.target.value)} onBlur={() => setField('muestra', normalizeMuestraCode(form.muestra))} autoComplete="off" data-lpignore="true" />
                                    </td>
                                    <td className="border-r border-t border-slate-300 p-1">
                                        <input className={`${denseInputClass} text-center`} value={form.numero_ot} onChange={(e) => setField('numero_ot', e.target.value)} onBlur={() => setField('numero_ot', normalizeNumeroOtCode(form.numero_ot))} autoComplete="off" data-lpignore="true" />
                                    </td>
                                    <td className="border-r border-t border-slate-300 p-1">
                                        <input className={`${denseInputClass} text-center`} value={form.fecha_ensayo} onChange={(e) => setField('fecha_ensayo', e.target.value)} onBlur={() => setField('fecha_ensayo', normalizeFlexibleDate(form.fecha_ensayo))} autoComplete="off" data-lpignore="true" placeholder="DD/MM/AA" />
                                    </td>
                                    <td className="border-t border-slate-300 p-1">
                                        <input className={`${denseInputClass} text-center`} value={form.realizado_por} onChange={(e) => setField('realizado_por', e.target.value)} autoComplete="off" data-lpignore="true" />
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <div className="border-b border-slate-300 bg-slate-100 px-4 py-3 text-center">
                        <p className="text-2xl font-semibold leading-tight text-slate-900">Standard Test Method for Materials Finer than 75-um (No. 200) Sieve in Mineral Aggregates by Washing</p>
                        <p className="text-2xl font-semibold text-slate-900">ASTM C117-23</p>
                    </div>

                    <div className="space-y-3 p-3">
                        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1fr_420px]">
                            <div className="overflow-hidden rounded-lg border border-slate-300">
                                <table className="w-full text-sm">
                                    <tbody>
                                        <tr>
                                            <td className="border-b border-slate-300 px-2 py-1 text-center font-medium" colSpan={2}>Marca con "X"</td>
                                        </tr>
                                        <tr>
                                            <td className="w-16 border-b border-r border-slate-300 px-1 py-1 text-center">
                                                <button type="button" className={`h-8 w-full rounded-md border text-xs font-semibold ${selectedA ? 'border-slate-700 bg-slate-200 text-slate-900' : 'border-slate-300 bg-white text-slate-700'}`} onClick={() => setField('procedimiento', 'A')}>
                                                    {selectedA ? 'X' : ''}
                                                </button>
                                            </td>
                                            <td className="border-b border-slate-300 px-2 py-1">Procedimiento A: lavado con agua</td>
                                        </tr>
                                        <tr>
                                            <td className="w-16 border-r border-slate-300 px-1 py-1 text-center">
                                                <button type="button" className={`h-8 w-full rounded-md border text-xs font-semibold ${selectedB ? 'border-slate-700 bg-slate-200 text-slate-900' : 'border-slate-300 bg-white text-slate-700'}`} onClick={() => setField('procedimiento', 'B')}>
                                                    {selectedB ? 'X' : ''}
                                                </button>
                                            </td>
                                            <td className="px-2 py-1">Procedimiento B: lavado con agente humectante</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>

                            <div className="overflow-hidden rounded-lg border border-slate-300">
                                <table className="w-full text-sm">
                                    <tbody>
                                        <tr>
                                            <td className="border-r border-slate-300 px-2 py-1">Tamano maximo nominal muestra (visual) (in):</td>
                                            <td className="w-40 p-1">
                                                <input className={denseInputClass} value={form.tamano_maximo_nominal_visual_in ?? ''} onChange={(e) => setField('tamano_maximo_nominal_visual_in', e.target.value)} autoComplete="off" data-lpignore="true" />
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div className="overflow-hidden rounded-lg border border-slate-300">
                            <table className="w-full table-fixed text-sm">
                                <thead className="bg-slate-100 text-xs font-semibold text-slate-800">
                                    <tr>
                                        <th className="w-10 border-b border-r border-slate-300 py-1">N°</th>
                                        <th className="border-b border-r border-slate-300 px-2 py-1 text-left">DESCRIPCION</th>
                                        <th className="w-16 border-b border-r border-slate-300 py-1">UND.</th>
                                        <th className="w-36 border-b border-slate-300 py-1">DATOS</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {FIELD_ROWS.map((row) => (
                                        <tr key={row.code}>
                                            <td className="border-t border-r border-slate-300 px-2 py-1 text-center">{row.code}</td>
                                            <td className="border-t border-r border-slate-300 px-2 py-1">
                                                {row.label} {row.formula ? <span className="text-xs text-slate-500">{row.formula}</span> : null}
                                            </td>
                                            <td className="border-t border-r border-slate-300 px-2 py-1 text-center">{row.unit}</td>
                                            <td className="border-t border-slate-300 p-1">
                                                <input
                                                    type="number"
                                                    step="any"
                                                    className={denseInputClass}
                                                    value={(computedPayload[row.key] as number | null) ?? ''}
                                                    onChange={(e) => setField(row.key, parseNum(e.target.value) as TamizPayload[keyof TamizPayload])}
                                                />
                                            </td>
                                        </tr>
                                    ))}
                                    <tr>
                                        <td className="border-t border-r border-slate-300 px-2 py-1 text-center"></td>
                                        <td className="border-t border-r border-slate-300 px-2 py-1 text-sm font-medium">Perdida adicional de la masa seca &lt;1%</td>
                                        <td className="border-t border-r border-slate-300 px-2 py-1 text-center"></td>
                                        <td className="border-t border-slate-300 px-2 py-1"></td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1fr_1fr]">
                            <div className="overflow-hidden rounded-lg border border-slate-300">
                                <table className="w-full text-sm">
                                    <thead className="bg-slate-100 text-xs font-semibold text-slate-800">
                                        <tr>
                                            <th className="border-b border-r border-slate-300 py-1">Equipo utilizado</th>
                                            <th className="border-b border-slate-300 py-1">Codigo</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td className="border-t border-r border-slate-300 px-2 py-1">Balanza 0.1 g</td>
                                            <td className="border-t border-slate-300 p-1"><select className={denseInputClass} value={form.balanza_01g_codigo ?? '-'} onChange={(e) => setField('balanza_01g_codigo', e.target.value)}>{withCurrentOption(form.balanza_01g_codigo, EQUIPO_OPTIONS.balanza_01g_codigo).map((opt) => <option key={opt} value={opt}>{opt}</option>)}</select></td>
                                        </tr>
                                        <tr>
                                            <td className="border-t border-r border-slate-300 px-2 py-1">Horno 110°C</td>
                                            <td className="border-t border-slate-300 p-1"><select className={denseInputClass} value={form.horno_110c_codigo ?? '-'} onChange={(e) => setField('horno_110c_codigo', e.target.value)}>{withCurrentOption(form.horno_110c_codigo, EQUIPO_OPTIONS.horno_110c_codigo).map((opt) => <option key={opt} value={opt}>{opt}</option>)}</select></td>
                                        </tr>
                                        <tr>
                                            <td className="border-t border-r border-slate-300 px-2 py-1">Tamiz No. 200</td>
                                            <td className="border-t border-slate-300 p-1"><select className={denseInputClass} value={form.tamiz_no_200_codigo ?? '-'} onChange={(e) => setField('tamiz_no_200_codigo', e.target.value)}>{withCurrentOption(form.tamiz_no_200_codigo, EQUIPO_OPTIONS.tamiz_no_200_codigo).map((opt) => <option key={opt} value={opt}>{opt}</option>)}</select></td>
                                        </tr>
                                        <tr>
                                            <td className="border-t border-r border-slate-300 px-2 py-1">Tamiz No. 16</td>
                                            <td className="border-t border-slate-300 p-1"><select className={denseInputClass} value={form.tamiz_no_16_codigo ?? '-'} onChange={(e) => setField('tamiz_no_16_codigo', e.target.value)}>{withCurrentOption(form.tamiz_no_16_codigo, EQUIPO_OPTIONS.tamiz_no_16_codigo).map((opt) => <option key={opt} value={opt}>{opt}</option>)}</select></td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>

                            <div className="overflow-hidden rounded-lg border border-slate-300">
                                <table className="w-full text-sm">
                                    <thead className="bg-slate-100 text-xs font-semibold text-slate-800">
                                        <tr>
                                            <th className="border-b border-r border-slate-300 py-1">Tamano maximo nominal</th>
                                            <th className="border-b border-slate-300 py-1">Peso minimo (g)</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr><td className="border-t border-r border-slate-300 px-2 py-1">No. 4 o menos</td><td className="border-t border-slate-300 px-2 py-1 text-center">300</td></tr>
                                        <tr><td className="border-t border-r border-slate-300 px-2 py-1">Mas grande No. 4 hasta 3/8 in</td><td className="border-t border-slate-300 px-2 py-1 text-center">1000</td></tr>
                                        <tr><td className="border-t border-r border-slate-300 px-2 py-1">Mas grande 3/8 in hasta 3/4 in</td><td className="border-t border-slate-300 px-2 py-1 text-center">2500</td></tr>
                                        <tr><td className="border-t border-r border-slate-300 px-2 py-1">Mas grande 3/4 in</td><td className="border-t border-slate-300 px-2 py-1 text-center">5000</td></tr>
                                        <tr><td className="border-t border-slate-300 px-2 py-1 text-xs text-slate-600" colSpan={2}>Fuente: Elaboracion propia en base a la Norma ASTM C117-23.</td></tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div className="overflow-hidden rounded-lg border border-slate-300">
                            <div className="border-b border-slate-300 bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-800">Observaciones</div>
                            <div className="p-2">
                                <textarea className="w-full resize-none rounded-md border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900 shadow-sm transition focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-500/35" rows={3} value={form.observaciones ?? ''} onChange={(e) => setField('observaciones', e.target.value)} autoComplete="off" data-lpignore="true" />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[280px_280px] xl:justify-end">
                            <div className="overflow-hidden rounded-lg border border-slate-300 bg-slate-50">
                                <div className="border-b border-slate-300 px-2 py-1 text-sm font-semibold">Revisado</div>
                                <div className="space-y-2 p-2">
                                    <select className={denseInputClass} value={form.revisado_por ?? '-'} onChange={(e) => setField('revisado_por', e.target.value)}>
                                        {REVISORES.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                                    </select>
                                    <input className={denseInputClass} value={form.revisado_fecha ?? ''} onChange={(e) => setField('revisado_fecha', e.target.value)} onBlur={() => setField('revisado_fecha', normalizeFlexibleDate(form.revisado_fecha ?? ''))} autoComplete="off" data-lpignore="true" placeholder="Fecha" />
                                </div>
                            </div>
                            <div className="overflow-hidden rounded-lg border border-slate-300 bg-slate-50">
                                <div className="border-b border-slate-300 px-2 py-1 text-sm font-semibold">Aprobado</div>
                                <div className="space-y-2 p-2">
                                    <select className={denseInputClass} value={form.aprobado_por ?? '-'} onChange={(e) => setField('aprobado_por', e.target.value)}>
                                        {APROBADORES.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                                    </select>
                                    <input className={denseInputClass} value={form.aprobado_fecha ?? ''} onChange={(e) => setField('aprobado_fecha', e.target.value)} onBlur={() => setField('aprobado_fecha', normalizeFlexibleDate(form.aprobado_fecha ?? ''))} autoComplete="off" data-lpignore="true" placeholder="Fecha" />
                                </div>
                            </div>
                        </div>

                        <div className="border-t-2 border-blue-900 px-3 py-2 text-center text-[11px] leading-tight text-slate-700">
                            <p>WEB: www.geofal.com.pe  E-MAIL: laboratorio@geofal.com.pe / geofal.sac@gmail.com</p>
                            <p>Av. Maranon 763, Los Olivos-Lima / Telefono 01 522-1851</p>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <button onClick={clearAll} disabled={loading} className="flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white font-medium text-slate-900 shadow-sm transition hover:bg-slate-100 disabled:opacity-50">
                        <Trash2 className="h-4 w-4" />
                        Limpiar todo
                    </button>
                    <button onClick={() => setPendingFormatAction(false)} disabled={loading} className="h-11 rounded-lg border border-slate-900 bg-white font-semibold text-slate-900 shadow-sm transition hover:bg-slate-100 disabled:opacity-50">
                        {loading ? 'Guardando...' : 'Guardar'}
                    </button>
                    <button onClick={() => setPendingFormatAction(true)} disabled={loading} className="flex h-11 items-center justify-center gap-2 rounded-lg border border-emerald-700 bg-emerald-700 font-semibold text-white shadow-sm transition hover:bg-emerald-800 disabled:opacity-50">
                        {loading ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Procesando...
                            </>
                        ) : (
                            <>
                                <Download className="h-4 w-4" />
                                Guardar y Descargar
                            </>
                        )}
                    </button>
                </div>
            </div>
            <FormatConfirmModal
                open={pendingFormatAction !== null}
                formatLabel={buildFormatPreview(form.muestra, 'AG', 'TAMIZ')}
                actionLabel={pendingFormatAction ? 'Guardar y Descargar' : 'Guardar'}
                onClose={() => setPendingFormatAction(null)}
                onConfirm={() => {
                    if (pendingFormatAction === null) return
                    const shouldDownload = pendingFormatAction
                    setPendingFormatAction(null)
                    void save(shouldDownload)
                }}
            />

        </div>
    )
}

import axios from 'axios'
import type {
    TamizPayload,
    TamizSaveResponse,
    TamizEnsayoDetail,
    TamizEnsayoSummary,
} from '@/types'

const API_URL = import.meta.env.VITE_API_URL || 'https://api.geofal.com.pe'

const api = axios.create({
    baseURL: API_URL,
})

api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token')
    if (token) {
        config.headers.Authorization = `Bearer ${token}`
    }
    return config
})

api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            window.dispatchEvent(new CustomEvent('session-expired'))
        }
        return Promise.reject(error)
    },
)


const extractFilename = (contentDisposition?: string): string | undefined => {
    const match = typeof contentDisposition === 'string' ? contentDisposition.match(/filename="?([^";]+)"?/i) : null
    return match?.[1]
}

export async function saveTamizEnsayo(
    payload: TamizPayload,
    ensayoId?: number,
): Promise<TamizSaveResponse> {
    const { data } = await api.post<TamizSaveResponse>('/api/tamiz/excel', payload, {
        params: {
            download: false,
            ensayo_id: ensayoId,
        },
    })
    return data
}

export async function saveAndDownloadTamizExcel(
    payload: TamizPayload,
    ensayoId?: number,
): Promise<{ blob: Blob; ensayoId?: number; filename?: string }> {
    const response = await api.post('/api/tamiz/excel', payload, {
        params: {
            download: true,
            ensayo_id: ensayoId,
        },
        responseType: 'blob',
    })

    const ensayoIdHeader = response.headers['x-tamiz-id']
    const parsedId = Number(ensayoIdHeader)
    return {
        blob: response.data,
        ensayoId: Number.isFinite(parsedId) ? parsedId : undefined,
        filename: extractFilename(response.headers['content-disposition']),
    }
}

export async function listTamizEnsayos(limit = 100): Promise<TamizEnsayoSummary[]> {
    const { data } = await api.get<TamizEnsayoSummary[]>('/api/tamiz/', {
        params: { limit },
    })
    return data
}

export async function getTamizEnsayoDetail(ensayoId: number): Promise<TamizEnsayoDetail> {
    const { data } = await api.get<TamizEnsayoDetail>(`/api/tamiz/${ensayoId}`)
    return data
}

export default api

import type { AxiosRequestConfig } from 'axios'
import api from './index'

export type ConnectionCategory = 'downloader' | 'mediaserver' | 'site'

export interface ConnectionErrorDetail {
  error_type: string
  message: string
  stack: string
}

export interface ConnectionTestResult {
  connected: boolean
  elapsed_ms?: number | null
  error?: ConnectionErrorDetail | null
}

export interface ConnectionTestPayload {
  category: ConnectionCategory
  type?: string
  name?: string
  config: Record<string, unknown>
}

export function testConnection(
  payload: ConnectionTestPayload,
  config?: AxiosRequestConfig,
): Promise<ConnectionTestResult> {
  return api.post<ConnectionTestResult>('system/connection/test', payload, {
    feedback: 'silent',
    ...config,
  })
}

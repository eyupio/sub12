import { api } from './client'

export interface SitemapStats {
  static_pages: number
  public_users: number
  public_leagues: number
  public_clubs: number
  total_urls: number
}

export interface SitemapSubmission {
  id: string
  engine: string
  url: string
  status_code?: number
  response_body?: string
  error?: string
  submitted_by: string
  created_at: string
}

export interface SitemapSubmissionsResponse {
  submissions: SitemapSubmission[]
  total: number
}

export interface SitemapPingRequest {
  engines: string[]
}

export interface IndexNowKeyInfo {
  key: string
  key_location: string
  source: 'configured' | 'generated'
}

export const adminSitemapApi = {
  getStats: () =>
    api.get<SitemapStats>('/admin/sitemap/stats'),

  getIndexNowKey: () =>
    api.get<IndexNowKeyInfo>('/admin/sitemap/indexnow-key'),
  ping: (payload: SitemapPingRequest) =>
    api.post<SitemapSubmission[]>('/admin/sitemap/ping', payload),

  listSubmissions: (limit = 20, offset = 0) =>
    api.get<SitemapSubmissionsResponse>(
      `/admin/sitemap/submissions?limit=${limit}&offset=${offset}`,
    ),
}

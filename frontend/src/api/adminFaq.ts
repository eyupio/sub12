import { api } from './client'
import type { FAQ, FAQListResponse } from './faq'

export type { FAQ, FAQListResponse }

export interface CreateFAQInput {
  slug: string
  category: string
  question: string
  answer_md: string
  sort_order: number
  is_published?: boolean
}

export interface UpdateFAQInput {
  slug?: string
  category?: string
  question?: string
  answer_md?: string
  sort_order?: number
  is_published?: boolean
}

export const adminFaqApi = {
  list: () => api.get<FAQListResponse>('/admin/faqs'),
  get: (id: string) => api.get<FAQ>(`/admin/faqs/${id}`),
  create: (payload: CreateFAQInput) => api.post<FAQ>('/admin/faqs', payload),
  update: (id: string, payload: UpdateFAQInput) => api.patch<FAQ>(`/admin/faqs/${id}`, payload),
  remove: (id: string) => api.del<void>(`/admin/faqs/${id}`),
}

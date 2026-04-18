import { api } from './client'

export interface FAQ {
  id: string
  slug: string
  category: string
  question: string
  answer_md: string
  sort_order: number
  is_published: boolean
  updated_by?: string
  created_at: string
  updated_at: string
}

export interface FAQListResponse {
  items: FAQ[]
}

export const faqApi = {
  list: () => api.get<FAQListResponse>('/faqs'),
  getBySlug: (slug: string) => api.get<FAQ>(`/faqs/${slug}`),
}

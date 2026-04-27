import { api } from './client'

export interface Category {
  id: string
  slug: string
  label: string
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface CreateCategoryPayload {
  slug: string
  label: string
  sort_order?: number
}

export interface UpdateCategoryPayload {
  slug?: string
  label?: string
  sort_order?: number
  is_active?: boolean
}

export const categoriesApi = {
  listPublic: () => api.get<{ items: Category[] }>('/categories'),
  adminList: () => api.get<{ items: Category[] }>('/admin/categories'),
  adminCreate: (body: CreateCategoryPayload) => api.post<Category>('/admin/categories', body),
  adminUpdate: (id: string, body: UpdateCategoryPayload) => api.patch<Category>(`/admin/categories/${id}`, body),
  adminDelete: (id: string) => api.del<void>(`/admin/categories/${id}`),
}

import { api } from './client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

export interface Location {
  id: string
  user_id: string
  name: string
  address?: string
  lat?: number
  lng?: number
  default_distance_m?: number
  default_distance_unit?: string
  default_target_preset?: string
  custom_target_width_mm?: number
  custom_target_height_mm?: number
  image_url?: string
  notes?: string
  created_at: string
  updated_at: string
}

export interface CreateLocationInput {
  name: string
  address?: string
  lat?: number
  lng?: number
  default_distance_m?: number
  default_distance_unit?: string
  default_target_preset?: string
  custom_target_width_mm?: number
  custom_target_height_mm?: number
  notes?: string
}

export interface UpdateLocationInput {
  name?: string
  address?: string
  lat?: number
  lng?: number
  default_distance_m?: number
  default_distance_unit?: string
  default_target_preset?: string
  custom_target_width_mm?: number
  custom_target_height_mm?: number
  notes?: string
}

export const locationsApi = {
  list: () => api.get<{ items: Location[] }>('/locations'),
  getByID: (id: string) => api.get<Location>(`/locations/${id}`),
  create: (input: CreateLocationInput) => api.post<Location>('/locations', input),
  update: (id: string, input: UpdateLocationInput) => api.patch<Location>(`/locations/${id}`, input),
  delete: (id: string) => api.del<void>(`/locations/${id}`),
  uploadImage: (id: string, file: File) => {
    const formData = new FormData()
    formData.append('image', file)
    return api.upload<Location>(`/locations/${id}/image`, formData)
  },
}

export function useLocations() {
  return useQuery({
    queryKey: ['locations'],
    queryFn: () => locationsApi.list().then(r => r.items),
  })
}

export function useLocation(id: string | undefined) {
  return useQuery({
    queryKey: ['locations', id],
    queryFn: () => locationsApi.getByID(id!),
    enabled: !!id,
  })
}

export function useCreateLocation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateLocationInput) => locationsApi.create(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['locations'] }),
  })
}

export function useUpdateLocation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateLocationInput }) =>
      locationsApi.update(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['locations'] }),
  })
}

export function useDeleteLocation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => locationsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['locations'] }),
  })
}

export function useUploadLocationImage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) => locationsApi.uploadImage(id, file),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['locations'] }),
  })
}

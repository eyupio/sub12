import { api } from './client'
import type { Rifle } from './gear'
import type { Pellet } from './gear'

// ── Session ─────────────────────────────────────────────────────────────────────

export interface PelletTestSession {
  id: string
  user_id: string
  rifle_id: string
  pellet_id: string
  test_date: string
  distance_m: number
  distance_unit: string
  location?: string
  location_lat?: number
  location_lng?: number
  wind_mph?: number
  temp_celsius?: number
  humidity_pct?: number
  notes?: string
  velocity_fps?: number
  velocity_sd?: number
  extreme_spread_fps?: number
  bench_setup?: string
  scope_details?: string
  barometric_pressure_mbar?: number
  average_group_size_mm?: number
  best_group_size_mm?: number
  group_count: number
  is_public: boolean
  is_draft: boolean
  created_at: string
  updated_at: string
  groups?: PelletTestGroup[]
  images?: PelletTestImage[]
  rifle?: Rifle
  pellet?: Pellet
}

export interface PelletTestSessionSummary {
  id: string
  test_date: string
  distance_m: number
  distance_unit: string
  location?: string
  location_lat?: number
  location_lng?: number
  wind_mph?: number
  temp_celsius?: number
  average_group_size_mm?: number
  best_group_size_mm?: number
  group_count: number
  rifle_make: string
  rifle_model: string
  pellet_brand: string
  pellet_model: string
  first_image_url?: string
  is_draft: boolean
  created_at: string
}

export interface QuickCreatePelletTestPayload {
  rifle_id: string
  pellet_id: string
  test_date?: string
  distance_value?: number
  distance_unit?: string
  location?: string
  location_lat?: number
  location_lng?: number
  wind_mph?: number
  temp_celsius?: number
  humidity_pct?: number
  notes?: string
}

// ── Group ───────────────────────────────────────────────────────────────────────

export interface PelletTestGroup {
  id: string
  session_id: string
  group_number: number
  shot_count: number
  group_size_mm: number
  group_size_moa?: number
  notes?: string
  created_at: string
  updated_at: string
}

// ── Image ───────────────────────────────────────────────────────────────────────

export interface PelletTestImage {
  id: string
  session_id: string
  group_id?: string
  image_id: string
  image_url: string
  caption?: string
  created_at: string
}

// ── Leaderboard ─────────────────────────────────────────────────────────────────

export interface PelletLeaderboardEntry {
  pellet_id: string
  pellet_brand: string
  pellet_model: string
  head_size_mm?: number
  weight_grains?: number
  best_group_mm: number
  avg_group_mm: number
  test_count: number
  total_groups: number
  consistency_score?: number
  last_tested: string
  rank: number
}

// ── Stats ───────────────────────────────────────────────────────────────────────

export interface PelletTestStats {
  total_tests: number
  total_groups: number
  best_group_mm?: number
  best_group_test_id?: string
  avg_group_mm?: number
  most_tested_pellet?: string
}

// ── Payloads ────────────────────────────────────────────────────────────────────

export interface CreatePelletTestPayload {
  rifle_id: string
  pellet_id: string
  test_date: string
  distance_value?: number
  distance_unit?: string
  location?: string
  location_lat?: number
  location_lng?: number
  location_id?: string
  wind_mph?: number
  temp_celsius?: number
  humidity_pct?: number
  notes?: string
  velocity_fps?: number
  velocity_sd?: number
  extreme_spread_fps?: number
  bench_setup?: string
  scope_details?: string
  barometric_pressure_mbar?: number
}

export interface UpdatePelletTestPayload {
  rifle_id?: string
  pellet_id?: string
  test_date?: string
  distance_value?: number
  distance_unit?: string
  location?: string
  location_lat?: number
  location_lng?: number
  location_id?: string
  wind_mph?: number
  temp_celsius?: number
  humidity_pct?: number
  notes?: string
  velocity_fps?: number
  velocity_sd?: number
  extreme_spread_fps?: number
  bench_setup?: string
  scope_details?: string
  barometric_pressure_mbar?: number
  is_public?: boolean
}

export interface CreateGroupPayload {
  shot_count: number
  group_size_mm: number
  notes?: string
}

export interface UpdateGroupPayload {
  shot_count?: number
  group_size_mm?: number
  notes?: string
}

// ── Measurement ─────────────────────────────────────────────────────────────────

export interface PelletTestMeasurement {
  id: string
  image_id: string
  session_id: string
  group_id?: string
  calibration_type: string
  target_preset?: string
  reference_ring_name?: string
  reference_diameter_mm: number
  reference_pixels: number
  pixels_per_mm: number
  ref_center_x: number
  ref_center_y: number
  ref_radius_pixels: number
  bbox_x?: number
  bbox_y?: number
  bbox_width?: number
  bbox_height?: number
  manual_group_size_mm?: number
  manual_shot_count?: number
  measured_size_mm?: number
  measured_size_moa?: number
  detection_method: string
  annotated_image_id?: string
  detected_hole_count: number
  auto_group_size_mm?: number
  auto_group_size_moa?: number
  detection_confidence?: number
  aim_point_x?: number
  aim_point_y?: number
  point_a_x?: number
  point_a_y?: number
  point_b_x?: number
  point_b_y?: number
  rotation_degrees: number
  line_start_x?: number
  line_start_y?: number
  line_end_x?: number
  line_end_y?: number
  marker_size?: string
  distance_m?: number
  distance_unit?: 'meters' | 'yards'
  measure_method: 'impacts' | 'manual_line'
  display_unit?: 'mm' | 'cm'
  created_at: string
  updated_at: string
}

export interface CreateMeasurementPayload {
  group_id?: string
  calibration_type: string
  target_preset?: string
  reference_ring_name?: string
  reference_diameter_mm: number
  reference_pixels: number
  pixels_per_mm: number
  ref_center_x: number
  ref_center_y: number
  ref_radius_pixels: number
  bbox_x?: number
  bbox_y?: number
  bbox_width?: number
  bbox_height?: number
  manual_group_size_mm?: number
  manual_shot_count?: number
  aim_point_x?: number
  aim_point_y?: number
  point_a_x?: number
  point_a_y?: number
  point_b_x?: number
  point_b_y?: number
  rotation_degrees?: number
  line_start_x?: number
  line_start_y?: number
  line_end_x?: number
  line_end_y?: number
  marker_size?: string
  distance_m?: number
  distance_unit?: 'meters' | 'yards'
  measure_method?: 'impacts' | 'manual_line'
  display_unit?: 'mm' | 'cm'
}

export interface UpdateMeasurementPayload {
  group_id?: string
  bbox_x?: number
  bbox_y?: number
  bbox_width?: number
  bbox_height?: number
  calibration_type?: string
  reference_diameter_mm?: number
  reference_pixels?: number
  pixels_per_mm?: number
  ref_center_x?: number
  ref_center_y?: number
  ref_radius_pixels?: number
  manual_group_size_mm?: number
  manual_shot_count?: number
  aim_point_x?: number
  aim_point_y?: number
  point_a_x?: number
  point_a_y?: number
  point_b_x?: number
  point_b_y?: number
  rotation_degrees?: number
  line_start_x?: number
  line_start_y?: number
  line_end_x?: number
  line_end_y?: number
  marker_size?: string
  distance_m?: number
  distance_unit?: 'meters' | 'yards'
  measure_method?: 'impacts' | 'manual_line'
  display_unit?: 'mm' | 'cm'
}

// ── Detection (PT-3) ────────────────────────────────────────────────────────────

export interface PelletTestDetection {
  id: string
  measurement_id: string
  session_id: string
  center_x: number
  center_y: number
  radius_pixels: number
  diameter_mm?: number
  confidence: number
  is_confirmed: boolean
  is_rejected: boolean
  created_at: string
}

export interface CreateDetectionInput {
  center_x: number
  center_y: number
  radius_pixels: number
  diameter_mm?: number
  confidence: number
}

export interface CreateDetectionsBatchPayload {
  detection_method: string
  detections: CreateDetectionInput[]
}

export interface UpdateDetectionPayload {
  center_x?: number
  center_y?: number
  radius_pixels?: number
  is_confirmed?: boolean
  is_rejected?: boolean
}

// ── Confidence Badge ────────────────────────────────────────────────────────────

export interface ConfidenceBadge {
  level: 'single' | 'emerging' | 'proven'
  test_count: number
  consistency_score?: number
}

// ── Public Leaderboard ──────────────────────────────────────────────────────────

export interface PublicLeaderboardEntry {
  pellet_brand: string
  pellet_model: string
  head_size_mm?: number
  weight_grains?: number
  best_group_mm: number
  avg_group_mm: number
  user_count: number
  test_count: number
  total_groups: number
  rank: number
}

// ── Batch Report ────────────────────────────────────────────────────────────────

export interface BatchReportEntry {
  batch_code: string
  pellet_brand: string
  pellet_model: string
  test_count: number
  total_groups: number
  best_group_mm?: number
  avg_group_mm?: number
  consistency_score?: number
  last_tested: string
}

// ── Export ───────────────────────────────────────────────────────────────────────

export interface PelletTestExport {
  session: PelletTestSession
  groups: PelletTestGroup[]
  confidence_badge?: ConfidenceBadge
}

// ── Detection (PT-3) ────────────────────────────────────────────────────────────

export interface PelletTestDetection {
  id: string
  measurement_id: string
  session_id: string
  center_x: number
  center_y: number
  radius_pixels: number
  diameter_mm?: number
  confidence: number
  is_confirmed: boolean
  is_rejected: boolean
  created_at: string
}

export interface CreateDetectionInput {
  center_x: number
  center_y: number
  radius_pixels: number
  diameter_mm?: number
  confidence: number
}

export interface CreateDetectionsBatchPayload {
  detection_method: string
  detections: CreateDetectionInput[]
}

export interface UpdateDetectionPayload {
  center_x?: number
  center_y?: number
  radius_pixels?: number
  is_confirmed?: boolean
  is_rejected?: boolean
}

// ── Confidence Badge ────────────────────────────────────────────────────────────

export interface ConfidenceBadge {
  level: 'single' | 'emerging' | 'proven'
  test_count: number
  consistency_score?: number
}

// ── Public Leaderboard ──────────────────────────────────────────────────────────

export interface PublicLeaderboardEntry {
  pellet_brand: string
  pellet_model: string
  head_size_mm?: number
  weight_grains?: number
  best_group_mm: number
  avg_group_mm: number
  user_count: number
  test_count: number
  total_groups: number
  rank: number
}

// ── Batch Report ────────────────────────────────────────────────────────────────

export interface BatchReportEntry {
  batch_code: string
  pellet_brand: string
  pellet_model: string
  test_count: number
  total_groups: number
  best_group_mm?: number
  avg_group_mm?: number
  consistency_score?: number
  last_tested: string
}

// ── Export ───────────────────────────────────────────────────────────────────────

export interface PelletTestExport {
  session: PelletTestSession
  groups: PelletTestGroup[]
  confidence_badge?: ConfidenceBadge
}

// ── Comparison & Timeline ───────────────────────────────────────────────────────

export interface PelletComparisonSide {
  pellet_id: string
  pellet_brand: string
  pellet_model: string
  test_count: number
  total_groups: number
  best_group_mm?: number
  avg_group_mm?: number
  avg_velocity_fps?: number
  avg_velocity_sd?: number
  consistency?: number
  consistency_score?: number
  groups: PelletTestGroup[]
}

export interface PelletComparisonData {
  rifle_id: string
  side_a?: PelletComparisonSide
  side_b?: PelletComparisonSide
  pellet_a: PelletComparisonSide
  pellet_b: PelletComparisonSide
}

export interface GroupTimelinePoint {
  test_date: string
  rifle_id: string
  rifle_make: string
  rifle_model: string
  pellet_id: string
  pellet_name?: string
  pellet_brand: string
  pellet_model: string
  group_size_mm: number
  group_size_moa?: number
  distance_m: number
}

export interface ComboPerformanceSummary {
  rifle_id: string
  rifle_name: string
  pellet_id: string
  pellet_name: string
  best_group_mm?: number
  avg_group_mm?: number
  test_count: number
  consistency?: number
  last_tested: string
}

// ── API ─────────────────────────────────────────────────────────────────────────

export const pelletTestApi = {
  // Sessions
  create: (payload: CreatePelletTestPayload) =>
    api.post<PelletTestSession>('/pellet-tests', payload),
  quickCreate: (payload: QuickCreatePelletTestPayload) =>
    api.post<PelletTestSession>('/pellet-tests/quick', payload),
  graduate: (id: string) =>
    api.post<PelletTestSession>(`/pellet-tests/${id}/graduate`, {}),
  draftCount: () =>
    api.get<{ count: number }>('/pellet-tests/drafts/count'),
  list: (limit = 20, offset = 0, scope?: 'drafts' | 'all') => {
    let url = `/pellet-tests?limit=${limit}&offset=${offset}`
    if (scope) url += `&scope=${scope}`
    return api.get<{ items: PelletTestSessionSummary[] }>(url)
  },
  get: (id: string) =>
    api.get<PelletTestSession>(`/pellet-tests/${id}`),
  update: (id: string, payload: UpdatePelletTestPayload) =>
    api.patch<PelletTestSession>(`/pellet-tests/${id}`, payload),
  delete: (id: string) =>
    api.del<void>(`/pellet-tests/${id}`),

  // Groups
  createGroup: (sessionId: string, payload: CreateGroupPayload) =>
    api.post<PelletTestGroup>(`/pellet-tests/${sessionId}/groups`, payload),
  updateGroup: (sessionId: string, groupId: string, payload: UpdateGroupPayload) =>
    api.patch<PelletTestGroup>(`/pellet-tests/${sessionId}/groups/${groupId}`, payload),
  deleteGroup: (sessionId: string, groupId: string) =>
    api.del<void>(`/pellet-tests/${sessionId}/groups/${groupId}`),

  // Images
  uploadImage: (sessionId: string, file: File, groupId?: string, caption?: string) => {
    const fd = new FormData()
    fd.append('image', file)
    if (groupId) fd.append('group_id', groupId)
    if (caption) fd.append('caption', caption)
    return api.upload<PelletTestImage>(`/pellet-tests/${sessionId}/images`, fd)
  },
  deleteImage: (sessionId: string, imageId: string) =>
    api.del<void>(`/pellet-tests/${sessionId}/images/${imageId}`),

  // Leaderboard & stats
  leaderboard: (rifleId: string) =>
    api.get<{ items: PelletLeaderboardEntry[] }>(`/pellet-tests/leaderboard?rifle_id=${rifleId}`),
  stats: () =>
    api.get<PelletTestStats>('/pellet-tests/stats'),

  // Measurements
  createMeasurement: (sessionId: string, imageId: string, payload: CreateMeasurementPayload) =>
    api.post<PelletTestMeasurement>(`/pellet-tests/${sessionId}/images/${imageId}/measurements`, payload),
  getMeasurements: (sessionId: string, imageId: string) =>
    api.get<{ items: PelletTestMeasurement[] }>(`/pellet-tests/${sessionId}/images/${imageId}/measurements`),
  updateMeasurement: (sessionId: string, imageId: string, measurementId: string, payload: UpdateMeasurementPayload) =>
    api.patch<PelletTestMeasurement>(`/pellet-tests/${sessionId}/images/${imageId}/measurements/${measurementId}`, payload),
  deleteMeasurement: (sessionId: string, imageId: string, measurementId: string) =>
    api.del<void>(`/pellet-tests/${sessionId}/images/${imageId}/measurements/${measurementId}`),
  getSessionScoring: (sessionId: string) =>
    api.get<{ measurements: PelletTestMeasurement[]; detections: PelletTestDetection[] }>(
      `/pellet-tests/${sessionId}/scoring`,
    ),

  // Comparison & Timeline
  compare: (rifleId: string, pelletA: string, pelletB: string) =>
    api.get<PelletComparisonData>(`/pellet-tests/compare?rifle_id=${rifleId}&pellet_a=${pelletA}&pellet_b=${pelletB}`),
  timeline: (rifleId?: string) =>
    api.get<{ items: GroupTimelinePoint[] }>(
      rifleId ? `/pellet-tests/timeline?rifle_id=${rifleId}` : `/pellet-tests/timeline`,
    ),

  // Detections (PT-3)
  createDetections: (sessionId: string, imageId: string, measurementId: string, payload: CreateDetectionsBatchPayload) =>
    api.post<{ items: PelletTestDetection[] }>(`/pellet-tests/${sessionId}/images/${imageId}/measurements/${measurementId}/detections`, payload),
  replaceDetections: (sessionId: string, imageId: string, measurementId: string, payload: CreateDetectionsBatchPayload) =>
    api.put<{ items: PelletTestDetection[] }>(`/pellet-tests/${sessionId}/images/${imageId}/measurements/${measurementId}/detections`, payload),
  listDetections: (sessionId: string, imageId: string, measurementId: string) =>
    api.get<{ items: PelletTestDetection[] }>(`/pellet-tests/${sessionId}/images/${imageId}/measurements/${measurementId}/detections`),
  updateDetection: (sessionId: string, detectionId: string, payload: UpdateDetectionPayload) =>
    api.patch<PelletTestDetection>(`/pellet-tests/${sessionId}/detections/${detectionId}`, payload),
  deleteDetection: (sessionId: string, detectionId: string) =>
    api.del<void>(`/pellet-tests/${sessionId}/detections/${detectionId}`),

  // Annotated image
  uploadAnnotatedImage: (sessionId: string, imageId: string, measurementId: string, file: Blob) => {
    const fd = new FormData()
    fd.append('image', file, 'annotated.png')
    return api.upload<{ annotated_image_id: string; image_url: string }>(`/pellet-tests/${sessionId}/images/${imageId}/measurements/${measurementId}/annotate`, fd)
  },

  // Confidence badge
  confidenceBadge: (rifleId: string, pelletId: string) =>
    api.get<ConfidenceBadge>(`/pellet-tests/confidence?rifle_id=${rifleId}&pellet_id=${pelletId}`),

  // Batch report
  batchReport: (pelletId?: string) =>
    api.get<{ items: BatchReportEntry[] }>(`/pellet-tests/batch-report${pelletId ? `?pellet_id=${pelletId}` : ''}`),

  // Export
  exportSession: (id: string) =>
    api.get<PelletTestExport>(`/pellet-tests/${id}/export`),

  // Public leaderboard (no auth)
  publicLeaderboard: (limit = 50, offset = 0) =>
    api.get<{ items: PublicLeaderboardEntry[] }>(`/pellet-tests/public-leaderboard?limit=${limit}&offset=${offset}`),

  // Combo analytics
  comboAnalytics: (rifleId?: string) => {
    const params = rifleId ? `?rifle_id=${rifleId}` : ''
    return api.get<{ items: ComboPerformanceSummary[] }>(`/pellet-tests/combo-analytics${params}`)
  },
}

import { useRef, useState, useEffect, useCallback, useMemo } from 'react'
import { ArrowLeft, X as XIcon, RotateCcw, RotateCw, Maximize, Scan } from 'lucide-react'
import { mmToMOA, mmToMRAD, yardsToMeters, metersToYards } from '../utils/ballistics'
import { detectHoles } from '../utils/holeDetection'
import type { DetectedHole } from '../utils/holeDetection'
import { CALIBER_MAP } from '../utils/caliber'
import type { PelletTestMeasurement, PelletTestDetection, CreateMeasurementPayload } from '../api/pelletTesting'
import { toast } from '../store/toast'

interface Props {
  imageUrl: string
  distanceM: number
  sessionId: string
  imageId: string
  existingMeasurement?: PelletTestMeasurement
  existingDetections?: PelletTestDetection[]
  onSave: (payload: CreateMeasurementPayload, analysisMeta: { groupSizeMM: number | null; shotCount: number; distanceValue: number; distanceUnit: 'meters' | 'yards' }) => void
  onSaveDetections?: (payload: CreateMeasurementPayload, detections: DetectedHole[], annotatedBlob: Blob | null, analysisMeta: { groupSizeMM: number | null; shotCount: number; distanceValue: number; distanceUnit: 'meters' | 'yards' }) => void
  onClose: () => void
  defaultDistanceUnit?: 'meters' | 'yards'
  defaultMeasurementUnit?: 'cm' | 'mm'
  isSaving?: boolean
  saveError?: string | null
}

type WizardStep = 1 | 2 | 3 | 4 | 5
type SubMode = 'idle' | 'set_aim' | 'set_point_a' | 'set_point_b' | 'add_impact' | 'remove_impact' | 'draw_line_start' | 'draw_line_end'
interface Point { x: number; y: number }

const RED = '#ef4444'
const YELLOW = '#eab308'
const DRAG_THRESHOLD = 5
const TOUCH_DRAG_THRESHOLD = 15

function computeGroupSizeFromImpacts(impacts: Point[], ppmm: number, pelletMM: number) {
  if (impacts.length < 2 || ppmm <= 0) return null
  let max = 0
  for (let i = 0; i < impacts.length; i++)
    for (let j = i + 1; j < impacts.length; j++) {
      const d = Math.hypot(impacts[i].x - impacts[j].x, impacts[i].y - impacts[j].y)
      if (d > max) max = d
    }
  return { mm: Math.round((max / ppmm + pelletMM) * 1000) / 1000 }
}

export default function ImageMeasurement({
  imageUrl,
  distanceM,
  existingMeasurement,
  existingDetections,
  onSave,
  onSaveDetections,
  onClose,
  defaultDistanceUnit,
  defaultMeasurementUnit,
  isSaving = false,
  saveError = null,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)

  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 })
  const zoomRef = useRef(1)
  const panRef = useRef<Point>({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const panStart = useRef<Point>({ x: 0, y: 0 })
  const panOffset = useRef<Point>({ x: 0, y: 0 })
  const pointerStart = useRef<Point>({ x: 0, y: 0 })
  const pointerTypeRef = useRef<string>('mouse')
  const didDrag = useRef(false)
  const isPointerDown = useRef(false)
  const activePointers = useRef<Map<number, Point>>(new Map())
  const lastPinchDist = useRef<number | null>(null)
  const isPinching = useRef(false)

  const [step, setStep] = useState<WizardStep>(1)
  const [subMode, setSubMode] = useState<SubMode>('set_aim')
  const [rotation, setRotation] = useState<number>(0)
  const [imageLoaded, setImageLoaded] = useState(false)
  const [canvasSize, setCanvasSize] = useState({ w: 800, h: 600 })

  // Step 1
  const [aimPoint, setAimPoint] = useState<Point | null>(null)
  // Step 2
  const [pointA, setPointA] = useState<Point | null>(null)
  const [pointB, setPointB] = useState<Point | null>(null)
  const [calibUnit, setCalibUnit] = useState<'cm' | 'mm'>(defaultMeasurementUnit ?? 'cm')
  const [calibDistance, setCalibDistance] = useState('')
  const [pixelsPerMM, setPixelsPerMM] = useState(0)
  const [displayUnit, setDisplayUnit] = useState<'cm' | 'mm'>(defaultMeasurementUnit ?? 'mm')
  // Step 3
  const [distanceUnit, setDistanceUnit] = useState<'meters' | 'yards'>(defaultDistanceUnit ?? 'meters')
  const [distanceToTarget, setDistanceToTarget] = useState(() => {
    if (defaultDistanceUnit === 'yards') return String(Math.round(metersToYards(distanceM) * 10) / 10)
    return String(distanceM)
  })
  const [markerSize, setMarkerSize] = useState('.22')
  // Step 4
  const [measureMethod, setMeasureMethod] = useState<'impacts' | 'manual_line'>('impacts')
  const [impacts, setImpacts] = useState<Point[]>([])
  const [lineStart, setLineStart] = useState<Point | null>(null)
  const [lineEnd, setLineEnd] = useState<Point | null>(null)
  const [manualShotCount, setManualShotCount] = useState('')
  const [detectStatus, setDetectStatus] = useState<string | null>(null)

  // parseFloat handles edge cases that `Number()` silently coerces:
  // `Number('')` is 0 (|| fallback kicks in, masking an empty field);
  // `Number(' ')` is 0; `Number('abc')` is NaN (falsy, also silently falls
  // back). parseFloat + isFinite distinguishes "empty/garbage" from "0" so
  // we can gate the flow instead of saving a silent fallback distance.
  const parsedDistance = parseFloat(distanceToTarget)
  const isValidDistance = Number.isFinite(parsedDistance) && parsedDistance > 0
  const rawDistance = isValidDistance ? parsedDistance : 0
  const effectiveDistanceM = isValidDistance
    ? (distanceUnit === 'yards' ? yardsToMeters(rawDistance) : rawDistance)
    : 0
  const displayDistance = rawDistance
  const distanceLabel = distanceUnit === 'yards' ? 'yd' : 'm'
  const pelletDiameterMM = CALIBER_MAP[markerSize] ?? (Number(markerSize) || 4.5)

  // Load image
  useEffect(() => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => { imgRef.current = img; setImageLoaded(true) }
    img.src = imageUrl
  }, [imageUrl])

  // Canvas resize
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect
      setCanvasSize({ w: Math.floor(width), h: Math.floor(height) })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])


  useEffect(() => {
    zoomRef.current = zoom
  }, [zoom])

  useEffect(() => {
    panRef.current = pan
  }, [pan])

  // Rotation helpers
  const imageToRotated = useCallback((pt: Point): Point => {
    const img = imgRef.current
    if (!img) return pt
    const cx = img.width / 2, cy = img.height / 2
    const dx = pt.x - cx, dy = pt.y - cy
    const rad = (rotation * Math.PI) / 180
    return { x: dx * Math.cos(rad) - dy * Math.sin(rad) + cx, y: dx * Math.sin(rad) + dy * Math.cos(rad) + cy }
  }, [rotation])

  const screenToImage = useCallback((sx: number, sy: number): Point => {
    const canvas = canvasRef.current, img = imgRef.current
    if (!canvas || !img) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    let ix = (sx - rect.left - pan.x) / zoom
    let iy = (sy - rect.top - pan.y) / zoom
    const cx = img.width / 2, cy = img.height / 2
    ix -= cx; iy -= cy
    const rad = (-rotation * Math.PI) / 180
    return { x: ix * Math.cos(rad) - iy * Math.sin(rad) + cx, y: ix * Math.sin(rad) + iy * Math.cos(rad) + cy }
  }, [pan, zoom, rotation])

  const fitToView = useCallback(() => {
    const img = imgRef.current
    if (!img) return
    const is90 = rotation === 90 || rotation === 270
    const iw = is90 ? img.height : img.width, ih = is90 ? img.width : img.height
    const scale = Math.min(canvasSize.w / iw, canvasSize.h / ih) * 0.95
    setZoom(scale)
    setPan({ x: (canvasSize.w - img.width * scale) / 2, y: (canvasSize.h - img.height * scale) / 2 })
  }, [canvasSize, rotation])

  useEffect(() => { if (imageLoaded) fitToView() }, [imageLoaded, fitToView])

  // Hydrate wizard from an existing measurement (edit mode) — runs once per mount.
  const hydratedRef = useRef(false)
  useEffect(() => {
    if (!imageLoaded || !existingMeasurement || hydratedRef.current) return
    hydratedRef.current = true
    const em = existingMeasurement
    setRotation(em.rotation_degrees ?? 0)
    if (em.aim_point_x != null && em.aim_point_y != null) setAimPoint({ x: em.aim_point_x, y: em.aim_point_y })
    const paX = em.point_a_x ?? em.ref_center_x
    const paY = em.point_a_y ?? em.ref_center_y
    if (paX != null && paY != null) setPointA({ x: paX, y: paY })
    if (em.point_b_x != null && em.point_b_y != null) setPointB({ x: em.point_b_x, y: em.point_b_y })
    if (em.pixels_per_mm > 0) setPixelsPerMM(em.pixels_per_mm)
    const cUnit = (em.display_unit ?? defaultMeasurementUnit ?? 'cm') as 'cm' | 'mm'
    setCalibUnit(cUnit)
    setDisplayUnit(cUnit)
    if (em.reference_diameter_mm > 0) {
      const refValue = cUnit === 'cm' ? em.reference_diameter_mm / 10 : em.reference_diameter_mm
      setCalibDistance(String(Math.round(refValue * 1000) / 1000))
    }
    if (em.marker_size) setMarkerSize(em.marker_size)
    const dUnit = (em.distance_unit ?? defaultDistanceUnit ?? 'meters') as 'meters' | 'yards'
    setDistanceUnit(dUnit)
    if (em.distance_m != null) {
      const shown = dUnit === 'yards' ? metersToYards(em.distance_m) : em.distance_m
      setDistanceToTarget(String(Math.round(shown * 10) / 10))
    }
    const method = (em.measure_method ?? 'impacts') as 'impacts' | 'manual_line'
    setMeasureMethod(method)
    if (method === 'manual_line') {
      if (em.line_start_x != null && em.line_start_y != null) setLineStart({ x: em.line_start_x, y: em.line_start_y })
      if (em.line_end_x != null && em.line_end_y != null) setLineEnd({ x: em.line_end_x, y: em.line_end_y })
      if (em.manual_shot_count != null) setManualShotCount(String(em.manual_shot_count))
    } else if (existingDetections && existingDetections.length > 0) {
      setImpacts(existingDetections.map(d => ({ x: d.center_x, y: d.center_y })))
    }
    setStep(5)
    setSubMode('idle')
  }, [imageLoaded, existingMeasurement, existingDetections, defaultDistanceUnit, defaultMeasurementUnit])

  const handleReset = useCallback(() => {
    setAimPoint(null)
    setPointA(null)
    setPointB(null)
    setImpacts([])
    setLineStart(null)
    setLineEnd(null)
    setManualShotCount('')
    setPixelsPerMM(0)
    setCalibDistance('')
    setRotation(0)
    setMarkerSize('.22')
    setDistanceToTarget(String(distanceM))
    setDistanceUnit(defaultDistanceUnit ?? 'meters')
    setCalibUnit(defaultMeasurementUnit ?? 'cm')
    setDisplayUnit(defaultMeasurementUnit ?? 'mm')
    setMeasureMethod('impacts')
    setDetectStatus(null)
    setStep(1)
    setSubMode('set_aim')
  }, [distanceM, defaultDistanceUnit, defaultMeasurementUnit])

  // Computed analysis values
  const centroid = useMemo(() => {
    if (impacts.length === 0) return null
    const sx = impacts.reduce((s, p) => s + p.x, 0)
    const sy = impacts.reduce((s, p) => s + p.y, 0)
    return { x: sx / impacts.length, y: sy / impacts.length }
  }, [impacts])

  const meanRadiusMM = useMemo(() => {
    if (!centroid || impacts.length < 2 || pixelsPerMM <= 0) return null
    const avg = impacts.reduce((s, p) => s + Math.hypot(p.x - centroid.x, p.y - centroid.y), 0) / impacts.length
    return Math.round((avg / pixelsPerMM) * 100) / 100
  }, [centroid, impacts, pixelsPerMM])

  const groupResult = useMemo(() => computeGroupSizeFromImpacts(impacts, pixelsPerMM, pelletDiameterMM), [impacts, pixelsPerMM, pelletDiameterMM])
  const groupSizeMOA = groupResult && isValidDistance ? Math.round(mmToMOA(groupResult.mm, effectiveDistanceM) * 10) / 10 : null
  const groupSizeRaw = groupResult?.mm ?? null
  const manualGroupSizeMM = useMemo(() => {
    if (!lineStart || !lineEnd || pixelsPerMM <= 0) return null
    return Math.hypot(lineEnd.x - lineStart.x, lineEnd.y - lineStart.y) / pixelsPerMM
  }, [lineStart, lineEnd, pixelsPerMM])
  const manualGroupSizeMOA = manualGroupSizeMM !== null && isValidDistance ? Math.round(mmToMOA(manualGroupSizeMM, effectiveDistanceM) * 10) / 10 : null
  const manualMidpoint = useMemo(() => {
    if (!lineStart || !lineEnd) return null
    return { x: (lineStart.x + lineEnd.x) / 2, y: (lineStart.y + lineEnd.y) / 2 }
  }, [lineStart, lineEnd])
  const analysisShotCount = measureMethod === 'manual_line' ? Number(manualShotCount) || 0 : impacts.length
  const analysisDistanceValue = Number(distanceToTarget) || 0
  const analysisGroupSizeMM = measureMethod === 'manual_line' ? manualGroupSizeMM : groupSizeRaw
  const analysisGroupSizeMOA = measureMethod === 'manual_line' ? manualGroupSizeMOA : groupSizeMOA
  const fmtLen = (mm: number) => displayUnit === 'cm' ? (mm / 10).toFixed(2) : mm.toFixed(2)

  const referencePoint = measureMethod === 'manual_line' ? manualMidpoint : centroid
  const elevationMM = aimPoint && referencePoint && pixelsPerMM > 0 ? (aimPoint.y - referencePoint.y) / pixelsPerMM : null
  const windageMM = aimPoint && referencePoint && pixelsPerMM > 0 ? (referencePoint.x - aimPoint.x) / pixelsPerMM : null
  const elevMOA = elevationMM !== null && isValidDistance ? Math.round(mmToMOA(Math.abs(elevationMM), effectiveDistanceM) * 10) / 10 : null
  const windMOA = windageMM !== null && isValidDistance ? Math.round(mmToMOA(Math.abs(windageMM), effectiveDistanceM) * 10) / 10 : null
  const elevMRAD = elevationMM !== null && isValidDistance ? Math.round(mmToMRAD(Math.abs(elevationMM), effectiveDistanceM) * 10) / 10 : null
  const windMRAD = windageMM !== null && isValidDistance ? Math.round(mmToMRAD(Math.abs(windageMM), effectiveDistanceM) * 10) / 10 : null


  // ── Drawing ────────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current, ctx = canvas?.getContext('2d'), img = imgRef.current
    if (!canvas || !ctx || !img) return
    canvas.width = canvasSize.w; canvas.height = canvasSize.h
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#111'; ctx.fillRect(0, 0, canvas.width, canvas.height)

    ctx.save()
    ctx.translate(pan.x, pan.y)
    ctx.scale(zoom, zoom)
    // Rotate around image center
    const cx = img.width / 2, cy = img.height / 2
    ctx.translate(cx, cy)
    ctx.rotate((rotation * Math.PI) / 180)
    ctx.translate(-cx, -cy)
    ctx.drawImage(img, 0, 0)
    ctx.restore()

    // Draw overlays in screen-transformed image space
    ctx.save()
    ctx.translate(pan.x, pan.y)
    ctx.scale(zoom, zoom)

    // Crosshairs through aim point
    if (aimPoint) {
      const rp = imageToRotated(aimPoint)
      ctx.strokeStyle = RED; ctx.lineWidth = 1 / zoom
      ctx.beginPath(); ctx.moveTo(0, rp.y); ctx.lineTo(img.width, rp.y); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(rp.x, 0); ctx.lineTo(rp.x, img.height); ctx.stroke()
    }

    // Calibration points
    const drawCalibPoint = (pt: Point, label: string) => {
      const rp = imageToRotated(pt)
      const r = 8 / zoom
      ctx.beginPath(); ctx.arc(rp.x, rp.y, r, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(234,179,8,0.4)'; ctx.fill()
      ctx.strokeStyle = YELLOW; ctx.lineWidth = 2 / zoom; ctx.stroke()
      ctx.font = `bold ${Math.max(12, 14 / zoom)}px sans-serif`
      ctx.fillStyle = YELLOW; ctx.textAlign = 'center'
      ctx.fillText(label, rp.x, rp.y - r - 4 / zoom)
    }
    if (pointA) drawCalibPoint(pointA, 'A')
    if (pointB) drawCalibPoint(pointB, 'B')

    // Impact markers
    for (const imp of impacts) {
      const rp = imageToRotated(imp)
      const r = pixelsPerMM > 0 ? (pelletDiameterMM / 2) * pixelsPerMM : 12 / zoom
      ctx.beginPath(); ctx.arc(rp.x, rp.y, r, 0, Math.PI * 2)
      ctx.strokeStyle = RED; ctx.lineWidth = 2 / zoom; ctx.stroke()
      ctx.fillStyle = 'rgba(239,68,68,0.2)'; ctx.fill()
      // X through center
      const d = r * 0.7
      ctx.beginPath(); ctx.moveTo(rp.x - d, rp.y - d); ctx.lineTo(rp.x + d, rp.y + d); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(rp.x + d, rp.y - d); ctx.lineTo(rp.x - d, rp.y + d); ctx.stroke()
    }

    if (lineStart && lineEnd) {
      const rs = imageToRotated(lineStart)
      const re = imageToRotated(lineEnd)
      ctx.strokeStyle = '#22c55e'
      ctx.lineWidth = 2 / zoom
      ctx.beginPath()
      ctx.moveTo(rs.x, rs.y)
      ctx.lineTo(re.x, re.y)
      ctx.stroke()

      const pointRadius = 5 / zoom
      ctx.fillStyle = '#22c55e'
      ctx.beginPath(); ctx.arc(rs.x, rs.y, pointRadius, 0, Math.PI * 2); ctx.fill()
      ctx.beginPath(); ctx.arc(re.x, re.y, pointRadius, 0, Math.PI * 2); ctx.fill()

      if (manualGroupSizeMM !== null) {
        const mx = (rs.x + re.x) / 2
        const my = (rs.y + re.y) / 2
        ctx.font = `bold ${Math.max(12, 14 / zoom)}px sans-serif`
        ctx.fillStyle = '#22c55e'
        ctx.textAlign = 'center'
        ctx.fillText(`${manualGroupSizeMM.toFixed(2)} mm`, mx, my - 8 / zoom)
      }
    }

    ctx.restore()
  }, [canvasSize, pan, zoom, rotation, aimPoint, pointA, pointB, impacts, imageToRotated, pixelsPerMM, pelletDiameterMM, lineStart, lineEnd, manualGroupSizeMM])

  useEffect(() => { if (imageLoaded) requestAnimationFrame(draw) }, [imageLoaded, draw])

  // ── Pointer handlers ───────────────────────────────────────────────
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.setPointerCapture(e.pointerId)
    activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (activePointers.current.size >= 2) {
      const points = Array.from(activePointers.current.values())
      const p1 = points[0]
      const p2 = points[1]
      isPinching.current = true
      lastPinchDist.current = Math.hypot(p2.x - p1.x, p2.y - p1.y)
    }

    pointerTypeRef.current = e.pointerType
    pointerStart.current = { x: e.clientX, y: e.clientY }
    didDrag.current = false
    isPointerDown.current = true
    panStart.current = { x: e.clientX, y: e.clientY }
    panOffset.current = { ...pan }
  }, [pan])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (isPinching.current && activePointers.current.size >= 2) {
      const points = Array.from(activePointers.current.values())
      const p1 = points[0]
      const p2 = points[1]
      const currentDist = Math.hypot(p2.x - p1.x, p2.y - p1.y)
      const prevDist = lastPinchDist.current
      if (prevDist && prevDist > 0) {
        const ratio = currentDist / prevDist
        const currentZoom = zoomRef.current
        const nz = Math.min(Math.max(currentZoom * ratio, 0.1), 10)
        const canvas = canvasRef.current
        if (canvas) {
          const rect = canvas.getBoundingClientRect()
          const mx = ((p1.x + p2.x) / 2) - rect.left
          const my = ((p1.y + p2.y) / 2) - rect.top
          const currentPan = panRef.current
          const nextPan = {
            x: mx - (mx - currentPan.x) * (nz / currentZoom),
            y: my - (my - currentPan.y) * (nz / currentZoom),
          }
          panRef.current = nextPan
          zoomRef.current = nz
          setPan(nextPan)
          setZoom(nz)
        }
      }
      lastPinchDist.current = currentDist
      didDrag.current = true
      return
    }

    if (!isPointerDown.current) return
    const dx = e.clientX - pointerStart.current.x
    const dy = e.clientY - pointerStart.current.y
    const threshold = pointerTypeRef.current === 'touch' ? TOUCH_DRAG_THRESHOLD : DRAG_THRESHOLD
    if (Math.hypot(dx, dy) > threshold) {
      didDrag.current = true
      if (subMode === 'idle') {
        if (!isPanning) setIsPanning(true)
        setPan({
          x: panOffset.current.x + (e.clientX - panStart.current.x),
          y: panOffset.current.y + (e.clientY - panStart.current.y),
        })
      }
    }
  }, [isPanning, subMode])

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    const canvas = canvasRef.current
    if (canvas) canvas.releasePointerCapture(e.pointerId)
    activePointers.current.delete(e.pointerId)
    if (isPinching.current && activePointers.current.size < 2) {
      isPinching.current = false
      lastPinchDist.current = null
      isPointerDown.current = false
      setIsPanning(false)
      return
    }

    isPointerDown.current = false
    if (isPanning) { setIsPanning(false); return }
    if (didDrag.current) return

    // Tap action
    const pt = screenToImage(e.clientX, e.clientY)
    if (subMode === 'set_aim') setAimPoint(pt)
    else if (subMode === 'set_point_a') { setPointA(pt); setSubMode('idle') }
    else if (subMode === 'set_point_b') { setPointB(pt); setSubMode('idle') }
    else if (subMode === 'draw_line_start') { setLineStart(pt); setSubMode('idle') }
    else if (subMode === 'draw_line_end') { setLineEnd(pt); setSubMode('idle') }
    else if (subMode === 'add_impact') setImpacts(prev => [...prev, pt])
    else if (subMode === 'remove_impact' && impacts.length > 0) {
      let minD = Infinity, minI = -1
      impacts.forEach((p, i) => { const d = Math.hypot(pt.x - p.x, pt.y - p.y); if (d < minD) { minD = d; minI = i } })
      if (minI >= 0) setImpacts(prev => prev.filter((_, i) => i !== minI))
    }
  }, [isPanning, screenToImage, subMode, impacts])

  const handlePointerCancel = useCallback((e: React.PointerEvent) => {
    activePointers.current.delete(e.pointerId)
    if (isPinching.current && activePointers.current.size < 2) {
      isPinching.current = false
      lastPinchDist.current = null
    }
    isPointerDown.current = false
    setIsPanning(false)
  }, [])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const factor = e.deltaY < 0 ? 1.1 : 0.9
    const currentZoom = zoomRef.current
    const nz = Math.min(Math.max(currentZoom * factor, 0.1), 10)
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    const currentPan = panRef.current
    const nextPan = {
      x: mx - (mx - currentPan.x) * (nz / currentZoom),
      y: my - (my - currentPan.y) * (nz / currentZoom),
    }
    panRef.current = nextPan
    zoomRef.current = nz
    setPan(nextPan)
    setZoom(nz)
  }, [])

  // ── Actions ────────────────────────────────────────────────────────
  const handleCalibSet = () => {
    if (!pointA || !pointB || !calibDistance) return
    const d = Math.hypot(pointA.x - pointB.x, pointA.y - pointB.y)
    const mm = calibUnit === 'cm' ? Number(calibDistance) * 10 : Number(calibDistance)
    if (mm > 0 && d > 0) setPixelsPerMM(d / mm)
  }

  const handleAutoDetect = useCallback(() => {
    const img = imgRef.current
    if (!img || pixelsPerMM <= 0) return
    const tc = document.createElement('canvas')
    tc.width = img.width; tc.height = img.height
    const ctx = tc.getContext('2d')
    if (!ctx) return
    ctx.drawImage(img, 0, 0)
    const imageData = ctx.getImageData(0, 0, img.width, img.height)
    const holes = detectHoles(imageData, { pixelsPerMM, pelletDiameterMM })
    if (holes.length > 0) {
      setImpacts(holes.map(h => ({ x: h.centerX, y: h.centerY })))
      setDetectStatus(`Detected ${holes.length} hole${holes.length === 1 ? '' : 's'}`)
    } else {
      setDetectStatus('No holes detected — try marking manually')
    }
  }, [pixelsPerMM, pelletDiameterMM])

  const generateAnnotatedBlob = useCallback((): Promise<Blob | null> => {
    const img = imgRef.current
    if (!img) return Promise.resolve(null)
    const tc = document.createElement('canvas')
    tc.width = img.width; tc.height = img.height
    const ctx = tc.getContext('2d')
    if (!ctx) return Promise.resolve(null)
    ctx.drawImage(img, 0, 0)
    for (const imp of impacts) {
      const r = pixelsPerMM > 0 ? (pelletDiameterMM / 2) * pixelsPerMM : 12
      ctx.beginPath(); ctx.arc(imp.x, imp.y, r, 0, Math.PI * 2)
      ctx.strokeStyle = RED; ctx.lineWidth = 2; ctx.stroke()
      const d = r * 0.7
      ctx.beginPath(); ctx.moveTo(imp.x - d, imp.y - d); ctx.lineTo(imp.x + d, imp.y + d); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(imp.x + d, imp.y - d); ctx.lineTo(imp.x - d, imp.y + d); ctx.stroke()
    }
    return new Promise(resolve => { tc.toBlob(b => resolve(b), 'image/png') })
  }, [impacts, pixelsPerMM, pelletDiameterMM])

  const handleDone = useCallback(async () => {
    if (!pointA || pixelsPerMM <= 0) { onClose(); return }
    if (!isValidDistance) {
      toast('Enter a distance greater than 0', 'error')
      return
    }
    const pd = pointB ? Math.hypot(pointA.x - pointB.x, pointA.y - pointB.y) : 0
    const refMM = calibUnit === 'cm' ? Number(calibDistance) * 10 : Number(calibDistance)
    const payload: CreateMeasurementPayload = {
      calibration_type: 'two_point',
      reference_diameter_mm: refMM,
      reference_pixels: pd,
      pixels_per_mm: pixelsPerMM,
      ref_center_x: pointA.x,
      ref_center_y: pointA.y,
      ref_radius_pixels: 0,
      aim_point_x: aimPoint?.x,
      aim_point_y: aimPoint?.y,
      point_a_x: pointA.x,
      point_a_y: pointA.y,
      point_b_x: pointB?.x,
      point_b_y: pointB?.y,
      rotation_degrees: rotation,
      marker_size: markerSize,
      distance_m: effectiveDistanceM,
      distance_unit: distanceUnit,
      measure_method: measureMethod,
      display_unit: displayUnit,
    }
    if (measureMethod === 'manual_line') {
      const shotCount = Number(manualShotCount)
      if (!Number.isFinite(shotCount) || shotCount <= 0) {
        toast('Enter a shot count greater than 0', 'error')
        return
      }
      onSave({
        ...payload,
        line_start_x: lineStart?.x,
        line_start_y: lineStart?.y,
        line_end_x: lineEnd?.x,
        line_end_y: lineEnd?.y,
        manual_group_size_mm: manualGroupSizeMM ?? undefined,
        manual_shot_count: shotCount,
      }, { groupSizeMM: analysisGroupSizeMM, shotCount: analysisShotCount, distanceValue: analysisDistanceValue, distanceUnit })
      return
    }
    if (onSaveDetections && impacts.length > 0) {
      const dets: DetectedHole[] = impacts.map(p => ({
        centerX: p.x, centerY: p.y,
        radiusPixels: (pelletDiameterMM / 2) * pixelsPerMM,
        diameterMM: pelletDiameterMM, confidence: 1.0, pixelCount: 0,
      }))
      const blob = await generateAnnotatedBlob()
      onSaveDetections(payload, dets, blob, { groupSizeMM: analysisGroupSizeMM, shotCount: analysisShotCount, distanceValue: analysisDistanceValue, distanceUnit })
    } else { onSave(payload, { groupSizeMM: analysisGroupSizeMM, shotCount: analysisShotCount, distanceValue: analysisDistanceValue, distanceUnit }) }
  }, [pointA, pointB, pixelsPerMM, calibDistance, calibUnit, impacts, pelletDiameterMM, onSave, onSaveDetections, onClose, generateAnnotatedBlob, measureMethod, manualGroupSizeMM, manualShotCount, analysisGroupSizeMM, analysisShotCount, analysisDistanceValue, distanceUnit, aimPoint, rotation, markerSize, effectiveDistanceM, displayUnit, lineStart, lineEnd, isValidDistance])

  const stepTitles: Record<WizardStep, string> = { 1: 'Set Aim Point', 2: 'Set Measurement Points', 3: 'Distance and marker size', 4: 'Add impacts', 5: 'Group Analysis Summary' }

  const goNext = () => {
    if (step === 1) { setStep(2); setSubMode('idle') }
    else if (step === 2) { setStep(3); setSubMode('idle') }
    else if (step === 3) { setStep(4); setSubMode('add_impact') }
    else if (step === 4) { setStep(5); setSubMode('idle') }
  }

  const setMeasurementMethod = (method: 'impacts' | 'manual_line') => {
    setMeasureMethod(method)
    if (method === 'impacts') {
      setLineStart(null)
      setLineEnd(null)
      setManualShotCount('')
      setSubMode('add_impact')
    } else {
      setImpacts([])
      setSubMode('idle')
    }
  }
  const goBack = () => {
    if (step === 1) onClose()
    else if (step === 2) { setStep(1); setSubMode('set_aim') }
    else if (step === 3) { setStep(2); setSubMode('idle') }
    else if (step === 4) { setStep(3); setSubMode('idle') }
    else if (step === 5) { setStep(4); setSubMode('add_impact') }
  }

  const inputCls = 'w-full bg-surface-hover border border-subtle rounded px-3 py-2 text-primary text-sm focus:outline-none focus:border-[var(--brass)]'

  // ── Stats Overlay ──────────────────────────────────────────────────
  const unitToggle = (
    <div className="flex rounded border border-white/20 overflow-hidden">
      <button onClick={() => setDisplayUnit('mm')} className={`px-2 py-0.5 text-[10px] font-medium ${displayUnit === 'mm' ? 'bg-blue-500 text-white' : 'text-gray-400'}`}>mm</button>
      <button onClick={() => setDisplayUnit('cm')} className={`px-2 py-0.5 text-[10px] font-medium ${displayUnit === 'cm' ? 'bg-blue-500 text-white' : 'text-gray-400'}`}>cm</button>
    </div>
  )

  const statsOverlay = (
      <div className="absolute top-2 left-2 z-10 bg-black/70 backdrop-blur-sm rounded-lg p-3 text-white text-xs font-mono space-y-0.5">
      <div className="flex items-center justify-between gap-4 mb-1"><span className="text-[10px] text-gray-400 uppercase">Stats</span>{unitToggle}</div>
      <div className="flex gap-6"><span>Shots:</span><span className="font-semibold">{analysisShotCount}</span></div>
      <div className="flex gap-6"><span>Distance:</span><span className="font-semibold">{displayDistance}{distanceLabel}</span></div>
      {measureMethod === 'impacts' && <div className="flex gap-6"><span>Mean Radius:</span><span className="font-semibold">{meanRadiusMM !== null ? `${fmtLen(meanRadiusMM)}${displayUnit}` : ''}</span></div>}
      <div className="flex gap-6"><span>Group Size:</span><span className="font-semibold">{analysisGroupSizeMM !== null ? `${fmtLen(analysisGroupSizeMM)}${displayUnit}` : ''}</span></div>
      <div className="flex gap-6"><span>Group Size:</span><span className="font-semibold">{analysisGroupSizeMOA !== null ? `${analysisGroupSizeMOA} MOA` : ''}</span></div>
      <div className="flex gap-6"><span>Elevation<br/>(moa/mrad):</span><span className="font-semibold">{elevMOA !== null ? `${elevMOA}/${elevMRAD}` : ''}</span></div>
      <div className="flex gap-6"><span>Windage<br/>(moa/mrad):</span><span className="font-semibold">{windMOA !== null ? `${windMOA}/${windMRAD}` : ''}</span></div>
    </div>
  )

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-page">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-surface border-b border-subtle">
        <button onClick={goBack} className="text-primary p-1"><ArrowLeft size={20} /></button>
        <span className="text-primary font-medium text-sm tracking-wide">{stepTitles[step]}</span>
        <div className="flex items-center gap-2">
          {existingMeasurement && (
            <button
              onClick={handleReset}
              className="text-secondary hover:text-primary text-[11px] tracking-widest uppercase px-2 py-1 rounded border border-subtle"
            >
              Reset
            </button>
          )}
          <button onClick={onClose} className="text-primary p-1"><XIcon size={20} /></button>
        </div>
      </div>

      {/* Canvas */}
      <div ref={containerRef} className="relative flex-1 overflow-hidden touch-none">
        {statsOverlay}
        <canvas
          ref={canvasRef}
          className="block"
          style={{ width: canvasSize.w, height: canvasSize.h, touchAction: 'none', cursor: subMode === 'idle' ? 'grab' : 'crosshair' }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onWheel={handleWheel}
        />
      </div>

      {/* Bottom Panel */}
      <div className="bg-surface rounded-t-xl px-4 pb-4 pt-0 shadow-[0_-4px_20px_rgba(0,0,0,0.3)]">
        {/* Title bar */}
        <div className="bg-[var(--brass)] text-white text-center py-2.5 text-xs font-semibold tracking-widest uppercase -mx-4 rounded-t-xl mb-3">
          {step === 1 && 'SET AIM POINT'}
          {step === 2 && 'SET MEASUREMENT POINTS'}
          {step === 3 && 'TARGET DISTANCE AND MARKER SIZE'}
          {step === 4 && 'ADD IMPACTS'}
          {step === 5 && 'GROUP ANALYSIS SUMMARY'}
        </div>

        {/* Step 1 controls */}
        {step === 1 && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setRotation(r => ((r + 270) % 360) as number)} className="flex items-center justify-center gap-2 py-2.5 rounded-lg border border-subtle text-secondary text-sm font-medium">
                <RotateCcw size={16} /> ROTATE
              </button>
              <button onClick={() => setRotation(r => ((r + 90) % 360) as number)} className="flex items-center justify-center gap-2 py-2.5 rounded-lg border border-subtle text-secondary text-sm font-medium">
                <RotateCw size={16} /> ROTATE
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => { setSubMode('set_aim'); fitToView() }} className="flex items-center justify-center gap-2 py-2.5 rounded-lg bg-blue-500 text-white text-sm font-medium">
                <Maximize size={16} /> SET
              </button>
              <button onClick={goNext} disabled={!aimPoint} className="flex items-center justify-center gap-2 py-2.5 rounded-lg bg-blue-500 text-white text-sm font-medium disabled:opacity-40">
                {'>'} NEXT
              </button>
            </div>
          </div>
        )}

        {/* Step 2 controls */}
        {step === 2 && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setSubMode('set_point_a')} className={`py-2.5 rounded-lg text-sm font-medium border ${subMode === 'set_point_a' ? 'bg-blue-500 text-white border-blue-500' : 'border-subtle text-secondary'}`}>
                SET POINT A {pointA && '\u2713'}
              </button>
              <button onClick={() => setSubMode('set_point_b')} className={`py-2.5 rounded-lg text-sm font-medium border ${subMode === 'set_point_b' ? 'bg-blue-500 text-white border-blue-500' : 'border-subtle text-secondary'}`}>
                SET POINT B {pointB && '\u2713'}
              </button>
            </div>
            <p className="text-muted text-xs text-center">Distance between points ({calibUnit})</p>
            <div className="flex gap-2">
              <input type="number" step="0.1" min="0" value={calibDistance} onChange={e => setCalibDistance(e.target.value)} placeholder={calibUnit === 'cm' ? '5.5' : '55'} className={inputCls} />
              <div className="flex rounded-lg border border-subtle overflow-hidden shrink-0">
                <button onClick={() => { setCalibUnit('cm'); setPixelsPerMM(0) }} className={`px-3 py-2 text-xs font-medium ${calibUnit === 'cm' ? 'bg-blue-500 text-white' : 'text-secondary'}`}>cm</button>
                <button onClick={() => { setCalibUnit('mm'); setPixelsPerMM(0) }} className={`px-3 py-2 text-xs font-medium ${calibUnit === 'mm' ? 'bg-blue-500 text-white' : 'text-secondary'}`}>mm</button>
              </div>
              <button onClick={handleCalibSet} disabled={!pointA || !pointB || !calibDistance} className="px-6 py-2 rounded-lg border border-subtle text-secondary text-sm font-medium disabled:opacity-40">SET</button>
            </div>
            <button onClick={goNext} disabled={pixelsPerMM <= 0} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-blue-500 text-white text-sm font-medium disabled:opacity-40">
              {'>'} NEXT
            </button>
          </div>
        )}

        {/* Step 3 controls */}
        {step === 3 && (
          <div className="space-y-3">
            <p className="text-muted text-xs text-center">Distance to target ({distanceUnit === 'yards' ? 'yd' : 'm'})</p>
            <div className="flex gap-2">
              <input type="number" step="0.1" min="0" value={distanceToTarget} onChange={e => setDistanceToTarget(e.target.value)} className={inputCls} />
              <div className="flex rounded-lg border border-subtle overflow-hidden shrink-0">
                <button onClick={() => { if (distanceUnit !== 'meters') { setDistanceUnit('meters'); setDistanceToTarget(String(Math.round(yardsToMeters(Number(distanceToTarget) || 0) * 10) / 10)) } }} className={`px-3 py-2 text-xs font-medium ${distanceUnit === 'meters' ? 'bg-blue-500 text-white' : 'text-secondary'}`}>m</button>
                <button onClick={() => { if (distanceUnit !== 'yards') { setDistanceUnit('yards'); setDistanceToTarget(String(Math.round(metersToYards(Number(distanceToTarget) || 0) * 10) / 10)) } }} className={`px-3 py-2 text-xs font-medium ${distanceUnit === 'yards' ? 'bg-blue-500 text-white' : 'text-secondary'}`}>yd</button>
              </div>
            </div>
            <p className="text-muted text-xs text-center">Impact marker size</p>
            <div className="flex gap-2">
              <select value={markerSize} onChange={e => setMarkerSize(e.target.value)} className={inputCls}>
                {Object.keys(CALIBER_MAP).map(k => <option key={k} value={k}>{k}</option>)}
              </select>
              <button className="px-6 py-2 rounded-lg border border-subtle text-secondary text-sm font-medium">SET</button>
            </div>
            {!isValidDistance && (
              <p role="alert" className="text-[11px] text-red-400">Enter a distance greater than 0.</p>
            )}
            <button onClick={goNext} disabled={!isValidDistance} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-blue-500 text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed">
              {'>'} NEXT
            </button>
          </div>
        )}

        {/* Step 4 controls */}
        {step === 4 && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setMeasurementMethod('impacts')} className={`py-2.5 rounded-lg text-sm font-medium border ${measureMethod === 'impacts' ? 'bg-blue-500 text-white border-blue-500' : 'border-subtle text-secondary'}`}>
                MARK IMPACTS
              </button>
              <button onClick={() => setMeasurementMethod('manual_line')} className={`py-2.5 rounded-lg text-sm font-medium border ${measureMethod === 'manual_line' ? 'bg-blue-500 text-white border-blue-500' : 'border-subtle text-secondary'}`}>
                DRAW LINE
              </button>
            </div>

            {measureMethod === 'impacts' && (
              <>
              <button onClick={() => { handleAutoDetect(); setSubMode('add_impact') }} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-[var(--brass)] text-white text-sm font-medium">
                <Scan size={16} /> AUTO DETECT
              </button>
              {detectStatus && <p className="text-xs text-center text-muted">{detectStatus}</p>}
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => setSubMode('add_impact')} className={`py-2.5 rounded-lg text-sm font-medium ${subMode === 'add_impact' ? 'bg-green-500 text-white' : 'border border-subtle text-secondary'}`}>
                  ADD
                </button>
                <button onClick={() => setSubMode('remove_impact')} className={`py-2.5 rounded-lg text-sm font-medium ${subMode === 'remove_impact' ? 'bg-red-500 text-white' : 'border border-subtle text-secondary'}`}>
                  REMOVE
                </button>
              </div>
              </>
            )}

            {measureMethod === 'manual_line' && (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => setSubMode('draw_line_start')} className={`py-2.5 rounded-lg text-sm font-medium border ${subMode === 'draw_line_start' ? 'bg-green-500 text-white border-green-500' : 'border-subtle text-secondary'}`}>
                    SET START {lineStart && '\u2713'}
                  </button>
                  <button onClick={() => setSubMode('draw_line_end')} className={`py-2.5 rounded-lg text-sm font-medium border ${subMode === 'draw_line_end' ? 'bg-green-500 text-white border-green-500' : 'border-subtle text-secondary'}`}>
                    SET END {lineEnd && '\u2713'}
                  </button>
                </div>
                <p className="text-xs text-muted text-center">
                  Group size: {manualGroupSizeMM !== null ? `${fmtLen(manualGroupSizeMM)} ${displayUnit} (${manualGroupSizeMOA ?? '—'} MOA)` : '—'}
                </p>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={manualShotCount}
                  onChange={e => setManualShotCount(e.target.value)}
                  placeholder="Shot count"
                  className={inputCls}
                />
              </div>
            )}

            <button
              onClick={goNext}
              disabled={measureMethod === 'impacts' ? impacts.length < 2 : !(lineStart && lineEnd && Number(manualShotCount) > 0)}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-blue-500 text-white text-sm font-medium disabled:opacity-40"
            >
              {'>'} ANALYZE
            </button>
          </div>
        )}

        {/* Step 5 controls */}
        {step === 5 && (
          <div className="space-y-3">
            <div className="bg-surface border border-subtle rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-primary font-semibold text-sm">Group Analysis Results</h2>
                <div className="flex rounded border border-subtle overflow-hidden">
                  <button onClick={() => setDisplayUnit('mm')} className={`px-2.5 py-1 text-xs font-medium ${displayUnit === 'mm' ? 'bg-blue-500 text-white' : 'text-muted'}`}>mm</button>
                  <button onClick={() => setDisplayUnit('cm')} className={`px-2.5 py-1 text-xs font-medium ${displayUnit === 'cm' ? 'bg-blue-500 text-white' : 'text-muted'}`}>cm</button>
                </div>
              </div>
              <div className="flex justify-between text-xs"><span className="text-muted">Shots:</span><span className="text-primary font-semibold">{analysisShotCount}</span></div>
              <div className="flex justify-between text-xs"><span className="text-muted">Distance:</span><span className="text-primary font-semibold">{displayDistance}{distanceLabel}</span></div>
              <div className="h-px bg-[var(--border-subtle)] my-1" />
              <div className="flex justify-between text-xs"><span className="text-muted">Group Size:</span><span className="text-primary font-bold">{analysisGroupSizeMOA !== null ? `${analysisGroupSizeMOA} MOA` : '—'}</span></div>
              <div className="flex justify-between text-xs"><span className="text-muted">Group Size:</span><span className="text-primary font-bold">{analysisGroupSizeMM !== null ? `${fmtLen(analysisGroupSizeMM)} ${displayUnit}` : '—'}</span></div>
              {measureMethod === 'impacts' && <div className="flex justify-between text-xs"><span className="text-muted">Mean Radius:</span><span className="text-primary font-semibold">{meanRadiusMM !== null ? `${fmtLen(meanRadiusMM)} ${displayUnit}` : '—'}</span></div>}
            </div>

            <button
              onClick={handleDone}
              disabled={isSaving}
              className="w-full py-3 rounded-lg bg-blue-500 text-white font-semibold text-sm tracking-wider uppercase disabled:opacity-60"
            >
              {isSaving ? 'SAVING...' : 'DONE'}
            </button>
            {saveError && <p className="text-xs text-[var(--error-text)] text-center">{saveError}</p>}
          </div>
        )}
      </div>
    </div>
  )
}

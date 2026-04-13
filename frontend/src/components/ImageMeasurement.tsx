import { useRef, useState, useEffect, useCallback, useMemo } from 'react'
import { ArrowLeft, X as XIcon, RotateCcw, RotateCw, Maximize } from 'lucide-react'
import { mmToMOA, mmToMRAD, yardsToMeters, metersToYards } from '../utils/ballistics'
import type { DetectedHole } from '../utils/holeDetection'
import type { PelletTestMeasurement, CreateMeasurementPayload } from '../api/pelletTesting'

interface Props {
  imageUrl: string
  distanceM: number
  sessionId: string
  imageId: string
  existingMeasurement?: PelletTestMeasurement
  onSave: (payload: CreateMeasurementPayload) => void
  onSaveDetections?: (payload: CreateMeasurementPayload, detections: DetectedHole[], annotatedBlob: Blob | null) => void
  onClose: () => void
  defaultDistanceUnit?: 'meters' | 'yards'
  defaultMeasurementUnit?: 'cm' | 'mm'
}

type WizardStep = 1 | 2 | 3 | 4 | 5
type SubMode = 'idle' | 'set_aim' | 'set_point_a' | 'set_point_b' | 'add_impact' | 'remove_impact'
interface Point { x: number; y: number }

const CALIBER_MAP: Record<string, number> = { '.177': 4.5, '.20': 5.08, '.22': 5.5, '.25': 6.35 }
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

export default function ImageMeasurement({ imageUrl, distanceM, onSave, onSaveDetections, onClose, defaultDistanceUnit, defaultMeasurementUnit }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)

  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const panStart = useRef<Point>({ x: 0, y: 0 })
  const panOffset = useRef<Point>({ x: 0, y: 0 })
  const pointerStart = useRef<Point>({ x: 0, y: 0 })
  const pointerTypeRef = useRef<string>('mouse')
  const didDrag = useRef(false)
  const isPointerDown = useRef(false)

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
  // Step 3
  const [distanceUnit, setDistanceUnit] = useState<'meters' | 'yards'>(defaultDistanceUnit ?? 'meters')
  const [distanceToTarget, setDistanceToTarget] = useState(() => {
    if (defaultDistanceUnit === 'yards') return String(Math.round(metersToYards(distanceM) * 10) / 10)
    return String(distanceM)
  })
  const [markerSize, setMarkerSize] = useState('.22')
  // Step 4
  const [impacts, setImpacts] = useState<Point[]>([])

  const rawDistance = Number(distanceToTarget) || distanceM
  const effectiveDistanceM = distanceUnit === 'yards' ? yardsToMeters(rawDistance) : rawDistance
  const displayDistance = distanceUnit === 'yards' ? rawDistance : rawDistance
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
  const groupSizeMOA = groupResult ? Math.round(mmToMOA(groupResult.mm, effectiveDistanceM) * 10) / 10 : null
  const groupSizeCM = groupResult ? Math.round(groupResult.mm / 10 * 100) / 100 : null

  const elevationMM = aimPoint && centroid && pixelsPerMM > 0 ? (aimPoint.y - centroid.y) / pixelsPerMM : null
  const windageMM = aimPoint && centroid && pixelsPerMM > 0 ? (centroid.x - aimPoint.x) / pixelsPerMM : null
  const elevMOA = elevationMM !== null ? Math.round(mmToMOA(Math.abs(elevationMM), effectiveDistanceM) * 10) / 10 : null
  const windMOA = windageMM !== null ? Math.round(mmToMOA(Math.abs(windageMM), effectiveDistanceM) * 10) / 10 : null
  const elevMRAD = elevationMM !== null ? Math.round(mmToMRAD(Math.abs(elevationMM), effectiveDistanceM) * 10) / 10 : null
  const windMRAD = windageMM !== null ? Math.round(mmToMRAD(Math.abs(windageMM), effectiveDistanceM) * 10) / 10 : null
  const scopeElev = elevationMM !== null ? (elevationMM > 0 ? 'Scope Down' : elevationMM < 0 ? 'Scope Up' : '') : ''
  const scopeWind = windageMM !== null ? (windageMM > 0 ? 'Scope Left' : windageMM < 0 ? 'Scope Right' : '') : ''


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

    ctx.restore()
  }, [canvasSize, pan, zoom, rotation, aimPoint, pointA, pointB, impacts, imageToRotated, pixelsPerMM, pelletDiameterMM])

  useEffect(() => { if (imageLoaded) requestAnimationFrame(draw) }, [imageLoaded, draw])

  // ── Pointer handlers ───────────────────────────────────────────────
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.setPointerCapture(e.pointerId)
    pointerTypeRef.current = e.pointerType
    pointerStart.current = { x: e.clientX, y: e.clientY }
    didDrag.current = false
    isPointerDown.current = true
    panStart.current = { x: e.clientX, y: e.clientY }
    panOffset.current = { ...pan }
  }, [pan])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
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
    isPointerDown.current = false
    if (isPanning) { setIsPanning(false); return }
    if (didDrag.current) return

    // Tap action
    const pt = screenToImage(e.clientX, e.clientY)
    if (subMode === 'set_aim') setAimPoint(pt)
    else if (subMode === 'set_point_a') { setPointA(pt); setSubMode('idle') }
    else if (subMode === 'set_point_b') { setPointB(pt); setSubMode('idle') }
    else if (subMode === 'add_impact') setImpacts(prev => [...prev, pt])
    else if (subMode === 'remove_impact' && impacts.length > 0) {
      let minD = Infinity, minI = -1
      impacts.forEach((p, i) => { const d = Math.hypot(pt.x - p.x, pt.y - p.y); if (d < minD) { minD = d; minI = i } })
      if (minI >= 0) setImpacts(prev => prev.filter((_, i) => i !== minI))
    }
  }, [isPanning, screenToImage, subMode, impacts])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const factor = e.deltaY < 0 ? 1.1 : 0.9
    const nz = Math.min(Math.max(zoom * factor, 0.1), 10)
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const mx = e.clientX - rect.left, my = e.clientY - rect.top
    setPan(prev => ({ x: mx - (mx - prev.x) * (nz / zoom), y: my - (my - prev.y) * (nz / zoom) }))
    setZoom(nz)
  }, [zoom])

  // ── Actions ────────────────────────────────────────────────────────
  const handleCalibSet = () => {
    if (!pointA || !pointB || !calibDistance) return
    const d = Math.hypot(pointA.x - pointB.x, pointA.y - pointB.y)
    const mm = calibUnit === 'cm' ? Number(calibDistance) * 10 : Number(calibDistance)
    if (mm > 0 && d > 0) setPixelsPerMM(d / mm)
  }

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
    }
    if (onSaveDetections && impacts.length > 0) {
      const dets: DetectedHole[] = impacts.map(p => ({
        centerX: p.x, centerY: p.y,
        radiusPixels: (pelletDiameterMM / 2) * pixelsPerMM,
        diameterMM: pelletDiameterMM, confidence: 1.0, pixelCount: 0,
      }))
      const blob = await generateAnnotatedBlob()
      onSaveDetections(payload, dets, blob)
    } else { onSave(payload) }
  }, [pointA, pointB, pixelsPerMM, calibDistance, calibUnit, impacts, pelletDiameterMM, onSave, onSaveDetections, onClose, generateAnnotatedBlob])

  const stepTitles: Record<WizardStep, string> = { 1: 'Set Aim Point', 2: 'Set Measurement Points', 3: 'Distance and marker size', 4: 'Add impacts', 5: 'Group Analysis Summary' }

  const goNext = () => {
    if (step === 1) { setStep(2); setSubMode('idle') }
    else if (step === 2) { setStep(3); setSubMode('idle') }
    else if (step === 3) { setStep(4); setSubMode('add_impact') }
    else if (step === 4) setStep(5)
  }
  const goBack = () => {
    if (step === 1) onClose()
    else if (step === 2) { setStep(1); setSubMode('set_aim') }
    else if (step === 3) { setStep(2); setSubMode('idle') }
    else if (step === 4) { setStep(3); setSubMode('idle') }
    else if (step === 5) { setStep(4); setSubMode('add_impact') }
  }

  const inputCls = 'w-full bg-gray-100 border border-gray-300 rounded px-3 py-2 text-gray-900 text-sm focus:outline-none focus:border-blue-400'

  // ── Stats Overlay ──────────────────────────────────────────────────
  const statsOverlay = (
    <div className="absolute top-2 left-2 z-10 bg-black/70 backdrop-blur-sm rounded-lg p-3 text-white text-xs font-mono space-y-0.5 pointer-events-none">
      <div className="flex gap-6"><span>Shots:</span><span className="font-semibold">{impacts.length}</span></div>
      <div className="flex gap-6"><span>Distance:</span><span className="font-semibold">{displayDistance}{distanceLabel}</span></div>
      <div className="flex gap-6"><span>Mean Radius:</span><span className="font-semibold">{meanRadiusMM !== null ? `${meanRadiusMM.toFixed(2)}mm` : ''}</span></div>
      <div className="flex gap-6"><span>Group Size:</span><span className="font-semibold">{groupSizeMOA !== null ? `${groupSizeMOA} MOA` : ''}</span></div>
      <div className="flex gap-6"><span>Elevation<br/>(moa/mrad):</span><span className="font-semibold">{elevMOA !== null ? `${elevMOA}/${elevMRAD}` : ''}</span></div>
      <div className="flex gap-6"><span>Windage<br/>(moa/mrad):</span><span className="font-semibold">{windMOA !== null ? `${windMOA}/${windMRAD}` : ''}</span></div>
    </div>
  )

  // ── Render ─────────────────────────────────────────────────────────
  if (step === 5) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-[#1a1a1a]">
        <div className="flex items-center justify-between px-4 py-3 bg-[#2a2a2a] border-b border-white/10">
          <button onClick={goBack} className="text-white p-1"><ArrowLeft size={20} /></button>
          <span className="text-white font-medium text-sm tracking-wide">Group Analysis Summary</span>
          <button onClick={onClose} className="text-white p-1"><XIcon size={20} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-6">
          <h1 className="text-white text-xl font-semibold text-center mb-6">Group Analysis Summary</h1>
          <div className="bg-[#2a2a2a] border border-white/10 rounded-xl p-5 space-y-3 mb-6">
            <h2 className="text-white font-semibold text-base mb-3">Group Analysis Results</h2>
            <div className="flex justify-between text-sm"><span className="text-gray-400">Shots:</span><span className="text-white font-semibold">{impacts.length}</span></div>
            <div className="flex justify-between text-sm"><span className="text-gray-400">Distance:</span><span className="text-white font-semibold">{displayDistance}{distanceLabel}</span></div>
            <div className="h-px bg-white/10 my-1" />
            <div className="flex justify-between text-sm"><span className="text-gray-400">Group Size:</span><span className="text-white font-bold">{groupSizeMOA !== null ? `${groupSizeMOA} MOA` : '—'}</span></div>
            <div className="flex justify-between text-sm"><span className="text-gray-400">Group Size:</span><span className="text-white font-bold">{groupSizeCM !== null ? `${groupSizeCM} cm` : '—'}</span></div>
            <div className="flex justify-between text-sm"><span className="text-gray-400">Mean Radius:</span><span className="text-white font-semibold">{meanRadiusMM !== null ? `${meanRadiusMM.toFixed(2)}mm` : '—'}</span></div>
          </div>

          <div className="bg-[#2a2a2a] border border-white/10 rounded-xl p-5 mb-6">
            <div className="border-t border-white/10 pt-4">
              <h3 className="text-white font-semibold text-center mb-4">MOA (Minute of Angle)</h3>
              <div className="grid grid-cols-2 gap-4 text-center">
                <div>
                  <p className="text-gray-400 text-xs mb-1">Elevation</p>
                  <p className="text-white text-3xl font-bold">{elevMOA ?? '—'}</p>
                  <p className="text-gray-400 text-xs">MOA</p>
                  {scopeElev && <p className={`text-sm font-semibold mt-1 ${elevationMM && elevationMM > 0 ? 'text-blue-400' : 'text-blue-400'}`}>{scopeElev}</p>}
                </div>
                <div>
                  <p className="text-gray-400 text-xs mb-1">Windage</p>
                  <p className="text-white text-3xl font-bold">{windMOA ?? '—'}</p>
                  <p className="text-gray-400 text-xs">MOA</p>
                  {scopeWind && <p className={`text-sm font-semibold mt-1 ${windageMM && windageMM > 0 ? 'text-blue-400' : 'text-blue-400'}`}>{scopeWind}</p>}
                </div>
              </div>
            </div>
            <div className="border-t border-white/10 pt-4 mt-4">
              <h3 className="text-white font-semibold text-center mb-4">MRAD (Milliradian)</h3>
              <div className="grid grid-cols-2 gap-4 text-center">
                <div>
                  <p className="text-gray-400 text-xs mb-1">Elevation</p>
                  <p className="text-white text-3xl font-bold">{elevMRAD ?? '—'}</p>
                  <p className="text-gray-400 text-xs">MRAD</p>
                  {scopeElev && <p className="text-sm font-semibold mt-1 text-blue-400">{scopeElev}</p>}
                </div>
                <div>
                  <p className="text-gray-400 text-xs mb-1">Windage</p>
                  <p className="text-white text-3xl font-bold">{windMRAD ?? '—'}</p>
                  <p className="text-gray-400 text-xs">MRAD</p>
                  {scopeWind && <p className="text-sm font-semibold mt-1 text-blue-400">{scopeWind}</p>}
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="px-4 pb-6 pt-2">
          <button onClick={handleDone} className="w-full py-3 rounded-lg bg-white text-gray-900 font-semibold text-sm tracking-wider uppercase">DONE</button>
        </div>
      </div>
    )
  }

  // ── Steps 1–4 layout ──────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#1a1a1a]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#2a2a2a] border-b border-white/10">
        <button onClick={goBack} className="text-white p-1"><ArrowLeft size={20} /></button>
        <span className="text-white font-medium text-sm tracking-wide">{stepTitles[step]}</span>
        <button onClick={onClose} className="text-white p-1"><XIcon size={20} /></button>
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
          onWheel={handleWheel}
        />
      </div>

      {/* Bottom Panel */}
      <div className="bg-white rounded-t-xl px-4 pb-4 pt-0 shadow-[0_-4px_20px_rgba(0,0,0,0.3)]">
        {/* Title bar */}
        <div className="bg-[#8B7355] text-white text-center py-2.5 text-xs font-semibold tracking-widest uppercase -mx-4 rounded-t-xl mb-3">
          {step === 1 && 'SET AIM POINT'}
          {step === 2 && 'SET MEASUREMENT POINTS'}
          {step === 3 && 'TARGET DISTANCE AND MARKER SIZE'}
          {step === 4 && 'ADD IMPACTS'}
        </div>

        {/* Step 1 controls */}
        {step === 1 && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setRotation(r => ((r + 270) % 360) as number)} className="flex items-center justify-center gap-2 py-2.5 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium">
                <RotateCcw size={16} /> ROTATE
              </button>
              <button onClick={() => setRotation(r => ((r + 90) % 360) as number)} className="flex items-center justify-center gap-2 py-2.5 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium">
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
              <button onClick={() => setSubMode('set_point_a')} className={`py-2.5 rounded-lg text-sm font-medium border ${subMode === 'set_point_a' ? 'bg-blue-500 text-white border-blue-500' : 'border-gray-300 text-gray-700'}`}>
                SET POINT A {pointA && '\u2713'}
              </button>
              <button onClick={() => setSubMode('set_point_b')} className={`py-2.5 rounded-lg text-sm font-medium border ${subMode === 'set_point_b' ? 'bg-blue-500 text-white border-blue-500' : 'border-gray-300 text-gray-700'}`}>
                SET POINT B {pointB && '\u2713'}
              </button>
            </div>
            <p className="text-gray-500 text-xs text-center">Distance between points ({calibUnit})</p>
            <div className="flex gap-2">
              <input type="number" step="0.1" min="0" value={calibDistance} onChange={e => setCalibDistance(e.target.value)} placeholder={calibUnit === 'cm' ? '5.5' : '55'} className={inputCls} />
              <div className="flex rounded-lg border border-gray-300 overflow-hidden shrink-0">
                <button onClick={() => { setCalibUnit('cm'); setPixelsPerMM(0) }} className={`px-3 py-2 text-xs font-medium ${calibUnit === 'cm' ? 'bg-blue-500 text-white' : 'text-gray-700'}`}>cm</button>
                <button onClick={() => { setCalibUnit('mm'); setPixelsPerMM(0) }} className={`px-3 py-2 text-xs font-medium ${calibUnit === 'mm' ? 'bg-blue-500 text-white' : 'text-gray-700'}`}>mm</button>
              </div>
              <button onClick={handleCalibSet} disabled={!pointA || !pointB || !calibDistance} className="px-6 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium disabled:opacity-40">SET</button>
            </div>
            <button onClick={goNext} disabled={pixelsPerMM <= 0} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-blue-500 text-white text-sm font-medium disabled:opacity-40">
              {'>'} NEXT
            </button>
          </div>
        )}

        {/* Step 3 controls */}
        {step === 3 && (
          <div className="space-y-3">
            <p className="text-gray-500 text-xs text-center">Distance to target ({distanceUnit === 'yards' ? 'yd' : 'm'})</p>
            <div className="flex gap-2">
              <input type="number" step="0.1" min="0" value={distanceToTarget} onChange={e => setDistanceToTarget(e.target.value)} className={inputCls} />
              <div className="flex rounded-lg border border-gray-300 overflow-hidden shrink-0">
                <button onClick={() => { if (distanceUnit !== 'meters') { setDistanceUnit('meters'); setDistanceToTarget(String(Math.round(yardsToMeters(Number(distanceToTarget) || 0) * 10) / 10)) } }} className={`px-3 py-2 text-xs font-medium ${distanceUnit === 'meters' ? 'bg-blue-500 text-white' : 'text-gray-700'}`}>m</button>
                <button onClick={() => { if (distanceUnit !== 'yards') { setDistanceUnit('yards'); setDistanceToTarget(String(Math.round(metersToYards(Number(distanceToTarget) || 0) * 10) / 10)) } }} className={`px-3 py-2 text-xs font-medium ${distanceUnit === 'yards' ? 'bg-blue-500 text-white' : 'text-gray-700'}`}>yd</button>
              </div>
            </div>
            <p className="text-gray-500 text-xs text-center">Impact marker size</p>
            <div className="flex gap-2">
              <select value={markerSize} onChange={e => setMarkerSize(e.target.value)} className={inputCls}>
                {Object.keys(CALIBER_MAP).map(k => <option key={k} value={k}>{k}</option>)}
              </select>
              <button className="px-6 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium">SET</button>
            </div>
            <button onClick={goNext} disabled={!distanceToTarget || Number(distanceToTarget) <= 0} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-blue-500 text-white text-sm font-medium disabled:opacity-40">
              {'>'} NEXT
            </button>
          </div>
        )}

        {/* Step 4 controls */}
        {step === 4 && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setSubMode('add_impact')} className={`py-2.5 rounded-lg text-sm font-medium ${subMode === 'add_impact' ? 'bg-green-500 text-white' : 'border border-gray-300 text-gray-700'}`}>
                ADD
              </button>
              <button onClick={() => setSubMode('remove_impact')} className={`py-2.5 rounded-lg text-sm font-medium ${subMode === 'remove_impact' ? 'bg-red-500 text-white' : 'border border-gray-300 text-gray-700'}`}>
                REMOVE
              </button>
            </div>
            <button onClick={goNext} disabled={impacts.length < 2} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-blue-500 text-white text-sm font-medium disabled:opacity-40">
              {'>'} ANALYZE
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

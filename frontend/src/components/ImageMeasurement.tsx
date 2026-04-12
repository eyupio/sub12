import { useRef, useState, useEffect, useCallback } from 'react'
import { Circle, Move, Square, RotateCcw, Save, ZoomIn, ZoomOut } from 'lucide-react'
import { TARGET_PRESETS, type TargetPreset, type TargetRing } from '../config/targetPresets'
import { mmToMOA } from '../utils/ballistics'
import type { PelletTestMeasurement, CreateMeasurementPayload } from '../api/pelletTesting'

interface Props {
  imageUrl: string
  distanceM: number
  sessionId: string
  imageId: string
  existingMeasurement?: PelletTestMeasurement
  onSave: (payload: CreateMeasurementPayload) => void
  onClose: () => void
}

type Mode = 'idle' | 'calibrate' | 'measure'
type DrawState = 'none' | 'drawing'

interface Point { x: number; y: number }

const BRASS = '#c9a84c'
const BRASS_30 = 'rgba(201,168,76,0.3)'
const GREEN = '#22c55e'
const GREEN_30 = 'rgba(34,197,94,0.3)'

const btnCls = 'flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium tracking-wider uppercase transition-colors'
const btnPrimary = `${btnCls} bg-[var(--brass)] text-inverse hover:opacity-90`
const btnSecondary = `${btnCls} border border-subtle text-secondary hover:bg-surface-hover`
const selectCls = 'rounded bg-surface border border-subtle px-2 py-1.5 text-xs text-primary focus:border-[var(--brass)]/50 focus:outline-none'

export default function ImageMeasurement({ imageUrl, distanceM, existingMeasurement, onSave, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)

  // View transform (pan + zoom)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const panStart = useRef<Point>({ x: 0, y: 0 })
  const panOffset = useRef<Point>({ x: 0, y: 0 })

  // Mode
  const [mode, setMode] = useState<Mode>(existingMeasurement ? 'idle' : 'idle')
  const [drawState, setDrawState] = useState<DrawState>('none')

  // Calibration state
  const [selectedPreset, setSelectedPreset] = useState<TargetPreset | null>(
    existingMeasurement?.target_preset
      ? TARGET_PRESETS.find(p => p.id === existingMeasurement.target_preset) ?? null
      : null
  )
  const [selectedRing, setSelectedRing] = useState<TargetRing | null>(null)
  const [refCircle, setRefCircle] = useState<{ cx: number; cy: number; r: number } | null>(
    existingMeasurement
      ? { cx: existingMeasurement.ref_center_x, cy: existingMeasurement.ref_center_y, r: existingMeasurement.ref_radius_pixels }
      : null
  )
  const [pixelsPerMM, setPixelsPerMM] = useState<number>(existingMeasurement?.pixels_per_mm ?? 0)
  const drawOrigin = useRef<Point>({ x: 0, y: 0 })
  const drawCurrent = useRef<Point>({ x: 0, y: 0 })

  // Measurement state
  const [bbox, setBbox] = useState<{ x: number; y: number; w: number; h: number } | null>(
    existingMeasurement?.bbox_x != null
      ? { x: existingMeasurement.bbox_x!, y: existingMeasurement.bbox_y!, w: existingMeasurement.bbox_width!, h: existingMeasurement.bbox_height! }
      : null
  )
  const [measuredMM, setMeasuredMM] = useState<number | null>(existingMeasurement?.measured_size_mm ?? null)
  const [measuredMOA, setMeasuredMOA] = useState<number | null>(existingMeasurement?.measured_size_moa ?? null)

  // Image loaded flag
  const [imageLoaded, setImageLoaded] = useState(false)

  // Load image
  useEffect(() => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      imgRef.current = img
      setImageLoaded(true)
    }
    img.src = imageUrl
  }, [imageUrl])

  // Canvas size
  const [canvasSize, setCanvasSize] = useState({ w: 800, h: 600 })
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

  // Convert screen coordinates to image coordinates
  const screenToImage = useCallback((sx: number, sy: number): Point => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    const cx = sx - rect.left
    const cy = sy - rect.top
    return {
      x: (cx - pan.x) / zoom,
      y: (cy - pan.y) / zoom,
    }
  }, [pan, zoom])

  // Fit image to viewport
  const fitToView = useCallback(() => {
    const img = imgRef.current
    if (!img) return
    const scaleX = canvasSize.w / img.width
    const scaleY = canvasSize.h / img.height
    const scale = Math.min(scaleX, scaleY) * 0.95
    setZoom(scale)
    setPan({
      x: (canvasSize.w - img.width * scale) / 2,
      y: (canvasSize.h - img.height * scale) / 2,
    })
  }, [canvasSize])

  useEffect(() => {
    if (imageLoaded) fitToView()
  }, [imageLoaded, fitToView])

  // ── Drawing ─────────────────────────────────────────────────────────

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    const img = imgRef.current
    if (!canvas || !ctx || !img) return

    canvas.width = canvasSize.w
    canvas.height = canvasSize.h
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Dark background
    ctx.fillStyle = '#111'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Draw image with transform
    ctx.save()
    ctx.translate(pan.x, pan.y)
    ctx.scale(zoom, zoom)
    ctx.drawImage(img, 0, 0)

    // Draw reference circle
    if (refCircle) {
      ctx.beginPath()
      ctx.arc(refCircle.cx, refCircle.cy, refCircle.r, 0, Math.PI * 2)
      ctx.strokeStyle = GREEN
      ctx.lineWidth = 2 / zoom
      ctx.stroke()
      ctx.fillStyle = GREEN_30
      ctx.fill()
    }

    // Draw in-progress circle (while drawing in calibrate mode)
    if (mode === 'calibrate' && drawState === 'drawing') {
      const dx = drawCurrent.current.x - drawOrigin.current.x
      const dy = drawCurrent.current.y - drawOrigin.current.y
      const r = Math.sqrt(dx * dx + dy * dy)
      ctx.beginPath()
      ctx.arc(drawOrigin.current.x, drawOrigin.current.y, r, 0, Math.PI * 2)
      ctx.strokeStyle = GREEN
      ctx.lineWidth = 2 / zoom
      ctx.setLineDash([4 / zoom, 4 / zoom])
      ctx.stroke()
      ctx.setLineDash([])
    }

    // Draw bounding box
    if (bbox) {
      ctx.strokeStyle = BRASS
      ctx.lineWidth = 2 / zoom
      ctx.strokeRect(bbox.x, bbox.y, bbox.w, bbox.h)
      ctx.fillStyle = BRASS_30
      ctx.fillRect(bbox.x, bbox.y, bbox.w, bbox.h)
    }

    // Draw in-progress bbox (while drawing in measure mode)
    if (mode === 'measure' && drawState === 'drawing') {
      const x = Math.min(drawOrigin.current.x, drawCurrent.current.x)
      const y = Math.min(drawOrigin.current.y, drawCurrent.current.y)
      const w = Math.abs(drawCurrent.current.x - drawOrigin.current.x)
      const h = Math.abs(drawCurrent.current.y - drawOrigin.current.y)
      ctx.strokeStyle = BRASS
      ctx.lineWidth = 2 / zoom
      ctx.setLineDash([4 / zoom, 4 / zoom])
      ctx.strokeRect(x, y, w, h)
      ctx.setLineDash([])
    }

    ctx.restore()
  }, [canvasSize, pan, zoom, refCircle, bbox, mode, drawState])

  useEffect(() => {
    if (imageLoaded) requestAnimationFrame(draw)
  }, [imageLoaded, draw])

  // ── Mouse / Touch handlers ──────────────────────────────────────────

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.setPointerCapture(e.pointerId)

    if (mode === 'idle') {
      // Pan mode
      setIsPanning(true)
      panStart.current = { x: e.clientX, y: e.clientY }
      panOffset.current = { ...pan }
      return
    }

    // Drawing mode (calibrate or measure)
    const pt = screenToImage(e.clientX, e.clientY)
    drawOrigin.current = pt
    drawCurrent.current = pt
    setDrawState('drawing')
  }, [mode, pan, screenToImage])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (isPanning) {
      setPan({
        x: panOffset.current.x + (e.clientX - panStart.current.x),
        y: panOffset.current.y + (e.clientY - panStart.current.y),
      })
      return
    }

    if (drawState === 'drawing') {
      drawCurrent.current = screenToImage(e.clientX, e.clientY)
      requestAnimationFrame(draw)
    }
  }, [isPanning, drawState, screenToImage, draw])

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    const canvas = canvasRef.current
    if (canvas) canvas.releasePointerCapture(e.pointerId)

    if (isPanning) {
      setIsPanning(false)
      return
    }

    if (drawState !== 'drawing') return
    setDrawState('none')

    if (mode === 'calibrate' && selectedRing) {
      const dx = drawCurrent.current.x - drawOrigin.current.x
      const dy = drawCurrent.current.y - drawOrigin.current.y
      const r = Math.sqrt(dx * dx + dy * dy)
      if (r < 5) return // too small, ignore

      const circle = { cx: drawOrigin.current.x, cy: drawOrigin.current.y, r }
      setRefCircle(circle)

      const ppm = (r * 2) / selectedRing.diameter_mm
      setPixelsPerMM(ppm)
      setMode('measure')
    }

    if (mode === 'measure' && pixelsPerMM > 0) {
      const x = Math.min(drawOrigin.current.x, drawCurrent.current.x)
      const y = Math.min(drawOrigin.current.y, drawCurrent.current.y)
      const w = Math.abs(drawCurrent.current.x - drawOrigin.current.x)
      const h = Math.abs(drawCurrent.current.y - drawOrigin.current.y)
      if (w < 3 && h < 3) return // too small

      const newBbox = { x, y, w, h }
      setBbox(newBbox)

      // Compute group size from diagonal
      const diag = Math.sqrt(w * w + h * h)
      const mm = diag / pixelsPerMM
      const moa = mmToMOA(mm, distanceM)
      setMeasuredMM(mm)
      setMeasuredMOA(moa)
      setMode('idle')
    }
  }, [isPanning, drawState, mode, selectedRing, pixelsPerMM, distanceM, draw])

  // Wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const factor = e.deltaY < 0 ? 1.1 : 0.9
    const newZoom = Math.min(Math.max(zoom * factor, 0.1), 10)

    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const cx = e.clientX - rect.left
    const cy = e.clientY - rect.top

    setPan(prev => ({
      x: cx - (cx - prev.x) * (newZoom / zoom),
      y: cy - (cy - prev.y) * (newZoom / zoom),
    }))
    setZoom(newZoom)
  }, [zoom])

  // ── Actions ─────────────────────────────────────────────────────────

  const handleReset = () => {
    setRefCircle(null)
    setBbox(null)
    setPixelsPerMM(0)
    setMeasuredMM(null)
    setMeasuredMOA(null)
    setMode('idle')
    setDrawState('none')
  }

  const handleSave = () => {
    if (!refCircle || pixelsPerMM <= 0) return

    const payload: CreateMeasurementPayload = {
      calibration_type: 'target_ring',
      target_preset: selectedPreset?.id,
      reference_ring_name: selectedRing?.name,
      reference_diameter_mm: selectedRing?.diameter_mm ?? 0,
      reference_pixels: refCircle.r * 2,
      pixels_per_mm: pixelsPerMM,
      ref_center_x: refCircle.cx,
      ref_center_y: refCircle.cy,
      ref_radius_pixels: refCircle.r,
      bbox_x: bbox?.x,
      bbox_y: bbox?.y,
      bbox_width: bbox?.w,
      bbox_height: bbox?.h,
    }
    onSave(payload)
  }

  const startCalibrate = () => {
    if (!selectedPreset || !selectedRing) return
    setMode('calibrate')
  }

  const startMeasure = () => {
    if (pixelsPerMM <= 0) return
    setMode('measure')
  }

  const canSave = refCircle !== null && pixelsPerMM > 0

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-page">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-subtle p-2 bg-surface">
        {/* Target preset selector */}
        <select
          className={selectCls}
          value={selectedPreset?.id ?? ''}
          onChange={e => {
            const preset = TARGET_PRESETS.find(p => p.id === e.target.value)
            setSelectedPreset(preset ?? null)
            setSelectedRing(null)
          }}
        >
          <option value="">Select target…</option>
          {TARGET_PRESETS.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>

        {/* Ring selector */}
        {selectedPreset && (
          <select
            className={selectCls}
            value={selectedRing?.name ?? ''}
            onChange={e => {
              const ring = selectedPreset.rings.find(r => r.name === e.target.value)
              setSelectedRing(ring ?? null)
            }}
          >
            <option value="">Select ring…</option>
            {selectedPreset.rings.map(ring => (
              <option key={ring.name} value={ring.name}>
                {ring.name} — {ring.diameter_mm}mm
              </option>
            ))}
          </select>
        )}

        <div className="h-5 w-px bg-subtle" />

        {/* Mode buttons */}
        <button
          className={mode === 'calibrate' ? btnPrimary : btnSecondary}
          onClick={startCalibrate}
          disabled={!selectedPreset || !selectedRing}
          title="Draw circle on reference ring"
        >
          <Circle size={14} /> Calibrate
        </button>
        <button
          className={mode === 'measure' ? btnPrimary : btnSecondary}
          onClick={startMeasure}
          disabled={pixelsPerMM <= 0}
          title="Draw bounding box around group"
        >
          <Square size={14} /> Measure
        </button>
        <button className={btnSecondary} onClick={() => setMode('idle')} title="Pan mode">
          <Move size={14} /> Pan
        </button>

        <div className="h-5 w-px bg-subtle" />

        {/* Zoom controls */}
        <button className={btnSecondary} onClick={() => setZoom(z => Math.min(z * 1.25, 10))} title="Zoom in">
          <ZoomIn size={14} />
        </button>
        <button className={btnSecondary} onClick={() => setZoom(z => Math.max(z * 0.8, 0.1))} title="Zoom out">
          <ZoomOut size={14} />
        </button>
        <button className={btnSecondary} onClick={fitToView} title="Fit to view">
          Fit
        </button>

        <div className="h-5 w-px bg-subtle" />

        <button className={btnSecondary} onClick={handleReset}>
          <RotateCcw size={14} /> Reset
        </button>

        <div className="flex-1" />

        {/* Save / Close */}
        {canSave && (
          <button className={btnPrimary} onClick={handleSave}>
            <Save size={14} /> Save
          </button>
        )}
        <button className={btnSecondary} onClick={onClose}>
          Close
        </button>
      </div>

      {/* Status bar */}
      <div className="flex flex-wrap items-center gap-4 border-b border-subtle px-3 py-1.5 bg-surface text-xs text-muted">
        {mode === 'calibrate' && (
          <span className="text-[var(--success-text)]">
            Click center of the <strong>{selectedRing?.name}</strong> and drag to its edge
          </span>
        )}
        {mode === 'measure' && (
          <span className="text-[var(--brass)]">
            Draw a rectangle around the shot group
          </span>
        )}
        {mode === 'idle' && !refCircle && (
          <span>Select a target preset and ring, then click Calibrate</span>
        )}
        {mode === 'idle' && refCircle && !bbox && (
          <span>Calibrated — click Measure to draw bounding box</span>
        )}

        {pixelsPerMM > 0 && (
          <span>Scale: <strong className="font-mono">{pixelsPerMM.toFixed(2)}</strong> px/mm</span>
        )}
        {measuredMM !== null && (
          <>
            <span>
              Group: <strong className="font-mono text-[var(--brass)]">{measuredMM.toFixed(2)} mm</strong>
            </span>
            <span>
              <strong className="font-mono text-[var(--brass)]">{measuredMOA?.toFixed(3)} MOA</strong>
            </span>
          </>
        )}

        <span className="ml-auto font-mono">{Math.round(zoom * 100)}%</span>
      </div>

      {/* Canvas */}
      <div ref={containerRef} className="flex-1 overflow-hidden touch-none">
        <canvas
          ref={canvasRef}
          className="block cursor-crosshair"
          style={{ width: canvasSize.w, height: canvasSize.h, touchAction: 'none' }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onWheel={handleWheel}
        />
      </div>
    </div>
  )
}

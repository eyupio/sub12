import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Crop, RotateCcw, RotateCw, X as XIcon } from 'lucide-react'
import { ChipSelector } from './ChipSelector'
import { toast } from '../store/toast'

interface Props {
  file: File
  onSave: (file: File) => void
  onCancel: () => void
  // 'free' (default) lets the user drag any rectangle. A number locks
  // the crop rectangle to that width/height ratio (e.g. 1 for square avatars).
  aspect?: number | 'free'
  title?: string
  // JPEG quality used when re-encoding (0..1). Default 0.92 to mirror
  // typical phone camera output without ballooning file size.
  quality?: number
}

type AspectKey = 'free' | '1:1' | '4:3' | '16:9' | '3:2'

const ASPECTS: { key: AspectKey; ratio: number | null }[] = [
  { key: 'free', ratio: null },
  { key: '1:1', ratio: 1 },
  { key: '4:3', ratio: 4 / 3 },
  { key: '3:2', ratio: 3 / 2 },
  { key: '16:9', ratio: 16 / 9 },
]

const HANDLE_SIZE = 12

type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'move' | null

interface Rect { x: number; y: number; w: number; h: number }

// Read EXIF Orientation tag (1..8) from a JPEG File. Returns 1 (no rotation)
// for non-JPEGs or when the tag isn't present.
async function readExifOrientation(file: File): Promise<number> {
  if (!file.type.includes('jpeg') && !file.type.includes('jpg')) return 1
  try {
    const buf = await file.slice(0, 128 * 1024).arrayBuffer()
    const view = new DataView(buf)
    if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return 1
    let offset = 2
    while (offset < view.byteLength) {
      const marker = view.getUint16(offset)
      offset += 2
      if (marker === 0xffe1) {
        const size = view.getUint16(offset)
        if (view.getUint32(offset + 2) !== 0x45786966) return 1
        const tiff = offset + 8
        const little = view.getUint16(tiff) === 0x4949
        const get16 = (o: number) => view.getUint16(o, little)
        const get32 = (o: number) => view.getUint32(o, little)
        if (get16(tiff + 2) !== 0x2a) return 1
        const ifd0 = tiff + get32(tiff + 4)
        const count = get16(ifd0)
        for (let i = 0; i < count; i++) {
          const entry = ifd0 + 2 + i * 12
          if (get16(entry) === 0x0112) {
            return get16(entry + 8)
          }
        }
        offset += size
        continue
      }
      if ((marker & 0xff00) !== 0xff00) break
      offset += view.getUint16(offset)
    }
  } catch {
    // ignore – fall through
  }
  return 1
}

function exifToBase(orientation: number): { rotation: number; flipH: boolean } {
  switch (orientation) {
    case 3: return { rotation: 180, flipH: false }
    case 6: return { rotation: 90, flipH: false }
    case 8: return { rotation: 270, flipH: false }
    case 2: return { rotation: 0, flipH: true }
    case 4: return { rotation: 180, flipH: true }
    case 5: return { rotation: 90, flipH: true }
    case 7: return { rotation: 270, flipH: true }
    default: return { rotation: 0, flipH: false }
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('decode'))
    img.src = url
  })
}

function clampRect(r: Rect, maxW: number, maxH: number, minSize = 16): Rect {
  const w = Math.max(minSize, Math.min(r.w, maxW))
  const h = Math.max(minSize, Math.min(r.h, maxH))
  const x = Math.max(0, Math.min(r.x, maxW - w))
  const y = Math.max(0, Math.min(r.y, maxH - h))
  return { x, y, w, h }
}

function applyAspect(r: Rect, ratio: number, anchor: 'center' | Handle, maxW: number, maxH: number): Rect {
  // Try preserving width first; clamp height by ratio.
  let w = r.w
  let h = w / ratio
  if (h > maxH) {
    h = maxH
    w = h * ratio
  }
  if (w > maxW) {
    w = maxW
    h = w / ratio
  }
  let x = r.x
  let y = r.y
  if (anchor === 'center' || anchor === null || anchor === 'move') {
    const cx = r.x + r.w / 2
    const cy = r.y + r.h / 2
    x = cx - w / 2
    y = cy - h / 2
  }
  return clampRect({ x, y, w, h }, maxW, maxH)
}

export function ImageEditor({ file, onSave, onCancel, aspect = 'free', title = 'Edit photo', quality = 0.92 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)

  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [exifRotation, setExifRotation] = useState(0)
  const [exifFlipH, setExifFlipH] = useState(false)
  const [rotation, setRotation] = useState(0)
  const [crop, setCrop] = useState<Rect | null>(null)
  const [stageSize, setStageSize] = useState({ w: 0, h: 0 })
  const [aspectKey, setAspectKey] = useState<AspectKey>(typeof aspect === 'number' ? '1:1' : 'free')
  const [busy, setBusy] = useState(false)

  // Locked aspect (number) means user can't change the ratio.
  const lockedRatio = typeof aspect === 'number' ? aspect : null
  const activeRatio = lockedRatio ?? ASPECTS.find(a => a.key === aspectKey)?.ratio ?? null

  // Load file → object URL → Image, plus EXIF orientation.
  useEffect(() => {
    let cancelled = false
    setImage(null)
    const url = URL.createObjectURL(file)
    setImageUrl(url)
    ;(async () => {
      try {
        const orientation = await readExifOrientation(file)
        if (cancelled) return
        const { rotation: baseRot, flipH } = exifToBase(orientation)
        setExifRotation(baseRot)
        setExifFlipH(flipH)
        const img = await loadImage(url)
        if (cancelled) return
        setImage(img)
      } catch {
        if (!cancelled) toast('Could not read image — please pick a different one.', 'error')
      }
    })()
    return () => {
      cancelled = true
      URL.revokeObjectURL(url)
    }
  }, [file])

  // Track stage size for canvas sizing.
  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect()
      setStageSize({ w: Math.floor(rect.width), h: Math.floor(rect.height) })
    })
    ro.observe(el)
    const rect = el.getBoundingClientRect()
    setStageSize({ w: Math.floor(rect.width), h: Math.floor(rect.height) })
    return () => ro.disconnect()
  }, [])

  // Compute the displayed image dimensions on the canvas given the current
  // rotation. We always fit-contain so the whole image is visible while editing.
  const displayMetrics = useMemo(() => {
    if (!image || stageSize.w === 0 || stageSize.h === 0) {
      return { drawW: 0, drawH: 0, offsetX: 0, offsetY: 0, sourceW: 0, sourceH: 0, totalRot: 0 }
    }
    const totalRot = (exifRotation + rotation + 360) % 360
    const swapped = totalRot === 90 || totalRot === 270
    const sourceW = swapped ? image.naturalHeight : image.naturalWidth
    const sourceH = swapped ? image.naturalWidth : image.naturalHeight
    const scale = Math.min(stageSize.w / sourceW, stageSize.h / sourceH)
    const drawW = sourceW * scale
    const drawH = sourceH * scale
    const offsetX = (stageSize.w - drawW) / 2
    const offsetY = (stageSize.h - drawH) / 2
    return { drawW, drawH, offsetX, offsetY, sourceW, sourceH, totalRot }
  }, [image, exifRotation, rotation, stageSize])

  // Reset / recompute the crop rect when image, rotation, or ratio changes.
  useEffect(() => {
    if (displayMetrics.drawW === 0) return
    const { drawW, drawH, offsetX, offsetY } = displayMetrics
    if (activeRatio == null) {
      setCrop({ x: offsetX, y: offsetY, w: drawW, h: drawH })
    } else {
      let w = drawW
      let h = w / activeRatio
      if (h > drawH) {
        h = drawH
        w = h * activeRatio
      }
      const x = offsetX + (drawW - w) / 2
      const y = offsetY + (drawH - h) / 2
      setCrop({ x, y, w, h })
    }
    // re-derive when ratio or image footprint changes
  }, [displayMetrics, activeRatio])

  // Draw the canvas on every frame-relevant change.
  useEffect(() => {
    const canvas = canvasRef.current
    const img = image
    if (!canvas || !img || stageSize.w === 0) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.floor(stageSize.w * dpr)
    canvas.height = Math.floor(stageSize.h * dpr)
    canvas.style.width = `${stageSize.w}px`
    canvas.style.height = `${stageSize.h}px`
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, stageSize.w, stageSize.h)

    // Checker-ish dim background
    ctx.fillStyle = '#0b0b0b'
    ctx.fillRect(0, 0, stageSize.w, stageSize.h)

    const { drawW, drawH, offsetX, offsetY, totalRot } = displayMetrics
    ctx.save()
    ctx.translate(offsetX + drawW / 2, offsetY + drawH / 2)
    ctx.rotate((totalRot * Math.PI) / 180)
    if (exifFlipH) ctx.scale(-1, 1)
    // After rotation, the on-canvas footprint is drawW × drawH but the
    // *unrotated* image still has its own aspect; for 90/270 we draw with
    // swapped dimensions.
    const swapped = totalRot === 90 || totalRot === 270
    const renderedW = swapped ? drawH : drawW
    const renderedH = swapped ? drawW : drawH
    ctx.drawImage(img, -renderedW / 2, -renderedH / 2, renderedW, renderedH)
    ctx.restore()

    if (!crop) return
    // Dim outside crop
    ctx.fillStyle = 'rgba(0,0,0,0.55)'
    ctx.beginPath()
    ctx.rect(0, 0, stageSize.w, stageSize.h)
    ctx.rect(crop.x + crop.w, crop.y, -crop.w, crop.h)
    ctx.fill('evenodd')

    // Crop border + thirds guides
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 1
    ctx.strokeRect(crop.x + 0.5, crop.y + 0.5, crop.w, crop.h)
    ctx.strokeStyle = 'rgba(255,255,255,0.4)'
    for (let i = 1; i < 3; i++) {
      ctx.beginPath()
      ctx.moveTo(crop.x + (crop.w * i) / 3, crop.y)
      ctx.lineTo(crop.x + (crop.w * i) / 3, crop.y + crop.h)
      ctx.moveTo(crop.x, crop.y + (crop.h * i) / 3)
      ctx.lineTo(crop.x + crop.w, crop.y + (crop.h * i) / 3)
      ctx.stroke()
    }
    // Handles
    ctx.fillStyle = '#fff'
    const handles: [number, number][] = [
      [crop.x, crop.y],
      [crop.x + crop.w / 2, crop.y],
      [crop.x + crop.w, crop.y],
      [crop.x + crop.w, crop.y + crop.h / 2],
      [crop.x + crop.w, crop.y + crop.h],
      [crop.x + crop.w / 2, crop.y + crop.h],
      [crop.x, crop.y + crop.h],
      [crop.x, crop.y + crop.h / 2],
    ]
    for (const [hx, hy] of handles) {
      ctx.fillRect(hx - HANDLE_SIZE / 2, hy - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE)
    }
  }, [image, stageSize, displayMetrics, crop, exifFlipH])

  // Hit-test which handle (if any) the pointer is over.
  function hitTest(px: number, py: number): Handle {
    if (!crop) return null
    const near = (a: number, b: number) => Math.abs(a - b) < HANDLE_SIZE
    const onLeft = near(px, crop.x)
    const onRight = near(px, crop.x + crop.w)
    const onTop = near(py, crop.y)
    const onBottom = near(py, crop.y + crop.h)
    const inX = px >= crop.x - HANDLE_SIZE && px <= crop.x + crop.w + HANDLE_SIZE
    const inY = py >= crop.y - HANDLE_SIZE && py <= crop.y + crop.h + HANDLE_SIZE
    if (onLeft && onTop) return 'nw'
    if (onRight && onTop) return 'ne'
    if (onLeft && onBottom) return 'sw'
    if (onRight && onBottom) return 'se'
    if (onTop && inX) return 'n'
    if (onBottom && inX) return 's'
    if (onLeft && inY) return 'w'
    if (onRight && inY) return 'e'
    if (px > crop.x && px < crop.x + crop.w && py > crop.y && py < crop.y + crop.h) return 'move'
    return null
  }

  const dragRef = useRef<{ handle: Handle; start: { x: number; y: number }; orig: Rect } | null>(null)

  function pointerCoords(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = canvasRef.current
    if (!c) return { x: 0, y: 0 }
    const r = c.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!crop) return
    const { x, y } = pointerCoords(e)
    const handle = hitTest(x, y)
    if (!handle) return
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { handle, start: { x, y }, orig: crop }
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const drag = dragRef.current
    const c = canvasRef.current
    if (!c) return
    if (!drag) {
      const { x, y } = pointerCoords(e)
      const handle = crop ? hitTest(x, y) : null
      const cursor =
        handle === 'move' ? 'move'
        : handle === 'n' || handle === 's' ? 'ns-resize'
        : handle === 'e' || handle === 'w' ? 'ew-resize'
        : handle === 'ne' || handle === 'sw' ? 'nesw-resize'
        : handle === 'nw' || handle === 'se' ? 'nwse-resize'
        : 'default'
      c.style.cursor = cursor
      return
    }
    const { x, y } = pointerCoords(e)
    const dx = x - drag.start.x
    const dy = y - drag.start.y
    let next = { ...drag.orig }
    switch (drag.handle) {
      case 'move':
        next.x = drag.orig.x + dx
        next.y = drag.orig.y + dy
        break
      case 'n':
        next.y = drag.orig.y + dy
        next.h = drag.orig.h - dy
        break
      case 's':
        next.h = drag.orig.h + dy
        break
      case 'w':
        next.x = drag.orig.x + dx
        next.w = drag.orig.w - dx
        break
      case 'e':
        next.w = drag.orig.w + dx
        break
      case 'nw':
        next.x = drag.orig.x + dx
        next.y = drag.orig.y + dy
        next.w = drag.orig.w - dx
        next.h = drag.orig.h - dy
        break
      case 'ne':
        next.y = drag.orig.y + dy
        next.w = drag.orig.w + dx
        next.h = drag.orig.h - dy
        break
      case 'sw':
        next.x = drag.orig.x + dx
        next.w = drag.orig.w - dx
        next.h = drag.orig.h + dy
        break
      case 'se':
        next.w = drag.orig.w + dx
        next.h = drag.orig.h + dy
        break
      default:
        return
    }
    // Negative width/height → swap to keep rect well-formed.
    if (next.w < 0) { next.x += next.w; next.w = -next.w }
    if (next.h < 0) { next.y += next.h; next.h = -next.h }

    const { drawW, drawH, offsetX, offsetY } = displayMetrics
    const maxX = offsetX
    const maxY = offsetY
    const maxRight = offsetX + drawW
    const maxBottom = offsetY + drawH

    // Clamp to image bounds (the image footprint, not the whole canvas).
    if (next.x < maxX) { next.w -= (maxX - next.x); next.x = maxX }
    if (next.y < maxY) { next.h -= (maxY - next.y); next.y = maxY }
    if (next.x + next.w > maxRight) next.w = maxRight - next.x
    if (next.y + next.h > maxBottom) next.h = maxBottom - next.y
    next.w = Math.max(16, next.w)
    next.h = Math.max(16, next.h)

    if (activeRatio != null && drag.handle !== 'move') {
      next = applyAspect(next, activeRatio, drag.handle, drawW, drawH)
      // Re-clamp after aspect enforcement
      if (next.x < maxX) next.x = maxX
      if (next.y < maxY) next.y = maxY
      if (next.x + next.w > maxRight) next.x = maxRight - next.w
      if (next.y + next.h > maxBottom) next.y = maxBottom - next.h
    }

    setCrop(next)
  }

  function onPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    dragRef.current = null
  }

  function rotateBy(delta: number) {
    setRotation(r => (r + delta + 360) % 360)
  }

  function reset() {
    setRotation(0)
    setAspectKey(lockedRatio != null ? '1:1' : 'free')
  }

  async function apply() {
    const img = image
    if (!img || !crop) return
    setBusy(true)
    try {
      const { drawW, drawH, offsetX, offsetY, totalRot } = displayMetrics
      const sx = (crop.x - offsetX) / drawW
      const sy = (crop.y - offsetY) / drawH
      const sw = crop.w / drawW
      const sh = crop.h / drawH

      const swapped = totalRot === 90 || totalRot === 270
      const rotatedSourceW = swapped ? img.naturalHeight : img.naturalWidth
      const rotatedSourceH = swapped ? img.naturalWidth : img.naturalHeight

      // Output dimensions in real pixels.
      const outW = Math.max(1, Math.round(rotatedSourceW * sw))
      const outH = Math.max(1, Math.round(rotatedSourceH * sh))

      const out = document.createElement('canvas')
      out.width = outW
      out.height = outH
      const ctx = out.getContext('2d')
      if (!ctx) throw new Error('canvas')
      // Render the rotated image into a "rotated source" canvas at full
      // resolution, then crop. Simpler than computing the inverse transform.
      const rotated = document.createElement('canvas')
      rotated.width = rotatedSourceW
      rotated.height = rotatedSourceH
      const rctx = rotated.getContext('2d')
      if (!rctx) throw new Error('canvas')
      rctx.translate(rotatedSourceW / 2, rotatedSourceH / 2)
      rctx.rotate((totalRot * Math.PI) / 180)
      if (exifFlipH) rctx.scale(-1, 1)
      rctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2)

      ctx.drawImage(
        rotated,
        sx * rotatedSourceW, sy * rotatedSourceH, sw * rotatedSourceW, sh * rotatedSourceH,
        0, 0, outW, outH,
      )

      const blob: Blob | null = await new Promise(resolve => out.toBlob(resolve, 'image/jpeg', quality))
      if (!blob) throw new Error('encode')
      const baseName = (file.name || 'photo').replace(/\.[^.]+$/, '')
      const edited = new File([blob], `${baseName}.jpg`, { type: 'image/jpeg', lastModified: Date.now() })
      onSave(edited)
    } catch {
      toast('Could not save edit — please try again.', 'error')
    } finally {
      setBusy(false)
    }
  }

  // Esc closes
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  const aspectChips = lockedRatio != null
    ? null
    : (
      <ChipSelector<AspectKey>
        ariaLabel="Crop aspect ratio"
        value={aspectKey}
        allowClear={false}
        onChange={v => v && setAspectKey(v)}
        options={ASPECTS.map(a => ({ value: a.key, label: a.key === 'free' ? 'Free' : a.key }))}
      />
    )

  return (
    <div className="fixed inset-0 z-[120] flex flex-col bg-black/90 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={title}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <button type="button" onClick={onCancel} aria-label="Cancel" className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition">
          <XIcon size={18} />
        </button>
        <h2 className="text-sm font-semibold tracking-widest uppercase flex items-center gap-2">
          <Crop size={14} /> {title}
        </h2>
        <button
          type="button"
          onClick={apply}
          disabled={busy || !imageUrl || !crop}
          aria-label="Apply"
          className="px-3 h-9 rounded-full bg-[var(--brass)] text-inverse text-xs font-semibold tracking-widest uppercase flex items-center gap-1.5 disabled:opacity-50"
        >
          <Check size={16} /> Apply
        </button>
      </div>

      {/* Canvas stage */}
      <div ref={stageRef} className="flex-1 min-h-0 relative">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 touch-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
      </div>

      {/* Bottom controls */}
      <div className="bg-surface px-4 py-3 space-y-3">
        <div className="grid grid-cols-3 gap-2">
          <button type="button" onClick={() => rotateBy(-90)} className="flex items-center justify-center gap-1.5 py-2 rounded-lg border border-subtle text-secondary text-xs font-medium tracking-widest uppercase">
            <RotateCcw size={14} /> Rotate
          </button>
          <button type="button" onClick={reset} className="py-2 rounded-lg border border-subtle text-muted text-xs font-medium tracking-widest uppercase">
            Reset
          </button>
          <button type="button" onClick={() => rotateBy(90)} className="flex items-center justify-center gap-1.5 py-2 rounded-lg border border-subtle text-secondary text-xs font-medium tracking-widest uppercase">
            <RotateCw size={14} /> Rotate
          </button>
        </div>
        {aspectChips && (
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] tracking-widest uppercase text-muted">Aspect</span>
            {aspectChips}
          </div>
        )}
      </div>
    </div>
  )
}

export default ImageEditor

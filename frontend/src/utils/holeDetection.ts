/**
 * Client-side pellet hole detection using Canvas ImageData.
 *
 * Algorithm:
 * 1. Convert image region to grayscale
 * 2. Apply adaptive threshold to isolate dark spots (holes)
 * 3. Connected-component labeling to find blobs
 * 4. Filter blobs by expected pellet size (using pixelsPerMM)
 * 5. Compute centroid, radius, and circularity for each blob
 * 6. Score confidence based on size match, circularity, and contrast
 */

export interface DetectedHole {
  centerX: number
  centerY: number
  radiusPixels: number
  diameterMM: number
  confidence: number
  pixelCount: number
}

export interface DetectionOptions {
  /** Scale factor from calibration (pixels per mm) */
  pixelsPerMM: number
  /** Expected pellet diameter in mm (default: 4.5 for .177) */
  pelletDiameterMM?: number
  /** Threshold sensitivity 0-1 (default: 0.4, lower = more sensitive) */
  sensitivity?: number
  /** Minimum confidence to include (default: 0.3) */
  minConfidence?: number
  /** Maximum number of holes to return (default: 20) */
  maxHoles?: number
}

/**
 * Detect pellet holes in a target image.
 *
 * @param imageData - Canvas ImageData containing the target image
 * @param options - Detection parameters
 * @returns Array of detected holes sorted by confidence (descending)
 */
export function detectHoles(imageData: ImageData, options: DetectionOptions): DetectedHole[] {
  const {
    pixelsPerMM,
    pelletDiameterMM = 4.5,
    sensitivity = 0.4,
    minConfidence = 0.3,
    maxHoles = 20,
  } = options

  if (pixelsPerMM <= 0) return []

  const { width, height, data } = imageData

  // Expected hole radius in pixels
  const expectedRadiusPx = (pelletDiameterMM / 2) * pixelsPerMM
  const minRadiusPx = expectedRadiusPx * 0.4
  const maxRadiusPx = expectedRadiusPx * 2.5

  // 1. Convert to grayscale
  const gray = new Uint8Array(width * height)
  for (let i = 0; i < width * height; i++) {
    const r = data[i * 4]
    const g = data[i * 4 + 1]
    const b = data[i * 4 + 2]
    gray[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b)
  }

  // 2. Compute local mean for adaptive thresholding (block-based)
  const blockSize = Math.max(3, Math.round(expectedRadiusPx * 4) | 1) // must be odd
  const threshold = computeAdaptiveThreshold(gray, width, height, blockSize, sensitivity)

  // 3. Binary image: true = dark (potential hole)
  const binary = new Uint8Array(width * height)
  for (let i = 0; i < width * height; i++) {
    binary[i] = gray[i] < threshold[i] ? 1 : 0
  }

  // 4. Connected component labeling
  const labels = connectedComponents(binary, width, height)
  const maxLabel = labels.reduce((m, v) => Math.max(m, v), 0)

  // 5. Compute blob properties
  const blobs: Map<number, { sumX: number; sumY: number; count: number; minX: number; maxX: number; minY: number; maxY: number; sumGray: number }> = new Map()

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const label = labels[y * width + x]
      if (label === 0) continue

      let blob = blobs.get(label)
      if (!blob) {
        blob = { sumX: 0, sumY: 0, count: 0, minX: x, maxX: x, minY: y, maxY: y, sumGray: 0 }
        blobs.set(label, blob)
      }
      blob.sumX += x
      blob.sumY += y
      blob.count++
      blob.minX = Math.min(blob.minX, x)
      blob.maxX = Math.max(blob.maxX, x)
      blob.minY = Math.min(blob.minY, y)
      blob.maxY = Math.max(blob.maxY, y)
      blob.sumGray += gray[y * width + x]
    }
  }

  // 6. Filter and score blobs
  const holes: DetectedHole[] = []
  const minArea = Math.PI * minRadiusPx * minRadiusPx * 0.3
  const maxArea = Math.PI * maxRadiusPx * maxRadiusPx * 2.0

  for (const [, blob] of blobs) {
    if (blob.count < minArea || blob.count > maxArea) continue

    const cx = blob.sumX / blob.count
    const cy = blob.sumY / blob.count

    // Compute equivalent radius from area
    const radiusPx = Math.sqrt(blob.count / Math.PI)

    // Filter by expected size
    if (radiusPx < minRadiusPx || radiusPx > maxRadiusPx) continue

    // Compute circularity: 4π·area / perimeter²
    // Approximate using bounding box aspect ratio
    const bboxW = blob.maxX - blob.minX + 1
    const bboxH = blob.maxY - blob.minY + 1
    const aspectRatio = Math.min(bboxW, bboxH) / Math.max(bboxW, bboxH)
    const fillRatio = blob.count / (bboxW * bboxH)
    const circularity = Math.min(1, fillRatio / (Math.PI / 4)) // ideal circle fill = π/4

    // Size match score (how close to expected size)
    const sizeRatio = radiusPx / expectedRadiusPx
    const sizeScore = 1 - Math.min(1, Math.abs(1 - sizeRatio))

    // Contrast score (darker holes = higher confidence)
    const avgGray = blob.sumGray / blob.count
    const contrastScore = Math.min(1, Math.max(0, (180 - avgGray) / 180))

    // Combined confidence
    const confidence = circularity * 0.35 + sizeScore * 0.35 + aspectRatio * 0.15 + contrastScore * 0.15

    if (confidence < minConfidence) continue

    const diameterMM = (radiusPx * 2) / pixelsPerMM

    holes.push({
      centerX: Math.round(cx * 100) / 100,
      centerY: Math.round(cy * 100) / 100,
      radiusPixels: Math.round(radiusPx * 100) / 100,
      diameterMM: Math.round(diameterMM * 1000) / 1000,
      confidence: Math.round(confidence * 10000) / 10000,
      pixelCount: blob.count,
    })
  }

  // Sort by confidence descending, limit results
  holes.sort((a, b) => b.confidence - a.confidence)
  return holes.slice(0, maxHoles)
}

/**
 * Compute group size (CTC) from detected holes.
 * Group size = max distance between any two hole centers + pellet diameter.
 */
export function computeGroupSize(
  holes: DetectedHole[],
  pixelsPerMM: number,
  pelletDiameterMM = 4.5,
): { groupSizeMM: number; groupSizePx: number } | null {
  if (holes.length < 2 || pixelsPerMM <= 0) return null

  let maxDist = 0
  for (let i = 0; i < holes.length; i++) {
    for (let j = i + 1; j < holes.length; j++) {
      const dx = holes[i].centerX - holes[j].centerX
      const dy = holes[i].centerY - holes[j].centerY
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist > maxDist) maxDist = dist
    }
  }

  const groupSizePx = maxDist
  const groupSizeMM = maxDist / pixelsPerMM + pelletDiameterMM

  return {
    groupSizeMM: Math.round(groupSizeMM * 1000) / 1000,
    groupSizePx: Math.round(groupSizePx * 100) / 100,
  }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function computeAdaptiveThreshold(
  gray: Uint8Array,
  width: number,
  height: number,
  blockSize: number,
  sensitivity: number,
): Uint8Array {
  const threshold = new Uint8Array(width * height)
  const half = Math.floor(blockSize / 2)

  // Use integral image for fast local mean computation
  const integral = new Float64Array((width + 1) * (height + 1))
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      integral[(y + 1) * (width + 1) + (x + 1)] =
        gray[y * width + x] +
        integral[y * (width + 1) + (x + 1)] +
        integral[(y + 1) * (width + 1) + x] -
        integral[y * (width + 1) + x]
    }
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const y1 = Math.max(0, y - half)
      const y2 = Math.min(height - 1, y + half)
      const x1 = Math.max(0, x - half)
      const x2 = Math.min(width - 1, x + half)

      const area = (x2 - x1 + 1) * (y2 - y1 + 1)
      const sum =
        integral[(y2 + 1) * (width + 1) + (x2 + 1)] -
        integral[y1 * (width + 1) + (x2 + 1)] -
        integral[(y2 + 1) * (width + 1) + x1] +
        integral[y1 * (width + 1) + x1]

      const localMean = sum / area
      // Threshold = local mean * sensitivity factor
      // Lower sensitivity → lower threshold → more aggressive detection
      threshold[y * width + x] = Math.round(localMean * (1 - sensitivity * 0.5))
    }
  }

  return threshold
}

function connectedComponents(binary: Uint8Array, width: number, height: number): Int32Array {
  const labels = new Int32Array(width * height)
  let nextLabel = 1

  // Two-pass algorithm with union-find
  const parent: number[] = [0]

  function find(x: number): number {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]] // path compression
      x = parent[x]
    }
    return x
  }

  function union(a: number, b: number) {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) {
      parent[Math.max(ra, rb)] = Math.min(ra, rb)
    }
  }

  // First pass
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x
      if (binary[idx] === 0) continue

      const left = x > 0 ? labels[idx - 1] : 0
      const above = y > 0 ? labels[idx - width] : 0

      if (left === 0 && above === 0) {
        labels[idx] = nextLabel
        parent.push(nextLabel)
        nextLabel++
      } else if (left > 0 && above === 0) {
        labels[idx] = left
      } else if (left === 0 && above > 0) {
        labels[idx] = above
      } else {
        labels[idx] = Math.min(left, above)
        if (left !== above) {
          union(left, above)
        }
      }
    }
  }

  // Second pass: resolve labels
  for (let i = 0; i < labels.length; i++) {
    if (labels[i] > 0) {
      labels[i] = find(labels[i])
    }
  }

  return labels
}

import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Camera, Crosshair, Loader2, Pencil, Upload, X } from 'lucide-react'
import { pelletTestApi, type PelletTestImage, type PelletTestMeasurement } from '../../api/pelletTesting'
import { toast } from '../../store/toast'
import { ImageEditor } from '../ImageEditor'

interface Props {
  sessionId: string | null
  images: PelletTestImage[]
  measurementsByImage: Map<string, PelletTestMeasurement>
  onMeasure: (image: PelletTestImage) => void
  onRequireDraft: () => Promise<string | null>
}

export function PhotosStep({
  sessionId,
  images,
  measurementsByImage,
  onMeasure,
  onRequireDraft,
}: Props) {
  const qc = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const [editingFile, setEditingFile] = useState<File | null>(null)
  const [replacing, setReplacing] = useState<PelletTestImage | null>(null)

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      let activeId = sessionId
      if (!activeId) {
        activeId = await onRequireDraft()
      }
      if (!activeId) throw new Error('Could not create draft')
      return pelletTestApi.uploadImage(activeId, file)
    },
    onSuccess: () => {
      if (sessionId) {
        qc.invalidateQueries({ queryKey: ['pellet-test', sessionId] })
        qc.invalidateQueries({ queryKey: ['pellet-tests', sessionId] })
      }
      qc.invalidateQueries({ queryKey: ['pellet-tests'] })
      qc.invalidateQueries({ queryKey: ['pellet-drafts'] })
    },
    onError: err => toast(err instanceof Error ? err.message : 'Failed to upload', 'error'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => pelletTestApi.deleteImage(sessionId!, id),
    onSuccess: () => {
      if (sessionId) {
        qc.invalidateQueries({ queryKey: ['pellet-test', sessionId] })
        qc.invalidateQueries({ queryKey: ['pellet-tests', sessionId] })
      }
    },
  })

  function handleFileChange(file: File | undefined) {
    if (!file) return
    setReplacing(null)
    setEditingFile(file)
  }

  async function startEditExisting(img: PelletTestImage) {
    try {
      const res = await fetch(img.image_url, { credentials: 'include' })
      if (!res.ok) throw new Error('fetch')
      const blob = await res.blob()
      const ext = (blob.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg')
      const f = new File([blob], `pellet-test.${ext}`, { type: blob.type || 'image/jpeg' })
      setReplacing(img)
      setEditingFile(f)
    } catch {
      toast('Could not load the photo to edit.', 'error')
    }
  }

  async function onEditedImage(file: File) {
    if (file.size > 10 * 1024 * 1024) {
      toast('Image must be under 10 MB', 'error')
      setEditingFile(null)
      setReplacing(null)
      return
    }
    const replacingImg = replacing
    setEditingFile(null)
    setReplacing(null)
    try {
      await uploadMutation.mutateAsync(file)
      if (replacingImg && sessionId) {
        await deleteMutation.mutateAsync(replacingImg.id)
      }
    } catch {
      toast('Failed to save edited photo.', 'error')
    }
  }

  return (
    <section className="bg-surface border border-line rounded-lg p-5 lg:p-6 shadow-card space-y-5">
      <header>
        <h2 className="t-subsection-title">Target photos</h2>
        <p className="text-sm text-muted mt-0.5">
          Upload a photo per group. You'll measure each in the next step.
        </p>
      </header>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => {
          handleFileChange(e.target.files?.[0])
          e.target.value = ''
        }}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={e => {
          handleFileChange(e.target.files?.[0])
          e.target.value = ''
        }}
      />

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadMutation.isPending}
          className="flex-1 flex items-center justify-center gap-2 border border-dashed border-subtle rounded p-3 text-muted text-sm hover:border-[var(--brass)]/50 hover:text-secondary transition-colors disabled:opacity-50"
        >
          {uploadMutation.isPending ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Upload size={16} />
          )}
          Upload
        </button>
        <button
          type="button"
          onClick={() => cameraInputRef.current?.click()}
          disabled={uploadMutation.isPending}
          className="flex-1 flex items-center justify-center gap-2 border border-dashed border-subtle rounded p-3 text-muted text-sm hover:border-[var(--brass)]/50 hover:text-secondary transition-colors disabled:opacity-50"
        >
          <Camera size={16} /> Camera
        </button>
      </div>

      {images.length === 0 ? (
        <p className="text-sm text-muted text-center py-8 border border-dashed border-line rounded-lg">
          No photos yet. Upload a target image to start measuring.
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {images.map(img => {
            const measurement = measurementsByImage.get(img.id)
            const measuredMM = measurement?.measured_size_mm ?? measurement?.auto_group_size_mm
            return (
              <div
                key={img.id}
                className="relative rounded-lg border border-line bg-bg-2 overflow-hidden group"
              >
                <button
                  type="button"
                  onClick={() => onMeasure(img)}
                  className="block w-full aspect-square"
                  aria-label="Measure this photo"
                >
                  <img src={img.image_url} alt="" className="w-full h-full object-cover" />
                </button>
                <div className="absolute top-1 right-1 flex gap-1">
                  <button
                    type="button"
                    onClick={() => startEditExisting(img)}
                    className="p-1 rounded-full bg-page/80 backdrop-blur text-muted hover:text-primary transition-colors"
                    aria-label="Edit photo"
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteMutation.mutate(img.id)}
                    disabled={deleteMutation.isPending}
                    className="p-1 rounded-full bg-page/80 backdrop-blur text-muted hover:text-[var(--error-text)] transition-colors disabled:opacity-50"
                    aria-label="Remove photo"
                  >
                    <X size={12} />
                  </button>
                </div>
                <div className="absolute bottom-0 left-0 right-0 bg-page/80 backdrop-blur px-2 py-1.5 text-[10px] uppercase tracking-widest flex items-center justify-between">
                  {measuredMM != null && measuredMM > 0 ? (
                    <span className="text-gold font-mono">{measuredMM.toFixed(2)} mm</span>
                  ) : (
                    <span className="text-muted">Not measured</span>
                  )}
                  <button
                    type="button"
                    onClick={() => onMeasure(img)}
                    className="inline-flex items-center gap-1 text-ink-2 hover:text-gold transition-colors"
                  >
                    <Crosshair size={11} /> Measure
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {editingFile && (
        <ImageEditor
          file={editingFile}
          onSave={onEditedImage}
          onCancel={() => {
            setEditingFile(null)
            setReplacing(null)
          }}
        />
      )}
    </section>
  )
}

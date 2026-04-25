export type Discipline = 'benchrest' | 'field' | 'target' | string

export function ordinal(n: number): string {
  if (n <= 0) return ''
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return s[(v - 20) % 10] || s[v] || s[0]
}

const AVATAR_GRADIENTS: Array<{ from: string; to: string }> = [
  { from: '#a07b2c', to: '#b88a35' },
  { from: '#4a5a3a', to: '#6a7a4a' },
  { from: '#3a3a42', to: '#555560' },
  { from: '#7a3a3a', to: '#a85040' },
  { from: '#3a5a7a', to: '#4a6a8a' },
  { from: '#5a3a6a', to: '#7a5a8a' },
]

function hashName(name: string): number {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0
  return Math.abs(h)
}

export function avatarGradient(name: string) {
  return AVATAR_GRADIENTS[hashName(name) % AVATAR_GRADIENTS.length]
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function disciplineCover(type?: string): { from: string; to: string } {
  switch (type) {
    case 'benchrest':
      return { from: '#b88a35', to: '#8a6520' }
    case 'field':
      return { from: '#4a5a3a', to: '#3a4a2a' }
    case 'target':
    default:
      return { from: '#3a3a42', to: '#26262d' }
  }
}

export function disciplineTagClass(type?: string): string {
  switch (type) {
    case 'benchrest':
      return 'lc-tag-benchrest'
    case 'field':
      return 'lc-tag-field'
    case 'target':
      return 'lc-tag-target'
    default:
      return 'lc-tag-neutral'
  }
}

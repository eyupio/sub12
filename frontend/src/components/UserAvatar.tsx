import { CSSProperties, forwardRef } from 'react'
import { Link } from '@tanstack/react-router'
import { UserHoverCard } from './UserHoverCard'

interface UserLike {
  id?: string
  display_name?: string
  avatar_url?: string | null
  star_level?: number
}

interface UserAvatarProps {
  user: UserLike
  size?: number // pixels, default 32
  variant?: 'default' | 'brass' | 'plain'
  className?: string
  linkToProfile?: boolean
  showHoverCard?: boolean
  alt?: string
}

interface AvatarBlockProps {
  user: UserLike
  size: number
  variant: 'default' | 'brass' | 'plain'
  className: string
  alt?: string
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

function avatarGradient(name: string) {
  return AVATAR_GRADIENTS[hashName(name) % AVATAR_GRADIENTS.length]
}

function initialsOf(name?: string): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

const AvatarBlock = forwardRef<HTMLSpanElement, AvatarBlockProps>(function AvatarBlock(
  { user, size, variant, className, alt },
  ref,
) {
  const fontSize = Math.max(8, Math.round(size * 0.34))
  const dim: CSSProperties = { width: size, height: size, fontSize }

  const baseWrap = 'inline-flex items-center justify-center rounded-full overflow-hidden font-medium select-none'
  const variantWrap =
    variant === 'brass'
      ? 'bg-[var(--brass)]/10 text-[var(--brass)]'
      : variant === 'plain'
      ? 'bg-surface-hover text-muted'
      : 'border border-subtle bg-surface-hover text-muted'

  const altText = alt ?? user.display_name ?? ''

  if (user.avatar_url) {
    return (
      <span
        ref={ref}
        style={dim}
        className={`${baseWrap} ${variantWrap} ${className}`.trim()}
      >
        <img src={user.avatar_url} alt={altText} className="w-full h-full object-cover" />
      </span>
    )
  }

  const name = user.display_name ?? ''
  const g = avatarGradient(name)
  return (
    <span
      ref={ref}
      style={{ ...dim, background: `linear-gradient(135deg, ${g.from}, ${g.to})` }}
      className={`${baseWrap} text-white ${className}`.trim()}
      aria-label={altText}
      role="img"
    >
      {initialsOf(name)}
    </span>
  )
})

export function UserAvatar({
  user,
  size = 32,
  variant = 'default',
  className = '',
  linkToProfile = false,
  showHoverCard = true,
  alt,
}: UserAvatarProps) {
  const avatar = (
    <AvatarBlock user={user} size={size} variant={variant} className={className} alt={alt} />
  )

  let inner = avatar
  if (linkToProfile && user.id) {
    inner = (
      <Link
        to="/users/$id"
        params={{ id: user.id }}
        className="inline-flex"
        aria-label={`View ${user.display_name ?? 'user'}'s profile`}
      >
        {avatar}
      </Link>
    )
  }

  if (showHoverCard && user.id) {
    return (
      <UserHoverCard
        userId={user.id}
        displayName={user.display_name}
        avatarUrl={user.avatar_url}
        starLevel={user.star_level}
      >
        {inner}
      </UserHoverCard>
    )
  }

  return inner
}

export default UserAvatar

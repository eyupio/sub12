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

  return (
    <span
      ref={ref}
      style={dim}
      className={`${baseWrap} ${variantWrap} ${className}`.trim()}
    >
      {user.avatar_url ? (
        <img src={user.avatar_url} alt={altText} className="w-full h-full object-cover" />
      ) : (
        <img src="/default-avatar.svg" alt={altText} className="w-full h-full object-cover" />
      )}
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

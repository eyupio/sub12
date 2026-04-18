import {
  Award,
  Calendar,
  Crosshair,
  Eye,
  Flag,
  FlaskConical,
  type LucideIcon,
  MessageCircle,
  Star,
  Target,
  TrendingUp,
  Trophy,
  UserPlus,
  Users,
} from 'lucide-react'

// Keys match the `icon` column in backend achievement_defs rows (see
// migrations 000017 and 000052). New achievements must add their icon here
// and fall back to Award when missing.
const iconMap: Record<string, LucideIcon> = {
  target: Target,
  star: Star,
  award: Award,
  eye: Eye,
  crosshair: Crosshair,
  calendar: Calendar,
  trophy: Trophy,
  'user-plus': UserPlus,
  users: Users,
  'message-circle': MessageCircle,
  flag: Flag,
  'flask-conical': FlaskConical,
  'trending-up': TrendingUp,
}

export function iconForAchievement(icon?: string | null): LucideIcon {
  if (!icon) return Award
  return iconMap[icon] ?? Award
}

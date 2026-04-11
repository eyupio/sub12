import { Outlet } from '@tanstack/react-router'

export default function AuthLayout() {
  return (
    <div className="min-h-screen bg-slate-950">
      <Outlet />
    </div>
  )
}

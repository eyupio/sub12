import type { QueryClient } from '@tanstack/react-query'

// Wipe every piece of client-side state that could leak between users on the
// same browser. Called at every auth boundary (login, register, 2FA verify,
// logout) so user A's data can never be shown to user B.
export async function clearClientSession(queryClient: QueryClient): Promise<void> {
  queryClient.cancelQueries()
  queryClient.removeQueries()
  queryClient.clear()

  if (typeof caches !== 'undefined') {
    try {
      const names = await caches.keys()
      await Promise.all(
        names
          .filter((n) => n === 'api-cache' || n.startsWith('api-') || n.includes('runtime'))
          .map((n) => caches.delete(n)),
      )
    } catch {
      // Cache Storage unavailable (private mode, old browser); ignore.
    }
  }
}

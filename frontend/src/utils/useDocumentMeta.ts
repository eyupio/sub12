import { useEffect } from 'react'

export interface DocumentMeta {
  /** Page title, without the brand suffix (it is appended automatically). */
  title: string
  /** Meta/OG/Twitter description. Omitted tags are left at their static value. */
  description?: string
  /** Canonical/OG URL. Defaults to the current origin + pathname. */
  url?: string
  /** og:type. Defaults to 'website'. */
  type?: string
}

const BRAND = 'sub-12'

// Per-page document metadata for the public/shareable SPA routes. Crawlers that
// execute JavaScript (Google, and in-app link previews that render the page)
// pick these up, and the values are restored to the static index.html defaults
// on unmount so a share title never leaks onto the next route. Full coverage for
// crawlers that don't run JS (most social unfurlers) still needs SSR/prerender.
export function useDocumentMeta({ title, description, url, type = 'website' }: DocumentMeta) {
  useEffect(() => {
    const canonical = url ?? `${window.location.origin}${window.location.pathname}`
    const fullTitle = `${title} · ${BRAND}`
    const restores: Array<() => void> = []

    restores.push(setTitle(fullTitle))
    restores.push(setMetaContent('property', 'og:title', fullTitle))
    restores.push(setMetaContent('name', 'twitter:title', fullTitle))
    restores.push(setMetaContent('property', 'og:type', type))
    restores.push(setMetaContent('property', 'og:url', canonical))
    restores.push(setCanonical(canonical))
    if (description) {
      restores.push(setMetaContent('name', 'description', description))
      restores.push(setMetaContent('property', 'og:description', description))
      restores.push(setMetaContent('name', 'twitter:description', description))
    }

    return () => {
      for (const restore of restores.reverse()) restore()
    }
  }, [title, description, url, type])
}

function setTitle(value: string): () => void {
  const prev = document.title
  document.title = value
  return () => {
    document.title = prev
  }
}

function setMetaContent(attr: 'name' | 'property', key: string, content: string): () => void {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`)
  let created = false
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
    created = true
  }
  const prev = el.getAttribute('content')
  el.setAttribute('content', content)
  return () => {
    if (created) el.remove()
    else if (prev !== null) el.setAttribute('content', prev)
  }
}

function setCanonical(href: string): () => void {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
  let created = false
  if (!el) {
    el = document.createElement('link')
    el.setAttribute('rel', 'canonical')
    document.head.appendChild(el)
    created = true
  }
  const prev = el.getAttribute('href')
  el.setAttribute('href', href)
  return () => {
    if (created) el.remove()
    else if (prev !== null) el.setAttribute('href', prev)
  }
}

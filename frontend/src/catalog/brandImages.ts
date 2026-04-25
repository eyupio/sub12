import type { RifleCatalogEntry } from './rifleCatalog'
import type { PelletCatalogEntry } from './pelletCatalog'

export function rifleImage(entry: RifleCatalogEntry): string {
  return entry.image_url ?? brandFallback(entry.make)
}

export function pelletImage(entry: PelletCatalogEntry): string {
  return entry.image_url ?? brandFallback(entry.brand)
}

export const UNKNOWN_BRAND_IMAGE = '/catalog/brands/_unknown.svg'

function brandFallback(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `/catalog/brands/${slug}.svg`
}

export function handleToMention(displayName: string): string {
  return displayName.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 24) || 'shooter'
}

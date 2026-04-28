import { randomBytes } from 'node:crypto';

const suffix = (): string => randomBytes(3).toString('hex');

export function uniqueName(prefix: string): string {
  const ts = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  return `${prefix}-${ts}-${suffix()}`;
}

export function uniqueLeagueName(): string {
  return uniqueName('e2e-league');
}

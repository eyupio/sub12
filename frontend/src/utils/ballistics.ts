/**
 * Ballistics utility functions for distance-normalized comparisons.
 *
 * All functions use angular equivalence (MOA-based) for conversion.
 */

/**
 * Convert a group size measured at one distance to the equivalent size at another distance.
 * Uses simple linear scaling based on the ratio of distances (angular equivalence).
 *
 * @param sizeMM - Measured group size in mm
 * @param actualDistanceM - Distance at which the group was measured (meters)
 * @param targetDistanceM - Distance to normalize to (meters)
 * @returns Normalized group size in mm at the target distance
 */
export function normalizeGroupToDistance(
  sizeMM: number,
  actualDistanceM: number,
  targetDistanceM: number,
): number {
  if (actualDistanceM <= 0 || targetDistanceM <= 0) return sizeMM
  return sizeMM * (targetDistanceM / actualDistanceM)
}

/**
 * Convert a group size in mm to MOA at a given distance.
 *
 * @param sizeMM - Group size in mm
 * @param distanceM - Distance in meters
 * @returns Group size in MOA
 */
export function mmToMOA(sizeMM: number, distanceM: number): number {
  if (distanceM <= 0) return 0
  return (sizeMM / (distanceM * 1000)) * (180 / Math.PI) * 60
}

/**
 * Convert yards to meters.
 */
export function yardsToMeters(yards: number): number {
  return yards * 0.9144
}

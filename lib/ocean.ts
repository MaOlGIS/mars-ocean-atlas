export interface Manifest {
  version: number; width: number; height: number; ppd: number; tileSize: number; maxZoom: number;
  radiusM: number; totalAreaKm2: number; minimumM: number; maximumM: number;
  waterMinimumM: number; waterMaximumM: number; defaultWaterM: number; defaultCoverage: number;
  defaultBinAreaPercent: number; elevations: number[]; cumulative: number[];
  sampling: string; heightReference: string; gridApproximationKm: number;
}
/** First index >= value: equality remains exposed under the z < H rule. */
export function lowerBound(values: number[], value: number): number {
  let low = 0, high = values.length;
  while (low < high) { const middle = (low + high) >>> 1; if (values[middle] < value) low = middle + 1; else high = middle; }
  return low;
}
export function coverageAt(data: Pick<Manifest, 'elevations' | 'cumulative'>, height: number): number {
  const index = lowerBound(data.elevations, height) - 1;
  return index < 0 ? 0 : data.cumulative[index];
}
export function heightAt(data: Pick<Manifest, 'elevations' | 'cumulative' | 'waterMinimumM' | 'waterMaximumM'>, percent: number): number {
  if (percent <= 0) return data.waterMinimumM;
  if (percent >= 100) return data.waterMaximumM;
  return data.elevations[Math.min(lowerBound(data.cumulative, percent), data.elevations.length - 1)] + .125;
}
export const wrapLongitude = (longitude: number) => ((longitude % 360) + 360) % 360;
export function cellAt(data: Pick<Manifest, 'width' | 'height' | 'ppd'>, latitude: number, longitude: number) {
  return { x: Math.min(data.width - 1, Math.floor(wrapLongitude(longitude) * data.ppd)),
    y: Math.max(0, Math.min(data.height - 1, Math.floor((90 - latitude) * data.ppd))) };
}
export const waterDepth = (water: number, terrain: number) => Math.max(0, water - terrain);
export const signedMeters = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value).toLocaleString('en-US', { maximumFractionDigits: 3 })}`;
export const coordinates = (lat: number, lon: number) => `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'}  ·  ${wrapLongitude(lon).toFixed(2)}°E`;

export const parseInt = (x: string) => Number(x);

export const parseMaybeInt = (x: string) =>
  x === "" ? undefined : parseInt(x);

export function toFixedLength<a>(arr: a[], length: number, fill: a) {
  const truncated = arr.slice(0, length);
  const filling = Array(length - truncated.length).fill(fill);
  return truncated.concat(filling);
}

export function clamp(x: number, min: number, max: number): number {
  return Math.max(Math.min(x, max), min);
}

export function stringHash(str: string): string {
  let hash = 0;
  for (let ch of str) {
    // Using bitwise shift for performance: hash * 31 + char
    hash = (hash << 5) - hash + ch.charCodeAt(0);
    // Convert to 32bit integer
    hash |= 0;
  }
  // Return as a positive integer string for simplicity
  return (hash >>> 0).toString(16);
}

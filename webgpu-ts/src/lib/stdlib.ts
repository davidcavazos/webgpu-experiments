export const UINT8_MAX = 0xFF;
export const UINT16_MAX = 0xFFFF;
export const INT16_MAX = 0x7FFF;
export const UINT32_MAX = 0xFFFFFFFF;
export const INT32_MAX = 0x7FFFFFFF;

export function kb(n: number): number {
  return n * 1024;
}
export function mb(n: number): number {
  return kb(n) * 1024;
}
export function gb(n: number): number {
  return mb(n) * 1024;
}

export class Maybe<a> {
  value: a | undefined;
  constructor(value?: a | undefined) {
    this.value = value;
  }

  map<b>(f: (x: a) => b) {
    if (this.value !== undefined) {
      return f(this.value);
    }
    return undefined;
  }
}

export const None = <a>() => new Maybe<a>();
export const Just = <a>(x: a) => new Maybe(x);

export const parseInt = (x: string) => Number(x);

export const parseMaybeInt = (x: string) =>
  x === "" ? undefined : parseInt(x);

export function isObjectEmpty(obj: Object) {
  for (const _ in obj) {
    return false;
  }
  return true;
}

export function toFixedLength<a>(arr: a[], length: number, fill: a) {
  const truncated = arr.slice(0, length);
  const filling = Array(length - truncated.length).fill(fill);
  return truncated.concat(filling);
}

export function clamp(x: number, max?: number, min?: number): number {
  return Math.max(Math.min(x, max ?? 1), min ?? 0);
}

export function splitBatches<a>(xs: a[], size: number): a[][] {
  const length = Math.ceil(xs.length / size);
  return Array.from({ length }, (_, i) => xs.slice(i * size, i * size + size));
}

export function hashString(str: string): string {
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

export function hashRecord(record: Record<string, any>): string {
  const sortedObj = Object.fromEntries(
    Object.entries(record).sort(([key1], [key2]) => key1.localeCompare(key2)),
  );
  return hashString(JSON.stringify(sortedObj));
}

export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

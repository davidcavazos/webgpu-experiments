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

export function toFixedLength<a>(arr: a[], length: number, fill: a) {
  const truncated = arr.slice(0, length);
  const filling = Array(length - truncated.length).fill(fill);
  return truncated.concat(filling);
}

export function clamp(x: number, max?: number, min?: number): number {
  return Math.max(Math.min(x, max ?? 1), min ?? 0);
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

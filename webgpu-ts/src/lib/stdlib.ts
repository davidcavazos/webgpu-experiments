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

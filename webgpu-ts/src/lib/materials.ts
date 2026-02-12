export type MaterialId = number;
export type MaterialName = string;
export interface Material {
  opaque?: boolean;
}
export interface MaterialRef {
  id: MaterialId;
  name: MaterialName;
}

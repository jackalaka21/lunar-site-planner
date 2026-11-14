export type Vec3 = readonly [number, number, number];
export type BodyId = "sun" | "earth";
/** Local frame at the observer. p is the observer vector (km, Moon-centred); u/e/n are unit vectors. */
export interface SiteFrame {
  p: Vec3;
  u: Vec3;
  e: Vec3;
  n: Vec3;
}
/** Topocentric position. az/el/r in degrees, az in [0,360); r = angular radius; distKm = range. */
export interface Topo {
  az: number;
  el: number;
  r: number;
  distKm: number;
}
export interface HorizonProfile {
  stepDeg: number;
  /** Value k is the horizon elevation (deg) at azimuth k * stepDeg. */
  elevDeg: Float32Array | Float64Array;
}
export type HorizonSource =
  | { kind: "site"; id: string; mastM: 2 | 10 | 50 }
  | { kind: "grid"; distKm: number; spacingKm: number }
  | { kind: "sphere" };
export interface SiteContext {
  lat: number;
  lon: number;
  hDemM: number;
  obsHeightM: number;
  horizon: HorizonProfile;
  source: HorizonSource;
}
export interface EphemerisSource {
  bodyAt(body: BodyId, tMs: number): Vec3;
  coverage(): [number, number];
}
export interface StationSource {
  moonElDeg(tMs: number): [number, number, number];
}

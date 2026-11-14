/** South-polar stereographic projection on the lunar sphere; mirrors pipeline/lsp/ps.py. */
export const PS_R_M = 1737400;

export function psToXY(latDeg: number, lonDeg: number): { x: number; y: number } {
  const phi = (latDeg * Math.PI) / 180;
  const lam = (lonDeg * Math.PI) / 180;
  const rho = 2 * PS_R_M * Math.tan(Math.PI / 4 + phi / 2);
  return { x: rho * Math.sin(lam), y: rho * Math.cos(lam) };
}

/** Pole gives lon 0, as in Python. */
export function psToLatLon(x: number, y: number): { lat: number; lon: number } {
  const rho = Math.hypot(x, y);
  const phi = 2 * Math.atan(rho / (2 * PS_R_M)) - Math.PI / 2;
  const lam = Math.atan2(x, y);
  return { lat: (phi * 180) / Math.PI, lon: (lam * 180) / Math.PI };
}

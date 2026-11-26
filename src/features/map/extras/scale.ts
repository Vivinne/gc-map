/** Round lengths the scale bar may show, in metres (1 and 2 m: fully zoomed in near the poles, N5) */
const NICE = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000, 500000, 1000000, 2000000];
/** Longest bar, in pixels */
const MAX_PX = 110;

export interface Scale {
  /** Length shown, in metres */
  metres: number;
  label: string;
  px: number;
}

/** Scale bar for a map view: the longest round length that fits in 110 px at the latitude and zoom given */
export function scaleFor(lat: number, zoom: number): Scale {
  const mpp = (40075016.686 * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** zoom);
  const metres = [...NICE].reverse().find((n) => n / mpp <= MAX_PX) ?? NICE[0]!;
  return { metres, label: metres >= 1000 ? `${metres / 1000} km` : `${metres} m`, px: Math.min(metres / mpp, MAX_PX) };
}

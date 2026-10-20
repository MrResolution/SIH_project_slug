/** Per-frame kinematic state shared by the crawler's parts (written by Crawler.tsx). */
export interface CrawlerMotion {
  /** Belt travel of each track [−x, +x], m. Skid-steer pivots run them apart. */
  odo: [number, number];
  /** Hose paid off the reel, m. */
  paid: number;
  /** Reel drum rotation, rad. */
  reelAngle: number;
  /** Current coil radius on the drum, m. */
  rCoil: number;
}

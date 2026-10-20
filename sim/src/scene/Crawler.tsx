import { Rover, roverPose, crawlerPose, type RoverProps } from './Rover';
import { BoosterSkid } from './BoosterSkid';

export { crawlerPose, roverPose, Rover, BoosterSkid };
export type { RoverProps };

/**
 * Combined Crawler component (Rover chassis carrying the Booster Skid).
 * Preserved for backwards compatibility with existing scene and camera imports.
 */
export function Crawler() {
  return (
    <Rover>
      <BoosterSkid />
    </Rover>
  );
}

export default Crawler;

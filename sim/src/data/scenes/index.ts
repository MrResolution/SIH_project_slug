import type { SimGeometry } from '../../core/state';
import type { Scenario } from '../../core/scenario';
import { parseScenario } from '../../core/scenario';
import { E1_HOSE_ROUTE, E1_LANE } from './e1';
import S02 from '../scenarios/S02.json';

export function geometryFor(scene: Scenario['scene']): SimGeometry {
  switch (scene) {
    case 'E1':
      return {
        lane: E1_LANE,
        laneElev: E1_LANE.elevationTable(0.25),
        hoseRoute: E1_HOSE_ROUTE,
        hoseElev: E1_HOSE_ROUTE.elevationTable(0.25),
      };
  }
}

export const SCENARIOS: Record<string, Scenario> = {
  S02: parseScenario(S02),
};

export const SCENARIO_LIST = Object.values(SCENARIOS).map((s) => ({ id: s.id, title: s.title.en, summary: s.summary }));

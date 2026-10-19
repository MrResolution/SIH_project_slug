/**
 * Time-series columns recorded every 0.5 s of sim time for the charts and the
 * debrief. Fixed order so rows travel as flat number arrays.
 */
export const HISTORY_COLUMNS = [
  't',
  'pD_bar',
  'pCube_barg',
  'qHose_lpm',
  'qSuction_lpm',
  'qJet_lpm',
  'qRelief_lpm',
  'h2s_ppm',
  'o2_pct',
  'ch4_lel',
  'co_ppm',
  'augerA',
  'tsPumped',
  'statorC',
  'soc_pct',
  'power_kW',
  'cubeL',
  'pitPct',
  'pcpRpm',
  'tsPit',
  'hoseFill',
] as const;

export type HistoryColumn = (typeof HISTORY_COLUMNS)[number];
export const HCOL: Record<HistoryColumn, number> = Object.fromEntries(HISTORY_COLUMNS.map((c, i) => [c, i])) as Record<HistoryColumn, number>;
export const HISTORY_DT = 0.5;

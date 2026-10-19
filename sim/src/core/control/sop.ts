/**
 * Machine-guided SOP, docs/05 §5. Step completion is latched in the core so
 * scoring and the debrief see exactly what the trainee did, in order.
 */
export interface SopStep {
  id: number;
  title: string;
  /** Interlocked by hardware (🔒 in docs/05). */
  locked: boolean;
  detail: string;
  hint: string;
}

export const SOP: SopStep[] = [
  { id: 1, title: 'Arrive and park', locked: true, detail: 'Drive down the lane to the pit. Deploy outriggers and chocks.', hint: 'Use "Drive to pit", then deploy the outriggers and engage the chocks. K2 stays open until both limit switches close.' },
  { id: 2, title: 'Check in', locked: false, detail: 'Scan the household QR plate to open the job record.', hint: 'The QR plate is on the wall beside the manhole. Scanning starts the chain of custody.' },
  { id: 3, title: 'PPE', locked: false, detail: 'Gauntlets, gumboots, face shield, respirator and hi-vis for all three crew.', hint: 'Confirm PPE on the pendant before anyone approaches the manhole.' },
  { id: 4, title: 'Open the manhole', locked: false, detail: 'Use the manhole lifter, never bare hands. Stand upwind.', hint: 'Opening releases the sealed headspace. Expect the gas readings to spike.' },
  { id: 5, title: 'Ventilate', locked: true, detail: 'Hang the sniffer, run the Ex blower. 10-minute timer; restarts if gas is unsafe.', hint: 'Place the sniffer and start the blower. The timer only runs while all four gases are inside limits.' },
  { id: 6, title: 'Tripod and lance', locked: false, detail: 'Set up the davit tripod; lower the lance with the winch.', hint: 'Lower the lance tip to the cake/supernatant interface (~0.9 m) so the auger mixes your own supernatant into the cake. Switch the winch to Auto-follow before pumping, or lower it by hand as the level falls.' },
  { id: 7, title: 'Prime', locked: true, detail: 'Vacuum-prime the surge cube.', hint: 'Press ARM, then VAC PRIME. The level controller holds only the vacuum needed (DR-3).' },
  { id: 8, title: 'Extract', locked: true, detail: 'Start the auger, then the PCP. Watch flow and pressure.', hint: 'Auger forward at 300 rpm, then PCP START at ~300 rpm once the cube shows > 15 L.' },
  { id: 9, title: 'Condition', locked: false, detail: 'If flow drops or auger current rises, open the jetting valve.', hint: 'Rising auger current means cake. JET ON returns the pit\'s own liquid to the cake — zero fresh water. Target pumped TS ≤ 12 %.' },
  { id: 10, title: 'Seed-layer stop', locked: false, detail: 'The depth gauge warns at 95 %. Stop, or override (logged).', hint: 'Leave the 25 mm seed layer for the tank to restart digestion. FINISH starts the purge.' },
  { id: 11, title: 'Purge', locked: false, detail: 'Vane pump in blow mode clears the cube and small lines.', hint: 'Purge empties the cube through the PCP and blows the suction leg back to the pit. Essential below 0 °C.' },
  { id: 12, title: 'Decontaminate', locked: true, detail: 'Spray couplings and lance with 1 % chlorine; lime on spills.', hint: 'Confirm decon to release the job for close-out.' },
  { id: 13, title: 'Close and stow', locked: false, detail: 'Close the manhole, raise the lance, stow tripod, outriggers up.', hint: 'Raise the lance fully before stowing the tripod. Travel is inhibited until the outriggers are up.' },
  { id: 14, title: 'Check out', locked: false, detail: 'Close the job; scan the FSTP QR when the tanker discharges.', hint: 'Close the job record, then dispatch the tanker to the FSTP for reconciliation.' },
];

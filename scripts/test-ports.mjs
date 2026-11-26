// Kept for scripts and older branches that imported the first slot module.
// The plan lives in test-plan.mjs and the turns in test-runs.mjs.

import {
  SLOT_PORTS,
  SPEED_TURN_PORT,
  TURN_PORTS,
  portsFor,
} from "./test-plan.mjs";
import { joinTestRuns } from "./test-runs.mjs";

export {
  MAX_RUNS,
  RUN_PORTS,
  SLOT_PORTS,
  SPEED_TURN_PORT,
  TURNS,
  TURN_PORTS,
  portsFor,
  portIsFree,
} from "./test-plan.mjs";
export { joinTestRuns, whyWaiting } from "./test-runs.mjs";

/**
 * The first module's shape: takes a slot and returns its ports. It does not wait
 * for a turn, so use joinTestRuns when the run is going to do any work.
 */
export async function claimTestRun({
  slotPorts = SLOT_PORTS,
  portsFor: portsAt = portsFor,
} = {}) {
  const run = await joinTestRuns({
    ports: {
      speedTurn: SPEED_TURN_PORT,
      slots: slotPorts,
      turns: TURN_PORTS,
    },
    serverPorts: (slot) => Object.values(portsAt(slot)),
  });
  return {
    slot: run.slot,
    ...portsAt(run.slot),
    leave: run.leave,
  };
}

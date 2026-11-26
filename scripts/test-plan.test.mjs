import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MAX_RUNS,
  RUN_PORTS,
  SLOT_PORTS,
  SPEED_TURN_PORT,
  TURNS,
  TURN_PORTS,
  portsFor,
} from "./test-plan.mjs";

describe("test plan", () => {
  it("lets two test runs go at once, whatever the size of the slots", () => {
    assert.equal(TURNS, 2);
    assert.equal(TURN_PORTS.length, 2);
    assert.ok(MAX_RUNS > TURNS);
  });

  it("keeps every slot's, turn's and speed turn's ports apart and away from the app's", () => {
    const ports = [
      SPEED_TURN_PORT,
      ...SLOT_PORTS,
      ...TURN_PORTS,
      ...Array.from({ length: MAX_RUNS }, (_, slot) =>
        Object.values(portsFor(slot)),
      ).flat(),
    ];

    assert.equal(new Set(ports).size, ports.length);
    for (const port of ports) {
      assert.ok(port > 8963, `${port} sits on an older test port`);
      assert.ok(port < 32768, `${port} sits where the system hands out ports`);
      assert.notEqual(port, 5173);
      assert.notEqual(port, 8000);
    }
  });

  it("gives every slot a web and API port of its own", () => {
    for (const [slot, slotPort] of SLOT_PORTS.entries()) {
      const { webPort, apiPort } = portsFor(slot);
      assert.notEqual(webPort, slotPort);
      assert.equal(apiPort, webPort + 1);
    }
  });

  it("publishes the ports the runs share it through", () => {
    assert.deepEqual(RUN_PORTS, {
      speedTurn: SPEED_TURN_PORT,
      slots: SLOT_PORTS,
      turns: TURN_PORTS,
    });
  });
});

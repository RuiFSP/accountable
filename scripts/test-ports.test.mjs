import assert from "node:assert/strict";
import net from "node:net";
import { afterEach, describe, it } from "node:test";

import { MAX_RUNS, SLOT_PORTS, claimTestRun, portsFor } from "./test-ports.mjs";

const HOST = "127.0.0.1";
const cleanups = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) {
    await cleanup();
  }
});

function close(server) {
  return new Promise((resolve) => {
    if (!server.listening) {
      resolve();
      return;
    }
    server.close(() => resolve());
  });
}

function listen(port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer((socket) => socket.destroy());
    server.once("error", reject);
    server.listen(port, HOST, () => resolve(server));
  });
}

/** Holds a port for the test, as another program would. */
async function hold(port) {
  const server = await listen(port);
  cleanups.push(() => close(server));
  return server;
}

/** Ports the system says are free, so these tests never touch a real run's ports. */
async function freePorts(count) {
  const servers = await Promise.all(
    Array.from({ length: count }, () => listen(0)),
  );
  const ports = servers.map((server) => server.address().port);
  await Promise.all(servers.map(close));
  return ports;
}

/** Two slots and the server ports each would use. */
async function twoRunLayout() {
  const [firstSlot, secondSlot, ...serverPorts] = await freePorts(6);
  const [firstWeb, firstApi, secondWeb, secondApi] = serverPorts;
  return {
    slotPorts: [firstSlot, secondSlot],
    portsFor: (slot) =>
      slot === 0
        ? { webPort: firstWeb, apiPort: firstApi }
        : { webPort: secondWeb, apiPort: secondApi },
  };
}

async function claim(layout) {
  const run = await claimTestRun(layout);
  cleanups.push(() => run.leave());
  return run;
}

describe("claimTestRun", () => {
  it("gives two runs at once different slots, and a slot back once its run leaves", async () => {
    const layout = await twoRunLayout();
    const first = await claim(layout);
    const second = await claim(layout);

    assert.notEqual(second.slot, first.slot);

    await first.leave();
    const again = await claim(layout);
    assert.equal(again.slot, first.slot);
  });

  it("passes over a slot where another program has one of the run's ports", async () => {
    const layout = await twoRunLayout();
    await hold(layout.portsFor(0).webPort);

    const run = await claim(layout);

    assert.equal(run.slot, 1);
  });

  it("says plainly when every slot is taken", async () => {
    const layout = await twoRunLayout();
    await claim(layout);
    await claim(layout);

    await assert.rejects(
      () => claimTestRun(layout),
      /There are already 2 test runs on this computer/,
    );
  });

  it("keeps every slot's ports apart and away from the app's own ports", () => {
    const ports = [
      ...SLOT_PORTS,
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
});

/* global setTimeout */

import assert from "node:assert/strict";
import net from "node:net";
import { afterEach, describe, it } from "node:test";

import { joinTestRuns, whyWaiting } from "./test-runs.mjs";

const HOST = "127.0.0.1";
const POLL_MS = 10;
// Long enough that a run nothing was holding back would have gone on by then.
const SETTLE_MS = 200;
// For a run that looks rarely, so that a run polling every POLL_MS has every chance to get in before it.
const SLOW_POLL_MS = 300;

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const servers = [];
const runs = [];

afterEach(async () => {
  await Promise.all(runs.splice(0).map((run) => run.leave()));
  await Promise.all(servers.splice(0).map(close));
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

/** Listens on a port the system picks, answering with nothing, like a program that isn't a test run. */
function listenAnywhere() {
  return new Promise((resolve) => {
    const server = net.createServer((socket) => socket.end());
    server.listen(0, HOST, () => {
      servers.push(server);
      resolve(server);
    });
  });
}

/** Listens on a turn's port as a run does, answering "turn". */
function holdTurn(port) {
  return new Promise((resolve) => {
    const server = net.createServer((socket) => socket.end("turn"));
    servers.push(server);
    server.listen(port, HOST, () => resolve(server));
  });
}

async function anotherProgramsPort() {
  const server = await listenAnywhere();
  return server.address().port;
}

/** Ports the system says are free, so these tests never touch a real run's ports. */
async function someFreePorts(count) {
  const held = await Promise.all(Array.from({ length: count }, listenAnywhere));
  const ports = held.map((server) => server.address().port);
  await Promise.all(held.map(close));
  for (const server of held) {
    const index = servers.indexOf(server);
    if (index !== -1) {
      servers.splice(index, 1);
    }
  }
  return ports;
}

/** The speed tests' turn, the slots and the two turns to go. */
async function testPorts({ slots = 2 } = {}) {
  const [speedTurn, ...others] = await someFreePorts(1 + slots + 2);
  return {
    speedTurn,
    slots: others.slice(0, slots),
    turns: others.slice(slots),
  };
}

async function join(ports, options = {}) {
  const run = await joinTestRuns({ ports, pollMs: POLL_MS, ...options });
  runs.push(run);
  return run;
}

/** Whether the promise has settled within SETTLE_MS. */
async function settles(promise) {
  let settled = false;
  promise.then(() => (settled = true));
  await pause(SETTLE_MS);
  return settled;
}

/** Polls until check() is true, so a slow machine doesn't decide what a run was doing yet. */
async function waitFor(check, limitMs = 3000) {
  const began = Date.now();
  for (;;) {
    if (await check()) {
      return;
    }
    if (Date.now() - began > limitMs) {
      throw new Error(`Still not true after ${limitMs}ms.`);
    }
    await pause(POLL_MS);
  }
}

/** What a run says on its slot's port. */
function slotSays(port) {
  return new Promise((resolve) => {
    const socket = net.connect(port, HOST);
    let reply = "";
    socket.setEncoding("utf8");
    socket.setTimeout(5000, () => socket.destroy());
    socket.on("data", (chunk) => (reply += chunk));
    socket.on("error", () => {});
    socket.on("close", () => resolve(reply));
  });
}

describe("whyWaiting", () => {
  it("says how many runs are ahead", () => {
    assert.equal(
      whyWaiting({ waitingFor: "turn", ahead: 1 }),
      "Waiting for a turn. 2 test runs at a time can go on this computer, and 1 other test run is ahead of this one.",
    );
    assert.equal(
      whyWaiting({ waitingFor: "turn", ahead: 0 }),
      "Waiting for a turn. 2 test runs at a time can go on this computer, and this one is next.",
    );
    assert.equal(
      whyWaiting({ waitingFor: "speed tests" }),
      "Waiting for the speed tests of another test run on this computer.",
    );
  });
});

describe("joinTestRuns", () => {
  it("gives two runs at once different slots, and a slot back once its run leaves", async () => {
    const ports = await testPorts();
    const first = await join(ports);
    const second = await join(ports);

    assert.notEqual(second.slot, first.slot);

    await first.leave();
    assert.equal((await join(ports)).slot, first.slot);
  });

  it("passes over a slot where another program has one of the run's ports", async () => {
    const ports = await testPorts();
    const taken = await anotherProgramsPort();

    const run = await join(ports, {
      serverPorts: (slot) => (slot === 0 ? [taken] : []),
    });

    assert.equal(run.slot, 1);
  });

  it("says plainly when every slot is taken", async () => {
    const ports = await testPorts();
    await join(ports);
    await join(ports);

    await assert.rejects(
      () => joinTestRuns({ ports, pollMs: POLL_MS }),
      /There are already 2 test runs on this computer/,
    );
  });

  it("tells the other runs it's busy from its turn until its speed tests", async () => {
    const ports = await testPorts();
    const run = await join(ports);
    const other = await join(ports);

    assert.equal(await other.otherBusyRuns(), 0);
    await run.takeTurn();
    assert.equal(await other.otherBusyRuns(), 1);
    await (
      await run.takeSpeedTurn()
    )();
    assert.equal(await other.otherBusyRuns(), 0);
  });

  it("lets no more than two runs go at once, and the next waits for a turn, saying so", async () => {
    const ports = await testPorts({ slots: 3 });
    const first = await join(ports);
    const second = await join(ports);
    const third = await join(ports);
    await first.takeTurn();
    await second.takeTurn();

    const reasons = [];
    const turn = third.takeTurn((reason) => reasons.push(reason));
    assert.equal(await settles(turn), false);
    assert.deepEqual(reasons, [{ waitingFor: "turn", ahead: 0 }]);
    assert.equal(await third.otherBusyRuns(), 2);

    await first.leave();
    await turn;
    assert.equal(await second.otherBusyRuns(), 1);
  });

  it("says why it's waiting once two runs are busy, and not before", async () => {
    const ports = await testPorts({ slots: 3 });
    const runs = [await join(ports), await join(ports), await join(ports)];
    await runs[0].takeTurn();
    await runs[1].takeTurn();
    await waitFor(async () => (await runs[2].otherBusyRuns()) === 2);

    const reasons = [];
    const turn = runs[2].takeTurn((reason) => reasons.push(reason));
    await waitFor(() => reasons.length > 0);
    assert.deepEqual(reasons, [{ waitingFor: "turn", ahead: 0 }]);

    await Promise.all(runs.map((run) => run.leave()));
    await turn;
  });

  it("never takes a turn another run holds, even before that run says it's busy", async () => {
    const ports = await testPorts();
    const [, second] = await Promise.all(ports.turns.map(holdTurn));
    const run = await join(ports);

    const turn = run.takeTurn();
    assert.equal(await settles(turn), false);

    await close(second);
    await turn;
  });

  it("gives the turns in the order the runs started waiting, whatever their slots", async () => {
    const ports = await testPorts({ slots: 4 });
    const first = await join(ports);
    const second = await join(ports);
    await first.takeTurn();
    await second.takeTurn();
    const lowerSlot = await join(ports);
    const higherSlot = await join(ports, { pollMs: SLOW_POLL_MS });

    const earlierTurn = higherSlot.takeTurn();
    await waitFor(async () =>
      (await slotSays(ports.slots[higherSlot.slot])).startsWith("queued"),
    );
    assert.equal(await settles(earlierTurn), false);
    const laterReasons = [];
    const laterTurn = lowerSlot.takeTurn((reason) => laterReasons.push(reason));
    await waitFor(() => laterReasons.length > 0);
    assert.equal(await settles(laterTurn), false);
    assert.deepEqual(laterReasons, [{ waitingFor: "turn", ahead: 1 }]);

    await first.leave();
    assert.equal(await settles(laterTurn), false);
    await earlierTurn;
    assert.equal(await settles(laterTurn), false);

    await second.leave();
    await laterTurn;
  });

  it("starts the speed tests only once no other run is busy, and says once that it's waiting", async () => {
    const ports = await testPorts();
    const busy = await join(ports);
    const speed = await join(ports);
    await busy.takeTurn();

    const reasons = [];
    const turn = speed.takeSpeedTurn((reason) => reasons.push(reason));
    assert.equal(await settles(turn), false);
    assert.deepEqual(reasons, [{ waitingFor: "speed tests" }]);

    await busy.leave();
    await (
      await turn
    )();
  });

  it("waits for a turn while another run has the speed tests' turn", async () => {
    const ports = await testPorts();
    const speed = await join(ports);
    const other = await join(ports);
    const handBack = await speed.takeSpeedTurn();

    const reasons = [];
    const busy = other.takeTurn((reason) => reasons.push(reason));
    assert.equal(await settles(busy), false);
    assert.deepEqual(reasons, [{ waitingFor: "speed tests" }]);
    assert.equal(await speed.otherBusyRuns(), 0);

    await handBack();
    await busy;
    assert.equal(await speed.otherBusyRuns(), 1);
  });

  it("lets every run that has finished its end-to-end tests have its speed tests before the next run gets a turn", async () => {
    const ports = await testPorts({ slots: 3 });
    const first = await join(ports);
    const second = await join(ports, { pollMs: SLOW_POLL_MS });
    const waiting = await join(ports);
    await second.takeTurn();
    const firstSpeedTurn = first.takeSpeedTurn();
    assert.equal(await settles(firstSpeedTurn), false);

    const reasons = [];
    const turn = waiting.takeTurn((reason) => reasons.push(reason));
    const secondSpeedTurn = second.takeSpeedTurn();
    // A run waiting for a turn isn't busy, so the speed tests don't wait for it.
    await (
      await firstSpeedTurn
    )();
    assert.equal(await settles(turn), false);
    assert.deepEqual(reasons, [{ waitingFor: "speed tests" }]);

    await (
      await secondSpeedTurn
    )();
    await turn;
  });

  it("gives the speed tests' turn to one run at a time", async () => {
    const ports = await testPorts();
    const first = await join(ports);
    const second = await join(ports);
    const handBack = await first.takeSpeedTurn();

    const secondTurn = second.takeSpeedTurn();
    assert.equal(await settles(secondTurn), false);

    await handBack();
    await (
      await secondTurn
    )();
  });

  it("takes the speed tests' turn from a run handing it back, which can drop a connection without answering", async () => {
    const ports = await testPorts();
    // As a run closes its turn, a connection the system has already taken can end with no answer.
    const handingBack = net.createServer((socket) => {
      socket.end();
      handingBack.close();
    });
    await new Promise((resolve) =>
      handingBack.listen(ports.speedTurn, HOST, resolve),
    );
    const run = await join(ports);

    await (
      await run.takeSpeedTurn()
    )();
  });

  it("stops with a message when other programs have the turns' ports", async () => {
    const ports = await testPorts();
    const turns = [await anotherProgramsPort(), await anotherProgramsPort()];
    const run = await join({ ...ports, turns });

    await assert.rejects(
      () => run.takeTurn(),
      new RegExp(`Port ${turns[0]} is in use by another program`),
    );
  });

  it("stops with a message when another program has the speed tests' port", async () => {
    const ports = await testPorts();
    const speedTurn = await anotherProgramsPort();
    const run = await join({ ...ports, speedTurn });

    await assert.rejects(
      () => run.takeSpeedTurn(),
      new RegExp(`Port ${speedTurn} is in use by another program`),
    );
  });
});

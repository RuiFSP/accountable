// Lets the test runs on this computer share it, such as npm run check in two
// worktrees at once.
//
// Each run holds a slot by listening on the slot's port, and the slot reserves
// a block of ports for the run's servers. The operating system frees the port
// when the run ends, even after a crash, so there is no lock file to clean up.

import net from "node:net";

const HOST = "127.0.0.1";

/** The most test runs this computer will start at once. */
export const MAX_RUNS = 16;

// Clear of npm run dev's 5173 and npm start's 8000, of the ports tests used
// before slots, and of the ports the system hands out for connections.
const FIRST_SLOT_PORT = 20001;
const FIRST_SERVER_PORT = 20100;
const PORTS_PER_RUN = 4;

export const SLOT_PORTS = Array.from(
  { length: MAX_RUNS },
  (_, slot) => FIRST_SLOT_PORT + slot,
);

/** The web and API ports a run in this slot uses. */
export function portsFor(slot) {
  const webPort = FIRST_SERVER_PORT + slot * PORTS_PER_RUN;
  return { webPort, apiPort: webPort + 1 };
}

/** Whether something else can listen on this port. */
export function portIsFree(port, host = HOST) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", (error) => resolve(error.code !== "EADDRINUSE"));
    server.listen(port, host, () => server.close(() => resolve(true)));
  });
}

function listen(port, host) {
  return new Promise((resolve, reject) => {
    const server = net.createServer((socket) => socket.destroy());
    server.once("error", (error) => {
      if (error.code === "EADDRINUSE") {
        resolve(null);
      } else {
        reject(error);
      }
    });
    server.listen(port, host, () => resolve(server));
  });
}

function close(server) {
  return new Promise((resolve) => server.close(() => resolve()));
}

async function allFree(ports, host) {
  return (await Promise.all(ports.map((port) => portIsFree(port, host)))).every(
    Boolean,
  );
}

/**
 * Takes a slot for this run. A slot where another program has the slot's port,
 * or one of the run's server ports, is passed over.
 */
export async function claimTestRun({
  slotPorts = SLOT_PORTS,
  portsFor: portsAt = portsFor,
  host = HOST,
} = {}) {
  for (const [slot, slotPort] of slotPorts.entries()) {
    const server = await listen(slotPort, host);
    if (!server) {
      continue;
    }
    const ports = portsAt(slot);
    if (await allFree(Object.values(ports), host)) {
      return {
        slot,
        ...ports,
        leave: () => close(server),
      };
    }
    await close(server);
  }
  throw new Error(
    `There are already ${slotPorts.length} test runs on this computer, or another program is using their ports. Wait for one to finish and try again.`,
  );
}

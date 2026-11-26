// Where a test run's ports are, and how many runs this computer lets go at once.
//
// A run holds a slot by listening on the slot's port, and the slot reserves the
// web and API ports its servers use. The operating system frees them when the
// run ends, even after a crash, so there is no lock file to clean up. No more
// than TURNS runs go at once; the rest queue for a turn.

import net from "node:net";

export const HOST = "127.0.0.1";

/** Test runs on this computer at once, going or waiting, such as one per worktree. */
export const MAX_RUNS = 16;

/** Test runs that may go at once. More than two overload this computer and tests time out. */
export const TURNS = 2;

// Clear of npm run dev's 5173 and npm start's 8000, of the ports tests used
// before slots, and of the ports the system hands out for connections.
const FIRST_SLOT_PORT = 20001;
const FIRST_SERVER_PORT = 20100;
const PORTS_PER_RUN = 4;

// After every slot's server ports, so no port from before turns moved. The
// course guide names these ports for a run's turn to go.
const FIRST_TURN_PORT = 24113;

/** The speed tests' own turn, clear of the slots. */
export const SPEED_TURN_PORT = 20000;

export const SLOT_PORTS = Array.from(
  { length: MAX_RUNS },
  (_, slot) => FIRST_SLOT_PORT + slot,
);

/** The turns a run holds while its checks and end-to-end tests go. */
export const TURN_PORTS = Array.from(
  { length: TURNS },
  (_, turn) => FIRST_TURN_PORT + turn,
);

/** Every port the runs on this computer share it through. */
export const RUN_PORTS = {
  speedTurn: SPEED_TURN_PORT,
  slots: SLOT_PORTS,
  turns: TURN_PORTS,
};

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

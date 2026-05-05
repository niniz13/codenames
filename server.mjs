import { createServer } from "node:http";

import next from "next";

import { attachRoomServer } from "./room-server.mjs";

const dev = false;
const hostname = "localhost";
const listenHostname = "::";
const port = 3000;

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const handleUpgrade = app.getUpgradeHandler();

  const server = createServer((req, res) => {
    handle(req, res);
  });

  attachRoomServer(server, { path: "/ws" });

  server.on("upgrade", (req, socket, head) => {
    if (req.url?.startsWith("/ws")) {
      return;
    }

    handleUpgrade(req, socket, head);
  });

  server.listen(port, listenHostname, () => {
    console.log(`Next + WebSocket server ready on http://${hostname}:${port}`);
  });
});
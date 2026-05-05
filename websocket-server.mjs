import { createServer } from "node:http";

import { attachRoomServer } from "./room-server.mjs";

const port = 3001;
const listenHostname = "::";
const server = createServer((req, res) => {
  res.writeHead(200, { "content-type": "text/plain" });
  res.end("Codenames room websocket server");
});

attachRoomServer(server, { path: "/ws" });

server.listen(port, listenHostname, () => {
  console.log(`WebSocket room server listening on ws://localhost:${port}`);
});

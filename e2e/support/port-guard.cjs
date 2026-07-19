const net = require("node:net");

function isPortOccupied(host, port) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(1_000, () => {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(new Error(`Timed out while checking ${host}:${port}.`));
    });
    socket.once("connect", () => finish(true));
    socket.once("error", (error) => {
      if (error.code === "ECONNREFUSED") finish(false);
      else if (!settled) {
        settled = true;
        reject(error);
      }
    });
  });
}

async function assertPortAvailable(host, port, hint) {
  if (await isPortOccupied(host, port)) {
    throw new Error(`Port ${port} is already in use — ${hint}`);
  }
}

module.exports = { assertPortAvailable };

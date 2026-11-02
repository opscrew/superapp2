// superapp2: the upstream API superapp calls. It answers at once while traffic is light, and burns CPU as the
// request rate rises: none up to NORMAL_MAX_RPS, ramping linearly to a full core at SATURATED_RPS, and past it
// asking for more than a core can give (up to two), so it is saturated. Node runs on one thread, so requests queue
// behind the burning and callers see it as latency: some at first, then seconds and timeouts once saturated. Its memory use can
// still be driven up on demand (/hog), for the OOMKilled scenarios.
import http from "node:http";

const port = Number(process.env.PORT ?? 8080);
const normalMaxRps = Number(process.env.NORMAL_MAX_RPS ?? 3);
const saturatedRps = Number(process.env.SATURATED_RPS ?? 6);
if (!(saturatedRps > normalMaxRps)) throw new Error(`SATURATED_RPS (${saturatedRps}) must be above NORMAL_MAX_RPS (${normalMaxRps})`);

/** Requests per second, over the last WINDOW_MS. */
const WINDOW_MS = 2000;
const arrivals = [];
function rate(now) {
  while (arrivals.length > 0 && arrivals[0] <= now - WINDOW_MS) arrivals.shift();
  return arrivals.length / (WINDOW_MS / 1000);
}

/** The share of a core to burn at this rate: 0 up to normalMaxRps, a full core at saturatedRps, linear on to two. */
function load(rps) {
  return Math.min(2, Math.max(0, (rps - normalMaxRps) / (saturatedRps - normalMaxRps)));
}

/** Spins for ms milliseconds of CPU, computing something so it cannot be optimised away. */
function burn(ms) {
  const until = performance.now() + ms;
  let x = 0;
  while (performance.now() < until) x += Math.sqrt(x + 1);
  return x;
}

const hoard = [];

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === "/healthz") {
    res.writeHead(200, { "content-type": "text/plain" });
    return res.end("ok\n");
  }
  if (url.pathname === "/hog") {
    // Allocate and retain `mb` megabytes in large touched chunks so the container blows through its
    // memory limit fast enough for the kernel to OOM-kill it rather than thrash at the ceiling.
    const mb = Number(url.searchParams.get("mb") ?? 1024);
    const chunkMb = 64;
    for (let allocated = 0; allocated < mb; allocated += chunkMb) hoard.push(Buffer.alloc(chunkMb * 1024 * 1024, 1));
    res.writeHead(200, { "content-type": "text/plain" });
    return res.end(`hoarding ${hoard.length} MB\n`);
  }
  // Every other path is the API: what superapp asks for. A caller that gave up while this waited in the queue
  // gets nothing: doing its work anyway would keep the backlog growing long after the callers left.
  if (req.socket.destroyed) return;
  const now = performance.now();
  arrivals.push(now);
  const rps = rate(now);
  // Spread a share of a core over one second's requests: at a full core, each burns 1/rps of a second.
  const share = load(rps);
  if (share > 0) burn((share * 1000) / Math.max(rps, 1));
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ app: "superapp2", version: process.env.APP_VERSION ?? "dev", answer: Math.floor(Math.random() * 1000), at: new Date().toISOString() }) + "\n");
});

server.listen(port, () => console.log(`superapp2 listening on ${port} (normal up to ${normalMaxRps} rps, saturated from ${saturatedRps} rps)`));

// Node as a container's PID 1 has no default signal handlers: without these, a pod waits out its whole grace
// period before Kubernetes kills it. Stop taking connections, let those in flight finish, and exit.
function shutdown(signal) {
  console.log(`${signal}: shutting down`);
  server.close(() => process.exit(0));
  server.closeIdleConnections();
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

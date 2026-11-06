// The Lambda on http://localhost:8787 with an in-memory table, to try the game against it:
//   node server/dev/serve.mjs
// then, in another terminal, a dev server that uses it instead of the real Lambda (PowerShell):
//   $env:VITE_SCORE_API = "http://localhost:8787/"; npx vite --port 5174
import http from "node:http";
import { loadHandler } from "./local-lambda.mjs";

const handler = await loadHandler();

http
  .createServer(async (req, res) => {
    const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type", "access-control-allow-methods": "GET,POST" };
    if (req.method === "OPTIONS") return res.writeHead(204, cors).end();
    let body = "";
    for await (const chunk of req) body += chunk;
    const url = new URL(req.url, "http://x");
    const r = await handler({
      requestContext: { http: { method: req.method, sourceIp: "127.0.0.1" } },
      queryStringParameters: Object.fromEntries(url.searchParams),
      body,
    });
    res.writeHead(r.statusCode, { ...cors, ...r.headers }).end(r.body);
  })
  .listen(8787, () => console.log("listening 8787"));

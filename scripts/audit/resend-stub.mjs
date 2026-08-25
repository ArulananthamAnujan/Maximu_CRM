/**
 * A stand-in for the Resend API, covering the one call this CRM makes:
 * POST /emails. Records every send so a test can assert one actually
 * happened, and to whom, without paying for or depending on a live
 * provider.
 */
import http from "node:http";

const sent = [];

const server = http.createServer((req, res) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const send = (status, body) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
    };
    const url = new URL(req.url, "http://stub");

    if (req.method === "GET" && url.pathname === "/__sent") {
      return send(200, sent);
    }
    if (req.method === "POST" && url.pathname === "/__reset") {
      sent.length = 0;
      return send(200, { ok: true });
    }
    if (req.method !== "POST" || url.pathname !== "/emails")
      return send(404, { message: "not found" });

    const auth = req.headers.authorization || "";
    if (auth !== `Bearer ${process.env.RESEND_STUB_KEY || "stub-resend-key"}`)
      return send(401, { message: "invalid API key" });

    let body;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      return send(400, { message: "invalid JSON" });
    }
    if (!body.from || !Array.isArray(body.to) || !body.to.length || !body.subject)
      return send(400, { message: "malformed request" });

    sent.push(body);
    return send(200, { id: `stub_${sent.length}` });
  });
});

const port = Number(process.env.RESEND_STUB_PORT || 8096);
server.listen(port, "127.0.0.1", () =>
  console.log(`resend stub on http://127.0.0.1:${port}`),
);

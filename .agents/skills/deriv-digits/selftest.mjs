// Self-test for deriv-digits: node --test selftest.mjs
// Runs offline. The last tests start a small stand-in for Deriv on this
// computer (REST + WebSocket) and drive the real command line against it.

import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  STRATEGIES,
  STAKINGS,
  Session,
  analyse,
  verdict,
  backtest,
  simulate,
  breakEvenRate,
  lastDigit,
  decimalsFromPip,
  mulberry32,
  parseArgs,
  configFromArgs,
} from "./lib.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const fair = (n, seed = 3) => {
  const r = mulberry32(seed);
  return Array.from({ length: n }, () => Math.floor(r() * 10));
};
const E = 2;
const O = 3;

test("last digit keeps trailing zeros", () => {
  assert.equal(lastDigit(1234.5, 2), 0);
  assert.equal(lastDigit(1234.56, 2), 6);
  assert.equal(lastDigit(99, 2), 0);
  assert.equal(lastDigit(0.1234, 4), 4);
  assert.equal(lastDigit(1.2, 3), 0);
  assert.equal(decimalsFromPip(2), 2);
  assert.equal(decimalsFromPip(0.01), 2);
  assert.equal(decimalsFromPip(0.0001), 4);
});

test("fairness check: fair digits pass, rigged digits are flagged", () => {
  const a = analyse(fair(50000));
  assert.ok(Math.abs(a.evenZ) < 2.58 && a.chi2 < 21.67 && Math.abs(a.repeatZ) < 2.58);
  assert.equal(verdict(a, 0.5128).looksRandom, true);
  assert.equal(verdict(a, 0.5128).beatsBreakEven, false);
  const rigged = fair(50000).map((d, i) => (i % 5 === 0 ? 2 : d));
  assert.equal(verdict(analyse(rigged), 0.5128).looksRandom, false);
  const sticky = [];
  for (let i = 0; i < 20000; i++) sticky.push(i % 4 < 2 ? E : O);
  assert.ok(Math.abs(analyse(sticky).repeatZ) < 2.58); // EEOO: repeats exactly half the time
  const alt = Array.from({ length: 20000 }, (_, i) => (i % 2 ? E : O));
  assert.ok(analyse(alt).repeatZ < -50);
});

test("entry rules", () => {
  const ctx = { lastSide: null, lastWon: null };
  const mk = (name, o = {}) => STRATEGIES[name].make({ base: 100, ...o });
  assert.equal(mk("even")([1], ctx), "even");
  assert.equal(mk("alternate")([1], { lastSide: "even" }), "odd");
  assert.equal(mk("switch-on-loss")([1], { lastSide: "even", lastWon: false }), "odd");
  assert.equal(mk("switch-on-loss")([1], { lastSide: "even", lastWon: true }), "even");
  assert.equal(mk("streak-reverse", { streak: 3 })([O, E, E, E], ctx), "odd");
  assert.equal(mk("streak-reverse", { streak: 3 })([E, O, E, E], ctx), null);
  assert.equal(mk("streak-follow", { streak: 3 })([E, O, O, O], ctx), "odd");
  const mostlyEven = Array.from({ length: 100 }, (_, i) => (i < 60 ? E : O));
  assert.equal(mk("frequency-reverse")(mostlyEven, ctx), "odd");
  assert.equal(mk("frequency-follow")(mostlyEven, ctx), "even");
  assert.equal(mk("frequency-follow")(fair(100).map((d, i) => (i % 2 ? E : O)), ctx), null);
  assert.equal(mk("pattern", { pattern: "EEO", side: "even" })([O, E, E, O], ctx), "even");
  assert.equal(mk("pattern", { pattern: "EEO" })([E, E, E], ctx), null);
  assert.equal(mk("arm-trigger")([O, E], ctx), "even");
  assert.equal(mk("arm-trigger")([E, E], ctx), null);
  // after a 7 came an even tick three times running -> bet odd when 7 shows again
  assert.equal(mk("digit-follower")([7, 2, 7, 4, 7, 6, 7], ctx), "odd");
  assert.equal(mk("digit-follower")([7, 2, 7, 3, 7, 6, 7], ctx), null);
  // markov: in an alternating series, after E comes O
  const alt = Array.from({ length: 200 }, (_, i) => (i % 2 ? E : O));
  assert.equal(mk("markov", { order: 1 })(alt, ctx), "odd");
  assert.equal(mk("markov")(fair(30), ctx), null);
});

test("staking plans", () => {
  const seq = (name, results, o = {}) => {
    const p = STAKINGS[name].make({ base: 100, ...o });
    const out = [];
    for (const won of results) {
      const s = p.next();
      out.push(s);
      p.settle(won, s);
    }
    out.push(p.next());
    return out;
  };
  assert.deepEqual(seq("flat", [false, false, true]), [100, 100, 100, 100]);
  assert.deepEqual(seq("martingale", [false, false, false, true]), [100, 200, 400, 800, 100]);
  assert.deepEqual(seq("martingale", [false, false, false], { maxSteps: 2 }), [100, 200, 400, 100]);
  assert.deepEqual(seq("martingale", [false, false], { multiplier: 1.2 }), [100, 120, 144]);
  assert.deepEqual(seq("dalembert", [false, false, true, true, true]), [100, 200, 300, 200, 100, 100]);
  assert.deepEqual(seq("paroli", [true, true, true, true]), [100, 200, 400, 800, 100]);
  assert.deepEqual(seq("paroli", [true, false]), [100, 200, 100]);
  assert.deepEqual(seq("recovery", [false, false, true]), [100, 130, 299, 100]);
});

test("a session can never lose more than its stop-loss", () => {
  for (const staking of Object.keys(STAKINGS)) {
    for (let seed = 1; seed <= 40; seed++) {
      const s = new Session({
        strategy: "even",
        staking,
        options: { base: 100 },
        limits: { stopLoss: 1500, maxTrades: 500, maxStake: 100000 },
      });
      const r = mulberry32(seed);
      for (let i = 0; i < 2000; i++) {
        const d = s.decide([1]);
        if (d.action !== "bet") break;
        assert.ok(d.stake <= 1500 + s.pnl, "stake fits inside what is left of the stop-loss");
        const won = r() < 0.5;
        s.settle(won, won ? Math.round(d.stake * 0.95) : -d.stake);
      }
      assert.ok(s.pnl >= -1500, staking + " lost " + s.pnl);
      assert.ok(s.stopReason, "the session ended for a stated reason");
    }
  }
});

test("session limits: take-profit, max trades, max stake", () => {
  const mk = (limits, staking = "flat") =>
    new Session({ strategy: "even", staking, options: { base: 100 }, limits: { stopLoss: 100000, maxTrades: 1000, ...limits } });
  let s = mk({ takeProfit: 250 });
  for (let i = 0; i < 10; i++) {
    const d = s.decide([1]);
    if (d.action !== "bet") break;
    s.settle(true, 95);
  }
  assert.equal(s.trades, 3);
  assert.equal(s.stopReason, "take-profit reached");

  s = mk({ maxTrades: 4 });
  while (s.decide([1]).action === "bet") s.settle(false, -100);
  assert.equal(s.trades, 4);
  assert.equal(s.stopReason, "max trades reached");

  s = mk({ maxStake: 400 }, "martingale");
  const stakes = [];
  for (;;) {
    const d = s.decide([1]);
    if (d.action !== "bet") break;
    stakes.push(d.stake);
    s.settle(false, -d.stake);
  }
  assert.deepEqual(stakes, [100, 200, 400]);
  assert.match(s.stopReason, /above the max stake/);

  assert.throws(() => new Session({ options: { base: 100 }, limits: { maxTrades: 5 } }), /stop-loss/);
  assert.throws(() => new Session({ options: { base: 100 }, limits: { stopLoss: 100 } }), /max trades/);
  s = mk({});
  s.decide([1]);
  assert.throws(() => s.decide([1]), /not been settled/);
});

test("backtest arithmetic on a known series", () => {
  // all even digits: betting even always wins, betting odd always loses
  const digits = new Array(200).fill(4);
  const base = { options: { base: 100 }, limits: { stopLoss: 1000, maxTrades: 10 }, payoutRatio: 0.95, single: true };
  const win = backtest(digits, { ...base, strategy: "even" });
  assert.equal(win.total.trades, 10);
  assert.equal(win.total.pnl, 950);
  const lose = backtest(digits, { ...base, strategy: "odd" });
  assert.equal(lose.total.trades, 10);
  assert.equal(lose.total.pnl, -1000);
  const many = backtest(digits, { ...base, strategy: "odd", single: false });
  assert.ok(many.sessions.length > 5);
  assert.equal(many.ended.behind, many.sessions.length);
});

test("no rule beats a fair digit: every plan loses on average", () => {
  const ratio = 0.95;
  assert.ok(Math.abs(breakEvenRate(ratio) - 0.5128) < 0.0001);
  for (const strategy of Object.keys(STRATEGIES)) {
    const r = simulate({
      strategy,
      staking: "flat",
      options: { base: 100, streak: 3 },
      limits: { stopLoss: 100000, maxTrades: 100 },
      payoutRatio: ratio,
      sessions: 1500,
      warmup: 600,
      seed: 11,
    });
    assert.ok(r.trades > 5000, strategy + " placed too few bets to judge: " + r.trades);
    assert.ok(Math.abs(r.winRate - 0.5) < 0.012, strategy + " win rate " + r.winRate);
    assert.ok(r.returnOnStaked < 0, strategy + " made money on a fair digit");
  }
  for (const staking of Object.keys(STAKINGS)) {
    const r = simulate({
      strategy: "even",
      staking,
      options: { base: 100 },
      limits: { stopLoss: 5000, maxTrades: 200, maxStake: 5000 },
      payoutRatio: ratio,
      sessions: 4000,
      seed: 5,
    });
    assert.ok(r.meanPnl < 0, staking + " average " + r.meanPnl);
    assert.ok(r.worst >= -5000, staking + " broke the stop-loss: " + r.worst);
  }
});

test("flags", () => {
  const a = parseArgs(["run", "--stake", "1", "--stop-loss=10", "--max-trades", "20", "--real"]);
  assert.equal(a._[0], "run");
  assert.equal(a.real, true);
  const c = configFromArgs(a);
  assert.deepEqual(c.limits, { stopLoss: 1000, takeProfit: null, maxTrades: 20, maxStake: 100 });
  assert.throws(() => configFromArgs(parseArgs(["--stake", "1"])), /--stop-loss, --max-trades/);
  assert.throws(
    () => configFromArgs(parseArgs(["--stake", "1", "--stop-loss", "5", "--max-trades", "5", "--staking", "martingale"])),
    /--max-stake is required/,
  );
});

// ------------------------------------------------- a stand-in for Deriv ---

function frame(text) {
  const body = Buffer.from(text);
  const n = body.length;
  const head = n < 126 ? Buffer.from([0x81, n]) : n < 65536 ? Buffer.from([0x81, 126, n >> 8, n & 255]) : null;
  if (!head) {
    const h = Buffer.alloc(10);
    h[0] = 0x81;
    h[1] = 127;
    h.writeBigUInt64BE(BigInt(n), 2);
    return Buffer.concat([h, body]);
  }
  return Buffer.concat([head, body]);
}

function reader(onText, onClose) {
  let buf = Buffer.alloc(0);
  return (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    for (;;) {
      if (buf.length < 2) return;
      const op = buf[0] & 15;
      let len = buf[1] & 127;
      let off = 2;
      if (len === 126) {
        if (buf.length < 4) return;
        len = buf.readUInt16BE(2);
        off = 4;
      } else if (len === 127) {
        if (buf.length < 10) return;
        len = Number(buf.readBigUInt64BE(2));
        off = 10;
      }
      const masked = buf[1] & 128;
      if (buf.length < off + (masked ? 4 : 0) + len) return;
      const mask = masked ? buf.subarray(off, off + 4) : null;
      off += masked ? 4 : 0;
      const data = Buffer.from(buf.subarray(off, off + len));
      if (mask) for (let i = 0; i < data.length; i++) data[i] ^= mask[i % 4];
      buf = buf.subarray(off + len);
      if (op === 1) onText(data.toString());
      else if (op === 8) onClose();
    }
  };
}

// opts: accounts, payout (per 1 staked), refuseBuy, otpKind
async function fakeDeriv(opts = {}) {
  const seen = { auth: [], appId: [], buys: [], otpFor: [], paths: [] };
  const rng = mulberry32(opts.seed ?? 9);
  const price = () => 1000 + Math.floor(rng() * 100000) / 100;
  let epoch = 1790000000;
  const open = new Map(); // contract_id -> {side, stake, send, req}
  let nextContract = 501;

  const server = http.createServer((req, res) => {
    seen.paths.push(req.method + " " + req.url);
    seen.auth.push(req.headers.authorization);
    seen.appId.push(req.headers["deriv-app-id"]);
    const send = (code, body) => {
      res.writeHead(code, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (req.headers.authorization !== "Bearer test-token")
      return send(401, { errors: [{ status: 401, code: "Unauthorized", message: "bad token" }] });
    if (req.method === "GET" && req.url === "/trading/v1/options/accounts")
      return send(200, { data: opts.accounts ?? [
        { account_id: "DEMO1", balance: 10000, currency: "USD", group: "g", status: "active", account_type: "demo" },
        { account_id: "REAL1", balance: 250, currency: "USD", group: "g", status: "active", account_type: "real" },
      ] });
    const m = /^\/trading\/v1\/options\/accounts\/([^/]+)\/otp$/.exec(req.url);
    if (req.method === "POST" && m) {
      seen.otpFor.push(m[1]);
      const kind = opts.otpKind ?? (m[1].startsWith("REAL") ? "real" : "demo");
      return send(200, { data: { url: `ws://127.0.0.1:${server.address().port}/trading/v1/options/ws/${kind}?otp=abc` } });
    }
    send(404, { errors: [{ status: 404, code: "NotFound", message: "no such path" }] });
  });

  const sockets = new Set();
  server.on("upgrade", (req, socket) => {
    seen.paths.push("WS " + req.url);
    const accept = crypto.createHash("sha1").update(req.headers["sec-websocket-key"] + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
    socket.write("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: " + accept + "\r\n\r\n");
    sockets.add(socket);
    const send = (o) => socket.writable && socket.write(frame(JSON.stringify(o)));
    let ticker = null;
    const stop = () => {
      clearInterval(ticker);
      sockets.delete(socket);
      socket.destroy();
    };
    socket.on("error", stop);
    socket.on("close", stop);
    socket.on("data", reader((text) => {
      const q = JSON.parse(text);
      const base = { echo_req: q, req_id: q.req_id };
      if (q.ping) return send({ ...base, msg_type: "ping", ping: "pong" });
      if (q.ticks_history) {
        const n = Math.min(q.count, 5000);
        const prices = Array.from({ length: n }, price);
        const last = q.end === "latest" ? epoch : Number(q.end);
        const times = Array.from({ length: n }, (_, i) => last - n + 1 + i);
        return send({ ...base, msg_type: "history", pip_size: 2, history: { prices, times } });
      }
      if (q.proposal) {
        if (!q.underlying_symbol) return send({ ...base, msg_type: "proposal", error: { code: "InputValidationFailed", message: "Missing required parameter underlying_symbol" } });
        return send({ ...base, msg_type: "proposal", proposal: { id: "unary", ask_price: q.amount, payout: Math.round(q.amount * (1 + (opts.payout ?? 0.95)) * 100) / 100, spot: 1, spot_time: epoch, date_start: epoch, longcode: "x" } });
      }
      if (q.ticks) {
        send({ ...base, msg_type: "tick", tick: { quote: price(), epoch: ++epoch, pip_size: 2, symbol: q.ticks }, subscription: { id: "t1" } });
        ticker = setInterval(() => {
          const quote = price();
          const digit = lastDigit(quote, 2);
          for (const s of sockets) s.write(frame(JSON.stringify({ msg_type: "tick", tick: { quote, epoch: ++epoch, pip_size: 2, symbol: q.ticks }, subscription: { id: "t1" } })));
          for (const [id, c] of open) {
            if (!c.watching) continue;
            const won = (digit % 2 === 0) === (c.side === "DIGITEVEN");
            const profit = won ? Math.round(c.stake * (opts.payout ?? 0.95) * 100) / 100 : -c.stake;
            c.result = profit;
            open.delete(id);
            c.send({ msg_type: "proposal_open_contract", proposal_open_contract: { contract_id: id, is_sold: 1, status: won ? "won" : "lost", profit: profit.toFixed(2), buy_price: c.stake.toFixed(2) }, subscription: { id: "c" + id } });
          }
        }, 4);
        return;
      }
      if (q.buy) {
        if (!req.url.includes("/ws/demo") && !req.url.includes("/ws/real")) return send({ ...base, msg_type: "buy", error: { code: "Unauthorized", message: "login required" } });
        seen.buys.push({ ...q, via: req.url });
        if (opts.refuseBuy && seen.buys.length >= opts.refuseBuy) return send({ ...base, msg_type: "buy", error: { code: "InsufficientBalance", message: "not enough funds" } });
        const id = nextContract++;
        open.set(id, { side: q.parameters.contract_type, stake: q.parameters.amount, send, watching: false });
        return send({ ...base, msg_type: "buy", buy: { contract_id: id, buy_price: q.price, payout: q.price * 1.95, balance_after: 1, longcode: "x", shortcode: "x", purchase_time: epoch, start_time: epoch, transaction_id: id } });
      }
      if (q.proposal_open_contract) {
        const c = open.get(q.contract_id);
        if (c) c.watching = true;
        return send({ ...base, msg_type: "proposal_open_contract", proposal_open_contract: { contract_id: q.contract_id, is_sold: 0, status: "open", profit: "0.00" }, subscription: { id: "c" + q.contract_id } });
      }
      if (q.forget) return send({ ...base, msg_type: "forget", forget: 1 });
      send({ ...base, error: { code: "UnrecognisedRequest", message: "unknown call" } });
    }, stop));
  });

  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  return {
    seen,
    env: { DERIV_TEST_REST: `http://127.0.0.1:${port}`, DERIV_TEST_WS: `ws://127.0.0.1:${port}/trading/v1/options/ws/public` },
    close: () => {
      for (const s of sockets) s.destroy();
      return new Promise((r) => server.close(r));
    },
  };
}

function cli(args, env, input) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "deriv-digits-"));
  return new Promise((resolve) => {
    const clean = { ...process.env };
    for (const k of Object.keys(clean)) if (/^(DERIV_|https?_proxy$|HTTPS?_PROXY$|NODE_USE_ENV_PROXY$)/.test(k)) delete clean[k];
    const p = spawn(process.execPath, [path.join(HERE, "deriv.mjs"), ...args], { cwd, env: { ...clean, ...env } });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    if (input != null) p.stdin.end(input);
    else p.stdin.end();
    p.on("close", (code) => resolve({ code, out, err, cwd }));
  });
}

test("end to end: market data commands against the stand-in", async () => {
  const d = await fakeDeriv();
  try {
    let r = await cli(["payout"], d.env);
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /Break-even win rate: 51\.28%/);
    r = await cli(["ticks", "--count", "12000", "--save", "t.json"], d.env);
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /12000 ticks/);
    assert.match(r.out, /looks like a fair random digit/);
    const saved = JSON.parse(fs.readFileSync(path.join(r.cwd, "t.json"), "utf8"));
    assert.equal(saved.digits.length, 12000);
    assert.ok(saved.digits.includes(0), "trailing zeros survive");
    r = await cli(["backtest", "--file", path.join(r.cwd, "t.json"), "--payout", "0.95", "--strategy", "streak-reverse", "--stake", "1", "--stop-loss", "20", "--max-trades", "50"], {});
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /sessions back to back/);
    r = await cli(["simulate", "--payout", "0.95", "--staking", "martingale", "--max-stake", "16", "--stake", "1", "--stop-loss", "31", "--max-trades", "100", "--sessions", "2000"], {});
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /average result -/);
    r = await cli(["backtest", "--payout", "0.95", "--stake", "1"], {});
    assert.equal(r.code, 1);
    assert.match(r.err, /required: --stop-loss, --max-trades/);
  } finally {
    await d.close();
  }
});

test("end to end: a demo run stops inside its limits and logs every trade", async () => {
  const d = await fakeDeriv();
  try {
    const r = await cli(["run", "--strategy", "even", "--staking", "martingale", "--stake", "1", "--max-stake", "8", "--stop-loss", "12", "--take-profit", "3", "--max-trades", "40"], { ...d.env, DERIV_TOKEN: "test-token", DERIV_APP_ID: "12345" });
    assert.equal(r.code, 0, r.err + r.out);
    assert.match(r.out, /DEMO account DEMO1/);
    assert.match(r.out, /Stopped: /);
    assert.deepEqual(d.seen.otpFor, ["DEMO1"]);
    assert.ok(d.seen.buys.length > 0 && d.seen.buys.length <= 40);
    for (const b of d.seen.buys) {
      assert.match(b.via, /\/ws\/demo/);
      assert.equal(b.buy, "1");
      assert.equal(b.price, b.parameters.amount);
      assert.ok(b.parameters.amount <= 8);
      assert.equal(b.parameters.underlying_symbol, "1HZ100V");
      assert.equal(b.parameters.contract_type, "DIGITEVEN");
      assert.equal(b.parameters.duration, 1);
      assert.equal(b.parameters.duration_unit, "t");
      assert.equal(b.parameters.basis, "stake");
    }
    const dir = path.join(r.cwd, "deriv", "sessions");
    const lines = fs.readFileSync(path.join(dir, fs.readdirSync(dir)[0]), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    const trades = lines.filter((l) => l.event === "trade");
    assert.equal(trades.length, d.seen.buys.length);
    const end = lines.at(-1);
    assert.equal(end.event, "end");
    assert.ok(end.pnl >= -12, "lost " + end.pnl);
    assert.ok(Math.abs(trades.reduce((s, t) => s + t.profit, 0) - end.pnl) < 0.005);
    assert.ok(!JSON.stringify(lines).includes("test-token"), "the token is not in the log");
    assert.ok(d.seen.appId.every((x) => x === "12345"));
  } finally {
    await d.close();
  }
});

test("end to end: real money needs --real, a terminal and a typed phrase", async () => {
  const d = await fakeDeriv();
  try {
    const args = ["run", "--stake", "1", "--stop-loss", "5", "--max-trades", "5", "--real"];
    const r = await cli(args, { ...d.env, DERIV_TOKEN: "test-token" }, "REAL 5.00\n");
    assert.equal(r.code, 1);
    assert.match(r.err, /started by a person at a terminal/);
    assert.equal(d.seen.buys.length, 0);
    assert.deepEqual(d.seen.otpFor, []);
  } finally {
    await d.close();
  }
});

test("end to end: refusals", async () => {
  let d = await fakeDeriv({ refuseBuy: 2 });
  try {
    const r = await cli(["run", "--stake", "1", "--stop-loss", "50", "--max-trades", "30"], { ...d.env, DERIV_TOKEN: "test-token" });
    assert.equal(r.code, 1);
    assert.match(r.err, /InsufficientBalance/);
    assert.equal(d.seen.buys.length, 2, "a refused buy is not retried");
  } finally {
    await d.close();
  }
  d = await fakeDeriv({ accounts: [{ account_id: "REAL1", balance: 250, currency: "USD", group: "g", status: "active", account_type: "real" }] });
  try {
    let r = await cli(["run", "--stake", "1", "--stop-loss", "5", "--max-trades", "5"], { ...d.env, DERIV_TOKEN: "test-token" });
    assert.equal(r.code, 1);
    assert.match(r.err, /no active demo account/);
    r = await cli(["run", "--stake", "1", "--stop-loss", "5", "--max-trades", "5"], { ...d.env, DERIV_TOKEN: "wrong" });
    assert.match(r.err, /Deriv said 401/);
    r = await cli(["accounts"], d.env);
    assert.match(r.err, /DERIV_TOKEN is not set/);
    assert.equal(d.seen.buys.length, 0);
  } finally {
    await d.close();
  }
  d = await fakeDeriv({ accounts: [{ account_id: "DEMO1", balance: 3, currency: "USD", group: "g", status: "active", account_type: "demo" }] });
  try {
    const r = await cli(["run", "--stake", "1", "--stop-loss", "5", "--max-trades", "5"], { ...d.env, DERIV_TOKEN: "test-token" });
    assert.match(r.err, /stop-loss is larger than the account balance/);
  } finally {
    await d.close();
  }
});

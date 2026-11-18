#!/usr/bin/env node
// deriv-digits: Even/Odd on Deriv synthetic indices. Node 22 or newer, no
// packages to install.
//
//   node deriv.mjs strategies                      the entry rules and staking plans
//   node deriv.mjs ticks --count 20000 --save t.json   real digits + fairness check
//   node deriv.mjs payout                          what a win pays, break-even rate
//   node deriv.mjs backtest ...                    replay one plan on real digits
//   node deriv.mjs compare ...                     every rule x every staking plan
//   node deriv.mjs simulate ...                    10,000 sittings on a fair digit
//   node deriv.mjs accounts                        your Deriv accounts (needs a token)
//   node deriv.mjs run ...                         trade it, demo account by default
//
// Every plan needs --stake, --stop-loss and --max-trades.
// The token is read from DERIV_TOKEN (and DERIV_APP_ID for a personal access
// token). It is sent to api.derivws.com only and is never written to disk.

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import {
  CONTRACT,
  STRATEGIES,
  STAKINGS,
  Session,
  analyse,
  verdict,
  backtest,
  simulate,
  breakEvenRate,
  cents,
  money,
  decimalsFromPip,
  lastDigit,
  parseArgs,
  configFromArgs,
} from "./lib.mjs";

const REST = process.env.DERIV_TEST_REST || "https://api.derivws.com";
const WS_PUBLIC =
  process.env.DERIV_TEST_WS || "wss://api.derivws.com/trading/v1/options/ws/public";
const TESTING = Boolean(process.env.DERIV_TEST_REST || process.env.DERIV_TEST_WS);
const DEFAULT_SYMBOL = "1HZ100V"; // Volatility 100 (1s) Index
const PAGE = 5000;

const pct = (x, d = 2) => (x * 100).toFixed(d) + "%";
const say = (...a) => console.log(...a);

// ---------------------------------------------------------------- socket ---

export class Socket {
  constructor(url, label) {
    this.url = url;
    this.label = label;
    this.nextId = 1;
    this.waiting = new Map();
    this.listeners = new Map();
    this.closed = false;
    this.onclose = null;
  }

  open(timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(this.label + ": connection timed out")), timeoutMs);
      this.ws = new WebSocket(this.url);
      this.ws.onopen = () => {
        clearTimeout(timer);
        this.pinger = setInterval(() => this.sendRaw({ ping: 1 }), 30000);
        resolve(this);
      };
      this.ws.onerror = () => {
        clearTimeout(timer);
        reject(new Error(this.label + ": could not connect"));
      };
      this.ws.onclose = () => {
        this.closed = true;
        clearInterval(this.pinger);
        for (const w of this.waiting.values()) w.reject(new Error(this.label + ": connection closed"));
        this.waiting.clear();
        if (this.onclose) this.onclose();
      };
      this.ws.onmessage = (ev) => {
        let msg;
        try {
          msg = JSON.parse(String(ev.data));
        } catch {
          return;
        }
        const w = msg.req_id != null ? this.waiting.get(msg.req_id) : null;
        if (w) {
          this.waiting.delete(msg.req_id);
          clearTimeout(w.timer);
          if (msg.error) w.reject(apiError(msg.error));
          else w.resolve(msg);
          return;
        }
        const fn = this.listeners.get(msg.msg_type);
        if (fn) fn(msg);
      };
    });
  }

  sendRaw(obj) {
    if (!this.closed && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj));
  }

  // one request, one reply (matched by req_id); later messages of a
  // subscription go to on(msg_type)
  request(obj, timeoutMs = 20000) {
    return new Promise((resolve, reject) => {
      if (this.closed) return reject(new Error(this.label + ": connection closed"));
      const req_id = this.nextId++;
      const timer = setTimeout(() => {
        this.waiting.delete(req_id);
        reject(new Error(this.label + ": no reply to " + Object.keys(obj)[0]));
      }, timeoutMs);
      this.waiting.set(req_id, { resolve, reject, timer });
      this.sendRaw({ ...obj, req_id });
    });
  }

  on(msgType, fn) {
    this.listeners.set(msgType, fn);
  }

  close() {
    this.closed = true;
    clearInterval(this.pinger);
    try {
      this.ws.close();
    } catch {}
  }
}

function apiError(e) {
  const err = new Error((e.code ? e.code + ": " : "") + (e.message || "error from Deriv"));
  err.code = e.code;
  return err;
}

// ----------------------------------------------------------- market data ---

async function fetchTicks(sock, symbol, count) {
  let prices = [];
  let times = [];
  let end = "latest";
  let decimals = null;
  while (prices.length < count) {
    const want = Math.min(PAGE, count - prices.length);
    const r = await sock.request({ ticks_history: symbol, count: want, end: String(end), style: "ticks" });
    const h = r.history || {};
    if (decimals == null && r.pip_size != null) decimals = decimalsFromPip(r.pip_size);
    if (!h.prices || !h.prices.length) break;
    prices = h.prices.concat(prices);
    times = h.times.concat(times);
    if (h.prices.length < want) break;
    const next = Number(h.times[0]) - 1;
    if (!(next > 0) || next === end) break;
    end = next;
  }
  if (decimals == null) decimals = 2;
  return { symbol, decimals, prices, times, digits: prices.map((p) => lastDigit(p, decimals)) };
}

async function fetchPayout(sock, symbol, currency, stake) {
  const out = {};
  for (const side of ["even", "odd"]) {
    const r = await sock.request({
      proposal: 1,
      amount: stake,
      basis: "stake",
      contract_type: CONTRACT[side],
      currency,
      duration: 1,
      duration_unit: "t",
      underlying_symbol: symbol,
    });
    out[side] = { ask: Number(r.proposal.ask_price), payout: Number(r.proposal.payout) };
  }
  const ratio = Math.min(out.even.payout / out.even.ask, out.odd.payout / out.odd.ask) - 1;
  return { ...out, ratio };
}

function loadDigits(file) {
  const j = JSON.parse(fs.readFileSync(file, "utf8"));
  if (Array.isArray(j)) return { digits: j, symbol: "file" };
  if (Array.isArray(j.digits)) return j;
  throw new Error(file + " has no digits");
}

async function getDigits(a) {
  if (a.file) return loadDigits(a.file);
  const sock = await new Socket(WS_PUBLIC, "market data").open();
  try {
    return await fetchTicks(sock, a.symbol || DEFAULT_SYMBOL, Number(a.count || 20000));
  } finally {
    sock.close();
  }
}

// A win's profit per 1 staked: --payout 0.95, or asked from Deriv.
async function getPayoutRatio(a, stakeCents) {
  if (a.payout !== undefined && a.payout !== true) {
    const r = Number(a.payout);
    if (!(r > 0 && r < 1)) throw new Error("--payout is the profit per 1 staked on a win, like 0.95");
    return r;
  }
  const sock = await new Socket(WS_PUBLIC, "market data").open();
  try {
    const p = await fetchPayout(sock, a.symbol || DEFAULT_SYMBOL, a.currency || "USD", stakeCents / 100);
    return p.ratio;
  } finally {
    sock.close();
  }
}

// ------------------------------------------------------------------ REST ---

function authHeaders() {
  const token = process.env.DERIV_TOKEN;
  if (!token)
    throw new Error(
      "DERIV_TOKEN is not set. Create a token with the trade scope in your Deriv account and export it in your shell. Never paste it into a chat.",
    );
  const h = { Authorization: "Bearer " + token, "Content-Type": "application/json" };
  if (process.env.DERIV_APP_ID) h["Deriv-App-ID"] = process.env.DERIV_APP_ID;
  return h;
}

async function rest(method, pathname) {
  const res = await fetch(REST + pathname, { method, headers: authHeaders() });
  let body = null;
  try {
    body = await res.json();
  } catch {}
  if (!res.ok) {
    const e = body && body.errors && body.errors[0];
    throw new Error("Deriv said " + res.status + (e ? " " + (e.code || "") + ": " + e.message : ""));
  }
  return body;
}

const listAccounts = async () => (await rest("GET", "/trading/v1/options/accounts")).data || [];

async function otpUrl(accountId) {
  const r = await rest("POST", "/trading/v1/options/accounts/" + encodeURIComponent(accountId) + "/otp");
  const url = r && r.data && r.data.url;
  if (!url) throw new Error("Deriv did not return a trading connection");
  return url;
}

// -------------------------------------------------------------- commands ---

function cmdStrategies() {
  say("Entry rules (--strategy):");
  for (const [k, v] of Object.entries(STRATEGIES)) say("  " + k.padEnd(18) + v.about);
  say("\nStaking plans (--staking):");
  for (const [k, v] of Object.entries(STAKINGS)) say("  " + k.padEnd(18) + v.about);
  say("\nNone of these changes the odds of a random digit. Run compare and simulate to see it.");
}

function printAnalysis(t, breakEven) {
  const a = analyse(t.digits);
  say(`${t.symbol}: ${a.n} ticks`);
  say("digit   " + a.counts.map((_, i) => String(i).padStart(6)).join(""));
  say("count   " + a.counts.map((c) => String(c).padStart(6)).join(""));
  say(`even share            ${pct(a.evenShare)}   (z ${a.evenZ.toFixed(2)}; beyond +-2.58 would be unusual)`);
  say(`spread over digits    chi2 ${a.chi2.toFixed(2)}   (above 21.67 would be unusual)`);
  say(`same parity twice     ${pct(a.repeatShare)}   (z ${a.repeatZ.toFixed(2)})`);
  say(`longest streak        ${a.longestStreak}   (about ${a.expectedLongestStreak.toFixed(0)} expected by chance)`);
  const v = verdict(a, breakEven);
  if (v.looksRandom) say("Verdict: nothing here that a rule could use. It looks like a fair random digit.");
  else say("Verdict: unusual: " + v.flags.join("; ") + ". Fetch more ticks and check again before believing it.");
  if (breakEven != null)
    say(
      `Best share seen ${pct(v.bestObservedShare)} against the ${pct(breakEven)} needed to break even: ` +
        (v.beatsBreakEven ? "above it in this sample (expect that to vanish in a fresh sample)." : "below it."),
    );
  return a;
}

async function cmdTicks(a) {
  const t = await getDigits(a);
  if (a.save) {
    fs.writeFileSync(a.save, JSON.stringify(t));
    say("saved " + t.digits.length + " ticks to " + a.save);
  }
  printAnalysis(t, a.payout ? breakEvenRate(Number(a.payout)) : null);
}

async function cmdPayout(a) {
  const stake = Number(a.stake || 1);
  const sock = await new Socket(WS_PUBLIC, "market data").open();
  try {
    const p = await fetchPayout(sock, a.symbol || DEFAULT_SYMBOL, a.currency || "USD", stake);
    for (const s of ["even", "odd"])
      say(`${s.padEnd(5)} stake ${p[s].ask.toFixed(2)}  payout ${p[s].payout.toFixed(2)}  profit on a win ${(p[s].payout - p[s].ask).toFixed(2)}`);
    printEdge(p.ratio);
  } finally {
    sock.close();
  }
}

function printEdge(ratio) {
  say(`A win pays ${pct(ratio)} of the stake; a loss costs all of it.`);
  say(`Break-even win rate: ${pct(breakEvenRate(ratio))}. A fair digit wins 50.00%.`);
  say(`Expected result: ${pct((ratio - 1) / 2)} of everything staked, whatever the rule.`);
}

function describe(cfg) {
  const L = cfg.limits;
  return (
    `${cfg.strategy} / ${cfg.staking}, stake ${money(cfg.options.base)}, stop-loss ${money(L.stopLoss)}, ` +
    `take-profit ${L.takeProfit == null ? "none" : money(L.takeProfit)}, max ${L.maxTrades} trades, max stake ${money(L.maxStake)}`
  );
}

async function cmdBacktest(a) {
  const cfg = configFromArgs(a);
  const ratio = await getPayoutRatio(a, cfg.options.base);
  const t = await getDigits(a);
  say(describe(cfg));
  printEdge(ratio);
  const r = backtest(t.digits, { ...cfg, payoutRatio: ratio, warmup: Number(a.warmup || 500) });
  const T = r.total;
  say(`\n${t.symbol}: ${t.digits.length} ticks, ${r.sessions.length} sessions back to back`);
  say(`trades ${T.trades}, won ${pct(T.winRate)}, staked ${money(T.staked)}, result ${money(T.pnl)} (${pct(T.returnOnStaked)} of staked)`);
  say(`sessions ahead ${r.ended.ahead}, behind ${r.ended.behind}, level ${r.ended.flat}; largest stake ${money(T.largestStake)}, deepest drop ${money(T.maxDrawdown)}`);
  say("One stretch of history is one draw of luck. Run simulate for the long-run picture.");
}

async function cmdCompare(a) {
  const base = configFromArgs({ ...a, maxStake: a.maxStake ?? a.stopLoss });
  const ratio = await getPayoutRatio(a, base.options.base);
  const t = await getDigits(a);
  printEdge(ratio);
  say(`\n${t.symbol}: ${t.digits.length} real ticks, then 2,000 simulated sittings of each plan.`);
  say("rule".padEnd(19) + "staking".padEnd(12) + "trades".padStart(7) + "won".padStart(8) + "real result".padStart(13) + "sim: ahead".padStart(12) + "sim avg".padStart(10));
  for (const strategy of Object.keys(STRATEGIES)) {
    for (const staking of Object.keys(STAKINGS)) {
      const cfg = { ...base, strategy, staking, payoutRatio: ratio };
      const r = backtest(t.digits, { ...cfg, warmup: 500 }).total;
      const s = simulate({ ...cfg, sessions: 2000, warmup: 500, seed: 7 });
      say(
        strategy.padEnd(19) + staking.padEnd(12) + String(r.trades).padStart(7) + pct(r.winRate, 1).padStart(8) +
          money(r.pnl).padStart(13) + pct(s.ahead, 0).padStart(12) + money(s.meanPnl).padStart(10),
      );
    }
  }
  say("\n'real result' is luck on one stretch of history and changes with every fetch.");
  say("'sim avg' is the average result of one sitting. It is negative for every row, and that is the part that repeats.");
}

async function cmdSimulate(a) {
  const cfg = configFromArgs(a);
  const ratio = await getPayoutRatio(a, cfg.options.base);
  say(describe(cfg));
  printEdge(ratio);
  const n = Number(a.sessions || 10000);
  const s = simulate({ ...cfg, payoutRatio: ratio, sessions: n, seed: Number(a.seed || 1), warmup: 500 });
  say(`\n${n} sittings on a fair random digit:`);
  say(`ended ahead ${pct(s.ahead, 1)}, ended behind ${pct(s.behind, 1)}`);
  say(`average result ${money(s.meanPnl)} per sitting, median ${money(s.medianPnl)}`);
  say(`worst ${money(s.worst)}, 1 in 20 worse than ${money(s.p5)}, 1 in 20 better than ${money(s.p95)}, best ${money(s.best)}`);
  say(`all sittings together: ${s.trades} trades, won ${pct(s.winRate)}, staked ${money(s.staked)}, result ${money(Math.round(s.meanPnl * n))} (${pct(s.returnOnStaked)} of staked)`);
  say(`largest single stake ${money(s.largestStake)}`);
}

async function cmdAccounts() {
  const acc = await listAccounts();
  if (!acc.length) return say("No options trading accounts on this token.");
  for (const x of acc) say(`${x.account_id}  ${x.account_type.padEnd(5)} ${x.status.padEnd(8)} ${Number(x.balance).toFixed(2)} ${x.currency}`);
}

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (ans) => (rl.close(), resolve(ans))));
}

async function cmdRun(a) {
  const cfg = configFromArgs(a);
  const symbol = a.symbol || DEFAULT_SYMBOL;
  const real = a.real === true;

  const accounts = (await listAccounts()).filter((x) => x.status === "active");
  const want = real ? "real" : "demo";
  let pool = accounts.filter((x) => x.account_type === want);
  if (a.account) pool = pool.filter((x) => x.account_id === a.account);
  if (!pool.length) throw new Error("no active " + want + " account" + (a.account ? " with id " + a.account : "") + " on this token");
  if (pool.length > 1) throw new Error("more than one " + want + " account: pick one with --account (" + pool.map((x) => x.account_id).join(", ") + ")");
  const account = pool[0];
  if (account.account_type !== want) throw new Error("account type mismatch");
  const currency = account.currency;

  const market = await new Socket(WS_PUBLIC, "market data").open();
  let trading = null;
  const logFile = path.join("deriv", "sessions", new Date().toISOString().replace(/[:.]/g, "-") + ".jsonl");
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  const log = (o) => fs.appendFileSync(logFile, JSON.stringify({ at: new Date().toISOString(), ...o }) + "\n");

  try {
    const p = await fetchPayout(market, symbol, currency, cfg.options.base / 100);
    say(`${want.toUpperCase()} account ${account.account_id}, balance ${Number(account.balance).toFixed(2)} ${currency}`);
    say(`${symbol}: ${describe(cfg)}`);
    printEdge(p.ratio);
    if (cfg.limits.stopLoss > cents(Number(account.balance))) throw new Error("the stop-loss is larger than the account balance");

    if (real) {
      if (!process.stdin.isTTY) throw new Error("a real-money run must be started by a person at a terminal");
      const phrase = "REAL " + money(cfg.limits.stopLoss);
      say(`\nThis uses real money. The most this run can lose is ${money(cfg.limits.stopLoss)} ${currency}.`);
      const ans = await ask(`Type "${phrase}" to start, anything else to cancel: `);
      if (ans.trim() !== phrase) return say("Cancelled. Nothing was placed.");
    }

    const url = await otpUrl(account.account_id);
    if (!TESTING) {
      const u = new URL(url);
      if (u.hostname !== "api.derivws.com") throw new Error("unexpected trading host: " + u.hostname);
      if (!u.pathname.endsWith("/ws/" + want)) throw new Error("Deriv returned a " + u.pathname + " connection, expected " + want + ". Nothing was placed.");
    }
    trading = await new Socket(url, "trading").open();

    const hist = await fetchTicks(market, symbol, Number(a.warmup || 1000));
    const digits = hist.digits;
    let decimals = hist.decimals;
    const session = new Session(cfg);
    log({ event: "start", account: account.account_id, type: want, symbol, cfg, payoutRatio: p.ratio });

    let stopping = null;
    process.on("SIGINT", () => {
      if (stopping) process.exit(130);
      stopping = "stopped by you";
      say("\nStopping after the open contract settles. Press Ctrl-C again to quit now.");
    });

    await new Promise((resolve, reject) => {
      let busy = false;
      const finish = (reason) => {
        if (reason && !session.stopReason) session.stopReason = reason;
        resolve();
      };
      market.onclose = () => (busy ? (stopping = "market data connection lost") : finish("market data connection lost"));
      trading.onclose = () =>
        busy
          ? reject(new Error("trading connection lost with a contract open. Check your Deriv statement before doing anything else."))
          : finish("trading connection lost");

      market.on("tick", async (msg) => {
        const tick = msg.tick;
        if (!tick || tick.quote == null) return;
        if (tick.pip_size != null) decimals = decimalsFromPip(tick.pip_size);
        digits.push(lastDigit(tick.quote, decimals));
        if (digits.length > 5000) digits.shift();
        if (busy) return;
        if (stopping) return finish(stopping);
        const d = session.decide(digits);
        if (d.action === "stop") return finish();
        if (d.action === "skip") return;
        busy = true;
        try {
          const stake = d.stake / 100;
          const bought = await trading.request({
            buy: "1",
            price: stake,
            parameters: {
              amount: stake,
              basis: "stake",
              contract_type: CONTRACT[d.side],
              currency,
              duration: 1,
              duration_unit: "t",
              underlying_symbol: symbol,
            },
          });
          const b = bought.buy;
          const result = await waitForResult(trading, b.contract_id);
          const profit = cents(Number(result.profit));
          const won = result.status ? result.status === "won" : profit > 0;
          session.settle(won, profit);
          log({ event: "trade", n: session.trades, side: d.side, stake, contract_id: b.contract_id, won, profit: profit / 100, pnl: session.pnl / 100 });
          say(`#${String(session.trades).padStart(3)} ${d.side.padEnd(4)} stake ${money(d.stake)}  ${won ? "won " : "lost"} ${money(profit).padStart(7)}   session ${money(session.pnl)}`);
          busy = false;
        } catch (e) {
          // A buy is never retried: after an error we cannot be sure what
          // happened, so the session ends here.
          session.cancel();
          log({ event: "error", message: e.message });
          reject(new Error(e.message + ". The session stopped; check your Deriv statement for the last contract."));
        }
      });

      market.request({ ticks: symbol, subscribe: 1 }).catch(reject);
    });

    const s = session.summary();
    log({ event: "end", ...s, pnl: s.pnl / 100, staked: s.staked / 100 });
    say(`\nStopped: ${s.stopReason}`);
    say(`trades ${s.trades}, won ${pct(s.winRate)} (break-even ${pct(breakEvenRate(p.ratio))}), staked ${money(s.staked)}, result ${money(s.pnl)} ${currency}`);
    say("log: " + logFile);
  } finally {
    market.close();
    if (trading) trading.close();
  }
}

// Follows one contract until Deriv says it is settled.
function waitForResult(sock, contractId, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("no result for contract " + contractId + " after a minute")), timeoutMs);
    const check = (msg) => {
      const c = msg.proposal_open_contract;
      if (!c || c.contract_id !== contractId) return;
      if (c.is_sold || c.status === "won" || c.status === "lost") {
        clearTimeout(timer);
        sock.on("proposal_open_contract", () => {});
        if (c.subscriptionId || (msg.subscription && msg.subscription.id))
          sock.sendRaw({ forget: msg.subscription ? msg.subscription.id : c.id });
        resolve(c);
      }
    };
    sock.on("proposal_open_contract", check);
    sock
      .request({ proposal_open_contract: 1, contract_id: contractId, subscribe: 1 })
      .then(check)
      .catch((e) => {
        clearTimeout(timer);
        reject(e);
      });
  });
}

// ------------------------------------------------------------------ main ---

const COMMANDS = {
  strategies: cmdStrategies,
  ticks: cmdTicks,
  payout: cmdPayout,
  backtest: cmdBacktest,
  compare: cmdCompare,
  simulate: cmdSimulate,
  accounts: cmdAccounts,
  run: cmdRun,
};

async function main() {
  const a = parseArgs(process.argv.slice(2));
  const cmd = a._[0];
  if (!cmd || !COMMANDS[cmd]) {
    say("usage: node deriv.mjs <" + Object.keys(COMMANDS).join("|") + "> [--flags]");
    say("every plan needs --stake, --stop-loss and --max-trades; see SKILL.md");
    process.exit(cmd ? 2 : 0);
  }
  await COMMANDS[cmd](a);
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error("error: " + e.message);
    process.exit(1);
  },
);

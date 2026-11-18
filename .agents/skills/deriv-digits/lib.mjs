// deriv-digits: pure logic (no network). Digits, fairness statistics, entry
// rules, staking plans, a session engine with hard limits, a backtester and a
// Monte Carlo simulator. Used by deriv.mjs and by selftest.mjs.
//
// Parity convention: a digit is "even" when digit % 2 === 0.

export const SIDES = ["even", "odd"];
export const CONTRACT = { even: "DIGITEVEN", odd: "DIGITODD" };

export const cents = (x) => Math.round(x * 100);
export const money = (c) => (c / 100).toFixed(2);

// ---------------------------------------------------------------- digits ---

// Deriv sends prices as JSON numbers, so 1234.50 arrives as 1234.5. The last
// digit only exists once the price is written with the symbol's decimals.
export function decimalsFromPip(pip) {
  const p = Number(pip);
  if (!Number.isFinite(p) || p < 0) throw new Error("bad pip_size: " + pip);
  if (p >= 1 || p === 0) return Math.round(p); // 2 means two decimals
  return Math.round(-Math.log10(p)); // 0.01 means two decimals
}

export function lastDigit(price, decimals) {
  const s = Number(price).toFixed(decimals);
  return s.charCodeAt(s.length - 1) - 48;
}

export const parityOf = (digit) => (digit % 2 === 0 ? "even" : "odd");
export const other = (side) => (side === "even" ? "odd" : "even");

// ------------------------------------------------------------------- rng ---

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ----------------------------------------------------------------- stats ---

// Is there anything in these digits a strategy could use? Three checks:
// the even share, the spread over the ten digits, and whether the parity of
// one tick says anything about the next.
export function analyse(digits) {
  const n = digits.length;
  const counts = new Array(10).fill(0);
  for (const d of digits) counts[d]++;
  const even = counts[0] + counts[2] + counts[4] + counts[6] + counts[8];
  const evenShare = n ? even / n : 0;
  const evenZ = n ? (even - n / 2) / Math.sqrt(n / 4) : 0;

  let chi2 = 0;
  for (const c of counts) chi2 += n ? (c - n / 10) ** 2 / (n / 10) : 0;

  // next-tick parity given this tick's parity
  const t = { even: { even: 0, odd: 0 }, odd: { even: 0, odd: 0 } };
  for (let i = 1; i < n; i++) t[parityOf(digits[i - 1])][parityOf(digits[i])]++;
  const same = t.even.even + t.odd.odd;
  const pairs = Math.max(n - 1, 0);
  const repeatShare = pairs ? same / pairs : 0;
  const repeatZ = pairs ? (same - pairs / 2) / Math.sqrt(pairs / 4) : 0;

  let longest = 0;
  let run = 0;
  for (let i = 0; i < n; i++) {
    run = i > 0 && parityOf(digits[i]) === parityOf(digits[i - 1]) ? run + 1 : 1;
    if (run > longest) longest = run;
  }

  return {
    n,
    counts,
    evenShare,
    evenZ,
    chi2, // 9 degrees of freedom: above 16.92 is unusual at 5 %, above 21.67 at 1 %
    transitions: t,
    repeatShare,
    repeatZ,
    longestStreak: longest,
    expectedLongestStreak: n > 1 ? Math.log2(n) : 0,
  };
}

export function verdict(a, breakEven) {
  const flags = [];
  if (Math.abs(a.evenZ) > 2.58) flags.push("even/odd share is off by more than chance usually allows");
  if (a.chi2 > 21.67) flags.push("the ten digits are not evenly spread");
  if (Math.abs(a.repeatZ) > 2.58) flags.push("one tick's parity seems to say something about the next");
  const best = Math.max(a.evenShare, 1 - a.evenShare, a.repeatShare, 1 - a.repeatShare);
  return {
    flags,
    looksRandom: flags.length === 0,
    bestObservedShare: best,
    beatsBreakEven: breakEven != null ? best > breakEven : null,
  };
}

// ----------------------------------------------------------- entry rules ---
// A rule looks at the digits seen so far and answers "even", "odd" or null
// (no bet on this tick). ctx carries the last bet and whether it won.

function streakAtEnd(digits) {
  const n = digits.length;
  if (!n) return { side: null, length: 0 };
  const side = parityOf(digits[n - 1]);
  let length = 1;
  while (length < n && parityOf(digits[n - 1 - length]) === side) length++;
  return { side, length };
}

export const STRATEGIES = {
  even: {
    about: "always bet even",
    make: () => () => "even",
  },
  odd: {
    about: "always bet odd",
    make: () => () => "odd",
  },
  alternate: {
    about: "bet even, then odd, then even ...",
    make: () => (digits, ctx) => (ctx.lastSide ? other(ctx.lastSide) : "even"),
  },
  "switch-on-loss": {
    about: "keep the side while it wins, switch after a loss",
    make: () => (digits, ctx) =>
      !ctx.lastSide ? "even" : ctx.lastWon ? ctx.lastSide : other(ctx.lastSide),
  },
  "streak-reverse": {
    about: "after N ticks of the same parity in a row, bet the opposite (--streak N, default 4)",
    make: (o) => {
      const need = o.streak ?? 4;
      return (digits) => {
        const s = streakAtEnd(digits);
        return s.length >= need ? other(s.side) : null;
      };
    },
  },
  "streak-follow": {
    about: "after N ticks of the same parity in a row, bet the same again (--streak N, default 4)",
    make: (o) => {
      const need = o.streak ?? 4;
      return (digits) => {
        const s = streakAtEnd(digits);
        return s.length >= need ? s.side : null;
      };
    },
  },
  "frequency-reverse": {
    about: "when one parity is at least --threshold % of the last --window ticks, bet the other (55, 100)",
    make: (o) => frequencyRule(o, true),
  },
  "frequency-follow": {
    about: "when one parity is at least --threshold % of the last --window ticks, bet it (55, 100)",
    make: (o) => frequencyRule(o, false),
  },
  markov: {
    about:
      "look at what followed the last --order parities within the last --window ticks and bet the likelier (2, 500, --threshold 55)",
    make: (o) => {
      const order = o.order ?? 2;
      const window = o.window ?? 500;
      const threshold = (o.threshold ?? 55) / 100;
      const minSamples = o.minSamples ?? 20;
      return (digits) => {
        const n = digits.length;
        if (n < order + minSamples) return null;
        const from = Math.max(0, n - window);
        let even = 0;
        let odd = 0;
        for (let i = from + order; i < n; i++) {
          let match = true;
          for (let k = 1; k <= order; k++) {
            if (parityOf(digits[i - k]) !== parityOf(digits[n - k])) {
              match = false;
              break;
            }
          }
          if (!match) continue;
          if (digits[i] % 2 === 0) even++;
          else odd++;
        }
        const total = even + odd;
        if (total < minSamples) return null;
        if (even / total >= threshold) return "even";
        if (odd / total >= threshold) return "odd";
        return null;
      };
    },
  },
  pattern: {
    about: "when the last ticks match --pattern (like EEEOE), bet --side (default odd)",
    make: (o) => {
      const pat = String(o.pattern ?? "EEEOE").toUpperCase().replace(/[^EO]/g, "");
      if (!pat.length) throw new Error("--pattern needs letters E and O, like EEEOE");
      const side = o.side ?? "odd";
      if (!SIDES.includes(side)) throw new Error("--side must be even or odd");
      return (digits) => {
        const n = digits.length;
        if (n < pat.length) return null;
        for (let k = 0; k < pat.length; k++) {
          const want = pat[k] === "E" ? 0 : 1;
          if (digits[n - pat.length + k] % 2 !== want) return null;
        }
        return side;
      };
    },
  },
  "arm-trigger": {
    about: "an odd tick followed by an even tick: bet even",
    make: () => (digits) => {
      const n = digits.length;
      return n >= 2 && digits[n - 2] % 2 === 1 && digits[n - 1] % 2 === 0 ? "even" : null;
    },
  },
  "digit-follower": {
    about:
      "per digit, track the parity that followed it; when the same parity followed the current digit --streak times running (3), bet the opposite",
    make: (o) => {
      const need = o.streak ?? 3;
      const window = o.window ?? 200;
      return (digits) => {
        const n = digits.length;
        if (n < 2) return null;
        const d = digits[n - 1];
        let side = null;
        let run = 0;
        for (let i = n - 2; i >= Math.max(0, n - window); i--) {
          if (digits[i] !== d) continue;
          const p = parityOf(digits[i + 1]);
          if (side === null) side = p;
          if (p !== side) break;
          run++;
          if (run >= need) return other(side);
        }
        return null;
      };
    },
  },
  random: {
    about: "flip a coin (the baseline every other rule should be compared with)",
    make: (o) => {
      const rng = o.rng ?? mulberry32(o.seed ?? 1);
      return () => (rng() < 0.5 ? "even" : "odd");
    },
  },
};

function frequencyRule(o, reverse) {
  const window = o.window ?? 100;
  const threshold = (o.threshold ?? 55) / 100;
  return (digits) => {
    const n = digits.length;
    if (n < window) return null;
    let even = 0;
    for (let i = n - window; i < n; i++) if (digits[i] % 2 === 0) even++;
    const share = even / window;
    let heavy = null;
    if (share >= threshold) heavy = "even";
    else if (1 - share >= threshold) heavy = "odd";
    if (!heavy) return null;
    return reverse ? other(heavy) : heavy;
  };
}

// --------------------------------------------------------- staking plans ---
// A plan answers "how much on the next bet", in cents, and is told the result.

export const STAKINGS = {
  flat: {
    about: "the same stake every time",
    make: (o) => ({ next: () => o.base, settle() {} }),
  },
  martingale: {
    about: "multiply the stake after a loss, back to the start after a win (--multiplier 2, --max-steps 5)",
    make: (o) => {
      const mult = o.multiplier ?? 2;
      const maxSteps = o.maxSteps ?? 5;
      let step = 0;
      return {
        next: () => Math.round(o.base * mult ** step),
        settle(won) {
          step = won || step >= maxSteps ? 0 : step + 1;
        },
      };
    },
  },
  dalembert: {
    about: "add one unit after a loss, take one off after a win",
    make: (o) => {
      let level = 0;
      return {
        next: () => o.base * (1 + level),
        settle(won) {
          level = won ? Math.max(0, level - 1) : level + 1;
        },
      };
    },
  },
  recovery: {
    about: "after losses, stake the losses since the last win times --multiplier (1.3); back to the start after a win",
    make: (o) => {
      const mult = o.multiplier ?? 1.3;
      let lost = 0;
      return {
        next: () => Math.max(o.base, Math.round(lost * mult)),
        settle(won, stake) {
          lost = won ? 0 : lost + stake;
        },
      };
    },
  },
  paroli: {
    about: "multiply the stake after a win, back to the start after a loss or --max-steps wins (2, 3)",
    make: (o) => {
      const mult = o.multiplier ?? 2;
      const maxSteps = o.maxSteps ?? 3;
      let step = 0;
      return {
        next: () => Math.round(o.base * mult ** step),
        settle(won) {
          step = !won || step >= maxSteps ? 0 : step + 1;
        },
      };
    },
  },
};

// --------------------------------------------------------------- session ---
// One sitting, with limits that cannot be exceeded:
//   stopLoss   the most this session may lose; a bet that could take the
//              loss past it is never placed
//   takeProfit stop once ahead by this much (optional)
//   maxTrades  stop after this many bets
//   maxStake   never stake more than this on one bet
// Amounts are in cents.

export class Session {
  constructor(cfg) {
    const { strategy = "even", staking = "flat", options = {}, limits } = cfg;
    if (!STRATEGIES[strategy]) throw new Error("unknown strategy: " + strategy);
    if (!STAKINGS[staking]) throw new Error("unknown staking plan: " + staking);
    if (!limits || !(limits.stopLoss > 0)) throw new Error("a stop-loss above zero is required");
    if (!(limits.maxTrades > 0)) throw new Error("max trades above zero is required");
    if (!(options.base > 0)) throw new Error("a stake above zero is required");
    this.limits = { maxStake: options.base, takeProfit: null, ...limits };
    this.rule = STRATEGIES[strategy].make(options);
    this.plan = STAKINGS[staking].make(options);
    this.ctx = { lastSide: null, lastWon: null };
    this.pnl = 0;
    this.trades = 0;
    this.wins = 0;
    this.staked = 0;
    this.peak = 0;
    this.maxDrawdown = 0;
    this.largestStake = 0;
    this.stopReason = null;
    this.pending = null;
  }

  // -> {action:"stop",reason} | {action:"skip"} | {action:"bet",side,stake}
  decide(digits) {
    if (this.pending) throw new Error("the last bet has not been settled");
    if (this.stopReason) return { action: "stop", reason: this.stopReason };
    const L = this.limits;
    const stop = (reason) => {
      this.stopReason = reason;
      return { action: "stop", reason };
    };
    if (this.pnl <= -L.stopLoss) return stop("stop-loss reached");
    if (L.takeProfit != null && this.pnl >= L.takeProfit) return stop("take-profit reached");
    if (this.trades >= L.maxTrades) return stop("max trades reached");
    const side = this.rule(digits, this.ctx);
    if (!side) return { action: "skip" };
    const stake = this.plan.next();
    if (stake > L.maxStake) return stop("next stake " + money(stake) + " is above the max stake");
    if (stake > L.stopLoss + this.pnl)
      return stop("next stake " + money(stake) + " could take the loss past the stop-loss");
    this.pending = { side, stake };
    return { action: "bet", side, stake };
  }

  // profit in cents: positive on a win, minus the stake on a loss
  settle(won, profit) {
    const p = this.pending;
    if (!p) throw new Error("nothing to settle");
    this.pending = null;
    this.trades++;
    if (won) this.wins++;
    this.staked += p.stake;
    this.pnl += profit;
    if (p.stake > this.largestStake) this.largestStake = p.stake;
    if (this.pnl > this.peak) this.peak = this.pnl;
    if (this.peak - this.pnl > this.maxDrawdown) this.maxDrawdown = this.peak - this.pnl;
    this.ctx = { lastSide: p.side, lastWon: won };
    this.plan.settle(won, p.stake);
  }

  // the bet was never placed (the broker refused it): forget it
  cancel() {
    this.pending = null;
  }

  summary() {
    return {
      trades: this.trades,
      wins: this.wins,
      winRate: this.trades ? this.wins / this.trades : 0,
      pnl: this.pnl,
      staked: this.staked,
      returnOnStaked: this.staked ? this.pnl / this.staked : 0,
      maxDrawdown: this.maxDrawdown,
      largestStake: this.largestStake,
      stopReason: this.stopReason,
    };
  }
}

// payoutRatio: profit per 1 staked on a win (Deriv shows payout / stake - 1).
export const winProfit = (stake, payoutRatio) => Math.round(stake * payoutRatio);
export const breakEvenRate = (payoutRatio) => 1 / (1 + payoutRatio);

// -------------------------------------------------------------- backtest ---
// Replays real digits. A bet decided after tick i is settled by tick i + 1,
// and the next decision is made after that tick. When a session stops, a new
// one starts on the following tick, until the digits run out.

export function backtest(digits, cfg) {
  const { payoutRatio, warmup = 0 } = cfg;
  if (!(payoutRatio > 0)) throw new Error("payoutRatio is required");
  const sessions = [];
  let i = Math.max(warmup, 1);
  const total = { trades: 0, wins: 0, pnl: 0, staked: 0, largestStake: 0, maxDrawdown: 0 };
  const seen = digits.slice(0, i + 1); // digits[0..i], grown one tick at a time
  while (i < digits.length - 1) {
    const s = new Session(cfg);
    while (i < digits.length - 1) {
      const d = s.decide(seen);
      if (d.action === "stop") break;
      if (d.action === "bet") {
        const won = parityOf(digits[i + 1]) === d.side;
        s.settle(won, won ? winProfit(d.stake, payoutRatio) : -d.stake);
      }
      i++;
      seen.push(digits[i]);
    }
    const sum = s.summary();
    if (sum.trades === 0) break; // out of digits, or the limits allow no bet at all
    sessions.push(sum);
    total.trades += sum.trades;
    total.wins += sum.wins;
    total.pnl += sum.pnl;
    total.staked += sum.staked;
    total.largestStake = Math.max(total.largestStake, sum.largestStake);
    total.maxDrawdown = Math.max(total.maxDrawdown, sum.maxDrawdown);
    if (cfg.single) break;
  }
  return {
    sessions,
    total: {
      ...total,
      winRate: total.trades ? total.wins / total.trades : 0,
      returnOnStaked: total.staked ? total.pnl / total.staked : 0,
    },
    ended: tally(sessions),
  };
}

function tally(sessions) {
  const out = { ahead: 0, behind: 0, flat: 0, stopLoss: 0, takeProfit: 0 };
  for (const s of sessions) {
    if (s.pnl > 0) out.ahead++;
    else if (s.pnl < 0) out.behind++;
    else out.flat++;
    if (s.stopReason === "take-profit reached") out.takeProfit++;
    else if (s.stopReason && s.stopReason !== "max trades reached") out.stopLoss++;
  }
  return out;
}

// -------------------------------------------------------------- simulate ---
// Plays `sessions` sittings on a fair random digit (each of 0-9 equally
// likely, every tick independent), which is what Deriv says the index is.

export function simulate(cfg) {
  const { payoutRatio, sessions = 10000, seed = 1 } = cfg;
  if (!(payoutRatio > 0)) throw new Error("payoutRatio is required");
  const rng = mulberry32(seed);
  const results = [];
  let trades = 0;
  let wins = 0;
  let staked = 0;
  let pnl = 0;
  let largestStake = 0;
  for (let k = 0; k < sessions; k++) {
    const s = new Session({ ...cfg, options: { ...cfg.options, rng } });
    const digits = [];
    for (let w = 0; w < (cfg.warmup ?? 0); w++) digits.push(Math.floor(rng() * 10));
    const cap = (cfg.limits.maxTrades + 1) * 200; // ticks, so a rule that rarely fires still ends
    for (let tick = 0; tick < cap; tick++) {
      digits.push(Math.floor(rng() * 10));
      if (digits.length > 2000) digits.shift();
      const d = s.decide(digits);
      if (d.action === "stop") break;
      if (d.action === "bet") {
        const next = Math.floor(rng() * 10);
        digits.push(next);
        const won = parityOf(next) === d.side;
        s.settle(won, won ? winProfit(d.stake, payoutRatio) : -d.stake);
      }
    }
    const sum = s.summary();
    results.push(sum.pnl);
    trades += sum.trades;
    wins += sum.wins;
    staked += sum.staked;
    pnl += sum.pnl;
    largestStake = Math.max(largestStake, sum.largestStake);
  }
  results.sort((a, b) => a - b);
  const q = (p) => results[Math.min(results.length - 1, Math.floor(p * results.length))];
  return {
    sessions,
    ahead: results.filter((x) => x > 0).length / sessions,
    behind: results.filter((x) => x < 0).length / sessions,
    meanPnl: pnl / sessions,
    medianPnl: q(0.5),
    worst: results[0],
    best: results[results.length - 1],
    p5: q(0.05),
    p95: q(0.95),
    trades,
    winRate: trades ? wins / trades : 0,
    staked,
    returnOnStaked: staked ? pnl / staked : 0,
    largestStake,
  };
}

// ------------------------------------------------------------------ args ---

export function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) {
      out._.push(a);
      continue;
    }
    const eq = a.indexOf("=");
    const key = (eq > 0 ? a.slice(2, eq) : a.slice(2)).replace(/-([a-z])/g, (m, c) => c.toUpperCase());
    if (eq > 0) out[key] = a.slice(eq + 1);
    else if (i + 1 < argv.length && !argv[i + 1].startsWith("--")) out[key] = argv[++i];
    else out[key] = true;
  }
  return out;
}

function num(v, name) {
  if (v === undefined || v === true) return undefined;
  const x = Number(v);
  if (!Number.isFinite(x)) throw new Error("--" + name + " must be a number");
  return x;
}

// Turns command-line flags into a Session config (amounts in cents).
export function configFromArgs(a) {
  const stake = num(a.stake, "stake");
  const stopLoss = num(a.stopLoss, "stop-loss");
  const maxTrades = num(a.maxTrades, "max-trades");
  const missing = [];
  if (!(stake > 0)) missing.push("--stake");
  if (!(stopLoss > 0)) missing.push("--stop-loss");
  if (!(maxTrades > 0)) missing.push("--max-trades");
  if (missing.length) throw new Error("required: " + missing.join(", "));
  const takeProfit = num(a.takeProfit, "take-profit");
  const maxStake = num(a.maxStake, "max-stake");
  const staking = a.staking ?? "flat";
  if (staking !== "flat" && maxStake === undefined)
    throw new Error("--max-stake is required with --staking " + staking);
  return {
    strategy: a.strategy ?? "even",
    staking,
    options: {
      base: cents(stake),
      streak: num(a.streak, "streak"),
      window: num(a.window, "window"),
      threshold: num(a.threshold, "threshold"),
      order: num(a.order, "order"),
      pattern: a.pattern === true ? undefined : a.pattern,
      side: a.side === true ? undefined : a.side,
      multiplier: num(a.multiplier, "multiplier"),
      maxSteps: num(a.maxSteps, "max-steps"),
      seed: num(a.seed, "seed"),
    },
    limits: {
      stopLoss: cents(stopLoss),
      takeProfit: takeProfit === undefined ? null : cents(takeProfit),
      maxTrades,
      maxStake: maxStake === undefined ? cents(stake) : cents(maxStake),
    },
  };
}

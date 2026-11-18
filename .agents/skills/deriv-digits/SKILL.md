---
name: deriv-digits
description: >-
  Even/Odd digit contracts on Deriv synthetic indices (Volatility 100 (1s),
  1HZ100V, by default). Fetches real ticks and checks whether the digits are
  random, asks Deriv what a win pays and the break-even win rate, backtests
  and simulates the entry rules and staking plans found in public Deriv bots
  (streaks, patterns, Markov, martingale and more), and can trade a plan on
  the user's own computer with hard limits: demo account by default, a
  stop-loss that cannot be exceeded, max trades and max stake. Use when the
  user says "Deriv", "even odd", "digit bot", "Volatility 100", "1HZ100V",
  "test this Deriv strategy", "backtest even/odd", "martingale", "run the
  Deriv bot", or "how much does even/odd pay".
argument-hint: "[strategies | ticks | payout | backtest | compare | simulate | run]"
---

# deriv-digits

`${CLAUDE_SKILL_DIR}` below is this skill's folder. Node 22 or newer, nothing
to install.

```bash
node "${CLAUDE_SKILL_DIR}/deriv.mjs" strategies
node "${CLAUDE_SKILL_DIR}/deriv.mjs" ticks --count 20000 --save ticks.json
node "${CLAUDE_SKILL_DIR}/deriv.mjs" payout
node "${CLAUDE_SKILL_DIR}/deriv.mjs" compare  --file ticks.json --stake 1 --stop-loss 20 --max-trades 100
node "${CLAUDE_SKILL_DIR}/deriv.mjs" backtest --file ticks.json --strategy streak-reverse --streak 4 --stake 1 --stop-loss 20 --max-trades 100
node "${CLAUDE_SKILL_DIR}/deriv.mjs" simulate --strategy even --staking martingale --stake 1 --max-stake 16 --stop-loss 31 --max-trades 100
node "${CLAUDE_SKILL_DIR}/deriv.mjs" accounts
node "${CLAUDE_SKILL_DIR}/deriv.mjs" run --strategy even --stake 1 --stop-loss 10 --take-profit 5 --max-trades 50
node --test "${CLAUDE_SKILL_DIR}/selftest.mjs"
```

## What to tell the user, every time

Say this plainly before a backtest, a simulation or a run, and do not soften
it afterwards:

- The index is a random number generator. Each tick's last digit is
  independent of the ones before it, so no entry rule changes the 50 % chance.
- A win pays less than the stake (`payout` prints the exact figure, about
  95 %). The break-even win rate is therefore above 50 %, and the expected
  result is a loss of about 2.5 % of everything staked.
- A staking plan changes the shape of the results, not the average.
  Martingale gives many small winning sessions and a few large losing ones.
- A good backtest on one stretch of ticks is luck. `simulate` and the
  `sim avg` column of `compare` are the numbers that repeat.

This skill is a way to see that with real data and to keep a session inside
limits the user chose in advance. It is not a way to make money. If the user
asks which rule "works", the honest answer is none, and `compare` shows it.
If the user talks about chasing losses, needing the money, or raising limits
after losing, say so and suggest stopping; Deriv has self-exclusion and
deposit limits in its account settings.

## Where it runs

`ticks`, `payout`, `accounts`, `run`, and `backtest` / `compare` /
`simulate` without `--file` / `--payout`, open a connection to
`api.derivws.com`. Cloud sessions of Claude Code cannot open WebSocket
connections, so run those on the user's own computer. With `--file ticks.json
--payout 0.95` the backtest, compare and simulate commands work anywhere.

## The plan flags

Every plan needs three limits. The tool refuses to start without them.

| flag | meaning |
| --- | --- |
| `--stake 1` | the first stake |
| `--stop-loss 10` | the most the session may lose. A bet that could take the loss past it is never placed |
| `--max-trades 50` | stop after this many bets |
| `--take-profit 5` | stop once ahead by this much (optional) |
| `--max-stake 8` | never stake more than this on one bet. Required with any staking plan except `flat` |
| `--strategy NAME` | entry rule, default `even`. `strategies` lists them |
| `--staking NAME` | `flat` (default), `martingale`, `recovery`, `dalembert`, `paroli` |
| `--streak --window --threshold --order --pattern --side --multiplier --max-steps` | rule and plan settings |
| `--symbol 1HZ100V` | the index |
| `--payout 0.95` | profit per 1 staked on a win, instead of asking Deriv |

Entry rules: `even`, `odd`, `alternate`, `switch-on-loss`, `streak-reverse`,
`streak-follow`, `frequency-reverse`, `frequency-follow`, `markov`, `pattern`,
`arm-trigger`, `digit-follower`, `random`. They are the rules found in public
Deriv even/odd bots on GitHub, rewritten from scratch.

## Trading: `run`

Demo account unless told otherwise. Steps for the user, on their own computer:

1. In Deriv, create an API token with the **trade** scope only (no payments,
   no admin) and register an app to get an app ID.
2. Put both in the shell, never in the chat:
   `export DERIV_TOKEN=...` and `export DERIV_APP_ID=...`
3. `accounts` to check the token, then `run` with the plan flags.

What `run` does: lists the accounts, picks the **demo** one, asks Deriv what
a win pays, prints the plan and the break-even rate, then on each tick lets
the rule decide, buys one 1-tick `DIGITEVEN` or `DIGITODD` contract, waits for
Deriv's result and prints it. One contract at a time. It stops at the
stop-loss, the take-profit, max trades, a stake above the max stake, Ctrl-C,
a lost connection or any error from Deriv. A refused or uncertain buy is
never retried. Every trade is appended to `deriv/sessions/<time>.jsonl`.

Real money: `--real`, started by the user at a terminal, who must type
`REAL <stop-loss>` when asked. Never start a real-money run yourself, never
add `--real` on the user's behalf, and never run it from a scheduled or
background task. If the user asks you to, give them the command to run.

## What it never does

- Never asks for, prints, stores or logs the token. If the user pastes a
  token into the chat, tell them to delete it in Deriv and make a new one.
- Never sends the token anywhere except `api.derivws.com`.
- Never trades a real account without `--real` and the typed phrase.
- Never raises a limit mid-session and never retries a failed buy.
- Never withdraws, transfers or changes account settings.

## Checked and not checked

The request shapes follow Deriv's API reference (developers.deriv.com) as of
2026-11-18: public data on `wss://api.derivws.com/trading/v1/options/ws/public`,
accounts and a one-time trading URL from the REST API, buy with
`underlying_symbol`. The self-test runs the whole flow against a local
stand-in. It has not been run against Deriv itself: the first real use should
be `payout` and `ticks`, then a short demo `run`. If Deriv answers with an
error, the tool prints it and stops.

# MatVerse GitHub Agent Architecture (Production-Ready Draft)

## Overview

The MatVerse GitHub Agent is the governance runtime that evaluates repository events and records verifiable decisions.

## Core Runtime

```text
GitHub Repositories/PRs/Actions
            |
            v
      Webhook Handler
            |
            v
 Governance Engine (Ψ, Θ, CVaR, PoLE, Ω)
            |
            +--> Decision (PASS | ESCALATE | BLOCK)
            |
            v
       MatVerse Ledger (PoSE anchor)
```

## Decision Model

The decision operator is bounded in [0, 1]:

```text
Ω = w1*Ψ + w2*Θ + w3*(1-CVaR) + w4*PoLE
```

Default weights:

- `w1 = 0.40` (coherence Ψ)
- `w2 = 0.30` (efficiency Θ)
- `w3 = 0.20` (risk term 1-CVaR)
- `w4 = 0.10` (evolutionary potential PoLE)

Thresholds:

- `Ω >= 0.80` -> `PASS`
- `0.50 <= Ω < 0.80` -> `ESCALATE`
- `Ω < 0.50` -> `BLOCK`

## Required APIs

- `POST /api/webhook` GitHub webhook ingestion + signature verification.
- `GET /api/oauth/authorize` OAuth start.
- `GET /api/oauth/callback` OAuth callback.
- `POST /api/oauth/revoke` session/token revocation.
- `POST /api/governance/decision` optional endpoint to persist decisions externally.

## Security Baseline

- Enforce `GITHUB_WEBHOOK_SECRET` at startup/runtime.
- Verify `x-hub-signature-256` using HMAC-SHA256.
- Use encrypted persistence for OAuth tokens/sessions.
- Add per-route rate limiting for auth and webhook handlers.
- Emit audit logs with repository, actor, event, and decision metadata.

## Maturity Roadmap

1. **Current**: static heuristics + deterministic Ω decision.
2. **Next**: incremental/diff-based metrics and lower compute cost.
3. **Target**: PoSE ledger anchoring with reproducible evidence chain.

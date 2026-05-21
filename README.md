# kaleidoskop

Replay visualization for [Mozaik](https://github.com/jigjoy-ai/mozaik) event-bus runs. Drop in an audit log from any Mozaik orchestration — including a [baro](https://github.com/jigjoy-ai/baro) PR build — and watch every participant, every tool call, every bus emit fire as a hexagonal neural network.

> **Status:** Live in production at **[kaleidoskop.jigjoy.ai](https://kaleidoskop.jigjoy.ai)**. Drop a JSONL audit log from any Mozaik orchestration and scrub through the replay in your browser. Variable layout up to 52 stories, per-run shareable URLs with dynamic OG previews, CD from this repo's `main` to a dedicated AWS sub-account.

## What it does

Every Mozaik orchestration emits a structured JSONL audit log. kaleidoskop is what makes that legible:

- **Hexagons** are participants (Conductor, Operator, observers, story agents).
- **Ripples** are bus events fanning out from emitter to subscribers.
- **Colors** map to event domain — tool calls, model messages, story results, errors.
- **Time** is a scrubbable progress bar — pause, seek, change speed.
- **Lifecycle** is reconstructed from real audit-log events (spawn → active → completed), not a script.

The visual language is a neural-network firing animation: participants are nodes, the bus is the synapse, events are spikes.

## Architecture

Monorepo (npm workspaces), three packages:

```
packages/
├── shared/      — Wire types + canonical subscriber matrix
├── backend/     — Fastify server: parser, replay engine, WS, S3 storage, SSR
└── frontend/    — Vite + React + Tailwind: hex grid, ripples, scrub bar
```

**Backend (`@kaleidoskop/backend`):** Fastify HTTP + WebSocket server. `POST /api/runs` accepts JSONL uploads, parses, persists to S3 (or local FS in dev). `GET /api/runs/:id/stream` opens a WebSocket replay session that runs the parsed events through a Mozaik `AgenticEnvironment` and streams typed `StreamMessage` envelopes to the client. Also injects per-run OG metadata for `/r/:id` so link previews show meaningful titles, and serves a dynamic SVG OG image at `/api/runs/:id/og.svg`.

**Frontend (`@kaleidoskop/frontend`):** Vite + React + Tailwind v4 SPA. Honeycomb layout grows from 19 cells (demo) up to 61 cells (ring 0..4) depending on the run's story count. Subscriber fan-out, lifecycle transitions, and scrubbing all work end-to-end with the live backend.

## Scope (three phases)

| Phase                          | Goal                                                                              | Status      |
| ------------------------------ | --------------------------------------------------------------------------------- | ----------- |
| **1 · Frontend MVP**           | Hex grid, replay engine, scrubbable controls, JSONL drop zone                     | **Done**    |
| **2 · Mozaik runtime + share** | Backend replay engine, S3 persistence, per-run URLs, OG link previews             | **Done**    |
| **3 · Deploy + polish**        | `kaleidoskop.jigjoy.ai` on AWS, dynamic OG thumbnails, run gallery, embed widget  | **Done** (deploy live; gallery + dynamic OG on the roadmap)    |

## Tech stack

- **Vite + React + TypeScript** — frontend build/runtime
- **Tailwind CSS v4** — styling (`@tailwindcss/vite`)
- **framer-motion** — declarative edge flashes and node pulses
- **zustand** — replay clock + selection state, dynamic participant roster
- **Hand-rolled hex layout math** — pointy-top axial coords → pixel, ring-based positioning. d3 was on the original tech-stack list but never imported in practice; the layout problem was small enough that 30 lines of `lib/hexLayout.ts` beat pulling in a 70 kB monolith. d3 sub-packages (`d3-sankey`, `d3-scale`, `d3-force`) are reserved for future aggregate-analytics views that don't fit the live hex grid.
- **Fastify v5** — backend HTTP + WebSocket
- **@mozaik-ai/core 3.10** — replay engine (`AgenticEnvironment`, observer subscribe pattern)
- **AWS SDK v3 (S3)** — audit-log persistence

## Local development

```bash
npm install
npm run dev          # frontend (Vite on :5173)
npm run dev:backend  # backend (Fastify on :8787, fs storage)
```

To exercise the full SSR + OG path locally:

```bash
npm run build:frontend
KALEIDOSKOP_FRONTEND_DIST=$(pwd)/packages/frontend/dist \
KALEIDOSKOP_PUBLIC_ORIGIN=http://localhost:8787 \
  npm run dev:backend
# now /r/:id returns SSR'd HTML with run-specific OG meta
```

S3 mode against the dev bucket:

```bash
KALEIDOSKOP_STORAGE=s3 \
S3_BUCKET=kaleidoskop-runs \
S3_REGION=eu-west-1 \
AWS_PROFILE=kaleidoskop-prod \
  npm run dev:backend
```

## End-to-end flow

1. User drops a `~/.baro/runs/baro-*.jsonl` file on the page.
2. Frontend POSTs the JSONL to `/api/runs`.
3. Backend parses, validates, generates a `r_<base64url>` id, writes JSONL + meta to S3, returns the id.
4. Frontend navigates to `/r/<id>` — URL is shareable.
5. User clicks "connect" → WebSocket opens to `/api/runs/<id>/stream`.
6. Backend reads from S3, sends `hello` envelope with run meta + participant roster.
7. Frontend builds the dynamic honeycomb layout sized for the story count.
8. Backend's scheduler dispatches events at configurable speed; frontend animates ripples, lifecycle transitions, recent-events list.
9. Pause / play / set-speed / seek all round-trip to the backend — backend's `ReplaySession` halts and re-anchors its wall clock.
10. Share button copies the URL. When pasted on Slack / Twitter / Discord, the SSR'd `/r/<id>` returns custom OG metadata + a per-run SVG thumbnail showing the actual lifecycle state.

## Deploy

See [`docs/DEPLOY.md`](docs/DEPLOY.md). MVP target: single `t4g.small` EC2 in a new `kaleidoskop-prod` AWS account, S3 bucket for runs, nginx TLS terminator. `kaleidoskop.jigjoy.ai` Route53 A record.

## Lineage

This project started as `mozaik-replay`. Renamed to `kaleidoskop` when scope graduated from "Mozaik replay demo" to "JigJoy platform tool for monitoring + analyzing Mozaik workflow activity". The earlier observability microservice that occupied the `kaleidoskop` name was renamed `kaleidoskop-spektrum` and continues to back the Spektrum platform.

## License

MIT

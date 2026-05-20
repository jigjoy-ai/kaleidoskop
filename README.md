# mozaik-replay

Replay visualization for the [Mozaik](https://github.com/jigjoy-ai/mozaik) event bus. Drop in an audit log from any Mozaik run — including a [baro](https://github.com/jigjoy-ai/baro) PR build — and watch every participant, every tool call, every bus emit fire as a hexagonal neural network.

> Status: bootstrap. Phase 1 (hex grid + replay engine) in progress.

## What this is

Every Mozaik orchestration emits a structured audit log. Today those logs are read as JSONL or summarised in CLI output. `mozaik-replay` renders them as a live visualization:

- **Hexagons** are participants (Architect, Planner, Story Agents, Critic, Surgeon, Finalizer, …).
- **Edges** are the bus — they flash when an event travels between participants.
- **Colors** map to event type — tool calls, streaming tokens, web searches, file edits, completions, errors.
- **Time** is a scrubber — replay the run at 1×, 5×, 20×, or jump frame-by-frame.

The visual language is a neural-network-firing animation: participants are nodes, the bus is the synapse, events are spikes.

## Why

The Mozaik event bus model is the hardest part of baro to explain in words. Diagrams help. A replay video would help more. A *live* interactive replay — where you can pause, scrub, hover a hexagon and see its full event history — is the strongest possible demonstration of what reactive agents on a shared bus actually look like in motion.

## Scope (three phases)

| Phase | Goal | Status |
|---|---|---|
| **1 · Frontend MVP** | Hex grid, replay engine, playback controls, JSONL drop zone. Reads audit logs that already exist. | In progress |
| **2 · Mozaik runtime** | Live mode — connect to a running Mozaik orchestration via WebSocket and visualize events as they happen. | Pending |
| **3 · Sharing + polish** | Permalink-able replays, embed widget, gallery of sample runs (incl. baro's own builds). | Pending |

## Tech stack

- **Vite + React + TypeScript** — build/runtime
- **Tailwind CSS v4** — styling (via `@tailwindcss/vite`)
- **D3.js** — hex grid layout math (`d3-hexbin`, `d3-force`)
- **framer-motion** — declarative edge flashes and node pulses
- **zustand** — replay clock and selection state

## Local development

```bash
npm install
npm run dev
```

Build:

```bash
npm run build
npm run preview
```

## Repo layout (target — Phase 1)

```
src/
├── App.tsx
├── main.tsx
├── components/
│   ├── HexGrid.tsx          # SVG hexagonal layout, concentric rings
│   ├── HexParticipant.tsx   # Single participant node, color + pulse on firing
│   ├── EdgeFlash.tsx        # Bus edge with animated event "spike"
│   ├── PlaybackControls.tsx # Play / pause / scrub / speed
│   ├── EventInspector.tsx   # Side panel — full JSON of selected event
│   └── DropZone.tsx         # JSONL file upload
├── lib/
│   ├── parseAuditLog.ts     # JSONL → typed events
│   ├── replayClock.ts       # zustand store driving playback
│   └── eventColor.ts        # event-type → color mapping
└── samples/
    └── sample-audit-log.jsonl  # demo run (filled in when baro builds itself)
```

## License

MIT

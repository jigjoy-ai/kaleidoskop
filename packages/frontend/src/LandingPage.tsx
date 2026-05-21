import { useEffect, useMemo, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { DropZone, triggerUploadPicker } from "./components/DropZone"
import { track } from "./lib/analytics"

const PRODUCTS: readonly { label: string; href: string }[] = [
	{ label: "jigjoy", href: "https://jigjoy.ai" },
	{ label: "mozaik", href: "https://github.com/jigjoy-ai/mozaik" },
	{ label: "baro", href: "https://github.com/jigjoy-ai/baro" },
]

/**
 * Landing page rendered on `/`. Two CTAs:
 *   1. "See demo run" → /r/smoke-test (auto-connects, replays the
 *      sample log shipped with the repo).
 *   2. "Upload baro audit log" → opens the OS file picker; the
 *      window-level drop-zone listener mounted below also catches
 *      drag-and-drop anywhere on the page.
 *
 * Background is a `HexBackdrop` with a propagating snake-of-hexes
 * animation — random hexes light up in cascading chains, like
 * activations rippling through a sparse neural mesh.
 */
export default function LandingPage() {
	const navigate = useNavigate()

	const goDemo = () => {
		track("landing_see_demo_clicked")
		navigate("/r/smoke-test")
	}

	const goUpload = () => {
		track("landing_upload_clicked")
		triggerUploadPicker()
	}

	return (
		<>
			<DropZone />

			<div className="h-full flex flex-col bg-[var(--color-bg)] relative overflow-hidden">
				<HexBackdrop />

				<header className="relative z-10 flex items-center justify-between px-3 sm:px-5 py-3 border-b border-[var(--color-border)]/60 bg-[var(--color-bg-elev)]/60 backdrop-blur-sm">
					<span className="font-mono text-sm font-semibold tracking-tight">
						kaleidoskop
					</span>
					<a
						href="https://github.com/jigjoy-ai/kaleidoskop"
						target="_blank"
						rel="noreferrer"
						className="text-xs font-mono text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] transition-colors"
					>
						github ↗
					</a>
				</header>

				<main className="relative z-10 flex-1 flex flex-col items-center justify-center gap-8 sm:gap-10 p-6 sm:p-10">
					<div className="max-w-2xl text-center space-y-4">
						<h1 className="font-mono text-3xl sm:text-5xl font-semibold tracking-tight text-[var(--color-fg)]">
							kaleidoskop
						</h1>
						<p className="text-sm sm:text-base text-[var(--color-fg-muted)] leading-relaxed">
							Replay your baro / Mozaik agent runs visually. Drop in an
							audit log and watch every bus event ripple through the agent
							honeycomb &mdash; tool calls, model messages, story spawns,
							verdicts, all in real time.
						</p>
					</div>

					<div className="flex flex-col sm:flex-row gap-3 sm:gap-4 w-full max-w-md sm:max-w-none sm:w-auto">
						<button
							type="button"
							onClick={goDemo}
							className="inline-flex items-center justify-center gap-2 rounded-md border border-[var(--color-accent-dim)] bg-[var(--color-accent)]/15 hover:bg-[var(--color-accent)]/25 px-5 sm:px-6 py-3 font-mono text-sm text-[var(--color-fg)] transition-colors shadow-[0_0_20px_rgba(185,123,255,0.18)]"
						>
							<span aria-hidden="true">▶</span>
							See demo run
						</button>
						<button
							type="button"
							onClick={goUpload}
							className="inline-flex items-center justify-center gap-2 rounded-md border border-[var(--color-border)] hover:border-[var(--color-fg-muted)] hover:bg-[#1a1a23]/60 px-5 sm:px-6 py-3 font-mono text-sm text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] transition-colors backdrop-blur-sm"
						>
							<span aria-hidden="true">⬆</span>
							Upload baro audit log
						</button>
					</div>

					<p className="text-[11px] text-[var(--color-fg-muted)]/60 font-mono text-center max-w-md">
						JSONL audit logs from{" "}
						<code className="text-[var(--color-fg-muted)]">~/.baro/runs/</code>{" "}
						or any other Mozaik orchestration. Drag and drop works
						anywhere on the page.
					</p>
				</main>

				<footer className="relative z-10 flex items-center justify-center gap-3 px-5 py-3 border-t border-[var(--color-border)]/60 bg-[var(--color-bg-elev)]/60 backdrop-blur-sm font-mono text-[10px] uppercase tracking-[0.2em]">
					{PRODUCTS.map((p, i) => (
						<span key={p.href} className="inline-flex items-center gap-3">
							<a
								href={p.href}
								target="_blank"
								rel="noreferrer"
								className="text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] transition-colors"
							>
								{p.label}
							</a>
							{i < PRODUCTS.length - 1 && (
								<span
									aria-hidden="true"
									className="text-[var(--color-fg-muted)]/40"
								>
									·
								</span>
							)}
						</span>
					))}
				</footer>
			</div>
		</>
	)
}

// ─────────────────────────────────────────────────────────────────────────────
// HexBackdrop — full-screen pointy-top hex lattice with a propagating snake
// activation animation. Looks like sparse neural firing skimming across the
// background.
// ─────────────────────────────────────────────────────────────────────────────

const HEX_SIZE = 26
const SQRT3 = Math.sqrt(3)
// Big enough to over-cover ~2560×1440. We center the SVG so any extra
// hexes spill off the edge — no need to be precise.
const COLS = 36
const ROWS = 32

interface HexCell {
	row: number
	col: number
	cx: number
	cy: number
	id: string
}

/** Pointy-top offset-coords neighbours. Odd rows are shifted right. */
function neighborsOf(row: number, col: number): [number, number][] {
	const parity = row & 1
	const offsets: [number, number][] =
		parity === 0
			? [
					[-1, -1],
					[-1, 0],
					[0, -1],
					[0, 1],
					[1, -1],
					[1, 0],
				]
			: [
					[-1, 0],
					[-1, 1],
					[0, -1],
					[0, 1],
					[1, 0],
					[1, 1],
				]
	return offsets.map(([dr, dc]) => [row + dr, col + dc])
}

function HexBackdrop() {
	const containerRef = useRef<SVGSVGElement>(null)

	const cells = useMemo<HexCell[]>(() => {
		const list: HexCell[] = []
		const colWidth = SQRT3 * HEX_SIZE
		const rowHeight = 1.5 * HEX_SIZE
		const offsetX = -((COLS * colWidth) / 2)
		const offsetY = -((ROWS * rowHeight) / 2)
		for (let r = 0; r < ROWS; r++) {
			const rowShift = r % 2 === 1 ? colWidth / 2 : 0
			for (let c = 0; c < COLS; c++) {
				list.push({
					row: r,
					col: c,
					cx: offsetX + c * colWidth + rowShift,
					cy: offsetY + r * rowHeight,
					id: `hex-bg-${r}-${c}`,
				})
			}
		}
		return list
	}, [])

	// Snake animation driver. Picks a random hex, fires it, advances to a
	// random in-bounds neighbour every tick, fades out behind itself. New
	// snakes spawn occasionally up to a small cap.
	useEffect(() => {
		const SNAKE_TICK_MS = 140
		const SNAKE_LIFE_MS = 700 // glow persists this long before fade
		const MAX_SNAKES = 4
		const SPAWN_CHANCE_PER_TICK = 0.32
		const MAX_STEPS = 14
		const MIN_STEPS = 6

		interface Snake {
			row: number
			col: number
			steps: number
			maxSteps: number
		}

		const snakes: Snake[] = []

		const fire = (row: number, col: number) => {
			const el = document.getElementById(`hex-bg-${row}-${col}`)
			if (!el) return
			el.classList.add("hex-bg-fired")
			window.setTimeout(() => {
				el.classList.remove("hex-bg-fired")
			}, SNAKE_LIFE_MS)
		}

		const spawnSnake = () => {
			snakes.push({
				row: Math.floor(Math.random() * ROWS),
				col: Math.floor(Math.random() * COLS),
				steps: 0,
				maxSteps:
					MIN_STEPS +
					Math.floor(Math.random() * (MAX_STEPS - MIN_STEPS + 1)),
			})
		}

		// Seed two snakes immediately so the page isn't blank for the
		// first 2-3 seconds.
		spawnSnake()
		spawnSnake()

		const tick = window.setInterval(() => {
			for (let i = snakes.length - 1; i >= 0; i--) {
				const s = snakes[i]!
				fire(s.row, s.col)
				s.steps++
				if (s.steps >= s.maxSteps) {
					snakes.splice(i, 1)
					continue
				}
				const inBounds = neighborsOf(s.row, s.col).filter(
					([r, c]) => r >= 0 && r < ROWS && c >= 0 && c < COLS,
				)
				if (inBounds.length === 0) {
					snakes.splice(i, 1)
					continue
				}
				const [nr, nc] =
					inBounds[Math.floor(Math.random() * inBounds.length)]!
				s.row = nr
				s.col = nc
			}
			if (
				snakes.length < MAX_SNAKES &&
				Math.random() < SPAWN_CHANCE_PER_TICK
			) {
				spawnSnake()
			}
		}, SNAKE_TICK_MS)

		return () => window.clearInterval(tick)
	}, [])

	const viewSize = Math.max(COLS, ROWS) * HEX_SIZE * 2

	return (
		<svg
			ref={containerRef}
			className="absolute inset-0 w-full h-full pointer-events-none hex-bg-svg"
			viewBox={`${-viewSize / 2} ${-viewSize / 2} ${viewSize} ${viewSize}`}
			preserveAspectRatio="xMidYMid slice"
			aria-hidden="true"
		>
			<g>
				{cells.map((h) => (
					<polygon
						key={h.id}
						id={h.id}
						className="hex-bg-cell"
						points={hexPoints(h.cx, h.cy, HEX_SIZE * 0.95)}
					/>
				))}
			</g>
		</svg>
	)
}

function hexPoints(cx: number, cy: number, size: number): string {
	const pts: string[] = []
	for (let i = 0; i < 6; i++) {
		// Pointy-top: first vertex straight up, march clockwise.
		const angle = (Math.PI / 3) * i - Math.PI / 2
		pts.push(
			`${(cx + size * Math.cos(angle)).toFixed(2)},${(cy + size * Math.sin(angle)).toFixed(2)}`,
		)
	}
	return pts.join(" ")
}

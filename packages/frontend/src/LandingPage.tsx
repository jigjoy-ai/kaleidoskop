import { useNavigate } from "react-router-dom"
import { DropZone, triggerUploadPicker } from "./components/DropZone"
import { track } from "./lib/analytics"

/**
 * Landing page rendered on `/`. Two CTAs:
 *   1. "See demo run" → navigate to /r/smoke-test, which auto-connects
 *      and plays the sample log shipped with the repo.
 *   2. "Upload baro audit log" → opens the OS file picker; the same
 *      window-level drop-zone listener mounted below also catches
 *      drag-and-drop anywhere on the page.
 *
 * No useReplayDriver, no hex grid, no event inspector — those load
 * only when you're actually on a run page. Keeps the landing fast and
 * focused on the two actions a first-time visitor needs.
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

			<div className="h-full flex flex-col bg-[var(--color-bg)]">
				<header className="flex items-center justify-between px-3 sm:px-5 py-3 border-b border-[var(--color-border)] bg-[var(--color-bg-elev)]">
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

				<main className="relative flex-1 flex flex-col items-center justify-center gap-8 sm:gap-10 p-6 sm:p-10 overflow-hidden">
					{/* Decorative hex-pattern background */}
					<HexBackdrop />

					<div className="relative z-10 max-w-2xl text-center space-y-4">
						<h1 className="font-mono text-3xl sm:text-5xl font-semibold tracking-tight">
							<span className="text-[var(--color-fg)]">kaleidoskop</span>
						</h1>
						<p className="text-sm sm:text-base text-[var(--color-fg-muted)] leading-relaxed">
							Replay your baro / Mozaik agent runs visually. Drop in an
							audit log and watch every bus event ripple through the agent
							honeycomb &mdash; tool calls, model messages, story spawns,
							verdicts, all in real time.
						</p>
					</div>

					<div className="relative z-10 flex flex-col sm:flex-row gap-3 sm:gap-4 w-full max-w-md sm:max-w-none sm:w-auto">
						<button
							type="button"
							onClick={goDemo}
							className="inline-flex items-center justify-center gap-2 rounded-md border border-[var(--color-accent-dim)] bg-[var(--color-accent)]/15 hover:bg-[var(--color-accent)]/25 px-5 sm:px-6 py-3 font-mono text-sm text-[var(--color-fg)] transition-colors shadow-[0_0_20px_rgba(185,123,255,0.15)]"
						>
							<span aria-hidden="true">▶</span>
							See demo run
						</button>
						<button
							type="button"
							onClick={goUpload}
							className="inline-flex items-center justify-center gap-2 rounded-md border border-[var(--color-border)] hover:border-[var(--color-fg-muted)] hover:bg-[#1a1a23] px-5 sm:px-6 py-3 font-mono text-sm text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] transition-colors"
						>
							<span aria-hidden="true">⬆</span>
							Upload baro audit log
						</button>
					</div>

					<p className="relative z-10 text-[11px] text-[var(--color-fg-muted)]/60 font-mono text-center max-w-md">
						JSONL audit logs from <code className="text-[var(--color-fg-muted)]">~/.baro/runs/</code>{" "}
						or any other Mozaik orchestration. Drag and drop works
						anywhere on the page.
					</p>
				</main>

				<footer className="px-5 py-3 border-t border-[var(--color-border)] text-[10px] uppercase tracking-[0.25em] text-[var(--color-fg-muted)]/70 text-center font-mono">
					jigjoy-ai · mozaik · baro
				</footer>
			</div>
		</>
	)
}

/**
 * Faint hex pattern in the background. Pure SVG, no DOM nodes per cell
 * — uses a <pattern> with a single polygon and tiles it.
 */
function HexBackdrop() {
	return (
		<svg
			className="absolute inset-0 w-full h-full opacity-[0.07] pointer-events-none"
			aria-hidden="true"
		>
			<defs>
				<pattern
					id="hex-bg"
					patternUnits="userSpaceOnUse"
					width="84"
					height="48"
					patternTransform="rotate(-4)"
				>
					<polygon
						points="14,0 42,0 56,24 42,48 14,48 0,24"
						fill="none"
						stroke="var(--color-fg)"
						strokeWidth="0.8"
					/>
				</pattern>
			</defs>
			<rect width="100%" height="100%" fill="url(#hex-bg)" />
		</svg>
	)
}

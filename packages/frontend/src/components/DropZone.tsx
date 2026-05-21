import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { uploadRun } from "../lib/uploadRun"

/**
 * Full-window drag-and-drop target. Listens to `dragenter` / `dragleave`
 * on the window so users can drop anywhere on the page, not just inside
 * a designated panel.
 *
 * The dragenter/leave bookkeeping uses a counter because child elements
 * fire their own enter/leave events as the cursor crosses them — naive
 * boolean toggling would flicker the overlay.
 *
 * On drop:
 *   - read file as text
 *   - POST to /api/runs
 *   - navigate to /r/<new id> so the page URL becomes shareable
 *
 * Also exposes an imperative `triggerFilePicker()` via window event for
 * the header "upload" button to invoke.
 */
const DROP_TRIGGER_EVENT = "kaleidoskop:open-file-picker"

export function triggerUploadPicker(): void {
	window.dispatchEvent(new CustomEvent(DROP_TRIGGER_EVENT))
}

export function DropZone() {
	const [dragActive, setDragActive] = useState(false)
	const [uploading, setUploading] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const counterRef = useRef(0)
	const inputRef = useRef<HTMLInputElement | null>(null)
	const navigate = useNavigate()

	const handleFile = async (file: File): Promise<void> => {
		setUploading(true)
		setError(null)
		try {
			const content = await file.text()
			const result = await uploadRun(content)
			navigate(`/r/${result.id}`)
		} catch (err) {
			setError((err as Error).message || "Upload failed")
			// Auto-clear error after 6 s so a transient failure doesn't
			// permanently pin a toast in the corner.
			setTimeout(() => setError(null), 6000)
		} finally {
			setUploading(false)
		}
	}

	useEffect(() => {
		const onDragEnter = (e: DragEvent) => {
			if (!e.dataTransfer?.types.includes("Files")) return
			counterRef.current++
			setDragActive(true)
		}
		const onDragLeave = () => {
			counterRef.current--
			if (counterRef.current <= 0) {
				counterRef.current = 0
				setDragActive(false)
			}
		}
		const onDragOver = (e: DragEvent) => {
			// preventDefault is mandatory to allow drop. Browsers default
			// behaviour on un-handled drop is to navigate to the file.
			if (e.dataTransfer?.types.includes("Files")) e.preventDefault()
		}
		const onDrop = (e: DragEvent) => {
			if (!e.dataTransfer?.types.includes("Files")) return
			e.preventDefault()
			counterRef.current = 0
			setDragActive(false)
			const file = e.dataTransfer.files[0]
			if (file) void handleFile(file)
		}
		const onTrigger = () => inputRef.current?.click()

		window.addEventListener("dragenter", onDragEnter)
		window.addEventListener("dragleave", onDragLeave)
		window.addEventListener("dragover", onDragOver)
		window.addEventListener("drop", onDrop)
		window.addEventListener(DROP_TRIGGER_EVENT, onTrigger)
		return () => {
			window.removeEventListener("dragenter", onDragEnter)
			window.removeEventListener("dragleave", onDragLeave)
			window.removeEventListener("dragover", onDragOver)
			window.removeEventListener("drop", onDrop)
			window.removeEventListener(DROP_TRIGGER_EVENT, onTrigger)
		}
	}, [])

	const onPicked = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0]
		if (file) void handleFile(file)
		// Reset value so picking the same file twice in a row still fires.
		e.target.value = ""
	}

	return (
		<>
			<input
				ref={inputRef}
				type="file"
				accept=".jsonl,.ndjson,application/jsonl,application/x-ndjson,text/plain"
				className="hidden"
				onChange={onPicked}
			/>

			{(dragActive || uploading) && (
				<div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-black/65 backdrop-blur-sm">
					<div className="rounded-xl border-2 border-dashed border-[var(--color-accent)] bg-[var(--color-bg-elev)] px-12 py-10 text-center shadow-[0_0_60px_rgba(185,123,255,0.35)]">
						<div className="font-mono text-2xl text-[var(--color-fg)]">
							{uploading ? "uploading…" : "drop audit log to replay"}
						</div>
						<div className="mt-2 text-xs text-[var(--color-fg-muted)]">
							{uploading
								? "parsing + persisting…"
								: ".jsonl from ~/.baro/runs/"}
						</div>
					</div>
				</div>
			)}

			{error && (
				<div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-md border border-red-500/40 bg-red-950/60 px-4 py-2 font-mono text-xs text-red-200 shadow-lg">
					upload failed: {error}
				</div>
			)}
		</>
	)
}

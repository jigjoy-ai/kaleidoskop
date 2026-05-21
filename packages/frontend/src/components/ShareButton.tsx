import { useState } from "react"
import { useParams } from "react-router-dom"
import { track } from "../lib/analytics"

/**
 * Header pill that copies the current URL to the clipboard so the user
 * can share their replay with a single click. Shows a transient
 * "copied!" confirmation pill.
 *
 * The shared URL works as-is because the run id is in the path —
 * anyone hitting the same backend storage (S3 in production) sees the
 * same replay. The backend's `/r/:id` SSR shim handles OG metadata for
 * platform previews; this button just hands out the link.
 */
export function ShareButton() {
	const params = useParams<{ id?: string }>()
	const [state, setState] = useState<"idle" | "copied" | "error">("idle")

	const shareTarget =
		typeof window !== "undefined"
			? window.location.origin + window.location.pathname
			: "/"
	const hasRun = !!params.id

	const onClick = async () => {
		try {
			await navigator.clipboard.writeText(shareTarget)
			setState("copied")
			track("share_clicked", { runId: params.id ?? null, target: shareTarget })
			setTimeout(() => setState("idle"), 1800)
		} catch {
			setState("error")
			setTimeout(() => setState("idle"), 1800)
		}
	}

	const label = (() => {
		if (state === "copied") return "copied!"
		if (state === "error") return "copy failed"
		return hasRun ? "share replay" : "share"
	})()

	return (
		<button
			type="button"
			onClick={onClick}
			className={
				"inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-[11px] transition-colors " +
				(state === "copied"
					? "border-[var(--color-accent-dim)] bg-[var(--color-accent)]/20 text-[var(--color-fg)]"
					: "border-[var(--color-border)] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] hover:bg-[#1a1a23]")
			}
			title={`Copy ${shareTarget} to clipboard`}
		>
			<span aria-hidden="true">{state === "copied" ? "✓" : "↗"}</span>
			{label}
		</button>
	)
}

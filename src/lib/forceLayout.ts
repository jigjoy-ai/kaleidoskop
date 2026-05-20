import {
	forceCenter,
	forceCollide,
	forceLink,
	forceManyBody,
	forceSimulation,
	forceX,
	forceY,
	type SimulationLinkDatum,
	type SimulationNodeDatum,
} from "d3-force"
import {
	OBSERVER_IDS,
	PARTICIPANTS,
	STORY_IDS,
	SUBSCRIBERS,
	EMITTERS,
} from "./participants"
import type { PixelCoord } from "./types"

export const HEX_SIZE = 38

interface ForceNode extends SimulationNodeDatum {
	id: string
	fx?: number | null
	fy?: number | null
}

interface ForceLink extends SimulationLinkDatum<ForceNode> {
	source: string | ForceNode
	target: string | ForceNode
	strength: number
}

// Build edges between participants that interact on the bus. For every domain
// event type, link the emitter(s) to each subscriber. We accumulate weights so
// pairs that interact across many event types end up with stronger links —
// Auditor (subscribed to everything) gets pulled toward the centre, Librarian
// + Sentry cluster on the function-call axis, story agents anchor near
// Conductor + StoryFactory.
function buildLinks(): ForceLink[] {
	const weights = new Map<string, number>()
	const key = (a: string, b: string) =>
		a < b ? `${a}__${b}` : `${b}__${a}`

	const domainEvents = Object.keys(EMITTERS) as (keyof typeof EMITTERS)[]
	for (const eventType of domainEvents) {
		const emitters = EMITTERS[eventType]
		const subs = SUBSCRIBERS[eventType]
		for (const emitter of emitters) {
			for (const sub of subs) {
				if (emitter === sub) continue
				const k = key(emitter, sub)
				weights.set(k, (weights.get(k) ?? 0) + 1)
			}
		}
	}

	const links: ForceLink[] = []
	for (const [k, weight] of weights) {
		const [a, b] = k.split("__")
		links.push({
			source: a,
			target: b,
			// Bound the link strength so a single hyper-connected node (Auditor)
			// doesn't dominate the layout. Cap at 6.
			strength: Math.min(weight, 6),
		})
	}
	return links
}

function seedPositions(nodes: ForceNode[]): void {
	// Deterministic-ish initial positions so the layout converges to roughly
	// the same shape on every reload. Conductor at centre, observers scattered
	// in an inner ring, story agents on an outer ring.
	const innerCount = OBSERVER_IDS.length + 2 // +2 for storyFactory, operator
	const outerCount = STORY_IDS.length
	for (let i = 0; i < nodes.length; i++) {
		const node = nodes[i]
		if (node.id === "conductor") {
			node.x = 0
			node.y = 0
		} else if (
			OBSERVER_IDS.includes(node.id) ||
			node.id === "story-factory" ||
			node.id === "operator"
		) {
			const ringIndex =
				OBSERVER_IDS.indexOf(node.id) >= 0
					? OBSERVER_IDS.indexOf(node.id)
					: node.id === "story-factory"
						? OBSERVER_IDS.length
						: OBSERVER_IDS.length + 1
			const angle = (ringIndex / innerCount) * 2 * Math.PI
			node.x = 110 * Math.cos(angle)
			node.y = 110 * Math.sin(angle)
		} else {
			// story agents
			const storyIndex = STORY_IDS.indexOf(node.id)
			const angle = (storyIndex / outerCount) * 2 * Math.PI - Math.PI / 2
			node.x = 220 * Math.cos(angle)
			node.y = 220 * Math.sin(angle)
		}
	}
}

export interface ForceLayoutResult {
	positions: Map<string, PixelCoord>
	viewBox: { x: number; y: number; w: number; h: number }
}

let cachedResult: ForceLayoutResult | null = null

export function computeForceLayout(): ForceLayoutResult {
	if (cachedResult) return cachedResult

	const nodes: ForceNode[] = PARTICIPANTS.map((p) => ({ id: p.id }))
	seedPositions(nodes)

	// Pin Conductor at origin so the network anchors there.
	const conductor = nodes.find((n) => n.id === "conductor")!
	conductor.fx = 0
	conductor.fy = 0

	const links = buildLinks()

	const simulation = forceSimulation<ForceNode>(nodes)
		.force(
			"link",
			forceLink<ForceNode, ForceLink>(links)
				.id((d) => d.id)
				.distance((l) => 105 - Math.min(35, l.strength * 6))
				.strength((l) => Math.min(0.95, 0.18 + l.strength * 0.08)),
		)
		.force("charge", forceManyBody().strength(-360))
		.force("center", forceCenter(0, 0))
		.force("collide", forceCollide(HEX_SIZE * 1.28))
		.force("x", forceX(0).strength(0.025))
		.force("y", forceY(0).strength(0.025))
		.stop()

	for (let i = 0; i < 320; i++) simulation.tick()

	// Release Conductor's pin so it can settle if the network pulls it sideways
	// — but realistically with the strong subscriber graph it stays near 0,0.
	conductor.fx = null
	conductor.fy = null

	const positions = new Map<string, PixelCoord>()
	let minX = 0
	let minY = 0
	let maxX = 0
	let maxY = 0
	for (const node of nodes) {
		const x = node.x ?? 0
		const y = node.y ?? 0
		positions.set(node.id, { x, y })
		if (x < minX) minX = x
		if (x > maxX) maxX = x
		if (y < minY) minY = y
		if (y > maxY) maxY = y
	}

	const padding = HEX_SIZE * 2
	const w = Math.max(maxX - minX, 200) + padding * 2
	const h = Math.max(maxY - minY, 200) + padding * 2
	// Centre the viewBox around the centroid so the network sits in the middle.
	const cx = (minX + maxX) / 2
	const cy = (minY + maxY) / 2

	cachedResult = {
		positions,
		viewBox: { x: cx - w / 2, y: cy - h / 2, w, h },
	}
	return cachedResult
}

export function viewBoxString(vb: ForceLayoutResult["viewBox"]): string {
	return `${vb.x} ${vb.y} ${vb.w} ${vb.h}`
}

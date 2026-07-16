"use client";

import {
	closestCorners,
	DndContext,
	type DragEndEvent,
	type DragOverEvent,
	DragOverlay,
	type DragStartEvent,
	PointerSensor,
	useDroppable,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	SortableContext,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { api } from "~/trpc/react";

// ---------------------------------------------------------------------------
// Types (mirrored from server ActivePlan so this client bundle stays off
// server-only code).
// ---------------------------------------------------------------------------
type MockTier = "vision" | "subject" | "global";
type Priority = "normal" | "high";
type Item = {
	id: number;
	kind: "study" | "mock";
	mockTier: MockTier | null;
	topicId: string | null;
	topicName: string | null;
	subtopicId: string | null;
	subtopicName: string | null;
	sectionId: string | null;
	sectionName: string | null;
	title: string | null;
	allocatedHours: number | null;
	plannedStart: string | null;
	plannedEnd: string | null;
	priority: Priority;
	orderIndex: number;
};
type View = "day" | "week" | "month";

const TIER_STYLE: Record<MockTier, string> = {
	vision: "bg-(--info-bg) text-(--info-fg) ring-1 ring-(--info-fg)/20",
	subject: "bg-(--warn-bg) text-(--warn-fg) ring-1 ring-(--warn-fg)/20",
	global: "bg-(--accent)/25 text-(--accent-light) ring-1 ring-(--accent)/40",
};
const TIER_LABEL: Record<MockTier, string> = {
	vision: "vision mock",
	subject: "subject mock",
	global: "full-length",
};

// ---------------------------------------------------------------------------
// Date helpers — UTC, date-only string math (mirrors src/server/core/plan.ts).
// ---------------------------------------------------------------------------
function todayISO(): string {
	return new Date().toISOString().slice(0, 10);
}
function addDays(iso: string, n: number): string {
	const d = new Date(`${iso}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + n);
	return d.toISOString().slice(0, 10);
}
// Monday of the ISO week containing `iso`.
function mondayOf(iso: string): string {
	const d = new Date(`${iso}T00:00:00Z`);
	const dow = (d.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
	return addDays(iso, -dow);
}
function monthKey(iso: string): string {
	return iso.slice(0, 7);
}

// Which bucket a date falls into, for the current view.
function bucketKeyFor(view: View, iso: string): string {
	if (view === "day") return iso;
	if (view === "week") return mondayOf(iso);
	return monthKey(iso);
}
// The start date to stamp on an item dropped into a bucket.
function bucketStart(view: View, key: string): string {
	if (view === "month") return `${key}-01`;
	return key; // day = the date, week = the Monday
}
// Last calendar day of a "YYYY-MM" month.
function lastOfMonth(mkey: string): string {
	const [y, m] = mkey.split("-").map(Number) as [number, number];
	const firstNext =
		m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
	return addDays(firstNext, -1);
}
// Inclusive [start, end] calendar span a bucket covers — used to detect which
// buckets a multi-day study block passes through.
function bucketRange(view: View, key: string): [string, string] {
	if (view === "day") return [key, key];
	if (view === "week") return [key, addDays(key, 6)];
	return [`${key}-01`, lastOfMonth(key)];
}

const MONTHS = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec",
];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function fmt(iso: string): { wd: string; label: string } {
	const d = new Date(`${iso}T00:00:00Z`);
	return {
		wd: WEEKDAYS[(d.getUTCDay() + 6) % 7]!,
		label: `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`,
	};
}
function bucketLabel(view: View, key: string): string {
	if (view === "day") {
		const { wd, label } = fmt(key);
		const isToday = key === todayISO();
		return `${wd} ${label}${isToday ? " · today" : ""}`;
	}
	if (view === "week") {
		const end = addDays(key, 6);
		return `Week of ${fmt(key).label} – ${fmt(end).label}`;
	}
	const [y, m] = key.split("-");
	return `${MONTHS[Number(m) - 1]} ${y}`;
}

// ---------------------------------------------------------------------------
// Build the ordered list of buckets to render + the item→bucket grouping.
// ---------------------------------------------------------------------------
function buildColumns(view: View, items: Item[], targetDate: string): string[] {
	const today = todayISO();
	const starts = items.map((i) => i.plannedStart ?? today);
	const lo = [today, targetDate, ...starts].reduce((a, b) => (a < b ? a : b));
	const hi = [today, targetDate, ...starts].reduce((a, b) => (a > b ? a : b));
	const keys: string[] = [];
	if (view === "day") {
		for (let d = lo; d <= hi; d = addDays(d, 1)) keys.push(d);
	} else if (view === "week") {
		for (let w = mondayOf(lo); w <= mondayOf(hi); w = addDays(w, 7))
			keys.push(w);
	} else {
		let m = monthKey(lo);
		const end = monthKey(hi);
		while (m <= end) {
			keys.push(m);
			const [y, mm] = m.split("-").map(Number) as [number, number];
			m = mm === 12 ? `${y + 1}-01` : `${y}-${String(mm + 1).padStart(2, "0")}`;
		}
	}
	return keys;
}

// ---------------------------------------------------------------------------
// Sortable card
// ---------------------------------------------------------------------------
function Card({
	item,
	onTogglePriority,
	onRemove,
	onExpand,
	dragging,
}: {
	item: Item;
	onTogglePriority: (i: Item) => void;
	onRemove: (i: Item) => void;
	onExpand: (i: Item) => void;
	dragging?: boolean;
}) {
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id: item.id });

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
		opacity: isDragging ? 0.4 : 1,
	};
	const isMock = item.kind === "mock";
	const label =
		item.subtopicName ?? item.title ?? item.topicName ?? `#${item.id}`;
	// For a subtopic node, its parent topic gives context on the meta line.
	const context = !isMock
		? ((item.subtopicName ? item.topicName : null) ?? item.sectionName)
		: null;

	return (
		<div
			className={`group flex items-center gap-2 rounded-xl border-l-4 bg-(--surface) px-3 py-2 text-sm ring-1 ${
				dragging ? "shadow-2xl" : ""
			} ${isMock ? "border-l-transparent" : "border-(--accent)"} ${
				item.priority === "high" ? "ring-amber-400/70" : "ring-(--ink)/10"
			}`}
			ref={setNodeRef}
			style={style}
		>
			{/* drag handle */}
			<button
				aria-label="Drag"
				className="cursor-grab touch-none text-(--ink)/30 hover:text-(--ink)/60"
				type="button"
				{...attributes}
				{...listeners}
			>
				⠿
			</button>

			<div className="flex min-w-0 flex-1 flex-col">
				<div className="flex items-center gap-2">
					{isMock && item.mockTier ? (
						<span
							className={`rounded-full px-2 py-0.5 font-medium text-[10px] uppercase tracking-wide ${TIER_STYLE[item.mockTier]}`}
						>
							{TIER_LABEL[item.mockTier]}
						</span>
					) : (
						<span className="rounded-full bg-(--accent) px-2 py-0.5 font-semibold text-(--accent-fg) text-[10px] uppercase tracking-wide">
							study
						</span>
					)}
					<span className="truncate font-medium">{label}</span>
				</div>
				<div className="flex items-center gap-2 text-(--ink)/50 text-xs">
					{context && <span className="truncate">{context}</span>}
					{item.allocatedHours != null && (
						<span className="tabular-nums">{item.allocatedHours}h</span>
					)}
					{item.plannedStart &&
						item.plannedEnd &&
						item.plannedStart !== item.plannedEnd && (
							<span className="tabular-nums">
								{fmt(item.plannedStart).label}→{fmt(item.plannedEnd).label}
							</span>
						)}
				</div>
			</div>

			{/* priority star */}
			<button
				aria-label={item.priority === "high" ? "Unstar" : "Mark high priority"}
				className={`text-base ${
					item.priority === "high"
						? "text-amber-400"
						: "text-(--ink)/20 hover:text-amber-400"
				}`}
				onClick={() => onTogglePriority(item)}
				type="button"
			>
				{item.priority === "high" ? "★" : "☆"}
			</button>

			{!isMock && (
				<button
					aria-label="Details"
					className="text-(--ink)/30 text-xs opacity-0 transition hover:text-(--ink)/70 group-hover:opacity-100"
					onClick={() => onExpand(item)}
					type="button"
				>
					info
				</button>
			)}
			<button
				aria-label="Remove"
				className="text-(--ink)/30 opacity-0 transition hover:text-red-400 group-hover:opacity-100"
				onClick={() => onRemove(item)}
				type="button"
			>
				✕
			</button>
		</div>
	);
}

// A slim, non-draggable "you're still on this topic" marker shown in every
// bucket a multi-period study block passes through (after its start bucket).
function Continuation({ item }: { item: Item }) {
	return (
		<div className="flex items-center gap-2 rounded-xl border-(--accent)/40 border-l-4 border-dashed bg-(--ink)/5 px-3 py-1.5 text-(--ink)/55 text-xs">
			<span className="text-(--ink)/30">↳</span>
			<span className="truncate">
				still studying{" "}
				<span className="font-medium text-(--ink)/75">
					{item.subtopicName ?? item.title ?? item.topicName}
				</span>
			</span>
			{item.plannedEnd && (
				<span className="tabular-nums">
					· through {fmt(item.plannedEnd).label}
				</span>
			)}
		</div>
	);
}

// A droppable bucket row (accepts drops even when empty).
function Bucket({
	view,
	bucketKey,
	itemIds,
	items,
	continuations,
	handlers,
}: {
	view: View;
	bucketKey: string;
	itemIds: number[];
	items: Map<number, Item>;
	continuations: Item[];
	handlers: {
		onTogglePriority: (i: Item) => void;
		onRemove: (i: Item) => void;
		onExpand: (i: Item) => void;
	};
}) {
	const { setNodeRef, isOver } = useDroppable({ id: `bucket:${bucketKey}` });
	const hours = itemIds.reduce(
		(a, id) => a + (items.get(id)?.allocatedHours ?? 0),
		0,
	);
	const empty = itemIds.length === 0 && continuations.length === 0;
	return (
		<div className="flex flex-col gap-2">
			<div className="flex items-baseline justify-between border-(--ink)/10 border-b pb-1">
				<h3 className="font-semibold text-sm">
					{bucketLabel(view, bucketKey)}
				</h3>
				<span className="text-(--ink)/40 text-xs tabular-nums">
					{itemIds.length ? `${Math.round(hours * 10) / 10}h` : "—"}
				</span>
			</div>
			<SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
				<div
					className={`flex min-h-12 flex-col gap-2 rounded-xl p-2 transition ${
						isOver ? "bg-(--accent)/10 ring-(--accent)/40 ring-1" : ""
					}`}
					ref={setNodeRef}
				>
					{empty && (
						<p className="px-1 py-2 text-(--ink)/25 text-xs">drop here</p>
					)}
					{itemIds.map((id) => {
						const it = items.get(id);
						if (!it) return null;
						return <Card item={it} key={id} {...handlers} />;
					})}
					{continuations.map((it) => (
						<Continuation item={it} key={`cont-${it.id}`} />
					))}
				</div>
			</SortableContext>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Board
// ---------------------------------------------------------------------------
export function PlanBoard({
	examId,
	examName,
}: {
	examId: string;
	examName: string;
}) {
	const utils = api.useUtils();
	const plan = api.plan.active.useQuery({ examId });
	const syllabus = api.exam.syllabus.useQuery({ examId });
	const topicOptions = api.plan.topicOptions.useQuery({ examId });

	const [view, setView] = useState<View>("week");
	useEffect(() => {
		const v = localStorage.getItem("catac-plan-view");
		if (v === "day" || v === "week" || v === "month") setView(v);
	}, []);
	const pickView = (v: View) => {
		setView(v);
		try {
			localStorage.setItem("catac-plan-view", v);
		} catch {
			// storage disabled — still applies this session
		}
	};

	// `drag` holds the live arrangement ONLY while a gesture is in flight; the
	// rest of the time the board is derived from server data (`committed`) so
	// there's no setState-in-effect loop and edits reflect immediately.
	const [drag, setDrag] = useState<Record<string, number[]> | null>(null);
	const [activeId, setActiveId] = useState<number | null>(null);
	const [detail, setDetail] = useState<Item | null>(null);

	const serverItems = plan.data?.items ?? [];
	const itemsById = useMemo(
		() => new Map<number, Item>(serverItems.map((i) => [i.id, i as Item])),
		[serverItems],
	);

	const columns = useMemo(
		() =>
			plan.data
				? buildColumns(view, serverItems as Item[], plan.data.targetDate)
				: [],
		[view, serverItems, plan.data],
	);

	// Server items grouped into buckets for the current view (pure derivation).
	const committed = useMemo(() => {
		const grouped: Record<string, number[]> = {};
		for (const key of columns) grouped[key] = [];
		const sorted = [...serverItems].sort((a, b) => a.orderIndex - b.orderIndex);
		for (const it of sorted) {
			const key = bucketKeyFor(view, it.plannedStart ?? todayISO());
			if (!grouped[key]) grouped[key] = [];
			grouped[key].push(it.id);
		}
		return grouped;
	}, [columns, view, serverItems]);

	// What the UI renders: the in-flight drag arrangement, else the committed one.
	const board = activeId != null && drag ? drag : committed;

	// For each bucket, the study blocks that PASS THROUGH it but start earlier —
	// shown as faded "still studying" markers so no period looks mock-only while
	// you're mid-topic.
	const continuationsByBucket = useMemo(() => {
		const out: Record<string, Item[]> = {};
		for (const key of columns) {
			const [bStart, bEnd] = bucketRange(view, key);
			out[key] = serverItems.filter((it) => {
				if (it.kind !== "study" || !it.plannedStart || !it.plannedEnd)
					return false;
				const startsHere = bucketKeyFor(view, it.plannedStart) === key;
				const overlaps = it.plannedStart <= bEnd && it.plannedEnd >= bStart;
				return overlaps && !startsHere;
			}) as Item[];
		}
		return out;
	}, [columns, view, serverItems]);

	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
	);

	const move = api.plan.move.useMutation({
		onMutate: ({ itemId, plannedStart }) => {
			utils.plan.active.setData({ examId }, (old) =>
				old
					? {
							...old,
							items: old.items.map((i) => {
								if (i.id !== itemId) return i;
								const dur =
									i.plannedStart && i.plannedEnd
										? Math.max(
												0,
												Math.round(
													(Date.parse(i.plannedEnd) -
														Date.parse(i.plannedStart)) /
														86_400_000,
												),
											)
										: 0;
								return {
									...i,
									plannedStart,
									plannedEnd: addDays(plannedStart, dur),
								};
							}),
						}
					: old,
			);
		},
		onSettled: () => utils.plan.active.invalidate({ examId }),
	});
	const reorder = api.plan.reorder.useMutation({
		onMutate: ({ orderedIds }) => {
			const rank = new Map(orderedIds.map((id, i) => [id, i]));
			utils.plan.active.setData({ examId }, (old) =>
				old
					? {
							...old,
							items: old.items.map((i) => ({
								...i,
								orderIndex: rank.get(i.id) ?? i.orderIndex,
							})),
						}
					: old,
			);
		},
		onSettled: () => utils.plan.active.invalidate({ examId }),
	});
	const setPriority = api.plan.setPriority.useMutation({
		onMutate: async ({ itemId, priority }) => {
			// optimistic star toggle
			const prev = utils.plan.active.getData({ examId });
			utils.plan.active.setData({ examId }, (old) =>
				old
					? {
							...old,
							items: old.items.map((i) =>
								i.id === itemId ? { ...i, priority } : i,
							),
						}
					: old,
			);
			return { prev };
		},
		onError: (_e, _v, ctx) => {
			if (ctx?.prev) utils.plan.active.setData({ examId }, ctx.prev);
		},
		onSettled: () => utils.plan.active.invalidate({ examId }),
	});
	const removeItem = api.plan.removeItem.useMutation({
		onSettled: () => utils.plan.active.invalidate({ examId }),
	});
	const addItem = api.plan.addItem.useMutation({
		onSettled: () => utils.plan.active.invalidate({ examId }),
	});

	function bucketOf(
		map: Record<string, number[]>,
		id: number,
	): string | undefined {
		return Object.keys(map).find((k) => map[k]?.includes(id));
	}

	function onDragStart(e: DragStartEvent) {
		setDrag(committed); // snapshot the current arrangement to mutate live
		setActiveId(Number(e.active.id));
	}

	function onDragOver(e: DragOverEvent) {
		const { active, over } = e;
		if (!over) return;
		const aId = Number(active.id);
		const overId = over.id.toString();
		setDrag((prev) => {
			const base = prev ?? committed;
			const from = bucketOf(base, aId);
			const to = overId.startsWith("bucket:")
				? overId.slice(7)
				: bucketOf(base, Number(over.id));
			if (!from || !to || from === to) return base;
			const next = { ...base };
			const fromArr = [...(next[from] ?? [])];
			const toArr = [...(next[to] ?? [])];
			const idx = fromArr.indexOf(aId);
			if (idx !== -1) fromArr.splice(idx, 1);
			// insert before the item we're hovering, else append
			const overIdx = toArr.indexOf(Number(over.id));
			if (overIdx === -1) toArr.push(aId);
			else toArr.splice(overIdx, 0, aId);
			next[from] = fromArr;
			next[to] = toArr;
			return next;
		});
	}

	function onDragEnd(e: DragEndEvent) {
		const { active, over } = e;
		const id = Number(active.id);
		const working = { ...(drag ?? committed) };

		// Reorder within the final bucket if we dropped on a sibling.
		if (over && !over.id.toString().startsWith("bucket:")) {
			const bucket = bucketOf(working, id);
			if (bucket) {
				const arr = [...(working[bucket] ?? [])];
				const oldIdx = arr.indexOf(id);
				const newIdx = arr.indexOf(Number(over.id));
				if (oldIdx !== -1 && newIdx !== -1 && oldIdx !== newIdx) {
					arr.splice(newIdx, 0, arr.splice(oldIdx, 1)[0]!);
					working[bucket] = arr;
				}
			}
		}

		// Persist: (1) if the item changed bucket, move its dates; (2) reorder all.
		const item = itemsById.get(id);
		const finalBucket = bucketOf(working, id);
		if (over && item && finalBucket) {
			const originalBucket = bucketKeyFor(
				view,
				item.plannedStart ?? todayISO(),
			);
			if (finalBucket !== originalBucket) {
				move.mutate({
					itemId: id,
					plannedStart: bucketStart(view, finalBucket),
				});
			}
		}
		// flat global order across columns (+ any stray bucket, for safety)
		const ordered: number[] = [];
		for (const key of columns)
			for (const iid of working[key] ?? []) ordered.push(iid);
		for (const key of Object.keys(working))
			if (!columns.includes(key))
				for (const iid of working[key] ?? []) ordered.push(iid);
		reorder.mutate({ orderedIds: ordered });

		setDrag(null);
		setActiveId(null);
	}

	const handlers = {
		onTogglePriority: (i: Item) =>
			setPriority.mutate({
				itemId: i.id,
				priority: i.priority === "high" ? "normal" : "high",
			}),
		onRemove: (i: Item) => removeItem.mutate({ itemId: i.id }),
		onExpand: (i: Item) => setDetail(i),
	};

	const activeItem = activeId != null ? itemsById.get(activeId) : null;

	if (plan.isLoading) {
		return (
			<main className="app-bg flex min-h-screen items-center justify-center text-(--ink)/60">
				loading plan…
			</main>
		);
	}

	if (!plan.data) {
		return (
			<main className="app-bg flex min-h-screen flex-col items-center text-(--ink)">
				<div className="container flex flex-col gap-4 px-4 py-12">
					<Link
						className="text-(--ink)/60 text-sm hover:text-(--ink)"
						href={`/exam/${examId}`}
					>
						← {examName}
					</Link>
					<h1 className="font-extrabold text-4xl tracking-tight">Study plan</h1>
					<div className="rounded-xl bg-(--ink)/5 p-6 text-(--ink)/70">
						<p className="font-medium">No plan yet.</p>
						<p className="mt-1 text-sm">
							Run <code className="rounded bg-(--inset) px-1">/plan-exam</code>{" "}
							in Claude — it asks your exam date and daily hours, then builds a
							dated plan (with mocks) you can drag around here.
						</p>
					</div>
				</div>
			</main>
		);
	}

	return (
		<main className="app-bg flex min-h-screen flex-col items-center text-(--ink)">
			<div className="container flex flex-col gap-6 px-4 py-12">
				{/* header */}
				<div className="flex flex-col gap-1">
					<div className="flex items-center justify-between">
						<Link
							className="text-(--ink)/60 text-sm hover:text-(--ink)"
							href={`/exam/${examId}`}
						>
							← {examName}
						</Link>
						<Link
							className="text-(--ink)/60 text-sm hover:text-(--ink)"
							href={`/exam/${examId}/mocks`}
						>
							mocks →
						</Link>
					</div>
					<h1 className="font-extrabold text-4xl tracking-tight">Study plan</h1>
					<p className="text-(--ink)/70 text-sm">
						{plan.data.daysRemaining} days to {plan.data.targetDate} ·{" "}
						{plan.data.totalAllocatedHours}h planned · {serverItems.length}{" "}
						items
					</p>
				</div>

				{/* controls */}
				<div className="flex flex-wrap items-center justify-between gap-3">
					<div className="inline-flex overflow-hidden rounded-lg ring-(--ink)/15 ring-1">
						{(["day", "week", "month"] as const).map((v) => (
							<button
								className={`px-3 py-1.5 font-medium text-sm capitalize transition ${
									view === v
										? "bg-(--accent) text-(--accent-fg)"
										: "text-(--ink)/60 hover:bg-(--ink)/10"
								}`}
								key={v}
								onClick={() => pickView(v)}
								type="button"
							>
								{v}
							</button>
						))}
					</div>
					<AddNode
						onAdd={(payload) => addItem.mutate({ examId, ...payload })}
						studyOptions={topicOptions.data ?? []}
					/>
				</div>

				{/* legend */}
				<div className="flex flex-wrap items-center gap-3 text-(--ink)/50 text-xs">
					<Legend className={TIER_STYLE.vision} label="vision (topic mock)" />
					<Legend className={TIER_STYLE.subject} label="subject (sectional)" />
					<Legend className={TIER_STYLE.global} label="full-length" />
					<span className="flex items-center gap-1">
						<span className="text-amber-400">★</span> high priority
					</span>
					<span>drag ⠿ to reorder or move between {view}s</span>
				</div>

				{/* board */}
				<DndContext
					collisionDetection={closestCorners}
					onDragEnd={onDragEnd}
					onDragOver={onDragOver}
					onDragStart={onDragStart}
					sensors={sensors}
				>
					<div className="flex flex-col gap-6">
						{columns.map((key) => (
							<Bucket
								bucketKey={key}
								continuations={continuationsByBucket[key] ?? []}
								handlers={handlers}
								itemIds={board[key] ?? []}
								items={itemsById}
								key={key}
								view={view}
							/>
						))}
					</div>
					<DragOverlay>
						{activeItem ? (
							<Card
								dragging
								item={activeItem}
								onExpand={() => {}}
								onRemove={() => {}}
								onTogglePriority={() => {}}
							/>
						) : null}
					</DragOverlay>
				</DndContext>
			</div>

			{detail && (
				<DetailModal
					item={detail}
					onClose={() => setDetail(null)}
					syllabus={syllabus.data}
				/>
			)}
		</main>
	);
}

function Legend({ className, label }: { className: string; label: string }) {
	return (
		<span className="flex items-center gap-1">
			<span className={`h-3 w-3 rounded-full ${className}`} />
			{label}
		</span>
	);
}

// Add-a-node popover: a study topic or a mock.
function AddNode({
	studyOptions,
	onAdd,
}: {
	studyOptions: {
		subtopicId: string;
		subtopicName: string;
		topicId: string;
		topicName: string;
		sectionId: string;
		sectionName: string;
	}[];
	onAdd: (payload: {
		kind: "study" | "mock";
		topicId?: string;
		subtopicId?: string;
		sectionId?: string;
		mockTier?: MockTier;
		title?: string;
		plannedStart?: string;
	}) => void;
}) {
	const [open, setOpen] = useState(false);
	const [kind, setKind] = useState<"study" | "mock">("study");
	const [subtopicId, setSubtopicId] = useState("");
	const [tier, setTier] = useState<MockTier>("global");
	const [title, setTitle] = useState("");
	const [date, setDate] = useState(todayISO());

	function submit() {
		if (kind === "study") {
			if (!subtopicId) return;
			const t = studyOptions.find((o) => o.subtopicId === subtopicId);
			onAdd({
				kind: "study",
				subtopicId,
				topicId: t?.topicId,
				sectionId: t?.sectionId,
				plannedStart: date,
			});
		} else {
			onAdd({
				kind: "mock",
				mockTier: tier,
				title: title || `${TIER_LABEL[tier]}`,
				plannedStart: date,
			});
		}
		setOpen(false);
		setTitle("");
	}

	if (!open) {
		return (
			<button
				className="rounded-lg bg-(--accent) px-3 py-1.5 font-medium text-(--accent-fg) text-sm hover:bg-(--accent-light)"
				onClick={() => setOpen(true)}
				type="button"
			>
				+ add node
			</button>
		);
	}

	return (
		<div className="flex flex-wrap items-center gap-2 rounded-xl bg-(--surface) p-3 ring-(--ink)/10 ring-1">
			<div className="inline-flex overflow-hidden rounded-lg ring-(--ink)/15 ring-1">
				{(["study", "mock"] as const).map((k) => (
					<button
						className={`px-2.5 py-1 text-sm capitalize ${
							kind === k
								? "bg-(--accent) text-(--accent-fg)"
								: "text-(--ink)/60"
						}`}
						key={k}
						onClick={() => setKind(k)}
						type="button"
					>
						{k}
					</button>
				))}
			</div>

			{kind === "study" ? (
				<select
					className="max-w-72 rounded-lg bg-(--inset) px-2 py-1 text-sm"
					onChange={(e) => setSubtopicId(e.target.value)}
					value={subtopicId}
				>
					<option value="">choose subtopic…</option>
					{studyOptions.map((o) => (
						<option key={o.subtopicId} value={o.subtopicId}>
							{o.topicName} › {o.subtopicName}
						</option>
					))}
				</select>
			) : (
				<>
					<select
						className="rounded-lg bg-(--inset) px-2 py-1 text-sm"
						onChange={(e) => setTier(e.target.value as MockTier)}
						value={tier}
					>
						<option value="vision">vision (topic)</option>
						<option value="subject">subject (sectional)</option>
						<option value="global">full-length</option>
					</select>
					<input
						className="rounded-lg bg-(--inset) px-2 py-1 text-sm"
						onChange={(e) => setTitle(e.target.value)}
						placeholder="name (optional)"
						value={title}
					/>
				</>
			)}

			<input
				className="rounded-lg bg-(--inset) px-2 py-1 text-sm"
				onChange={(e) => setDate(e.target.value)}
				type="date"
				value={date}
			/>
			<button
				className="rounded-lg bg-(--accent) px-3 py-1 font-medium text-(--accent-fg) text-sm"
				onClick={submit}
				type="button"
			>
				add
			</button>
			<button
				className="px-2 py-1 text-(--ink)/50 text-sm hover:text-(--ink)"
				onClick={() => setOpen(false)}
				type="button"
			>
				cancel
			</button>
		</div>
	);
}

// Material shipped per subtopic (mirror of server SubtopicMaterial).
type Material = {
	frequency?: "high" | "medium" | "low" | "rare";
	summary?: string;
	formulas?: string[];
	keyIdeas?: string[];
	example?: { q: string; solution: string };
	traps?: string[];
};
type SyllabusSection = {
	topics: {
		id: string;
		name: string;
		subtopics: { id: string; name: string; materialJson?: Material | null }[];
	}[];
};

// Study-item detail: the subtopic's actual study material (concept, formulas,
// example, traps) — the same content shown on the main tracker page. Falls back
// to a topic's subtopic list for topic-level nodes.
function DetailModal({
	item,
	syllabus,
	onClose,
}: {
	item: Item;
	syllabus: SyllabusSection[] | undefined;
	onClose: () => void;
}) {
	const topics = syllabus?.flatMap((s) => s.topics) ?? [];
	const topic = topics.find((t) => t.id === item.topicId);
	const sub = item.subtopicId
		? topics.flatMap((t) => t.subtopics).find((x) => x.id === item.subtopicId)
		: null;
	const mat = sub?.materialJson ?? null;
	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
			onClick={onClose}
			role="presentation"
		>
			<div
				aria-modal="true"
				className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl bg-(--surface) p-6 text-(--ink) shadow-2xl ring-(--ink)/10 ring-1"
				onClick={(e) => e.stopPropagation()}
				role="dialog"
			>
				<div className="flex items-start justify-between gap-4">
					<div>
						<h2 className="font-bold text-xl">
							{item.subtopicName ?? item.title ?? item.topicName}
						</h2>
						<p className="text-(--ink)/50 text-sm">
							{[item.topicName, item.sectionName].filter(Boolean).join(" · ")}
						</p>
					</div>
					<button
						aria-label="Close"
						className="text-(--ink)/50 hover:text-(--ink)"
						onClick={onClose}
						type="button"
					>
						✕
					</button>
				</div>
				<div className="mt-3 flex flex-wrap gap-3 text-(--ink)/60 text-sm">
					{item.allocatedHours != null && (
						<span>{item.allocatedHours}h allocated</span>
					)}
					{item.plannedStart && (
						<span>
							{fmt(item.plannedStart).label}
							{item.plannedEnd && item.plannedEnd !== item.plannedStart
								? ` → ${fmt(item.plannedEnd).label}`
								: ""}
						</span>
					)}
				</div>

				{mat ? (
					<div className="mt-4 flex flex-col gap-3">
						{mat.frequency && (
							<span className="inline-block w-fit rounded-full bg-(--ink)/10 px-2 py-0.5 text-(--ink)/70 text-xs">
								{mat.frequency} frequency
							</span>
						)}
						{mat.summary && (
							<p className="text-(--ink)/80 text-sm">{mat.summary}</p>
						)}
						{mat.formulas && mat.formulas.length > 0 && (
							<div>
								<p className="font-semibold text-(--ink)/60 text-xs uppercase tracking-wide">
									Formulas
								</p>
								<ul className="mt-1 flex flex-col gap-1">
									{mat.formulas.map((f) => (
										<li
											className="rounded bg-(--inset) px-2 py-1 font-mono text-(--accent-light) text-sm"
											key={f}
										>
											{f}
										</li>
									))}
								</ul>
							</div>
						)}
						{mat.keyIdeas && mat.keyIdeas.length > 0 && (
							<div>
								<p className="font-semibold text-(--ink)/60 text-xs uppercase tracking-wide">
									Key ideas
								</p>
								<ul className="mt-1 list-disc pl-5 text-(--ink)/80 text-sm">
									{mat.keyIdeas.map((k) => (
										<li key={k}>{k}</li>
									))}
								</ul>
							</div>
						)}
						{mat.example && (
							<div>
								<p className="font-semibold text-(--ink)/60 text-xs uppercase tracking-wide">
									Worked example
								</p>
								<p className="mt-1 text-(--ink)/80 text-sm">{mat.example.q}</p>
								<p className="mt-1 rounded bg-(--ok-bg) px-2 py-1 text-(--ok-fg) text-sm">
									{mat.example.solution}
								</p>
							</div>
						)}
						{mat.traps && mat.traps.length > 0 && (
							<div>
								<p className="font-semibold text-(--ink)/60 text-xs uppercase tracking-wide">
									Common traps
								</p>
								<ul className="mt-1 list-disc pl-5 text-(--warn-fg) text-sm">
									{mat.traps.map((tp) => (
										<li key={tp}>{tp}</li>
									))}
								</ul>
							</div>
						)}
					</div>
				) : topic && topic.subtopics.length > 0 ? (
					<div className="mt-4">
						<p className="font-semibold text-(--ink)/60 text-xs uppercase tracking-wide">
							Subtopics
						</p>
						<ul className="mt-2 flex flex-col gap-1">
							{topic.subtopics.map((s) => (
								<li
									className="rounded bg-(--ink)/5 px-2 py-1 text-sm"
									key={s.id}
								>
									{s.name}
								</li>
							))}
						</ul>
					</div>
				) : (
					<p className="mt-4 text-(--ink)/50 text-sm">
						No material yet — enrich it with the{" "}
						<code className="rounded bg-(--inset) px-1">/enrich-material</code>{" "}
						skill.
					</p>
				)}
			</div>
		</div>
	);
}

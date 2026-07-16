"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { SkillCta, SkillDialog } from "~/app/_components/skill-dialog";
import { api } from "~/trpc/react";

// ---------------------------------------------------------------------------
// Types (mirror the calendar core; keeps this client bundle off server code).
// ---------------------------------------------------------------------------
type Event = {
	id: number;
	examId: string;
	examName: string;
	kind: string;
	label: string;
	date: string;
	endDate: string | null;
	notes: string | null;
	source: string | null;
};

// Per-exam colour. Fixed Tailwind palette classes (not theme tokens) so each
// exam reads distinctly in light and dark.
const EXAM_COLOR: Record<
	string,
	{ dot: string; chip: string; text: string; band: string }
> = {
	cat: {
		dot: "bg-violet-500",
		chip: "bg-violet-500/20 ring-1 ring-violet-500/40",
		text: "text-violet-500 dark:text-violet-300",
		band: "bg-violet-500/40",
	},
	gmat: {
		dot: "bg-sky-500",
		chip: "bg-sky-500/20 ring-1 ring-sky-500/40",
		text: "text-sky-500 dark:text-sky-300",
		band: "bg-sky-500/40",
	},
	xat: {
		dot: "bg-emerald-500",
		chip: "bg-emerald-500/20 ring-1 ring-emerald-500/40",
		text: "text-emerald-500 dark:text-emerald-300",
		band: "bg-emerald-500/40",
	},
	snap: {
		dot: "bg-amber-500",
		chip: "bg-amber-500/20 ring-1 ring-amber-500/40",
		text: "text-amber-600 dark:text-amber-300",
		band: "bg-amber-500/40",
	},
	nmat: {
		dot: "bg-rose-500",
		chip: "bg-rose-500/20 ring-1 ring-rose-500/40",
		text: "text-rose-500 dark:text-rose-300",
		band: "bg-rose-500/40",
	},
};
const colorOf = (id: string) => EXAM_COLOR[id] ?? EXAM_COLOR.cat!;

const KIND_ICON: Record<string, string> = {
	registration: "📝",
	admit_card: "🎫",
	exam_day: "✏️",
	result: "🏆",
	window: "🗓️",
	other: "ℹ️",
};
const kindIcon = (k: string) => KIND_ICON[k] ?? "•";

const MONTHS = [
	"January",
	"February",
	"March",
	"April",
	"May",
	"June",
	"July",
	"August",
	"September",
	"October",
	"November",
	"December",
];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// --- date helpers (UTC, date-only) ---------------------------------------
function todayISO(): string {
	return new Date().toISOString().slice(0, 10);
}
function iso(y: number, m: number, d: number): string {
	return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
function daysFromToday(target: string): number {
	return Math.round(
		(Date.parse(`${target}T00:00:00Z`) -
			Date.parse(`${todayISO()}T00:00:00Z`)) /
			86_400_000,
	);
}
function fmtShort(isoStr: string): string {
	const d = new Date(`${isoStr}T00:00:00Z`);
	return `${MONTHS[d.getUTCMonth()]!.slice(0, 3)} ${d.getUTCDate()}`;
}
function countdown(n: number): string {
	if (n === 0) return "today";
	if (n < 0) return `${-n}d ago`;
	if (n < 45) return `in ${n}d`;
	return `in ${Math.round(n / 7)}w`;
}

export function CalendarView() {
	const events = api.calendar.events.useQuery();
	const exams = api.calendar.exams.useQuery();
	const lastUpdated = api.calendar.lastUpdated.useQuery();

	const [hidden, setHidden] = useState<Set<string>>(new Set());
	const [detail, setDetail] = useState<Event | null>(null);
	const [refreshOpen, setRefreshOpen] = useState(false);

	// Start on the month of the next upcoming exam-day (or this month).
	const [cursor, setCursor] = useState(() => {
		const t = new Date();
		return { y: t.getUTCFullYear(), m: t.getUTCMonth() };
	});

	// "Whenever I'm here, ask me": prompt once per browser session to refresh.
	useEffect(() => {
		if (sessionStorage.getItem("catac-cal-refresh-asked")) return;
		sessionStorage.setItem("catac-cal-refresh-asked", "1");
		setRefreshOpen(true);
	}, []);

	const all = (events.data ?? []) as Event[];
	const visible = all.filter((e) => !hidden.has(e.examId));

	// Index events by day for the grid.
	const { chipsByDay, bandsByDay } = useMemo(() => {
		const chips: Record<string, Event[]> = {};
		const bands: Record<string, Event[]> = {};
		for (const e of visible) {
			(chips[e.date] ??= []).push(e);
			if (e.endDate && e.endDate !== e.date) {
				(chips[e.endDate] ??= []).push(e); // mark the closing day too
				// tint the days strictly inside the window
				for (
					let d = e.date;
					d < e.endDate;
					d = new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000)
						.toISOString()
						.slice(0, 10)
				) {
					if (d !== e.date) (bands[d] ??= []).push(e);
				}
			}
		}
		return { chipsByDay: chips, bandsByDay: bands };
	}, [visible]);

	const upcoming = useMemo(
		() =>
			[...visible]
				.filter((e) => daysFromToday(e.endDate ?? e.date) >= 0)
				.sort((a, b) => a.date.localeCompare(b.date))
				.slice(0, 10),
		[visible],
	);

	// Build the month grid (Sun-first).
	const firstDow = new Date(Date.UTC(cursor.y, cursor.m, 1)).getUTCDay();
	const daysInMonth = new Date(
		Date.UTC(cursor.y, cursor.m + 1, 0),
	).getUTCDate();
	const cells: (number | null)[] = [];
	for (let i = 0; i < firstDow; i++) cells.push(null);
	for (let d = 1; d <= daysInMonth; d++) cells.push(d);
	while (cells.length % 7 !== 0) cells.push(null);

	const step = (delta: number) => {
		setCursor((c) => {
			const m = c.m + delta;
			if (m < 0) return { y: c.y - 1, m: 11 };
			if (m > 11) return { y: c.y + 1, m: 0 };
			return { y: c.y, m };
		});
	};

	const toggleExam = (id: string) =>
		setHidden((h) => {
			const n = new Set(h);
			if (n.has(id)) n.delete(id);
			else n.add(id);
			return n;
		});

	const updated = lastUpdated.data
		? new Date(lastUpdated.data).toLocaleDateString(undefined, {
				month: "short",
				day: "numeric",
				year: "numeric",
			})
		: null;

	return (
		<main className="app-bg flex min-h-screen flex-col items-center text-(--ink)">
			<div className="container flex flex-col gap-6 px-4 py-12">
				{/* header */}
				<div className="flex flex-col gap-1">
					<Link className="text-(--ink)/60 text-sm hover:text-(--ink)" href="/">
						← all exams
					</Link>
					<div className="flex flex-wrap items-end justify-between gap-3">
						<div>
							<h1 className="font-extrabold text-4xl tracking-tight">
								Exam calendar
							</h1>
							<p className="text-(--ink)/70 text-sm">
								Key dates for CAT, GMAT, XAT, SNAP & NMAT
								{updated ? ` · dates as of ${updated}` : ""}
							</p>
						</div>
						<SkillCta
							blurb="Claude web-searches the official sites for the latest registration, admit-card, exam and result dates for all five exams, then updates this calendar."
							command="/refresh-exam-dates"
							label="↻ Refresh dates"
						/>
					</div>
				</div>

				{/* legend / filters */}
				<div className="flex flex-wrap items-center gap-2">
					{(exams.data ?? []).map((ex) => {
						const c = colorOf(ex.id);
						const off = hidden.has(ex.id);
						return (
							<button
								className={`flex items-center gap-2 rounded-full px-3 py-1 text-sm ring-1 transition ${
									off
										? "text-(--ink)/40 ring-(--ink)/10"
										: `${c.chip} ${c.text}`
								}`}
								key={ex.id}
								onClick={() => toggleExam(ex.id)}
								type="button"
							>
								<span className={`h-2.5 w-2.5 rounded-full ${c.dot}`} />
								{ex.name}
							</button>
						);
					})}
					<span className="ml-1 text-(--ink)/40 text-xs">tap to filter</span>
				</div>

				<div className="flex flex-col gap-6 lg:flex-row">
					{/* calendar grid */}
					<div className="flex-1">
						<div className="mb-3 flex items-center justify-between">
							<h2 className="font-bold text-xl">
								{MONTHS[cursor.m]} {cursor.y}
							</h2>
							<div className="flex items-center gap-1">
								<button
									aria-label="Previous month"
									className="rounded-lg px-3 py-1 text-(--ink)/60 ring-(--ink)/15 ring-1 hover:bg-(--ink)/10"
									onClick={() => step(-1)}
									type="button"
								>
									←
								</button>
								<button
									className="rounded-lg px-3 py-1 text-(--ink)/60 text-sm ring-(--ink)/15 ring-1 hover:bg-(--ink)/10"
									onClick={() => {
										const t = new Date();
										setCursor({ y: t.getUTCFullYear(), m: t.getUTCMonth() });
									}}
									type="button"
								>
									today
								</button>
								<button
									aria-label="Next month"
									className="rounded-lg px-3 py-1 text-(--ink)/60 ring-(--ink)/15 ring-1 hover:bg-(--ink)/10"
									onClick={() => step(1)}
									type="button"
								>
									→
								</button>
							</div>
						</div>

						<div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl bg-(--ink)/10 text-center">
							{DOW.map((d) => (
								<div
									className="bg-(--surface) py-1.5 font-medium text-(--ink)/50 text-xs uppercase"
									key={d}
								>
									{d}
								</div>
							))}
							{cells.map((day, i) => {
								if (day === null)
									return (
										<div
											className="min-h-24 bg-(--surface)/40"
											key={`pad-${cursor.y}-${cursor.m}-${i}`}
										/>
									);
								const dISO = iso(cursor.y, cursor.m, day);
								const isToday = dISO === todayISO();
								const chips = chipsByDay[dISO] ?? [];
								const bands = bandsByDay[dISO] ?? [];
								return (
									<div
										className={`flex min-h-24 flex-col gap-1 bg-(--surface) p-1.5 text-left ${
											isToday ? "ring-(--accent) ring-2 ring-inset" : ""
										}`}
										key={dISO}
									>
										<span
											className={`text-xs tabular-nums ${
												isToday
													? "font-bold text-(--accent)"
													: "text-(--ink)/50"
											}`}
										>
											{day}
										</span>
										{/* window bands (days inside a range) */}
										{bands.length > 0 && (
											<div className="flex flex-col gap-0.5">
												{bands.map((e) => (
													<div
														className={`h-1 rounded-full ${colorOf(e.examId).band}`}
														key={`b-${e.id}`}
														title={`${e.examName}: ${e.label}`}
													/>
												))}
											</div>
										)}
										{/* point / edge events */}
										{chips.map((e) => {
											const isEnd = e.endDate === dISO && e.date !== dISO;
											return (
												<button
													className={`flex items-center gap-1 truncate rounded px-1 py-0.5 text-left text-[11px] ${colorOf(e.examId).chip} ${colorOf(e.examId).text}`}
													key={`c-${e.id}-${dISO}`}
													onClick={() => setDetail(e)}
													title={`${e.examName}: ${e.label}`}
													type="button"
												>
													<span>{kindIcon(e.kind)}</span>
													<span className="truncate">
														{e.examName}
														{isEnd ? " ends" : ""}
													</span>
												</button>
											);
										})}
									</div>
								);
							})}
						</div>
					</div>

					{/* upcoming list */}
					<div className="lg:w-80">
						<h2 className="mb-3 font-bold text-xl">Upcoming</h2>
						<div className="flex flex-col gap-2">
							{upcoming.length === 0 && (
								<p className="text-(--ink)/50 text-sm">
									No upcoming dates. Hit “Refresh dates”.
								</p>
							)}
							{upcoming.map((e) => {
								const c = colorOf(e.examId);
								const n = daysFromToday(e.date);
								return (
									<button
										className="flex items-center gap-3 rounded-xl bg-(--surface) p-3 text-left ring-(--ink)/10 ring-1 transition hover:ring-(--accent)/40"
										key={e.id}
										onClick={() => setDetail(e)}
										type="button"
									>
										<span className={`h-8 w-1 rounded-full ${c.dot}`} />
										<div className="min-w-0 flex-1">
											<div className="flex items-center gap-2">
												<span className={`font-semibold text-sm ${c.text}`}>
													{e.examName}
												</span>
												<span className="text-(--ink)/40 text-xs">
													{kindIcon(e.kind)} {e.kind.replace("_", " ")}
												</span>
											</div>
											<p className="truncate text-(--ink)/80 text-sm">
												{e.label}
											</p>
											<p className="text-(--ink)/50 text-xs">
												{fmtShort(e.date)}
												{e.endDate ? ` → ${fmtShort(e.endDate)}` : ""}
											</p>
										</div>
										<span className="shrink-0 text-(--ink)/60 text-xs tabular-nums">
											{countdown(n)}
										</span>
									</button>
								);
							})}
						</div>
					</div>
				</div>
			</div>

			{detail && <EventModal event={detail} onClose={() => setDetail(null)} />}
			{refreshOpen && (
				<SkillDialog
					blurb="Want the latest official dates? Run this in Claude — it web-searches CAT, GMAT, XAT, SNAP & NMAT and updates this calendar. Or dismiss to browse the current dates."
					command="/refresh-exam-dates"
					onClose={() => setRefreshOpen(false)}
					title="Refresh exam dates?"
				/>
			)}
		</main>
	);
}

function EventModal({ event, onClose }: { event: Event; onClose: () => void }) {
	const c = colorOf(event.examId);
	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
			onClick={onClose}
			role="presentation"
		>
			<div
				aria-modal="true"
				className="w-full max-w-sm rounded-2xl bg-(--surface) p-6 text-(--ink) shadow-2xl ring-(--ink)/10 ring-1"
				onClick={(e) => e.stopPropagation()}
				role="dialog"
			>
				<div className="flex items-start justify-between gap-4">
					<div className="flex items-center gap-2">
						<span className={`h-3 w-3 rounded-full ${c.dot}`} />
						<h2 className="font-bold text-lg">{event.examName}</h2>
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
				<p className="mt-3 font-medium">
					{kindIcon(event.kind)} {event.label}
				</p>
				<p className="text-(--ink)/60 text-sm">
					{fmtShort(event.date)}
					{event.endDate ? ` → ${fmtShort(event.endDate)}` : ""} ·{" "}
					{countdown(daysFromToday(event.date))}
				</p>
				{event.notes && (
					<p className="mt-3 rounded bg-(--ink)/5 px-3 py-2 text-(--ink)/70 text-sm">
						{event.notes}
					</p>
				)}
				{event.source && (
					<a
						className="mt-3 inline-block text-(--accent-light) text-sm underline"
						href={event.source}
						rel="noopener noreferrer"
						target="_blank"
					>
						official source ↗
					</a>
				)}
			</div>
		</div>
	);
}

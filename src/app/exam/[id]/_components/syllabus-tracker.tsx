"use client";

import { Fragment, type ReactNode, useEffect, useState } from "react";

import Link from "next/link";

import { SkillCta } from "~/app/_components/skill-dialog";
import { api } from "~/trpc/react";

// Mirrors the core PROGRESS_STATUSES (kept local so this client bundle doesn't
// import server-only code). Clicking a subtopic cycles forward through these.
const STATUS_ORDER = [
	"not_started",
	"learning",
	"practiced",
	"mastered",
] as const;
type Status = (typeof STATUS_ORDER)[number];

const STATUS_STYLE: Record<Status, string> = {
	not_started: "bg-(--ink)/10 text-(--ink)/60 hover:bg-(--ink)/20",
	learning: "bg-(--warn-bg) text-(--warn-fg) ring-1 ring-(--warn-fg)/20",
	practiced: "bg-(--info-bg) text-(--info-fg) ring-1 ring-(--info-fg)/20",
	mastered: "bg-(--ok-bg) text-(--ok-fg) ring-1 ring-(--ok-fg)/20",
};
const STATUS_LABEL: Record<Status, string> = {
	not_started: "todo",
	learning: "learning",
	practiced: "practiced",
	mastered: "mastered",
};
// Solid status dot for the table view (STATUS_STYLE is glass-tinted, too faint
// as a 8px dot). Semantic colors, same hues as the chips.
const STATUS_DOT: Record<Status, string> = {
	not_started: "bg-(--ink)/30",
	learning: "bg-amber-400",
	practiced: "bg-sky-400",
	mastered: "bg-emerald-400",
};

// Compact "time since" for the Last-updated column. Accepts a Date (superjson
// gives us a real Date over the wire) or anything Date-parseable; null → em dash.
function formatRelative(v: Date | string | number | null | undefined): string {
	if (!v) return "—";
	const then = v instanceof Date ? v.getTime() : new Date(v).getTime();
	if (Number.isNaN(then)) return "—";
	const s = Math.floor((Date.now() - then) / 1000);
	if (s < 45) return "just now";
	const m = Math.floor(s / 60);
	if (m < 60) return `${m}m ago`;
	const h = Math.floor(m / 60);
	if (h < 24) return `${h}h ago`;
	const d = Math.floor(h / 24);
	if (d < 7) return `${d}d ago`;
	return new Date(then).toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
	});
}

// Local mirror of SubtopicMaterial (keeps this client bundle off server code).
type MaterialData = {
	frequency?: "high" | "medium" | "low" | "rare";
	summary?: string;
	formulas?: string[];
	keyIdeas?: string[];
	example?: { q: string; solution: string };
	traps?: string[];
	practice?: {
		q: string;
		options?: string[];
		answer: string;
		solution?: string;
		difficulty?: "easy" | "medium" | "hard";
	}[];
};

// One revision-checklist item (mirrors TodoItem in the server schema).
type TodoItem = { id: string; text: string; done: boolean };

// Which subtopic the prompt generator is targeting.
type PromptTarget = {
	subName: string;
	topicName: string;
	sectionName: string;
};

function next(s: Status): Status {
	return STATUS_ORDER[(STATUS_ORDER.indexOf(s) + 1) % STATUS_ORDER.length]!;
}

export function SyllabusTracker({
	examId,
	examName,
	examFullName,
}: {
	examId: string;
	examName: string;
	examFullName: string;
}) {
	const utils = api.useUtils();
	const syllabus = api.exam.syllabus.useQuery({ examId });
	const status = api.progress.status.useQuery({ examId });
	const rows = api.progress.rows.useQuery({ examId });
	const plan = api.plan.active.useQuery({ examId });
	const reviewsDue = api.review.due.useQuery({ examId });
	const trend = api.snapshot.series.useQuery({ examId });

	const setProgress = api.progress.set.useMutation({
		onSettled: async () => {
			await Promise.all([
				utils.progress.rows.invalidate({ examId }),
				utils.progress.status.invalidate({ examId }),
				utils.review.due.invalidate({ examId }),
				utils.snapshot.series.invalidate({ examId }),
			]);
		},
	});

	const statusById = new Map<string, Status>(
		(rows.data ?? []).map((r) => [r.subtopicId, r.status as Status]),
	);
	const updatedById = new Map<string, Date | null>(
		(rows.data ?? []).map((r) => [r.subtopicId, r.updatedAt]),
	);
	const notesById = new Map<string, string | null>(
		(rows.data ?? []).map((r) => [r.subtopicId, r.notes]),
	);
	const todosById = new Map<string, TodoItem[]>(
		(rows.data ?? []).map((r) => [r.subtopicId, r.todos ?? []]),
	);
	const [material, setMaterial] = useState<{
		name: string;
		data: MaterialData;
	} | null>(null);
	const [promptTarget, setPromptTarget] = useState<PromptTarget | null>(null);

	// Chips (default) vs. grouped table. Persisted so the choice survives reloads.
	const [view, setView] = useState<"chips" | "table">("chips");
	// Word-wrap in the table's text cells; when off, long text is truncated.
	const [wrap, setWrap] = useState(true);
	useEffect(() => {
		const v = localStorage.getItem("catac-syllabus-view");
		if (v === "chips" || v === "table") setView(v);
		setWrap(localStorage.getItem("catac-syllabus-wrap") !== "off");
	}, []);
	const pickView = (v: "chips" | "table") => {
		setView(v);
		try {
			localStorage.setItem("catac-syllabus-view", v);
		} catch {
			// Storage disabled: view still applies for this session.
		}
	};
	const toggleWrap = () => {
		setWrap((w) => {
			const nextWrap = !w;
			try {
				localStorage.setItem(
					"catac-syllabus-wrap",
					nextWrap ? "on" : "off",
				);
			} catch {
				// Storage disabled: still applies for this session.
			}
			return nextWrap;
		});
	};

	const cover = status.data;
	const days = plan.data?.daysRemaining ?? null;
	const dueCount = reviewsDue.data?.length ?? 0;

	// State-driven: point the user at the single highest-leverage skill right now.
	const rec = !plan.data
		? {
				command: "/plan-exam",
				label: "Plan this exam",
				blurb: `No study plan yet for ${examName}. This skill asks your target date and daily hours, then builds a dated, weighted plan.`,
			}
		: dueCount > 0
			? {
					command: "/whats-next",
					label: `Revise (${dueCount} due)`,
					blurb: `${dueCount} spaced-repetition review${dueCount === 1 ? "" : "s"} due for ${examName}. This skill lists them and what to study next.`,
				}
			: {
					command: "/log-progress",
					label: "Log progress",
					blurb: `Tell Claude what you studied for ${examName} — it updates status and schedules reviews. (Or tap subtopics below.)`,
				};

	return (
		<main className="app-bg flex min-h-screen flex-col items-center text-(--ink)">
			<div className="container flex flex-col gap-8 px-4 py-12">
				<div className="flex flex-col gap-1">
					<div className="flex items-center justify-between">
						<Link className="text-sm text-(--ink)/60 hover:text-(--ink)" href="/">
							← all exams
						</Link>
						<Link
							className="text-sm text-(--ink)/60 hover:text-(--ink)"
							href={`/exam/${examId}/mocks`}
						>
							mocks →
						</Link>
					</div>
					<h1 className="font-extrabold text-4xl tracking-tight">{examName}</h1>
					<p className="text-(--ink)/70">{examFullName}</p>
				</div>

				{/* Dashboard strip */}
				<div className="flex flex-wrap items-center gap-4 rounded-xl bg-(--ink)/5 p-4">
					<Stat label="covered" value={cover ? `${cover.coveragePct}%` : "…"} />
					{cover?.sections.map((s) => (
						<Stat
							key={s.section}
							label={s.section}
							value={`${s.coveragePct}%`}
						/>
					))}
					<Stat
						label="days left"
						value={
							days != null ? String(days) : plan.isLoading ? "…" : "no plan"
						}
					/>
					<Stat
						label="reviews due"
						value={reviewsDue.data ? String(reviewsDue.data.length) : "…"}
					/>
					<div className="ml-auto flex flex-col gap-1">
						<Sparkline
							points={(trend.data ?? []).map((s) => s.coveragePct ?? 0)}
						/>
						<span className="text-(--ink)/50 text-xs uppercase tracking-wide">
							trend
						</span>
					</div>
				</div>

				{/* One state-driven nudge → the right Claude Code skill. */}
				<div className="flex flex-wrap items-center gap-3">
					<SkillCta command={rec.command} label={rec.label} blurb={rec.blurb} />
					<span className="text-sm text-(--ink)/40">
						Actions run in Claude Code — this dashboard shows the result.
					</span>
				</div>

				<div className="flex flex-wrap items-center justify-between gap-3">
					<div className="inline-flex rounded-lg bg-(--ink)/5 p-0.5 text-sm ring-1 ring-(--ink)/10">
						{(["chips", "table"] as const).map((v) => (
							<button
								aria-pressed={view === v}
								className={`rounded-md px-3 py-1 capitalize transition ${
									view === v
										? "bg-(--ink)/10 text-(--ink)"
										: "text-(--ink)/50 hover:text-(--ink)/80"
								}`}
								key={v}
								onClick={() => pickView(v)}
								type="button"
							>
								{v}
							</button>
						))}
					</div>
					{view === "chips" ? (
						<p className="text-sm text-(--ink)/50">
							Tap a subtopic to advance: todo → learning → practiced → mastered.
						</p>
					) : (
						<button
							aria-pressed={!wrap}
							className="inline-flex items-center gap-2 rounded-lg bg-(--ink)/5 px-3 py-1.5 text-sm text-(--ink)/70 ring-1 ring-(--ink)/10 transition hover:bg-(--ink)/10"
							onClick={toggleWrap}
							type="button"
						>
							<span
								className={`h-3.5 w-6 rounded-full p-0.5 transition ${
									wrap ? "bg-(--accent)" : "bg-(--ink)/20"
								}`}
							>
								<span
									className={`block h-2.5 w-2.5 rounded-full bg-white transition ${
										wrap ? "translate-x-2.5" : ""
									}`}
								/>
							</span>
							Wrap text
						</button>
					)}
				</div>

				{view === "chips" && (
				<div className="flex flex-col gap-6">
					{syllabus.data?.map((section) => (
						<section className="rounded-xl bg-(--ink)/5 p-5" key={section.id}>
							<div className="mb-3 flex items-baseline justify-between">
								<h2 className="font-bold text-2xl">{section.name}</h2>
								<span className="text-sm text-(--ink)/50">
									{section.questions ?? "?"} Q · {section.marks ?? "?"} marks
								</span>
							</div>
							<div className="flex flex-col gap-4">
								{section.topics.map((topic) => (
									<div key={topic.id}>
										<div className="flex items-baseline gap-2">
											<h3 className="font-semibold text-lg">{topic.name}</h3>
											{topic.weightPct != null && (
												<span className="text-(--accent) text-sm">
													~{topic.weightPct}%
												</span>
											)}
										</div>
										<ul className="mt-2 flex flex-wrap gap-2">
											{topic.subtopics.map((sub) => {
												const st = statusById.get(sub.id) ?? "not_started";
												const mat = sub.materialJson;
												return (
													<li
														className={`flex items-stretch overflow-hidden rounded-md ${STATUS_STYLE[st]}`}
														key={sub.id}
													>
														<button
															className="px-2 py-1 text-left text-sm transition disabled:opacity-60"
															disabled={setProgress.isPending}
															onClick={() =>
																setProgress.mutate({
																	subtopicId: sub.id,
																	status: next(st),
																})
															}
															title={`${sub.name} — ${STATUS_LABEL[st]} (click to advance)`}
															type="button"
														>
															{sub.name}
														</button>
														{mat && (
															<button
																className="border-(--ink)/15 border-l px-1.5 text-xs opacity-70 transition hover:bg-(--ink)/20 hover:opacity-100"
																onClick={() => setMaterial({ name: sub.name, data: mat })}
																title="Study material"
																type="button"
															>
																ⓘ
															</button>
														)}
													</li>
												);
											})}
										</ul>
									</div>
								))}
							</div>
						</section>
					))}
				</div>
				)}

				{view === "table" && (
					<SyllabusTable
						notesById={notesById}
						onMaterial={setMaterial}
						onNote={(subtopicId, notes) =>
							setProgress.mutate({
								subtopicId,
								status: statusById.get(subtopicId) ?? "not_started",
								notes,
							})
						}
						onPrompt={setPromptTarget}
						onSet={(subtopicId, status) =>
							setProgress.mutate({ subtopicId, status })
						}
						onTodos={(subtopicId, todos) =>
							setProgress.mutate({
								subtopicId,
								status: statusById.get(subtopicId) ?? "not_started",
								todos,
							})
						}
						pending={setProgress.isPending}
						sections={syllabus.data ?? []}
						statusById={statusById}
						todosById={todosById}
						updatedById={updatedById}
						wrap={wrap}
					/>
				)}
			</div>
			{material && (
				<MaterialModal
					name={material.name}
					data={material.data}
					onClose={() => setMaterial(null)}
				/>
			)}
			{promptTarget && (
				<PromptGenerator
					examName={examName}
					target={promptTarget}
					onClose={() => setPromptTarget(null)}
				/>
			)}
		</main>
	);
}

// Structural shape of one `exam.syllabus` section — loose on purpose so the
// inferred query type is assignable (extra fields on the real data are fine).
type TableSection = {
	id: string;
	name: string;
	questions: number | null;
	marks: number | null;
	topics: {
		id: string;
		name: string;
		weightPct: number | null;
		subtopics: {
			id: string;
			name: string;
			materialJson?: MaterialData | null;
		}[];
	}[];
};

// Grouped table view: section → topic → subtopic. Each subtopic row has a direct
// status <select>, a revision-checklist count, an inline comment, and a
// last-updated column; the row expands to a detail panel with the full comment
// and revision checklist. Alternative to the tap-to-cycle chip grid.
function SyllabusTable({
	sections,
	statusById,
	updatedById,
	notesById,
	todosById,
	wrap,
	pending,
	onSet,
	onNote,
	onTodos,
	onMaterial,
	onPrompt,
}: {
	sections: TableSection[];
	statusById: Map<string, Status>;
	updatedById: Map<string, Date | null>;
	notesById: Map<string, string | null>;
	todosById: Map<string, TodoItem[]>;
	wrap: boolean;
	pending: boolean;
	onSet: (subtopicId: string, status: Status) => void;
	onNote: (subtopicId: string, notes: string) => void;
	onTodos: (subtopicId: string, todos: TodoItem[]) => void;
	onMaterial: (m: { name: string; data: MaterialData }) => void;
	onPrompt: (t: PromptTarget) => void;
}) {
	// Which subtopic detail panels are expanded (multiple allowed).
	const [open, setOpen] = useState<Set<string>>(new Set());
	const toggleOpen = (id: string) =>
		setOpen((prev) => {
			const nextOpen = new Set(prev);
			if (nextOpen.has(id)) nextOpen.delete(id);
			else nextOpen.add(id);
			return nextOpen;
		});

	// When wrap is off, long text is clipped to one line with an ellipsis;
	// table-fixed keeps the columns from stretching to fit the longest cell.
	const cellText = wrap ? "break-words" : "truncate";
	return (
		<div className="flex flex-col gap-6">
			{sections.map((section) => (
				<section
					className="overflow-hidden rounded-xl bg-(--ink)/5"
					key={section.id}
				>
					<div className="flex items-baseline justify-between px-5 pt-5 pb-1">
						<h2 className="font-bold text-2xl">{section.name}</h2>
						<span className="text-sm text-(--ink)/50">
							{section.questions ?? "?"} Q · {section.marks ?? "?"} marks
						</span>
					</div>
					<table className="w-full table-fixed border-collapse text-sm">
						<colgroup>
							<col className="w-8" />
							<col />
							<col className="w-40" />
							<col className="w-24" />
							<col className="w-24" />
						</colgroup>
						<thead>
							<tr className="text-(--ink)/40 text-xs uppercase tracking-wide">
								<th className="py-2" />
								<th className="py-2 text-left font-medium">Subtopic</th>
								<th className="px-3 py-2 text-left font-medium">Status</th>
								<th className="px-2 py-2 text-center font-medium">Revision</th>
								<th className="px-5 py-2 text-right font-medium">Updated</th>
							</tr>
						</thead>
						<tbody>
							{section.topics.map((topic) => (
								<Fragment key={topic.id}>
									<tr>
										<td
											className="border-(--ink)/10 border-t px-5 pt-3 pb-1 font-semibold text-(--ink)/80"
											colSpan={5}
										>
											{topic.name}
											{topic.weightPct != null && (
												<span className="ml-2 font-normal text-(--accent) text-xs">
													~{topic.weightPct}%
												</span>
											)}
										</td>
									</tr>
									{topic.subtopics.map((sub) => {
										const st = statusById.get(sub.id) ?? "not_started";
										const mat = sub.materialJson;
										const note = notesById.get(sub.id) ?? "";
										const todos = todosById.get(sub.id) ?? [];
										const doneCount = todos.filter((t) => t.done).length;
										const isOpen = open.has(sub.id);
										return (
											<Fragment key={sub.id}>
												<tr className="align-top transition hover:bg-(--ink)/5">
													<td className="py-1.5 pl-4">
														<button
															aria-expanded={isOpen}
															aria-label="Toggle details"
															className={`text-(--ink)/40 transition hover:text-(--ink)/80 ${
																isOpen ? "rotate-90" : ""
															}`}
															onClick={() => toggleOpen(sub.id)}
															type="button"
														>
															▸
														</button>
													</td>
													<td className="py-1.5 pr-3">
														<div className="flex min-w-0 flex-col gap-0.5">
															<div className="flex min-w-0 items-start gap-1.5">
																<span className={`min-w-0 ${cellText}`}>
																	{sub.name}
																</span>
																{mat && (
																	<button
																		aria-label="Study material"
																		className="shrink-0 text-(--ink)/40 text-xs transition hover:text-(--ink)/80"
																		onClick={() =>
																			onMaterial({ name: sub.name, data: mat })
																		}
																		title="Study material"
																		type="button"
																	>
																		ⓘ
																	</button>
																)}
																<button
																	aria-label="Generate a study prompt"
																	className="inline-flex shrink-0 items-center gap-0.5 rounded-md bg-(--accent)/15 px-1.5 py-0.5 font-medium text-(--accent-light) text-xs transition hover:bg-(--accent)/25"
																	onClick={() =>
																		onPrompt({
																			subName: sub.name,
																			topicName: topic.name,
																			sectionName: section.name,
																		})
																	}
																	title="Generate a study prompt"
																	type="button"
																>
																	<span className="text-sm">✨</span>
																	prompt
																</button>
															</div>
															{note && (
																<button
																	className={`min-w-0 text-left text-(--ink)/40 text-xs italic transition hover:text-(--ink)/70 ${cellText}`}
																	onClick={() => toggleOpen(sub.id)}
																	title={note}
																	type="button"
																>
																	{note}
																</button>
															)}
														</div>
													</td>
													<td className="px-3 py-1.5">
														<span className="inline-flex items-center gap-2">
															<span
																className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[st]}`}
															/>
															<select
																className="min-w-0 rounded-md bg-(--ink)/5 px-2 py-1 text-(--ink) ring-1 ring-(--ink)/10 transition hover:bg-(--ink)/10 disabled:opacity-60"
																disabled={pending}
																onChange={(e) =>
																	onSet(sub.id, e.target.value as Status)
																}
																value={st}
															>
																{STATUS_ORDER.map((s) => (
																	<option key={s} value={s}>
																		{STATUS_LABEL[s]}
																	</option>
																))}
															</select>
														</span>
													</td>
													<td className="px-2 py-1.5 text-center">
														<button
															className={`rounded-full px-2 py-0.5 text-xs tabular-nums transition ${
																todos.length === 0
																	? "text-(--ink)/30 hover:text-(--ink)/60"
																	: doneCount === todos.length
																		? "bg-(--ok-bg) text-(--ok-fg)"
																		: "bg-(--ink)/10 text-(--ink)/70"
															}`}
															onClick={() => toggleOpen(sub.id)}
															title="Revision checklist"
															type="button"
														>
															{todos.length === 0
																? "add"
																: `${doneCount}/${todos.length}`}
														</button>
													</td>
													<td className="px-5 py-1.5 text-right text-(--ink)/50 tabular-nums">
														{formatRelative(updatedById.get(sub.id))}
													</td>
												</tr>
												{isOpen && (
													<tr>
														<td colSpan={5} className="px-5 pt-1 pb-4">
															<div className="grid gap-4 rounded-lg bg-(--ink)/5 p-4 sm:grid-cols-2">
																<div>
																	<div className="mb-1 text-(--ink)/40 text-xs uppercase tracking-wide">
																		Comment
																	</div>
																	<CommentCell
																		disabled={pending}
																		note={notesById.get(sub.id) ?? ""}
																		onSave={(notes) => onNote(sub.id, notes)}
																		wrap
																	/>
																</div>
																<div>
																	<div className="mb-1 flex items-center justify-between">
																		<span className="text-(--ink)/40 text-xs uppercase tracking-wide">
																			Revision checklist
																		</span>
																		{todos.length > 0 && (
																			<span className="text-(--ink)/50 text-xs tabular-nums">
																				{doneCount}/{todos.length} done
																			</span>
																		)}
																	</div>
																	<TodoList
																		disabled={pending}
																		onChange={(t) => onTodos(sub.id, t)}
																		todos={todos}
																	/>
																</div>
															</div>
														</td>
													</tr>
												)}
											</Fragment>
										);
									})}
								</Fragment>
							))}
						</tbody>
					</table>
				</section>
			))}
		</div>
	);
}

// Revision checklist: check/uncheck, delete, and add items. Every mutation calls
// onChange with the full new array (the parent persists it as JSON).
function TodoList({
	todos,
	disabled,
	onChange,
}: {
	todos: TodoItem[];
	disabled: boolean;
	onChange: (todos: TodoItem[]) => void;
}) {
	const [draft, setDraft] = useState("");
	const add = () => {
		const text = draft.trim();
		if (!text) return;
		onChange([...todos, { id: crypto.randomUUID(), text, done: false }]);
		setDraft("");
	};
	return (
		<div className="flex flex-col gap-1.5">
			{todos.length === 0 && (
				<p className="text-(--ink)/30 text-sm">No revision items yet.</p>
			)}
			{todos.map((t) => (
				<div className="group flex items-center gap-2" key={t.id}>
					<input
						checked={t.done}
						className="size-4 shrink-0 accent-(--accent)"
						disabled={disabled}
						onChange={() =>
							onChange(
								todos.map((x) =>
									x.id === t.id ? { ...x, done: !x.done } : x,
								),
							)
						}
						type="checkbox"
					/>
					<span
						className={`flex-1 break-words text-sm ${
							t.done ? "text-(--ink)/40 line-through" : "text-(--ink)/80"
						}`}
					>
						{t.text}
					</span>
					<button
						aria-label="Delete item"
						className="shrink-0 text-(--ink)/30 text-sm opacity-0 transition hover:text-(--ink)/80 group-hover:opacity-100"
						onClick={() => onChange(todos.filter((x) => x.id !== t.id))}
						type="button"
					>
						✕
					</button>
				</div>
			))}
			<div className="mt-1 flex items-center gap-2">
				<input
					className="min-w-0 flex-1 rounded-md bg-(--ink)/5 px-2 py-1 text-(--ink) text-sm ring-1 ring-(--ink)/10 outline-none transition placeholder:text-(--ink)/30 focus:ring-(--accent)/50"
					disabled={disabled}
					onChange={(e) => setDraft(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter") {
							e.preventDefault();
							add();
						}
					}}
					placeholder="Add a revision item…"
					value={draft}
				/>
				<button
					className="shrink-0 rounded-md bg-(--accent) px-2.5 py-1 font-medium text-(--accent-fg) text-sm transition disabled:opacity-60"
					disabled={disabled || !draft.trim()}
					onClick={add}
					type="button"
				>
					Add
				</button>
			</div>
		</div>
	);
}

// Inline-editable comment cell. Click to edit, Enter or blur saves, Escape
// cancels. Only fires onSave when the text actually changed (avoids clobbering
// on an accidental focus).
function CommentCell({
	note,
	wrap,
	disabled,
	onSave,
}: {
	note: string;
	wrap: boolean;
	disabled: boolean;
	onSave: (notes: string) => void;
}) {
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState(note);

	// Keep the draft in sync if the underlying note changes while not editing.
	useEffect(() => {
		if (!editing) setDraft(note);
	}, [note, editing]);

	const commit = () => {
		setEditing(false);
		if (draft.trim() !== note.trim()) onSave(draft.trim());
	};

	if (editing) {
		return (
			<textarea
				autoFocus
				className="w-full resize-none rounded-md bg-(--ink)/5 px-2 py-1 text-(--ink) ring-1 ring-(--accent)/50 outline-none"
				disabled={disabled}
				onBlur={commit}
				onChange={(e) => setDraft(e.target.value)}
				onKeyDown={(e) => {
					if (e.key === "Enter" && !e.shiftKey) {
						e.preventDefault();
						commit();
					} else if (e.key === "Escape") {
						setDraft(note);
						setEditing(false);
					}
				}}
				rows={wrap ? 2 : 1}
				value={draft}
			/>
		);
	}

	return (
		<button
			className={`w-full rounded-md px-2 py-1 text-left transition hover:bg-(--ink)/5 ${
				note ? "text-(--ink)/80" : "text-(--ink)/30"
			} ${wrap ? "break-words whitespace-pre-wrap" : "truncate"}`}
			onClick={() => setEditing(true)}
			title={note || "Add comment"}
			type="button"
		>
			{note || "add comment…"}
		</button>
	);
}

// ---------------------------------------------------------------------------
// Prompt generator (✨): builds a copy-pasteable study prompt for a subtopic from
// a few selectors. Selections (everything except the subtopic) persist to
// localStorage, so the next subtopic you open starts from the same settings.
// ---------------------------------------------------------------------------

type PromptSettings = {
	goal: string;
	level: string;
	difficulty: string;
	count: string;
	format: string;
	time: string;
};

const PROMPT_DEFAULTS: PromptSettings = {
	goal: "questions",
	level: "intermediate",
	difficulty: "mixed",
	count: "10",
	format: "with step-by-step solutions",
	time: "30",
};

// Each selector: the settings key it drives + its options (value → label).
const PROMPT_FIELDS: {
	key: keyof PromptSettings;
	label: string;
	options: { value: string; label: string }[];
}[] = [
	{
		key: "goal",
		label: "I want to",
		options: [
			{ value: "questions", label: "Find practice questions" },
			{ value: "material", label: "Find the best study material" },
			{ value: "explain", label: "Understand the concept" },
			{ value: "quiz", label: "Get quizzed interactively" },
			{ value: "traps", label: "Learn traps & shortcuts" },
			{ value: "plan", label: "Make a mini study plan" },
		],
	},
	{
		key: "level",
		label: "My level",
		options: [
			{ value: "beginner", label: "Beginner" },
			{ value: "intermediate", label: "Intermediate" },
			{ value: "advanced", label: "Advanced" },
		],
	},
	{
		key: "difficulty",
		label: "Difficulty",
		options: [
			{ value: "easy", label: "Easy" },
			{ value: "medium", label: "Medium" },
			{ value: "hard", label: "Hard" },
			{ value: "mixed", label: "Mixed" },
			{ value: "exam-level", label: "Exam-level" },
		],
	},
	{
		key: "count",
		label: "How many",
		options: [
			{ value: "5", label: "5" },
			{ value: "10", label: "10" },
			{ value: "20", label: "20" },
			{ value: "30", label: "30" },
		],
	},
	{
		key: "format",
		label: "Output",
		options: [
			{ value: "with step-by-step solutions", label: "Step-by-step solutions" },
			{ value: "with brief answer keys", label: "Brief answer keys" },
			{ value: "as flashcards (question ⇄ answer)", label: "Flashcards" },
			{ value: "as concise summary notes", label: "Summary notes" },
			{ value: "with links to free resources", label: "Resource links" },
		],
	},
	{
		key: "time",
		label: "Time (min)",
		options: [
			{ value: "15", label: "15" },
			{ value: "30", label: "30" },
			{ value: "45", label: "45" },
			{ value: "60", label: "60" },
		],
	},
];

function buildPrompt(
	s: PromptSettings,
	examName: string,
	t: PromptTarget,
): string {
	const where = `**${t.subName}** (${t.topicName} → ${t.sectionName}, ${examName})`;
	switch (s.goal) {
		case "material":
			return `Recommend the best study materials to master ${where} for a ${s.level} student. Include a mix of short video lessons, articles/notes, and practice sources — prefer free, high-quality ones. For each, add one line on why it's worth my time and how long it takes, then order them into a sensible learning sequence.`;
		case "explain":
			return `Explain ${where} from first principles for a ${s.level} student. Cover the core intuition, the key formulas/rules and when to use them, and 2 fully worked ${s.difficulty} examples ${s.format}. Finish with the mistakes students most often make here.`;
		case "quiz":
			return `Act as an interactive tutor. Quiz me on ${where} with ${s.count} ${s.difficulty} questions, one at a time. Wait for my answer, tell me if I'm right ${s.format}, and at the end score me and list the sub-skills I should revise.`;
		case "traps":
			return `List the most common mistakes, misconceptions, and traps for ${where} in ${examName}, plus the time-saving shortcuts and elimination tricks a ${s.level} student should know. Present it ${s.format}.`;
		case "plan":
			return `Make a focused ${s.time}-minute study plan to take a ${s.level} student to confident on ${where} for ${examName}. Break it into timed blocks (learn → practice → review) with what to do in each, and end with ${s.count} ${s.difficulty} practice questions ${s.format}.`;
		default: // questions
			return `You are an expert ${examName} coach. Generate ${s.count} ${s.difficulty} practice questions on ${where}, pitched at a ${s.level} student, ${s.format}. Keep them exam-realistic in style and difficulty, and label each with the specific sub-skill it tests.`;
	}
}

const PROMPT_STORAGE_KEY = "catac-prompt-settings";

function PromptGenerator({
	examName,
	target,
	onClose,
}: {
	examName: string;
	target: PromptTarget;
	onClose: () => void;
}) {
	const [settings, setSettings] = useState<PromptSettings>(PROMPT_DEFAULTS);
	const [copied, setCopied] = useState(false);
	// Draft lets the user tweak the generated text before copying; it resets
	// whenever the settings or subtopic change.
	const [draft, setDraft] = useState("");

	// Restore last-used settings on open.
	useEffect(() => {
		try {
			const raw = localStorage.getItem(PROMPT_STORAGE_KEY);
			if (raw) setSettings({ ...PROMPT_DEFAULTS, ...JSON.parse(raw) });
		} catch {
			// Ignore malformed / unavailable storage.
		}
	}, []);

	// Regenerate the draft from settings + target (unless the user has edited it).
	const generated = buildPrompt(settings, examName, target);
	useEffect(() => {
		setDraft(generated);
	}, [generated]);

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [onClose]);

	const update = (key: keyof PromptSettings, value: string) => {
		setSettings((prev) => {
			const nextSettings = { ...prev, [key]: value };
			try {
				localStorage.setItem(PROMPT_STORAGE_KEY, JSON.stringify(nextSettings));
			} catch {
				// Storage disabled: still applies for this session.
			}
			return nextSettings;
		});
	};

	const copy = () => {
		void navigator.clipboard.writeText(draft);
		setCopied(true);
		setTimeout(() => setCopied(false), 1500);
	};

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
			onClick={onClose}
			role="presentation"
		>
			<div
				aria-modal="true"
				className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-(--surface) p-6 text-(--ink) shadow-2xl ring-1 ring-(--ink)/10"
				onClick={(e) => e.stopPropagation()}
				role="dialog"
			>
				<div className="flex items-start justify-between gap-4">
					<div>
						<h2 className="font-bold text-xl">✨ Study prompt</h2>
						<p className="mt-0.5 text-(--ink)/60 text-sm">{target.subName}</p>
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

				<div className="mt-4 grid gap-3 sm:grid-cols-2">
					{PROMPT_FIELDS.map((field) => (
						<label className="flex flex-col gap-1" key={field.key}>
							<span className="text-(--ink)/40 text-xs uppercase tracking-wide">
								{field.label}
							</span>
							<select
								className="rounded-md bg-(--ink)/5 px-2 py-1.5 text-(--ink) text-sm ring-1 ring-(--ink)/10 transition hover:bg-(--ink)/10 focus:ring-(--accent)/50"
								onChange={(e) => update(field.key, e.target.value)}
								value={settings[field.key]}
							>
								{field.options.map((o) => (
									<option key={o.value} value={o.value}>
										{o.label}
									</option>
								))}
							</select>
						</label>
					))}
				</div>

				<div className="mt-4">
					<div className="mb-1 flex items-center justify-between">
						<span className="text-(--ink)/40 text-xs uppercase tracking-wide">
							Generated prompt
						</span>
						<button
							className="rounded-md bg-(--accent) px-3 py-1 font-medium text-(--accent-fg) text-sm transition"
							onClick={copy}
							type="button"
						>
							{copied ? "copied ✓" : "copy"}
						</button>
					</div>
					<textarea
						className="h-40 w-full resize-none rounded-lg bg-(--inset) p-3 text-(--ink)/90 text-sm ring-1 ring-(--ink)/10 outline-none focus:ring-(--accent)/50"
						onChange={(e) => setDraft(e.target.value)}
						value={draft}
					/>
					<p className="mt-2 text-(--ink)/40 text-xs">
						Paste into Claude Code (or any assistant). Tweak the text above
						before copying if you like — your selector choices are saved for next
						time.
					</p>
				</div>
			</div>
		</div>
	);
}

function Stat({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex flex-col">
			<span className="font-bold text-2xl tabular-nums">{value}</span>
			<span className="text-(--ink)/50 text-xs uppercase tracking-wide">
				{label}
			</span>
		</div>
	);
}

// Tiny inline coverage-over-time sparkline (0-100%).
function Sparkline({ points }: { points: number[] }) {
	const w = 120;
	const h = 32;
	if (points.length < 2)
		return (
			<div
				className="flex items-center justify-center text-(--ink)/40 text-xs"
				style={{ width: w, height: h }}
			>
				building trend…
			</div>
		);
	const max = 100;
	const stepX = w / (points.length - 1);
	const coords = points.map(
		(p, i) => `${i * stepX},${h - (Math.max(0, Math.min(max, p)) / max) * h}`,
	);
	return (
		<svg aria-label="coverage trend" height={h} width={w}>
			<polyline
				className="stroke-(--accent)"
				fill="none"
				points={coords.join(" ")}
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={2}
			/>
		</svg>
	);
}

function MaterialModal({
	name,
	data,
	onClose,
}: {
	name: string;
	data: MaterialData;
	onClose: () => void;
}) {
	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
			onClick={onClose}
			role="presentation"
		>
			<div
				className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-(--surface) p-6 text-(--ink) shadow-2xl ring-1 ring-(--ink)/10"
				onClick={(e) => e.stopPropagation()}
				role="dialog"
				aria-modal="true"
			>
				<div className="flex items-start justify-between gap-4">
					<h2 className="font-bold text-xl">{name}</h2>
					<button
						type="button"
						onClick={onClose}
						className="text-(--ink)/50 hover:text-(--ink)"
						aria-label="Close"
					>
						✕
					</button>
				</div>

				{data.frequency && (
					<span
						className={`mt-2 inline-block rounded-full px-2 py-0.5 font-medium text-xs ${FREQ_STYLE[data.frequency]}`}
					>
						{data.frequency === "rare"
							? "rarely tested"
							: `${data.frequency} frequency`}
					</span>
				)}

				{data.summary && (
					<p className="mt-3 text-sm text-(--ink)/80">{data.summary}</p>
				)}

				{data.formulas && data.formulas.length > 0 && (
					<Section title="Formulas">
						<ul className="flex flex-col gap-1">
							{data.formulas.map((f) => (
								<li
									key={f}
									className="rounded bg-(--inset) px-2 py-1 font-mono text-(--accent-light) text-sm"
								>
									{f}
								</li>
							))}
						</ul>
					</Section>
				)}

				{data.keyIdeas && data.keyIdeas.length > 0 && (
					<Section title="Key ideas">
						<ul className="list-disc pl-5 text-sm text-(--ink)/80">
							{data.keyIdeas.map((k) => (
								<li key={k}>{k}</li>
							))}
						</ul>
					</Section>
				)}

				{data.example && (
					<Section title="Worked example">
						<p className="text-sm text-(--ink)/80">{data.example.q}</p>
						<p className="mt-1 rounded bg-(--ok-bg) px-2 py-1 text-(--ok-fg) text-sm">
							{data.example.solution}
						</p>
					</Section>
				)}

				{data.traps && data.traps.length > 0 && (
					<Section title="Common traps">
						<ul className="list-disc pl-5 text-(--warn-fg) text-sm">
							{data.traps.map((tp) => (
								<li key={tp}>{tp}</li>
							))}
						</ul>
					</Section>
				)}
				{data.practice && data.practice.length > 0 && (
					<Section title={`Practice (${data.practice.length})`}>
						<div className="flex flex-col gap-3">
							{data.practice.map((pq, i) => (
								<PracticeItem key={pq.q} n={i + 1} pq={pq} />
							))}
						</div>
					</Section>
				)}
			</div>
		</div>
	);
}

function Section({
	title,
	children,
}: {
	title: string;
	children: ReactNode;
}) {
	return (
		<div className="mt-4">
			<h3 className="mb-1 font-semibold text-(--ink)/50 text-xs uppercase tracking-wide">
				{title}
			</h3>
			{children}
		</div>
	);
}

const FREQ_STYLE: Record<"high" | "medium" | "low" | "rare", string> = {
	high: "bg-(--ok-bg) text-(--ok-fg)",
	medium: "bg-(--info-bg) text-(--info-fg)",
	low: "bg-(--ink)/15 text-(--ink)/70",
	rare: "bg-(--warn-bg) text-(--warn-fg)",
};

function PracticeItem({
	n,
	pq,
}: {
	n: number;
	pq: {
		q: string;
		options?: string[];
		answer: string;
		solution?: string;
		difficulty?: "easy" | "medium" | "hard";
	};
}) {
	const [show, setShow] = useState(false);
	return (
		<div className="rounded-lg bg-(--inset) p-3">
			<div className="flex items-baseline justify-between gap-2">
				<p className="text-sm text-(--ink)/85">
					<span className="text-(--ink)/40">Q{n}. </span>
					{pq.q}
				</p>
				{pq.difficulty && (
					<span className="shrink-0 text-(--ink)/40 text-xs uppercase">
						{pq.difficulty}
					</span>
				)}
			</div>
			{pq.options && pq.options.length > 0 && (
				<ul className="mt-2 flex flex-col gap-1 text-sm text-(--ink)/70">
					{pq.options.map((o) => (
						<li key={o}>• {o}</li>
					))}
				</ul>
			)}
			<button
				type="button"
				onClick={() => setShow((v) => !v)}
				className="mt-2 text-(--accent-light) text-xs hover:underline"
			>
				{show ? "hide answer" : "show answer"}
			</button>
			{show && (
				<div className="mt-1 rounded bg-(--ok-bg) px-2 py-1 text-sm">
					<span className="font-semibold text-(--ok-fg)">Ans: {pq.answer}</span>
					{pq.solution && <p className="mt-1 text-(--ok-fg)">{pq.solution}</p>}
				</div>
			)}
		</div>
	);
}

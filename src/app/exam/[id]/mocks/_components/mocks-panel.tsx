"use client";

import Link from "next/link";
import { useState } from "react";

import { api } from "~/trpc/react";

export function MocksPanel({
	examId,
	examName,
}: {
	examId: string;
	examName: string;
}) {
	const utils = api.useUtils();
	const syllabus = api.exam.syllabus.useQuery({ examId });
	const mocks = api.mock.list.useQuery({ examId });
	const sections = syllabus.data ?? [];

	const [name, setName] = useState("");
	const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
	const [scores, setScores] = useState<Record<string, string>>({});
	const [msg, setMsg] = useState<string | null>(null);

	const logMock = api.mock.log.useMutation({
		onSuccess: () => {
			setName("");
			setScores({});
			setMsg("Mock logged.");
		},
		onSettled: () => utils.mock.list.invalidate({ examId }),
	});

	const reweight = api.plan.reweight.useMutation({
		onSuccess: (r) =>
			setMsg(
				`Plan reweighted from "${r.basedOnMock.name}". Weakness: ${Object.entries(
					r.weakness,
				)
					.map(([k, v]) => `${k} ${Math.round((v as number) * 100)}%`)
					.join(", ")}.`,
			),
		onError: (e) => setMsg(e.message),
	});

	function submit() {
		const sectionScores: Record<string, number> = {};
		for (const s of sections) {
			const raw = scores[s.id];
			if (raw !== undefined && raw !== "" && !Number.isNaN(Number(raw)))
				sectionScores[s.id] = Number(raw);
		}
		if (Object.keys(sectionScores).length === 0) {
			setMsg("Enter at least one section score.");
			return;
		}
		setMsg(null);
		logMock.mutate({ examId, name: name || undefined, date, sectionScores });
	}

	const totalItems = (mocks.data ?? []).map((m) => ({
		id: m.id,
		total: m.total ?? 0,
	}));

	return (
		<main className="app-bg flex min-h-screen flex-col items-center text-(--ink)">
			<div className="container flex max-w-3xl flex-col gap-8 px-4 py-12">
				<div className="flex flex-col gap-1">
					<Link
						className="text-sm text-(--ink)/60 hover:text-(--ink)"
						href={`/exam/${examId}`}
					>
						← {examName} tracker
					</Link>
					<h1 className="font-extrabold text-4xl tracking-tight">Mocks</h1>
				</div>

				{/* Log form */}
				<div className="flex flex-col gap-4 rounded-xl bg-(--ink)/5 p-5">
					<h2 className="font-bold text-xl">Log a mock</h2>
					<div className="flex flex-wrap gap-3">
						<label className="flex flex-col text-sm text-(--ink)/60">
							date
							<input
								className="rounded-md bg-(--ink)/10 px-2 py-1 text-(--ink)"
								onChange={(e) => setDate(e.target.value)}
								type="date"
								value={date}
							/>
						</label>
						<label className="flex flex-1 flex-col text-sm text-(--ink)/60">
							name (optional)
							<input
								className="rounded-md bg-(--ink)/10 px-2 py-1 text-(--ink)"
								onChange={(e) => setName(e.target.value)}
								placeholder="Mock 1"
								value={name}
							/>
						</label>
					</div>
					<div className="flex flex-wrap gap-3">
						{sections.map((s) => (
							<label className="flex flex-col text-sm text-(--ink)/60" key={s.id}>
								{s.short} {s.marks != null ? `/ ${s.marks}` : ""}
								<input
									className="w-24 rounded-md bg-(--ink)/10 px-2 py-1 text-(--ink)"
									inputMode="numeric"
									onChange={(e) =>
										setScores((prev) => ({ ...prev, [s.id]: e.target.value }))
									}
									type="number"
									value={scores[s.id] ?? ""}
								/>
							</label>
						))}
					</div>
					<div className="flex items-center gap-3">
						<button
							className="rounded-md bg-(--accent) px-4 py-2 font-semibold text-(--accent-fg) disabled:opacity-60"
							disabled={logMock.isPending}
							onClick={submit}
							type="button"
						>
							Log mock
						</button>
						<button
							className="rounded-md bg-(--ink)/10 px-4 py-2 font-semibold hover:bg-(--ink)/20 disabled:opacity-40"
							disabled={reweight.isPending || (mocks.data?.length ?? 0) === 0}
							onClick={() => reweight.mutate({ examId })}
							type="button"
						>
							Reweight plan from latest mock
						</button>
					</div>
					{msg && <p className="text-sm text-(--ink)/70">{msg}</p>}
				</div>

				{/* Totals trend */}
				{totalItems.length >= 2 && (
					<div className="flex items-center gap-3 rounded-xl bg-(--ink)/5 p-4">
						<TotalsBars items={totalItems} />
						<span className="text-sm text-(--ink)/50">
							total score over mocks
						</span>
					</div>
				)}

				{/* Mocks list */}
				<div className="flex flex-col gap-2">
					<h2 className="font-bold text-xl">History</h2>
					{(mocks.data?.length ?? 0) === 0 ? (
						<p className="text-(--ink)/50">No mocks yet.</p>
					) : (
						<div className="overflow-x-auto">
							<table className="w-full text-left text-sm">
								<thead className="text-(--ink)/50">
									<tr>
										<th className="py-1 pr-4">date</th>
										<th className="py-1 pr-4">name</th>
										{sections.map((s) => (
											<th className="py-1 pr-4" key={s.id}>
												{s.short}
											</th>
										))}
										<th className="py-1 pr-4">total</th>
									</tr>
								</thead>
								<tbody>
									{mocks.data?.map((m) => {
										const ss = (m.sectionScoresJson ?? {}) as Record<
											string,
											number
										>;
										return (
											<tr className="border-(--ink)/10 border-t" key={m.id}>
												<td className="py-1 pr-4">{m.date}</td>
												<td className="py-1 pr-4">{m.name}</td>
												{sections.map((s) => (
													<td className="py-1 pr-4 tabular-nums" key={s.id}>
														{ss[s.id] ?? "—"}
													</td>
												))}
												<td className="py-1 pr-4 font-semibold tabular-nums">
													{m.total ?? "—"}
												</td>
											</tr>
										);
									})}
								</tbody>
							</table>
						</div>
					)}
				</div>
			</div>
		</main>
	);
}

function TotalsBars({ items }: { items: { id: number; total: number }[] }) {
	const max = Math.max(...items.map((i) => i.total), 1);
	return (
		<div className="flex h-10 items-end gap-1">
			{items.map((it) => (
				<div
					className="w-3 rounded-sm bg-(--accent)"
					key={it.id}
					style={{ height: `${Math.max(4, (it.total / max) * 40)}px` }}
					title={String(it.total)}
				/>
			))}
		</div>
	);
}

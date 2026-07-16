import { notFound } from "next/navigation";

import { api } from "~/trpc/server";
import { PlanBoard } from "./_components/plan-board";

// Drag-and-drop study plan board: daily / weekly / monthly views, reorderable
// nodes, priority stars, and the three mock tiers woven into the schedule.
// Everything persists through the same core the `catac` CLI uses.
export default async function PlanPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	const exams = await api.exam.list();
	const exam = exams.find((e) => e.id === id);
	if (!exam) notFound();

	return <PlanBoard examId={id} examName={exam.name} />;
}

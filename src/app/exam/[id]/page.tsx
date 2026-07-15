import { notFound } from "next/navigation";

import { api } from "~/trpc/server";
import { SyllabusTracker } from "./_components/syllabus-tracker";

// Interactive syllabus tracker: tap a subtopic to advance its status. Progress
// persists via the same core the `catac` CLI uses, so Claude and the UI agree.
export default async function ExamPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	const exams = await api.exam.list();
	const exam = exams.find((e) => e.id === id);
	if (!exam) notFound();

	return (
		<SyllabusTracker
			examFullName={exam.fullName}
			examId={id}
			examName={exam.name}
		/>
	);
}

import { notFound } from "next/navigation";

import { api } from "~/trpc/server";
import { MocksPanel } from "./_components/mocks-panel";

export default async function MocksPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	const exams = await api.exam.list();
	const exam = exams.find((e) => e.id === id);
	if (!exam) notFound();

	return <MocksPanel examId={id} examName={exam.name} />;
}

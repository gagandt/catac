import Link from "next/link";

import { SkillCta } from "~/app/_components/skill-dialog";
import { api, HydrateClient } from "~/trpc/server";

// Entry point: "Which exam do you want to prepare for?"
export default async function Home() {
	const exams = await api.exam.list();

	return (
		<HydrateClient>
			<main className="app-bg flex min-h-screen flex-col items-center text-(--ink)">
				<div className="container flex flex-col items-center gap-10 px-4 py-16">
					<div className="flex flex-col items-center gap-3 text-center">
						<h1 className="font-extrabold text-4xl tracking-tight sm:text-6xl">
							Prep <span className="text-(--accent)">Tracker</span>
						</h1>
						<p className="text-(--ink)/70 text-lg">
							Which exam do you want to prepare for?
						</p>
						<Link
							className="rounded-full bg-(--ink)/10 px-4 py-1.5 text-(--ink)/80 text-sm transition hover:bg-(--ink)/20"
							href="/calendar"
						>
							📅 Exam calendar — CAT · GMAT · XAT · SNAP · NMAT
						</Link>
					</div>

					{exams.length === 0 ? (
						<div className="flex flex-col items-center gap-3 rounded-lg bg-(--ink)/10 px-6 py-5 text-center">
							<p className="text-(--ink)/80">No exams tracked yet.</p>
							<SkillCta
								blurb="Add an exam to track (CAT, XAT, GMAT, NMAT…). This skill researches the exam, writes a content pack, and seeds it."
								command="/add-exam"
								label="Add an exam"
							/>
						</div>
					) : (
						<div className="grid w-full max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2">
							{exams.map((e) => (
								<Link
									className="flex flex-col gap-1 rounded-xl bg-(--ink)/10 p-5 transition hover:bg-(--ink)/20"
									href={`/exam/${e.id}`}
									key={e.id}
								>
									<h3 className="font-bold text-2xl">{e.name}</h3>
									<p className="text-(--ink)/70 text-sm">{e.fullName}</p>
								</Link>
							))}
						</div>
					)}
				</div>
			</main>
		</HydrateClient>
	);
}

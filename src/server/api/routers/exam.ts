import { z } from "zod";

import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { getSyllabus, listExams, listResources } from "~/server/core/exam";

// Thin wrapper over the exam core. All logic lives in ~/server/core/exam.ts so
// the CLI (for Claude) and this router stay in lockstep.
export const examRouter = createTRPCRouter({
	list: publicProcedure.query(() => listExams()),

	syllabus: publicProcedure
		.input(z.object({ examId: z.string() }))
		.query(({ input }) => getSyllabus(input.examId)),

	resources: publicProcedure
		.input(z.object({ examId: z.string() }))
		.query(({ input }) => listResources(input.examId)),
});

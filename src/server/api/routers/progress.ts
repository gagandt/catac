import { z } from "zod";

import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import {
	getNext,
	getProgressRows,
	getStatus,
	PROGRESS_STATUSES,
	setProgress,
} from "~/server/core/progress";

// Thin wrapper over the progress core — same functions the `catac` CLI calls,
// so the UI and Claude never disagree.
export const progressRouter = createTRPCRouter({
	set: publicProcedure
		.input(
			z.object({
				subtopicId: z.string(),
				status: z.enum(PROGRESS_STATUSES),
				confidence: z.number().int().min(1).max(5).optional(),
				notes: z.string().optional(),
				questionsDone: z.number().int().min(0).optional(),
				todos: z
					.array(
						z.object({
							id: z.string(),
							text: z.string(),
							done: z.boolean(),
						}),
					)
					.optional(),
			}),
		)
		.mutation(({ input }) => setProgress(input)),

	rows: publicProcedure
		.input(z.object({ examId: z.string() }))
		.query(({ input }) => getProgressRows(input.examId)),

	status: publicProcedure
		.input(z.object({ examId: z.string() }))
		.query(({ input }) => getStatus(input.examId)),

	next: publicProcedure
		.input(z.object({ examId: z.string(), limit: z.number().int().optional() }))
		.query(({ input }) => getNext(input.examId, input.limit)),
});

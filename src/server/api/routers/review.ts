import { z } from "zod";

import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { getDueReviews, reviewDone } from "~/server/core/review";

export const reviewRouter = createTRPCRouter({
	due: publicProcedure
		.input(z.object({ examId: z.string() }))
		.query(({ input }) => getDueReviews(input.examId)),

	done: publicProcedure
		.input(
			z.object({
				subtopicId: z.string(),
				grade: z.number().int().min(0).max(5),
			}),
		)
		.mutation(({ input }) => reviewDone(input.subtopicId, input.grade)),
});

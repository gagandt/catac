import { z } from "zod";

import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { listMocks, logMock } from "~/server/core/mock";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

export const mockRouter = createTRPCRouter({
	log: publicProcedure
		.input(
			z.object({
				examId: z.string(),
				name: z.string().optional(),
				date: isoDate.optional(),
				sectionScores: z.record(z.string(), z.number()),
				estPercentile: z.number().optional(),
				notes: z.string().optional(),
			}),
		)
		.mutation(({ input }) => logMock(input)),

	list: publicProcedure
		.input(z.object({ examId: z.string() }))
		.query(({ input }) => listMocks(input.examId)),
});

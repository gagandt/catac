import { z } from "zod";

import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import {
	adjustPlanItem,
	createPlan,
	getActivePlan,
	reweightPlanFromMock,
} from "~/server/core/plan";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

// Thin wrapper over the plan core — same functions `catac plan` calls.
export const planRouter = createTRPCRouter({
	create: publicProcedure
		.input(
			z.object({
				examId: z.string(),
				targetDate: isoDate,
				dailyHours: z.number().positive().optional(),
				notes: z.string().optional(),
			}),
		)
		.mutation(({ input }) => createPlan(input)),

	active: publicProcedure
		.input(z.object({ examId: z.string() }))
		.query(({ input }) => getActivePlan(input.examId)),

	adjustItem: publicProcedure
		.input(
			z.object({
				itemId: z.number().int(),
				allocatedHours: z.number().optional(),
				plannedStart: isoDate.optional(),
				plannedEnd: isoDate.optional(),
				orderIndex: z.number().int().optional(),
			}),
		)
		.mutation(({ input }) => {
			const { itemId, ...patch } = input;
			return adjustPlanItem(itemId, patch);
		}),

	reweight: publicProcedure
		.input(z.object({ examId: z.string() }))
		.mutation(({ input }) => reweightPlanFromMock(input.examId)),
});

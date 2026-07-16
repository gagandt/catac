import { z } from "zod";

import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import {
	addPlanItem,
	adjustPlanItem,
	createPlan,
	deletePlanItem,
	getActivePlan,
	movePlanItem,
	planTopicOptions,
	reorderPlanItems,
	reweightPlanFromMock,
	setPlanItemPriority,
} from "~/server/core/plan";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");
const mockTier = z.enum(["vision", "subject", "global"]);
const priority = z.enum(["normal", "high"]);

// Thin wrapper over the plan core — same functions `catac plan` calls.
export const planRouter = createTRPCRouter({
	create: publicProcedure
		.input(
			z.object({
				examId: z.string(),
				targetDate: isoDate,
				dailyHours: z.number().positive().optional(),
				granularity: z.enum(["topic", "subtopic"]).optional(),
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

	// --- board operations (drag reorder, move dates, priority, add/remove) ---

	reorder: publicProcedure
		.input(z.object({ orderedIds: z.array(z.number().int()) }))
		.mutation(({ input }) => reorderPlanItems(input.orderedIds)),

	move: publicProcedure
		.input(z.object({ itemId: z.number().int(), plannedStart: isoDate }))
		.mutation(({ input }) => movePlanItem(input.itemId, input.plannedStart)),

	setPriority: publicProcedure
		.input(z.object({ itemId: z.number().int(), priority }))
		.mutation(({ input }) => setPlanItemPriority(input.itemId, input.priority)),

	addItem: publicProcedure
		.input(
			z.object({
				examId: z.string(),
				kind: z.enum(["study", "mock"]),
				topicId: z.string().optional(),
				subtopicId: z.string().optional(),
				sectionId: z.string().optional(),
				mockTier: mockTier.optional(),
				title: z.string().optional(),
				plannedStart: isoDate.optional(),
				allocatedHours: z.number().positive().optional(),
				priority: priority.optional(),
			}),
		)
		.mutation(({ input }) => addPlanItem(input)),

	removeItem: publicProcedure
		.input(z.object({ itemId: z.number().int() }))
		.mutation(({ input }) => deletePlanItem(input.itemId)),

	topicOptions: publicProcedure
		.input(z.object({ examId: z.string() }))
		.query(({ input }) => planTopicOptions(input.examId)),
});

import { z } from "zod";

import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import {
	addExamEvent,
	clearExamEvents,
	deleteExamEvent,
	eventsLastUpdated,
	listExamEvents,
	setExamEvents,
	TRACKED_EXAMS,
} from "~/server/core/calendar";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");
const eventInput = z.object({
	kind: z.string(),
	label: z.string(),
	date: isoDate,
	endDate: isoDate.optional(),
	notes: z.string().optional(),
	source: z.string().optional(),
});

// Thin wrapper over the calendar core — same functions `catac dates` calls.
export const calendarRouter = createTRPCRouter({
	exams: publicProcedure.query(() => TRACKED_EXAMS),

	events: publicProcedure
		.input(z.object({ examId: z.string().optional() }).optional())
		.query(({ input }) => listExamEvents(input?.examId)),

	lastUpdated: publicProcedure.query(() => eventsLastUpdated()),

	addEvent: publicProcedure
		.input(z.object({ examId: z.string(), event: eventInput }))
		.mutation(({ input }) => addExamEvent(input.examId, input.event)),

	setEvents: publicProcedure
		.input(z.object({ examId: z.string(), events: z.array(eventInput) }))
		.mutation(({ input }) => setExamEvents(input.examId, input.events)),

	clear: publicProcedure
		.input(z.object({ examId: z.string() }))
		.mutation(({ input }) => clearExamEvents(input.examId)),

	removeEvent: publicProcedure
		.input(z.object({ id: z.number().int() }))
		.mutation(({ input }) => deleteExamEvent(input.id)),
});

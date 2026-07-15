import { z } from "zod";

import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { getSnapshots } from "~/server/core/snapshot";

export const snapshotRouter = createTRPCRouter({
	series: publicProcedure
		.input(z.object({ examId: z.string() }))
		.query(({ input }) => getSnapshots(input.examId)),
});

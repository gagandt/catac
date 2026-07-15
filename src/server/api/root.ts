import { examRouter } from "~/server/api/routers/exam";
import { mockRouter } from "~/server/api/routers/mock";
import { planRouter } from "~/server/api/routers/plan";
import { progressRouter } from "~/server/api/routers/progress";
import { reviewRouter } from "~/server/api/routers/review";
import { snapshotRouter } from "~/server/api/routers/snapshot";
import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
	exam: examRouter,
	mock: mockRouter,
	plan: planRouter,
	progress: progressRouter,
	review: reviewRouter,
	snapshot: snapshotRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;

/**
 * Create a server-side caller for the tRPC API.
 * @example
 * const trpc = createCaller(createContext);
 * const res = await trpc.exam.list();
 */
export const createCaller = createCallerFactory(appRouter);

/**
 * The race rules moved to `src/lib/race-rules.ts` when races went serverless:
 * the host rider's browser runs them now. Re-exported so the room server and
 * its tests keep their imports.
 */
export * from "@/lib/race-rules";

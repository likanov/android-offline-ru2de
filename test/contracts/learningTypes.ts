import type { Skill } from "../../src/features/learning/learningTypes";

// Compile-time contract: every required exercise mode must be accepted.
["translation", "writing", "article", "listening"] satisfies Skill[];

// An unrequested plural mode must not become part of the exercise contract.
// @ts-expect-error plural is not an exercise skill
"plural" satisfies Skill;

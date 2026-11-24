# Improve the harness

Run this at Deploy, after the review's findings are settled — fixed, or accepted as non-blocking — and before the merge.

1. Look at what went wrong on this change: the review's findings, what the person corrected, what the checks caught — and what the checks missed. Read the review report and the last `npm run check` output, and name the gate gap behind each finding. Every gate stayed green on the dark-mode change while it broke its own AA rule, and the company-settings checks passed while a UTC test compared against the local date, so don't take a green run as evidence the requirements held. A review that could not see the diff or run the checks is a finding about the harness, not just about the change.
2. For a mistake that has happened twice, here or in an earlier change, add the correction to AGENTS.md or docs/REVIEW.md, or suggest a change to docs/STANDARDS.md for the person to make. Put it where it would have stopped the mistake: rules about writing the change go in AGENTS.md, rules about judging it go in REVIEW.md. If a tool can catch it, add it to the checks instead. A rule that only says "be careful" fixes nothing.
3. Remove anything out of date — counts, hedges and claims the fixes have since changed. Check the user-facing README as well as `docs/`: its feature list and run instructions drift when a change lands. A count comes from the run output or from counting the code, never from memory.
4. Record in docs/STATUS.md what the harness and docs now say, and which finding each change answers.
5. Improve this file, so that the next round makes a better change. Keep this as the last step.

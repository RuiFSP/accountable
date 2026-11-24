# Improve the harness

Run this at Deploy, after the review fixes and before the merge.

1. Look at what went wrong on this change: the review's findings, what the person corrected, what the checks caught — and what the checks missed. Every gate stayed green on the dark-mode change while it broke its own AA rule, and again on products while a badge broke AA in light mode and the prices skipped the spec's cents. A green run is not evidence the requirements held.
2. For a mistake that has happened twice, add the correction to AGENTS.md or docs/REVIEW.md, or suggest a change to docs/STANDARDS.md for the person to make. Put it where it would have stopped the mistake: rules about writing the change go in AGENTS.md, rules about judging it in REVIEW.md. If a tool can catch it, add it to the checks instead, generalized to the whole class — the badge check now covers every badge in both modes, not just the one the review named.
3. Map the review to REVIEW.md's labels — Important and Nits — before acting. The products review came back as Blocker/Major/Minor because the instructions named another scale, which left "fix the Important findings" ambiguous.
4. Run the full gate after the fixes, not just the tests around them. The products fixes passed their focused tests; the full run then caught the wider prices scrolling a 1024px page sideways.
5. Remove anything out of date — counts, hedges and claims the fixes have since changed. The README claimed WCAG AA in both modes while light mode keeps its original, sometimes lower, contrast; it now matches the spec.
6. Improve this file, so that the next round makes a better change. Keep this as the last step.

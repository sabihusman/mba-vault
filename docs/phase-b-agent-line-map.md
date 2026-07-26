# Phase B — Agent-Line Map (gap-filler / tutor loop)

*Planning artifact — no code exists for this phase yet. Phase B is the tutor that
drafts supplementary content for gaps in the coursework corpus. This map decides,
per action, whether the agent acts autonomously, a human stays in the loop (HITL),
or the action sits above the line entirely (mechanical code path, no agent
discretion). Written before building, so the line is a design input, not a
post-hoc rationalization.*

| # | Action | Reversibility | Blast radius | Measurability | Verdict | Justification |
|---|--------|---------------|--------------|---------------|---------|---------------|
| 1 | Decide which gaps to propose for | High | Med | Low | **HITL** | Can't verify the right gaps were picked afterward. |
| 2 | Search web for sources | High | Low | High | Below | Read-only, capped, logged. |
| 3 | Select which sources to trust | High | Med | Med | Below | Constrained by the Tier-1 whitelist + two-tier rule (see `config/phase-b-sources.json`); not agent taste. |
| 4 | Draft supplementary content | High | Low | Low | **HITL** | Touches nothing until approved, but correctness isn't machine-verifiable. |
| 5 | Decide a draft is good enough to show | High | Med | Low | **HITL** | Self-grading is the known trap; Phase C critic takes this seat later. |
| 6 | Write approved item to `/supplementary/` | Med | High | High | **Above (mechanical)** | Corpus integrity is the core promise; the write is a code path triggered by human approval — the agent has no write tool. |
| 7 | Tag item (source, date, supplementary marker) | Med | High | High | **Above (mechanical)** | Enforced in the write code path. |
| 8 | Re-index after addition | Med | High | High | **Above (mechanical)** | Index writes stay forbidden to the agent, same as Staleness. |
| 9 | Choose past context/reports per run | High | Low | Med | Below | Gating an invisible reversible read is over-strict. |
| 10 | Spend per run | — | — | — | Bounded by env-var caps, not a per-decision call. | Same mechanism as Staleness (`STALENESS_*` cap pattern). |

## The hardest row

Row **#3 (source selection)**. The settling factor is **blast-radius-through-time**:
a bad source doesn't just spoil one draft — it poisons every downstream draft that
cites it. Mitigation is the whitelist (`config/phase-b-sources.json`): Tier-1
sources are usable freely, anything else flags the draft, and every draft needs
≥2 independent Tier-1 sources or it's flagged. **Tripwire:** if live runs show bad
source picks despite the whitelist, row #3 moves to HITL.

## Architectural enforcement (not convention)

- The agent has **no write tool**. Rows 6–8 happen in a separate code path that is
  triggered only by the human approval action — the agent can propose, never apply.
- `/supplementary/` is the **only** writable target of that code path;
  `/data/docs` stays untouchable (same hard constraint as the Staleness loop's
  report-only rule).
- Rejected drafts are **logged (episodic), not deleted** — the record of what was
  proposed and turned down is itself state the loop can learn from.

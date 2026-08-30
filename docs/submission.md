# Submission — copy/paste

Two forms. **Registration first** (`forms.gle/dNHFh7wH8uJj4bZH8`) — every
participant must register individually, and submitting without it may not count.

Deadline: **30 Aug 2026, 20:00 London**.

---

## 1. Registration form (~60 seconds)

| Field | Answer |
| --- | --- |
| Email | `sarthak@vaultwealth.com` |
| First name | `Sarthak` |
| Last name | `Agrawal` |
| Team or individual | **Individual** |
| Team name | `Solo` |
| Country | `India` |
| Company / School | `Vault Wealth` |
| Social media URL | *(optional — LinkedIn/X)* |
| Is this your first hackathon? | *(your call)* |

There is a page 2 the form did not reveal; it is short.

---

## 2. Project submission form

**Before you open it: upload the video to YouTube.** The form requires a
YouTube *link* — a file will not do. `docs/demo.mp4` (1:55) is the file.
Unlisted is fine.

| Field | Answer |
| --- | --- |
| Email | `sarthak@vaultwealth.com` |
| Team name | `SOLO` |
| Name of person submitting | `Sarthak Agrawal` |
| **Track** | **Best Use of TrueForge (NVIDIA DGX Spark)** |
| GitHub link | `https://github.com/sarthakagrawal927/headcount` |
| YouTube demo link | *(paste after upload)* |
| Deployed link | *(leave blank — it runs locally)* |
| Blog link | *(optional — `docs/blog.md` if you post it)* |

### What does your project do?

HEADCOUNT is an idle game whose economy is human attention — and an AI agent
designs the game while you approve its changes.

Idle games model a company where labour is perfect: a machine makes 3.2 units a
second forever, unsupervised. Real labour is not like that, and neither is an AI
agent — both are fast, tireless and **uncertain**, and uncertainty escalates to a
human. So in HEADCOUNT workers raise questions and you answer them at a fixed
rate. Throughput settles at `answerRate / confusion`, an equation headcount does
not appear in, so hiring cannot raise the ceiling and past your span of control
it lowers it: a hire-only strategy peaks at 4.56 tasks/sec and declines to 1.67,
with 21 of 23 staff standing idle.

The problem it is really about is the one every team adopting agents is walking
into: each agent you add costs a human more attention, and nobody has a good
interface for that. The tech tree here is an org chart — write the procedure
down, add a supervisor tier, grant autonomy — because those are the only three
ways to scale a factory, a startup, or a fleet of agents.

### How did you use TrueForge in your project?

Not as a wrapper — as the substrate. Every required capability is load-bearing:

- **MCP** — the live game is a remote MCP server (7 tools), annotated so the
  harness gates the mutating ones.
- **Sandbox** — the local provider (undocumented; no Daytona key needed) hosts
  the skill and code-mode client; the agent runs shell and Python in it.
- **Skills** — a git-backed `SKILL.md` carrying the genre's real maths, sparse-
  cloned from the repo and read on demand.
- **Approval gates** — `requireApprovalForTools` on all three mutating tools,
  set via API because it has no UI.
- **Subagents** — three critics on distinct lenses must try to *refute* a
  proposal before a human sees it; read-only by construction, verified against
  their stored manifests before the panel convenes.
- **Session persistence** — sessions bound by name, so the manifest re-resolves
  every turn. This is the signature mechanic: a supervisor process watches the
  floor and rewrites `requireApprovalForTools` at runtime, so the agent **earns**
  the right to act alone and loses it, mid-session, with no config change.

Three safety layers sit behind the gate, each added because of something the
agent actually did. The sharpest: it once **fabricated an evidence token**,
attached it to a well-argued rationale, a human approved it — and the server
refused it anyway, because a token nobody minted has no signature. Separately, a
change passed simulation, passed evidence binding, and applied with no human
involved because clearance had been earned; throughput fell from 3.33 to 1.11
tasks/sec and clearance was revoked automatically. Simulation was not sufficient.

`docs/harness-findings.md` documents five places TrueForge's docs and shipped
code disagree, including a `Query()` grammar that parses, starts a timer, and
silently renders placeholders forever.

### How did you use Qodo in your project?

Qodo reviewed every pull request; nothing substantive reached `main` unreviewed.

On [PR #2](https://github.com/sarthakagrawal927/headcount/pull/2) it raised six
findings, **every one marked High — and every one in `src/agent/autonomy.ts`**,
the file that decides whether an agent may act unsupervised, and therefore the
one place where failing permissively is the outcome that must not happen. Four
were unfixed and are addressed below; the other two we had already fixed on
`main`, which we said in the thread rather than claiming credit for:

- **Versions are not identities.** Pack versions restart at 1 with the game
  process, so a fresh run's first changes were skipped as already-seen —
  supervision silently suspended exactly when nobody was watching.
- **Unobserved was treated as neutral.** A change whose observation window was
  open when the supervisor died counted neither for nor against clearance, so a
  regression could vanish by being badly timed.
- **Stale clearance outlived its evidence** (Qodo flagged this security):
  `reconcile` ran only after a settle, so a regression recorded before a restart
  left earned autonomy live until the next change happened to land.
- **The critic panel protected nothing** — implemented, tested, and called from
  no path anyone actually runs.

All four are fixed on `main`, each answered in-thread, and two further findings
were already fixed there — which we said in the thread rather than claiming
credit. Qodo returned [PR #1](https://github.com/sarthakagrawal927/headcount/pull/1)
clean: 0 bugs, 0 rule violations, 0 requirement gaps.

It also caught a bug that no amount of running the system would have surfaced:
the declaration check compared snake_case identifiers against English prose, so
`line_lead` declared as "the Line Lead" read as *undeclared* and honest patches
were refused. A false accusation from a check whose entire job is catching
dishonesty.

---

## Links

- Repo: <https://github.com/sarthakagrawal927/headcount>
- Video file to upload: `docs/demo.mp4` (1:55)
- Write-up: [docs/blog.md](blog.md)
- Architecture: [docs/architecture.md](architecture.md)
- Harness findings: [docs/harness-findings.md](harness-findings.md)

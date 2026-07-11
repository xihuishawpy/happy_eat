# Issue tracker: Local Markdown

Tasks and PRDs for this repository live as Markdown files in `.scratch/`.

## Conventions

- One effort per directory: `.scratch/<effort-slug>/`
- The PRD is `.scratch/<effort-slug>/PRD.md`
- Implementation tasks are `.scratch/<effort-slug>/issues/<NN>-<slug>.md`, numbered from `01`
- Triage state is recorded as a `Status:` line near the top of each task file
- Blocking relationships are recorded as a `Blocked by:` line
- Comments and decisions are appended under a `## Comments` heading

## Publishing work

When a skill says to publish work to the issue tracker, create the corresponding Markdown file under `.scratch/<effort-slug>/`, creating the directory if needed.

## Fetching work

Read the referenced Markdown file. The user will normally provide its path or task number.

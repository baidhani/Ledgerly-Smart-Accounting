# STORY-000: Build the Command Center

**As** the project owner, **I want** a single Command Center page that shows what Ledgerly is building, what it is meant to move, and how far along it is, **so that** I can track and demo progress from one place for the whole programme.

## Done means

- Given the Command Center, when it is opened, then every tab is reachable and every card drills down one level.
- Given sample mode, when any tab is shown, then the sample data is visibly labelled as sample.
- Given the Command Center, when any tab renders, then .colaberry/plan.json and .colaberry/progress.json are both committed in this repo and every tab reads its content from them at runtime rather than from hard-coded values.
- Given the Command Center, when any tab is shown, then .colaberry/manifest.json is committed in this repo and every tab shows how old that data is and warns when the age exceeds a week.
- Trust — no tab shows a number, a connection or a result the project has not actually produced.

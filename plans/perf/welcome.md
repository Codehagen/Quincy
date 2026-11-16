# /welcome — performance plan

Reviewed 2026-08-11.

## No findings requiring action

- The wiring branch already runs its four reads (`getRhythmStates`, corpus,
  circleback, github) under `Promise.all`.
- The one sequential pair — `latestRiffScrap` then `readInterview` — is a
  genuine data dependency (the scrap is an input to the interview read), not
  a waterfall to fix.
- First-run rows are written moments before they are read, so the page's
  every-render freshness (the session read makes it dynamic) is a
  correctness requirement, not a cost to optimize away.

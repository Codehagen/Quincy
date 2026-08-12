# Contributing to Quincy

Thanks for taking the time. This document covers setup, the conventions the
codebase holds itself to, and how to get a change merged.

## Before you build

[`docs/vision.md`](docs/vision.md) decides *whether* a feature should exist;
[`AGENTS.md`](AGENTS.md) decides *how* it should be built. Read both before a
change of any size — a well-built feature the vision rules out ("a dashboard,
a thousand faceless accounts, follower charts, autoposting without approval")
will not be merged, however clean the code.

For anything larger than a bug fix, open an issue first and describe what you
want to build. It saves both of us a rewrite.

## Setup

[`docs/self-hosting.md`](docs/self-hosting.md) is the setup guide. In short:
Node 22+, pnpm (never npm), your own Neon Postgres database in
`DATABASE_URL`, `pnpm db:push`, and `scripts/dev-account.ts` for a verified
local account.

**Point `DATABASE_URL` at a database you own.** Migrations, `pnpm db:push`,
and the `scripts/verify-*.ts` suite all write to whatever that variable names.
There is no separate "dev mode" that protects you; the guards in this repo are
on the target, not the environment.

## Quality gates

All three must pass before you open a pull request:

```bash
pnpm typecheck
pnpm lint
pnpm test
```

The test suite runs without any environment variables — it is pure mocks, and
it must stay that way. Never wire a test to a live service or database; that
is what `scripts/verify-*.ts` is for, and those scripts never run in CI.

New behaviour comes with tests. Domain logic lives in `lib/` with its tests
beside it (`lib/adapt.ts` / `lib/adapt.test.ts` is the shape).

## Conventions that will come up in review

The full list lives in [`AGENTS.md`](AGENTS.md); these are the ones most
often missed:

- **pnpm only.** The lockfile is `pnpm-lock.yaml`; do not commit another.
- **Icons are `@hugeicons/react`, never `lucide`.** One icon library per
  surface.
- **Base UI, not Radix.** Use `render` for custom triggers, not `asChild`.
- **Colour comes from the ramp tokens** (`--brass-*`, `--sand-*`), never raw
  values. [`docs/colour.md`](docs/colour.md) is the argument.
- **No `transition-all`** — name the properties, and give every animation a
  `prefers-reduced-motion` path.
- **Every code path that spends money needs a ceiling, and a cooldown if a
  human can trigger it.** Both, not either. A comment explaining why a guard
  is unnecessary is a smell, not a substitute.
- **Forms** use `FieldGroup` + `Field` inside a real `<form>`, validate on
  blur, and render errors next to their field.

## Commit messages

Commits here are single sentences that say what changed and why it matters,
in plain prose — look at `git log --oneline` for the register. No
`feat:`/`fix:` prefixes.

## Pull requests

- Keep a PR to one concern. Two unrelated fixes are two PRs.
- Fill in the template: what changed, why, and how you verified it.
- If the change touches auth (`lib/auth.ts`, `components/auth/**`), say
  whether you ran `scripts/verify-auth-recovery.ts` against your own database.
- CI (typecheck, lint, tests) must be green before review.

## Reporting bugs and proposing features

Use the [issue templates](.github/ISSUE_TEMPLATE). For anything
security-sensitive, follow [SECURITY.md](SECURITY.md) instead of opening a
public issue.

## License

By contributing, you agree that your contributions are licensed under the
[GNU Affero General Public License Version 3 (AGPLv3)](LICENSE).

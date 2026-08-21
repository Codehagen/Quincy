/**
 * The guard every mutating operator script starts from.
 *
 * `AGENTS.md` ("There is one database") states the house rule this enforces:
 * the single Neon branch *is* production, so a script cannot ask the
 * environment whether it is safe to write — the environment does not know.
 * Only the target knows. An address ending `@quincy.test` is unreachable by
 * RFC 2606 and therefore cannot belong to a person; anything else might.
 *
 * It lives here rather than in `lib/` because it is an operator concern:
 * `lib/test-address.ts` answers "can this address receive mail", which the app
 * itself needs at runtime, and this answers "may I destroy what this address
 * owns", which only a script ever asks. The predicate is shared; the sentence
 * and the `process.exit` are not, because nothing in the running app should
 * ever be able to reach an exit call.
 *
 * The seed scripts are the reason it exists. `seed-drafts.ts` deletes **every
 * standing slot the account owns**, not only the ones it seeded — so one
 * mistyped argument takes out a real user's whole publishing schedule with no
 * undo. Guarding at the top of `main()` costs one line and removes the class.
 */
import { isUnreachableTestAddress } from "../lib/test-address"

/**
 * Refuses any address that could belong to a person, and exits.
 *
 * Call it immediately after reading the address and before the first database
 * read — not before the first *write*. A script that reads the row first has
 * already told an operator their typo names a real account, which is halfway
 * to acting on it.
 *
 * Returns the address, narrowed, so the call site can keep its `const`:
 * `const email = requireTestTarget(process.argv[2], "seed-drafts.ts")`.
 */
export function requireTestTarget(
  email: string | undefined,
  script: string
): string {
  if (isUnreachableTestAddress(email)) {
    return email as string
  }

  console.error(
    `Refusing to touch ${email ?? "(no address given)"} — ${script} mutates ` +
      `the production database and only runs against @quincy.test accounts. ` +
      `See AGENTS.md, "There is one database".`
  )
  process.exit(1)
}

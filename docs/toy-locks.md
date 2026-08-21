# Toy locks

A self-imposed speed bump you can put in front of any element the interface renders.

**It is for fun.** It is not encryption, it is not protection from anybody else who has this
computer, and it should never be put in front of anything you cannot afford to be locked out
of. Forgetting the answer is a *normal* outcome, which is why the recovery route is on the
unlock prompt itself rather than buried in a help page.

## What you can lock

Anything wrapped by `AppearanceTarget` — which is every element that can already have its
appearance edited. The commands live on that element's own right-click menu, beside
**Edit appearance…**:

| State | Commands offered |
|---|---|
| Not locked | **Lock this element…** |
| Locked | **Unlock this element…**, **Change this lock's password or authenticator…**, **Remove this lock** |
| Unlocked, session still open | **Lock it again now**, **Change this lock's password or authenticator…**, **Remove this lock** |
| Build cannot keep locks | *(no lock command at all)* |

The last row is deliberate. A menu item that opens a wizard which then says "this build
cannot keep locks" costs two clicks to learn what an absent item says immediately.

## A locked element is genuinely disabled

Not dimmed, not merely labelled — the guarded content is made `inert` while the lock is
closed, which removes it from hit testing, from the tab order and from the accessibility
tree at once. A class, a scrim, or `pointer-events: none` would each leave the element
*working* for anybody who reached it another way: a scrim is a sibling a keyboard user tabs
straight past, and `pointer-events: none` stops the mouse and nothing else, so <kbd>Tab</kbd>
still lands on the button and <kbd>Enter</kbd> still presses it.

A small **Locked** badge sits beside the element and is deliberately *outside* the inert
subtree — it is the way back in, and an inert root would take the only route out of the lock
down with everything else. The element also carries `aria-disabled="true"`, so the state
reaches assistive technology as well as the eye.

This still does not make a toy lock a security boundary. It makes it a lock that actually
stops the thing it is in front of, which is the least a lock can be worth.

## Changing a lock's credential

**Change this lock's password or authenticator…** replaces the credential while keeping the
lock and the element it guards. It is reachable from the element's own menu and from the
lock list, because the list manages locks on elements that are mostly somewhere else
entirely and cannot be right-clicked without first being on screen.

It is one step rather than remove-then-add on purpose. Those two are not equivalent from the
owner's side: an element that is briefly unlocked between them is an element anything can
touch in the gap, and a failure halfway through leaves it unlocked forever with nothing
saying so. The swap keeps the lock's id — so an open session, a failure count and a row the
list is rendering are not suddenly pointing at an id that has stopped existing — and it
closes the lock either way, because leaving the old session open would mean the replaced
password still had effect after being replaced.

## Every lock carries its own credential

There is no master credential and no inheritance. A tab may sit behind a password while the
font size beside it sits behind an authenticator. Unlocking one never unlocks another;
locking a group does not relock its members under the group's credential. If you want one
credential everywhere, you get there by deliberately reusing it — the application never
assumes it for you.

That is why locks are a real, enumerable list rather than a flag hanging off each element:
fifteen locks means fifteen credentials, and the only thing that makes that liveable is
being able to see the whole set, search it, and remove several at once.

## How a lock opens

**A password.** Stored as a PBKDF2-SHA-256 verifier with a per-lock salt and its own recorded
iteration count — never the password. The recorded count is why a lock made by an older build
keeps verifying after the cost constant moves.

**A code from an authenticator.** Standard TOTP (RFC 6238), from a secret you supply through
your own authenticator by scanning or by typing it in. The secret goes to the operating
system credential vault; the lock record itself holds only the *shape* — algorithm, digits,
period. A one-step window either side allows for clock drift and for the seconds it takes to
type six digits.

The wizard asks for one live code before the lock arms. That five seconds removes the entire
class of mis-scanned secrets whose owner finds out at exactly the moment they need it.

A build with no credential vault offers password locks only, and says why rather than hiding
the option.

## How long an unlock lasts

| Choice | Meaning |
|---|---|
| **This surface only** (default) | Gone the moment you leave the surface |
| **Until the app closes** | Held for the session |
| **For N minutes** | 1 to 1440, expiring exactly when it said |

Nothing survives a restart. Unlock sessions live in memory and nowhere else, so *"until the
app closes"* means it — a store that persisted an open session would be a speed bump that
quietly stopped bumping. Every lock is closed on launch.

There is an explicit **Lock it again now** on the element's menu and a **Lock again** on each
row of the list.

## When you get it wrong

Three attempts cost nothing. After that the wait grows and stops growing at thirty seconds.
The message says the answer did not match and nothing else — no hint, no length, no
indication of how close it came — and nothing is ever deleted, escalated or wiped.

One refusal is **not** your mistake and says so: a TOTP lock whose secret has gone from the
vault reports that the stored half is missing and that your authenticator is fine. Telling
you the code was wrong would send you to check the one thing that is working. That case never
counts against the attempt limit either.

## Recovery: deleting the application-data folder

Every lock on the machine is cleared at once by deleting this application's local data
folder. There is no reset ticket, no account, and no support channel, because a toy lock must
never be the only thing between you and your own content.

The unlock prompt names the exact folder and links to **Support Tickets**, which is that
route dressed as a service desk: a category, a description, a locally generated ticket
number, a severity nobody will honour, and a canned first response — and then a button that
opens the folder in your file manager so you can delete it yourself.

Three parts of that page are not jokes:

- **Nothing is sent anywhere.** No network request, no telemetry, nobody reading it. Asserted
  by a test that stubs `fetch` and proves it is never called.
- **The path shown and the path opened are the same string**, from the same source.
- **The application never deletes it for you.** It opens the folder and stands back.

Your worlds and rendered maps are not in that folder. Your settings, history and tickets are,
and they go with it.

## What a lock record can and cannot hold

Nothing in a lock record is a credential. A password is a verifier; a TOTP lock's secret is
in the vault. That is the property that lets a record travel into settings, local history and
an export with nothing to redact — and it is asserted directly, because it is exactly what a
refactor breaks in silence.

## Removing a lock

Removing one is **not** behind the two-key destructive gate, deliberately. It destroys no
content — the element behind it is untouched. Putting full ceremony in front of a harmless
operation teaches people to click through the gate, which is how the gate stops working for
the operations that genuinely need it.

Bulk removal previews its count first, and acts on **exactly** the set it previewed: select-all
covers what is currently shown, never silently reaching past an active filter.

## Verification

| Area | File |
|---|---|
| RFC 6238 published vectors, base32, `otpauth://` | `totp.test.ts` |
| Records hold no credential; one credential never opens another | `lockModel.test.ts` |
| Sessions, expiry, ordering, rate limiting, locked-on-launch | `lockStore.test.ts` |
| Wizard and unlock prompt honesty | `lockSurfaces.test.ts` |
| The commands actually reach the real wrapper | `lockTargetWiring.test.ts` |
| The list, bulk scope, and the recovery desk | `lockListAndSupport.test.ts` |

Each guard was confirmed to fail when the thing it guards was broken on purpose, then restored
— a guard nobody has watched fail proves nothing.

## Suggested articles

- [Appearance editors](appearance-editors.md) — the wrapper the locks share
- [Super confirmation](super-confirmation.md) — the gate that genuinely destructive actions use
- [Regex builder](regex-builder.md) — the search on the lock list


## Where the locks are kept

| | Where | Why there |
|---|---|---|
| Lock records | `toy-locks.v1.json` under this application's `userData` | Ordinary application data. A record carries a salted one-way verifier, which is what a password is checked *against*, never the password. |
| TOTP secrets | Encrypted through the OS credential store, beside the records | A base32 secret is a live credential: anyone holding it can generate valid codes forever. |

On a machine whose keychain cannot encrypt, the vault **refuses** rather than falling back to
writing the secret in the clear — the one failure that would turn a for-fun lock into a real
disclosure. The application then offers password locks and says plainly why an authenticator
is not on offer, which the surfaces already know how to do.

Records are written atomically. A half-written lock file read at the next launch is a list
that has silently lost locks, and losing a lock is losing the only record that an element was
ever locked at all. One malformed record is dropped on its own rather than costing you every
other lock in the file.

## In a build with no lock host

A plain browser tab has neither of those places, so `useLocks`'s probe finds nothing, the
store reports `canList: false`, and every element's context menu hides the lock commands. The
store is deliberately a real object with no host rather than `null`: every caller then gets
something whose list is honestly empty, instead of nine call sites null-checking and one of
them getting it wrong.

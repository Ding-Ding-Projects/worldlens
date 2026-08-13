# Authenticator

Time-based one-time passwords, kept on this computer.

## What it is for

Two things in this application need TOTP: the toy locks can sit behind an authenticator, and
this screen holds arbitrary secrets for whatever accounts you like. Both use one
implementation, verified against RFC 6238's own published vectors for SHA-1, SHA-256 and
SHA-512. That matters more than it sounds: a subtly wrong TOTP implementation does not
throw, does not warn and does not look wrong. It produces six plausible digits that every
server on earth rejects, and you have no error to read.

## Registering an account

Paste an `otpauth://` link, or type the issuer, account and secret by hand. Parameters
carried by the link are **honoured rather than overwritten** with our defaults: an issuer
that says SHA-512 means SHA-512, and assuming otherwise is exactly how a pairing produces
codes nothing accepts.

The QR is drawn **in this process**. No CDN, no chart service, no network call of any kind.
Handing a TOTP secret to a remote server to draw a square would defeat the whole point.

The secret is shown in copyable grouped base32 beside the QR, with the algorithm, digit
count and period stated. A QR alone is useless to somebody who cannot see it, and useless
again to somebody pairing on the very device displaying it.

**The pairing is proved before the entry is saved.** You type one current code back. Without
that step a mistyped or mis-scanned secret locks you out of something, and the first you
learn of it is when you need it.

## Reading a code

The current code in large grouped digits with a copy action, a countdown of seconds, and a
peek at the **next** code so nobody starts typing one with two seconds left on it. The
countdown is never colour-only.

A system clock skewed far enough that codes will be refused is reported in plain words,
rather than emitting confidently wrong digits.

## Where secrets live

The operating system credential vault, under a stable per-entry key. Never in settings
files, presets, the sync repository, logs, screenshots, history entries or Git. After the
one-time registration reveal, no stored secret is ever rendered again.

Ordinary exports omit secrets **and say that they omitted them**.

## Removing an account

Behind the two-key gate. It takes the secret out of the vault and nothing here can put it
back: you would pair that account again from the issuer, which for a second factor usually
means recovery codes or a support conversation.

## Verification

| Area | File |
|---|---|
| RFC 6238 published vectors, base32, `otpauth://` | `totp.test.ts` |
| Registration, pairing proof, list, live codes | `authenticator` suite |

## Suggested articles

- [Toy locks](toy-locks.md) - the other feature built on the same TOTP core

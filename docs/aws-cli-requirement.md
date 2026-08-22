# Why this app asks for the AWS CLI

The short version: **so it never has to hold your AWS keys.**

This is the same arrangement the app already has with GitHub, described in
[the GitHub CLI requirement](github-cli-requirement.md), and it is here for the same
reason. An application that stores a credential has to protect it, has to avoid logging
it, has to keep it out of every export and crash report and screenshot, and has to be
trusted about all of that. An application that asks a CLI you already signed in to is
simply not in a position to leak something it never had.

## What that means in practice

You need:

- the AWS CLI installed and on `PATH`;
- a profile that answers `aws sts get-caller-identity`;
- a region, either on the profile or chosen in the app.

The app runs `aws` as a child process with `--profile` and `--region` already applied, and
reads what it prints. That is the whole mechanism.

## What the app deliberately cannot do

There is no code path in `main/awsrender/` that returns an access key id, a secret access
key, a session token, or an environment block containing one. Not a private one, not a
"just for this call" one. The lease you get is a handle that can *do* things, not a value
that can be read, and a test asserts the absence structurally — because the change that
would break this is always a convenience method somebody adds in good faith, and review is
exactly where that slips past.

## One thing that surprises people

An `aws` child launched by this app **does not inherit** `AWS_ACCESS_KEY_ID`,
`AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`, `AWS_PROFILE`, `AWS_REGION` or their
siblings from the environment.

This is deliberate. A key sitting in your shell environment silently outranks the profile
you picked in the app, so your render would run as an identity you did not choose while
the screen confidently named a different one. Dropping them makes the profile you selected
the only thing that decides.

If you normally work with keys in your environment, set up a named profile for rendering
instead. `aws configure --profile render` is enough.

## When something is wrong

The app distinguishes three states rather than reporting "AWS unavailable", because the
fix for each is a completely different sentence:

| State | What it means | What to do |
| --- | --- | --- |
| **Not installed** | The `aws` command is not there, or not on `PATH`. | Install the AWS CLI. |
| **Signed out** | The CLI is there and AWS refused the credential. | `aws configure sso`, or `aws configure`. |
| **Ready** | A real `sts get-caller-identity` call succeeded. | Nothing. |

An expired SSO session reports as signed out, not as a broken install — otherwise you go
and download software you already have.

A profile with no region is refused rather than guessed at. AWS will not pick a region for
you and neither will this: a render that quietly ran in the wrong continent would be both
slower and billed somewhere you were not looking.

## Related

- [Rendering on AWS](aws-render.md)
- [AWS hosting](aws-hosting.md)
- [The GitHub CLI requirement](github-cli-requirement.md) — the same arrangement, for
  GitHub.

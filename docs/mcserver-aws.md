# Minecraft server on AWS

Provisioning a fourth place a server can live: an EC2 instance this application creates,
tags, prices and tears down for itself. **This is backend logic only. There is no screen in
the application that reaches it today** — the create-server wizard offers a local process, a
local Docker container, and a container reached over SSH, and none of those three paths lead
here. Everything below is exercised by its own test suite against a fake command runner,
never by a person clicking through the built application.

## Behaviour

Once an instance exists, WorldLens does not need a fourth transport implementation to talk
to it: `transport.ts` in this folder is `sshDocker.ts`, unchanged, handed an SSH target that
happens to be an instance this app just created rather than a machine somebody already had.
The console, the config editor, the plugin manager and the players tables described in
[`docs/minecraft-server-manager.md`](./minecraft-server-manager.md) all work on an
AWS-provisioned server exactly as they do on any other SSH-reached Docker host, once one
exists. The genuinely new work in this folder is getting from "nothing" to "a reachable
Docker host with a security group that lets 25565 through":

1. **Plan.** `plan.ts` turns an `AwsServerSpec` (region, instance type, disk size, whether to
   allocate a static Elastic IP, and the security-group rules) into a list of the exact
   resources that will be created, each with an estimated monthly cost, before any AWS API
   call is made.
2. **Provision.** `provision.ts` executes that plan against the real `aws` CLI (or, in every
   test, a fake `CommandRunner`), one step at a time, in the order the plan named. Every
   step is idempotent by construction: it looks for a resource this app already tagged for
   this server id, and only creates one when that lookup comes back empty, so retrying after
   a crash or a transient AWS error continues rather than duplicating.
3. **Roll back on failure.** If a later step fails, `rollbackCreated` walks the steps this
   run itself created, in reverse, and removes only those — never a resource the plan found
   already existing, because undoing that would delete something this run did not make.
4. **Tear down.** `teardown.ts` removes everything tagged for one server id. Every deletion
   re-reads the resource's own tags from AWS immediately before the destructive call, rather
   than trusting the local record — so a stale id that has since been repurposed by someone
   else can never cause this to delete the wrong machine.

### Pricing is estimated, not fetched

The cost shown for each planned resource is a hand-maintained, on-demand list-price table
(`EC2_HOURLY_USD` in `plan.ts`) multiplied out to a monthly figure on AWS's own 730-hour
convention — never a call to the AWS Price List API, which would put a remote round trip in
front of the one screen that most needs to render instantly and offline. When an instance
type is not in the table, or a cost genuinely depends on usage this function cannot know
(data transfer, EBS snapshot storage), the estimate is `null` rather than a guess, and the
plan's `hasUnknownCost` flag is set so the interface can say plainly that the true number may
be higher.

### Accounts and credit are read, never held

`accounts.ts` lists whatever AWS CLI profiles already exist on this machine, read at the
moment they are asked for. There is no account list of this application's own, no access key
is ever read, written, or asked for, and this module's whole security posture rests on that:
a second list would mean this app deciding which credentials exist, and the only way to be
sure of that is to hold them. `credits.ts` answers a narrower, honestly-labelled question —
how much promotional credit has been *applied* over a period, via Cost Explorer — rather than
"how much is left", which AWS publishes no API for at all; reporting the first as the second
would be a number somebody plans a purchase around, and it would be wrong.

## Configuration

Every field in an `AwsServerSpec` is one this application can tag, price and tear down again;
there is deliberately no free-text "extra resource" field, because a field this app cannot do
all three for is a field that turns into an orphaned bill nobody can find. RCON's security
rule is never opened wider than the operator's own IP address; only the game port is opened
to `0.0.0.0/0`.

## Failure modes

Every step answers `{ ok: true, value }` or `{ ok: false, failure }`; nothing throws. A
partially completed provision leaves an honest record of which steps created something
(subject to rollback) and which found an existing resource (never touched by rollback). A
teardown step whose deletion itself fails is reported by name rather than silently skipped.

## Security considerations

- No AWS access key, secret key or session token is ever read, stored, or passed by this
  module; every call goes through `runner("aws", [...])`, and the CLI resolves its own
  credentials from whatever profile, environment or SSO session is already configured on the
  machine.
- Every resource this app creates is tagged `worldlens:owner` / `worldlens:server-id`, and
  every deletion re-verifies those tags directly against AWS immediately before deleting,
  rather than trusting a locally cached id.
- RCON's security-group rule is scoped to the operator's own IP by construction, never to the
  open internet, even though the game port itself is opened publicly by design.

## Verification

- `packages/app/src/main/mcserver/aws/plan.test.ts`, `provision.test.ts` and
  `teardown.test.ts` cover pricing (including the unknown-cost case), idempotent
  create-or-find-existing behaviour for every resource kind, rollback that touches only
  what a run itself created, and tag-verified deletion, all against a fake `CommandRunner`.
- Not yet run, and not reachable from the built application at all: any of the above against
  a real AWS account, and any user interface path that would let a person choose this as a
  server's home. Treat this feature as backend-only until a wizard step exists that leads
  here.

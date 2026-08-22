# Rendering on AWS

A second place to run a cloud render, beside [GitHub Actions](render-in-actions.md). It
exists for the cases the Actions route handles badly: a world large enough that splitting
it into 1.5 GB parts costs a full extra pass over the disk, and a render that wants more
CPU or memory than a hosted runner has.

It costs money. That is the whole trade, and this page says so before anything else does.

## What it uses

| Piece | What it does |
| --- | --- |
| **S3** | Holds the world going in and the map coming out. One object, no splitting. |
| **AWS Batch on Fargate** | Runs the render. A sharded world becomes one array job. |
| **CloudWatch Logs** | Where the render's output goes, and where the log tail comes from. |
| **IAM** | Two roles: one for the container to start, one for it to act as. |

Batch rather than a bare ECS task because a render is queued work. A world needing eight
shards submits one array job of eight and lets Batch find capacity for each index;
doing that over `RunTask` means hand-writing a queue, a retry and a fan-in that already
exist.

## The credential

**This app never holds your AWS keys.** It shells out to the `aws` CLI you already have
signed in, exactly as the GitHub route asks the `gh` CLI to act rather than storing a
token. There is no method anywhere in `main/awsrender/` that returns an access key, a
secret or a session token, and a test asserts that structurally rather than trusting code
review to keep noticing.

An `aws` child also never inherits an ambient `AWS_ACCESS_KEY_ID` or `AWS_PROFILE` from the
environment. A key sitting in the parent environment silently outranks the profile you
chose, so the render would run as an identity nobody selected while the screen named a
different one.

You need the AWS CLI installed and a profile that answers `aws sts get-caller-identity`. A
profile that merely exists in your config file proves nothing: it can name a region, look
complete, and be signed out.

## Setting it up

The app creates what it needs, and **shows you the bill first**:

- an S3 bucket, with the account id in its name because bucket names are global across all
  of AWS and `worldlens-renders` is certainly taken;
- two IAM roles, which cost nothing;
- a CloudWatch log group;
- a Fargate compute environment, a job queue and a job definition.

Every billable item is listed with a real figure rather than "it depends on usage", which
is the sentence people read immediately before an unexpected bill. Nothing is created
until you have seen that list.

### What it costs

Order-of-magnitude figures in US dollars, which vary by region and change without notice:

- **At rest:** only the bucket. The compute environment sits at zero vCPUs and costs
  nothing when no render is running. S3 storage is roughly $0.023 per GB per month, so a
  20 GB world is well under a dollar a month, and nothing at all once you empty the bucket.
- **Per render:** Fargate bills per second, roughly $0.04 per vCPU-hour and $0.004 per
  GB-hour. A four-vCPU render taking an hour is a few tens of cents. Logs are roughly $0.50
  per GB ingested and a render's log is a few MB.
- **Serving the map**, if you also host on AWS: see [AWS hosting](aws-hosting.md).

## No part splitting

The Actions route splits a world into 1.5 GB parts because that is what a GitHub release
asset holds. S3 takes a single object to 5 TB and the CLI does multipart transfer
underneath by itself, so this route uploads the world whole.

That is enforced rather than merely intended: a test reads `s3Upload.ts` and fails if it
ever imports the packer, because the tempting change is to "reuse" the existing splitting
code and quietly pay for a whole extra pass over the world for a limit that does not apply.

An upload is skipped entirely when an object of the same size **and the same SHA-256** is
already there. Size alone is not enough — a world edited to exactly the same length is
unlikely, and a wrong reuse renders your old world and reports it as your new one.

## Reading a running render

- **`RUNNABLE` means queued, not running.** A Batch job can sit there for minutes while
  Fargate finds capacity. Nothing is wrong, and the app says queued rather than pretending
  the render has started.
- **A state the app does not recognise is treated as still going**, never as finished.
  Ending the poll loop early would announce a live render as done.
- **A downloaded map is "recorded", not "verified".** S3 publishes an ETag, but an ETag is
  only a content digest for a single-part object; for a multipart one it is a digest of
  digests, so matching it against a SHA-256 would fail on exactly the large worlds this
  route exists for. Claiming a verification that never happened is worse than admitting
  there was none.
- **Batch forgets a finished job after about 24 hours.** A job that has aged out is
  reported as forgotten rather than as failed.

## Stopping and cleaning up

Stopping sends both `cancel-job` and `terminate-job`, because the first only works before
a job starts and the second only after — sending one would silently do nothing half the
time.

Every resource the app creates is tagged `worldlens:managed=true`. Reconciliation lists
what is really in your account and compares it against the app's own record, then
**reports** the difference. It does not repair it: a resource the app has no record of may
well be a colleague's, so deleting it would cost them their work, and recreating one you
deliberately removed would cost you money silently. Both decisions are yours.

Tearing the setup down goes through the same two-key confirmation gate as every other
destructive action in this app.

## Related

- [Rendering in GitHub Actions](render-in-actions.md) — the free route, and the default.
- [AWS hosting](aws-hosting.md) — serving the finished map from S3 and CloudFront.
- [The AWS CLI requirement](aws-cli-requirement.md) — why this app asks for the CLI rather
  than your keys.
- [Large worlds](large-worlds.md) — what makes a world large, on either route.

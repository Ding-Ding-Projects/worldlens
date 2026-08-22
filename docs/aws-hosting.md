# Serving a map from AWS

A third place to host a finished map, beside [GitHub Pages](pages-hosting.md) and
[this computer](remote-render.md): an S3 bucket served through CloudFront.

Hosting is chosen **separately from where the render runs**. Rendering on GitHub Actions
and hosting on AWS is a perfectly reasonable combination, and so is the reverse; tying the
two together would rule both out for no reason you would recognise.

## Why CloudFront and not a load balancer

A rendered map is static tiles. An Application Load Balancer costs roughly $16 a month
simply to exist, needs always-on tasks behind it, and serves those tiles no better than an
edge cache does. CloudFront has no idle cost and puts the tiles near whoever is looking.

If you specifically need an ALB — a private network, per-request control — that is a
reasonable thing to want and this route does not currently do it. Say so and it can be
added as a fourth hosting choice under the same picker.

## What it costs

Unlike Pages, this one bills you. Order-of-magnitude figures in US dollars:

- **S3 storage**, roughly $0.023 per GB per month. A rendered map is usually much smaller
  than the world it came from.
- **Traffic**, charged on data leaving AWS. A map nobody visits costs nothing to serve.
- **CloudFront requests**, fractions of a cent per ten thousand.

The setup preflight lists every resource it will create with its own cost note before
anything is created. Nothing is made until you have read it.

## When to pick it

- Your world renders on AWS anyway, so the map is already in the bucket.
- The map is bigger than you want to commit to a repository.
- You want it fast for people a long way from one region.
- You do not want it in a public repository.

Pages remains the right answer when none of those apply. It is free and it stays free.

## Custom domain

Any hosting route can answer on your own domain — see [custom domains](custom-domains.md).
For this route the record is a `CNAME` to the CloudFront distribution, unproxied, since
CloudFront is already a CDN.

## Related

- [Rendering on AWS](aws-render.md)
- [Pages hosting](pages-hosting.md)
- [Custom domains](custom-domains.md)

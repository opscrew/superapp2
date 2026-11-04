# superapp2

Sample application for Ops-Crew: the upstream API [superapp](../superapp) calls. It answers at once while traffic is light and gets slow as the request rate rises, by burning CPU: none up to `NORMAL_MAX_RPS`, ramping linearly to a full core at `SATURATED_RPS`, and past it asking for more than a core can give (up to two), so it is saturated. Node runs on one thread, so requests queue behind the burning, and callers see it as latency: a little at first, then seconds and timeouts. Requests whose caller already gave up are dropped, so the backlog stays bounded.

| Variable | Default | |
|---|---|---|
| `NORMAL_MAX_RPS` | `3` | up to this many requests per second, no extra work |
| `SATURATED_RPS` | `6` | from this many, a full core and more |

The request rate is counted over the last two seconds.

- `GET /healthz`: liveness.
- `GET /hog?mb=1024`: allocate and retain N MB in 64MB chunks, so the pod gets OOMKilled on demand.
- Any other path: the API, answering `{ app, version, answer, at }`.

Deployed by [superapp2-infra](../superapp2-infra), whose Kustomize manifests Argo CD syncs; they set both rates (`NORMAL_MAX_RPS`, `SATURATED_RPS`) and a CPU limit of a full core. The GitHub Actions workflow publishes `ghcr.io/<org>/superapp2`.

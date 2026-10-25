# superapp2

Sample application for Ops-Crew, a sibling of superapp: the same service under another name, with its own repositories and stacks, so that what Ops-Crew learns on one App can be seen reaching (or not reaching) the other. A tiny HTTP service with an endpoint that hoards memory so the pod gets OOMKilled on demand.

- `GET /` — identity and current RSS
- `GET /healthz` — liveness
- `GET /hog?mb=1024` — allocate and retain N MB in 64MB chunks

Deployed by [superapp2-infra](../superapp2-infra) with Pulumi. The GitHub Actions workflow publishes `ghcr.io/<org>/superapp2`.

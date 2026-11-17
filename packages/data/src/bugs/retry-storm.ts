// Bug museum entry. Generic on purpose: no employer, client or product details.
import type { BugEntryInput } from '../schema';

const entry: BugEntryInput = {
    slug: 'retry-storm',
    frontmatter: {
        title: 'The retry loop that kept the outage going',
        date: '2026-11-14',
        severity: 'high',
        stack: ['Python', 'FastAPI', 'REST APIs'],
        tags: ['resilience', 'http', 'integrations'],
    },
    body: `## Symptom

A third-party CRM-style API had a short outage. It came back within minutes, but our sync service kept failing with \`429 Too Many Requests\` for a long time afterwards, and records stayed out of date.

## Investigation

The request logs showed calls arriving in tight bursts: dozens of identical requests in the same second, then silence, then another burst. Each burst lined up exactly with the retry delay in the client code. The remote API was healthy; it was rate-limiting us because of our own traffic.

## Root cause

Every background worker retried a failed call after the same fixed delay, with no jitter and no upper limit on attempts. When the outage started, all workers failed together, so they all retried together, in lockstep. The synchronized bursts kept hitting the rate limit, which caused more failures and more retries. The \`Retry-After\` header the API sent was ignored.

## Fix

- Exponential backoff with **full jitter** (a random delay between zero and the current backoff ceiling), so retries spread out.
- A cap on attempts, after which the job is parked in a queue for later instead of retried forever.
- The client now honours \`Retry-After\` when the API sends it.
- A simple circuit breaker: after repeated failures the client stops calling for a cool-down period and fails fast.
- Writes became idempotent (keyed by the source record id), so a retried request can never create a duplicate.

## Lesson

Retries are load. Spread them out, respect what the other side tells you, and make sure that "try again" can never do the same thing twice.
`,
};

export default entry;

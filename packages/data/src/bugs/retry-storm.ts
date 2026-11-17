// SAMPLE bug museum entry. Generic on purpose: no employer or client details.
import type { BugEntryInput } from '../schema';

const entry: BugEntryInput = {
    slug: 'retry-storm',
    frontmatter: {
        title: 'The retry loop that DDoSed itself',
        date: '2023-08-22',
        severity: 'high',
        stack: ['Node.js', 'REST APIs'],
        tags: ['resilience', 'http', 'queues'],
        sample: true,
    },
    body: `## Symptom

A short outage of a third-party API turned into an hour of rate-limit errors after it recovered.

## Investigation

Request logs showed thousands of identical calls fired at the same second, every few seconds.

## Root cause

Every worker retried immediately with a fixed delay and no jitter, so all retries arrived together.

## Fix

Exponential backoff with full jitter, a retry cap, and a circuit breaker around the client.

## Lesson

Retries are load. Spread them out and give the other side room to recover.
`,
};

export default entry;

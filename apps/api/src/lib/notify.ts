import { EmailMessage } from 'cloudflare:email';
import type { Env } from '../env';

export interface InterviewRequestRecord {
    id: string;
    createdAt: string;
    name: string;
    company: string;
    email: string;
    role: string;
    message: string;
}

/** Removes CR/LF so user input can never inject extra MIME headers. */
function headerSafe(value: string): string {
    return value.replace(/[\r\n]+/g, ' ').trim();
}

/** RFC 2047 encodes a header value when it is not plain ASCII. */
function encodeHeader(value: string): string {
    const safe = headerSafe(value);
    if (/^[\x20-\x7e]*$/.test(safe)) return safe;
    const bytes = new TextEncoder().encode(safe);
    let binary = '';
    for (const b of bytes) binary += String.fromCharCode(b);
    return `=?UTF-8?B?${btoa(binary)}?=`;
}

function base64Lines(text: string): string {
    const bytes = new TextEncoder().encode(text);
    let binary = '';
    for (const b of bytes) binary += String.fromCharCode(b);
    return (btoa(binary).match(/.{1,76}/g) ?? []).join('\r\n');
}

/** Builds a plain-text MIME message for one interview request. */
export function buildRawEmail(
    from: string,
    to: string,
    req: InterviewRequestRecord,
): string {
    const subject = `Interview request: ${req.role} at ${req.company}`;
    const body = [
        `New interview request (${req.id})`,
        `Received: ${req.createdAt}`,
        '',
        `Name: ${req.name}`,
        `Company: ${req.company}`,
        `Email: ${req.email}`,
        `Role: ${req.role}`,
        '',
        req.message,
        '',
    ].join('\n');
    return [
        `From: api.faheemnaeem.dev <${headerSafe(from)}>`,
        `To: <${headerSafe(to)}>`,
        `Reply-To: <${headerSafe(req.email)}>`,
        `Subject: ${encodeHeader(subject)}`,
        `Message-ID: <${req.id}@${headerSafe(from).split('@')[1] ?? 'faheemnaeem.dev'}>`,
        `Date: ${new Date(req.createdAt).toUTCString()}`,
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: base64',
        '',
        base64Lines(body),
        '',
    ].join('\r\n');
}

/**
 * Sends the notification email. Never throws: failures are logged and
 * reported as `false`, because the request is already stored in D1.
 */
export async function notifyInterviewRequest(
    env: Env,
    req: InterviewRequestRecord,
): Promise<boolean> {
    const to = env.NOTIFY_EMAIL;
    const from = env.NOTIFY_FROM;
    if (!env.SEND_EMAIL || !to || !from || to.includes('<')) {
        console.error(
            JSON.stringify({
                event: 'notify_skipped',
                id: req.id,
                reason: 'SEND_EMAIL, NOTIFY_EMAIL or NOTIFY_FROM not configured',
            }),
        );
        return false;
    }
    try {
        await env.SEND_EMAIL.send(
            new EmailMessage(from, to, buildRawEmail(from, to, req)),
        );
        return true;
    } catch (err) {
        console.error(
            JSON.stringify({
                event: 'notify_failed',
                id: req.id,
                error: err instanceof Error ? err.message : String(err),
            }),
        );
        return false;
    }
}

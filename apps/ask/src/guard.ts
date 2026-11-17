// Input guardrails that run BEFORE the model is called (they save Neurons).
// The client is never trusted: the body is validated with Zod, history is
// filtered down to {role: user|assistant, content: string} and capped.
import { z } from 'zod';

export const MAX_QUESTION_CHARS = 500;
export const MAX_HISTORY_TURNS = 4;
/** One turn = one user message + one assistant message. */
export const MAX_HISTORY_MESSAGES = MAX_HISTORY_TURNS * 2;
export const MAX_ASSISTANT_CHARS = 1200;
export const MAX_BODY_BYTES = 16_384;

export interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
}

const BodySchema = z.object({
    question: z.string(),
    // Entries are checked one by one below; anything malformed is dropped.
    history: z.array(z.unknown()).max(50).optional(),
    turnstileToken: z.string().max(2048).optional(),
});

const MessageSchema = z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
});

export type GuardError =
    'invalid_body' | 'empty' | 'too_long' | 'spam' | 'duplicate';

export type GuardResult =
    | {
          ok: true;
          question: string;
          history: ChatMessage[];
          turnstileToken: string | undefined;
      }
    | { ok: false; error: GuardError; message: string };

const MESSAGES: Record<GuardError, string> = {
    invalid_body: 'Send JSON: {"question": "...", "history": []}.',
    empty: 'Please type a question.',
    too_long: `Please keep questions under ${MAX_QUESTION_CHARS} characters.`,
    spam: 'That does not look like a question. Try asking about my experience or skills.',
    duplicate: 'You just asked that. Try rephrasing or asking something else.',
};

function fail(error: GuardError): GuardResult {
    return { ok: false, error, message: MESSAGES[error] };
}

/** Lowercased, whitespace-collapsed form used for duplicate detection. */
export function normalizeQuestion(text: string): string {
    return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function looksLikeSpam(text: string): boolean {
    const letters = text.match(/\p{L}/gu)?.length ?? 0;
    if (letters < 2) return true;
    // Ten or more of the same character in a row ("aaaaaaaaaa", "!!!!!!!!!!").
    return /(.)\1{9,}/su.test(text);
}

/** Keeps only well-formed messages, caps lengths, keeps the last 4 turns. */
export function sanitizeHistory(raw: unknown[]): ChatMessage[] {
    const clean: ChatMessage[] = [];
    for (const item of raw) {
        const parsed = MessageSchema.safeParse(item);
        if (!parsed.success) continue;
        const limit =
            parsed.data.role === 'user'
                ? MAX_QUESTION_CHARS
                : MAX_ASSISTANT_CHARS;
        // Strip control characters (except newline/tab) and cap the length.
        const content = parsed.data.content
            // eslint-disable-next-line no-control-regex
            .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '')
            .trim()
            .slice(0, limit);
        if (content) clean.push({ role: parsed.data.role, content });
    }
    const recent = clean.slice(-MAX_HISTORY_MESSAGES);
    // The conversation must start with a user message.
    while (recent[0]?.role === 'assistant') recent.shift();
    return recent;
}

export function validateRequest(body: unknown): GuardResult {
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) return fail('invalid_body');
    const question = parsed.data.question.trim();
    if (!question) return fail('empty');
    if (question.length > MAX_QUESTION_CHARS) return fail('too_long');
    if (looksLikeSpam(question)) return fail('spam');
    const history = sanitizeHistory(parsed.data.history ?? []);
    const lastUser = [...history].reverse().find((m) => m.role === 'user');
    if (
        lastUser &&
        normalizeQuestion(lastUser.content) === normalizeQuestion(question)
    )
        return fail('duplicate');
    return {
        ok: true,
        question,
        history,
        turnstileToken: parsed.data.turnstileToken || undefined,
    };
}

/** Removes emails and phone-like numbers before a question is logged. */
export function redactForLog(text: string): string {
    return text
        .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[email]')
        .replace(/\+?\d[\d\s().-]{7,}\d/g, '[number]');
}

export const TURNSTILE_VERIFY_URL =
    'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export interface TurnstileResult {
    success: boolean;
    errorCodes: string[];
}

/** Verifies a Turnstile token with Cloudflare's siteverify endpoint. */
export async function verifyTurnstile(
    secret: string,
    token: string,
    remoteIp?: string,
): Promise<TurnstileResult> {
    const form = new FormData();
    form.append('secret', secret);
    form.append('response', token);
    if (remoteIp) form.append('remoteip', remoteIp);
    try {
        const res = await fetch(TURNSTILE_VERIFY_URL, {
            method: 'POST',
            body: form,
        });
        if (!res.ok) {
            return { success: false, errorCodes: [`http-${res.status}`] };
        }
        const data = (await res.json()) as {
            success?: boolean;
            'error-codes'?: string[];
        };
        return {
            success: data.success === true,
            errorCodes: data['error-codes'] ?? [],
        };
    } catch {
        return { success: false, errorCodes: ['network-error'] };
    }
}

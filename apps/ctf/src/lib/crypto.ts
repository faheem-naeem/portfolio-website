export async function sha256Hex(input: string): Promise<string> {
    const digest = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(input),
    );
    return [...new Uint8Array(digest)]
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

export async function sha256Base64(input: string): Promise<string> {
    const digest = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(input),
    );
    let bin = '';
    for (const byte of new Uint8Array(digest)) bin += String.fromCharCode(byte);
    return btoa(bin);
}

/** Compares two strings in time that depends only on their length. */
export function timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++)
        diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}

/** True when sha256(flag) matches the configured hex hash. */
export async function verifyFlag(
    flag: string,
    flagHash: string,
): Promise<boolean> {
    const expected = flagHash.trim().toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(expected)) return false;
    return timingSafeEqual(await sha256Hex(flag.trim()), expected);
}

// Decides between the ANSI text resume and the browser terminal page.

const TERMINAL_UA =
    /^(curl|wget|httpie|xh|lwp-request|fetch|aria2)\b|powershell/i;

/** True for curl, wget, HTTPie, PowerShell or an explicit `Accept: text/plain`. */
export function isTerminalClient(req: Request): boolean {
    const ua = req.headers.get('User-Agent') ?? '';
    if (TERMINAL_UA.test(ua)) return true;
    const accept = (req.headers.get('Accept') ?? '').toLowerCase();
    return accept.includes('text/plain') && !accept.includes('text/html');
}

/** `?nocolor`, `?no_color` or `?NO_COLOR` (any value) disables ANSI codes. */
export function wantsNoColor(req: Request): boolean {
    const params = new URL(req.url).searchParams;
    for (const key of params.keys()) {
        if (/^no[-_]?colou?r$/i.test(key)) return true;
    }
    return false;
}

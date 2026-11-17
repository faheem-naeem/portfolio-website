// Small 5-row block font for the ASCII-art name banner. Unknown characters fall
// back to the plain name, so a renamed owner never breaks the output.
const FONT: Record<string, string[]> = {
    A: [' ███ ', '█   █', '█████', '█   █', '█   █'],
    B: ['████ ', '█   █', '████ ', '█   █', '████ '],
    C: [' ████', '█    ', '█    ', '█    ', ' ████'],
    D: ['████ ', '█   █', '█   █', '█   █', '████ '],
    E: ['█████', '█    ', '████ ', '█    ', '█████'],
    F: ['█████', '█    ', '████ ', '█    ', '█    '],
    G: [' ████', '█    ', '█  ██', '█   █', ' ████'],
    H: ['█   █', '█   █', '█████', '█   █', '█   █'],
    I: ['█████', '  █  ', '  █  ', '  █  ', '█████'],
    J: ['█████', '   █ ', '   █ ', '█  █ ', ' ██  '],
    K: ['█   █', '█  █ ', '███  ', '█  █ ', '█   █'],
    L: ['█    ', '█    ', '█    ', '█    ', '█████'],
    M: ['█   █', '██ ██', '█ █ █', '█   █', '█   █'],
    N: ['█   █', '██  █', '█ █ █', '█  ██', '█   █'],
    O: [' ███ ', '█   █', '█   █', '█   █', ' ███ '],
    P: ['████ ', '█   █', '████ ', '█    ', '█    '],
    Q: [' ███ ', '█   █', '█ █ █', '█  █ ', ' ██ █'],
    R: ['████ ', '█   █', '████ ', '█  █ ', '█   █'],
    S: [' ████', '█    ', ' ███ ', '    █', '████ '],
    T: ['█████', '  █  ', '  █  ', '  █  ', '  █  '],
    U: ['█   █', '█   █', '█   █', '█   █', ' ███ '],
    V: ['█   █', '█   █', '█   █', ' █ █ ', '  █  '],
    W: ['█   █', '█   █', '█ █ █', '██ ██', '█   █'],
    X: ['█   █', ' █ █ ', '  █  ', ' █ █ ', '█   █'],
    Y: ['█   █', ' █ █ ', '  █  ', '  █  ', '  █  '],
    Z: ['█████', '   █ ', '  █  ', ' █   ', '█████'],
    ' ': ['  ', '  ', '  ', '  ', '  '],
};

/** Returns banner lines, or null when the name cannot be drawn within maxWidth. */
export function bannerLines(name: string, maxWidth: number): string[] | null {
    const chars = [...name.toUpperCase()];
    const glyphs = chars.map((ch) => FONT[ch]);
    if (glyphs.some((g) => !g)) return null;
    const rows = [0, 1, 2, 3, 4].map((row) =>
        glyphs
            .map((g) => g?.[row] ?? '')
            .join(' ')
            .trimEnd(),
    );
    const width = Math.max(...rows.map((r) => [...r].length));
    return width <= maxWidth ? rows : null;
}

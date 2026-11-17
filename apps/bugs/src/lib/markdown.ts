// Renders exhibit markdown with Astro's own processor (remark + Shiki), so code
// blocks get build-time syntax highlighting and ```diff blocks get before/after
// colouring with zero client-side JS. Bodies use "## Section" headings, which
// sit correctly below the page's single <h1>.
import {
    createMarkdownProcessor,
    type MarkdownRenderer,
} from '@astrojs/markdown-remark';

let processor: Promise<MarkdownRenderer> | undefined;

function getProcessor(): Promise<MarkdownRenderer> {
    processor ??= createMarkdownProcessor({
        syntaxHighlight: 'shiki',
        shikiConfig: {
            themes: { light: 'github-light', dark: 'github-dark' },
            wrap: true,
        },
    });
    return processor;
}

export async function renderMarkdown(markdown: string): Promise<string> {
    const md = await getProcessor();
    const { code } = await md.render(markdown);
    return code;
}

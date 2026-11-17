# @faheem/ui

Shared design tokens, base CSS and an HTML layout for every faheemnaeem.dev app. TypeScript source, no build step.

- `@faheem/ui/tokens.css`, `@faheem/ui/base.css`: plain CSS (light + dark via `prefers-color-scheme`, focus-visible, skip link, reduced motion). Colours and fonts come from `apps/web/static/faheem-portfolio.html`.
- `@faheem/ui/styles`: the same CSS as strings (`tokensCss`, `baseCss`, `allCss`) for Workers. Generated: after editing a `.css` file run `pnpm --filter @faheem/ui sync-css` (a test fails if they drift).
- `layout({ title, body, current, lang, description, head, inlineCss, stylesheets })`: returns a complete HTML document string with skip link, shared header (links from `@faheem/data` `sites.json`, `aria-current="page"` on `current`), `<main id="main">` and footer. `title` and `description` are escaped; `body` and `head` are trusted HTML, so escape user input with `escapeHtml`.

```ts
import { layout } from '@faheem/ui';
return c.html(
    layout({ title: 'Status', current: 'status', body: '<h1>All good</h1>' }),
);
```

// "How to work with me" manual, rendered by apps/manual (and used by apps/ask).
import type { ManualInput } from './schema';

export const manual: ManualInput = {
    frontmatter: {
        title: 'How to work with me',
        updated: '2026-11-17',
    },
    body: `## Communication

I default to **written, async communication**. A short message with the goal, the context and the deadline lets me give you a considered answer instead of a rushed one, and it leaves a record the whole team can find later.

- **Chat** for quick questions and coordination. I reply within a few working hours.
- **Pull requests, tickets and docs** for decisions. If we decide something in a call, I write it down afterwards.
- **Calls** for anything ambiguous, sensitive or going in circles. Three messages back and forth without progress is my signal to suggest a call.
- **Email** for anything external or formal.

I try to say what I mean plainly, and I will ask clarifying questions early rather than guess at requirements.

## Working hours

I am based in **Calgary, Alberta**, on Mountain Time (\`America/Edmonton\`, UTC−7, or UTC−6 during daylight saving time). My core hours are roughly **9:00 to 17:00**, Monday to Friday, and I have worked across time zones with teams and clients in other countries, so overlapping a few hours with Eastern, Pacific or European time is no problem.

I keep a focus block for deep work most days and check messages between blocks. For production incidents I am happy to be pulled in at any time.

## Feedback

**Receiving:** direct and specific is best. "This function is hard to follow because it mixes parsing and validation" helps me far more than "this feels off". Tell me early; I would much rather change a draft than a finished feature. Feedback in code review is welcome on anything, including naming and structure.

**Giving:** I review code to share context, not to gatekeep. I label comments by weight (*blocking*, *suggestion*, *nit*), explain the reason behind each one, and point out what is done well, too. Bigger concerns about direction I raise in person or in a call, not in a long comment thread.

## How I work

- **Understand the problem first.** I like to know who the user is and what "done" looks like before I write code.
- **Small, reviewable changes.** Short-lived branches and pull requests that do one thing.
- **Tests that explain intent.** Especially around integrations, money, dates and anything an AI model touches.
- **Ship, then improve.** A dependable first version that we measure and refine beats a perfect plan that never ships.
- **Leave it better.** Documentation, a clearer error message, or one less piece of legacy code with every change.

## What I value

Clear problem statements, honest estimates, blameless post-mortems, and teammates who ask "why?". I enjoy mentoring and pairing, and I believe good communication is as much a part of engineering as good code.

## What I am working on

- **Saying yes too quickly.** I like helping, so I sometimes accept a request before checking my current commitments. Workaround: if I agree to something, it is fine to ask me "what moves to make room for this?".
- **Over-documenting.** My pull request descriptions and design notes can run long. Workaround: I put a short summary at the top, and you are welcome to stop reading there.
`,
};

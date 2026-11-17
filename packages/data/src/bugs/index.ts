// Static list of bug museum entries. Add a new entry by creating a module in
// this folder and importing it here (no glob imports, so it works in esbuild
// and Vite without plugins).
import dstSchedule from './dst-schedule';
import floatMoney from './float-money';
import llmDateAmbiguity from './llm-date-ambiguity';
import retryStorm from './retry-storm';

export const bugEntries = [
    llmDateAmbiguity,
    dstSchedule,
    floatMoney,
    retryStorm,
];

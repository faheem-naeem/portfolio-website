// Static list of bug museum entries. Add a new entry by creating a module in
// this folder and importing it here (no glob imports, so it works in esbuild
// and Vite without plugins).
import floatMoney from './float-money';
import retryStorm from './retry-storm';
import timezoneSunday from './timezone-sunday';

export const bugEntries = [timezoneSunday, retryStorm, floatMoney];

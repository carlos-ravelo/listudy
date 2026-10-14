const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = vm.createContext({ ...require('ts-fsrs') });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../../js/modules/study/progress_merge.js'), 'utf8').replace(/^import .*\n/gm, '').replace(/export \{[^}]+\};/, ''), context);
const { mergeProgress } = context;
const base = { version: 1, chapters: { a: { attempts: 5, errors: 1, coveredMoves: ['e4'], cleanMoves: ['e4'] } } };
const local = structuredClone(base);
const remote = structuredClone(base);
local.chapters.a.attempts++;
local.chapters.a.coveredMoves.push('d4');
remote.chapters.a.attempts++;
remote.chapters.a.coveredMoves.push('c4');
remote.chapters.b = { attempts: 2, errors: 0 };
const result = mergeProgress(base, local, remote);
assert.equal(result.chapters.a.attempts, 7);
assert.equal(result.chapters.a.coveredMoves.length, 3);
assert.equal(result.chapters.b.attempts, 2);
assert.equal(mergeProgress(result, result, result).chapters.a.attempts, 7);
const reset = { version: 1, resetId: 'reset', resetAt: 10, chapters: {} };
assert.equal(Object.keys(mergeProgress(base, local, reset).chapters).length, 0);
const { createEmptyCard, fsrs, Rating } = require('ts-fsrs');
const scheduler = fsrs({ learning_steps: ['1m', '10m'], relearning_steps: ['10m'], enable_fuzz: false });
const now = new Date('2026-10-14');
const initial = { card: createEmptyCard(now), history: [], successes: 0 };
const one = { card: scheduler.next(initial.card, now, Rating.Good).card, successes: 1,
    history: [{ id: 'one', at: now.toISOString(), rating: Rating.Good }] };
const after = new Date(now.getTime() + 120000);
const two = { card: scheduler.next(initial.card, after, Rating.Again).card, successes: 0,
    history: [{ id: 'two', at: after.toISOString(), rating: Rating.Again }] };
const merged = mergeProgress({ version: 1, chapters: { a: initial } },
    { version: 1, chapters: { a: one } }, { version: 1, chapters: { a: two } });
assert.equal(merged.chapters.a.history.length, 2);
assert.equal(merged.chapters.a.card.reps, 2);
assert.equal(merged.chapters.a.recovered, false);
assert.equal(merged.chapters.a.successes, 1);
console.log('Three-way progress merge, disjoint devices, resets and FSRS event replay passed');

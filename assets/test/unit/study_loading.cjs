const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

async function test() {
    let resolveResponse;
    let saved = 0;
    let refreshed = 0;
    let positionsUrl = '/game-positions';
    const response = new Promise(resolve => { resolveResponse = resolve; });
    const context = vm.createContext({ pageScope: { active: true },
        document: { querySelector: () => ({ dataset: { gamePositionsUrl: positionsUrl } }) },
        fetch: () => response,
        chapterStats: { current: true }, chapterReviewSignatures: [], smartCatalog: [],
        applyGameEvidence(stats, signatures, catalog, positions, now, authoritative) {
            assert.equal(stats.current, true, 'Late evidence uses current practice progress');
            assert.equal(positions.length, 0, 'Empty results still retire obsolete evidence');
            assert.equal(authoritative, true);
            return { changed: true };
        },
        chapter_stats_key: () => 'study_chapter_stats',
        StorageAdapter: { setItem() { saved++; } },
        studySessions: { refresh() { refreshed++; } },
        update_progress() { refreshed++; }
    });
    const source = fs.readFileSync(path.join(__dirname, '../../js/pages/study/study.js'), 'utf8');
    vm.runInContext(source.slice(source.indexOf('async function loadGamePositions('), source.indexOf('async function initializeStudyProgress()')), context);
    const positions = context.loadGamePositions();
    const refresh = context.refreshGameEvidence(positions);
    assert.equal(saved, 0, 'A pending game request does not block local practice');
    resolveResponse({ ok: true, json: async () => ({ positions: [] }) });
    await refresh;
    assert.equal(saved, 1);
    assert.equal(refreshed, 2);
    context.fetch = async () => { throw new Error('offline'); };
    await context.refreshGameEvidence(context.loadGamePositions());
    assert.equal(saved, 1, 'Network failures preserve existing progress');
    context.fetch = async () => ({ ok: false });
    await context.refreshGameEvidence(context.loadGamePositions());
    assert.equal(saved, 1, 'Failed requests do not retire evidence');
    context.pageScope.active = false;
    context.fetch = async () => ({ ok: true, json: async () => ({ positions: [] }) });
    await context.refreshGameEvidence(context.loadGamePositions());
    assert.equal(saved, 1, 'Late evidence cannot update a disposed page');
    positionsUrl = '';
    assert.equal(await context.loadGamePositions(), null);
    console.log('Game evidence loads asynchronously and preserves offline practice');
}
test().catch(error => { console.error(error); process.exitCode = 1; });

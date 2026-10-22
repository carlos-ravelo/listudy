const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
let factory;
const target = new EventTarget();
const context = vm.createContext({ CustomEvent, window: target,
    Alpine: { data(name, value) { assert.equal(name, 'studyRunStatus'); factory = value; } } });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../../js/components/study_run_status.js'), 'utf8')
    .replace(/^export /gm, ''), context);
context.registerStudyRunStatus(context.Alpine);
const smart = factory('smart'), weak = factory('weak'), failed = factory('failed');
target.addEventListener('study-run-status-updated', event => {
    for (const component of [smart, weak, failed]) component.update(event.detail);
});
assert.equal(smart.visible, false);
context.publishStudyRunStatus('smart', 'Learning a line');
assert.equal(smart.visible, true);
assert.equal(smart.message, 'Learning a line');
assert.equal(weak.visible, false);
context.publishStudyRunStatus('weak', 'Reviews · 3 remaining');
assert.equal(weak.message, 'Reviews · 3 remaining');
assert.equal(smart.message, 'Learning a line', 'Status channels do not overwrite each other');
context.publishStudyRunStatus('smart', '');
assert.equal(smart.visible, false, 'A short review chain does not acquire a generic fallback message');
context.publishStudyRunStatus('failed', 'Completed', true);
assert.equal(failed.visible, true);
context.publishStudyRunStatus('failed', '', false);
assert.equal(failed.message, '');
assert.equal(failed.visible, false);
context.publishStudyRunStatus('smart', '<img src=x onerror=alert(1)>');
assert.equal(smart.message, '<img src=x onerror=alert(1)>', 'The component leaves untrusted messages as text for x-text');
console.log('Alpine run status channels, hidden defaults, completion, empty Smart messages and plain text passed');

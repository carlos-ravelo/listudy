const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const fields = {
    min_rating: {value: '1000', checkValidity: () => true},
    max_rating: {value: '1400', checkValidity: () => true}
};
const form = {elements: {namedItem: name => fields[name]}};
const document = {cookie: '', documentElement: {lang: 'en'}, querySelectorAll: () => [], addEventListener() {}};
const context = vm.createContext({document, Intl, location: {protocol: 'https:'}, window: {addEventListener() {}}});
vm.runInContext(fs.readFileSync(require('node:path').join(__dirname, '../../js/components/puzzle_filters.js'), 'utf8'), context);
const event = {target: {closest: () => form}};
context.rememberPuzzleRating(event);
assert(document.cookie.startsWith('puzzle_rating=1000:1400;'));
assert(document.cookie.endsWith('; Secure'));
const saved = document.cookie;
fields.min_rating.value = '1500';
context.rememberPuzzleRating(event);
assert.equal(document.cookie, saved, 'Invalid draft does not replace the saved range');
fields.min_rating.value = '';
context.rememberPuzzleRating(event);
assert.equal(document.cookie, saved);
fields.min_rating.value = '0'; fields.max_rating.value = '4000';
context.rememberPuzzleRating(event);
assert(document.cookie.startsWith('puzzle_rating=0:4000;'), 'The full range can be saved again');
console.log('Puzzle rating preference saves valid ranges and preserves them during incomplete edits');

const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../../js/modules/page_scope.js'), 'utf8').replace(/^export /gm, '');
module.exports = new Function(source + '\nreturn createPageScope;')();

'use strict';
// Claude Code UserPromptSubmit uses the common JSON contract.
const { handleInput, run } = require('../src/protocol.cjs');
module.exports = { handleInput };
if (require.main === module) run();

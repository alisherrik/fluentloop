'use strict';
// Codex UserPromptSubmit uses the common JSON contract.
const { handleInput, run } = require('../src/protocol.cjs');
module.exports = { handleInput };
if (require.main === module) run();

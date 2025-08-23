const { sparqlMatchers } = require('./test-utils');

// Extend Jest with custom SPARQL matchers
expect.extend(sparqlMatchers);

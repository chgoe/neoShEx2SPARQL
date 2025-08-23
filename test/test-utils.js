const fs = require('fs');
const path = require('path');
const shex2Sparql = require('../src/neoshex2sparql/shex2sparql.js');

/**
 * Utility functions for Jest tests
 */

/**
 * Load RDF test data
 */
function loadTestData(filename) {
    return fs.readFileSync(path.join(__dirname, 'data', filename), 'utf8');
}

/**
 * Get path to test shape file
 */
function getShapePath(filename) {
    return path.join(__dirname, 'shapes', filename);
}

/**
 * Custom Jest matchers for SPARQL validation
 */
const sparqlMatchers = {
    toContain(received, pattern) {
        const pass = received.includes(pattern);
        if (pass) {
            return {
                message: () => `Expected SPARQL query not to contain triple pattern "${pattern}"`,
                pass: true,
            };
        } else {
            return {
                message: () => `Expected SPARQL query to contain triple pattern "${pattern}"`,
                pass: false,
            };
        }
    },

    toContainVariable(received, variable) {
        const pass = received.includes(variable);
        if (pass) {
            return {
                message: () => `Expected SPARQL query not to contain variable "${variable}"`,
                pass: true,
            };
        } else {
            return {
                message: () => `Expected SPARQL query to contain variable "${variable}"`,
                pass: false,
            };
        }
    },

    toContainFilter(received, filter) {
        const pass = received.includes(filter);
        if (pass) {
            return {
                message: () => `Expected SPARQL query not to contain filter "${filter}"`,
                pass: true,
            };
        } else {
            return {
                message: () => `Expected SPARQL query to contain filter "${filter}"`,
                pass: false,
            };
        }
    },

    toHaveQueryForm(received, expectedForm) {
        const upperQuery = received.toUpperCase();
        const pass = upperQuery.startsWith(expectedForm.toUpperCase());
        if (pass) {
            return {
                message: () => `Expected SPARQL query not to be of form "${expectedForm}"`,
                pass: true,
            };
        } else {
            return {
                message: () => `Expected SPARQL query to be of form "${expectedForm}", but got different form`,
                pass: false,
            };
        }
    },

    toNotContainPattern(received, pattern) {
        const pass = !received.includes(pattern);
        if (pass) {
            return {
                message: () => `Expected SPARQL query to contain pattern "${pattern}"`,
                pass: true,
            };
        } else {
            return {
                message: () => `Expected SPARQL query not to contain pattern "${pattern}"`,
                pass: false,
            };
        }
    }
};

/**
 * Generate SPARQL query from ShEx file
 */
function generateSparqlQuery(shexFile, queryForm, uri = '') {
    return shex2Sparql(shexFile, queryForm, uri);
}

/**
 * Validate variable naming conventions
 */
function validateVariableNaming(sparqlQuery) {
    const hasShapeVars = sparqlQuery.includes('?shape_');
    const hasLiteralVars = sparqlQuery.includes('?litOrObj_');
    
    return {
        hasShapeVars,
        hasLiteralVars,
    };
}

module.exports = {
    loadTestData,
    getShapePath,
    sparqlMatchers,
    generateSparqlQuery,
    validateVariableNaming
};

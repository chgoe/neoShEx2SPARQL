const { loadTestData, getShapePath, generateSparqlQuery, validateVariableNaming } = require('./test-utils');

describe('ShEx2SPARQL Basic Functionality', () => {
    let sampleData;

    beforeAll(() => {
        sampleData = loadTestData('sample-data.ttl');
    });

    describe('Simple Person Shape', () => {
        const personShapePath = getShapePath('person-simple.shex');

        test('should generate SELECT query', () => {
            const query = generateSparqlQuery(personShapePath, 'SELECT');
            
            expect(query).toHaveQueryForm('SELECT');
            expect(query).toContainVariable('?shape_Person');
        });

        test('should generate CONSTRUCT query', () => {
            const query = generateSparqlQuery(personShapePath, 'CONSTRUCT');
            
            expect(query).toHaveQueryForm('CONSTRUCT');
            expect(query).toContainVariable('?shape_Person');
        });

        test('should generate ASK query with specific URI', () => {
            const uri = 'https://example.org/john';
            const query = generateSparqlQuery(personShapePath, 'ASK', uri);
            
            expect(query).toHaveQueryForm('ASK');
            expect(query).toContain(`<${uri}>`);
        });

        test('should use correct variable naming conventions', () => {
            const query = generateSparqlQuery(personShapePath, 'SELECT');
            const naming = validateVariableNaming(query);
            
            expect(naming.hasShapeVars).toBe(true);
            expect(naming.hasLiteralVars).toBe(true);
        });
    });

    describe('Dataset Shape', () => {
        const datasetShapePath = getShapePath('dataset.shex');

        test('should generate SELECT query for datasets', () => {
            const query = generateSparqlQuery(datasetShapePath, 'SELECT');
            
            expect(query).toHaveQueryForm('SELECT');
            expect(query).toContainVariable('?shape_Dataset');
            expect(query).toContain('title');
            expect(query).toContain('description');
            expect(query).toContain('keyword');
            expect(query).toContain('issued');
            expect(query).toContain('distribution');
            expect(query).toContain('downloadURL');
            expect(query).toContain('mediaType');
        });
    });

    describe('should generate SELECT query for persons', () => {
        const personOrShapePath = getShapePath('person-with-or.shex');

        test('should handle OR constraints in simplified manner', () => {
            const query = generateSparqlQuery(personOrShapePath, 'SELECT');
            
            expect(query).toHaveQueryForm('SELECT');
            expect(query).toContainVariable('?shape_Person');
            expect(query).toContain('familyName');
            expect(query).toContain('givenName');
            expect(query).toContain('nick');
        });
    });

    describe('Error Handling', () => {
        test('should throw error for unsupported query form', () => {
            const personShapePath = getShapePath('person-simple.shex');
            
            expect(() => {
                generateSparqlQuery(personShapePath, 'INVALID_FORM');
            }).toThrow('Unsupported query form');
        });

        test('should handle missing start shape gracefully', () => {
            const emptyShapePath = getShapePath('empty-shape.shex');
            
            expect(() => {
                generateSparqlQuery(emptyShapePath, 'SELECT');
            }).not.toThrow();

            const query = generateSparqlQuery(emptyShapePath, 'SELECT');
            expect(query).toMatch(/SELECT.*WHERE\s*{\s*}\s*/s);
        });
    });

    describe('URI Substitution', () => {
        test('should substitute URI in CONSTRUCT queries', () => {
            const personShapePath = getShapePath('person-simple.shex');
            const uri = 'https://example.org/alice';
            const query = generateSparqlQuery(personShapePath, 'CONSTRUCT', uri);
            
            expect(query).toContain(`<${uri}>`);
            // check if the URI is correctly substituted in at least one triple pattern
            const re = new RegExp(String.raw`.*<${uri}>.*familyName.*\?.*\..*`, "s");
            expect(query).toMatch(re);
        });

        test('should substitute URI in ASK queries', () => {
            const personShapePath = getShapePath('person-simple.shex');
            const uri = 'https://example.org/bob';
            const query = generateSparqlQuery(personShapePath, 'ASK', uri);
            
            expect(query).toContain(`<${uri}>`);
            // check if the URI is correctly substituted in at least one triple pattern
            const re = new RegExp(String.raw`.*<${uri}>.*familyName.*\?.*\..*`, "s");
            expect(query).toMatch(re);
        });
    });

    describe('Circular Recursion', () => {
        test('should handle Person -> Person relationships without infinite loops', () => {
            const shapePath = getShapePath('circular-person.shex');
            const query = generateSparqlQuery(shapePath, 'SELECT');
            
            expect(query).toHaveQueryForm('SELECT');
            expect(query).toContainVariable('?shape_Person');
            expect(query).toContain('name');
            expect(query).toContain('friend');
        });
    });

    describe('Deep Recursion (A -> B -> C -> A)', () => {
        test('should handle multi-level circular references', () => {
            const shapePath = getShapePath('deep-recursion.shex');
            const query = generateSparqlQuery(shapePath, 'SELECT');
            
            expect(query).toHaveQueryForm('SELECT');
            expect(query).toContainVariable('?shape_A');
            expect(query).toContain('relatedTo');
        });

        test('should use correct variable naming for complex recursion', () => {
            const shapePath = getShapePath('deep-recursion.shex');
            const query = generateSparqlQuery(shapePath, 'SELECT');
            const naming = validateVariableNaming(query);
            
            expect(naming.hasShapeVars).toBe(true);
            expect(naming.hasLiteralVars).toBe(false);
        });
    });

    describe('Cardinality Constraints', () => {
        test('should ignore cardinality constraints as per limitations', () => {
            const shapePath = getShapePath('cardinality-constraints.shex');
            const query = generateSparqlQuery(shapePath, 'SELECT');
            
            expect(query).toHaveQueryForm('SELECT');
            expect(query).toContain('name');
            expect(query).toContain('age');
            expect(query).toContain('email');
            
            // Should not contain any cardinality syntax
            expect(query).toNotContainPattern('MIN');
            expect(query).toNotContainPattern('MAX');
            expect(query).toNotContainPattern('HAVING');
        });
    });
});

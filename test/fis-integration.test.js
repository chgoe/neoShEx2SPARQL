const { loadTestData, getShapePath, generateSparqlQuery } = require('./test-utils');
const fs = require('fs');
const path = require('path');
const SparqlParser = require('sparqljs').Parser;

// TODO: review this
describe('FIS (Forschungsinformationssystem) Integration Tests', () => {
    let mockFisData;
    let sparqlParser;

    beforeAll(() => {
        // Load the mock FIS RDF data for reference
        const fisDataPath = path.join(__dirname, 'data', 'mock-fis.ttl');
        mockFisData = fs.readFileSync(fisDataPath, 'utf8');
        
        // Initialize SPARQL parser for query validation
        sparqlParser = new SparqlParser();
    });

    describe('Person Shape Tests', () => {
        test('should generate and parse valid SPARQL query for person shape', () => {
            const shapePath = getShapePath('fis-person.shex');
            const query = generateSparqlQuery(shapePath, 'SELECT');
            
            // Test that the query string is generated
            expect(query).toBeDefined();
            expect(query).toHaveQueryForm('SELECT');
            expect(query).toContainVariable('?shape_Person');
            
            // Test that the query is syntactically valid SPARQL
            expect(() => {
                const parsedQuery = sparqlParser.parse(query);
                expect(parsedQuery.queryType).toBe('SELECT');
            }).not.toThrow();
            
            // Should contain the expected triple patterns for Person shape
            expect(query).toContain('<http://www.w3.org/1999/02/22-rdf-syntax-ns#type>');
            expect(query).toContain('<http://www.w3.org/2000/01/rdf-schema#label>');
            expect(query).toContain('<http://purl.obolibrary.org/obo/ARG_2000028>');
            expect(query).toContain('<http://www.w3.org/2006/vcard/ns#hasName>');
            expect(query).toContain('<http://www.w3.org/2006/vcard/ns#familyName>');
            expect(query).toContain('<http://www.w3.org/2006/vcard/ns#givenName>');
        });

        test('should generate query that selects for foaf:Person type', () => {
            const shapePath = getShapePath('fis-person.shex');
            const query = generateSparqlQuery(shapePath, 'SELECT');
            
            // Parse the query to analyze its structure
            const parsedQuery = sparqlParser.parse(query);
            
            // Should be a SELECT query
            expect(parsedQuery.queryType).toBe('SELECT');
            
            // Should contain foaf:Person URI in VALUES or WHERE clause (using full URI)
            const queryString = query.toLowerCase();
            expect(queryString).toContain('foaf/0.1/person');
        });

        test('should generate query with proper variable bindings for person properties', () => {
            const shapePath = getShapePath('fis-person.shex');
            const query = generateSparqlQuery(shapePath, 'SELECT');
            
            // Parse and validate query structure
            const parsedQuery = sparqlParser.parse(query);
            expect(parsedQuery.where).toBeDefined();
            
            // Should include variables for person shape matching
            expect(query).toContainVariable('?shape_Person');
        });

        test('should verify mock data contains expected person entities', () => {
            // Verify that our test data contains the expected person entities
            expect(mockFisData).toContain('https://tucid.tu-chemnitz.de/giim/individual/johndoe');
            expect(mockFisData).toContain('https://tucid.tu-chemnitz.de/giim/individual/janedoe');
            expect(mockFisData).toContain('foaf:Person');
            expect(mockFisData).toContain('"Doe, John"');
            expect(mockFisData).toContain('"Doe, Jane"');
        });
    });

    describe('Project Shape Tests', () => {
        test('should generate and parse valid SPARQL query for project shape', () => {
            const shapePath = getShapePath('fis-project.shex');
            const query = generateSparqlQuery(shapePath, 'SELECT');
            
            // Test that the query string is generated
            expect(query).toBeDefined();
            expect(query).toHaveQueryForm('SELECT');
            expect(query).toContainVariable('?shape_Project');
            
            // Test that the query is syntactically valid SPARQL
            expect(() => {
                const parsedQuery = sparqlParser.parse(query);
                expect(parsedQuery.queryType).toBe('SELECT');
            }).not.toThrow();
            
            // Should contain the expected triple patterns for Project shape
            expect(query).toContain('<http://www.w3.org/1999/02/22-rdf-syntax-ns#type>');
            expect(query).toContain('<http://www.w3.org/2000/01/rdf-schema#label>');
            expect(query).toContain('<http://vivoweb.org/ontology/core#dateTimeInterval>');
            expect(query).toContain('<http://vivoweb.org/ontology/core#start>');
            expect(query).toContain('<http://vivoweb.org/ontology/core#end>');
            expect(query).toContain('<http://vivoweb.org/ontology/core#dateTime>');
        });

        test('should generate query that selects for project type', () => {
            const shapePath = getShapePath('fis-project.shex');
            const query = generateSparqlQuery(shapePath, 'SELECT');
            
            // Parse the query to analyze its structure
            const parsedQuery = sparqlParser.parse(query);
            
            // Should be a SELECT query
            expect(parsedQuery.queryType).toBe('SELECT');
            
            // Should contain project type in VALUES or WHERE clause
            const queryString = query.toLowerCase();
            expect(queryString).toContain('drittmittelprojekt');
        });
    });

    describe('Integration Testing - ShExSPARQL Conversion', () => {
        test('should generate syntactically correct SPARQL for person shapes', () => {
            const shapePath = getShapePath('fis-person.shex');
            const query = generateSparqlQuery(shapePath, 'SELECT');
            
            // Should generate a non-empty query
            expect(query).toBeDefined();
            expect(query.length).toBeGreaterThan(0);
            
            // Should be parseable as valid SPARQL
            expect(() => {
                const parsedQuery = sparqlParser.parse(query);
                expect(parsedQuery.queryType).toBe('SELECT');
                expect(parsedQuery.variables).toBeDefined();
                expect(parsedQuery.where).toBeDefined();
            }).not.toThrow();
        });

        test('should generate syntactically correct SPARQL for project shapes', () => {
            const shapePath = getShapePath('fis-project.shex');
            const query = generateSparqlQuery(shapePath, 'SELECT');
            
            // Should generate a non-empty query
            expect(query).toBeDefined();
            expect(query.length).toBeGreaterThan(0);
            
            // Should be parseable as valid SPARQL
            expect(() => {
                const parsedQuery = sparqlParser.parse(query);
                expect(parsedQuery.queryType).toBe('SELECT');
                expect(parsedQuery.variables).toBeDefined();
                expect(parsedQuery.where).toBeDefined();
            }).not.toThrow();
        });

        test('should generate CONSTRUCT queries that are syntactically valid', () => {
            const personShapePath = getShapePath('fis-person.shex');
            const projectShapePath = getShapePath('fis-project.shex');
            
            expect(() => {
                const personQuery = generateSparqlQuery(personShapePath, 'CONSTRUCT');
                const parsedPersonQuery = sparqlParser.parse(personQuery);
                expect(parsedPersonQuery.queryType).toBe('CONSTRUCT');
            }).not.toThrow();
            
            expect(() => {
                const projectQuery = generateSparqlQuery(projectShapePath, 'CONSTRUCT');
                const parsedProjectQuery = sparqlParser.parse(projectQuery);
                expect(parsedProjectQuery.queryType).toBe('CONSTRUCT');
            }).not.toThrow();
        });

        test('should generate ASK queries that are syntactically valid', () => {
            const personShapePath = getShapePath('fis-person.shex');
            const projectShapePath = getShapePath('fis-project.shex');
            const testUri = 'https://example.org/test';
            
            expect(() => {
                const personQuery = generateSparqlQuery(personShapePath, 'ASK', testUri);
                const parsedPersonQuery = sparqlParser.parse(personQuery);
                expect(parsedPersonQuery.queryType).toBe('ASK');
            }).not.toThrow();
            
            expect(() => {
                const projectQuery = generateSparqlQuery(projectShapePath, 'ASK', testUri);
                const parsedProjectQuery = sparqlParser.parse(projectQuery);
                expect(parsedProjectQuery.queryType).toBe('ASK');
            }).not.toThrow();
        });

        test('should verify generated queries match expected shape semantics', () => {
            // Test person shape query semantics
            const personShapePath = getShapePath('fis-person.shex');
            const personQuery = generateSparqlQuery(personShapePath, 'SELECT');
            
            // Should reference key person-related predicates from FIS ontology
            // Note: Check for full URIs as they appear in generated queries
            expect(personQuery.toLowerCase()).toContain('rdf-syntax-ns#type');
            expect(personQuery.toLowerCase()).toContain('rdf-schema#label');
            expect(personQuery.toLowerCase()).toContain('obo/arg_2000028');
            expect(personQuery.toLowerCase()).toContain('vcard/ns#hasname');
            expect(personQuery.toLowerCase()).toContain('vcard/ns#familyname');
            expect(personQuery.toLowerCase()).toContain('vcard/ns#givenname');
            
            // Test project shape query semantics
            const projectShapePath = getShapePath('fis-project.shex');
            const projectQuery = generateSparqlQuery(projectShapePath, 'SELECT');
            
            // Should reference key project-related predicates from FIS ontology
            expect(projectQuery.toLowerCase()).toContain('rdf-syntax-ns#type');
            expect(projectQuery.toLowerCase()).toContain('rdf-schema#label');
            expect(projectQuery.toLowerCase()).toContain('vivoweb.org/ontology/core#datetimeinterval');
            expect(projectQuery.toLowerCase()).toContain('vivoweb.org/ontology/core#start');
            expect(projectQuery.toLowerCase()).toContain('vivoweb.org/ontology/core#end');
            expect(projectQuery.toLowerCase()).toContain('vivoweb.org/ontology/core#datetime');
        });
    });
});

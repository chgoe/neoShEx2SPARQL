const { loadTestData, getShapePath, generateSparqlQuery } = require('./test-utils');
const SparqlParser = require('sparqljs').Parser;

describe('ShExJ.jsg Specification Compliance', () => {
    describe('Schema Structure', () => {
        test('should handle schema with single start shape', () => {
            const shapePath = getShapePath('person-simple.shex');
            const query = generateSparqlQuery(shapePath, 'SELECT');
            
            expect(query).toHaveQueryForm('SELECT');
            expect(query).toContainVariable('?shape_Person');
        });

        test('should handle empty schema gracefully', () => {
            const shapePath = getShapePath('empty-shape.shex');
            
            expect(() => {
                generateSparqlQuery(shapePath, 'SELECT');
            }).not.toThrow();
        });
    });

    describe('Shape Expressions (shapeExpr)', () => {
        describe('ShapeOr', () => {
            test('should process ShapeOr expressions', () => {
                const shapePath = getShapePath('shape-or.shex');
                const query = generateSparqlQuery(shapePath, 'SELECT');
                
                // Should contain UNION structure for OR expressions
                expect(query).toContain('UNION');
                expect(query).toContain('name');
                expect(query).toContain('age');
                expect(query).toContain('employeeCount');

                // Verify SPARQL structure
                expect(query).toMatch(/SELECT.*WHERE\s*{\s*{.*}\s*UNION\s*{.*}\s*}\s*/s);
            });
        });

        describe('ShapeAnd', () => {
            test('should process ShapeAnd expressions', () => {
                const shapePath = getShapePath('shape-and.shex');
                const query = generateSparqlQuery(shapePath, 'SELECT');
                
                expect(query).toHaveQueryForm('SELECT');
                expect(query).toContain('<http://xmlns.com/foaf/0.1/name>');
                expect(query).toContain('<http://xmlns.com/foaf/0.1/age>');
            });
        });

        describe('ShapeNot', () => {
            test('should handle ShapeNot expressions without errors', () => {
                const shapePath = getShapePath('shape-not.shex');
                
                expect(() => {
                    generateSparqlQuery(shapePath, 'SELECT');
                }).not.toThrow();

                const query = generateSparqlQuery(shapePath, 'SELECT');

                // Should contain MINUS clause to exclude Robot patterns
                expect(query).toContain('MINUS');
                expect(query).toContain('foaf/0.1/name');
                expect(query).toContain('serialNumber');
                // Verify proper SPARQL MINUS structure
                expect(query).toMatch(/MINUS\s*\{[\s\S]*name[\s\S]*serialNumber[\s\S]*\}/);
            });
        });

        describe('NodeConstraint', () => {
            test('should process NodeConstraint with nodeKind', () => {
                const shapePath = getShapePath('node-kinds.shex');
                const query = generateSparqlQuery(shapePath, 'SELECT');
                
                expect(query).toContainFilter('FILTER(isIRI(');
                expect(query).toContainFilter('FILTER(isBlank(');
                expect(query).toContainFilter('FILTER(isLiteral(');
                expect(query).toContainFilter('FILTER(!isLiteral(');
            });

            test('should handle NodeConstraint with datatype', () => {
                const shapePath = getShapePath('person-simple.shex');
                const query = generateSparqlQuery(shapePath, 'SELECT');
                
                // Should contain datatype filters for xsd:string, xsd:integer
                expect(query).toMatch(/FILTER\(datatype\(/);
            });
        });

        describe('Shape', () => {
            test('should process basic Shape structures', () => {
                const shapePath = getShapePath('person-simple.shex');
                const query = generateSparqlQuery(shapePath, 'SELECT');
                
                expect(query).toHaveQueryForm('SELECT');
                expect(query).toContain('<http://www.w3.org/2006/vcard/ns#familyName>');
            });
        });
    });

    describe('Triple Expressions (tripleExpr)', () => {
        describe('EachOf OneOf', () => {
            test('should process EachOf expressions', () => {
                const shapePath = getShapePath('eachof-oneof.shex');
                const query = generateSparqlQuery(shapePath, 'SELECT');
                
                expect(query).toHaveQueryForm('SELECT');
                // Should contain UNION structure
                expect(query).toContain('UNION');
                // Should contain both name+email and name+phone combinations
                expect(query).toContain('name');
                expect(query).toContain('email');
                expect(query).toContain('phone');
                // Verify proper SPARQL UNION structure
                expect(query).toMatch(/\{\s*\{.*?\}\s*UNION\s*\{.*?\}\s*\}/s);
            });

            test('should handle nested EachOf OneOf constructs in WHERE clause for SELECT', () => {
                const shapePath = getShapePath('nested-eachof-oneof.shex');
                const query = generateSparqlQuery(shapePath, 'SELECT');
                
                // Verify first part: name { email phone } UNION { address }
                expect(query).toMatch(/.*name.*{.*email.*phone.*UNION.*address.*}/s);
                // Verify second part: { address } { workplace name type } UNION
                expect(query).toMatch(/.*UNION.*address.*}.*workplace.*name.*type.*UNION/s);
                // Verify second part: type } UNION
                expect(query).toMatch(/.*type.*UNION.*school.*name.*level.*}.*}/s);
            });

            test('should handle nested EachOf OneOf constructs in WHERE clause for CONSTRUCT', () => {
                const shapePath = getShapePath('nested-eachof-oneof.shex');
                const query = generateSparqlQuery(shapePath, 'CONSTRUCT');
                
                // Verify first part: name { email phone } UNION { address }
                expect(query).toMatch(/.*name.*{.*email.*phone.*UNION.*address.*}/s);
                // Verify second part: { address } { workplace name type } UNION
                expect(query).toMatch(/.*UNION.*address.*}.*workplace.*name.*type.*UNION/s);
                // Verify second part: type } UNION
                expect(query).toMatch(/.*type.*UNION.*school.*name.*level.*}.*}/s);
            });

            test('should handle nested constructs in CONSTRUCT queries correctly', () => {
                const shapePath = getShapePath('nested-eachof-oneof.shex');
                const query = generateSparqlQuery(shapePath, 'CONSTRUCT');
                
                // Verify correct CONSTRUCT structure
                expect(query).toMatch(/CONSTRUCT\s*{.*name.*email.*phone.*address.*workplace.*name.*type.*school.*name.*level.*}\sWHERE.*/s);
            });
        });

        describe('TripleConstraint', () => {
            test('should process basic TripleConstraint', () => {
                const shapePath = getShapePath('person-simple.shex');
                const query = generateSparqlQuery(shapePath, 'SELECT');
                
                expect(query).toContain('<http://www.w3.org/2006/vcard/ns#familyName>');
                expect(query).toContain('<http://www.w3.org/2006/vcard/ns#givenName>');
                expect(query).toContain('<http://xmlns.com/foaf/0.1/age>');
                expect(query).toContain('<http://xmlns.com/foaf/0.1/knows>');
            });

            test('should handle TripleConstraint with shape references', () => {
                const shapePath = getShapePath('circular-person.shex');
                const query = generateSparqlQuery(shapePath, 'SELECT');
                
                expect(query).toContain('<http://xmlns.com/foaf/0.1/friend>');
                expect(query).toContainVariable('?shape_Person');
            });

            test('should ignore cardinality in TripleConstraint for now', () => {
                const shapePath = getShapePath('cardinality-constraints.shex');
                const query = generateSparqlQuery(shapePath, 'SELECT');
                
                // Should contain the properties but ignore cardinality
                expect(query).toContain('<http://xmlns.com/foaf/0.1/name>');
                expect(query).toContain('<http://xmlns.com/foaf/0.1/age>');
                expect(query).toContain('<http://xmlns.com/foaf/0.1/email>');
                
                // Should not contain cardinality syntax
                expect(query).toNotContainPattern('{1,1}');
                expect(query).toNotContainPattern('{0,5}');
            });
        });
    });

    describe('Value Constraints', () => {
        describe('Value Sets', () => {
            test('should handle enumerated values', () => {
                const shapePath = getShapePath('value-sets.shex');
                
                expect(() => {
                    generateSparqlQuery(shapePath, 'SELECT');
                }).not.toThrow();

                const query = generateSparqlQuery(shapePath, 'SELECT');
                expect(query).toMatch(/.*VALUES.*{\s*"John" "Jane" "Bob" "Alice"\s*}.*/);
                expect(query).toMatch(/.*VALUES.*{\s*\<https:\/\/example.org\/Active\> \<https:\/\/example.org\/Inactive\>\s*}.*/);
                expect(query).toMatch(/.*VALUES.*{\s*"en" "fr" "de"\s*}.*/);
            });
        });

        describe('Datatype Constraints', () => {
            test('should generate FILTER clauses for datatypes', () => {
                const shapePath = getShapePath('person-simple.shex');
                const query = generateSparqlQuery(shapePath, 'SELECT');
                
                expect(query).toMatch(/FILTER\(datatype\(/);
            });
        });
    });

    describe('Recursion Handling', () => {
        test('should prevent infinite recursion in circular references', () => {
            const shapePath = getShapePath('circular-person.shex');
            
            expect(() => {
                generateSparqlQuery(shapePath, 'SELECT');
            }).not.toThrow();
            
            const query = generateSparqlQuery(shapePath, 'SELECT');
            expect(query).toHaveQueryForm('SELECT');
        });

        test('should handle deep recursion chains', () => {
            const shapePath = getShapePath('deep-recursion.shex');
            
            expect(() => {
                generateSparqlQuery(shapePath, 'SELECT');
            }).not.toThrow();
        });
    });

    describe('Query Validity', () => {
        test('should generate syntactically valid SPARQL', () => {
            const testShapes = [
                'person-simple.shex',
                'circular-person.shex',
                'node-kinds.shex'
            ];
            
            testShapes.forEach(shapeFile => {
                const shapePath = getShapePath(shapeFile);
                const selectQuery = generateSparqlQuery(shapePath, 'SELECT');
                const constructQuery = generateSparqlQuery(shapePath, 'CONSTRUCT');
                const askQuery = generateSparqlQuery(shapePath, 'ASK', 'https://example.org/test');
                
                // Basic SPARQL syntax validation
                expect(selectQuery).toMatch(/^SELECT\s+.*\s+WHERE\s*\{.*\}$/s);
                expect(constructQuery).toMatch(/^CONSTRUCT\s*\{.*\}\s*WHERE\s*\{.*\}$/s);
                expect(askQuery).toMatch(/^ASK\s*\{.*\}$/s);
            });
        });

        test('should maintain consistent variable naming', () => {
            const shapePath = getShapePath('person-simple.shex');
            const query = generateSparqlQuery(shapePath, 'SELECT');
            
            // Should use new naming convention
            expect(query).toMatch(/\?shape_\w+/);
            expect(query).toMatch(/\?litOrObj_\w+/);
            
            // Should not use old naming convention
            expect(query).toNotContainPattern('?var_');
        });

        test('should generate valid SPARQL query', () => {
            const shapePath = getShapePath('person-simple.shex');
            const query = generateSparqlQuery(shapePath, 'SELECT');

            const parser = new SparqlParser();
            expect(() => {
                parser.parse(query);
            }).not.toThrow();
        });
    });

    describe('Node Kind Constraints', () => {
        test('should generate appropriate FILTER clauses for node kinds', () => {
            const shapePath = getShapePath('node-kinds.shex');
            const query = generateSparqlQuery(shapePath, 'SELECT');
            
            expect(query).toHaveQueryForm('SELECT');
            expect(query).toContainVariable('?shape_Person');
            expect(query).toContain('name');
            expect(query).toContain('homepage');
            expect(query).toContain('phone');
            expect(query).toContain('description');
            expect(query).toContain('identifier');

            // Should contain appropriate FILTER clauses for node kinds
            expect(query).toContainFilter('FILTER(isIRI(');
            expect(query).toContainFilter('FILTER(isBlank(');
            expect(query).toContainFilter('FILTER(isLiteral(');
            expect(query).toContainFilter('FILTER(!isLiteral(');
        });
    });

    describe('Empty Shapes', () => {
        test('should handle empty shapes with minimal constraints', () => {
            const shapePath = getShapePath('empty-shape.shex');
            const query = generateSparqlQuery(shapePath, 'SELECT');
            
            expect(query).toHaveQueryForm('SELECT');
            expect(query).toMatch(/SELECT.*WHERE\s*\{.*\}/s);
        });
    });
});

/*
    This is a simplified ShEx2SPARQL converter.
    It is not a full ShEx2SPARQL implementation, but rather a simplified version to be used in TUCfis.
    Limitations:
    - recursion (such as in shex.shex)
    - cardinality constraints are fully ignored
    - imports are not supported
    - only one start shape is supported

 */
const parser = require("@shexjs/parser");
const fs = require("node:fs");
const crypto = require("crypto");   // use for creation of unique URIs

/**
 * Simplified ShEx2SPARQL converter using visitor pattern
 */
class SimplifiedShexToSparqlConverter {
    constructor(schema = null) {
        this.triplePatterns = [];
        this.filters = [];
        this.unionBlocks = []; // New: to store union patterns
        this.minusBlocks = []; // New: to store minus patterns for ShapeNot
        this.schema = schema;
        this.queryForm = 'SELECT';
        this.visitedShapes = new Set(); // To prevent infinite recursion
        this.currentUnionGroup = null; // Track current union processing
    }

    /**
     * Main conversion method
     */
    convert(queryForm, uri = "") {
        // Reset state
        this.triplePatterns = [];
        this.filters = [];
        this.unionBlocks = [];
        this.minusBlocks = [];
        this.visitedShapes.clear();
        this.currentUnionGroup = null;

        // Find and process start shape
        const startShape = this.findStartShape();
        if (!startShape) {
            throw new Error("No start shape found in schema");
        }

        const startVariable = this.generateShapeVariable(startShape);
        this.visitShape(startShape, startVariable);

        // Generate SPARQL query based on form
        switch (queryForm.toUpperCase()) {
            case "CONSTRUCT":
                return this.buildConstructQuery(uri, startVariable, startShape);
            case "SELECT":
                return this.buildSelectQuery();
            case "ASK":
                return this.buildAskQuery(uri, startVariable, startShape);
            default:
                throw new Error(`Unsupported query form: ${queryForm}`);
        }
    }

    /**
     * Visitor for Shape elements
     */
    visitShape(shape, subjectVar) {
        // Prevent infinite recursion
        if (this.visitedShapes.has(shape.id)) {
            return;
        }
        this.visitedShapes.add(shape.id);

        if (shape.shapeExpr) {
            this.visitShapeExpression(shape.shapeExpr, subjectVar);
        }
    }

    /**
     * Visitor for ShapeExpression elements (Shape, ShapeAnd, ShapeOr, etc.)
     */
    visitShapeExpression(shapeExpr, subjectVar) {
        if (typeof shapeExpr === 'string') {
            // Shape reference - find and visit the referenced shape
            const referencedShape = this.findShapeById(shapeExpr);
            if (referencedShape) {
                this.visitShape(referencedShape, subjectVar);
            }
            return;
        }

        switch (shapeExpr.type) {
            case 'Shape':
                if (shapeExpr.expression) {
                    this.visitTripleExpression(shapeExpr.expression, subjectVar);
                }
                break;
            case 'ShapeAnd':
                shapeExpr.shapeExprs.forEach(expr => 
                    this.visitShapeExpression(expr, subjectVar)
                );
                break;
            case 'ShapeOr':
                // For OR, we create UNION blocks
                this.handleShapeOr(shapeExpr.shapeExprs, subjectVar);
                break;
            case 'ShapeNot':
                // For NOT, we create MINUS blocks
                this.handleShapeNot(shapeExpr.shapeExpr, subjectVar);
                break;
            case 'NodeConstraint':
                this.visitNodeConstraint(shapeExpr, subjectVar);
                break;
            default:
                console.warn(`Unsupported shape expression type: ${shapeExpr.type}`);
        }
    }

    /**
     * Visitor for TripleExpression elements (TripleConstraint, EachOf, OneOf)
     */
    visitTripleExpression(tripleExpr, subjectVar) {
        switch (tripleExpr.type) {
            case 'TripleConstraint':
                this.visitTripleConstraint(tripleExpr, subjectVar);
                break;
            case 'EachOf':
                tripleExpr.expressions.forEach(expr => 
                    this.visitTripleExpression(expr, subjectVar)
                );
                break;
            case 'OneOf':
                // For OneOf, create UNION alternatives
                this.handleOneOf(tripleExpr.expressions, subjectVar);
                break;
            default:
                console.warn(`Unsupported triple expression type: ${tripleExpr.type}`);
        }
    }

    /**
     * Visitor for TripleConstraint elements
     */
    visitTripleConstraint(tripleConstraint, subjectVar) {
        const predicate = tripleConstraint.predicate;
        
        // Generate unique variable name using both predicate and subject
        const objectVar = this.generateVariable(predicate, subjectVar);

        // Create basic triple pattern
        this.triplePatterns.push(`${subjectVar} <${predicate}> ${objectVar} .`);

        // Handle value constraints
        if (tripleConstraint.valueExpr) {
            if (typeof tripleConstraint.valueExpr === 'string') {
                // Shape reference - the object variable represents the shape instance
                const referencedShape = this.findShapeById(tripleConstraint.valueExpr);
                if (!referencedShape) {
                    throw new Error("Referenced shape not found in schema!");
                }
                this.triplePatterns.pop();
                const shapeVariable = this.generateShapeVariable(referencedShape);
                this.triplePatterns.push(`${subjectVar} <${predicate}> ${shapeVariable} .`);
                if (referencedShape) {
                    this.visitShape(referencedShape, shapeVariable);
                }
            } else {
                this.visitShapeExpression(tripleConstraint.valueExpr, objectVar);
            }
        }

        // Handle cardinality (simplified - ignore min/max for now as per requirements)
        // Note: Cardinality constraints are fully ignored per requirements
    }

    /**
     * Visitor for NodeConstraint elements
     */
    visitNodeConstraint(nodeConstraint, variable) {
        if (nodeConstraint.datatype) {
            this.filters.push(`FILTER(datatype(${variable}) = <${nodeConstraint.datatype}>)`);
        }

        if (nodeConstraint.values) {
            const values = nodeConstraint.values.map(val => {
                if (typeof val === 'object' && val.type) {
                    return `"${val.value}"^^<${val.type}>`;
                } else if (typeof val === 'object') {
                    return `"${val.value}"`;
                } else {
                    return `<${val}>`;
                }
            }).join(' ');
            this.filters.push(`VALUES ${variable} { ${values} }`);
        }

        if (nodeConstraint.nodeKind) {
            switch (nodeConstraint.nodeKind) {
                case 'iri':
                    this.filters.push(`FILTER(isIRI(${variable}))`);
                    break;
                case 'bnode':
                    this.filters.push(`FILTER(isBlank(${variable}))`);
                    break;
                case 'literal':
                    this.filters.push(`FILTER(isLiteral(${variable}))`);
                    break;
                case 'nonliteral':
                    this.filters.push(`FILTER(!isLiteral(${variable}))`);
                    break;
            }
        }
    }

    /**
     * Handle ShapeOr by creating UNION blocks
     */
    handleShapeOr(shapeExprs, subjectVar) {
        // Create union blocks for each shape expression
        const unionBlocks = [];
        
        shapeExprs.forEach((expr, index) => {
            // Save current state
            const savedTriplePatterns = [...this.triplePatterns];
            const savedFilters = [...this.filters];
            
            // Reset collections to capture this union branch
            this.triplePatterns = [];
            this.filters = [];
            
            // Process this branch of the OR
            this.visitShapeExpression(expr, subjectVar);
            
            // Capture the patterns and filters for this branch
            const branchTriplePatterns = [...this.triplePatterns];
            const branchFilters = [...this.filters];
            
            // Restore previous state
            this.triplePatterns = savedTriplePatterns;
            this.filters = savedFilters;
            
            // Add this branch to union blocks
            unionBlocks.push({
                triplePatterns: branchTriplePatterns,
                filters: branchFilters
            });
        });
        
        // Store union blocks for query generation
        this.unionBlocks.push(unionBlocks);
    }

    /**
     * Handle OneOf by creating UNION blocks
     */
    handleOneOf(expressions, subjectVar) {
        // Create UNION blocks for OneOf alternatives
        const unionBlocks = [];
        
        expressions.forEach(expr => {
            // Save current state
            const savedTriplePatterns = [...this.triplePatterns];
            const savedFilters = [...this.filters];
            
            // Clear current state for this union branch
            this.triplePatterns = [];
            this.filters = [];
            
            // Process this alternative
            this.visitTripleExpression(expr, subjectVar);
            
            // Create union block with this alternative
            unionBlocks.push({
                triplePatterns: [...this.triplePatterns],
                filters: [...this.filters]
            });
            
            // Restore previous state
            this.triplePatterns = savedTriplePatterns;
            this.filters = savedFilters;
        });
        
        // Store union blocks for query generation
        this.unionBlocks.push(unionBlocks);
    }

    /**
     * Handle ShapeNot by creating MINUS blocks
     */
    handleShapeNot(shapeExpr, subjectVar) {
        // Save current state
        const savedTriplePatterns = [...this.triplePatterns];
        const savedFilters = [...this.filters];
        
        // Clear current state for the minus block
        this.triplePatterns = [];
        this.filters = [];
        
        // Process the shape expression that should be excluded
        this.visitShapeExpression(shapeExpr, subjectVar);
        
        // Create minus block with the excluded patterns
        this.minusBlocks.push({
            triplePatterns: [...this.triplePatterns],
            filters: [...this.filters]
        });
        
        // Restore previous state
        this.triplePatterns = savedTriplePatterns;
        this.filters = savedFilters;
    }

    /**
     * Helper methods
     */
    findStartShape() {
        if (!this.schema.start) {
            return null;
        }
        return this.schema.shapes.find(shape => shape.id === this.schema.start);
    }

    findShapeById(shapeId) {
        return this.schema.shapes.find(shape => shape.id === shapeId);
    }

    generateVariable(predicate, subject) {
        // Create a unique variable name from both predicate and subject
        const input = `${predicate}_${subject}`;
        const hash = crypto.randomUUID();
        return `?litOrObj_${hash}`;
    }

    generateShapeVariable(shape) {
        // Generate variable name for shapes
        if (typeof shape === 'string') {
            // Shape reference by ID
            const shapeName = shape.split("#")[1] ? shape.split("#")[1] : shape.split("/").pop();
            return `?shape_${shapeName}`;
        } else if (shape.id) {
            // Named shape with ID
            const shapeName = shape.id.split("#")[1] ? shape.id.split("#")[1] : shape.id.split("/").pop();
            return `?shape_${shapeName}`;
        } else {
            // Anonymous shape - use generated ID
            const hash = crypto.createHash('md5').update(JSON.stringify(shape)).digest('hex').substring(0, 8);
            return `?shape_${hash}`;
        }
    }

    /**
     * Helper method to collect all unique triple patterns from main patterns and unions
     * Note: MINUS blocks are excluded from CONSTRUCT as they represent patterns to exclude
     */
    getAllTriplePatterns() {
        const allPatterns = new Set();
        
        // Add main triple patterns
        this.triplePatterns.forEach(pattern => allPatterns.add(pattern));
        
        // Add patterns from union blocks
        this.unionBlocks.forEach(unionGroup => {
            unionGroup.forEach(branch => {
                branch.triplePatterns.forEach(pattern => allPatterns.add(pattern));
            });
        });
        
        // Note: We do NOT include minus patterns in CONSTRUCT since they represent
        // patterns that should be excluded, not constructed
        
        return Array.from(allPatterns);
    }

    /**
     * SPARQL query builders
     */
    buildConstructQuery(uri, startVariable, startShape) {
        // Get all unique triple patterns for CONSTRUCT clause
        const allTriplePatterns = this.getAllTriplePatterns();
        let constructClause = allTriplePatterns.join('\n  ');
        
        if (this.unionBlocks.length > 0 || this.minusBlocks.length > 0) {
            // Handle CONSTRUCT with UNION and/or MINUS blocks
            let whereClause = this.buildQueryWithUnions('').replace(/^.*WHERE\s*\{/, '').replace(/\}$/, '').trim();

            if (uri) {
                const replacement = `<${uri}>`;
                constructClause = constructClause.replace(new RegExp(startVariable.replace('?', '\\?'), 'g'), replacement);
                whereClause = whereClause.replace(new RegExp(startVariable.replace('?', '\\?'), 'g'), replacement);
            }

            return `CONSTRUCT {\n  ${constructClause}\n}\nWHERE {\n  ${whereClause}\n}`;
        } else {
            // Simple CONSTRUCT without unions
            let whereClause = this.triplePatterns.concat(this.filters).join('\n  ');

            if (uri) {
                const replacement = `<${uri}>`;
                constructClause = constructClause.replace(new RegExp(startVariable.replace('?', '\\?'), 'g'), replacement);
                whereClause = whereClause.replace(new RegExp(startVariable.replace('?', '\\?'), 'g'), replacement);
            }

            return `CONSTRUCT {\n  ${constructClause}\n}\nWHERE {\n  ${whereClause}\n}`;
        }
    }

    buildQueryWithUnions(queryType) {
        let whereClause = '';
        
        // Add any non-union triple patterns first
        if (this.triplePatterns.length > 0) {
            whereClause += this.triplePatterns.join('\n  ') + '\n  ';
        }
        
        // Process union blocks
        if (this.unionBlocks.length > 0) {
            const unionGroups = this.unionBlocks.map(unionGroup => {
                const branches = unionGroup.map(branch => {
                    const branchPatterns = branch.triplePatterns.concat(branch.filters);
                    return `{\n    ${branchPatterns.join('\n    ')}\n  }`;
                });
                return branches.join(' UNION ');
            });
            
            whereClause += unionGroups.join('\n  ');
        }
        
        // Add any non-union filters
        if (this.filters.length > 0) {
            whereClause += '\n  ' + this.filters.join('\n  ');
        }
        
        // Process minus blocks
        if (this.minusBlocks.length > 0) {
            const minusGroups = this.minusBlocks.map(minusBlock => {
                const minusPatterns = minusBlock.triplePatterns.concat(minusBlock.filters);
                return `MINUS {\n    ${minusPatterns.join('\n    ')}\n  }`;
            });
            
            whereClause += '\n  ' + minusGroups.join('\n  ');
        }
        
        return `${queryType} * WHERE {\n  ${whereClause.trim()}\n}`;
    }

    buildSelectQuery() {
        if (this.unionBlocks.length > 0 || this.minusBlocks.length > 0) {
            // Generate query with UNION and/or MINUS blocks
            return this.buildQueryWithUnions('SELECT');
        } else {
            // Simple query without unions or minus
            const whereClause = this.triplePatterns.concat(this.filters).join('\n  ');
            return `SELECT * WHERE {\n  ${whereClause}\n}`;
        }
    }

    buildAskQuery(uri, startVariable, startShape) {
        if (this.unionBlocks.length > 0 || this.minusBlocks.length > 0) {
            // Handle ASK with UNION and/or MINUS blocks
            let whereClause = this.buildQueryWithUnions('').replace(/SELECT \* WHERE \{|\}$/g, '').trim();

            if (uri) {
                const replacement = `<${uri}>`;
                whereClause = whereClause.replace(new RegExp(startVariable.replace('?', '\\?'), 'g'), replacement);
            }

            return `ASK {\n  ${whereClause}\n}`;
        } else {
            // Simple ASK without unions
            let whereClause = this.triplePatterns.concat(this.filters).join('\n  ');

            if (uri) {
                const replacement = `<${uri}>`;
                whereClause = whereClause.replace(new RegExp(startVariable.replace('?', '\\?'), 'g'), replacement);
            }

            return `ASK {\n  ${whereClause}\n}`;
        }
    }
}

function shex2Sparql(shexFilepath, queryForm, uri="") {
    const shexFile = fs.readFileSync(shexFilepath, "utf8");
    const schema = parser.construct().parse(shexFile);
    const converter = new SimplifiedShexToSparqlConverter(schema);

    return converter.convert(queryForm, uri);
}

module.exports = shex2Sparql;

/*

    Limitations:
    - recursion (such as in shex.shex)
    - cardinality

 */
const parser = require("@shexjs/parser");
const fs = require("node:fs");
const crypto = require("crypto");
const block2sparql = require("./block2sparql.js")


function isBlockInitialized(block) {
    let emptyBlock = {
        "pre": undefined,
        "post": undefined,
        "blocks": [],
        "statements": []
    };
    return (typeof block !== "undefined") && JSON.stringify(block) !== JSON.stringify(emptyBlock);
}

function isNonEmptyStatements(statements) {
    return Array.isArray(statements) && statements.length > 0;
}

function getStartShape(schema) {
    let startShape;
    schema.shapes.forEach(shape => {
        if (shape.id === schema.start) {
            startShape = shape;
        }
    });
    return startShape;
}


class SPARQLBuilder {
    constructor(schema) {
        this.schema = schema;
    }

    buildSparqlConstruct(uri) {
        const rootBlock = this._buildSparql();
        if (typeof rootBlock === "undefined")
            return;

        const startShape = getStartShape(this.schema);
        return block2sparql.block2SparqlConstruct(rootBlock, startShape, uri);
    }

    buildSparqlSelect() {
        const rootBlock = this._buildSparql();
        if (typeof rootBlock === "undefined")
            return;
        return block2sparql.block2SparqlSelect(rootBlock);
    }

    buildSparqlAsk(uri) {
        let query, rootBlock;
        rootBlock = this._buildSparql();
        if (typeof rootBlock === "undefined")
            return;

        const startShape = getStartShape(this.schema);
        query = block2sparql.block2SparqlAsk(rootBlock, startShape, uri);
        return query;
    }

    _buildSparql() {
        let rootBlock = this._visitSchema(this.schema);

        if (typeof rootBlock === "undefined") {
            console.error("Could not generate SPARQL query: " +
                "either start shape is not specified or start shape declaration is missing!"
            );
            return;
        }

        rootBlock = this._postProcess(rootBlock);
        return rootBlock;
    }

    _postProcess(rootBlock) {
        rootBlock = this._removeUnionFromFirstBlocks(rootBlock);
        rootBlock = this._bubbleFiltersUp(rootBlock);
        return rootBlock;
    }

    _bubbleFiltersUp(rootBlock) {
        let blocksToRemove = []
        rootBlock.blocks.forEach((block) => {
            if (block.blocks.length < 1 && block.statements.length > 0) {
                let isAllFilters = true;
                block.statements.forEach((statement) => {
                    if (!statement.startsWith("FILTER"))
                        isAllFilters = false;
                });
                if (isAllFilters) {
                    rootBlock.statements = rootBlock.statements.concat(block.statements);
                    blocksToRemove.push(block);
                }
            } else {
                this._bubbleFiltersUp(block);
            }
        });
        blocksToRemove.forEach((block, index) => {
            rootBlock.blocks.splice(index, 1);
        });
        return rootBlock;
    }

    _removeUnionFromFirstBlocks(rootBlock) {
        let index = 0;
        rootBlock.blocks.forEach((block) => {
            if (index < 1 &&
                typeof block.pre !== "undefined" &&
                block.pre.includes("UNION")) {
                block.pre = block.pre.replace("UNION", "");
            }
            this._removeUnionFromFirstBlocks(block);
            index++;
        });
        return rootBlock;
    }

    _visitTripleConstraint(expression, subject) {
        let currentBlock = undefined;
        let currentStatements = [];

        // if this has an ID, then it is a reference to a shape and makes things more complicated...
        let isBlock = false;
        if (expression.min === 0 ||
            expression.max === 0 ||
            typeof expression.valueExpr !== "undefined") {
            currentBlock = {
                "pre": undefined,
                "post": undefined,
                "blocks": [],
                "statements": []
            }
            if (expression.min === 0) {
                currentBlock.pre = "OPTIONAL";
                isBlock = true;
            } else if (expression.max === 0) {
                currentBlock.pre = "NOT EXISTS";
                isBlock = true;
            }
        }

        // shapeExprRef
        if (typeof expression.valueExpr === "string") {
            const obj = crypto.createHash("md5").update(expression.valueExpr).digest("hex");
            currentStatements.push(`?${subject} <${expression.predicate}> ?${obj} .`);

            let [newBlock, newStatements] = this._visitShape(expression.valueExpr, obj);

            if (isBlockInitialized(newBlock)) {
                currentBlock.blocks.push(newBlock);
            }
            if (isNonEmptyStatements(newStatements)) {
                currentBlock.statements = newStatements;
            }
            currentBlock.statements = currentBlock.statements.concat(currentStatements);
            currentStatements = [];
        // valueExpr only states cardinality, or mere existence of a triple structure
        } else if (typeof expression.valueExpr === "undefined") {
            const encodedNode = crypto.createHash("md5").update(crypto.randomUUID()).digest("hex");
            currentStatements.push(`?${subject} <${expression.predicate}> ?${encodedNode} .`);
        // Shape, ShapeAnd, ShapeOr, ShapeNot
        } else if (typeof expression.valueExpr.shapeExprs !== "undefined" ||
            expression.valueExpr.type === "Shape") {
            const encodedNode = crypto.createHash("md5").update(crypto.randomUUID()).digest("hex");

            // as this is a valueExpr, its shexExprs describe the object (encodedNode) rather than the subject
            let [newBlock, newStatements] = this._visitShapeExpr(expression.valueExpr, encodedNode);
            if (isBlockInitialized(newBlock)) {
                currentBlock.blocks.push(newBlock);
            }
            if (isNonEmptyStatements(newStatements)) {
                currentBlock.statements = currentBlock.statements.concat(newStatements);
            }
            currentBlock.statements.push(`?${subject} <${expression.predicate}> ?${encodedNode} .`);
        // NodeConstraint
        } else if (expression.valueExpr.type === "NodeConstraint") {
            currentStatements = currentStatements.concat(this._visitNodeConstraint(expression.valueExpr, subject, expression.predicate));
        }

        // this is necessary, as otherwise the statements of the triple constraint that are
        // optional or required would be mislocated outside of the OPTIONAL / NOT EXISTS block
        if (isBlock) {
            currentBlock.statements = currentBlock.statements.concat(currentStatements);
            currentStatements = [];
        }

        return [currentBlock, currentStatements];
    }

    _visitNodeConstraint(constraint, subject, predicate) {
        let statements = [];
        let encodedNode;
        if (typeof predicate !== "undefined") {
            // triples with the same subject and predicate, but different objects may occur
            // => use unique name for object node (encodedNode), contrary to TripleConstraints!!
            encodedNode = crypto.createHash("md5").update(crypto.randomUUID()).digest("hex");
            statements.push(`?${subject} <${predicate}> ?${encodedNode} .`);
        } else {
            encodedNode = subject
        }

        if (constraint.datatype) {
            statements.push(`FILTER(datatype(?${encodedNode}) = <${constraint.datatype}>)`);
        } else if (constraint.values) {
            console.assert(
                typeof encodedNode !== "undefined",
                `Object of triple constraint is undefined!\n${constraint}`
            );
            // builds: VALUES ?encodedNode { val1 val2 ... }
            let filters = [];
            let values = constraint.values.map((val) => {
                if (typeof val === "object") {
                    if (val.type === "Language") {
                        filters.push(`FILTER(LANG(?${encodedNode})="${val.languageTag}")`)
                        return "";
                    } else if (val.type == "IriStem") {
                        filters.push(`FILTER(STRSTARTS(STR(?${encodedNode}), "${val.stem}"))`)
                        return "";
                    } else if (val.type == "IriStemRange") {
                        let exclusions = [];
                        val.exclusions.forEach((exclusion) => {
                            exclusions.push(`(!STRSTARTS(STR(?${encodedNode}), "${exclusion}"))`)
                        });
                        if (exclusions.length > 1) {
                            exclusions = exclusions.join(" && ");
                        } else {
                            exclusions = exclusions[0];
                        }
                        if (typeof val.stem === "object") {
                            filters.push(`FILTER(REGEX(STR(?${encodedNode}), ".*") && ${exclusions})`)
                        } else {
                            filters.push(`FILTER(STRSTARTS(STR(?${encodedNode}), "${val.stem}") && ${exclusions})`)
                        }
                        return "";
                    }
                    return `"${val.value}"^^<${val.type}>`
                } else {
                    return `<${val}>`
                }
            });
            if (filters.length > 1) {
                filters = `FILTER(${filters.join(" || ").replaceAll("FILTER", "")})`;
                statements.push(filters);
            } else if (filters.length > 0) {
                statements.push(filters[0]);
            }
            values = values.filter((el) => { if (el !== "") return el; })
            values = values.join(" ");
            if (values !== "") {
                statements.push(`VALUES ?${encodedNode} { ${values} }`);
            }
        } else if (constraint.nodeKind) {
            switch (constraint.nodeKind) {
                case "iri":
                    statements.push(`FILTER(isIRI(?${encodedNode}))`);
                    break;
                case "bnode":
                    statements.push(`FILTER(isBlank(?${encodedNode}))`);
                    break;
                case "nonliteral":
                    statements.push(`FILTER(!isLiteral(?${encodedNode}))`);
                    break;
                case "literal":
                    statements.push(`FILTER(isLiteral(?${encodedNode}))`);
                    break;
                default:
                    break;
            }
        }
        return statements;
    }

    _visitExpression(expression, subject) {
        let newBlock, newStatements;
        let currentStatements;
        let currentBlock = {
            "pre": undefined,
            "post": undefined,
            "blocks": [],
            "statements": []
        };

        // can be:
        // EachOf | OneOf | TripleConstraint | tripleExprRef
        if (expression.type === "TripleConstraint") {
            [currentBlock, currentStatements] = this._visitTripleConstraint(expression, subject)
        } else if (expression.type === "EachOf") {	// NOT OPTIONAL
            expression.expressions.forEach(expr => {
                [newBlock, newStatements] = this._visitExpression(expr, subject)
                if (isNonEmptyStatements(newStatements)) {
                    currentBlock.statements = currentBlock.statements.concat(newStatements);
                }
                if (isBlockInitialized(newBlock)) {
                    currentBlock.blocks.push(newBlock);
                }
            });
            if (typeof expression.min !== "undefined" && expression.min < 1) {
                currentBlock.pre = "OPTIONAL";
            }
        } else if (expression.type === "OneOf") {	// OPTIONAL
            expression.expressions.forEach((expr) => {
                [newBlock, newStatements] = this._visitExpression(expr, subject);
                if (isNonEmptyStatements(newStatements)) {
                    currentBlock.blocks.push({
                        "pre": "UNION",
                        "post": undefined,
                        "blocks": [],
                        "statements": newStatements
                    });
                }
                if (isBlockInitialized(newBlock)) {
                    newBlock.pre = "UNION";
                    currentBlock.blocks.push(newBlock);
                }
            });
        } else {
            console.error("Unknown type, aborting.");
        }
        return [currentBlock, currentStatements];
    }

    _visitShape(shape, subject="") {
        // in case of shape references, look them up in the schema first
        if (typeof shape === "string") {
            this.schema.shapes.forEach((_shape) => {
                if (_shape.id === shape) {
                    shape = _shape;
                }
            });
        }

        // if mapping was unsuccessful to a shape, then we are dealing with a reference to a
        // shape that is not included in the schema (NOTE: imports are currently not supported!)
        if (typeof shape === "string") {
            let currentBlock = {
                "pre": undefined,
                "post": undefined,
                "blocks": [],
                "statements": []
            };
            return [currentBlock, []];
        }

        if (subject === "") {
            //console.log("visited", shape)
            subject = crypto.createHash("md5").update(shape.id).digest("hex");
        }
        let [currentBlock, currentStatements] = this._visitShapeExpr(shape.shapeExpr, subject);

        return [currentBlock, currentStatements];
    }

    _visitShapeExpr(shapeExpr, subject) {
        let newBlock, newStatements;
        let currentStatements = [];
        let currentBlock = {
            "pre": undefined,
            "post": undefined,
            "blocks": [],
            "statements": []
        };

        // can be:
        // ShapeOr | ShapeAnd | ShapeNot | NodeConstraint | Shape | ShapeExternal | shapeExprRef ;
        let shapeType;
        if (typeof shapeExpr === "string") {
            shapeType = "shapeExprRef";
        } else {
            shapeType = shapeExpr.type;
        }

        //console.log("Type: ", shapeType);
        switch (shapeType) {
            case "Shape":
                if (typeof shapeExpr.expression !== "undefined") {
                    [newBlock, newStatements] = this._visitExpression(shapeExpr.expression, subject);
                    if (isBlockInitialized(newBlock)) {
                        currentBlock.blocks.push(newBlock);
                    }
                    if (newStatements) {
                        currentBlock.statements = currentBlock.statements.concat(newStatements);
                    }
                }
                break;
            case "ShapeOr":
                let filters = [];
                shapeExpr.shapeExprs.forEach((sExpr, index) => {
                    [newBlock, newStatements] = this._visitShapeExpr(sExpr, subject);
                    if (isBlockInitialized(newBlock)) {
                        newBlock.pre = (index < 1) ? undefined : "UNION";
                        currentBlock.blocks.push(newBlock);
                    }
                    if (Array.isArray(newStatements)) {
                        // in the case of ShapeOr, newStatements will only be created for NodeConstraints
                        // consequently, it will either contain exactly 1 statement or none at all
                        // Examples:
                        //  1) <someShape> [ ex:Bla1 ex:Bla2 ]         => translate to VALUES ?... { ex:Bla1 ex:Bla2 }
                        //  2) <someShape> xsd:integer OR xsd:decimal  => translate to FILTER(...)
                        newStatements.forEach((statement) => {
                            if (statement.startsWith("FILTER")) {
                                filters.push(statement);
                            } else {
                                currentBlock.blocks.push({
                                    "pre": (index < 1) ? undefined : "UNION",
                                    "post": undefined,
                                    "blocks": [],
                                    "statements": [statement]
                                });
                            }
                        });
                    }
                });
                if (filters.length > 0) {
                    const orFilter = `FILTER(${filters.join(" || ").replaceAll("FILTER", "")})`;
                    currentBlock.statements.push(orFilter);
                }
                break;
            case "ShapeAnd":
                shapeExpr.shapeExprs.forEach(sExpr => {
                    [newBlock, newStatements] = this._visitShapeExpr(sExpr, subject);
                    if (isBlockInitialized(newBlock)) {
                        currentBlock.blocks.push(newBlock);
                    }
                    if (isNonEmptyStatements(newStatements)) {
                        currentBlock.statements = currentBlock.statements.concat(newStatements);
                    }
                });
                break;
            case "ShapeNot":
                // ShapeNot should always only contain one shapeExpr rather than shapeExprs
                if (typeof shapeExpr.shapeExprs === "undefined") {
                    shapeExpr.shapeExprs = [shapeExpr.shapeExpr];
                }
                shapeExpr.shapeExprs.forEach(sExpr => {
                    currentBlock.pre = "MINUS";
                    [newBlock, newStatements] = this._visitShapeExpr(sExpr, subject);
                    if (isBlockInitialized(newBlock)) {
                        currentBlock.blocks.push(newBlock);
                    }
                    if (isNonEmptyStatements(newStatements)) {
                        currentBlock.statements = currentBlock.statements.concat(newStatements);
                    }
                });
                break;
            case "NodeConstraint":
                currentStatements = this._visitNodeConstraint(shapeExpr, subject);
                break;
            case "ShapeExternal":
                // not considering imports at the moment!
                console.error("Found ShapeExternal - imports are currently not supported!");
                break;
            case "shapeExprRef":
                [newBlock, newStatements] = this._visitShape(shapeExpr);
                currentBlock.blocks.push(newBlock);
                if (isNonEmptyStatements(newStatements)) {
                    currentBlock.statements = newStatements;
                }
                break;
            default:
                console.error("Something went wrong - an unexpected case occurred!");
                break;
        }
        return [currentBlock, currentStatements];
    }

    _visitSchema(schema) {
        let rootBlock, rootStatements;
        if (typeof schema.start !== "string") {
            console.error("Invalid start shape(s). shex2sparql can only handle one start shape.");
            return;
        }
        schema.shapes.forEach(shape => {
            if (shape.id === schema.start) {
                [rootBlock, rootStatements] = this._visitShape(shape);
                if (isNonEmptyStatements(rootStatements)) {
                    rootBlock.statements = rootBlock.statements.concat(rootStatements);
                }
            }
        });
        return rootBlock;
    }
}

function shex2Sparql(shexFilepath, queryForm, uri="") {
    const shexFile = fs.readFileSync(shexFilepath, "utf8");
    const schema = parser.construct().parse(shexFile);
    const builder = new SPARQLBuilder(schema);

    let query;
    switch (queryForm) {
        case "CONSTRUCT":
            query = builder.buildSparqlConstruct(uri);
            break;
        case "SELECT":
            query = builder.buildSparqlSelect();
            break;
        case "ASK":
            query = builder.buildSparqlAsk(uri);
            break;
        default:
            console.log("Query form not recognized, " +
                "please specify one of the following SPARQL query forms: CONSTRUCT, SELECT, ASK");
            break;
    }
    return query;
}

module.exports = shex2Sparql;

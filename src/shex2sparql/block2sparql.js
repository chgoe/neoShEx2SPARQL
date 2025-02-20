const crypto = require("crypto");

function rootToWhereClause(rootBlock, queryWhere) {
    if (rootBlock.pre)
        queryWhere += ` ${rootBlock.pre} {\n`;
    else
        queryWhere += "{\n";

    rootBlock.statements.forEach((statement) => {
        queryWhere += `${statement}\n`;
    });

    rootBlock.blocks.forEach((block) => {
        queryWhere = rootToWhereClause(block, queryWhere);
    });

    queryWhere += "\n}";

    if (rootBlock.post)
        queryWhere += rootBlock.post;

    return queryWhere;
}


function extractConstructTriples(rootBlock, constructStatements) {
    rootBlock.statements.forEach((statement) => {
        if (!statement.startsWith("FILTER") && !statement.startsWith("VALUES")) {
            constructStatements.add(statement);
        }
    });
    rootBlock.blocks.forEach((block) => {
        constructStatements = extractConstructTriples(block, constructStatements);
    });
    return constructStatements;
}


function replaceStartShapeWithUri(queryWhere, startShape, uri) {
    const encodedStartShape = crypto.createHash("md5").update(startShape.id).digest("hex");
    return queryWhere.replaceAll(`?${encodedStartShape}`, uri);
}


function block2SparqlConstruct(rootBlock, startShape, uri="") {
    const constructTriples = extractConstructTriples(rootBlock, new Set());

    let queryConstruct = Array.from(constructTriples).join("\n");
    let queryWhere = rootToWhereClause(rootBlock, "");

    if (uri !== "") {
        queryConstruct = replaceStartShapeWithUri(queryConstruct, startShape, `<${uri}>`);
        queryWhere = replaceStartShapeWithUri(queryWhere, startShape, `<${uri}>`);
    }

    return `CONSTRUCT {\n${queryConstruct}\n} WHERE {\n${queryWhere}\n}`;
}


function block2SparqlSelect(rootBlock) {
    const queryWhere = rootToWhereClause(rootBlock, "");

    return `SELECT * WHERE {\n${queryWhere}\n}`;
}


function block2SparqlAsk(rootBlock, startShape, uri) {
    let queryWhere = rootToWhereClause(rootBlock, "");
    queryWhere = replaceStartShapeWithUri(queryWhere, startShape, `<${uri}>`);

    return `ASK {\n${queryWhere}\n}`;
}

module.exports = {
    block2SparqlSelect,
    block2SparqlConstruct,
    block2SparqlAsk
};

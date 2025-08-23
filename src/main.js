const neoshex2sparql = require("./neoshex2sparql/shex2sparql.js")
const shex2sparql = require("./shex2sparql/shex2sparql.js")


// construct a SPARQL CONSTRUCT query for any instance data of a shape
let query = shex2sparql("test/shapes/eachof-oneof.shex", "CONSTRUCT");
console.log(query)
query = neoshex2sparql("test/shapes/eachof-oneof.shex", "CONSTRUCT");
console.log(query)

// OR: construct a SPARQL CONSTRUCT query for instance data of a shape with a certain URI
//const query = shex2sparql("examples/person.shex", "CONSTRUCT", "https://example.org/John_Doe");

// OR: construct a SPARQL ASK query to verify whether instance data of a shape with a certain URI exists
//const query = shex2sparql("examples/person.shex", "ASK", "https://example.org/John_Doe");

// OR: construct a SPARQL SELECT query to select instance data of a shape with a certain URI
//const query = shex2sparql("examples/person.shex", "SELECT");

console.log(query);

# ShEx2SPARQL

Generate SPARQL queries from Shape Expressions (ShEx).

## Getting Started
ShEx2SPARQL can create SPARQL CONSTRUCT, ASK and SELECT queries from a given ShEx (.shex) schema.

### Prerequisites
- Node.js (tested with Node.js v22)
- npm

## Usage
src/main.js shows how to use ShEx2SPARQL, it uses the example ShEx file located in examples/person.shex to construct a SPARQL query.
You may test it yourself by cloning the repo and running: `npm install` & `npm run start`

## Limitations

- The schema must specify a start shape.
- The schema must not include cyclic references, due to the limited recursion support of SPARQL.
- Imports within schemas is currently not implemented.
- Support for cardinality constraints is limited, only optionality (min=0) and exclusion (max=0) are supported.

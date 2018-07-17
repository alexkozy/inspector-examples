const inspector = require('inspector');
const util = require('util');

const session = new inspector.Session();
session.connect();

const sessionPost = util.promisify(session.post.bind(session));

// Full protocol definition:
// https://chromedevtools.github.io/devtools-protocol/v8/
const protocol = new Proxy({}, {
  get: (_, domain) => new Proxy({}, {
    get: (_, method) => params => sessionPost(`${domain}.${method}`, params || {})
  })
});

const c = 3;
module.exports = {
  test: function () {
    var a = 1;
    let b = 2;
    return a + b + c;
  }
};

(async function main() {
  // Runtime.evaluate runs expression in global context so to get variable
  // from module this variable should be stored to global object or exported
  // from module.
  const {result: {objectId}} = await protocol.Runtime.evaluate({
    expression: `require('./functions.js').test`,
    // this flag is important, in Node.js environment it injects 'require'
    // method in addition to different command line APIs.
    includeCommandLineAPI: true
  });
  const {internalProperties} = await protocol.Runtime.getProperties({
    objectId, ownProperties: true
  });
  // console.log(internalProperties);
  const {value: {value: location}} = internalProperties.find(prop =>
      prop.name === '[[FunctionLocation]]');
  // returns scriptId, lineNumber and columnNumber
  console.log(location);

  const {value: {objectId: scopesObjectId}} = internalProperties.find(prop =>
      prop.name === '[[Scopes]]');
  // each scope returned as remote object
  const {result: scopes} = await protocol.Runtime.getProperties({
    objectId: scopesObjectId
  });
  // so we need to call getProperties ones again
  const unwrappedScopes = await Promise.all(scopes.map(async scope => {
    const {result: variables} = await protocol.Runtime.getProperties({
      objectId: scope.value.objectId
    });
    return {variables, description: scope.value.description};
  }));
  for (const scope of unwrappedScopes) {
    console.log(`--- Scope ${scope.description}`);
    for (const variable of scope.variables) {
      console.log(`${variable.name} = ${variable.value ? variable.value.description : 'getter...'}`);
    }
    console.log('---');
  }
})()

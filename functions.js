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
    return a + b + c + this.d;
  }
};

(async function main() {
  // Runtime.evaluate runs expression in global context so to get variable
  // from module this variable should be stored to global object or exported
  // from module.
  const {result: {objectId}} = await protocol.Runtime.evaluate({
    expression: `require('./functions.js').test.bind({d:1}, 1)`,
    // this flag is important, in Node.js environment it injects 'require'
    // method in addition to different command line APIs.
    includeCommandLineAPI: true
  });
  // dump bound arguments and bound this remote objects.
  console.log(await boundProperties(objectId));

  const targetFunctionId = await targetFunction(objectId);
  const {internalProperties} = await protocol.Runtime.getProperties({
    objectId: targetFunctionId, ownProperties: true
  });
  console.log(internalProperties);
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
  // console.log(internalProperties);
})()

async function targetFunction(functionObjectId) {
  while (true) {
    const {internalProperties} = await protocol.Runtime.getProperties({
      objectId: functionObjectId,
      ownProperties: true
    });
    const targetFunction = internalProperties.find(prop => prop.name === '[[TargetFunction]]');
    if (!targetFunction)
      break;
    functionObjectId = targetFunction.value.objectId;
  }
  return functionObjectId;
}

async function boundProperties(functionObjectId) {
  const {internalProperties} = await protocol.Runtime.getProperties({
    objectId: functionObjectId,
    ownProperties: true
  });
  const boundThis = internalProperties.find(p => p.name === '[[BoundThis]]');
  const boundArgs = internalProperties.find(p => p.name === '[[BoundArgs]]');
  return {
    boundThis: boundThis ? boundThis.value : undefined,
    boundArgs: boundArgs ? boundArgs.value : undefined
  }
}
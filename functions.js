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

(async function main() {
console.log(await protocol.Runtime.evaluate({expression: 'test'}));
})()

function test() {}
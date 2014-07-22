var chai = require('chai')
  , path = require('path');

global.expect = chai.expect;
global.$require = require('proxyquire');

var local = {
  require: require('prefixed-require')(path.resolve(__dirname, '../../../lib'))
}
global.local = local;

var chai = require('chai');

global.$require = require('proxyquire');
global.expect = chai.expect;

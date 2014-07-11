/* global describe, it, expect */

var sd = require('..');

describe('sd-zookeeper', function() {
  
  it('should export constructors', function() {
    expect(sd.Registry).to.be.a('function');
  });
  
});

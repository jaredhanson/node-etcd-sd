var path = require('path')
  , registryPath = path.resolve(__dirname, '../lib/registry')
  , Registry = require('../lib/registry');

describe('registry', function () {
  it('should export a constructor', function () {
    expect(Registry).to.be.a('function');
  });

  describe('#registry.close', function () {
    var testRegistry = new Registry();
    it('should be a method', function () {
      expect(testRegistry.close).to.be.a('function');
    });

    describe('closing', function () {
      var registry = new Registry();
      before(function(done) {
        registry.on('close', function () {
          return done();
        });
        registry.close();
      });
      it('should be connect', function () {
        expect(registry._isConnected).to.be.false;
      });
    });
  });

  describe('#registry.announce', function () {
    var testRegistry = new Registry();
    it('should be a method', function () {
      expect(testRegistry.announce).to.be.a('function');
    });

    describe('announcing', function () {
      var etcd = function () {};
      etcd.prototype.setTTL = function (path, data, ttl, cb) {
        process.nextTick(function () {
          return cb();
        });
      };

      etcd.prototype.updateTTL = function (path, data, ttl, cb) {
        return cb();
      };

      var dom, typ;
      var registryOverride = $require(registryPath, {'node-etcd': etcd});
      var registry = new registryOverride({ttl: 1});
      before(function(done) {
        registry.announce('domain', 'type', 'value', function (err) {
          if (err) { return done(err); }
        });

        registry.once('renew', function (domain, type) {
          dom = domain;
          typ = type;
          return done();
        });
      });

      it('should renew the announced domain and type', function () {
        expect(dom).to.be.equal('domain');
        expect(typ).to.be.equal('type');
      });
    });

    describe('error with updateTTL', function () {
      var etcd = function () {};

      etcd.prototype.setTTL = function (path, data, ttl, cb) {
        process.nextTick(function () {
          return cb();
        });
      };

      etcd.prototype.updateTTL = function (path, data, ttl, cb) {
        process.nextTick(function () {
          return cb(new Error('It just did not work, is all'));
        });
      };

      var registryOverride = $require(registryPath, {'node-etcd': etcd});
      var registry = new registryOverride({ttl: 1});
      var error;
      var called = 0;
      before(function(done) {
        registry.announce('domain', 'type', 'value', function (err) {
          if (err) { console.log(err); }
        });
        registry.once('error', function (err) {
          error = err;
          return done();
        });
      });
      it('should produce an error', function () {
        expect(error).to.not.be.undefined;
        expect(error.message).to.be.equal('Failed to update TTL for type@domain')
      });
    });

  });

  describe('#registry.unannounce', function () {
    var testRegistry = new Registry();
    it('should be a method', function () {
      expect(testRegistry.unannounce).to.be.a('function');
    });
    describe('unannouncing', function () {
      var etcd = function () {};
      etcd.prototype.setTTL = function (path, data, ttl, cb) {
        process.nextTick(function () {
          return cb();
        });
      };

      etcd.prototype.updateTTL = function (path, data, ttl, cb) {
        return cb();
      };

      etcd.prototype.deleteValue = function (path, cb) {
        return cb();
      };

      var dom, typ;
      var registryOverride = $require(registryPath, {'node-etcd': etcd});
      var registry = new registryOverride({ttl: 0.1});
      before(function(done) {
        var uid = registry.announce('domain', 'type', 'value', function (err) {
          if (err) { return done(err); }
        });

        registry.on('renew', function (domain, type) {
          dom = domain;
          typ = type;
          registry.unannounce('domain', 'type', uid, function (err) {
            return done();
          });
        });
      });
      it('should announce', function () {
        expect(dom).to.be.equal('domain');
        expect(typ).to.be.equal('type');
      });
    });
  });

  describe('#registry.domains', function () {
    var testRegistry = new Registry();
    it('should be a method', function () {
      expect(testRegistry.domains).to.be.a('function');
    });

    describe.skip('checking domains', function () {
      var etcd = function () {};
      etcd.prototype.getPath = function (path, cb) {
        expect(path).to.be.equal('/srv');
        return cb(null, [{key: "wow"}], ['values']);
      };
      var registryOverride = $require(registryPath, {'node-etcd': etcd});
      var registry = new registryOverride({ttl: 0.1});
      var result;
      before(function(done) {
          registry.domains(function (err, resp) {
            if (err) { return done(err); }
            result = resp;
            return  done();
          })
      });
      it('should announce', function () {
        expect(result[0]).to.be.equal('wow');
      });
    });

    describe('error checking domains', function () {
      var etcd = function () {};
      etcd.prototype.getPath = function (path, cb) {
        expect(path).to.be.equal('/srv');
        var thisError = new Error('Ah jeez');
        thisError.code = 100;
        return cb(thisError);
      };
      var registryOverride = $require(registryPath, {'node-etcd': etcd});
      var registry = new registryOverride({ttl: 0.1});
      var error;
      before(function(done) {
          registry.domains(function (err, resp) {
            if (err) {
              error = err;
              return done();
            }
          });
      });
      it('should produce an error', function () {
        expect(error.message).to.be.equal('Ah jeez');
      });
    });
  });

  describe.skip('#registry.resolve', function () {
    var testRegistry = new Registry();
    it('should be a method', function () {
      expect(testRegistry.resolve).to.be.a('function');
    });
    describe('resolving', function () {
      var etcd = function () {};
      etcd.prototype.setTTL = function (path, data, ttl, cb) {
        process.nextTick(function () {
          return cb();
        });
      };

      etcd.prototype.updateTTL = function (path, data, ttl, cb) {
        expect(path).to.be.equal('wow');
        return cb();
      };

      etcd.prototype.setPath = function(path, cb) {        
        process.nextTick(function () {
          return cb();
        });
      };

      etcd.prototype.deleteValue = function (path, cb) {
        expect(path).to.be.equal('wow');
        return cb();
      };

      etcd.prototype.watch = function(path, options) {
        expect(path).to.be.equal('/srv/strange/values');
        return;
      };
      etcd.prototype._watch = function(path, options) {
        expect(path).to.be.equal('/srv/strange/values');
        return;
      };
      
      etcd.prototype.getPath = function (path, cb) {
        expect(path).to.be.equal('/srv/strange/values');
        return cb(null, ['test']);
      };
      etcd.prototype.getValue = function (path, cb) {
        expect(path).to.be.equal('test');
        return cb(null, 'value');
      };
      var registryOverride = $require(registryPath, {'node-etcd': etcd});
      var registry = new registryOverride({ttl: 0.1});
      var result;
      before(function(done) {
          registry.resolve('strange', 'values', function (err, resp) {
            if (err) { return done(err); }
            result = resp;
            return  done();
          })
      });
      it('should return the resolved value', function () {
        expect(result[0]).to.be.equal('value');
      });
    });
    describe('resolving with values shortcut', function () {
      var etcd = function () {};
      etcd.prototype.setTTL = function (path, data, ttl, cb) {
        process.nextTick(function () {
          return cb();
        });
      };

      etcd.prototype.setPath = function(path, cb) {        
        process.nextTick(function () {
          return cb();
        });
      };

      etcd.prototype.updateTTL = function (path, data, ttl, cb) {
        expect(path).to.be.equal('wow');
        return cb();
      };

      etcd.prototype.deleteValue = function (path, cb) {
        expect(path).to.be.equal('wow');
        return cb();
      };
      etcd.prototype.watch = function(path, options, cb) {
        expect(path).to.be.equal('/srv/strange/values');
        return cb();
      };
      etcd.prototype.getPath = function (path, cb) {
        expect(path).to.be.equal('/srv/strange/values');
        return cb(null, ['values'], {'values':'value'});
      };
      etcd.prototype.getValue = function (path, cb) {
        expect(path).to.be.equal('test');
        return cb(null, 'value');
      };
      var registryOverride = $require(registryPath, {'node-etcd': etcd});
      var registry = new registryOverride({ttl: 0.1});
      var result;
      before(function(done) {
          registry.resolve('strange', 'values', function (err, resp) {
            if (err) { return done(err); }
            result = resp;
            return  done();
          })
      });
      it('should return the resolved value', function () {
        expect(result[0]).to.be.equal('value');
      });
    });

    describe('resolve with caching', function () {
      var etcd = function () {};
      etcd.prototype.setTTL = function (path, data, ttl, cb) {
        process.nextTick(function () {
          return cb();
        });
      };

      etcd.prototype.setPath = function(path, cb) {        
        process.nextTick(function () {
          return cb();
        });
      };

      etcd.prototype.updateTTL = function (path, data, ttl, cb) {
        expect(path).to.be.equal('wow');
        return cb();
      };

      etcd.prototype.deleteValue = function (path, cb) {
        expect(path).to.be.equal('wow');
        return cb();
      };
      var call_count = 0;
      etcd.prototype.watch = function(path, options, cb) {
        expect(path).to.be.equal('/srv/strange/values');
        call_count++;
        if (call_count <= 4) {
          process.nextTick(function () {
            cb(null, 'set', 'this/is/the/key', 'val', {mindex: 10});
            process.nextTick(function () {
              cb(null, 'delete', 'this/is/the/key', 'val', {mindex: 10});
              process.nextTick(function () {
                cb(null, 'expire', 'this/is/the/key', 'val', {mindex: 10});
            });
            });
          });
        } else {
          process.nextTick(function () {
            cb(new Error('Stop all the downloading'));
          });
        }
      };
      etcd.prototype.getPath = function (path, cb) {
        expect(path).to.be.equal('/srv/strange/values');
        return cb(null, ['values'], {'values':'value'});
      };
      etcd.prototype.getValue = function (path, cb) {
        expect(path).to.be.equal('test');
        return cb(null, 'value');
      };
      var registryOverride = $require(registryPath, {'node-etcd': etcd});
      var registry = new registryOverride({ttl: 0.1});
      var result;
      var count = 0;
      var dom, typ, rcrds;
      before(function(done) {
          registry.resolve('strange', 'values', function (err, resp) {
            if (err) { return done(err); }
            registry.resolve('strange', 'values', function (err, resp) {
              if (err) { return done(err); }
              result = resp;
            });
        });
        registry.on('services', function (domain, type, records) {
          count++;
          if (count === 4) {
            dom = domain;
            typ = type;
            rcrds = records;
            done();
          }
        });
      });
      it('should return the cached value', function () {
        expect(result.length).to.be.equal(2);
        expect(result[0] === 'val' || result[1] === 'val');
        expect(dom).to.be.equal('is');
        expect(typ).to.be.equal('the');
      })
    });
    
    describe('resolve value error', function () {
      var etcd = function () {};
      etcd.prototype.setTTL = function (path, data, ttl, cb) {
        process.nextTick(function () {
          return cb();
        });
      };

      etcd.prototype.updateTTL = function (path, data, ttl, cb) {
        expect(path).to.be.equal('wow');
        return cb();
      };

      etcd.prototype.deleteValue = function (path, cb) {
        expect(path).to.be.equal('wow');
        return cb();
      };
      etcd.prototype.watch = function(path, options) {
        expect(path).to.be.equal('/srv/strange/values');
        return;
      };
      etcd.prototype.getPath = function (path, cb) {
        expect(path).to.be.equal('/srv/strange/values');
        return cb(null, ['test']);
      };
      etcd.prototype.getValue = function (path, cb) {
        expect(path).to.be.equal('test');
        return cb(new Error('Oh man'));
      };
      var registryOverride = $require(registryPath, {'node-etcd': etcd});
      var registry = new registryOverride({ttl: 0.1});
      var error;
      before(function(done) {
          registry.resolve('strange', 'values', function (err, resp) {
            if (err) { 
              error = err;
              return done(); 
            }
        });
      });
      it('should return an error', function () {
        expect(error).to.not.be.undefined;
        expect(error.message).to.be.equal('Oh man');
      });
    });
  });

  describe('#registry.services', function () {
    var testRegistry = new Registry();
    it('should be a method', function () {
      expect(testRegistry.services).to.be.a('function');
    });

    describe.skip('checking services', function () {
      var etcd = function () {};
      etcd.prototype.getPath = function (path, cb) {
        expect(path).to.be.equal('/srv/strange');
        return cb(null, [{key: "wow"}], ['values']);
      };
      var registryOverride = $require(registryPath, {'node-etcd': etcd});
      var registry = new registryOverride({ttl: 0.1});
      var result;
      before(function(done) {
          registry.services('strange', function (err, resp) {
            if (err) { return done(err); }
            result = resp;
            return  done();
          })
      });
      it('should announce', function () {
        expect(result[0]).to.be.equal('wow');
      });
    });

    describe('error checking services', function () {

    });
  });
});
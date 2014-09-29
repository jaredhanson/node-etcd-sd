var path = require('path')
  , registryPath = path.resolve(__dirname, '../lib/registry');

describe('Registry', function () {

  describe('#connect', function () {

    describe('connect with cb', function () {
      var etcd = function () {};
      var Registry = $require(registryPath, {'node-etcd': etcd});
      var registry = new Registry();
      before(function(done) {
        registry.connect(function () {
          done();
        });
      });
      it('should have connected', function () {
        expect(registry._isConnected).to.be.true;
      });
    });

    describe('connect without cb', function () {
      var etcd = function () {};
      var Registry = $require(registryPath, {'node-etcd': etcd});
      var registry = new Registry();
      before(function(done) {
        registry.on('ready', function () {
          done();
        });
        registry.connect();
      });
      it('should have connected', function () {
        expect(registry._isConnected).to.be.true;
      });
    });
  });

  describe('#close', function () {
    describe('closing', function () {
      var etcd = function () {};
      var Registry = $require(registryPath, {'node-etcd': etcd});
      var registry = new Registry();
      before(function(done) {
        registry.on('close', function () {
          done();
        });
        registry.close();
      });
      it('should have disconnected', function () {
        expect(registry._isConnected).to.be.false;
      });
    });
  });
  describe('#announce', function () {

    describe('correctly announcing val', function () {
      var etcd = function () {};
      var updated = true;
      etcd.prototype.updateTTL = function(path, data, ttl, cb) {
        process.nextTick(function () {
          updated = true;
          expect(path.split('/')[1]).to.be.equal('srv');
          expect(path.split('/')[2]).to.be.equal('domain');
          expect(path.split('/')[3]).to.be.equal('type');
          expect(data).to.be.equal('data');
          expect(ttl).to.be.equal(0.001);
          return cb();
        });
      };
      etcd.prototype.setTTL = function(path, data, ttl, cb) {
        process.nextTick(function () {
          expect(path.split('/')[1]).to.be.equal('srv');
          expect(path.split('/')[2]).to.be.equal('domain');
          expect(path.split('/')[3]).to.be.equal('type');
          expect(data).to.be.equal('data');
          expect(ttl).to.be.equal(0.001);
          return cb();
        });
      };
      var Registry = $require(registryPath, {'node-etcd': etcd});
      var registry = new Registry({ttl: 0.001});
      before(function(done) {
        registry.once('renew', function () {
          done();
        });

        registry.connect();
        registry.announce('domain', 'type', 'data', function (err) {
          if (err) { return cb(err); }
        });
      });
      it('should have announced', function () {
        expect(updated).to.be.true;
      });
    });

    describe('error setting ttl', function () {
      var etcd = function () {};
      var updated = true;
      etcd.prototype.updateTTL = function(path, data, ttl, cb) {
        process.nextTick(function () {
          updated = true;
          expect(path.split('/')[1]).to.be.equal('srv');
          expect(path.split('/')[2]).to.be.equal('domain');
          expect(path.split('/')[3]).to.be.equal('type');
          expect(data).to.be.equal('data');
          expect(ttl).to.be.equal(0.001);
          return cb();
        });
      };
      etcd.prototype.setTTL = function(path, data, ttl, cb) {
        process.nextTick(function () {
          expect(path.split('/')[1]).to.be.equal('srv');
          expect(path.split('/')[2]).to.be.equal('domain');
          expect(path.split('/')[3]).to.be.equal('type');
          expect(data).to.be.equal('data');
          expect(ttl).to.be.equal(0.001);
          return cb(new Error('Failure to cooperate'));
        });
      };
      var Registry = $require(registryPath, {'node-etcd': etcd});
      var registry = new Registry({ttl: 0.001});
      var error;
      before(function(done) {
        registry.connect();
        registry.announce('domain', 'type', 'data', function (err) {
          if (err) {
            error = err;
            return done();
          }
        });
      });
      it('should have announced', function () {
        expect(error.message).to.be.equal('Failure to cooperate');
      });
    });

    describe('error updating ttl', function () {
      var etcd = function () {};
      var updated = true;
      etcd.prototype.updateTTL = function(path, data, ttl, cb) {
        process.nextTick(function () {
          updated = true;
          expect(path.split('/')[1]).to.be.equal('srv');
          expect(path.split('/')[2]).to.be.equal('domain');
          expect(path.split('/')[3]).to.be.equal('type');
          expect(data).to.be.equal('data');
          expect(ttl).to.be.equal(0.001);
          return cb(new Error('Failure to cooperate'));
        });
      };
      etcd.prototype.setTTL = function(path, data, ttl, cb) {
        process.nextTick(function () {
          expect(path.split('/')[1]).to.be.equal('srv');
          expect(path.split('/')[2]).to.be.equal('domain');
          expect(path.split('/')[3]).to.be.equal('type');
          expect(data).to.be.equal('data');
          expect(ttl).to.be.equal(0.001);
          return cb();
        });
      };
      var Registry = $require(registryPath, {'node-etcd': etcd});
      var registry = new Registry({ttl: 0.001});
      var error;

      before(function(done) {
        registry.connect();
        registry.once('error', function (err) {
          error = err;
          done();
        });
        registry.announce('domain', 'type', 'data', function (err) {
          if (err) {
            return done(err);
          }
        });
      });
      it('should have announced', function () {
        expect(error.message).to.be.equal('Failed to update TTL for type@domain');
      });
    });
  });
  describe('#unannounce', function () {
    describe('sucessful unannounce', function () {
      var etcd = function () {};
      var deleted;
      etcd.prototype.deleteValue = function (path, cb) {
        deleted = true;
        expect(path).to.be.equal('/srv/domain/type/uid');
        process.nextTick(function() {
          return cb();
        })
      };
      var Registry = $require(registryPath, {'node-etcd': etcd});
      var registry = new Registry();
      before(function (done) {
        registry.unannounce('domain', 'type', 'uid', function () {
          done();
        });
      });
      it('should deleteValue', function () {
        expect(deleted).to.be.equal(true);
      });
    });
  });

  describe('#domains', function () {
    describe('sucessful domain fetch', function () {
      var etcd = function () {};
      var called;
      etcd.prototype.getPath = function (path, cb) {
        called = true;
        expect(path).to.be.equal('/srv');
        process.nextTick(function() {
          return cb(null, [{key: 'wow'}, {key: 'neat'}]);
        })
      };
      var Registry = $require(registryPath, {'node-etcd': etcd});
      var registry = new Registry();
      var values;
      before(function (done) {
        registry.connect();
        registry.domains(function (err, ret) {
          values = ret;
          done();
        });
      });
      it('should get the domains', function () {
        expect(called).to.be.equal(true);
        expect(values[0]).to.be.equal('neat');
        expect(values[1]).to.be.equal('wow');
      });
    });
  });

  describe('#resolve', function () {
    describe('sucessful set resolve', function () {
      var etcd = function () {};
      etcd.prototype.watch = function (path, options, cb) {
        expect(path).to.be.equal('/srv/domain/type');
        expect(options.recursive).to.be.true;
        process.nextTick(function () {
          return cb(null, 'set', 'wow/neat/test', '{"key": "value"}', {mindex: 2});
        });
      };
      etcd.prototype.getPath = function (path, cb) {
        expect(path).to.be.equal('/srv/domain/type');
        process.nextTick(function() {
          return cb(null, ['/srv/wow/cool']);
        });
      };
      etcd.prototype.getValue = function (path, cb) {
        expect(path).to.be.equal('/srv/wow/cool');
        process.nextTick(function() {
          return cb(null, 'final result!');
        });
      }
      var Registry = $require(registryPath, {'node-etcd': etcd});
      var registry = new Registry();
      var values;
      before(function (done) {
        registry.connect();
        registry.resolve('domain', 'type', function (err, ret) {
          values = ret;
          done();
        });
      });
      it('should have some values', function () {
        expect(values[0]).to.be.equal('final result!');
      });
    });
  });
  describe('#services', function () {
    var etcd = function () {};
    etcd.prototype.getPath = function (path, cb) {
      expect(path).to.be.equal('/srv/domain');
      process.nextTick(function() {
        return cb(null, [{key: 'wow'}]);
      });
    };
    var Registry = $require(registryPath, {'node-etcd': etcd});
    var registry = new Registry();
    var values;
    before(function (done) {
      registry.connect();
      registry.services('domain', function (err, ret) {
        values = ret;
        done();
      });
    });
    it('should have some values', function () {
      expect(values[0]).to.be.equal('wow');
    });
  });
}) 
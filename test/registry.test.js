var path = require('path')
  , registryPath = path.resolve(__dirname, '../lib/registry')
  , etcd = require('./mocks/etcd');

describe('registry', function () {
  it('should able to announce on a route', function (done) {
    var registry = $require(registryPath, {'nodeprime-etcd': etcd});
    var reg = new registry();
    reg.connect();
    reg.announce('this', 'is', 'test1', function (err, res) {
      done();
    });
  });

  it('should be able get domains', function (done) {
    console.log(etcd);
    var registry = $require(registryPath, {'nodeprime-etcd': etcd});
    var reg = new registry({timeout: 1});
    reg.connect();
    reg.announce('this', 'is', 'test2', function (err, res) {
      reg.domains(function (err2, res2) {
        // expect mr
        reg.on('ttl-refresh', function () {
          reg.close();
          done();
        })
      })
    });
  });

  it('should be able to get types', function (done) {
    var registry = $require(registryPath, {'nodeprime-etcd': etcd});
    var reg = new registry();
    reg.connect();
    reg.announce('this', 'is', 'test3', function (err, res) {
      reg.types('this', function (err2, res2) {
        // expect is
        done();
      });
    });
  });

  it('should be able to resolve keys', function (done) {
    var registry = $require(registryPath, {'nodeprime-etcd': etcd});
    var reg = new registry();
    reg.connect();
    reg.announce('this', 'is', 'test4', function (err, res) {
      reg.resolve('this', 'is', function (err2, res2) {
        done();
      });
    });
  });

  it('should do caching', function (done) {
    var registry = $require(registryPath, {'nodeprime-etcd': etcd});
    var reg = new registry();
    reg.connect();
    reg.announce('this', 'is', 'test4', function (err, res) {
      reg.resolve('this', 'is', function (err2, res2) {
        // cached
        reg.resolve('this', 'is', function (err2, res2) {
          done();
        });
      });
    });
  });

  it('should disconnect', function (done) {
    var registry = $require(registryPath, {'nodeprime-etcd': etcd});
    var reg = new registry();
    reg.connect();
    reg.announce('gonnadie', 'now', 'bye', function (err, res) {
      reg.close();
      done();
    });
  });
}) 
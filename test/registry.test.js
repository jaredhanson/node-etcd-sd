var path = require('path')
  , registryPath = path.resolve(__dirname, '../lib/registry')
  , etcd = require('./mocks/etcd');

describe('registry', function () {
  it('should be able to pass a prefix as the option', function (done) {
    var registry = $require(registryPath, {'node-etcd': etcd});
    var reg = new registry("srv");
    expect(reg._prefix).to.be.equal('srv');
    done();
  });

  it('should accept and call a callback for connect', function (done) {
    var registry = $require(registryPath, {'node-etcd': etcd});
    var reg = new registry("srv");
    reg.connect(function () {
      expect(this._isConnected).to.be.equal(true);
      done();
    });
  });

  it('should able to announce on a route', function (done) {
    var registry = $require(registryPath, {'node-etcd': etcd});
    var reg = new registry();
    reg.connect();
    reg.announce('this', 'is', 'test1', function (err, res) {
      done();
    });
  });

  it('should be able to unannounce on a route', function (done) {
    var registry = $require(registryPath, {'node-etcd': etcd});
    var reg = new registry();
    reg.connect();
    reg.announce('this', 'is', 'test1', function (err, res) {
      reg.unannounce('this', 'is', 'this is a uuid!', function (err, res) {
        done();
      });
    });
  });

  it('should able to announce on a route and update', function (done) {
    var registry = $require(registryPath, {'node-etcd': etcd});
    var reg = new registry({timeout: 1});
    reg.connect();
    reg.announce('this', 'is', 'test1', function (err, res) {
      reg.on('ttl-refresh', function () {
        done();
      });
    });
  });

  it('should error if the directories are screwed', function (done) {
    var registry = $require(registryPath, {'node-etcd': etcd});
    var reg = new registry({timeout: 1});
    reg._client._wacky = {nodes: {dir: "this just happened"}};
    reg.connect();
    reg.announce('this', 'is', 'test2', function (err, res) {
      reg.resolve('this', 'is', function (err, res) {
        expect(err).to.be.equal('DIRECTORY ERROR');
        expect(res).to.be.equal(undefined);
        done();
      });
    });
  });

  it('should error if the directories are screwed 2', function (done) {
    var registry = $require(registryPath, {'node-etcd': etcd});
    var reg = new registry({timeout: 1});
    reg._client._wacky = {node: {nodes: [{node: {dir: "this just happened"}}]}};
    reg.connect();
    reg.announce('this', 'is', 'test2', function (err, res) {
      reg.resolve('this', 'is', function (err, res) {
        expect(err).to.be.equal('DIRECTORY ERROR');
        expect(res).to.be.equal(undefined);
        done();
      });
    });
  });

  it('should be able get domains', function (done) {
    var registry = $require(registryPath, {'node-etcd': etcd});
    var reg = new registry({timeout: 1});
    reg.connect();
    reg.announce('this', 'is', 'test2', function (err, res) {
      reg.domains(function (err2, res2) {
        // expect mr
        done();
        reg.on('ttl-refresh', function () {
          reg.close();
        })
      })
    });
  });

  it('should be able to get types', function (done) {
    var registry = $require(registryPath, {'node-etcd': etcd});
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
    var registry = $require(registryPath, {'node-etcd': etcd});
    var reg = new registry();
    reg.connect();
    reg.announce('this', 'is', 'test4', function (err, res) {
      reg.resolve('this', 'is', function (err2, res2) {
        done();
      });
    });
  });

  it('should be able to resolve keys wacky', function (done) {
    var registry = $require(registryPath, {'node-etcd': etcd});
    var reg = new registry();
    reg.connect();
    reg.announce('this', 'is', 'test4', function (err, res) {
      reg._client._wacky = {key: 'cool', node: {dir: 'yes', nodes: [{key: 'story', node: {dir: "this just happened"}}]}};
      reg.resolve('this', 'is', function (err2, res2) {
        done();
      });
    });
  });

  it('should disconnect', function (done) {
    var registry = $require(registryPath, {'node-etcd': etcd});
    var reg = new registry();
    reg.connect();
    reg.announce('gonnadie', 'now', 'bye', function (err, res) {
      reg.close();
      done();
    });
  });
}) 
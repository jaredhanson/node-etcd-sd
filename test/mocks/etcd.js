function Etcd(options, port) {
  // STUFF
  this.options = options || {};
  this.options.port = port || 4001;
  this._wacky = options.wacky;
  this._store = {};
  this._watching = [];
}

Etcd.prototype.setTTL = function(path, value, ms, cb) {
  process.nextTick(function () {
    return cb();
  });
};

Etcd.prototype.updateTTL = function(path, value, ms, cb) {
  process.nextTick(function () {
    return cb();
  });
};

Etcd.prototype.deleteValue = function(path, cb) {
  process.nextTick(function () {
    return cb();
  });
};

Etcd.prototype.getPath = function(path, cb) {
  process.nextTick(function () {
    return cb(null, ['hey', 'there']);
  });
};

Etcd.prototype.getValue = function(path, cb) {
  process.nextTick(function () {
    return cb(null, 'I am value');
  });
};

Etcd.prototype.watch = function(dir) {
  this._watching.push(dir);
  return;
};

module.exports = Etcd;
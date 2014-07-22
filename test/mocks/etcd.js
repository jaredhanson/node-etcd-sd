function Etcd(options, port) {
  // STUFF
  this.options = options || {};
  this.options.port = port || 4001;
  this._store = {};
}

Etcd.prototype.set = function set(key, val, options, cb) {
  // body...
  cb = cb || options;
  this._store[key] = val;
  return cb();
};

Etcd.prototype.get = function get(val, cb) {
  if (! this._store[val]) {
    return cb("KEY NOT FOUND");
  }
  return cb(null, this._store[val])
}
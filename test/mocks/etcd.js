function Etcd(options, port) {
  // STUFF
  this.options = options || {};
  this.options.port = port || 4001;
  this._store = {};
}

Etcd.prototype.set = function set(key, val, options, cb) {
  cb = cb || options;
  var slices = [];
  key = key.split("/");
  for (var i = 0, len = key.length; i < len; i++) {
    var k = key[i];
    var slice = key.slice(i + 1);
    slice.push(val);
    slices.push(slice);
    if (! this._store[k]) {
      this._store[k] = [];
    }
    this._store[k].push(slice);

  };
  return cb(null, slices);
};

Etcd.prototype.get = function get(key, cb) {
  if (! key) {
    return cb('NO KEY BB');
  }
  key = key.split("/")
  if (! this._store[key[0]]) {
    return cb('KEY: ' + key + ' NOT FOUND');
  }
  var dir, value, nodes;
  if (this._store[key[0]].length === 1) {
    var value = this._store[key[0]][0];
    if (value.length === 1) {
      dir = false
    } else {
      dir = true
      nodes = this._store[key[0]];
    }
  } else {
    dir = true;
    nodes = this._store[key[0]];
  }
  var ret;
  if (nodes) {
    ret = {node: {key: key, dir: dir, nodes: nodes}};
  } else {
    ret = {node: {key: key, value: value}};
  }
  return cb(null, ret)
}

module.exports = Etcd;
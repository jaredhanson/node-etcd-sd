var EventEmitter = require('events').EventEmitter
  , Etcd = require('node-etcd')
  , LRU = require('lru-cache')
  , uuid = require('node-uuid').v4
  , util = require('util');

function Registry(options) {
 if (typeof options == 'string') {
    options = { prefix: options };
  }
  opts = options || {};
  this._client = new Etcd(opts);
  EventEmitter.call(this);
  this._prefix = opts.prefix || 'srv';
  this._cache = new LRU(opts.cache || 32);
  this.timeout = opts.timeout || 60;
}

util.inherits(Registry, EventEmitter);

Registry.prototype.connect = function(options, readyListener) {
  readyListener = readyListener || options;
  if (readyListener) { this.once('ready', readyListener); }
  this._isConnected = true;
  this.emit('ready');
}

Registry.prototype.close = function () {
  this._cache.reset();
  this._isConnected = false;
  this.emit('close');
}

Registry.prototype.announce = function(domain, type, data, cb) {
  // Enforce connection to prevent any weirdness
  this._connectCheck();

  if (typeof data == 'object') {
    data = JSON.stringify(data);
  }
  var self = this
    , client = this._client
    , uid = uuid()
    // https://github.com/coreos/etcd/issues/669 Double Encoding.
    , dir = [ this._prefix, domain, encodeURIComponent(encodeURIComponent(type)) ].join('/')
    , path = [ dir, uid ].join('/');

  // Refresh TTL to ensure service is still up.
  var refresh;
  function update() {
    client.updateTTL(path, data, self.timeout, function(err, ret) {
      if (err) {
        self.emit('ttl-update-error', err);
        clearTimeout(refresh);
        return;
      } else {
        self.emit('ttl-refresh');
      }
    });
  }

  client.setTTL(path, data, self.timeout, function(err, ret) {
    if (err) {
      return cb(err);
    }
    // 0.8 = Crazy value, chosen by Jared. History will not be kind to this choice.
    refresh = setInterval(update, 0.8 * self.timeout * 1000);
    self.on('close', function () {
      clearTimeout(refresh);
    });
    return cb();
  });
  return uid;
}

Registry.prototype.unannounce = function(domain, type, uid, cb) {
  var client = this._client
    // https://github.com/coreos/etcd/issues/669 Double Encoding.
    , path = [ this._prefix, domain, encodeURIComponent(encodeURIComponent(type)), uid ].join('/');

  client.deletePath(path, function(err, ret) {
    if (err) {
      return cb(err);
    }
    return cb();
  });
}

Registry.prototype.domains = function(cb) {
  this._ls(this._prefix, function (err, res) {
    var data = res
      , results;
    if (err) {
      return cb(err);
    }
    results = [];
    for (var i = data.length - 1; i >= 0; i--) {
      results.push(data[i].key);
    };
    return cb(null, results);
  });
}

Registry.prototype.resolve = function(domain, type, cb) {
  var self = this
    , client = this._client
    // https://github.com/coreos/etcd/issues/669 Double encode
    , dir = [ this._prefix, domain, encodeURIComponent(encodeURIComponent(type)) ].join('/')
    , cached = this._cache.get(dir);

  // TODO: Caching
  // if (cached) {
  //   process.nextTick(function() {
  //     // TODO: Randomize cached records for pseudo-load balancing.
  //     cb(null, cached);
  //   });
  //   return;
  // }
  this._ls(dir, function(error, children) {

    if (error) {
      return cb(error);
    }

    var records = []
      , idx = 0;

    function iter(err) {
      var child
        , path;

      if (err) { return cb(err); }
      
      if (children && children.length > 0) {
        child = children[idx++];
      }

      if (!child) {
        // No cache
        // self._cache.set(dir, records);
        return cb(null, records);
      }

      client.getValue(child, function(error, data) {
        if (error) {
          return iter(error);
        }
        // We expect this path to resolve to endpoints, not a directory.
        records.push(data);
        iter();
      });
    }
    // Start iteration.
    iter();
  });
}

Registry.prototype.services = 
Registry.prototype.types = function(domain, cb) {
  var dir = [ this._prefix, domain ].join('/');
  this._ls(dir, function (err, res) {
    var types;
    if (err) {
      return cb(err);
    }
    // https://github.com/coreos/etcd/issues/669 Double Decode
    types = res.map(function(c) { return decodeURIComponent(decodeURIComponent(c.key)); });
    return cb(null, types);
  });
}

Registry.prototype._ls = function(path, cb) {
  this._connectCheck();
  var client = this._client;
  client.getPath(path, function(error, children) {
    if (error) {
      if (error.errorCode == '100') {
        cb(new NotFoundError(error));
      }
      return cb(error);
    }
    
    return cb(null, children);
  });
}

Registry.prototype._connectCheck = function _connectCheck() {
  if (this._isConnected) {
    return true;
  } else {
    // TODO: Make an Error object for this
    throw new Error("Etcd Connection Error: Etcd is not connected");
  }
}

module.exports = Registry;

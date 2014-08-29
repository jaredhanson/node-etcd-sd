var EventEmitter = require('events').EventEmitter
  , Etcd = require('node-etcd')
  , NotFoundError = require('./errors/notfounderror')
  , LRU = require('lru-cache')
  , uuid = require('node-uuid').v4
  , util = require('util')
  , debug = require('debug')('sd-etcd');

function Registry(options) {
 if (typeof options == 'string') {
    options = { prefix: options };
  }
  options = options || {};
  
  EventEmitter.call(this);
  this._client = new Etcd(options);
  this._prefix = options.prefix || '/srv';
  this._cache = new LRU(options.cache || 32);
  this._ttl = options.ttl || 60;
  this._renew = options.renew || this._ttl * 0.75;
  this._intervals = {};
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
  
  // TODO: clear all interval handles in this._intervals
  //       on close and error
  /*
    self.on('close', function () {
      clearTimeout(refresh);
    });
  */
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
  function renew() {
    debug('renewing ttl of service %s', type);
    client.updateTTL(path, data, self._ttl, function(err, ret) {
      if (err) {
        self.emit('error', new Error('Failed to update TTL for ' + type + '@' + domain));
        return;
      }
      self.emit('renew', domain, type);
    });
  }

  client.setTTL(path, data, self._ttl, function(err) {
    if (err) {
      return cb(err);
    }
    
    debug('announced service %s with ttl %d, renewing every %ds', type, self._ttl, self._renew);
    var h = setInterval(renew, self._renew * 1000);
    self._intervals[uid] = h;
    return cb();
  });
  return uid;
}

Registry.prototype.unannounce = function(domain, type, uid, cb) {
  var client = this._client
    // https://github.com/coreos/etcd/issues/669 Double Encoding.
    , path = [ this._prefix, domain, encodeURIComponent(encodeURIComponent(type)), uid ].join('/');


  var h = this._intervals[uid];
  if (h) {
    clearInterval(h);
    delete this._intervals[uid];
  }

  client.deleteValue(path, function(err, ret) {
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
  this._ls(dir, function(err, children, values) {
    if (err) { return cb(err); }
    
    var records = []
      , idx = 0
      , len, child, data, json;
    
    if (values) {
      // Fast path that uses the value map supplied when listing the directory
      
      for (idx = 0, len = children.length; idx < len; ++idx) {
        child = children[idx];
        data = values[child];
        
        try {
          json = JSON.parse(data);
          records.push(json);
        } catch (_) {
          records.push(data);
        }
      }
      
      // TODO: caching
      // TODO: shuffle records
      return cb(null, records);
    } else {
      // Slow path that interatively gets the value of each node in the
      // directory.
      
      function iter(err) {
        if (err) { return cb(err); }
      
        var child = children[idx++];
        if (!child) {
          // No cache
          // self._cache.set(dir, records);
        
          // TODO: caching
          // TODO: shuffle records
          return cb(null, records);
        }
      
        var segs = child.split('/');
        // https://github.com/coreos/etcd/issues/669 Double encode
        segs[segs.length - 2] = encodeURIComponent(segs[segs.length - 2]);

        client.getValue(segs.join('/'), function(err, data) {
          if (err) {
            if (err.code == 100) {
              // This situation arises when an node expires between the time it
              // was listed as a child and when its value was retrieved.  We
              // simply skip over these occurences, continuing to get nodes that
              // still exist.
              return iter();
            }
            return iter(err);
          }
        
          var json;
          try {
            json = JSON.parse(data);
            records.push(json);
          } catch (_) {
            records.push(data);
          }
          iter();
        });
      }
      iter();
    }
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
  client.getPath(path, function(err, children, values) {
    if (err) {
      if (err.code == 100) {
        return cb(new NotFoundError(err.message));
      }
      return cb(err);
    }
    
    return cb(null, children, values);
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

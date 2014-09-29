var EventEmitter = require('events').EventEmitter
  , Etcd = require('node-etcd')
  , NotFoundError = require('./errors/notfounderror')
  , LRU = require('lru-cache')
  , uuid = require('node-uuid').v4
  , shuffle = require('knuth-shuffle').knuthShuffle
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
  // TODO: clear all interval handles in this._intervals
  var interval;
  for (interval in this._intervals) {
    clearTimeout(this._intervals[interval]);
    delete this._intervals[interval];
  }
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
  function renew() {
    debug('renewing ttl of service %s', type);
    client.updateTTL(path, data, self._ttl, function(err, ret) {
      if (err) {
        self.emit('error', new Error('Failed to update TTL for ' + type + '@' + domain));
        clearInterval(h);
        delete self._intervals[uid]; 
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

  // TODO: Connect check?
  
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

  if (cached) {
    process.nextTick(function() {
      var records = []
        , keys, i, len;
      keys = Object.keys(cached);
      for (i = 0, len = keys.length; i < len; ++i) {
        records.push(cached[keys[i]]);
      }
      
      if (records.length == 0) { return cb(new NotFoundError('No records for "' + type + '"')); }
      // randomize the array as a pseudo-load balancing technique
      cb(null, shuffle(records.slice(0)));
    });
    return;
  }
  
  this._watch(dir);
  this._ls(dir, function(err, children, values) {
    if (err) { return cb(err); }
    
    var records = []
      , crecords = {}
      , idx = 0
      , len, child, segs, data, json;
    
    if (values) {
      // Fast path that uses the value map supplied when listing the directory
      
      for (idx = 0, len = children.length; idx < len; ++idx) {
        child = children[idx];
        segs = child.split('/');
        data = values[child];
        
        try {
          json = JSON.parse(data);
          records.push(json);
          crecords[segs[segs.length - 1]] = json;
        } catch (_) {
          records.push(data);
          crecords[segs[segs.length - 1]] = data;
        }
      }
      
      self._cache.set(dir, crecords);
      if (records.length == 0) { return cb(new NotFoundError('No records for "' + type + '"')); }
      // randomize the array as a pseudo-load balancing technique
      return cb(null, shuffle(records.slice(0)));
    } else {
      // Slow path that interatively gets the value of each node in the
      // directory.
      
      function iter(err) {
        if (err) { return cb(err); }
      
        var child = children[idx++];
        if (!child) {
          self._cache.set(dir, crecords);
          if (records.length == 0) { return cb(new NotFoundError('No records for "' + type + '"')); }
          // randomize the array as a pseudo-load balancing technique
          return cb(null, shuffle(records.slice(0)));
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
            crecords[segs[segs.length - 1]] = json;
          } catch (_) {
            records.push(data);
            crecords[segs[segs.length - 1]] = data;
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

Registry.prototype._watch = function(path, options) {
  options = options || {};
  options.recursive = true;
  
  var self = this
    , client = this._client;
  
  // Set a watch on the service type directory.  The watch is recursive because
  // the child node, named with a unique service ID, is the node whose value is
  // expected to change (including being set and expired).
  client.watch(path, options, function(err, action, key, value, stat) {
    if (err) {
      // unexpected error, invalidate cached records for this service
      self._cache.del(path);
      return;
    }
    
    var crecords = self._cache.get(path);
    if (!crecords) { return; }
    
    var segs = key.split('/');
    var domain = segs[segs.length - 3];
    var type = decodeURIComponent(segs[segs.length - 2]);
    var id = segs[segs.length - 1];
    var change = false;
    try {
      value = JSON.parse(value);
    } catch (_) {}
    
    switch (action) {
    case 'set':
      crecords[id] = value;
      self._cache.set(path, crecords);
      change = true;
      break;
      
    case 'delete':
      delete crecords[id];
      self._cache.set(path, crecords);
      change = true;
      break;
      
    case 'expire':
      delete crecords[id];
      self._cache.set(path, crecords);
      change = true;
      break;
    }
    
    var records = []
      , keys, i, len;
    if (change) {
      keys = Object.keys(crecords);
      for (i = 0, len = keys.length; i < len; ++i) {
        records.push(crecords[keys[i]]);
      }
      
      self.emit('services', domain, type, records);
    }
    
    // start a new watch, from the current modified index to ensure that no
    // changes  are missed
    self._watch(path, { waitIndex: stat.mindex + 1 });
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

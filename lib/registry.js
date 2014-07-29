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

// Announce loop
Registry.prototype.announce = function(domain, type, data, cb) {
  // Enforce connection to prevent any weirdness
  this._connectCheck();

  if (typeof data == 'object') {
    data = JSON.stringify(data);
  }
  var self = this
    , client = this._client
    , uid = uuid()
    , dir = [ this._prefix, domain, encodeURIComponent(type) ].join('/')
    , path = [ dir, uid ].join('/');

  // Refresh TTL to ensure service is still up.
  function update() {
    client.set(path, data, {ttl: self.timeout, prevExist: true}, function(error, ret) {
      if (error) {
        self.emit('error', error);
      } else {
        self.emit('ttl-refresh');
      }
    });
  }
  var refresh;
  client.set(path, data, {ttl: self.timeout}, function(error, ret) {
    if (error) {
      return cb(error);
    }
  // 0.8 = Crazy value, chose by Jared. Will not work at the moon.
    refresh = setInterval(update, 0.8 * self.timeout * 1000);
    self.on('close', function () {
      clearTimeout(refresh);
    });
    return cb(null, ret);
  });
}

Registry.prototype.domains = function(cb) {
  this._ls(this._prefix, function (err, res) {
    var data
      , results;
    if (err) {
      return cb(err);
    }
    data = (res.node && res.node.nodes) ? res.node.nodes : [];
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
    , dir = [ this._prefix, domain, encodeURIComponent(type) ].join('/')
    , cached = this._cache.get(dir);

  if (cached) {
    process.nextTick(function() {
      // TODO: Randomize cached records for pseudo-load balancing.
      cb(null, cached);
    });
    return;
  }
  this._ls(dir, function(error, children) {
    if (error) {
      return cb(error);
    }
    children = children.node ? children.node.nodes : [];
    var records = []
      , idx = 0;
    
    function iter(err) {
      var child
        , path;

      if (err) { return cb(err); }
     
      child = children[idx++];
      if (!child) {
        self._cache.set(dir, records);
        return cb(null, records);
      }

      path = child.key;
      client.get(path, function(error, data) {
        if (error) {
          return iter(error);
        }
        // TODO: Directory Error
        if (data.node && data.node.dir) {
          return iter('DIRECTORY ERROR');
        }
        
        data = data.node ? data.node.value : null;
        var str = data.toString()
          , json;
        try {
          json = JSON.parse(data);
          records.push(json);
        } catch (_) {
          records.push(str);
        }
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
    res = (res.node && res.node.nodes) ? res.node.nodes : [];
    types = res.map(function(c) { return decodeURIComponent(c.key); });
    return cb(null, types);
  });
}

Registry.prototype._ls = function(path, cb) {
  this._connectCheck();
  var client = this._client;
  client.get(path, function(error, children) {
    if (error) {
      return cb(error);
    }
    // TODO: Directory Error
    if (! (children.node && children.node.dir)) {
      return cb('DIRECTORY ERROR');
    }
    return cb(null, children);
  });
}

Registry.prototype._connectCheck = function _connectCheck() {
  if (this._isConnected) {
    return true;
  } else {
    throw new Error("Etcd Connection Error: Etcd is not connected");
  }
}

module.exports = Registry;

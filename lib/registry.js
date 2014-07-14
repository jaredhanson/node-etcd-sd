var EventEmitter = require('events').EventEmitter
  , Etcd = require('nodeprime-etcd')
  , EtcdError = require('./errors/etcderror')
  , LRU = require('lru-cache')
  , uuid = require('node-uuid').v4
  , util = require('util');

function Registry(options) {
 if (typeof options == 'string') {
    options = { prefix: options };
  }
  options = options || {};
  this._client = new Etcd(options);
  EventEmitter.call(this);
  this._prefix = options.prefix || 'srv';
  this._cache = new LRU(options.cache || 32);
}

util.inherits(Registry, EventEmitter);

Registry.prototype.connect = function(options, readyListener) {
  if (readyListener) { this.once('ready', readyListener); }
  var self = this;
  var opts = {};
  options = options || {};
  opts.host = options.host || 'localhost';
  opts.port = options.port || 4001;
  this._client = new Etcd(opts.host, opts.port);
  self.emit('ready');
}

Registry.prototype.close = function () {
  this._cache.reset();
}

Registry.prototype.announce = function(domain, type, data, cb) {
  if (typeof data == 'object') {
    data = JSON.stringify(data);
  }
  var client = this._client
    , uid = uuid()
    , dir = [ this._prefix, domain, encodeURIComponent(type) ].join('/')
    , path = [ dir, uid ].join('/');

  // TODO: TTL or something to handle service checking.
  client.set(path, data, function(error, ret) {
    if (error) {
      return cb(error);
    }
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

module.exports = Registry;
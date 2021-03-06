var EventEmitter = require('events').EventEmitter
  , Etcd = require('etceterad')
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
  this._ns = options.namespace || '/srv';
  this._cache = new LRU(options.cache || 32);
  this._ttl = options.ttl || 60;
  this._renew = options.renew || this._ttl * 0.75;
  this._intervals = {};
}

util.inherits(Registry, EventEmitter);

Registry.prototype.close = function () {
  this._cache.reset();
  // TODO: clear all interval handles in this._intervals
  var interval;
  for (interval in this._intervals) {
    clearTimeout(this._intervals[interval]);
    delete this._intervals[interval];
  }
  this.emit('close');
}

Registry.prototype.announce = function(type, data, options, cb) {
  if (typeof options == 'function') {
    cb = options;
    options = undefined;
  }
  options = options || {};

  if (typeof data == 'object') {
    data = JSON.stringify(data);
  }
  var self = this
    , client = this._client
    , uid = uuid()
    // https://github.com/coreos/etcd/issues/669 Double Encoding.
    , dir = [ this._ns, encodeURIComponent(encodeURIComponent(type)) ].join('/')
    , path = [ dir, uid ].join('/');

  // Refresh TTL to ensure service is still up.
  function renew() {
    debug('renewing ttl of service %s', type);
    client.updateTTL(path, data, self._ttl, function(err, ret) {
      if (err) {
        self.emit('error', new Error('Failed to update TTL for ' + type));
        clearTimeout(self._intervals[uid]);
        delete self._intervals[uid]; 
        return;
      }
      self.emit('renew', type);
    });
  }
  
  client.set(path, data, { ttl: self._ttl }, function(err) {
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

Registry.prototype.unannounce = function(type, uid, cb) {

  // TODO: Connect check?
  
  var client = this._client
    // https://github.com/coreos/etcd/issues/669 Double Encoding.
    , path = [ this._ns, encodeURIComponent(encodeURIComponent(type)), uid ].join('/');


  var h = this._intervals[uid];
  if (h) {
    clearInterval(h);
    delete this._intervals[uid];
  }

  client.delete(path, function(err, ret) {
    if (err) {
      return cb(err);
    }
    return cb();
  });
}

Registry.prototype.resolve = function(type, domain, rrtype, cb) {
  if (typeof rrtype == 'function') {
    cb = rrtype;
    rrtype = domain;
    domain = undefined;
  }
  if (typeof domain == 'function') {
    cb = domain;
    rrtype = undefined;
    domain = undefined;
  }
  rrtype = rrtype || 'SRV';
  
  
  console.log('RESOLVE');
  // FIXME: Errors if just a "foo" key
  
  /*
  this._client.set('/message', 'Hello word', function(err, res) {
    console.log('SET A VALUE!');
    console.log(err);
    console.log(res);
  });
  */
  
  /*
  this._client.get('/message', function(err, res) {
    console.log('GET A VALUE!');
    console.log(err);
    console.log(res);
  });
  */
  
  /*
  this._client.mkdir('/foo_dir', function(err, res) {
    console.log('SET A PATH!');
    console.log(err);
    console.log(res);
  })
  */
  
  
  /*
  this._client.readdir('/', function(err, res) {
    console.log('GET A PATH!');
    console.log(err);
    console.log(res);
  })
  */
  
  /*
  this._client.delete('/message', function(err, res) {
    console.log('DELETE A VALUE!');
    console.log(err);
    console.log(res);
  });
  */
  
  this._client.rmdir('/foo_dir', function(err, res) {
    console.log('DELETE A DIR!');
    console.log(err);
    console.log(res);
  });
  
  return;
  
  
  
  var self = this
    , client = this._client
    // https://github.com/coreos/etcd/issues/669 Double encode
    , dir = [ this._ns, encodeURIComponent(encodeURIComponent(type)) ].join('/')
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

  client.mkdir(dir, function(err) {
    if (err) {
      if (err.code != 102) {
        return cb(err);
      }
    }

    self._watch(dir);
    self._ls(dir, function(err, children, values) {
      if (err) { return cb(err); }
      
      var records = []
        , crecords = {}
        , idx = 0
        , len, child, segs, data, json;
      
      if (values) {
        console.log('FAST PATH!');
        
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
        console.log('SLOW PATH!');
        
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

          client.get(segs.join('/'), function(err, data) {
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
  });
}

Registry.prototype.services = 
Registry.prototype.types = function(cb) {
  var dir = [ this._ns ].join('/');
  var i = 0;
  this._ls(dir, function (err, res) {
    var types = []
      , point;
    if (err) {
      return cb(err);
    }
    // https://github.com/coreos/etcd/issues/669 Double Decode
    for (var len = res.length; i < len; i++) {
      point = res[i].split('/');
      point = point[point.length - 1];
      types.push(decodeURIComponent(decodeURIComponent(point)));
    }
    return cb(null, types);
  });
}

Registry.prototype._ls = function(path, cb) {
  var client = this._client;
  client.readdir(path, function(err, children, values) {
    if (err) {
      if (err.code == 100) {
        return cb(new NotFoundError(err.message));
      }
      return cb(err);
    }
    
    return cb(null, children, values);
  });
}

// FIXME: Remove domain from this function
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
    
    // IS THIS IT??????
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

module.exports = Registry;

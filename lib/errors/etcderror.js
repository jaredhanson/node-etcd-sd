/**
 * `Etcd` error.
 *
 * @constructor
 * @param {String} [message]
 * @api public
 */
function EtcdError(message, code) {
  Error.call(this);
  Error.captureStackTrace(this, arguments.callee);
  this.name = 'EtcdError';
  this.message = message;
  this.code = code;
}

/**
 * Inherit from `Error`.
 */
EtcdError.prototype.__proto__ = Error.prototype;


/**
 * Expose `Etcd`.
 */
module.exports = Etcd;

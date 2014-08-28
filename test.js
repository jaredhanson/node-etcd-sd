var reg = require('./lib/').Registry;
var logger = console;
var registry = new reg();
var count = 0;
registry.connect();
var uid1 = registry.announce('mr', 'ttl', 'is', function (err, res) {
  var uid2 = registry.announce('mr', 'ttl', 'isnot', function (err, res) {
    registry.resolve('mr', 'ttl', function (err, value) {
      if (err) {
        logger.error(err);
      } else {
        logger.log(value);
      }
      console.log(uid1, uid2);
      registry.unannounce('mr', 'ttl', uid1, function (err, res) {
        if (err) { logger.error(err); }
        registry.resolve('mr', 'ttl', function (err, value) {
          if (err) {
            logger.error(err);
          } else {
            logger.log(value);
          }
        });
      });
    });
  });
});

registry.on('error', function (err) {
  registry.close();
});

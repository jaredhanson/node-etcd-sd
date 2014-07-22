var reg = require('./lib/').Registry;
var logger = console;
var registry = new reg();
registry.connect();
registry.announce('mr', 'ttl', 'is', function (err, res) {
  registry.resolve('mr', 'ttl', function (err, domains) {
    if(err) {
      logger.error(err);
    } else {
      logger.log(domains);
    }
  });
});

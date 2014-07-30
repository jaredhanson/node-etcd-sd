var reg = require('./lib/').Registry;
var logger = console;
var registry = new reg();
var count = 0;
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

registry.on('ttl-refresh', function () {
  count += 1;
  if (count === 1) {
    registry.close();
  }
});

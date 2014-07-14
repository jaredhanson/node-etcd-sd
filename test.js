var reg = require('./lib/').Registry;
var logger = console;
var registry = new reg();
registry.connect();
registry.announce('schopanhauer', 'gosamer', 'scooby-snax', function (err, res) {
  console.log(err, res);
  registry.resolve('schopanhauer', 'gosamer', function (err, domains) {
    if(err) {
      logger.error(err);
    } else {
      logger.log(domains);
    }
  });
});
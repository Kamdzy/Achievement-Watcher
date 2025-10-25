const fs = require('fs');
const fsp = fs.promises;

async function exists(p) {
  try {
    await fsp.access(p);
    return true;
  } catch (e) {
    return false;
  }
}

async function stat(p) {
  return fsp.stat(p);
}

async function readFile(p, encoding = 'utf8') {
  return fsp.readFile(p, encoding);
}

async function writeFile(p, data, encoding = 'utf8') {
  return fsp.writeFile(p, data, encoding);
}

async function existsAndIsOlderOrYoungerThan(p, option = {}) {
  const opts = {
    time: typeof option.time === 'number' && isFinite(option.time) ? option.time : 1,
    timeUnit: typeof option.timeUnit === 'string' && option.timeUnit.length > 0 ? option.timeUnit : 'd',
    younger: !!option.younger,
  };

  let stats;
  try {
    stats = await fsp.stat(p);
  } catch (err) {
    return false;
  }

  const age = Date.now() - stats.mtimeMs;

  function as(unit) {
    switch (unit) {
      case 's':
        return age / 1000;
      case 'm':
        return age / (1000 * 60);
      case 'h':
        return age / (1000 * 60 * 60);
      case 'd':
        return age / (1000 * 60 * 60 * 24);
      case 'w':
        return age / (1000 * 60 * 60 * 24 * 7);
      case 'M':
        return age / 2628000000;
      case 'Y':
        return age / (2628000000 * 12);
      default:
        return age / (1000 * 60 * 60 * 24);
    }
  }

  const timeValue = as(opts.timeUnit);
  return opts.younger ? timeValue <= opts.time : timeValue >= opts.time;
}

async function existsAndIsYoungerThan(p, option = {}) {
  const opts = Object.assign({}, option, { younger: true });
  return existsAndIsOlderOrYoungerThan(p, opts);
}

module.exports = {
  exists,
  stat,
  readFile,
  writeFile,
  existsAndIsOlderOrYoungerThan,
  existsAndIsYoungerThan,
};

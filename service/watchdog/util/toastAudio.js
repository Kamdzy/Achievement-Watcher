'use strict';

const path = require('path');
const { readRegistryString, writeRegistryString } = require('./reg');

module.exports.getDefault = () => {
  const _default_ = 'Windows Unlock.wav';

  try {
    const filepath = readRegistryString('HKCU', 'AppEvents/Schemes/Apps/.Default/WindowsUnlock/.Current', '');

    if (filepath) {
      return path.parse(filepath).base;
    } else {
      return _default_;
    }
  } catch {
    return _default_;
  }
};

module.exports.getCustom = () => {
  try {
    const filepath = readRegistryString('HKCU', 'AppEvents/Schemes/Apps/.Default/Notification.Achievement/.Current', '');

    if (filepath) {
      return filepath;
    } else {
      return '';
    }
  } catch {
    return '';
  }
};

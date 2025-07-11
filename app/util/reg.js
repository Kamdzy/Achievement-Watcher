const { execFile } = require('child_process');
const { HKEY, enumerateKeys, enumerateValues } = require('registry-js');

const HIVE_ALIAS = {
  HKCU: 'HKEY_CURRENT_USER',
  HKLM: 'HKEY_LOCAL_MACHINE',
  HKCR: 'HKEY_CLASSES_ROOT',
  HKU:  'HKEY_USERS',
  HKCC: 'HKEY_CURRENT_CONFIG',
  HKEY_CURRENT_USER: 'HKEY_CURRENT_USER',
  HKEY_LOCAL_MACHINE: 'HKEY_LOCAL_MACHINE',
  HKEY_CLASSES_ROOT: 'HKEY_CLASSES_ROOT',
  HKEY_USERS: 'HKEY_USERS',
  HKEY_CURRENT_CONFIG: 'HKEY_CURRENT_CONFIG'
};

function writeRegistryString(hive, keyPath, valueName, value) {
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        `Set-ItemProperty -Path "${hive}:\\${keyPath.replace(/\//g, '\\')}" -Name "${valueName || '(default)'}" -Value "${value}"`,
      ],
      { windowsHide: true },
      (error) => (error ? reject(error) : resolve())
    );
  });
}

function writeRegistryDword(hive, keyPath, valueName, value) {
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        `Set-ItemProperty -Path "${hive}:\\${keyPath.replace(/\//g, '\\')}" -Name "${valueName}" -Value ${value} -Type DWord`,
      ],
      { windowsHide: true },
      (error) => (error ? reject(error) : resolve())
    );
  });
}

function ListRegistryAllValues(hive, key) {
  const hiveEnum = HKEY[HIVE_ALIAS[hive] || hive];
  if (!hiveEnum) throw new Error(`Unsupported hive: ${hive}`);
  const normalizedKey = key.replace(/\//g, '\\');
  return enumerateValues(hiveEnum, normalizedKey).map((v) => v.name);
}

function listRegistryAllSubkeys(hive, key) {
  const hiveEnum = HKEY[HIVE_ALIAS[hive] || hive];
  if (!hiveEnum) throw new Error(`Unsupported hive: ${hive}`);

  const normalizedKey = key.replace(/\//g, '\\');
  return enumerateKeys(hiveEnum, normalizedKey).map((k) => k.name);
}

function readRegistryInteger(hive, key, valueName) {
  const hiveEnum = HKEY[HIVE_ALIAS[hive] || hive];
  if (!hiveEnum) throw new Error(`Unsupported hive: ${hive}`);
  const normalizedKey = key.replace(/\//g, '\\');
  const values = enumerateValues(hiveEnum, normalizedKey);
  const val = values.find(v => v.name === valueName);
  if (!val || (val.type !== 'REG_DWORD' && val.type !== 'REG_QWORD')) return null;
  return Number(val.data);
}

function readRegistryString(hive, key, valueName) {
  // Normalize hive string to HKEY enum
  const hiveEnum = HKEY[HIVE_ALIAS[hive] || hive];
  if (!hiveEnum) throw new Error(`Unsupported hive: ${hive}`);

  // Normalize key path: replace '/' with '\'
  const normalizedKey = key.replace(/\//g, '\\');

  // If valueName is empty string, use '(default)' for PowerShell convention,
  // but registry-js expects '' for default value (just pass '')
  const values = enumerateValues(hiveEnum, normalizedKey);
  const val = values.find(v => v.name === valueName);
  if (!val || val.type !== 'REG_SZ') return null; // Only accept string values

  return val.data;
}

function readRegistryStringAndExpand(hive, key, valueName) {
  const hiveEnum = HKEY[HIVE_ALIAS[hive] || hive];
  if (!hiveEnum) throw new Error(`Unsupported hive: ${hive}`);
  
  const normalizedKey = key.replace(/\//g, '\\');

  const values = enumerateValues(hiveEnum, normalizedKey);
  const val = values.find(v => v.name === valueName);
  if (!val || (val.type !== 'REG_EXPAND_SZ' && val.type !== 'REG_SZ')) return null;

  // Expand environment variables if REG_EXPAND_SZ, or just return string
  if (val.type === 'REG_EXPAND_SZ') {
    return expandEnvVariables(val.data);
  } else {
    return val.data;
  }
}

function regKeyExists(hive, key) {
  const hiveEnum = HKEY[HIVE_ALIAS[hive] || hive];
  if (!hiveEnum) throw new Error(`Unsupported hive: ${hive}`);

  const parentKey = key.replace(/\//g, '\\');
  try {
    // Attempt to list subkeys (will throw if the key doesn't exist)
    enumerateKeys(hiveEnum, parentKey);
    return true;
  } catch {
    return false;
  }
}

// Helper to expand %VAR% env vars in a string (Windows style)
function expandEnvVariables(str) {
  return str.replace(/%([^%]+)%/g, (_, n) => process.env[n] || `%${n}%`);
}

module.exports = {
  writeRegistryDword,
  writeRegistryString,
  readRegistryString,
  readRegistryStringAndExpand,
  readRegistryInteger,
  listRegistryAllSubkeys,
  ListRegistryAllValues,
  regKeyExists,
};

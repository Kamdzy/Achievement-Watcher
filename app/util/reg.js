const { execFile } = require('child_process');
const { HKEY, enumerateValues, enumerateKeys, setValue, createKey } = require('registry-js');

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
  const hiveEnum = hkeyFromString(hive);
  if (!hiveEnum) throw new Error(`Unsupported hive: ${hive}`);

  const normalizedKey = keyPath.replace(/\//g, '\\');

  // Default value is represented by "" (empty string) not "(default)"
  const name = valueName || '';
  createKey(hiveEnum, normalizedKey);

  const ok = setValue(hiveEnum, normalizedKey, name, 'REG_SZ', String(value));
  if (!ok) throw new Error(`Failed to set registry value ${hive}\\${keyPath}\\${name}`);
}

function writeRegistryDword(hive, keyPath, valueName, value) {
  const hiveEnum = hkeyFromString(hive);
  if (!hiveEnum) throw new Error(`Unsupported hive: ${hive}`);

  const normalizedKey = keyPath.replace(/\//g, '\\');

  const name = valueName || ''; // "" = (Default) value
  createKey(hiveEnum, normalizedKey);

  // REG_DWORD expects a string, even though it’s numeric
  const ok = setValue(hiveEnum, normalizedKey, name, 'REG_DWORD', String(value));
  if (!ok) {
    throw new Error(`Failed to set DWORD value ${hive}\\${keyPath}\\${name} = ${value}`);
  }
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

  if (!val || (val.type !== 'REG_SZ' && val.type !== 'REG_EXPAND_SZ')) return null;
  if (val.type === 'REG_EXPAND_SZ') {
    return val.data.replace(/%([^%]+)%/g, (_, name) => process.env[name] || `%${name}%`);
  }
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

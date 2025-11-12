// Minimal shim for native-reg to avoid MODULE_NOT_FOUND when packaging watchdog.
// This shim provides a tiny, best-effort API using reg.exe and polling where appropriate.
// It does NOT implement full native-reg behaviour; it's intended as a fallback so watchdog can start.

const { execSync, spawn } = require('child_process');
const path = require('path');

function parseRegOutput(output) {
  // naive parser for reg query output to extract value names and types
  const lines = output.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const values = [];
  for (const line of lines) {
    // lines are like: "    ValueName    REG_DWORD    0x1"
    const parts = line.split(/\s{2,}/).map(p => p.trim()).filter(Boolean);
    if (parts.length >= 3) {
      values.push({ name: parts[0], type: parts[1], value: parts[2] });
    }
  }
  return values;
}

module.exports = {
  HKEY: {
    HKEY_CURRENT_USER: 'HKCU',
    HKEY_LOCAL_MACHINE: 'HKLM'
  },
  Access: {
    ALL_ACCESS: 'ALL_ACCESS'
  },
  openKey: function (hive, key, access) {
    const full = `${hive}\\${key}`;
    return full;
  },
  closeKey: function () { /* noop */ },
  subKeys: function (fullKey) {
    try {
      const out = execSync(`reg query "${fullKey}" /s /f "" /k 2>&1`, { encoding: 'utf8' });
      // parse subkeys by collecting lines that look like key paths
      const lines = out.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      const sub = lines.filter(l => l.startsWith(fullKey + '\\')).map(l => l.replace(fullKey + '\\', '').split('\\')[0]);
      return Array.from(new Set(sub));
    } catch (e) {
      return [];
    }
  },
  values: function (fullKey) {
    try {
      const out = execSync(`reg query "${fullKey}" 2>&1`, { encoding: 'utf8' });
      return parseRegOutput(out);
    } catch (e) {
      return [];
    }
  },
  watch: function (fullKey, cb) {
    // fallback: poll every 2s and call cb on change. Returns a simple interval id (number)
    let last = execSync(`reg query "${fullKey}" 2>&1`, { encoding: 'utf8' });
    const id = setInterval(() => {
      try {
        const now = execSync(`reg query "${fullKey}" 2>&1`, { encoding: 'utf8' });
        if (now !== last) {
          last = now;
          cb({});
        }
      } catch (e) {
        // ignore
      }
    }, 2000);
    return id;
  }
};

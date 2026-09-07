const { execFile } = require('child_process');

function safeExecFile(...args) {
  try {
    const child = execFile(...args);
    if (child && typeof child.on === 'function') {
      child.on('error', () => {});
    }
  } catch {
    // swallow
  }
}

function play() {
  try {
    if (process.platform === 'win32') {
      safeExecFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '[System.Media.SystemSounds]::Asterisk.Play()'], { windowsHide: true }, () => {});
    } else if (process.platform === 'darwin') {
      safeExecFile('afplay', ['/System/Library/Sounds/Glass.aiff'], () => {});
    } else {
      safeExecFile('paplay', ['/usr/share/sounds/freedesktop/stereo/complete.oga'], (err) => {
        if (err) process.stderr.write('\x07');
      });
    }
  } catch {
    // swallow
  }
}

module.exports = { play };

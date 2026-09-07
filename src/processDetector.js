const cp = require('child_process');

// Best-effort detection of a Claude Code process already running under a terminal's shell,
// used for sessions that started before the extension activated (so their shell-execution
// stream was never attached) and therefore can't be identified any other way.
async function terminalLooksLikeClaude(terminal) {
  try {
    const pid = await terminal.processId;
    if (!pid) return false;

    if (process.platform !== 'win32') {
      return await new Promise(resolve => {
        cp.exec('ps -eo pid=,ppid=,command=', (err, stdout) => {
          if (err) return resolve(false);
          const rows = stdout.split('\n').map(x => x.trim()).filter(Boolean);
          const children = new Map();
          for (const row of rows) {
            const m = row.match(/^(\d+)\s+(\d+)\s+(.*)$/);
            if (!m) continue;
            const [, p, pp, cmd] = m;
            if (!children.has(Number(pp))) children.set(Number(pp), []);
            children.get(Number(pp)).push({ pid: Number(p), cmd });
          }
          const q = [Number(pid)];
          const seen = new Set(q);
          while (q.length) {
            const parent = q.shift();
            for (const child of children.get(parent) || []) {
              if (/\bclaude(?:\.js|\.mjs)?\b|claude-code/i.test(child.cmd)) return resolve(true);
              if (!seen.has(child.pid)) { seen.add(child.pid); q.push(child.pid); }
            }
          }
          resolve(false);
        });
      });
    }

    return await new Promise(resolve => {
      const ps = `
        $all = Get-CimInstance Win32_Process;
        $root = ${Number(pid)};
        $queue = New-Object System.Collections.Queue;
        $queue.Enqueue($root);
        $seen = New-Object 'System.Collections.Generic.HashSet[int]';
        [void]$seen.Add($root);
        while ($queue.Count -gt 0) {
          $p = $queue.Dequeue();
          foreach ($c in $all | Where-Object { $_.ParentProcessId -eq $p }) {
            if (($c.Name -match 'claude') -or ($c.CommandLine -match 'claude')) { 'CLAUDE_FOUND'; exit 0 }
            if ($seen.Add([int]$c.ProcessId)) { $queue.Enqueue([int]$c.ProcessId) }
          }
        }
        exit 1
      `;
      cp.execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true }, (err, stdout) => resolve(!err && stdout.includes('CLAUDE_FOUND')));
    });
  } catch {
    return false;
  }
}

module.exports = { terminalLooksLikeClaude };

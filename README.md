# Claude Auto Continue

VS Code extension that automatically continues Claude Code sessions.

## Features

- **Auto-detect is the default**: watches Claude Code terminal output for usage-limit messages and continues automatically once the detected reset time passes (`claudeAutoContinue.detectLimits`, on by default).
- Optional daily scheduled continuation at a fixed `HH:mm`, independent of limit detection — off by default, enable with `claudeAutoContinue.scheduledContinueEnabled`.
- Finds Claude Code sessions in VS Code integrated terminals.
- Sends a configurable autonomous continuation message without asking for user input.
- Reads Claude terminal output through VS Code Terminal Shell Integration.
- Detects usage/rate-limit messages, including the real Claude Code CLI formats:
  `Claude AI usage limit reached|<unix-timestamp>`, `...please try again after 7pm`, and
  `Usage limit reached · continuing automatically at 7:00pm`.
- Parses reset times such as `resets at 21:47`, `try again at 21:47`, bare `7pm` (no minutes), and `try again in 30 minutes`.
- Schedules per-terminal automatic continuation after reset.
- Retries when a reset time cannot be parsed.
- Status-bar indicator and status command, with a hover tooltip showing active/limited/paused counts, the next scheduled action, and recent activity.
- Existing Claude sessions can still be found for scheduled/manual continuation using process-tree detection.
- Optional notifications when a usage-limit is detected and when a continuation message is sent (`claudeAutoContinue.notifyOnLimitDetected`, `claudeAutoContinue.notifyOnSend`).
- Optional sound on send when a continuation message is sent (`claudeAutoContinue.soundOnSend`, off by default).
- Manual `Claude Auto Continue: Set Reset Time…` command to tell the extension when a limit resets when auto-detection misses it (see "Important limitation" below).
- Named message profiles (`claudeAutoContinue.messageProfiles`) selectable per-session via `Claude Auto Continue: Select Message Profile…`.
- Per-terminal pause with `Claude Auto Continue: Toggle Pause for Terminal…`, so a session can be excluded from auto-continuation without disabling the extension.
- Multi-time daily scheduling (`claudeAutoContinue.scheduledTimes`) in addition to the legacy single `scheduledTime`.
- Retry backoff with a configurable cap (`claudeAutoContinue.retryBackoff`, `claudeAutoContinue.retryMaxSeconds`) and a configurable retry limit (`claudeAutoContinue.maxRetries`).
- `Claude Auto Continue: Show Recent Activity` command to review recent detections, sends, retries, and pause/resume events.

## Important limitation

VS Code exposes terminal output as a stream only when the extension attaches to the shell execution when it starts. Therefore, automatic **limit detection** is most reliable for Claude sessions started/restarted after this extension is loaded. Scheduled/manual discovery can still find already-running Claude sessions by process tree, but VS Code does not provide a retroactive terminal-output stream for an execution that started before the extension attached.

VS Code's terminal shell integration must be enabled. On Windows, VS Code supports shell integration for PowerShell and Git Bash. See the official VS Code documentation.

When auto-detection misses a session (the scenario above), run `Claude Auto Continue: Set Reset Time…` to manually tell the extension when that session's limit resets.

## Multiple VS Code windows

Each regular VS Code window runs its own copy of this extension and only sees its own terminals, so every window with a Claude Code session should be handled independently once the extension is actually running in it. If a session in one window isn't getting the continuation message while another is:

- Make sure the extension is **installed** (`code --install-extension ...vsix`) rather than only running via `F5` (Extension Development Host), which launches a single dedicated window and does not attach to your other, regular windows.
- Confirm `claudeAutoContinue.enabled` and `claudeAutoContinue.detectLimits` are on in that window (Settings can be scoped per-workspace, which can leave one window disabled).
- Run `Claude Auto Continue: Show Status` in the affected window to see whether it detects the terminal as a Claude session at all.

## Install from source

1. Open this folder in VS Code.
2. Run `npm install` if you add dependencies (this extension currently has none).
3. Press `F5` to launch an Extension Development Host.
4. In the new VS Code window, start Claude Code in an integrated terminal.
5. Configure the extension in Settings.

## Package as VSIX

Install the VS Code packaging tool:

```powershell
npm install -g @vscode/vsce
```

Then from this folder:

```powershell
vsce package
code --install-extension .\claude-auto-continue-1.0.0.vsix
```

## Recommended settings

```json
{
  "claudeAutoContinue.enabled": true,
  "claudeAutoContinue.scheduledTime": "19:30",
  "claudeAutoContinue.message": "Continue working on the current task. Do not ask me for confirmation, clarification, or additional user input. You have permission to continue autonomously. Review the current state and proceed with the remaining work.",
  "claudeAutoContinue.detectLimits": true,
  "claudeAutoContinue.resetGraceSeconds": 15,
  "claudeAutoContinue.retrySeconds": 30
}
```

## New settings (v1.1.0)

| Setting | Type | Default | Description |
|---|---|---|---|
| `claudeAutoContinue.notifyOnLimitDetected` | boolean | `true` | Notify when a usage-limit is detected. |
| `claudeAutoContinue.notifyOnSend` | boolean | `true` | Notify when a continuation message is sent. |
| `claudeAutoContinue.soundOnSend` | boolean | `false` | Play a sound when a continuation message is sent. |
| `claudeAutoContinue.messageProfiles` | object | `{}` | Name-to-message map, selectable via `Select Message Profile…`. |
| `claudeAutoContinue.messageProfile` | string | `""` | Default profile name to use from `messageProfiles`. |
| `claudeAutoContinue.scheduledTimes` | array | `[]` | List of daily `HH:mm` times; empty falls back to `scheduledTime`. |
| `claudeAutoContinue.maxRetries` | number | `10` | Maximum retries when a message cannot be sent. |
| `claudeAutoContinue.retryBackoff` | boolean | `true` | Increase the delay between retries, up to `retryMaxSeconds`. |
| `claudeAutoContinue.retryMaxSeconds` | number | `600` | Maximum retry interval in seconds when `retryBackoff` is on. |
| `claudeAutoContinue.historyLimit` | number | `200` | Maximum number of recent activity entries kept. |

## Commands

- `Claude Auto Continue: Continue All Sessions Now`
- `Claude Auto Continue: Show Status`
- `Claude Auto Continue: Toggle`
- `Claude Auto Continue: Set Reset Time…`
- `Claude Auto Continue: Toggle Pause for Terminal…`
- `Claude Auto Continue: Select Message Profile…`
- `Claude Auto Continue: Show Recent Activity`

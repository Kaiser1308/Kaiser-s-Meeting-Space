import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const SUPPORTED_PROFILES = new Set(['physical-recording', 'simulator-full', 'physical-full']);
const SUPPORTED_DURATIONS = new Set(['5m', '1h', '3h', '4h']);

export function parseWindowsTestCliArgs(args) {
  if (!Array.isArray(args)) throw new Error('windows_test_args_required');
  let profile;
  let duration;
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag !== '--profile' && flag !== '--duration') throw new Error('windows_test_unknown_argument');
    const value = args[index + 1];
    if (typeof value !== 'string' || value.startsWith('--')) throw new Error('windows_test_argument_value_required');
    if (flag === '--profile') {
      if (profile !== undefined || !SUPPORTED_PROFILES.has(value)) throw new Error('unsupported_windows_test_profile');
      profile = value;
    } else {
      if (duration !== undefined || !SUPPORTED_DURATIONS.has(value)) throw new Error('unsupported_windows_test_duration');
      duration = value;
    }
    index += 1;
  }
  if (!profile || !duration) throw new Error('windows_test_profile_and_duration_required');
  return { profile, duration };
}

export function buildWindowsTestEnvironment(selection, env = process.env) {
  return {
    ...env,
    KMS_WINDOWS_TEST_PROFILE: selection.profile,
    KMS_WINDOWS_TEST_DURATION: selection.duration,
  };
}

export function buildWindowsTestCommand(platform = process.platform) {
  const vitestArgs = ['exec', 'vitest', 'run', 'src/main/windows-audio-pipeline.test.ts', '--reporter=verbose'];
  if (platform === 'win32') {
    return {
      command: process.env.ComSpec ?? 'cmd.exe',
      args: ['/d', '/s', '/c', `pnpm.cmd ${vitestArgs.join(' ')}`],
    };
  }
  return {
    command: 'pnpm',
    args: vitestArgs,
  };
}

export async function runWindowsTestCli(args = process.argv.slice(2), options = {}) {
  const selection = parseWindowsTestCliArgs(args);
  const { command, args: commandArgs } = buildWindowsTestCommand(options.platform ?? process.platform);
  const cwd = options.cwd ?? resolve(dirname(fileURLToPath(import.meta.url)), '../../apps/desktop');
  const child = spawn(command, commandArgs, {
    cwd,
    env: buildWindowsTestEnvironment(selection, options.env ?? process.env),
    stdio: 'inherit',
    windowsHide: true,
  });
  return await new Promise((resolvePromise, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (signal) reject(new Error(`windows_test_child_signal:${signal}`));
      else resolvePromise(code ?? 1);
    });
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const exitCode = await runWindowsTestCli();
    process.exitCode = exitCode;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : 'windows_test_cli_failed'}\n`);
    process.exitCode = 2;
  }
}

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const key = process.env.DEEPGRAM_API_KEY;
const audioPath = process.env.P13_DEEPGRAM_AUDIO;
const language = process.env.P13_DEEPGRAM_LANGUAGE === 'vi' ? 'vi' : 'en';
const exposedKeyFingerprint = 'a6470abdff6e6229c48ace30563a2b895c027853fc0b2ac4526d58fe8b111841';

function fail(code) {
  console.error(
    JSON.stringify({ version: 'p13-deepgram-live-v1', pass: false, blocked: true, code }),
  );
  process.exitCode = 2;
}

if (!key) {
  fail('missing_rotated_server_key');
} else if (createHash('sha256').update(key, 'utf8').digest('hex') === exposedKeyFingerprint) {
  fail('exposed_key_refused');
} else if (!audioPath) {
  fail('missing_qualified_audio');
} else {
  try {
    const audio = await readFile(audioPath);
    const query = new URLSearchParams({
      model: 'nova-3',
      language,
      encoding: 'linear16',
      sample_rate: '16000',
      channels: '1',
      interim_results: 'false',
      smart_format: 'true',
      diarize: 'true',
    });
    const socket = new WebSocket(`wss://api.deepgram.com/v1/listen?${query}`, ['token', key]);
    let finalResults = 0;
    let providerErrors = 0;
    let opened = false;
    const done = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('timeout')), 30_000);
      socket.addEventListener('open', () => {
        opened = true;
        socket.send(audio);
        socket.send(JSON.stringify({ type: 'Finalize' }));
        socket.close();
      });
      socket.addEventListener('message', (event) => {
        try {
          const payload = JSON.parse(String(event.data));
          if (payload.type === 'Error') providerErrors += 1;
          if (payload.type === 'Results' && payload.is_final === true) finalResults += 1;
        } catch {
          providerErrors += 1;
        }
      });
      socket.addEventListener('close', () => {
        clearTimeout(timeout);
        resolve();
      });
      socket.addEventListener('error', () => {
        clearTimeout(timeout);
        reject(new Error('provider_socket_error'));
      });
    });
    await done;
    console.log(
      JSON.stringify({
        version: 'p13-deepgram-live-v1',
        pass: opened && providerErrors === 0 && finalResults > 0,
        blocked: false,
        language,
        finalResults,
        providerErrors,
      }),
    );
  } catch {
    fail('provider_live_failure');
  }
}

const crypto = require('crypto');

async function generateRSAKey() {
  const { privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return privateKey;
}

async function createDeterministicKeys() {
  console.log('Generating deterministic RSA keys...');

  const currentPrivateKey = await generateRSAKey();
  const previousPrivateKey = await generateRSAKey();
  const nextPrivateKey = await generateRSAKey();

  console.log('Current Key:');
  console.log(currentPrivateKey);
  console.log('');
  console.log('Previous Key:');
  console.log(previousPrivateKey);
  console.log('');
  console.log('Next Key:');
  console.log(nextPrivateKey);
}

createDeterministicKeys().catch(console.error);

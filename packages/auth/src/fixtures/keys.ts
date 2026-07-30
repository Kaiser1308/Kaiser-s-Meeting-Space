import { importJWK, type CryptoKey, type KeyObject } from 'jose';

type KeyLike = CryptoKey | KeyObject | Uint8Array;

export interface KeyPair {
  kid: string;
  kty: string;
  use: string;
  alg: string;
  n: string;
  e: string;
  d?: string;
  p?: string;
  q?: string;
  dp?: string;
  dq?: string;
  qi?: string;
  privateKey: KeyLike;
  publicKey: KeyLike;
}

const CURRENT_KEY_SEED = 1;
const PREVIOUS_KEY_SEED = 2;
const NEXT_KEY_SEED = 3;

let keyCache: Map<number, KeyPair> | null = null;
let keyCacheInitPromise: Promise<void> | null = null;

// ── Fixed RSA 2048-bit JWK key material (generated once, deterministic across processes) ──

const FIXED_JWK_1 = {
  kty: 'RSA' as const,
  n: '24DAF1OWJKTbV_PhiH7BMkswCa6YpFPHk9JsAulRttioPkiDBXzsgY6BJGXX4eQExtPtx_e58FpmhEl-c0l7DTaMfvvVq01ffhKKQr5R2Mw-yN0I5920XLC9MlTh5BiuU3nf28PyDqzpzwAqBv9P3_TjSpjZVTXBLVgodTgM1WqGZsHJm2V0o-9GBqATNH8TXPHahfYNMyyV17lMHhg9JhKiPq7mdVhbWE1ShEpi_JWjaDhLWrh2z6XE_61Xk_ZWFSMh593G91MVYRFJKXKIJru_rtwvlubWcdJSaFW0HC5924RaZ9DdgQ4dE6Mghj_POKQfRYjtehXVxUv8muM_TQ',
  e: 'AQAB',
  d: 'DYtoTwgtX518m3TFGfMYYM4a7L4FVT6GNizp1VQoYqwD1bQLwa7vuR7eASz3oUy8rrgtGAXFR3uMj-UpFFwYZ7xR9xP7H1Lq7ZCfT3cG_eW8ihB5mDUqB_4v7ocmWTjcqPIASkNREG7DDq7n6P6gIyWtUNEVuBhVD0M9W95VjGWlDn8o6paAoFHq4vV7m8B6UlXEggsoZj8Hj-Fe0tvinNyeFyHyU0Xw4r7VwERmBzPrpqRcdhCBWWUh6itUcqeYeRJ6eZTXwNGOPhyymP4Ve5DYNEtO-GeNXgr_hNx-LserzYWkuzLN247gwWsNAwlFESDYXMOvhMGR94ZQO_aQgQ',
  p: '-9EYdmmtKHfwheitTr3seKEPnFNKeV1-N3CD1uqzNFAwwwlQ3o2eNmhyJVjP7-qd76FhVyrXnR8oVC6eZCNtfeZJ7JkZY0ewdSRxUMHemiYdDAY8hpYZLMExZxvG_047Zg_j5uHc8cBPh1CEMp5PK35GVRFYhln0dc_wwn3D1LU',
  q: '3yY7uF6TYMG8ti-mYyaNJ9mBFO-W6ZXoPY3kQglxWU95XE_z13bGy4I7XdgI3TE-KyG-MhIw5z4iEusPi373DE2Nx2ijYxMQ1W7UFm4eSAraumxjseJCB4gXUyA-f2wXZHGk3dHyVbNHDD92InFKhjQKpB6prLtIMpBOVAz-Nzk',
  dp: '0nA68Tn-6wLQjheUPWmaZHS0hv9UDXiEMfBlPQWGHQGmvlbariHLRcyjF3LQ0r5OniNPJXk4FqYjHbaXxzeUGNKKlJ6dCMqwPDToPYTGcivHunS7v_1PrIcGshQUiObn3LMK0beO3LjJvVscHvENWFt-izijsiMamBneKarQLME',
  dq: 'f5ADo6ms5iraDeu_Wf63wof72lP8GRuw3z81tOpg-YUNA1BRPGKR0dRoy4SrzIZR26Y2a7kqa4aBQ_9Lq5qw7z-GRO_0Nra3cMsiQpBAjz5lOxyrAQ0uYc_SRZqxH3ZTCQBOFt_lgEgz3TSJ-7Z3u7AURS2iITQOWZlUrYef60E',
  qi: 'NrEOolxOOUpyZJTol8gana7wPfXRnRZxBVl5TKAIFTuvtAd_K33grFLirgqZJDzMFxc2bElYnidQwPdPxIqwTjINRCf0m8T0imeZHovXcTfZxQPCc5QQxZ7tF4YDyPfPzh1UCOSgwc_RUWzVeAliFHbFrARCwlMfu_jOU_0GNDw',
};

const FIXED_JWK_2 = {
  kty: 'RSA' as const,
  n: 'sUSNHO66cNaQ-qPbp-cOPXhTmT--HAvjkSsztqdg447uyh1ZJn8j7HoN1wQN2xMXAlELuzRzip0t47T25ESG4aYTvhQ_bQ8-RQbqmRh_vip5bP45xH0IDMZBRmFXLjH1AaEjbVIpgNdZuwOaak6hqrdrcycTeVpj_80Jxj9opdTWaE32Ow2o62cqEgKk7YJ05PQUcnmv8xT0g5p5YpV5HgNksyI239bl1xzozW4_ZLnjcQwA0THRD6zoPeCU1YAt-4g1diBfWXmxd4-b2R_qRJmr1JmG7ZGw03F1v3N6aAjW82ka-ct_0ayyPe1eKltbGHxBWhCi_jCHMwBh32z1qw',
  e: 'AQAB',
  d: 'HxvFm9c1NsogxStuR8ffkuAD47fw9-EKPZaUS7CR6z1RIH0IAR58wmok9Z_Lgq-V8R0h7udkg2XUAMroLOTturm3azsIam4rYle1YcqP2GKBzqPKpXW_rOY53E0GzJ-NvIx3uB6cE_U21P_r4E4ORvRLUfkAjOJU_DYSSg0koz0s4boVaSzBsHxci-CZjkoZhDclOgHkHIhbrqKFUv267xc5Xqqj_OVnsvOjVxh_1zntLKf306Mzipa4hVFTTjHIaRSh9DzM49-6VgTUctfBUyuFx5yU_-dbXnu8N7HCiCzI2Pr8SOT1U4RBXgdLr4BPNotPsyPBdnAFIGsaMjd0UQ',
  p: '1tuBIg3kXv23WvhCi1P6M0-wWRUb6TX46RScYJc2bA-e6x6Ar8RnFPRQP9-inhKfsh2L7CvejWpbh3MtL23_-cRLcZBbmuKQAi6gPg9gqPGbRHjtWlBoVR_3eiD57guA556Phk566E2M-FAlLWtja3T4kHD28T6l5sa3yuf4apM',
  q: '0zZek8aLOypXWeybI_mQoT61BSCeevtskpy665jubCZ-0bp4joebQI0Soq4YC-cQdOQuIn_oSKig7diG6K0JJlRIyMZu-onogBRPq5zS81pSAmks-R5BZEvs9Pnv8ELQnBxLLzc08PyIJUFOFZKEfEBtoISXVSWQ0wewucAPf4k',
  dp: 'l5tjz0fGMVEOJF6xdebX0YUVhoZin3i6Hp2wimeouy96j6WCYIRRyHNsfOWstaWmkeRPa2K5M0gtNbKL27_es7tTENswCGZ9_0wvPhtTtWJmkTZTJTs_o3FfCwph0RrE5qr302llSK4QHtdOpHH2QUjUa_eKCEiQf_sQjViJ7Yk',
  dq: 'SMVOyLN7fSMVfZIb0cVGo4erbtzSPaUqv0jozgue-fw5baFFsDXgs9jnNs2s000FSoDjtFdFfOM8rzYPJVOY92_KtAJKcl_Zj2dwG7yoodfYsaPzLtHRzfCq76y9kpYysda9wMLQpscbUVqywJP-uaCpJMkKKvgKcesQZK9bp6E',
  qi: 'wnFGKNl88z4kwFDKdT4vOwnh_MGTq6Pkww_W6G2lEg50mCxItZNLLrZK3Pz8JPD41IoxKnv4zK_URbT_YKGE46yjG4bnkSNeGqoqJhEQIiOKhu7kBc9tmrzT83zz8JmrIjF_Vdw6_rKd15O0ER5eQQFDIztDmUOu2LzGpDQhZxA',
};

const FIXED_JWK_3 = {
  kty: 'RSA' as const,
  n: 'l7p2B3CoeUfsJlhfIKsH0l_c5TOh57POFqCw3zlIuTPCEtcYHxMCXrFlA79of-cOfYmd5fp0DzpXlhAv4yQ5sMas3m53_4kYsCMHMkA2Oke_ZEuGjm0KYBfwIlkWbrQdtUYFZDKiSqtPOJOavYIIshJdGizhhN9lkvppsF_4BXEb3YTHK9GsKYnBw90BbEmjiAvd6dQRkg0x4uilVS3zyZbs3wqTHJXSKDIEN1FxzPi7rEqYGfVEIqJ0P5cLYi66i169FNxXPxmTMaK4kGBnxLl7Ca8q2MoLQS1czmd4OXJxR6s2v0fxgWcphl3W8af5Ea_P6Y--aB4Qr4stDaFdAQ',
  e: 'AQAB',
  d: 'LL9RD-CpzxrnCmgFphzKscCT5QTVOwBMR2AcybibOgOJuQS2mHOCv2qR4AkTSKVcIKn1Z1313IfYTOl5NgP4_6mYUgFCYpqMLWYnOSq203lVeL7NcDO4W56zs22SsBNur4d3D5XfRyY-tvDRMhKnfdzsmEukNwuraS1w_hNPkkrU6vFqsj0t4ut7S6axSgspcXGkmCAwtsqEM43ViRfe_5WuliaP2fHjl8y64j1wnBQuLduaQjDhpmh0-CyOx4-muzj3hdkmVEler90e-w_e-FtCmJ4JBaiyp7lPvv7KcvUUlubGf6GQcnl1omGm0T6cqMePCY9wrl8x8_RvASnH',
  p: '0q4SxQxHew2m4DZd34NcwL1Qzn_RxJPeC9iV3TUDRH1W4RERZJAoFW4fMJ5v4O0ttTICwdoaVGlDdoyqJfJrzDt08iyXlOuta2LaFOlOh1PD9jOw5wQUFF1lRyUcejDePCZULGBLOQCzWswobVUtRnc35LCmtMLUbRKkoZZmoCM',
  q: 'uF375NRqZu94hUXXVPkUC4aOsFgk8EqJ6rpnAXbgZ8gpZRQNBdpkcgCjiGEJKEVzlAN5vh6l58lX2ND_dAEo4yX0_O-tSVprevhgLYEmuVbB4IvQC2k-iwRCQ4m8dOXUiAtclbrambiEp12AvAKNlhuvIGZIDem9V-pg_uNnjos',
  dp: 'MuKSa_90QFdix-K5t6ONwou3ObkLnFQunGPahowoVuGDG2c48TYUSGDJrb-GvCftE0eZ_OJF27906Ow-qF2uBa0SqO92SSTHRRmiHMzhB7SGry96-cE1bFnGfXGMOEMXWiXTzMgRQxpVN4f597ZL8ioXWOgFy8EG97U6CEFAVks',
  dq: 'l1RFaulTwNP05-eQvOWJp4A15Nck0rtMAwgnflM2FNl96MKRgelloxGVKV8EpjKDkM1dg0kiwmNIoOXDmFNPXUsNkQOmB9yY9iGiyBcHUv-8OXRpOsSTGoZPYaJPtt_jGBvDTf9GaQDEmZ-tCCVMVBa7I2vw3sKpsNzn6q97k8s',
  qi: 'eMLN8PfQtbzmFfLm6JpX_YStHUN39dZN4C-10aTa2FFxh0L9dlYmn_049M2xeE_H97YNL5IL-zM3IZa6p4hZA91Drp0uhfHqT1TP6HpKpGeqklQSfRuUvlljeEftL4M931oZLJF1_mfMsglHoZnHV_q-26V_wFD0VkcKGzwSMV4',
};

const FIXED_KEYS = [FIXED_JWK_1, FIXED_JWK_2, FIXED_JWK_3];

// ── Key cache initialization using fixed JWK material ──

async function initializeKeyCache(): Promise<void> {
  if (keyCache) return;
  if (keyCacheInitPromise) {
    await keyCacheInitPromise;
    return;
  }
  keyCacheInitPromise = (async () => {
    const freshCache = new Map<number, KeyPair>();
    freshCache.set(
      CURRENT_KEY_SEED,
      await importFixedKeyPair('test-issuer-synthetic-current-key-1', 0),
    );
    freshCache.set(
      PREVIOUS_KEY_SEED,
      await importFixedKeyPair('test-issuer-synthetic-previous-key-2', 1),
    );
    freshCache.set(NEXT_KEY_SEED, await importFixedKeyPair('test-issuer-synthetic-next-key-3', 2));
    keyCache = freshCache;
  })();
  await keyCacheInitPromise;
}

async function importFixedKeyPair(kid: string, index: number): Promise<KeyPair> {
  const jwk = FIXED_KEYS[index % FIXED_KEYS.length]!;

  // Public JWK: only kty, n, e (no private components)
  const publicJwk = { kty: jwk.kty, n: jwk.n, e: jwk.e, kid, alg: 'RS256' };
  // Private JWK: full key material
  const privateJwk = { ...jwk, kid, alg: 'RS256' };

  const importedPublicKey = await importJWK(publicJwk, 'RS256');
  const importedPrivateKey = await importJWK(privateJwk, 'RS256');

  return {
    kid,
    kty: 'RSA',
    use: 'sig',
    alg: 'RS256',
    n: jwk.n,
    e: jwk.e,
    d: jwk.d,
    p: jwk.p,
    q: jwk.q,
    dp: jwk.dp,
    dq: jwk.dq,
    qi: jwk.qi,
    privateKey: importedPrivateKey,
    publicKey: importedPublicKey,
  };
}

// ── Public API ──

export async function generateSyntheticKey(seed: number): Promise<KeyPair> {
  await initializeKeyCache();
  const baseKey = keyCache!.get(
    seed % 3 === 0 ? CURRENT_KEY_SEED : seed % 3 === 1 ? PREVIOUS_KEY_SEED : NEXT_KEY_SEED,
  )!;
  return {
    ...baseKey,
    kid: `test-issuer-synthetic-key-${seed}`,
  };
}

export async function getCurrentKey(): Promise<KeyPair> {
  await initializeKeyCache();
  return keyCache!.get(CURRENT_KEY_SEED)!;
}

export async function getPreviousKey(): Promise<KeyPair> {
  await initializeKeyCache();
  return keyCache!.get(PREVIOUS_KEY_SEED)!;
}

export async function getNextKey(): Promise<KeyPair> {
  await initializeKeyCache();
  return keyCache!.get(NEXT_KEY_SEED)!;
}

export async function getAllKeys(): Promise<KeyPair[]> {
  await initializeKeyCache();
  return [
    keyCache!.get(CURRENT_KEY_SEED)!,
    keyCache!.get(PREVIOUS_KEY_SEED)!,
    keyCache!.get(NEXT_KEY_SEED)!,
  ];
}

export async function generateRotatedKey(rotation: number): Promise<KeyPair> {
  return importFixedKeyPair(
    `test-issuer-synthetic-rotated-key-${rotation}`,
    rotation % FIXED_KEYS.length,
  );
}

// ── Public surface for cross-process determinism verification ──

/** Fixed JWK n-values (public key modulus) for snapshot verification across processes. */
export const FIXED_JWK_FINGERPRINTS = FIXED_KEYS.map((jwk) => ({
  n: jwk.n,
  e: jwk.e,
}));

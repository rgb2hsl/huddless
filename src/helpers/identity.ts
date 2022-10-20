async function identity(key: CryptoKey | JsonWebKey): Promise<string> {
  if ((key as JsonWebKey).x && (key as JsonWebKey).y) {
    return `${(key as JsonWebKey).x}-${(key as JsonWebKey).y}`;
  } else {
    const jwk = await crypto.subtle.exportKey("jwk", key as CryptoKey);
    return `${(jwk as JsonWebKey).x}-${(jwk as JsonWebKey).y}`;
  }
}

export default identity;

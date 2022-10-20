export const verify = async (
  data: string,
  signature: number[],
  publicKey: JsonWebKey
): Promise<boolean> => {
  const encoder = new TextEncoder();

  const result = await crypto.subtle.verify(
    {
      name: "ECDSA",
      hash: "SHA-256",
    },
    await crypto.subtle.importKey(
      "jwk",
      publicKey,
      {
        name: "ECDSA",
        namedCurve: "P-256",
      },
      true,
      ["verify"]
    ),
    new Uint8Array(signature),
    encoder.encode(data)
  );

  return result;
};

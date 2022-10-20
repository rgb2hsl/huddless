import * as yup from "yup";

export interface PostBody {
  type: "HANDSHAKE" | "MESSAGE" | "PERSON";
  body: string;
  signature: number[];
  publicKey: JsonWebKey;
}

export type PostBodyUnsigned = Omit<PostBody, "signature">;

const crypto = "Cryptography error";

export const PostBodySchema = yup.object().shape({
  type: yup
    .string()
    .required("Payload type not presented")
    .matches(/(HANDSHAKE|MESSAGE|PERSON)/),
  body: yup.string().required("No massage provided"),
  signature: yup.array().of(yup.number()).required("No signature provided"),
  publicKey: yup.object().shape({
    crv: yup
      .string()
      .required(crypto)
      .matches(/(P-256)/, crypto),
    ext: yup.boolean().required(crypto),
    key_ops: yup
      .array()
      .of(yup.string().matches(/(verify)/, crypto))
      .length(1, crypto),
    kty: yup.string().required(crypto).matches(/(EC)/, crypto),
    x: yup.string().required(crypto).length(43, crypto),
    y: yup.string().required(crypto).length(43, crypto),
  }),
});

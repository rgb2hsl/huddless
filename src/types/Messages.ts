import {
  Message,
  MessageSchema,
  Person,
  PersonPartialSchema,
  SystemMessage,
  SystemMessageSchema,
} from "./HubState";
import * as yup from "yup";

export type Payload = MessagePayload | PersonsPayload | SystemMessagePayload;

export const PayloadSchema = yup.object().shape({
  type: yup
    .string()
    .required()
    .matches(/^(MESSAGE|PERSONS|SYSTEM_MESSAGE)$/),
  body: yup.object().required(),
});

export interface MessagePayload {
  type: "MESSAGE";
  body: Message;
}

export const MessagePayloadSchema = yup.object().shape({
  type: yup
    .string()
    .required()
    .matches(/^(MESSAGE)$/),
  body: MessageSchema,
});

export interface PersonsPayload {
  type: "PERSONS";
  body: Person[];
}

export const PersonPayloadSchema = yup.object().shape({
  type: yup
    .string()
    .required()
    .matches(/^(PERSONS)$/),
  body: yup.array().of(PersonPartialSchema),
});

export interface SystemMessagePayload {
  type: "SYSTEM_MESSAGE";
  body: SystemMessage;
}

export const SystemMessagePayloadSchema = yup.object().shape({
  type: yup
    .string()
    .required()
    .matches(/^(SYSTEM_MESSAGE)$/),
  body: SystemMessageSchema,
});

import * as yup from "yup";

export interface Person {
  identity: string;
  title: string;
}

export const PersonPartialSchema = yup.object().shape({
  identity: yup.string().required(),
  title: yup.string(),
});

export interface Message {
  identity: string;
  body: string;
  date: Date;
}

export const MessageSchema = yup.object().shape({
  identity: yup.string().required(),
  body: yup.string().required(),
  date: yup.date().required(),
});

export interface SystemMessage {
  body: string;
  date: Date;
}

export const SystemMessageSchema = yup.object().shape({
  body: yup.string().required(),
  date: yup.date().required(),
});

export interface HubState {
  persons: Person[];
  messages: Message[];
}

export const HubStateSchema = yup.object().shape({
  persons: yup.array().of(PersonPartialSchema).required(),
  messages: yup.array().of(MessageSchema).required(),
});

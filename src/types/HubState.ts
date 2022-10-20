import * as yup from "yup";

export interface Person {
  identity: string;
  title: string;
}

export const PersonSchema = yup.object().shape({
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

export interface HubState {
  persons: Person[];
  messages: Message[];
}

export const HubStateSchema = yup.object().shape({
  persons: yup.array().of(PersonSchema).required(),
  messages: yup.array().of(MessageSchema).required(),
});

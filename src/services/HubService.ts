import { HubState } from "../types/HubState";
import { Env } from "../index";

export class HubService {
  constructor(private readonly env: Env) {}

  async getState(): Promise<HubState> {
    let state: HubState;

    const stateJson = await this.env.HUDDLESS.get("state");

    if (stateJson != null) {
      state = JSON.parse(stateJson);
    } else {
      state = {
        persons: [],
        messages: [],
      };
    }

    return state;
  }

  async saveState(state: HubState): Promise<void> {
    const jsonState = JSON.stringify(state);
    await this.env.HUDDLESS.put("state", jsonState);
  }
}

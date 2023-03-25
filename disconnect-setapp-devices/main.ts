import { assert } from "https://deno.land/std@0.173.0/testing/asserts.ts";
import clipboard from "https://deno.land/x/clipboard@v0.0.2/mod.ts";

/**
 * This script disconnects all logged devices, which are helpful when using a Setapp account in multiple devices.
 *
 * Usage:
 * 1. Set password environment variables which will be made available in clipboard after run, e.g. in fish `set -lx IR3_SETAPP_PSW "...."`
 * 2. Run it `deno run --allow-env --allow-run --reload --allow-net "https://raw.githubusercontent.com/fytriht/industrial-road-3/main/disconnect-setapp-devices/main.ts"`.
 */

const tokenStore = (() => {
  const KEY_TOKEN = "Token";
  const KEY_REFRESH_TOKEN = "RefreshToken";
  return {
    getToken() {
      let token = localStorage.getItem(KEY_TOKEN);
      if (!token) {
        token = prompt("Enter token:");
        assert(token, "cannot get token.");
        this.setToken(token);
      }
      return token;
    },
    setToken(token: string) {
      localStorage.setItem(KEY_TOKEN, token);
    },
    getRefreshToken() {
      let refreshToken = localStorage.getItem(KEY_REFRESH_TOKEN);
      if (!refreshToken) {
        refreshToken = prompt("Enter refresh token:");
        assert(refreshToken, "cannot get refresh token.");
        this.setRefreshToken(refreshToken);
      }
      return refreshToken;
    },
    setRefreshToken(refreshToken: string) {
      localStorage.setItem(KEY_REFRESH_TOKEN, refreshToken);
    },
  };
})();

const env = {
  password: Deno.env.get("IR3_SETAPP_PSW"),
} as const;

interface Device {
  id: number;
  name: string;
}

async function request(req: Request): Promise<Response> {
  const resp = await fetch(
    new Request(req, {
      headers: {
        Authorization: `Bearer ${tokenStore.getToken()}`,
        Accept: "application/json",
      },
    })
  );
  if (resp.ok) {
    return resp;
  } else if (resp.status === 401) {
    {
      console.log("token expired, refreshing");
      const req = new Request("https://user-api.setapp.com/v1/token", {
        method: "POST",
        body: JSON.stringify({
          refresh_token: tokenStore.getRefreshToken(),
        }),
        headers: {
          Authorization: `Bearer ${tokenStore.getToken()}`,
          Accept: "application/json",
        },
      });
      const resp = await fetch(req);
      const data = await resp
        .json()
        .then((json): { token: string; refresh_token: string } => json.data);
      tokenStore.setToken(data.token);
      tokenStore.setRefreshToken(data.refresh_token);
    }

    console.log("token refreshed, start resending request");
    return request(req);
  } else {
    throw Error(`request error: ${req.url}`);
  }
}

let devices: Device[];
{
  console.log("start fetching devices.");
  const req = new Request("https://user-api.setapp.com/v1/devices");
  const resp = await request(req);
  devices = await resp.json().then((json): Device[] => json.data);
}

if (devices.length === 0) {
  console.log("there are no active devices, closing...");
  Deno.exit();
}

console.log(
  `fetched devices: ${devices.map((device) => device.name).join(", ")}`
);
assert(
  devices.length === 1,
  `Unexpected device count, got ${devices.length} devices.`
);
const deviceToBeDisconnect = devices.at(0)!;

console.log(`disconnecting device of id: ${deviceToBeDisconnect.id}`);
const req = new Request(
  `https://user-api.setapp.com/v1/devices/${deviceToBeDisconnect.id}`,
  { method: "DELETE" }
);
await request(req);
console.log("device disconnected");

if (env.password) {
  await clipboard.writeText(env.password);
}
console.log("done.");

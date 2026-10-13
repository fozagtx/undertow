import { SOLAMI, env } from "./config.ts";
import { streamState } from "./metrics.ts";

export interface TokenCreate {
  type: "token_create";
  signature: string;
  slot: number;
  block_time: number;
  dex: string;
  mint: string;
  name: string;
  symbol: string;
  creator: string;
}

export interface Swap {
  type: "swap";
  signature: string;
  slot: number;
  mint: string;
  trader: string;
  side: "buy" | "sell";
  base_amount: number;
  dex: string;
}

type BlurEvent = TokenCreate | Swap | { type: string };

export class BlurStream {
  private ws: WebSocket | null = null;
  private stopped = true;
  private retry = 0;

  constructor(private name: string, private params: () => Record<string, string> | null, private onEvent: (e: BlurEvent) => void) {}

  start(): void {
    this.stopped = false;
    this.connect();
  }

  restart(): void {
    this.stopped = false;
    if (this.ws) this.ws.close(1000, "filter change");
    else this.connect();
  }

  stop(): void {
    this.stopped = true;
    this.ws?.close(1000, "stop");
  }

  private connect(): void {
    const state = streamState(this.name);
    const params = this.params();
    if (!params) {
      state.connected = false;
      return;
    }
    const q = new URLSearchParams({ chain: "solana", ...params, api_key: env.solamiKey });
    const ws = new WebSocket(`${SOLAMI.blurWs}?${q}`);
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      state.connected = true;
      console.log(`[blur:${this.name}] connected`);
    };
    ws.onmessage = (msg) => {
      state.lastEventAt = Date.now();
      try {
        this.onEvent(JSON.parse(String(msg.data)) as BlurEvent);
      } catch (err) {
        console.error(`[blur:${this.name}] bad frame`, (err as Error).message);
      }
    };
    ws.onclose = (ev) => {
      state.connected = false;
      if (this.ws !== ws) return;
      this.ws = null;
      if (ev.code === 4002) console.error(`[blur:${this.name}] closed 4002: Solami balance or bandwidth exhausted`);
      else if (ev.code !== 1000) console.error(`[blur:${this.name}] closed ${ev.code} ${ev.reason}`);
      if (this.stopped) return;
      state.reconnects++;
      const delay = Math.min(30_000, 1000 * 2 ** this.retry++);
      setTimeout(() => !this.stopped && !this.ws && this.connect(), ev.code === 1000 ? 250 : delay);
    };
    ws.onerror = () => {};
  }
}

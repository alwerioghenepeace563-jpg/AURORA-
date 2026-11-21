interface ConnectEnv { }
interface SocketPeer { userId: string; }

export class AuroraConnectRoom {
  state: DurableObjectState;
  constructor(state: DurableObjectState, _env: ConnectEnv) { this.state = state; }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/ticket" && request.method === "POST") {
      const body = await request.json().catch(() => ({})) as any;
      if (typeof body.ticket !== "string" || body.ticket.length < 24 || typeof body.userId !== "string") {
        return Response.json({ error: "Invalid call ticket." }, { status: 400 });
      }
      await this.state.storage.put("ticket:" + body.ticket, { userId: body.userId, createdAt: Date.now() }, { expirationTtl: 90 });
      return Response.json({ ok: true });
    }
    if (url.pathname !== "/socket" || request.method !== "GET" || request.headers.get("Upgrade") !== "websocket") {
      return Response.json({ error: "WebSocket upgrade required." }, { status: 426 });
    }
    const ticket = url.searchParams.get("ticket") || "";
    const stored = await this.state.storage.get<{ userId: string; createdAt: number }>("ticket:" + ticket);
    if (!stored || Date.now() - stored.createdAt > 90000) return Response.json({ error: "Call ticket expired. Try again." }, { status: 401 });
    await this.state.storage.delete("ticket:" + ticket);
    const peers = this.state.getWebSockets();
    if (peers.length >= 2) return Response.json({ error: "This call room is full." }, { status: 409 });
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.state.acceptWebSocket(server);
    server.serializeAttachment({ userId: stored.userId } satisfies SocketPeer);
    server.send(JSON.stringify({ type: "joined", participantCount: peers.length + 1 }));
    for (const peer of peers) {
      try { peer.send(JSON.stringify({ type: "peer-joined", initiator: true })); } catch {}
    }
    if (peers.length > 0) server.send(JSON.stringify({ type: "peer-joined", initiator: false }));
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(sender: WebSocket, raw: string | ArrayBuffer): void {
    const text = typeof raw === "string" ? raw : new TextDecoder().decode(raw);
    if (text.length > 16000) { sender.close(1009, "Message too large"); return; }
    let payload: any;
    try { payload = JSON.parse(text); } catch { return; }
    if (!payload || !["join", "offer", "answer", "ice", "hangup"].includes(payload.type)) return;
    if (payload.type === "join") return;
    const safe: any = { type: "signal", payload: { type: payload.type } };
    if (payload.type === "offer" || payload.type === "answer") {
      if (!payload.description || !["offer", "answer"].includes(payload.description.type) || typeof payload.description.sdp !== "string" || payload.description.sdp.length > 12000) return;
      safe.payload.description = payload.description;
    } else if (payload.type === "ice") {
      if (!payload.candidate || typeof payload.candidate.candidate !== "string" || payload.candidate.candidate.length > 2048) return;
      safe.payload.candidate = payload.candidate;
    }
    for (const peer of this.state.getWebSockets()) {
      if (peer === sender) continue;
      try { peer.send(JSON.stringify(safe)); } catch {}
    }
    if (payload.type === "hangup") sender.close(1000, "Call ended");
  }

  webSocketClose(sender: WebSocket): void {
    for (const peer of this.state.getWebSockets()) {
      if (peer === sender) continue;
      try { peer.send(JSON.stringify({ type: "peer-left" })); } catch {}
    }
  }
}

// ─────────────────────────────────────────────
// ws-client.js — WebSocket client for auction host
// Supports multi-device sync (primary/spectator roles)
// ─────────────────────────────────────────────

export class WSClient {
  constructor() {
    this.ws = null;
    this.connected = false;
    this.role = 'unknown';          // 'primary' | 'spectator' | 'unknown'
    this.handlers = new Map();
    this.reconnectTimer = null;
    this.connectedMobiles = new Map(); // teamId -> info
  }

  /** Connect to the WebSocket server */
  connect() {
    if (this.ws && this.ws.readyState <= 1) return; // already connected/connecting

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}`;

    try {
      this.ws = new WebSocket(url);
    } catch (e) {
      console.warn('[WS] Failed to connect:', e);
      return;
    }

    this.ws.onopen = () => {
      this.connected = true;
      console.log('[WS] Connected');
      // Register as host
      this.send({ type: 'host-register' });
      this._emit('connected');
    };

    this.ws.onmessage = (event) => {
      let msg;
      try { msg = JSON.parse(event.data); }
      catch (e) { return; }

      switch (msg.type) {
        case 'host-registered':
          this.role = msg.role || 'primary';
          console.log(`[WS] Registered as host (role: ${this.role})`);
          this._emit('role-assigned', { role: this.role });
          break;

        case 'host-role':
          this.role = msg.role;
          console.log(`[WS] Role updated: ${this.role}`);
          this._emit('role-assigned', { role: this.role });
          break;

        case 'state-update':
          // Received state from server (broadcast by primary host)
          this._emit('remote-state-update', msg.state);
          break;

        case 'session-created':
          this._emit('session-created', msg);
          break;

        case 'mobile-connected':
          this.connectedMobiles.set(msg.teamId, {
            teamId: msg.teamId,
            teamName: msg.teamName,
            teamShortName: msg.teamShortName,
          });
          this._emit('mobile-connected', msg);
          break;

        case 'mobile-disconnected':
          this.connectedMobiles.delete(msg.teamId);
          this._emit('mobile-disconnected', msg);
          break;

        case 'mobile-bid':
          this._emit('mobile-bid', msg);
          break;
      }
    };

    this.ws.onclose = () => {
      this.connected = false;
      this.role = 'unknown';
      console.log('[WS] Disconnected');
      this._emit('disconnected');
      // Auto-reconnect after 3 seconds
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = setTimeout(() => this.connect(), 3000);
    };

    this.ws.onerror = (err) => {
      console.warn('[WS] Error:', err);
    };
  }

  /** Whether this client is the primary (controlling) host */
  isPrimary() {
    return this.role === 'primary';
  }

  /** Send a message to the server */
  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  /** Broadcast auction state to all mobile clients + spectator hosts */
  broadcastState(state, fullState = null) {
    const msg = { type: 'state-update', state };
    if (fullState) msg.fullState = fullState;
    this.send(msg);
  }

  /** Send full persistent state to spectator hosts */
  broadcastFullState(fullState) {
    this.send({ type: 'full-state-sync', state: fullState });
  }

  /** Send an event only to projector clients (not mobile) */
  sendProjectorEvent(payload) {
    this.send({ type: 'projector-event', payload });
  }

  /** Create a mobile bidding session */
  createSession(teams) {
    const teamInfo = teams.map(t => ({
      id: t.id,
      name: t.name,
      shortName: t.shortName,
      color: t.color,
      textColor: t.textColor,
    }));
    this.send({ type: 'create-session', teams: teamInfo });
  }

  /** Send bid result back to a specific mobile team */
  sendBidResult(teamId, success, error = '') {
    this.send({ type: 'bid-result', teamId, success, error });
  }

  /** Register an event handler */
  on(event, handler) {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, []);
    }
    this.handlers.get(event).push(handler);
  }

  /** Remove event handlers */
  off(event) {
    this.handlers.delete(event);
  }

  _emit(event, data) {
    const handlers = this.handlers.get(event);
    if (handlers) {
      handlers.forEach(fn => fn(data));
    }
  }

  /** Get count of connected mobile clients */
  getConnectedCount() {
    return this.connectedMobiles.size;
  }

  /** Get connected mobile team info */
  getConnectedTeams() {
    return [...this.connectedMobiles.values()];
  }

  disconnect() {
    clearTimeout(this.reconnectTimer);
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

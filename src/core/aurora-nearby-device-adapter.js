const TRANSPORT_ID = "android_nearby";

function createAuroraNearbyDeviceAdapter({ nativeTransport, deviceContinuity, events } = {}) {
  if (!nativeTransport || !deviceContinuity) throw new Error("Nearby transport and device continuity are required.");
  const subscriptions = [];
  let started = false;

  const publish = (type, payload) => {
    try { events?.publish?.("device.nearby." + type, payload, { source: "android_nearby" }); } catch { /* diagnostics must not break transport */ }
  };

  const transport = {
    async verifyPairing({ challenge, response }) {
      if (!nativeTransport.isAvailable()) throw new Error("Android Nearby Connections is unavailable.");
      if (!response?.endpointId) throw new Error("The discovered device endpoint is missing.");
      const proof = await nativeTransport.verifyPeer(response.endpointId, challenge);
      return {
        authenticated: proof?.authenticated === true &&
          proof.deviceId === response.deviceId &&
          proof.publicKeyFingerprint === response.publicKeyFingerprint,
        deviceId: proof?.deviceId,
        publicKeyFingerprint: proof?.publicKeyFingerprint
      };
    },
    async sendEncrypted({ deviceId, payload }) {
      if (!nativeTransport.isAvailable()) throw new Error("Android Nearby Connections is unavailable.");
      return nativeTransport.sendEncrypted(deviceId, payload);
    },
    async revoke({ deviceId }) {
      if (!nativeTransport.isAvailable()) throw new Error("Android Nearby Connections is unavailable.");
      const result = await nativeTransport.disconnect(deviceId);
      return { revoked: result?.disconnected === true };
    }
  };

  if (nativeTransport.isAvailable()) {
    deviceContinuity.registerTransport(TRANSPORT_ID, transport);
    const eventNames = [
      "nearbyEndpointFound", "nearbyEndpointLost", "nearbyConnectionRequest",
      "nearbyConnectionEstablished", "nearbyConnectionFailed", "nearbyPeerReady",
      "nearbyPeerAuthenticated", "nearbyPeerDisconnected", "nearbyPayloadReceived",
      "nearbyTransportError"
    ];
    for (const name of eventNames) {
      nativeTransport.addListener(name, payload => publish(name.replace(/^nearby/, "").replace(/([A-Z])/g, ".$1").toLowerCase(), payload))
        .then(subscription => subscriptions.push(subscription))
        .catch(() => {});
    }
  }

  async function start() {
    if (!nativeTransport.isAvailable()) throw new Error("Nearby device pairing is available only in the AURORA Android app.");
    const permission = await nativeTransport.requestPermissions();
    if (permission?.granted !== true) throw new Error("Nearby permissions were not granted.");
    try {
      const [advertising, discovery] = await Promise.all([
        nativeTransport.startAdvertising(),
        nativeTransport.startDiscovery()
      ]);
      started = advertising?.started === true && discovery?.started === true;
      return { started, advertising: advertising?.started === true, discovery: discovery?.started === true };
    } catch (error) {
      await Promise.allSettled([nativeTransport.stopAdvertising(), nativeTransport.stopDiscovery()]);
      started = false;
      throw error;
    }
  }

  async function stop() {
    if (!nativeTransport.isAvailable()) return { stopped: true };
    const results = await Promise.allSettled([nativeTransport.stopAdvertising(), nativeTransport.stopDiscovery()]);
    started = false;
    return { stopped: results.every(result => result.status === "fulfilled") };
  }

  async function approveConnection(endpointId, confirmed) {
    if (confirmed !== true) throw new Error("Compare the same authentication code on both phones before approving.");
    return nativeTransport.acceptConnection(endpointId, true);
  }

  async function pair(endpointId, decision = {}) {
    if (decision.approved !== true || decision.consent !== true) {
      throw Object.assign(new Error("Review the device identity and explicitly approve pairing and data sharing."), { code: "DEVICE_CONSENT_REQUIRED" });
    }
    const result = await nativeTransport.getConnectedPeers();
    const peer = (result?.items || []).find(item => item.endpointId === endpointId);
    if (!peer) throw new Error("The connected device identity has not arrived yet.");
    return deviceContinuity.pair(TRANSPORT_ID, peer, decision);
  }

  return Object.freeze({
    transportId: TRANSPORT_ID,
    isAvailable: () => nativeTransport.isAvailable(),
    getIdentity: () => nativeTransport.getIdentity(),
    start,
    stop,
    requestConnection: endpointId => nativeTransport.requestConnection(endpointId),
    approveConnection,
    rejectConnection: endpointId => nativeTransport.rejectConnection(endpointId),
    getConnectedPeers: () => nativeTransport.getConnectedPeers(),
    pair,
    handoff: (deviceId, payload, decision) => deviceContinuity.handoff(deviceId, payload, decision),
    revoke: deviceId => deviceContinuity.revoke(deviceId, TRANSPORT_ID),
    isStarted: () => started,
    destroy: async () => {
      await stop();
      await Promise.allSettled(subscriptions.map(subscription => subscription.remove()));
      subscriptions.length = 0;
    }
  });
}

export { createAuroraNearbyDeviceAdapter };

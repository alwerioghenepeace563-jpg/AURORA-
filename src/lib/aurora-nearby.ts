import { registerPlugin, Capacitor } from "@capacitor/core";

export type AuroraNearbyEndpoint = { endpointId: string; name: string; serviceId?: string };
export type AuroraNearbyConnectionRequest = { endpointId: string; name: string; authenticationDigits: string; incoming: boolean };
export type AuroraNearbyPeer = {
  endpointId: string;
  deviceId: string;
  name: string;
  platform: string;
  publicKeyFingerprint: string;
  authenticated: boolean;
};
type AuroraNearbyPlugin = {
  getIdentity(): Promise<{ available: boolean; deviceId: string; name: string; platform: string; publicKey: string; publicKeyFingerprint: string }>;
  requestNearbyPermissions(): Promise<{ granted: boolean; permissions?: number }>;
  startAdvertising(): Promise<{ started: boolean; mode: string }>;
  startDiscovery(): Promise<{ started: boolean; mode: string }>;
  stopAdvertising(): Promise<{ stopped: boolean }>;
  stopDiscovery(): Promise<{ stopped: boolean }>;
  requestConnection(options: { endpointId: string }): Promise<{ requested: boolean }>;
  acceptConnection(options: { endpointId: string; confirmed: boolean }): Promise<{ accepted: boolean }>;
  rejectConnection(options: { endpointId: string }): Promise<{ rejected: boolean }>;
  getConnectedPeers(): Promise<{ items: AuroraNearbyPeer[]; count: number }>;
  verifyPeer(options: { endpointId: string; challenge: string }): Promise<{ authenticated: boolean; deviceId: string; publicKeyFingerprint: string }>;
  sendEncrypted(options: { deviceId: string; payload: Record<string, unknown> }): Promise<{ delivered: boolean; encrypted: boolean }>;
  disconnect(options: { deviceId: string }): Promise<{ disconnected: boolean }>;
  addListener(eventName: string, listenerFunc: (event: any) => void): Promise<{ remove: () => Promise<void> }>;
};
const AuroraNearby = registerPlugin<AuroraNearbyPlugin>("AuroraNearby");

export const auroraNearby = {
  isAvailable: () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android",
  getIdentity: () => AuroraNearby.getIdentity(),
  requestPermissions: () => AuroraNearby.requestNearbyPermissions(),
  startAdvertising: () => AuroraNearby.startAdvertising(),
  startDiscovery: () => AuroraNearby.startDiscovery(),
  stopAdvertising: () => AuroraNearby.stopAdvertising(),
  stopDiscovery: () => AuroraNearby.stopDiscovery(),
  requestConnection: (endpointId: string) => AuroraNearby.requestConnection({ endpointId }),
  acceptConnection: (endpointId: string, confirmed: boolean) => AuroraNearby.acceptConnection({ endpointId, confirmed }),
  rejectConnection: (endpointId: string) => AuroraNearby.rejectConnection({ endpointId }),
  getConnectedPeers: () => AuroraNearby.getConnectedPeers(),
  verifyPeer: (endpointId: string, challenge: string) => AuroraNearby.verifyPeer({ endpointId, challenge }),
  sendEncrypted: (deviceId: string, payload: Record<string, unknown>) => AuroraNearby.sendEncrypted({ deviceId, payload }),
  disconnect: (deviceId: string) => AuroraNearby.disconnect({ deviceId }),
  addListener: (eventName: string, callback: (event: any) => void) => AuroraNearby.addListener(eventName, callback)
};

import dgram from "dgram";
import { ipcMain, type WebContents } from "electron";

// Main-process side of the emulator's ethernet bridge.
//
// The emulated Mac's `ether js` driver hands raw 802.3 frames up to the
// worker, which postMessages them to the renderer, which forwards them here
// over IPC. This module is the pluggable transport: today it ships a simple
// UDP-broadcast provider compatible with native Basilisk II / SheepShaver's
// "udptunnel" mode (frames are broadcast to a fixed port on the LAN, so two
// macintosh.js instances — or a native Basilisk II with `udptunnel true` —
// can speak AppleTalk to each other). A NAT-to-real-internet provider (slirp
// or similar) can be dropped in by implementing the same EthernetProvider
// interface.

const UDPTUNNEL_PORT = 6066;

interface EthernetProvider {
  init(macAddress: string, onReceive: (frame: Uint8Array) => void): void;
  send(destination: string, frame: Uint8Array): void;
  close(): void;
}

class UdpBroadcastProvider implements EthernetProvider {
  private socket: dgram.Socket | null = null;
  private ownMac = Buffer.alloc(6);

  init(macAddress: string, onReceive: (frame: Uint8Array) => void) {
    this.close();
    this.ownMac = Buffer.from(
      macAddress.split(":").map((s) => parseInt(s, 16)),
    );
    this.socket = dgram.createSocket({ type: "udp4", reuseAddr: true });
    this.socket.on("error", (err) => {
      console.warn("ethernet: UDP socket error", err);
    });
    this.socket.on("message", (msg) => {
      // Ignore our own broadcasts (the source MAC is bytes 6..12).
      if (msg.length >= 12 && msg.compare(this.ownMac, 0, 6, 6, 12) === 0) {
        return;
      }
      onReceive(msg);
    });
    this.socket.bind(UDPTUNNEL_PORT, () => {
      this.socket?.setBroadcast(true);
      console.log(
        `ethernet: ${macAddress} listening on udp/${UDPTUNNEL_PORT} (udptunnel)`,
      );
    });
  }

  send(_destination: string, frame: Uint8Array) {
    if (!this.socket) return;
    this.socket.send(frame, UDPTUNNEL_PORT, "255.255.255.255", (err) => {
      if (err) console.warn("ethernet: UDP send failed", err);
    });
  }

  close() {
    this.socket?.close();
    this.socket = null;
  }
}

export function registerEthernetHandlers() {
  const provider: EthernetProvider = new UdpBroadcastProvider();
  let renderer: WebContents | null = null;

  ipcMain.on("ethernet-init", (event, macAddress: string) => {
    renderer = event.sender;
    provider.init(macAddress, (frame) => {
      if (renderer && !renderer.isDestroyed()) {
        renderer.send("ethernet-receive", frame);
      }
    });
    event.sender.once("destroyed", () => provider.close());
  });

  ipcMain.on(
    "ethernet-send",
    (_event, destination: string, frame: Uint8Array) => {
      provider.send(destination, frame);
    },
  );
}

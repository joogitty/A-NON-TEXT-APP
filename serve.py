#!/usr/bin/env python3
import http.server
import socketserver
import webbrowser
import os
import sys
import json
import time
import socket
import random

PORT = 8000

# In-memory ephemeral room signaling relay
# Format: ROOMS[code] = { "peers": { peer_id: { "signals": [] } }, "created": timestamp }
ROOMS = {}

def cleanup_old_rooms():
    now = time.time()
    expired = [code for code, data in ROOMS.items() if now - data.get("created", 0) > 3600]
    for code in expired:
        del ROOMS[code]

def get_local_ips():
    ips = []
    try:
        hostname = socket.gethostname()
        for ip in socket.gethostbyname_ex(hostname)[2]:
            if not ip.startswith("127."):
                ips.append(ip)
    except Exception:
        pass
    if not ips:
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
            s.close()
            if ip and not ip.startswith("127."):
                ips.append(ip)
        except Exception:
            pass
    return ips

class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        if self.path.startswith('/api/room/poll'):
            cleanup_old_rooms()
            from urllib.parse import parse_qs, urlparse
            query = parse_qs(urlparse(self.path).query)
            code = query.get('code', [''])[0].strip()
            peer_id = query.get('peerId', [''])[0].strip()

            if code in ROOMS and peer_id in ROOMS[code]["peers"]:
                signals = ROOMS[code]["peers"][peer_id]["signals"]
                ROOMS[code]["peers"][peer_id]["signals"] = []
                active_peers = list(ROOMS[code]["peers"].keys())
                self._send_json({"status": "ok", "signals": signals, "activePeers": active_peers})
            else:
                self._send_json({"status": "error", "message": "Room or peer not found"}, code=404)
            return

        super().do_GET()

    def do_POST(self):
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length) if content_length > 0 else b'{}'
        
        try:
            data = json.loads(body.decode('utf-8'))
        except Exception:
            data = {}

        cleanup_old_rooms()

        if self.path == '/api/room/create':
            # Generate unique 6-digit room PIN code
            code = str(random.randint(100000, 999999))
            while code in ROOMS:
                code = str(random.randint(100000, 999999))

            peer_id = data.get('peerId') or ('peer_' + str(random.randint(1000, 9999)))
            ROOMS[code] = {
                "created": time.time(),
                "peers": {
                    peer_id: { "signals": [] }
                }
            }
            if data.get('signal'):
                # Store host initial signal
                ROOMS[code]["hostSignal"] = data.get('signal')
                ROOMS[code]["hostPeerId"] = peer_id

            self._send_json({"status": "ok", "code": code, "peerId": peer_id})

        elif self.path == '/api/room/join':
            code = str(data.get('code', '')).strip()
            peer_id = data.get('peerId') or ('peer_' + str(random.randint(1000, 9999)))

            if code in ROOMS:
                if peer_id not in ROOMS[code]["peers"]:
                    ROOMS[code]["peers"][peer_id] = { "signals": [] }
                
                existing_peers = [p for p in ROOMS[code]["peers"].keys() if p != peer_id]
                host_signal = ROOMS[code].get("hostSignal")
                host_peer_id = ROOMS[code].get("hostPeerId")

                self._send_json({
                    "status": "ok",
                    "code": code,
                    "peerId": peer_id,
                    "existingPeers": existing_peers,
                    "hostSignal": host_signal,
                    "hostPeerId": host_peer_id
                })
            else:
                self._send_json({"status": "error", "message": "Invalid or expired 6-digit room code"}, code=404)

        elif self.path == '/api/room/signal':
            code = str(data.get('code', '')).strip()
            from_peer = data.get('fromPeerId')
            to_peer = data.get('toPeerId')
            signal = data.get('signal')

            if code in ROOMS:
                if to_peer and to_peer in ROOMS[code]["peers"]:
                    ROOMS[code]["peers"][to_peer]["signals"].append({
                        "fromPeerId": from_peer,
                        "signal": signal
                    })
                else:
                    # Broadcast to all peers except sender
                    for pid, pdata in ROOMS[code]["peers"].items():
                        if pid != from_peer:
                            pdata["signals"].append({
                                "fromPeerId": from_peer,
                                "signal": signal
                            })
                self._send_json({"status": "ok"})
            else:
                self._send_json({"status": "error", "message": "Room not found"}, code=404)

        else:
            self._send_json({"status": "error", "message": "Unknown API endpoint"}, code=404)

    def _send_json(self, obj, code=200):
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(obj).encode('utf-8'))

def main():
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    local_url = f"http://localhost:{PORT}"
    local_ips = get_local_ips()
    
    print("=" * 65)
    print(" 👻 GHOSTCHAT LOCAL SECURE LAUNCHER & MESH SIGNALING SERVER")
    print("=" * 65)
    print(f" 💻 Laptop / Local Browser URL:  {local_url}")
    if local_ips:
        for ip in local_ips:
            print(f" 📱 Mobile / LAN Network URL:  http://{ip}:{PORT}")
    print("=" * 65)
    print(" ⚡ 6-Digit Room Code Relay & WebRTC Mesh Signaling Active.")
    print(" Press Ctrl+C in this terminal to stop the server.")
    print("=" * 65)

    try:
        webbrowser.open(local_url)
    except Exception as e:
        print(f" Could not auto-open browser: {e}.")

    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down GhostChat local server. Goodbye!")
            sys.exit(0)

if __name__ == '__main__':
    main()


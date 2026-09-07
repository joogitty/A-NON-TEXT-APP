#!/usr/bin/env python3
import http.server
import socketserver
import webbrowser
import os
import sys

PORT = 8000

class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Enable Secure Context & CORS headers
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        super().end_headers()

def main():
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    url = f"http://localhost:{PORT}"
    print("=" * 60)
    print(" 👻 GHOSTCHAT LOCAL SECURE LAUNCHER")
    print("=" * 60)
    print(f" Serving GhostChat on: {url}")
    print(" Standard local server is running with Secure Context enabled.")
    print(" Press Ctrl+C in this terminal to stop the server.")
    print("=" * 60)

    try:
        webbrowser.open(url)
    except Exception as e:
        print(f" Could not auto-open browser: {e}. Please manually open {url} in Chrome/Firefox/Safari.")

    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down GhostChat local server. Goodbye!")
            sys.exit(0)

if __name__ == '__main__':
    main()

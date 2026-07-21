import http.server
import socketserver
import urllib.request
import urllib.parse
import sys
import os
import ssl

# Disable SSL verification for development proxy requests (fixes macOS urllib certificate error)
ssl._create_default_https_context = ssl._create_unverified_context

PORT = 8000

class ProxyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        parsed_url = urllib.parse.urlparse(self.path)
        if parsed_url.path == '/api/proxy':
            query_params = urllib.parse.parse_qs(parsed_url.query)
            target_url = query_params.get('url', [None])[0]
            
            if not target_url:
                self.send_response(400)
                self.end_headers()
                self.wfile.write(b'Missing url parameter')
                return

            print(f"[Proxy] Fetching target URL: {target_url}", flush=True)
            try:
                req = urllib.request.Request(
                    target_url,
                    headers={
                        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': 'application/json, text/plain, */*'
                    }
                )
                with urllib.request.urlopen(req, timeout=10) as response:
                    status = response.status
                    content = response.read()
                    
                    self.send_response(status)
                    content_type = response.headers.get('Content-Type')
                    if content_type:
                        self.send_header('Content-Type', content_type)
                    self.end_headers()
                    self.wfile.write(content)
            except Exception as e:
                print(f"[Proxy Error] Failed to proxy: {str(e)}", flush=True)
                self.send_response(500)
                self.end_headers()
                self.wfile.write(f"Proxy error: {str(e)}".encode('utf-8'))
            return
        
        return super().do_GET()

if __name__ == '__main__':
    workspace = '/Users/chouhantej/Documents/SMAI AG'
    os.chdir(workspace)
    
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), ProxyHTTPRequestHandler) as httpd:
        print(f"SMAI Custom Server running at http://localhost:{PORT}", flush=True)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down server.", flush=True)
            sys.exit(0)

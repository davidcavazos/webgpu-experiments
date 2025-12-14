ip=$(ipconfig getifaddr en0)
port=8000

echo "http://localhost:$port/index.html"
echo "http://$ip:$port/index.html"
python3 -m http.server 8000

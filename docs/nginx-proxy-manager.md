# Nginx Proxy Manager setup for `office.naleli.co.za`

This guide assumes you already have:

- An Ubuntu VPS with Docker installed
- A running NIBS container exposing port 8080
- DNS for `office.naleli.co.za` already pointed to the VPS public IP

## 1. Install Nginx Proxy Manager

On the VPS:

```bash
mkdir -p /opt/npm && cd /opt/npm
cat > docker-compose.yml <<'YAML'
version: "3.9"
services:
  npm:
    image: jc21/nginx-proxy-manager:latest
    container_name: npm
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
      - "81:81"   # admin UI
    volumes:
      - npm-data:/data
      - npm-letsencrypt:/etc/letsencrypt
volumes:
  npm-data:
  npm-letsencrypt:
YAML
sudo docker compose up -d
```

Visit `http://<vps-ip>:81` and log in with the default admin
(`admin@example.com` / `changeme`). Change the password immediately.

## 2. Add a Proxy Host

1. **Proxy Hosts** → **Add Proxy Host**
2. **Details** tab:
   - **Domain Names**: `office.naleli.co.za`
   - **Scheme**: `http`
   - **Forward Hostname / IP**: `127.0.0.1` (or `nibs-portal` if you put both on the same Docker network)
   - **Forward Port**: `8080`
   - **Cache Assets**: off
   - **Block Common Exploits**: on
   - **Websockets Support**: on
   - **Access List**: open
3. **SSL** tab:
   - **SSL Certificate**: *Request a new SSL Certificate*
   - **Force SSL**: on
   - **HTTP/2**: on
   - **HSTS**: on
   - Agree to Let's Encrypt ToS → **Save**

Within ~30 seconds, `https://office.naleli.co.za` is live.

## 3. (Optional) Run NIBS in the same Docker network

If you want to skip forwarding to `127.0.0.1` and use the container name:

```bash
sudo docker network create nibs-net
sudo docker compose -f /opt/nibs-portal/docker-compose.yml -f - up -d <<'YAML'
services:
  nibs:
    networks: [nibs-net]
networks:
  nibs-net:
    external: true
YAML
sudo docker network connect nibs-net npm
```

Then in NPM, set **Forward Hostname / IP** to `nibs-portal`.

## 4. Renewals

NPM auto-renews Let's Encrypt certificates. Check the **SSL Certificates** tab if anything looks off.

## 5. (Optional) Force a specific SSL profile

In **Advanced** tab of the proxy host, you can add custom Nginx directives, e.g.:

```
client_max_body_size 25m;
proxy_read_timeout 120s;
```

---

That's it. The platform is now live at `https://office.naleli.co.za`.

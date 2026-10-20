# HTTPS with Tailscale, and installing the app on your phone

Phones only let you install a web app (PWA) and receive its notifications over **HTTPS**. Tailscale
gives your CasaOS server a private HTTPS address with a valid certificate, such as
`https://casaos.tail1234.ts.net`. That address works from anywhere your phone has Tailscale running,
and nothing is exposed to the public internet.

## 1. Set up Tailscale

1. Create a free account at [tailscale.com](https://tailscale.com).
2. Install Tailscale on your **phone** (App Store or Play Store) and sign in.
3. Install Tailscale on your **CasaOS server**, in one of two ways:
   - **On the host (recommended):** open a terminal on the server (CasaOS has one under Settings,
     or use SSH) and run:
     ```bash
     curl -fsSL https://tailscale.com/install.sh | sh
     sudo tailscale up
     ```
     Open the link it prints to add the server to your account.
   - **As the CasaOS Tailscale app:** install it from the CasaOS App Store and sign in from its web
     page.
4. In the [Tailscale admin console](https://login.tailscale.com/admin/dns), go to **DNS**. Make
   sure **MagicDNS** is on, then click **Enable HTTPS** under _HTTPS Certificates_.

## 2. Serve Episodic over HTTPS

This tells Tailscale to forward `https://<server>.<tailnet>.ts.net` to Episodic on port 8787.

**If Tailscale runs on the host:**

```bash
sudo tailscale serve --bg 8787
```

**If Tailscale runs as the CasaOS app:**

```bash
docker exec -it $(docker ps --filter name=tailscale --format '{{.Names}}' | head -1) tailscale serve --bg 8787
```

This works because the CasaOS Tailscale app uses the host network, so `localhost:8787` reaches
Episodic.

Check the result:

```bash
sudo tailscale serve status
```

It prints your HTTPS address, for example `https://casaos.tail1234.ts.net`. The first visit can take
a few seconds while the certificate is issued. The setting survives reboots. Use
`tailscale serve --https=443 off` to remove it.

## 3. Tell Episodic its address

Set these environment variables (in CasaOS: app ⋮ → **Settings**), then save:

| Variable          | Example                                                            |
| ----------------- | ------------------------------------------------------------------ |
| `APP_URL`         | `https://casaos.tail1234.ts.net`                                   |
| `ALLOWED_ORIGINS` | `http://192.168.1.20:8787` (your LAN address, so it keeps working) |

## 4. Install the app on your phone

Make sure Tailscale is connected on the phone, and open your `https://…ts.net` address.

- **iPhone or iPad (Safari):** tap **Share**, then **Add to Home Screen**, then **Add**.
- **Android (Chrome):** tap **⋮**, then **Install app** (or **Add to Home screen**).

Episodic then opens full-screen from its own icon, like a native app.

> The installable app (PWA) ships in phase 4. Until then, the page opens as a normal browser
> bookmark.

## Troubleshooting

| Problem                           | Fix                                                                                               |
| --------------------------------- | ------------------------------------------------------------------------------------------------- |
| The `ts.net` address doesn't load | Check that Tailscale is connected on the phone and that `tailscale serve status` lists port 8787. |
| Certificate error                 | Check that **Enable HTTPS** is on in the admin console, then wait a minute and reload.            |
| "Cross-site request blocked"      | `APP_URL` doesn't match the address in your browser exactly (including `https://`).               |
| No "Install app" option           | You must be on the `https://` address, not the LAN `http://` one.                                 |

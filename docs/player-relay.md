# Let players join from anywhere

The **Let players join from anywhere** card on the Minecraft servers screen. Design: `design/design-sources/deploy-anywhere/Relay.dc.html`. Code: `design/packages/ui/src/components/mcserver/relayPlan.ts`, `RelayPlanner.vue`.

## Behaviour

A Cloudflare tunnel carries web pages (the management site, the live map) but not the game's raw TCP and UDP ports. The card offers four ways in:

- **Oracle Cloud relay (Always Free):** makes fresh WireGuard keys and a cloud-init script to paste into Oracle Cloud's *Create instance › Advanced options › Cloud-init script*. The new Ubuntu VM installs WireGuard, listens on UDP 51820, and forwards each chosen port to the server through the tunnel, again after every reboot.
- **My own server:** the same as a setup script to run once as root on any Debian or Ubuntu server.
- **Router port:** the forwarding rules to add in the router, and the CGNAT case where that cannot work.
- **This network only:** nothing to forward.

Both relay routes also produce the server side's tunnel config, which dials out to the relay (so nothing opens on the home router) with a 25 second keepalive. Ports: Java 25565/TCP, Bedrock (Geyser) 19132/UDP, a voice chat mod 24454/UDP and server query 25565/UDP, each a switch.

## Configuration

The relay's public address goes into the server-side config; it can be filled in after the relay exists. The cloud's own firewall (Oracle: the subnet's security list) must allow UDP 51820 and each forwarded port; the card lists them because no script on the VM can change that.

## Failure modes

- Clashing ports, an empty list, or UDP 51820 (the tunnel's own port) are refused before any file is made.
- If Web Crypto cannot make X25519 keys, the card says so and makes no files.
- WorldLens does not create the Oracle VM or run the script over SSH for you yet; it writes the files to paste or run.

## Security considerations

The files hold WireGuard private keys: the relay file holds the relay's, the server file holds the server's, and neither holds the other's. Keep them like passwords. The relay only forwards the listed ports to one tunnel address and never sees the world or any password.

## Verification

`npx vitest run packages/ui/src/components/mcserver/relayPlan` checks key length, the DNAT and forward rules per protocol, the cloud-init shape, the server config, the firewall list and the port checks. The scripts have not yet been run on a real Oracle VM.

## 廣東話

Minecraft 伺服器畫面有張 **Let players join from anywhere** 卡。Cloudflare tunnel 只係帶網頁，帶唔到遊戲本身嘅 TCP 同 UDP 埠，所以有四條路：**Oracle Cloud 中繼（Always Free）**會整新嘅 WireGuard 鎖匙同 cloud-init，貼入 Oracle Cloud 建立 VM 時嘅 cloud-init 欄；VM 會裝 WireGuard、聽 UDP 51820，再將揀咗嘅埠經隧道轉去伺服器，重開機都照做。**自己嘅伺服器**係同一樣嘢，變做一個用 root 行一次嘅腳本。**路由器埠**列出要喺路由器加嘅規則，同埋 CGNAT 時點解唔得。**淨係呢個網絡**就乜都唔使轉。兩種中繼都會出伺服器嗰邊嘅隧道設定，由伺服器主動撥出去，屋企路由器乜都唔使開。雲端自己嘅防火牆（Oracle 係 security list）要開 UDP 51820 同每個埠，卡上會列出。檔案入面有私鑰，當密碼咁保管。WorldLens 暫時未會幫你開 Oracle VM 或者經 SSH 行腳本，只係寫好檔案畀你貼或者行；腳本未喺真 Oracle VM 行過。

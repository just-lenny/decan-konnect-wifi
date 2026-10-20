/**
 * MikroTik RouterOS adapter (script generation).
 * Model: the router POLLS the platform over HTTPS (works behind NAT, no router credentials are stored on our side).
 * The platform answers with a RouterOS script (.rsc) built ONLY from validated values (MAC, UUID, integers).
 * Access mode: HotSpot "login-by=mac": an authorized device gets a hotspot user named after its MAC address.
 */
export interface AuthorizeCmd { id: string; type: 'authorize'; mac: string; entitlement_id: string; seconds: number;
  data_limit_mb: number | null; down_kbps: number | null; up_kbps: number | null; max_devices: number }
export interface RevokeCmd { id: string; type: 'revoke'; mac: string; entitlement_id: string }
export type RouterCmd = AuthorizeCmd | RevokeCmd;

const MAC = /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const intOrNull = (n: unknown, name: string) => {
  if (n === null || n === undefined) return null;
  if (!Number.isInteger(n) || (n as number) < 0) throw new Error(`invalid ${name}`);
  return n as number;
};

function ack(base: string, token: string, id: string, ok: boolean): string {
  return `/tool fetch url="${base}/ack" http-method=post http-header-field="Authorization: Bearer ${token},Content-Type: application/json" ` +
    `http-data="{\\"cmd\\":\\"${id}\\",\\"ok\\":${ok}}" output=none`;
}

export function buildCommandScript(cmds: RouterCmd[], base: string, token: string): string {
  const lines: string[] = ['# Decan Konnect command batch'];
  for (const c of cmds) {
    if (!UUID.test(c.id) || !MAC.test(c.mac) || !UUID.test(c.entitlement_id)) throw new Error('unsafe command rejected');
    if (c.type === 'revoke') {
      lines.push(
        `:do { /ip hotspot active remove [find where mac-address="${c.mac}"] } on-error={}`,
        `:do { /ip hotspot host remove [find where mac-address="${c.mac}" authorized=yes] } on-error={}`,
        `:do { /ip hotspot user remove [find where name="${c.mac}"]; ${ack(base, token, c.id, true)} } on-error={ ${ack(base, token, c.id, false)} }`,
      );
      continue;
    }
    const seconds = intOrNull(c.seconds, 'seconds'); const mb = intOrNull(c.data_limit_mb, 'data');
    const down = intOrNull(c.down_kbps, 'down'); const up = intOrNull(c.up_kbps, 'up'); const dev = intOrNull(c.max_devices, 'devices') ?? 1;
    if (!seconds) throw new Error('invalid seconds');
    const profile = `dk-${down ?? 0}-${up ?? 0}-${dev}`;
    const rate = down && up ? ` rate-limit="${up}k/${down}k"` : '';
    lines.push(
      `:if ([:len [/ip hotspot user profile find where name="${profile}"]]=0) do={ /ip hotspot user profile add name="${profile}" shared-users=${dev}${rate} }`,
      `:do { /ip hotspot active remove [find where mac-address="${c.mac}"] } on-error={}`,
      `:do { /ip hotspot user remove [find where name="${c.mac}"] } on-error={}`,
      `:do { /ip hotspot user add name="${c.mac}" mac-address=${c.mac} profile="${profile}" limit-uptime=${seconds}s` +
        (mb ? ` limit-bytes-total=${mb * 1048576}` : '') + ` comment="dk:${c.entitlement_id}"; ${ack(base, token, c.id, true)} } on-error={ ${ack(base, token, c.id, false)} }`,
    );
  }
  return lines.join('\n') + '\n';
}

export function buildAgentScript(base: string, token: string): string {
  return `# Decan Konnect polling agent (script name: dk-agent)
:local base "${base}/api/v1/router/agent"
:local tok "${token}"
:local acc ""
:foreach u in=[/ip hotspot user find where comment~"^dk:"] do={
  :local mac [/ip hotspot user get $u name]
  :local bi [/ip hotspot user get $u bytes-in]
  :local bo [/ip hotspot user get $u bytes-out]
  :local up [:tonsec [/ip hotspot user get $u uptime]]
  :set acc ($acc . "{\\"mac\\":\\"" . $mac . "\\",\\"bytes_in\\":" . $bi . ",\\"bytes_out\\":" . $bo . ",\\"uptime\\":" . $up . "},")
}
:if ([:len $acc]>0) do={ :set acc [:pick $acc 0 ([:len $acc]-1)] }
:local serial "unknown"
:do { :set serial [/system routerboard get serial-number] } on-error={}
:local body ("{\\"serial\\":\\"" . $serial . "\\",\\"identity\\":\\"" . [/system identity get name] . "\\",\\"version\\":\\"" . [/system resource get version] . "\\",\\"accounting\\":[" . $acc . "]}")
:do {
  /tool fetch url=($base . "/poll") http-method=post http-header-field=("Authorization: Bearer " . $tok . ",Content-Type: application/json") http-data=$body dst-path="dk-cmds.rsc" output=file
  :delay 1s
  :if ([:len [/file find where name="dk-cmds.rsc"]]>0) do={ /import file-name=dk-cmds.rsc; /file remove "dk-cmds.rsc" }
} on-error={ :log warning "decan-konnect: poll failed" }
`;
}

export function buildLoginHtml(domain: string, slug: string, routerPublicId: string): string {
  const url = `https://${domain}/${slug}?r=${routerPublicId}&mac=$(mac)&ip=$(ip)`;
  return `<html><head><meta http-equiv="refresh" content="0; url=${url}"><title>Redirecting</title></head><body><a href="${url}">Continue</a></body></html>`;
}

export function buildSetupScript(o: { base: string; slug: string; routerPublicId: string; token: string }): string {
  const domain = new URL(o.base).host;
  const html = buildLoginHtml(domain, o.slug, o.routerPublicId).replace(/\$/g, '\\$').replace(/"/g, '\\"');
  return `# ===== Decan Konnect router enrollment (MikroTik RouterOS v7) =====
# 1. Complete your HotSpot first (Winbox: IP > Hotspot > Hotspot Setup) on your guest LAN bridge, then run this script.
# 2. Use login-by=mac so authorized devices are admitted automatically.
/ip hotspot profile set [find where hotspot-address!=""] login-by=mac,http-chap mac-auth-mode=mac-as-username
# 3. Let customers reach the portal before they are authorized.
/ip hotspot walled-garden add dst-host=${domain} comment="decan-konnect"
# 4. Redirect the hotspot login page to your business portal.
/file add name="hotspot/login.html" contents="${html}"
# 5. Install the polling agent and run it every 15 seconds.
/system script add name=dk-agent policy=read,write,test,policy,ftp source="${buildAgentScript(o.base, o.token).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$')}"
/system scheduler add name=dk-poll interval=15s on-event="/system script run dk-agent" start-time=startup comment="decan-konnect"
# Done. The router shows as Connected in your dashboard after its first successful poll.
`;
}

/**
 * "The people on my Wi-Fi", found with no server of ours.
 *
 * A page cannot scan its LAN. What every device behind one router does share
 * is the public address the internet sees them as — and a browser can learn
 * its own from a public STUN server, which is the same lookup every WebRTC
 * call already makes. Hash that, and everyone on one Wi-Fi arrives at the same
 * lobby name without telling anyone the address itself.
 *
 * - IPv4: one router, one address.
 * - IPv6: every device has its own, but a home network is one /64, so v6 is
 *   cut to its first four groups.
 * - Mobile data next to you is a different network as far as anything can
 *   tell, which is why a party always has a code too.
 * - STUN can be blocked (some school and office networks). Then there is no
 *   lobby name and the code is the only way in — `null`, never an error.
 */

const STUN = ["stun:stun.l.google.com:19302", "stun:stun.cloudflare.com:3478"];

/** The part of an address that one LAN shares. Pure, and tested. */
export function networkPrefix(ip: string): string {
  let a = ip.trim().toLowerCase();
  if (a.startsWith("[")) a = a.slice(1, a.indexOf("]"));
  if (a.startsWith("::ffff:") && a.includes(".")) a = a.slice(7);
  if (a.includes(".")) return a;
  const zone = a.indexOf("%");
  if (zone >= 0) a = a.slice(0, zone);
  if (!a.includes(":")) return a;
  const [head, tail = ""] = a.split("::");
  const h = head ? head.split(":") : [];
  const t = tail ? tail.split(":") : [];
  const groups = a.includes("::") ? [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill("0"), ...t] : h;
  return groups
    .slice(0, 4)
    .map((g) => g.replace(/^0+(?=.)/, ""))
    .join(":");
}

/**
 * The public address out of a list of ICE candidate lines: the `srflx` one,
 * which is what the STUN server saw. IPv4 first — where a network has both,
 * every device on it agrees on its v4 address, and only usually on its v6.
 */
export function publicAddress(candidates: readonly string[]): string | null {
  const found: string[] = [];
  for (const c of candidates) {
    const parts = c.replace(/^candidate:/, "").split(" ");
    const typ = parts.indexOf("typ");
    if (typ < 0 || parts[typ + 1] !== "srflx") continue;
    if (parts[4]) found.push(parts[4]);
  }
  return found.find((a) => a.includes(".")) ?? found[0] ?? null;
}

async function sha256Hex(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Ask STUN what the internet sees us as. Resolves null if it will not say. */
function askStun(timeoutMs: number): Promise<string | null> {
  return new Promise((resolve) => {
    if (typeof RTCPeerConnection === "undefined") return resolve(null);
    const pc = new RTCPeerConnection({ iceServers: STUN.map((urls) => ({ urls })) });
    const lines: string[] = [];
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      pc.close();
      resolve(publicAddress(lines));
    };
    const timer = window.setTimeout(finish, timeoutMs);
    pc.onicecandidate = (e) => {
      if (!e.candidate) return finish();
      lines.push(e.candidate.candidate);
      // One public address is all we need; stop waiting on the rest.
      if (/ typ srflx /.test(e.candidate.candidate) && e.candidate.candidate.includes(".")) finish();
    };
    pc.createDataChannel("probe");
    pc.createOffer()
      .then((offer) => pc.setLocalDescription(offer))
      .catch(finish);
  });
}

let cached: Promise<string | null> | null = null;

/**
 * This network's lobby name, or null. Computed once per page load: a phone
 * that walks off the Wi-Fi mid-session is rare, and the cost of a stale name
 * is a nearby list that is empty until a reload.
 */
export function networkRoom(): Promise<string | null> {
  cached ??= askStun(4000).then(async (ip) =>
    ip ? `net-${(await sha256Hex(`specdrivengames/party/${networkPrefix(ip)}`)).slice(0, 20)}` : null
  );
  return cached;
}

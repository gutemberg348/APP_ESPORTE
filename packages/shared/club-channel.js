// Keep the profile or channel address and discard tracking parameters from share links.
export function clubChannelUrl(platform, input) {
  const raw = input?.trim();
  if (!raw || raw.length > 2048) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    const path = url.pathname.replace(/\/$/, '');
    if (platform === 'instagram') {
      if (host !== 'instagram.com' || !/^\/[a-z\d._]{1,30}$/i.test(path) ||
          /^\/(?:accounts|about|developer|developers|direct|directory|emails|explore|legal|oauth|p|reel|reels|share|stories|web)$/i.test(path)) return null;
    } else if (platform === 'youtube') {
      if (!['youtube.com', 'm.youtube.com'].includes(host) ||
          !/^\/(?:@[^/]+|(?:channel|c|user)\/[^/]+)(?:\/(?:videos|featured|streams|shorts|live|playlists|community))?$/.test(path)) return null;
    } else return null;
    const address = url.origin + path;
    return address.length <= 2048 ? address : null;
  } catch {
    return null;
  }
}

import type { LucideIconData } from 'lucide-angular';
import {
  Facebook,
  Ghost,
  Instagram,
  Link2,
  Linkedin,
  MessageCircle,
  Music2,
  Pin,
  Send,
  Youtube,
} from 'lucide-angular';

/**
 * Official X (formerly Twitter) mark — Lucide only ships the old bird / plain X.
 * Path from Simple Icons (viewBox 0 0 24 24), filled via currentColor.
 */
export const XTwitter: LucideIconData = [
  [
    'path',
    {
      d: 'M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z',
      fill: 'currentColor',
      stroke: 'none',
      key: 'x-twitter',
    },
  ],
];

/** Lucide icon for a social platform name (hall display + socials page). */
export function socialPlatformIcon(platform: string): LucideIconData {
  const p = platform.toLowerCase();
  if (p.includes('facebook')) return Facebook;
  if (p === 'x' || p.includes('twitter')) return XTwitter;
  if (p.includes('instagram')) return Instagram;
  if (p.includes('linkedin')) return Linkedin;
  if (p.includes('youtube')) return Youtube;
  if (p.includes('tiktok')) return Music2;
  if (p.includes('whatsapp')) return MessageCircle;
  if (p.includes('telegram')) return Send;
  if (p.includes('snapchat')) return Ghost;
  if (p.includes('pinterest')) return Pin;
  return Link2;
}

import type { EmailProvider } from "@/types/hyperlocal";

// ============================================================
// Provider brand assets for the integration grid.
//
// All five providers (Resend, Mailchimp, SendGrid, Constant
// Contact, ActiveCampaign) render their real brand marks
// inline. The monogram fallback is kept around for any future
// provider we add before we vector its mark.
// ============================================================

export interface ProviderBrand {
  name: string;
  /** "Transactional API" or "Marketing platform" — drives card grouping. */
  category: "transactional" | "marketing";
  /** One-line value-prop shown under the name on the card. */
  tagline: string;
  brandColor: string;
  Logo: React.ComponentType<{ className?: string }>;
}

// Real brand mark from simple-icons (CC0).
function ResendLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M14.679 0c4.648 0 7.413 2.765 7.413 6.434s-2.765 6.434-7.413 6.434H12.33L24 24h-8.245l-8.88-8.44c-.636-.588-.93-1.273-.93-1.86 0-.831.587-1.565 1.713-1.883l4.574-1.224c1.737-.465 2.936-1.81 2.936-3.572 0-2.153-1.761-3.4-3.939-3.4H0V0z" />
    </svg>
  );
}

// SendGrid's classic mark: two squares on a diagonal. Carried over from
// pre-Twilio branding and still their most-recognized identifier.
function SendgridLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M0 0h11v11H0zM13 13h11v11H13z" />
    </svg>
  );
}

function MailchimpLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M11.267 0C6.791-.015-1.82 10.246 1.397 12.964l.79.669a3.88 3.88 0 0 0-.22 1.792c.084.84.518 1.644 1.22 2.266.666.59 1.542.964 2.392.964 1.406 3.24 4.62 5.228 8.386 5.34 4.04.12 7.433-1.776 8.854-5.182.093-.24.488-1.316.488-2.267 0-.956-.54-1.352-.885-1.352-.01-.037-.078-.286-.172-.586-.093-.3-.19-.51-.19-.51.375-.563.382-1.065.332-1.35-.053-.353-.2-.653-.496-.964-.296-.311-.902-.63-1.753-.868l-.446-.124c-.002-.019-.024-1.053-.043-1.497-.014-.32-.042-.822-.197-1.315-.186-.668-.508-1.253-.911-1.627 1.112-1.152 1.806-2.422 1.804-3.511-.003-2.095-2.576-2.729-5.746-1.416l-.672.285A678.22 678.22 0 0 0 12.7.504C12.304.159 11.817.002 11.267 0zm.073.873c.166 0 .322.019.465.058.297.084 1.28 1.224 1.28 1.224s-1.826 1.013-3.52 2.426c-2.28 1.757-4.005 4.311-5.037 7.082-.811.158-1.526.618-1.963 1.253-.261-.218-.748-.64-.834-.804-.698-1.326.761-3.902 1.781-5.357C5.834 3.44 9.37.867 11.34.873zm3.286 3.273c.04-.002.06.05.028.074-.143.11-.299.26-.413.414a.04.04 0 0 0 .031.064c.659.004 1.587.235 2.192.574.041.023.012.103-.034.092-.915-.21-2.414-.369-3.97.01-1.39.34-2.45.863-3.224 1.426-.04.028-.086-.023-.055-.06.896-1.035 1.999-1.935 2.987-2.44.034-.018.07.019.052.052-.079.143-.23.447-.278.678-.007.035.032.063.062.042.615-.42 1.684-.868 2.622-.926zm3.023 3.205l.056.001a.896.896 0 0 1 .456.146c.534.355.61 1.216.638 1.845.015.36.059 1.229.074 1.478.034.571.184.651.487.751.17.057.33.098.563.164.706.198 1.125.4 1.39.658.157.162.23.333.253.497.083.608-.472 1.36-1.942 2.041-1.607.746-3.557.935-4.904.785l-.471-.053c-1.078-.145-1.693 1.247-1.046 2.201.417.615 1.552 1.015 2.688 1.015 2.604 0 4.605-1.111 5.35-2.072a.987.987 0 0 0 .06-.085c.036-.055.006-.085-.04-.054-.608.416-3.31 2.069-6.2 1.571 0 0-.351-.057-.672-.182-.255-.1-.788-.344-.853-.891 2.333.72 3.801.039 3.801.039a.072.072 0 0 0 .042-.072.067.067 0 0 0-.074-.06s-1.911.283-3.718-.378c.197-.64.72-.408 1.51-.345a11.045 11.045 0 0 0 3.647-.394c.818-.234 1.892-.697 2.727-1.356.281.618.38 1.299.38 1.299s.219-.04.4.073c.173.106.299.326.213.895-.176 1.063-.628 1.926-1.387 2.72a5.714 5.714 0 0 1-1.666 1.244c-.34.18-.704.334-1.087.46-2.863.935-5.794-.093-6.739-2.3a3.545 3.545 0 0 1-.189-.522c-.403-1.455-.06-3.2 1.008-4.299.065-.07.132-.153.132-.256 0-.087-.055-.179-.102-.243-.374-.543-1.669-1.466-1.409-3.254.187-1.284 1.31-2.189 2.357-2.135.089.004.177.01.266.015.453.027.85.085 1.223.1.625.028 1.187-.063 1.853-.618.225-.187.405-.35.71-.401.028-.005.092-.028.215-.028zm.022 2.18a.42.42 0 0 0-.06.005c-.335.054-.347.468-.228 1.04.068.32.187.595.32.765.175-.02.343-.022.498 0 .089-.205.104-.557.024-.942-.112-.535-.261-.872-.554-.868zm-3.66 1.546a1.724 1.724 0 0 0-1.016.326c-.16.117-.311.28-.29.378.008.032.031.056.088.063.131.015.592-.217 1.122-.25.374-.023.684.094.923.2.239.104.386.173.443.113.037-.038.026-.11-.031-.204-.118-.192-.36-.387-.618-.497a1.601 1.601 0 0 0-.621-.129zm4.082.81c-.171-.003-.313.186-.317.42-.004.236.131.43.303.432.172.003.314-.185.318-.42.004-.236-.132-.429-.304-.432zm-3.58.172c-.05 0-.102.002-.155.008-.311.05-.483.152-.593.247-.094.082-.152.173-.152.237a.075.075 0 0 0 .075.076c.07 0 .228-.063.228-.063a1.98 1.98 0 0 1 1.001-.104c.157.018.23.027.265-.026.01-.016.022-.049-.01-.1-.063-.103-.311-.269-.66-.275zm2.26.4c-.127 0-.235.051-.283.148-.075.154.035.363.246.466.21.104.443.063.52-.09.075-.155-.035-.364-.246-.467a.542.542 0 0 0-.237-.058zm-11.635.024c.048 0 .098 0 .149.003.73.04 1.806.6 2.052 2.19.217 1.41-.128 2.843-1.449 3.069-.123.02-.248.029-.374.026-1.22-.033-2.539-1.132-2.67-2.435-.145-1.44.591-2.548 1.894-2.811.117-.024.252-.04.398-.042zm-.07.927a1.144 1.144 0 0 0-.847.364c-.38.418-.439.988-.366 1.19.027.073.07.094.1.098.064.008.16-.039.22-.2a1.2 1.2 0 0 0 .017-.052 1.58 1.58 0 0 1 .157-.37.689.689 0 0 1 .955-.199c.266.174.369.5.255.81-.058.161-.154.469-.133.721.043.511.357.717.64.738.274.01.466-.143.515-.256.029-.067.005-.107-.011-.125-.043-.053-.113-.037-.18-.021a.638.638 0 0 1-.16.022.347.347 0 0 1-.294-.148c-.078-.12-.073-.3.013-.504.011-.028.025-.058.04-.092.138-.308.368-.825.11-1.317-.195-.37-.513-.602-.894-.65a1.135 1.135 0 0 0-.138-.01z" />
    </svg>
  );
}

// Official Constant Contact icon (extracted from their wordmark SVG).
// Two-color brand mark: blue spiral (#1856ED) + orange spark (#FF9E1A).
// Explicit fills override the IntegrationGrid's currentColor tint —
// intentional, since forcing this to one color would break the brand.
function ConstantContactLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 53 57" className={className} aria-hidden>
      <path fill="#FF9E1A" d="M36.3,23.1c0.5,1.5,1.9,2.4,3.5,2.4c0.4,0,0.8-0.1,1.2-0.2c1.9-0.7,2.9-2.8,2.2-4.7c-1.2-3.3-3.7-5.9-7.2-7.5c-1.8-0.8-4,0-4.9,1.8c-0.8,1.8,0,4,1.8,4.9C34.7,20.6,35.8,21.7,36.3,23.1z" />
      <path fill="#FF9E1A" d="M35.1,0.1c-2-0.4-3.9,0.9-4.3,2.9c-0.4,2,0.9,3.9,2.9,4.3C42,8.9,47.6,14.5,49,22.6c0.3,1.8,1.9,3,3.6,3c0.2,0,0.4,0,0.6-0.1c2-0.4,3.3-2.3,3-4.2C54.3,10.3,46.4,2.3,35.1,0.1z" />
      <path fill="#1856ED" d="M25.8,36.7c-3.3,0-6.1-2.7-6.1-6.1c0-3.3,2.7-6.1,6.1-6.1c2,0,3.7-1.6,3.7-3.7s-1.6-3.7-3.7-3.7c-7.4,0-13.4,6-13.4,13.4c0,7.4,6,13.4,13.4,13.4c7.4,0,13.4-6,13.4-13.4c0-2-1.6-3.7-3.7-3.7c-2,0-3.7,1.6-3.7,3.7C31.9,34,29.1,36.7,25.8,36.7z" />
      <path fill="#1856ED" d="M47.9,27c-2,0-3.7,1.6-3.7,3.7c0,10.2-8.3,18.5-18.5,18.5c-10.2,0-18.5-8.3-18.5-18.5c0-10.2,8.3-18.5,18.5-18.5c2,0,3.7-1.6,3.7-3.7c0-2-1.6-3.7-3.7-3.7C11.6,4.8,0,16.4,0,30.6c0,14.2,11.6,25.8,25.8,25.8s25.8-11.6,25.8-25.8C51.6,28.6,50,27,47.9,27z" />
    </svg>
  );
}

// Official ActiveCampaign glyph (AC_Glyph_Blue) lifted from their brand
// assets. Two-path mark of a stylized chevron + accent shape.
// fill="currentColor" so the IntegrationGrid's brand-tint applies.
function ActiveCampaignLogo({ className }: { className?: string }) {
  // viewBox tight-cropped to the glyph's actual bounds (~120,90 to 206,215)
  // — the official 306x306 source leaves ~70% empty space which renders
  // the icon as a tiny dot in the corner at thumbnail sizes.
  return (
    <svg viewBox="115 85 95 135" className={className} fill="currentColor" aria-hidden>
      <path d="M190.319 152.752L125.953 195.497C122.971 197.485 121.479 200.715 121.479 203.946V214.632L199.514 163.438C202.993 160.953 205.23 156.976 205.23 152.752C205.23 148.527 203.242 144.55 199.514 142.065L121.479 91.3677V101.308C121.479 104.788 123.219 108.018 125.953 109.758L190.319 152.752Z" />
      <path d="M151.55 156.231C155.029 158.467 159.503 158.467 162.982 156.231L168.449 152.503L127.692 124.918C125.207 123.178 121.479 124.918 121.479 128.148V136.349L142.603 150.515L151.55 156.231Z" />
    </svg>
  );
}

// Brand-not-yet-vectored: render a monogram tile in the brand color.
function makeMonogram(letter: string) {
  return function MonogramLogo({ className }: { className?: string }) {
    return (
      <span
        className={className}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 800,
          fontSize: "0.65em",
          letterSpacing: "-0.02em",
        }}
      >
        {letter}
      </span>
    );
  };
}

// Klaviyo intentionally omitted — schema enum supports it for the future
// but the grid only shows providers we're actively planning to ship for.
export const PROVIDER_BRANDS: Partial<Record<EmailProvider, ProviderBrand>> = {
  resend: {
    name: "Resend",
    category: "transactional",
    tagline: "Modern transactional API · BYO domain",
    // Resend's official brand is monochrome (black on white / white on
    // black). Pure #000 disappears on dark theme — neutral zinc-500
    // reads cleanly on both light and dark backgrounds.
    brandColor: "#A1A1AA",
    Logo: ResendLogo,
  },
  sendgrid: {
    name: "SendGrid",
    category: "transactional",
    tagline: "Twilio's transactional ESP · BYO domain",
    brandColor: "#1A82E2",
    Logo: SendgridLogo,
  },
  mailchimp: {
    name: "Mailchimp",
    category: "marketing",
    tagline: "Marketing campaigns · OAuth · audience-based",
    brandColor: "#FFE01B",
    Logo: MailchimpLogo,
  },
  constantcontact: {
    name: "Constant Contact",
    category: "marketing",
    tagline: "Long-standing marketing ESP · list-based",
    brandColor: "#1856ED",
    Logo: ConstantContactLogo,
  },
  activecampaign: {
    name: "ActiveCampaign",
    category: "marketing",
    tagline: "Marketing automation · contact-based",
    brandColor: "#004CFF",
    Logo: ActiveCampaignLogo,
  },
};

export const CATEGORY_LABELS = {
  transactional: "Transactional API",
  marketing: "Marketing platform",
} as const;

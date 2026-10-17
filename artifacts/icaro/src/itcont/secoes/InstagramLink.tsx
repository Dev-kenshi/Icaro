import { siInstagram } from "simple-icons";
import {
  ITCONT_INSTAGRAM_ARIA_LABEL,
  ITCONT_INSTAGRAM_URL,
} from "../seo-static";

type InstagramLinkProps = {
  className?: string;
  testId: string;
};

export default function InstagramLink({
  className = "",
  testId,
}: InstagramLinkProps) {
  const classes = ["itc-instagram-link", className].filter(Boolean).join(" ");

  return (
    <a
      className={classes}
      href={ITCONT_INSTAGRAM_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={ITCONT_INSTAGRAM_ARIA_LABEL}
      data-testid={testId}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        aria-hidden="true"
        focusable="false"
        fill="currentColor"
      >
        <path d={siInstagram.path} />
      </svg>
      <span>@cont_amanha</span>
    </a>
  );
}

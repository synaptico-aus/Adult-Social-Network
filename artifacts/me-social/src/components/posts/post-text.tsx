import { externalPostLinks } from "@/lib/external-post-links";

export function PostText({ body }: { body: string }) {
  return <>{externalPostLinks(body).map((part, index) => part.href ? (
    <a key={index} href={part.href} target="_blank" rel="noopener noreferrer nofollow ugc"
      className="underline underline-offset-4 break-words"
      aria-label={`${part.text} — external link to ${part.domain}, opens in a new tab`}>
      {part.text}
    </a>
  ) : <span key={index}>{part.text}</span>)}</>;
}

import {
  avatarColorForEmail,
  firstNameFromEmail,
} from "@/lib/faq-qa";

export function Avatar({
  email,
  size = 32,
}: {
  email: string | null;
  size?: number;
}) {
  const name = firstNameFromEmail(email);
  const initial = name.charAt(0).toUpperCase();
  const bg = avatarColorForEmail(email);
  return (
    <div
      aria-label={name}
      title={name}
      className="flex flex-shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{
        width: size,
        height: size,
        backgroundColor: bg,
        fontSize: Math.round(size * 0.42),
        lineHeight: 1,
      }}
    >
      {initial}
    </div>
  );
}

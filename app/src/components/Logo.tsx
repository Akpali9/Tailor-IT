export function LogoMark({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="Tailor IT">
      <rect width="64" height="64" rx="16" fill="#632b4a" />
      <path d="M18 20h28v7H35.5v19h-7V27H18z" fill="#fffdfa" />
      <circle cx="46" cy="44" r="4" fill="#aa7a3d" />
    </svg>
  );
}
export default function Logo({ light = false }: { light?: boolean }) {
  return <span className={`brand ${light ? "light" : ""}`}><LogoMark size={34} /> <b>Tailor IT</b></span>;
}

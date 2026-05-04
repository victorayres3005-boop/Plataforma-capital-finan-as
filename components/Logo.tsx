// Logo da Capital Finanças. Variante "full" inclui o nome; "icon" só o círculo.
// `light` inverte para branco (uso sobre fundo navy/escuro).
//
// Antes existiam 7+ cópias divergentes do SVG espalhadas em login, perfil, ajuda,
// page.tsx, parecer, WelcomeModal, Sidebar, Topbar — todas substituídas por este
// componente.

type LogoProps = {
  variant?: "full" | "icon";
  light?: boolean;
  height?: number;
  className?: string;
};

export default function Logo({
  variant = "full",
  light = false,
  height = 26,
  className,
}: LogoProps) {
  const blue = light ? "#ffffff" : "#203b88";
  const green = light ? "#a8d96b" : "#73b815";

  if (variant === "icon") {
    return (
      <svg
        width={height}
        height={height}
        viewBox="0 0 62 62"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Capital Finanças"
        className={className}
      >
        <circle cx="31" cy="27" r="22" stroke={blue} strokeWidth="4.5" fill="none" />
        <circle cx="31" cy="49" r="4.5" fill={blue} />
      </svg>
    );
  }

  const w = Math.round(height * 7.26);
  return (
    <svg
      width={w}
      height={height}
      viewBox="0 0 451 58"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Capital Finanças"
      className={className}
    >
      <circle cx="31" cy="27" r="22" stroke={blue} strokeWidth="4.5" fill="none" />
      <circle cx="31" cy="49" r="4.5" fill={blue} />
      <text
        x="66"
        y="46"
        fontFamily="'Open Sans', Arial, sans-serif"
        fontWeight="700"
        fontSize="38"
        letterSpacing="-0.3"
      >
        <tspan fill={blue}>capital</tspan>
        <tspan fill={green}>finanças</tspan>
      </text>
    </svg>
  );
}

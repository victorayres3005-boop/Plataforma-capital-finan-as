// V2 Design Tokens — Dark Premium Theme
// Identidade preservada: #84BF41 (verde) + #0F172A (navy)

export const T = {
  // ── Backgrounds ──────────────────────────────────────────────────────────────
  bgPage:      "#07101F",   // fundo geral — azul-escuro profundo
  bgCard:      "#0D1B2E",   // card padrão
  bgCardHover: "#112236",   // card em hover
  bgElevated:  "#0A1628",   // inputs, dropdowns
  bgSidebar:   "#040C18",   // sidebar (mais fundo que o card)
  bgOverlay:   "rgba(4,12,24,0.8)",

  // ── Borders ──────────────────────────────────────────────────────────────────
  border:       "rgba(132,191,65,0.12)",   // borda padrão dos cards — tint verde
  borderStrong: "rgba(132,191,65,0.25)",   // borda hover / ativa
  borderSubtle: "rgba(255,255,255,0.05)",  // separadores internos
  borderSidebar:"#0A1E35",                 // divisores do sidebar

  // ── Text ─────────────────────────────────────────────────────────────────────
  textPrimary:   "#E8F0F8",  // títulos e valores principais
  textSecondary: "#7A9AB8",  // labels, sublabels
  textMuted:     "#3D5A7A",  // placeholders, desativados
  textAccent:    "#84BF41",  // verde brand

  // ── Brand Accent ─────────────────────────────────────────────────────────────
  accent:        "#84BF41",
  accentHover:   "#96D44A",
  accentDim:     "rgba(132,191,65,0.10)",  // bg de badge verde
  accentGlow:    "0 0 16px rgba(132,191,65,0.30)",
  accentGlowSm:  "0 0 8px rgba(132,191,65,0.20)",

  // ── Status Colors ─────────────────────────────────────────────────────────────
  // Aprovado
  green:       "#22C55E",
  greenDim:    "rgba(34,197,94,0.12)",
  greenGlow:   "0 0 12px rgba(34,197,94,0.25)",
  // Reprovado
  red:         "#EF4444",
  redDim:      "rgba(239,68,68,0.12)",
  redGlow:     "0 0 12px rgba(239,68,68,0.25)",
  // Pendente / Condicional
  amber:       "#F59E0B",
  amberDim:    "rgba(245,158,11,0.12)",
  amberGlow:   "0 0 12px rgba(245,158,11,0.20)",
  // Em andamento / Info
  blue:        "#3B82F6",
  blueDim:     "rgba(59,130,246,0.12)",
  // Condicional
  purple:      "#A78BFA",
  purpleDim:   "rgba(167,139,250,0.12)",

  // ── Shadows ───────────────────────────────────────────────────────────────────
  shadowCard:  "0 4px 24px rgba(0,0,0,0.40)",
  shadowSm:    "0 2px 8px rgba(0,0,0,0.30)",

  // ── Radius ────────────────────────────────────────────────────────────────────
  radius:      "12px",
  radiusSm:    "8px",
  radiusXs:    "6px",
  radiusFull:  "999px",
} as const;

// Atalhos de estilo reutilizáveis
export const card: React.CSSProperties = {
  background: T.bgCard,
  borderRadius: T.radius,
  border: `1px solid ${T.border}`,
  padding: "20px 24px",
  boxShadow: T.shadowCard,
};

export const labelStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  fontSize: 11,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: T.textSecondary,
  marginBottom: 12,
};

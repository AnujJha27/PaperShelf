export type ThemeMode = "dark" | "light" | "system";

export type ThemeTokens = {
  background: string;
  elevated: string;
  paper: string;
  hover: string;
  selected: string;
  border: string;
  borderStrong: string;
  text: string;
  textMuted: string;
  textFaint: string;
  accent: string;
  accentHover: string;
  accentSoft: string;
  success: string;
  warning: string;
  danger: string;
  info: string;
};

export const darkTokens: ThemeTokens = {
  background: "#111614",
  elevated: "#171D1A",
  paper: "#1B231F",
  hover: "#222D27",
  selected: "#1E352A",
  border: "#2A3830",
  borderStrong: "#37483D",
  text: "#E9F0EB",
  textMuted: "#9BAAA0",
  textFaint: "#748279",
  accent: "#82C7A0",
  accentHover: "#9BD5B4",
  accentSoft: "#B0E0C3",
  success: "#82C7A0",
  warning: "#D6BB78",
  danger: "#DF8990",
  info: "#8FB9D6",
};

export const lightTokens: ThemeTokens = {
  background: "#F4F6F2",
  elevated: "#F8FAF7",
  paper: "#FFFFFF",
  hover: "#ECF1EC",
  selected: "#E2F0E6",
  border: "#DCE5DE",
  borderStrong: "#CBD8CF",
  text: "#1E2A23",
  textMuted: "#66766C",
  textFaint: "#849188",
  accent: "#367A58",
  accentHover: "#2C6849",
  accentSoft: "#25543C",
  success: "#367A58",
  warning: "#8D6D18",
  danger: "#B64D57",
  info: "#4C7890",
};

export const feedPalette = [
  "#5BC8D9",
  "#58B7C5",
  "#5E9ECF",
  "#708BCB",
  "#787BC4",
  "#8B78B9",
  "#56AA9E",
];

export function feedColor(name: string) {
  return feedPalette[[...name].reduce((hash, char) => hash + char.charCodeAt(0), 0) % feedPalette.length];
}

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
  background: "#0B0F14",
  elevated: "#10161D",
  paper: "#141B23",
  hover: "#19222C",
  selected: "#10262B",
  border: "#222D38",
  borderStrong: "#2A3642",
  text: "#E7EEF5",
  textMuted: "#95A5B5",
  textFaint: "#718190",
  accent: "#5BC8D9",
  accentHover: "#73D3E1",
  accentSoft: "#8ADCE7",
  success: "#63C7A6",
  warning: "#D3B66A",
  danger: "#D47A80",
  info: "#72A7D8",
};

export const lightTokens: ThemeTokens = {
  background: "#F3F6F8",
  elevated: "#F8FAFB",
  paper: "#FFFFFF",
  hover: "#EEF3F5",
  selected: "#E7F5F7",
  border: "#E1E7EB",
  borderStrong: "#D4DEE4",
  text: "#17212B",
  textMuted: "#647686",
  textFaint: "#81909C",
  accent: "#168CA0",
  accentHover: "#117B8D",
  accentSoft: "#0D6A7A",
  success: "#168565",
  warning: "#8B6A12",
  danger: "#B64D57",
  info: "#3E75A7",
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

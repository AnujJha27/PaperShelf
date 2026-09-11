import type { Components, Theme } from "@mui/material/styles";

export const components: Components<Theme> = {
  MuiCssBaseline: { styleOverrides: { body: { minWidth: 320 }, "::selection": { backgroundColor: "rgba(91, 200, 217, 0.25)" } } },
  MuiButton: { defaultProps: { disableElevation: true }, styleOverrides: { root: { borderRadius: 8, minHeight: 36, paddingInline: 14 } } },
  MuiIconButton: { styleOverrides: { root: { borderRadius: 8 } } },
  MuiChip: { styleOverrides: { root: { borderRadius: 7, fontWeight: 600 }, sizeSmall: { height: 24 } } },
  MuiPaper: { defaultProps: { variant: "outlined" }, styleOverrides: { root: { backgroundImage: "none" } } },
  MuiCard: { defaultProps: { variant: "outlined" }, styleOverrides: { root: { backgroundImage: "none", borderRadius: 12 } } },
  MuiTextField: { defaultProps: { size: "small" } },
  MuiOutlinedInput: { styleOverrides: { root: { borderRadius: 8 } } },
  MuiDrawer: { styleOverrides: { paper: { backgroundImage: "none" } } },
  MuiDialog: { styleOverrides: { paper: { borderRadius: 14 } } },
  MuiTooltip: { defaultProps: { arrow: true } },
};

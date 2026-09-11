import type { Components, Theme } from "@mui/material/styles";

export const components: Components<Theme> = {
  MuiCssBaseline: { styleOverrides: { body: { minWidth: 320 }, "::selection": { backgroundColor: "rgba(91, 200, 217, 0.25)" } } },
  MuiButton: { defaultProps: { disableElevation: true }, styleOverrides: { root: { borderRadius: 10, minHeight: 38, paddingInline: 15, fontWeight: 650 } } },
  MuiIconButton: { styleOverrides: { root: { borderRadius: 10 } } },
  MuiChip: { styleOverrides: { root: { borderRadius: 8, fontWeight: 600 }, sizeSmall: { height: 25 } } },
  MuiPaper: { defaultProps: { variant: "outlined" }, styleOverrides: { root: { backgroundImage: "none", borderRadius: 14 } } },
  MuiCard: { defaultProps: { variant: "outlined" }, styleOverrides: { root: { backgroundImage: "none", borderRadius: 16, transition: "border-color 160ms ease, box-shadow 160ms ease", "&:hover": { borderColor: "divider", boxShadow: "0 8px 24px rgba(21, 35, 27, 0.06)" } } } },
  MuiTextField: { defaultProps: { size: "small" } },
  MuiOutlinedInput: { styleOverrides: { root: { borderRadius: 8 } } },
  MuiDrawer: { styleOverrides: { paper: { backgroundImage: "none" } } },
  MuiDialog: { styleOverrides: { paper: { borderRadius: 14 } } },
  MuiTooltip: { defaultProps: { arrow: true } },
};

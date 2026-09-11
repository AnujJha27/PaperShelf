import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from "@mui/material";

export function ConfirmDialog({ open, title, description, confirmLabel = "Confirm", onClose, onConfirm }: { open: boolean; title: string; description?: string; confirmLabel?: string; onClose: () => void; onConfirm: () => void }) {
  return <Dialog open={open} onClose={onClose}><DialogTitle>{title}</DialogTitle>{description && <DialogContent><Typography color="text.secondary">{description}</Typography></DialogContent>}<DialogActions><Button onClick={onClose}>Cancel</Button><Button variant="contained" color="primary" onClick={onConfirm}>{confirmLabel}</Button></DialogActions></Dialog>;
}

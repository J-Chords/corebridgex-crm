"use client";

import { useEffect, useState } from "react";
import { AlertCircle } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { companiesProvider } from "@/lib/data/providers";
import type { ClientContact } from "@/lib/data/types";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FloatingLabelInput } from "@/components/ui/floating-label-input";
import { Alert, AlertTitle } from "@/components/ui/alert";

interface ContactFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  contact?: ClientContact;
  onSaved: () => void;
}

const EMPTY_FORM = { name: "", title: "", email: "", phone: "", isPrimary: false };

export function ContactFormDialog({ open, onOpenChange, companyId, contact, onSaved }: ContactFormDialogProps) {
  const { user } = useAuth();
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    // Reset the form to match whichever contact (or blank) the dialog was opened for.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setError(null);
    if (contact) {
      setForm({
        name: contact.name,
        title: contact.title ?? "",
        email: contact.email ?? "",
        phone: contact.phone ?? "",
        isPrimary: contact.isPrimary,
      });
    } else {
      setForm(EMPTY_FORM);
    }
  }, [open, contact]);

  if (!user) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const input = {
        name: form.name.trim(),
        title: form.title.trim() || null,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        isPrimary: form.isPrimary,
        notes: contact?.notes ?? null,
      };
      if (contact) {
        await companiesProvider.updateContact(user, contact.id, input);
      } else {
        await companiesProvider.createContact(user, companyId, input);
      }
      onSaved();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save contact.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{contact ? "Edit contact" : "Add client contact"}</DialogTitle>
            <DialogDescription>
              Reference-only — this person never logs in to Corebridge X.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <FloatingLabelInput
              label="Full name"
              required
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            />
            <FloatingLabelInput
              label="Title"
              value={form.title}
              onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
            />
            <FloatingLabelInput
              label="Email"
              type="email"
              value={form.email}
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
            />
            <FloatingLabelInput
              label="Phone"
              type="tel"
              value={form.phone}
              onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
            />
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={form.isPrimary}
                onCheckedChange={(checked) => setForm((p) => ({ ...p, isPrimary: checked === true }))}
              />
              Mark as primary contact
            </label>

            {error && (
              <Alert variant="destructive">
                <AlertCircle aria-hidden="true" />
                <AlertTitle>{error}</AlertTitle>
              </Alert>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !form.name}>
              {isSubmitting ? "Saving…" : contact ? "Save changes" : "Add contact"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

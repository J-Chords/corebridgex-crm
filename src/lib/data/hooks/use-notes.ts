"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { notesProvider } from "@/lib/data/providers";
import type { NoteWithAuthor } from "@/lib/data/providers/notes-provider";

export function useTaskNotes(taskId: string) {
  const { user } = useAuth();
  const [notes, setNotes] = useState<NoteWithAuthor[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    const result = await notesProvider.listNotesForTask(user, taskId);
    setNotes(result);
    setIsLoading(false);
  }, [user, taskId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  return { notes, isLoading, refresh };
}

export function useCompanyNotes(companyId: string) {
  const { user } = useAuth();
  const [notes, setNotes] = useState<NoteWithAuthor[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    const result = await notesProvider.listNotesForCompany(user, companyId);
    setNotes(result);
    setIsLoading(false);
  }, [user, companyId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  return { notes, isLoading, refresh };
}

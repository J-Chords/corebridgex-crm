export interface ChecklistItem {
  id: string;
  taskId: string;
  description: string;
  isDone: boolean;
  position: number;
  completedById: string | null;
  completedAt: string | null;
}

export interface Document {
  id: string;
  companyId: string;
  taskId: string | null;
  noteId: string | null;
  fileName: string;
  storagePath: string;
  uploadedById: string;
  createdAt: string;
}

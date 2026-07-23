export interface TaskTemplate {
  id: string;
  name: string;
  description: string | null;
  serviceLineId: string | null;
  createdById: string;
}

export interface TemplateChecklistItem {
  id: string;
  templateId: string;
  description: string;
  position: number;
}

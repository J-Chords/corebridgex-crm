import type { ActivityCatalogProvider, DepartmentWithActivities } from "../activity-catalog-provider";
import type { Department } from "../../types";
import { db } from "./mock-db";

function toDepartmentWithActivities(department: Department): DepartmentWithActivities {
  const activities = db.activities
    .filter((a) => a.departmentId === department.id)
    .sort((a, b) => a.position - b.position);
  return { ...department, activities };
}

export const mockActivityCatalogProvider: ActivityCatalogProvider = {
  async listDepartments(brandId, serviceLineId) {
    const departments = db.departments
      .filter((d) => !brandId || d.brandId === brandId)
      .filter((d) => !serviceLineId || d.serviceLineId === serviceLineId)
      .sort((a, b) => a.position - b.position);
    return departments.map(toDepartmentWithActivities);
  },
};

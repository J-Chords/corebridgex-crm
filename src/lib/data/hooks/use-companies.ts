"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { companiesProvider } from "@/lib/data/providers";
import type { CompanyWithRelations } from "@/lib/data/providers/companies-provider";
import type { Brand, ClientContact, ServiceLine, User } from "@/lib/data/types";

export function useCompanies() {
  const { user } = useAuth();
  const [companies, setCompanies] = useState<CompanyWithRelations[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    const result = await companiesProvider.listCompanies(user);
    setCompanies(result);
    setIsLoading(false);
  }, [user]);

  useEffect(() => {
    // Standard fetch-on-mount: `refresh` sets state once the provider call resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  return { companies, isLoading, refresh };
}

export function useCompany(id: string) {
  const { user } = useAuth();
  const [company, setCompany] = useState<CompanyWithRelations | null>(null);
  const [contacts, setContacts] = useState<ClientContact[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    const [companyResult, contactsResult] = await Promise.all([
      companiesProvider.getCompany(user, id),
      companiesProvider.listContacts(user, id).catch(() => []),
    ]);
    setCompany(companyResult);
    setContacts(contactsResult);
    setNotFound(!companyResult);
    setIsLoading(false);
  }, [user, id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  return { company, contacts, isLoading, notFound, refresh };
}

export function useCompanyLookups() {
  const { user } = useAuth();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [serviceLines, setServiceLines] = useState<ServiceLine[]>([]);
  const [assignableStaff, setAssignableStaff] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) return;
    const [brandsResult, serviceLinesResult, staffResult] = await Promise.all([
      companiesProvider.listBrands(),
      companiesProvider.listServiceLines(),
      companiesProvider.listAssignableStaff(user),
    ]);
    setBrands(brandsResult);
    setServiceLines(serviceLinesResult);
    setAssignableStaff(staffResult);
    setIsLoading(false);
  }, [user]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  return { brands, serviceLines, assignableStaff, isLoading, refresh };
}

/** Time-of-day greeting for a dashboard hero — shared by every role's landing dashboard. */
export function greeting(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function firstName(fullName: string) {
  return fullName.split(" ")[0];
}

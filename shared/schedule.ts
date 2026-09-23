import { addDays } from './dates.js';

export interface PlannedWeek {
  week: number;
  start_date: string;
  end_date: string;
  matchups: [string, string][];
}

/**
 * Round-robin schedule (circle method). With an odd number of teams one team
 * has a bye each week. Weeks run seven days from startDate.
 */
export function roundRobinSchedule(teamIds: string[], startDate: string, weeks: number): PlannedWeek[] {
  const teams: (string | null)[] = [...teamIds];
  if (teams.length % 2 === 1) teams.push(null);
  const n = teams.length;
  const out: PlannedWeek[] = [];
  if (n < 2) return out;
  let rotation = [...teams];
  for (let w = 0; w < weeks; w++) {
    const round = w % (n - 1);
    if (round === 0) rotation = [...teams];
    const matchups: [string, string][] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = rotation[i];
      const b = rotation[n - 1 - i];
      if (a && b) matchups.push(w % 2 === 0 ? [a, b] : [b, a]);
    }
    const start = addDays(startDate, w * 7);
    out.push({ week: w + 1, start_date: start, end_date: addDays(start, 6), matchups });
    // Keep the first team fixed and rotate the rest one step.
    rotation = [rotation[0], rotation[n - 1], ...rotation.slice(1, n - 1)];
  }
  return out;
}

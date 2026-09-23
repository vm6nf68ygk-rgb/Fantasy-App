// Generated, fictional NHL data for demo mode. Player names are made up;
// games and stats are random but repeatable for the same dates.

import { NHL_TEAMS, type NhlGame, type Player } from '../../../shared/nhl';
import { addDays, dateRange, seasonForDate, todayEastern } from '../../../shared/dates';
import { sumStats, type GameLine, type StatLine } from '../../../shared/scoring';
import type { StatsSource } from '../stats';

const FIRST = [
  'Aleks', 'Ben', 'Brody', 'Cal', 'Carter', 'Chase', 'Cole', 'Connor', 'Dax', 'Declan', 'Dylan', 'Eli',
  'Emil', 'Erik', 'Evan', 'Felix', 'Finn', 'Gabe', 'Gus', 'Hank', 'Isak', 'Jack', 'Jake', 'Jonas',
  'Kasper', 'Kyle', 'Lars', 'Leo', 'Liam', 'Logan', 'Luca', 'Luke', 'Marco', 'Matt', 'Max', 'Mikko',
  'Nate', 'Nico', 'Nils', 'Noah', 'Oskar', 'Owen', 'Pavel', 'Quinn', 'Reid', 'Riley', 'Rory', 'Ryan',
  'Sam', 'Sebastian', 'Seth', 'Simon', 'Teemu', 'Theo', 'Troy', 'Tyler', 'Viktor', 'Wade', 'Will', 'Zach',
];
const LAST = [
  'Aberg', 'Albright', 'Barkov', 'Beaudry', 'Bergstrom', 'Blackwood', 'Boucher', 'Brandt', 'Castellano',
  'Chartier', 'Cormier', 'Dahlberg', 'Delorme', 'Donovan', 'Dubois', 'Eklund', 'Fairbanks', 'Falk',
  'Fontaine', 'Gagnon', 'Gallant', 'Granlund', 'Hagen', 'Halvorsen', 'Hartley', 'Holm', 'Ivanov', 'Jarvis',
  'Johansson', 'Kallio', 'Keller', 'Kowalski', 'Kuznetsov', 'Laine', 'Lambert', 'Larsen', 'Lemieux',
  'Lindqvist', 'MacLeod', 'Marchand', 'McAllister', 'Mercer', 'Morin', 'Nieminen', 'Novak', 'Nyberg',
  'OBrien', 'Olsen', 'Ouellet', 'Pelletier', 'Petrov', 'Poirier', 'Quigley', 'Rasmussen', 'Reinholt',
  'Rousseau', 'Salo', 'Sandin', 'Savard', 'Sheridan', 'Sorensen', 'Stahl', 'Strand', 'Sutter', 'Tanner',
  'Thibault', 'Tremblay', 'Vachon', 'Virtanen', 'Walsh', 'Wennberg', 'Whitlock', 'Yakovlev', 'Zadina',
];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function poisson(r: () => number, mean: number): number {
  const l = Math.exp(-mean);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= r();
  } while (p > l);
  return k - 1;
}

function pickWeighted<T>(r: () => number, items: T[], weight: (t: T) => number): T {
  const total = items.reduce((s, i) => s + weight(i), 0);
  let x = r() * total;
  for (const item of items) {
    x -= weight(item);
    if (x <= 0) return item;
  }
  return items[items.length - 1];
}

interface DemoPlayer {
  id: number;
  name: string;
  pos: Player['pos'];
  team: string;
  number: number;
  talent: number;
  depth: number;
}

function buildPlayers(): DemoPlayer[] {
  const r = rng(20262027);
  const used = new Set<string>();
  const out: DemoPlayer[] = [];
  let id = 8900001;
  const name = () => {
    for (;;) {
      const n = `${FIRST[Math.floor(r() * FIRST.length)]} ${LAST[Math.floor(r() * LAST.length)].replace('OBrien', "O'Brien")}`;
      if (!used.has(n)) {
        used.add(n);
        return n;
      }
    }
  };
  for (const team of NHL_TEAMS) {
    const numbers = new Set<number>();
    const number = () => {
      for (;;) {
        const n = 2 + Math.floor(r() * 97);
        if (!numbers.has(n)) {
          numbers.add(n);
          return n;
        }
      }
    };
    const teamBoost = 0.85 + r() * 0.3;
    const forwards: Player['pos'][] = ['C', 'L', 'R', 'C', 'L', 'R', 'C', 'L', 'R', 'C', 'L', 'R'];
    forwards.forEach((pos, depth) => {
      const talent = Math.max(0.25, (1.7 - depth * 0.12 + (r() - 0.5) * 0.5) * teamBoost);
      out.push({ id: id++, name: name(), pos, team, number: number(), talent, depth });
    });
    for (let depth = 0; depth < 7; depth++) {
      const talent = Math.max(0.2, (1.2 - depth * 0.12 + (r() - 0.5) * 0.4) * teamBoost);
      out.push({ id: id++, name: name(), pos: 'D', team, number: number(), talent, depth });
    }
    for (let depth = 0; depth < 2; depth++) {
      out.push({ id: id++, name: name(), pos: 'G', team, number: number(), talent: depth === 0 ? 1.1 + r() * 0.2 : 0.9, depth });
    }
  }
  return out;
}

const PLAYERS = buildPlayers();
const BY_TEAM = new Map<string, DemoPlayer[]>();
for (const p of PLAYERS) BY_TEAM.set(p.team, [...(BY_TEAM.get(p.team) ?? []), p]);

function gamesOn(date: string, now: Date): NhlGame[] {
  const r = rng(hash(`schedule:${date}`));
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  const count = day === 0 || day === 6 ? 9 + Math.floor(r() * 5) : 3 + Math.floor(r() * 8);
  const teams = [...NHL_TEAMS].sort(() => r() - 0.5);
  const games: NhlGame[] = [];
  for (let i = 0; i < count; i++) {
    const home = teams[i * 2];
    const away = teams[i * 2 + 1];
    // 7:00 PM, 7:30 PM or 10:00 PM Eastern (EDT offset; close enough for a demo).
    const slot = [23, 23.5, 26][Math.floor(r() * 3)];
    const start = new Date(`${date}T00:00:00Z`);
    start.setUTCMinutes(slot * 60);
    const id = Number(date.replaceAll('-', '')) * 100 + i;
    const elapsed = (now.getTime() - start.getTime()) / 3600000;
    const state = elapsed > 2.6 ? 'OFF' : elapsed > 0 ? 'LIVE' : 'FUT';
    const result = state === 'FUT' ? null : playGame(id, home, away);
    games.push({
      id,
      date,
      start: start.toISOString(),
      state,
      home,
      away,
      homeScore: result ? result.homeGoals : null,
      awayScore: result ? result.awayGoals : null,
    });
  }
  return games;
}

function playGame(gameId: number, home: string, away: string) {
  const r = rng(hash(`game:${gameId}`));
  let homeGoals = poisson(r, 3.1);
  let awayGoals = poisson(r, 2.9);
  let overtime = false;
  if (homeGoals === awayGoals) {
    overtime = true;
    if (r() < 0.5) homeGoals++;
    else awayGoals++;
  }
  const lines: GameLine[] = [];
  const date = `${String(gameId).slice(0, 4)}-${String(gameId).slice(4, 6)}-${String(gameId).slice(6, 8)}`;
  const sides = [
    { team: home, opp: away, goals: homeGoals, against: awayGoals },
    { team: away, opp: home, goals: awayGoals, against: homeGoals },
  ];
  const shotsFor: number[] = [];
  for (const side of sides) {
    const roster = BY_TEAM.get(side.team)!;
    const skaters = roster.filter((p) => p.pos !== 'G' && !(p.pos === 'D' && p.depth === 6));
    const stats = new Map<number, Required<Pick<StatLine, 'G' | 'A' | 'PM' | 'PIM' | 'PPP' | 'SHP' | 'GWG' | 'SOG' | 'HIT' | 'BLK'>>>();
    for (const p of skaters) {
      stats.set(p.id, {
        G: 0, A: 0, PM: 0,
        PIM: r() < 0.14 ? 2 : 0,
        PPP: 0, SHP: 0, GWG: 0,
        SOG: poisson(r, p.pos === 'D' ? 1.2 * p.talent : 1.6 * p.talent),
        HIT: poisson(r, p.pos === 'D' ? 1.6 : 1.1),
        BLK: poisson(r, p.pos === 'D' ? 1.5 : 0.4),
      });
    }
    const weight = (p: DemoPlayer) => (p.pos === 'D' ? 0.35 : 1) * p.talent * p.talent;
    for (let g = 0; g < side.goals; g++) {
      const scorer = pickWeighted(r, skaters, weight);
      const s = stats.get(scorer.id)!;
      s.G++;
      s.SOG++;
      const special = r();
      const pp = special < 0.22;
      const sh = special > 0.97;
      if (pp) s.PPP++;
      if (sh) s.SHP++;
      if (side.goals > side.against && g === side.against) s.GWG++;
      const involved = [scorer];
      const assists = r() < 0.1 ? 0 : r() < 0.35 ? 1 : 2;
      for (let a = 0; a < assists; a++) {
        const helper = pickWeighted(
          r,
          skaters.filter((p) => !involved.includes(p)),
          (p) => (p.pos === 'D' ? 0.8 : 1) * p.talent,
        );
        involved.push(helper);
        const h = stats.get(helper.id)!;
        h.A++;
        if (pp) h.PPP++;
        if (sh) h.SHP++;
      }
      if (!pp) {
        while (involved.length < 5) {
          const extra = skaters[Math.floor(r() * skaters.length)];
          if (!involved.includes(extra)) involved.push(extra);
        }
        for (const p of involved) stats.get(p.id)!.PM++;
      }
    }
    for (let g = 0; g < side.against; g++) {
      if (r() < 0.25) continue; // power-play goal against
      const onIce = new Set<DemoPlayer>();
      while (onIce.size < 5) onIce.add(skaters[Math.floor(r() * skaters.length)]);
      for (const p of onIce) stats.get(p.id)!.PM--;
    }
    let shots = 0;
    for (const p of skaters) {
      const s = stats.get(p.id)!;
      shots += s.SOG;
      lines.push({ playerId: p.id, date, gameId, team: side.team, opp: side.opp, stats: s });
    }
    shotsFor.push(shots);
  }
  sides.forEach((side, i) => {
    const goalies = BY_TEAM.get(side.team)!.filter((p) => p.pos === 'G');
    const starter = r() < 0.7 ? goalies[0] : goalies[1];
    const shotsAgainst = Math.max(shotsFor[1 - i], side.against + 12);
    const won = side.goals > side.against;
    lines.push({
      playerId: starter.id,
      date,
      gameId,
      team: side.team,
      opp: side.opp,
      stats: {
        W: won ? 1 : 0,
        L: !won && !overtime ? 1 : 0,
        OTL: !won && overtime ? 1 : 0,
        GA: side.against,
        SV: shotsAgainst - side.against,
        SO: won && side.against === 0 ? 1 : 0,
      },
    });
  });
  return { homeGoals, awayGoals, lines };
}

function linesBetween(from: string, to: string, now: Date): GameLine[] {
  const out: GameLine[] = [];
  for (const date of dateRange(from, to)) {
    for (const game of gamesOn(date, now)) {
      if (game.state === 'FUT') continue;
      out.push(...playGame(game.id, game.home, game.away).lines);
    }
  }
  return out;
}

export function createDemoStats(seasonStart: string): StatsSource {
  return {
    demo: true,
    async players() {
      const now = new Date();
      const today = todayEastern(now);
      const lines = seasonStart <= addDays(today, -1) ? linesBetween(seasonStart, addDays(today, -1), now) : [];
      const byPlayer = new Map<number, StatLine[]>();
      for (const l of lines) byPlayer.set(l.playerId, [...(byPlayer.get(l.playerId) ?? []), l.stats]);
      const players: Player[] = PLAYERS.map((p) => {
        const r = rng(hash(`prev:${p.id}`));
        const gp = p.pos === 'G' ? (p.depth === 0 ? 50 + Math.floor(r() * 12) : 25 + Math.floor(r() * 10)) : 60 + Math.floor(r() * 22);
        const g = Math.round(p.talent * p.talent * (p.pos === 'D' ? 5 : 16) * (0.8 + r() * 0.4));
        const a = Math.round(p.talent * (p.pos === 'D' ? 26 : 28) * (0.8 + r() * 0.4));
        const wins = Math.round(gp * (0.45 + r() * 0.2));
        const prevStats: StatLine =
          p.pos === 'G'
            ? { W: wins, L: Math.round((gp - wins) * 0.75), OTL: Math.round((gp - wins) * 0.25), GA: Math.round(gp * 2.8), SV: Math.round(gp * 25), SO: Math.floor(r() * 5) }
            : {
                G: g, A: a, PM: Math.round((r() - 0.45) * 30), PIM: Math.round(r() * 50), PPP: Math.round((g + a) * 0.3),
                SHP: Math.floor(r() * 3), GWG: Math.round(g * 0.15), SOG: Math.round(gp * p.talent * 1.9),
                HIT: Math.round(gp * (p.pos === 'D' ? 1.5 : 1)), BLK: Math.round(gp * (p.pos === 'D' ? 1.4 : 0.4)),
              };
        const games = byPlayer.get(p.id) ?? [];
        return {
          id: p.id,
          name: p.name,
          pos: p.pos,
          team: p.team,
          number: p.number,
          headshot: null,
          gp: games.length,
          stats: sumStats(games),
          prevGp: gp,
          prevStats,
        };
      });
      return { season: seasonForDate(today), updated: now.toISOString(), players };
    },
    async games(from, to) {
      return linesBetween(from, to, new Date());
    },
    async schedule(from, to) {
      const now = new Date();
      return dateRange(from, to).flatMap((d) => gamesOn(d, now));
    },
  };
}

/** Demo players sorted by how good they are, for handing out demo rosters. */
export function demoPlayersByTalent(): { id: number; name: string; pos: Player['pos']; team: string }[] {
  return [...PLAYERS]
    .sort((a, b) => (b.pos === 'G' ? b.talent * 1.3 : b.talent) - (a.pos === 'G' ? a.talent * 1.3 : a.talent))
    .map(({ id, name, pos, team }) => ({ id, name, pos, team }));
}

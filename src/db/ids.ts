/** ID uuid deterministik yang dipakai seed & fallback demo dashboard. */

const SEGMENT = "00000000-0000-4000-8000";

export const ID = (n: number): string => `${SEGMENT}-${String(n).padStart(12, "0")}`;

export const IDS = {
  // users
  admin: ID(1),
  guru1: ID(11),
  guru2: ID(12),
  guru3: ID(13),
  guru4: ID(14),
  guru5: ID(15),
  murid1: ID(21),
  murid2: ID(22),
  murid3: ID(23),
  murid4: ID(24),
  murid5: ID(25),
  ortu1: ID(31),
  ortu2: ID(32),
  ortu3: ID(33),
  // classes
  c1: ID(41),
  c2: ID(42),
  c3: ID(43),
  // subjects
  sMtk: ID(51),
  sFis: ID(52),
  sKim: ID(53),
  sBin: ID(54),
  sIng: ID(55),
} as const;

export const DEMO_MURID_ID = IDS.murid1;
export const DEMO_GURU_ID = IDS.guru1;

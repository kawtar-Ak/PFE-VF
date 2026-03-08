const LIVE_SHORT_STATUSES = new Set(['1H', '2H', 'HT', 'ET', 'P', 'BT']);
const FINISHED_SHORT_STATUSES = new Set(['FT', 'AET', 'PEN']);
const FINISHED_LONG_STATUSES = new Set([
  'FINISHED',
  'MATCH FINISHED',
  'FULL TIME',
  'AFTER EXTRA TIME',
  'PENALTY SHOOTOUT',
  'PENALTIES',
  'ENDED',
]);

const norm = (value) => String(value || '').trim().toUpperCase();

export const getMatchPhase = (match) => {
  const statusShort = norm(match?.statusShort);
  const status = norm(match?.status);
  const now = Date.now();
  const matchTime = new Date(match?.date).getTime();
  const minute = Number(match?.minute);
  const hasScore = match?.homeScore !== null && match?.homeScore !== undefined && match?.awayScore !== null && match?.awayScore !== undefined;
  const isPastKickoff = Number.isFinite(matchTime) && now > matchTime;
  const isOldEnoughToBeFinished = Number.isFinite(matchTime) && now - matchTime > 3 * 60 * 60 * 1000;

  // Priorite: un statusShort final doit toujours afficher "termine"
  if (
    FINISHED_SHORT_STATUSES.has(statusShort) ||
    FINISHED_LONG_STATUSES.has(status) ||
    status === 'FT'
  ) {
    return 'finished';
  }

  // Secours: si le match est ancien et a deja un score final, on force "termine"
  if (isPastKickoff && (minute >= 105 || (isOldEnoughToBeFinished && hasScore))) {
    return 'finished';
  }

  if (LIVE_SHORT_STATUSES.has(statusShort) || status === 'LIVE') {
    return 'live';
  }

  return 'scheduled';
};

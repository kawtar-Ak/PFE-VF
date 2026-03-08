import React from 'react';

import TeamLogo from './TeamLogo';

const DEFAULT_LEAGUE_LOGO = require('../img/result_0.jpeg');
const BOTOLA_LOGO_URL = 'https://media.api-sports.io/football/leagues/200.png';

const normalizeText = (value) => String(value || '').trim().toLowerCase();

export const resolveLeagueLogoUri = (source = {}) => {
  const leagueName = normalizeText(source?.league || source?.leagueName || source?.name || source?.league?.name);
  const country = normalizeText(source?.country || source?.leagueCountry || source?.league?.country);
  const leagueId = Number(source?.leagueId ?? source?.id ?? source?.league?.leagueId ?? source?.league?.id);
  const apiLogo = source?.leagueLogo || source?.logo || source?.league?.logo || null;

  const isBotola = leagueId === 200 || (
    leagueName.includes('botola') &&
    (country.includes('morocco') || country.includes('maroc'))
  );

  if (isBotola) {
    return BOTOLA_LOGO_URL;
  }

  return typeof apiLogo === 'string' && apiLogo.startsWith('http') ? apiLogo : null;
};

export default function LeagueLogo({ source, size = 20, style }) {
  return (
    <TeamLogo
      uri={resolveLeagueLogoUri(source)}
      fallbackSource={DEFAULT_LEAGUE_LOGO}
      size={size}
      style={style}
    />
  );
}

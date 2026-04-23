export const HOLE_PAR = 4;

const RESULT_DEFS = {
  ace: {
    headline: 'HOLE IN ONE!',
    subtitle: 'Hole complete',
    color: '#ffd24a',
    glow: '#ffb200',
    announcerSize: '6.5vw',
  },
  eagle: {
    headline: 'EAGLE!',
    subtitle: 'Hole complete',
    color: '#ffd24a',
    glow: '#ffb200',
    announcerSize: '6vw',
  },
  birdie: {
    headline: 'BIRDIE!',
    subtitle: 'Hole complete',
    color: '#7ef2ff',
    glow: '#32c9ff',
    announcerSize: '5.5vw',
  },
  par: {
    headline: 'PAR',
    subtitle: 'Hole complete',
    color: '#e8f1ff',
    glow: '#7f9cff',
    announcerSize: '4.9vw',
  },
  bogey: {
    headline: 'BOGEY',
    subtitle: 'Hole complete',
    color: '#ffae63',
    glow: '#ff7f2a',
    announcerSize: '4.7vw',
  },
  double: {
    headline: 'DOUBLE BOGEY',
    subtitle: 'Hole complete',
    color: '#ff8b63',
    glow: '#ff5b38',
    announcerSize: '4.9vw',
  },
  disaster: {
    headline: 'TRIPLE BOGEY',
    subtitle: 'Hole complete',
    color: '#ff5c8f',
    glow: '#ff375f',
    announcerSize: '5.2vw',
  },
};

export function getScoreResult(strokes, par = HOLE_PAR) {
  if (strokes === 1) return RESULT_DEFS.ace;
  if (strokes <= par - 2) return RESULT_DEFS.eagle;
  if (strokes === par - 1) return RESULT_DEFS.birdie;
  if (strokes === par) return RESULT_DEFS.par;
  if (strokes === par + 1) return RESULT_DEFS.bogey;
  if (strokes === par + 2) return RESULT_DEFS.double;
  return RESULT_DEFS.disaster;
}

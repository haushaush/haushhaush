import { describe, it, expect } from 'vitest';
import { matchSurveyDetailed, normalizeEmail, normalizeCompany, isFreemail } from '../../supabase/functions/_shared/survey-matching';

const stursberg = { client_id: 'st', mitarbeiter_id: 'csm', name: 'Alexander Stursberg', vor_nachname: 'Alexander Stursberg', emails: ['alexander.stursberg@allianz.de'] };
const other = { client_id: 'ot', mitarbeiter_id: 'csm', name: 'Maria Muster', vor_nachname: 'Maria Muster', emails: ['maria.muster@allianz.de'] };

describe('survey matching', () => {
  it('normalizes dots and plus suffix in the local part', () => {
    expect(normalizeEmail(' Alexander.Stursberg+x@Allianz.de ')).toBe('alexanderstursberg@allianz.de');
  });
  it('matches by email without the dot', () => {
    const m = matchSurveyDetailed('alexanderstursberg@allianz.de', '', 'Allianz', [stursberg, other]);
    expect(m.hit?.client_id).toBe('st'); expect(m.grund).toBe('email');
  });
  it('treats an email shared by several customers as ambiguous', () => {
    const m = matchSurveyDetailed('alexander.stursberg@allianz.de', 'Alexander Stursberg', 'Allianz', [stursberg, { ...other, emails: stursberg.emails }]);
    expect(m.hit).toBeNull(); expect(m.grund).toBe('mehrdeutig'); expect(m.kandidaten).toEqual(['st', 'ot']);
  });
  it('matches by contact name when email is unknown', () => {
    const m = matchSurveyDetailed('neu@example.invalid', 'Alexander Stursberg', 'Allianz', [stursberg, other]);
    expect(m.hit?.client_id).toBe('st'); expect(m.grund).toBe('name');
  });
  it('never matches on company alone', () => {
    const m = matchSurveyDetailed('neu@example.invalid', 'Unbekannt Person', 'Alexander Stursberg', [stursberg, other]);
    expect(m.hit).toBeNull(); expect(m.grund).toBe('kein_treffer');
  });
  it('uses company only to break a name tie', () => {
    const a = { ...stursberg, name: 'Stursberg Finanz', vor_nachname: 'Alexander Stursberg' };
    const b = { ...other, name: 'Andere Agentur', vor_nachname: 'Alexander Stursberg' };
    expect(matchSurveyDetailed('x@example.invalid', 'Alexander Stursberg', 'Stursberg Finanz', [a, b]).grund).toBe('name+firma');
    expect(matchSurveyDetailed('x@example.invalid', 'Alexander Stursberg', 'Allianz', [a, b]).grund).toBe('mehrdeutig');
  });
  it('keeps existing helpers', () => {
    expect(normalizeCompany(' Selena Höge & Yenin GmbH  ')).toBe('selena hoge yenin');
    expect(isFreemail('gmx.de')).toBe(true);
  });
});

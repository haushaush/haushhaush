import { describe, it, expect } from 'vitest';
import { matchSurvey, companySimilarity, normalizeCompany, isFreemail } from '../../supabase/functions/_shared/survey-matching';

const alpha = { client_id: 'alpha', mitarbeiter_id: 'csm', name: 'Alpha Versicherung GmbH', emails: ['office@alpha.de'] };
const beta = { client_id: 'beta', mitarbeiter_id: 'csm', name: 'Beta Versicherung', emails: ['office@beta.de'] };

describe('survey identification', () => {
  it('prefers an exact email over the entered company', () => {
    expect(matchSurvey(' OFFICE@ALPHA.DE ', beta.name, [alpha, beta])?.client_id).toBe('alpha');
  });
  it('matches a unique non-freemail domain', () => {
    expect(matchSurvey('new@alpha.de', 'unrelated', [alpha, beta])?.client_id).toBe('alpha');
  });
  it('does not rescue ambiguous exact email or domain through company matching', () => {
    expect(matchSurvey('office@alpha.de', alpha.name, [alpha, { ...beta, emails: alpha.emails }])).toBeNull();
    expect(matchSurvey('new@alpha.de', alpha.name, [alpha, { ...beta, emails: ['other@alpha.de'] }])).toBeNull();
  });
  it.each(['gmail.com', 'gmx.de', 'gmx.net', 'web.de', 't-online.de', 'outlook.com', 'hotmail.de', 'yahoo.co.uk', 'icloud.com'])('excludes %s from domain matching', domain => {
    expect(isFreemail(domain)).toBe(true);
    expect(matchSurvey(`unknown@${domain}`, 'unrelated', [{ ...alpha, emails: [`known@${domain}`] }])).toBeNull();
  });
  it('normalizes names and accepts exactly one high-similarity candidate', () => {
    expect(normalizeCompany(' Selena Höge & Yenin GmbH  ')).toBe('selena hoge yenin');
    expect(companySimilarity('Alpha Versicherung GmbH', 'Alpha Versicherung AG')).toBe(1);
    expect(matchSurvey('new@example.invalid', 'Alpha Versicherung AG', [alpha, beta])?.client_id).toBe('alpha');
    expect(matchSurvey('new@example.invalid', alpha.name, [alpha, { ...beta, name: alpha.name }])).toBeNull();
  });
  it('leaves an empty managed-customer list unresolved', () => {
    expect(matchSurvey('office@alpha.de', alpha.name, [])).toBeNull();
  });
});
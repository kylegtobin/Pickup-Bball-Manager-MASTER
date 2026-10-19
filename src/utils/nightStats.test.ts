import { awardNames as raw } from './nightStats';

const awardNames = (n: string[]) => raw(n).replace(/\u00A0/g, ' ');

describe('award names', () => {
  test('one, two, then the first name plus how many more', () => {
    expect(awardNames(['Ben A.'])).toBe('Ben A.');
    expect(awardNames(['Ben A.', 'Rico M.'])).toBe('Ben A. & Rico M.');
    expect(awardNames(['Ben A.', 'Rico M.', 'Eli S.'])).toBe('Ben A. + 2 more');
    expect(awardNames(['A', 'B', 'C', 'D', 'E'])).toBe('A + 4 more');
    expect(awardNames([])).toBe('');
  });

  test('alphabetical, so the same five read the same in the recap and on phones', () => {
    expect(awardNames(['Sam K.', 'Jordan B.', 'Nate R.', 'Chris N.', 'Omar H.'])).toBe('Chris N. + 4 more');
    expect(awardNames(['Marcus T.', 'Dev P.'])).toBe('Dev P. & Marcus T.');
  });

  test('"+ 4 more" stays on one line', () => {
    expect(raw(['A', 'B', 'C'])).toBe('A +\u00A02\u00A0more');
  });
});

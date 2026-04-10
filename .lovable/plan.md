

## Problem

The route `/hr/mitarbeiter` renders `Team.tsx` (via `/hr/:tab`), NOT `Mitarbeiter.tsx`. The `Mitarbeiter.tsx` page is never actually used.

In `Team.tsx`, the grouping on line 74 filters by `DEPT_ORDER = ['Management', 'Customer Success', 'Sales', 'Fulfillment', 'Intern']`, but the actual department values in the database are: `Management`, `Setter`, `Closer`, `Tech`, `Websites`, `Media Buying`, `Backoffice`, `Fulfillment`. Most departments don't match, so those members are invisible.

## Fix

**File: `src/pages/Team.tsx`**

1. Replace `DEPT_ORDER` with the correct grouping logic (same as already defined in `Mitarbeiter.tsx`):
   ```tsx
   const DEPT_GROUPS = [
     { label: 'MANAGEMENT', departments: ['Management'] },
     { label: 'SALES', departments: ['Setter', 'Closer', 'Sales'] },
     { label: 'FULFILLMENT', departments: ['Fulfillment', 'Account-Manager', 'Tech', 'Websites', 'Media Buying', 'Backoffice', 'Operation'] },
   ];
   const ALL_DEPTS = DEPT_GROUPS.flatMap(g => g.departments);
   ```

2. Update the grouping logic (line 74-76) to use the new groups:
   ```tsx
   const grouped = DEPT_GROUPS.map(group => ({
     label: group.label,
     members: members.filter(m => group.departments.includes(m.department || '')),
   })).filter(g => g.members.length > 0);

   const ungrouped = members.filter(m => !ALL_DEPTS.includes(m.department || ''));
   if (ungrouped.length > 0) grouped.push({ label: 'SONSTIGE', members: ungrouped });
   ```

3. Update the rendering section that references `g.dept` to use `g.label` instead.

This will make all 23 team members visible, grouped correctly by department category.


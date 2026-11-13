import type { IToken } from 'chevrotain';
import type { Report } from './diagnostics.js';
import type { Declaration } from './grammar.js';
import type { ArchiMateNesting, ArchiMateRelationship } from './model.js';

export type NestingDeclaration = Extract<Declaration, { kind: 'nesting' }>;

const parentToChildNestingTypes = new Set(['composition', 'aggregation', 'assignment', 'realization', 'access']);

function supportsNesting(entry: ArchiMateRelationship, child: string, parent: string): boolean {
  return entry.type === 'specialization'
    ? entry.source === child && entry.target === parent
    : parentToChildNestingTypes.has(entry.type) && entry.source === parent && entry.target === child;
}

export interface NestingContext {
  readonly relationships: readonly ArchiMateRelationship[];
  readonly relationshipsById: ReadonlyMap<string, ArchiMateRelationship>;
  // Relationships and IDs that already failed validation must not cause a second, misleading nesting error.
  readonly invalidRelationshipIds: ReadonlySet<string>;
  readonly unknownEndpointIds: ReadonlySet<string>;
  readonly report: Report;
}

function findNestingMeaning(statement: NestingDeclaration, token: IToken, context: NestingContext): NestingMeaning {
  const child = statement.child.image;
  const parent = statement.parent.image;
  const found = context.relationshipsById.get(token.image);
  if (!found) {
    context.report('INVALID_NESTING', token, 'Unknown relationship "' + token.image + '".');
    return undefined;
  }
  if (context.invalidRelationshipIds.has(found.id)) return undefined;
  if (!supportsNesting(found, child, parent)) {
    context.report(
      'INVALID_NESTING',
      token,
      'Relationship "' + token.image + '" does not support nesting "' + child + '" in "' + parent + '".',
    );
    return undefined;
  }
  return { relationship: found };
}

type NestingMeaning = { readonly relationship?: ArchiMateRelationship } | undefined;

// The one relationship that supports the nesting gives it meaning. Without one, the nesting is visual only.
function inferNestingRelationship(statement: NestingDeclaration, context: NestingContext): NestingMeaning {
  const child = statement.child.image;
  const parent = statement.parent.image;
  const candidates = context.relationships.filter((entry) => supportsNesting(entry, child, parent));
  const [only] = candidates;
  if (candidates.length <= 1) return only ? { relationship: only } : {};
  context.report(
    'INVALID_NESTING',
    statement.parent,
    `Several relationships can nest "${child}" in "${parent}". ` +
      'Declare the intended one with an ID and add "via <relationship-id>".',
  );
  return undefined;
}

export function validateNesting(
  declarations: readonly NestingDeclaration[],
  entities: ReadonlyMap<string, Pick<Declaration, 'kind'>>,
  context: NestingContext,
): ArchiMateNesting[] {
  const { report } = context;
  const parents = new Map<string, NestingDeclaration>();
  const nesting: ArchiMateNesting[] = [];
  for (const statement of declarations) {
    const child = statement.child.image;
    const parent = statement.parent.image;
    const nonElements = [statement.child, statement.parent].filter(
      (token) => entities.get(token.image)?.kind !== 'element',
    );
    const unreported = nonElements.filter((token) => !context.unknownEndpointIds.has(token.image));
    for (const token of unreported) {
      report('INVALID_NESTING', token, 'Nesting requires an ArchiMate element. Found "' + token.image + '".');
    }
    if (nonElements.length > 0) continue;
    if (child === parent) {
      report('INVALID_NESTING', statement.child, 'An element cannot be nested inside itself.');
      continue;
    }
    if (parents.has(child)) {
      report('INVALID_NESTING', statement.child, 'Element "' + child + '" already has a nesting parent.');
      continue;
    }
    parents.set(child, statement);
    const meaning = statement.relationshipId
      ? findNestingMeaning(statement, statement.relationshipId, context)
      : inferNestingRelationship(statement, context);
    if (meaning)
      nesting.push({ child, parent, ...(meaning.relationship && { relationship: meaning.relationship.id }) });
  }

  const checked = new Set<string>();
  for (const child of parents.keys()) {
    const visited = new Set<string>();
    let current = child;
    while (!checked.has(current)) {
      const statement = parents.get(current);
      if (!statement) break;
      if (visited.has(current)) {
        report('INVALID_NESTING', statement.child, 'Nesting creates a cycle at "' + current + '".');
        break;
      }
      visited.add(current);
      current = statement.parent.image;
    }
    for (const id of visited) checked.add(id);
  }
  return nesting;
}

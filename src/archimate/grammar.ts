import { CstParser, EOF } from 'chevrotain';
import type { CstNode, IRecognitionException, IToken, TokenType } from 'chevrotain';
import {
  access,
  accDescrBlock,
  arrow,
  colon,
  connector,
  description,
  directed,
  direction,
  element,
  header,
  identifier,
  inside,
  label,
  layout,
  metadata,
  nest,
  newline,
  note,
  on,
  quoted,
  relationship,
  tokens,
  via,
} from './lexer.js';

class ArchiMateParser extends CstParser {
  readonly document = this.RULE('document', () => {
    this.MANY(() => this.CONSUME(newline));
    this.CONSUME(header, { ERR_MSG: 'Expected the "archimate-beta" diagram header.' });
    this.MANY2(() => {
      this.CONSUME2(newline);
      this.OPTION(() => this.SUBRULE(this.statement));
    });
    this.CONSUME(EOF, {
      ERR_MSG:
        'Expected a new line or an ArchiMate declaration (layout, direction, element, description, relationship, connector, note, nest, or metadata).',
    });
  });

  private readonly statement = this.RULE('statement', () => {
    this.OR([
      { ALT: () => this.SUBRULE(this.directionStatement) },
      { ALT: () => this.SUBRULE(this.layoutStatement) },
      { ALT: () => this.SUBRULE(this.elementStatement) },
      { ALT: () => this.SUBRULE(this.descriptionStatement) },
      { ALT: () => this.SUBRULE(this.relationshipStatement) },
      { ALT: () => this.SUBRULE(this.noteStatement) },
      { ALT: () => this.SUBRULE(this.nestingStatement) },
      { ALT: () => this.SUBRULE(this.metadataStatement) },
      { ALT: () => this.SUBRULE(this.connectorStatement) },
    ]);
  });

  private readonly connectorStatement = this.RULE('connectorStatement', () => {
    this.CONSUME(identifier, { LABEL: 'source' });
    this.CONSUME(connector, { LABEL: 'connector' });
    this.CONSUME2(identifier, { LABEL: 'target' });
    this.OPTION(() => {
      this.CONSUME(colon);
      this.CONSUME(quoted, { LABEL: 'labelText' });
    });
  });

  private readonly directionStatement = this.RULE('directionStatement', () => {
    this.CONSUME(direction);
    this.CONSUME(identifier, { LABEL: 'value' });
  });

  private readonly layoutStatement = this.RULE('layoutStatement', () => {
    this.CONSUME(layout);
    this.CONSUME(identifier, { LABEL: 'value' });
  });

  private readonly elementStatement = this.RULE('elementStatement', () => {
    this.CONSUME(element);
    this.CONSUME(identifier, { LABEL: 'type' });
    this.CONSUME2(identifier, { LABEL: 'id' });
    this.CONSUME(quoted, { LABEL: 'name' });
  });

  private readonly descriptionStatement = this.RULE('descriptionStatement', () => {
    this.CONSUME(description);
    this.CONSUME(identifier, { LABEL: 'id' });
    this.CONSUME(quoted, { LABEL: 'value' });
  });

  private readonly relationshipStatement = this.RULE('relationshipStatement', () => {
    this.CONSUME(relationship);
    this.CONSUME(identifier, { LABEL: 'type' });
    this.CONSUME2(identifier, { LABEL: 'id' });
    this.CONSUME3(identifier, { LABEL: 'source' });
    this.CONSUME(arrow);
    this.CONSUME4(identifier, { LABEL: 'target' });
    this.OPTION(() => {
      this.CONSUME(access);
      this.CONSUME5(identifier, { LABEL: 'mode' });
    });
    this.OPTION2(() => this.CONSUME(directed));
    this.OPTION3(() => {
      this.CONSUME(label);
      this.CONSUME(quoted, { LABEL: 'labelText' });
    });
  });

  private readonly metadataStatement = this.RULE('metadataStatement', () => {
    this.OR([
      { ALT: () => this.CONSUME(metadata, { LABEL: 'value' }) },
      { ALT: () => this.CONSUME(accDescrBlock, { LABEL: 'value' }) },
    ]);
  });

  private readonly noteStatement = this.RULE('noteStatement', () => {
    this.CONSUME(note);
    this.CONSUME(identifier, { LABEL: 'id' });
    this.CONSUME(quoted, { LABEL: 'text' });
    this.OPTION(() => {
      this.CONSUME(on);
      this.CONSUME2(identifier, { LABEL: 'anchor' });
    });
  });

  private readonly nestingStatement = this.RULE('nestingStatement', () => {
    this.CONSUME(nest);
    this.CONSUME(identifier, { LABEL: 'child' });
    this.CONSUME(inside);
    this.CONSUME2(identifier, { LABEL: 'parent' });
    this.OPTION(() => {
      this.CONSUME(via);
      this.CONSUME3(identifier, { LABEL: 'relationshipId' });
    });
  });

  constructor() {
    super(tokens);
    this.performSelfAnalysis();
  }
}

type Context = CstNode['children'];
export type Declaration =
  | { kind: 'direction'; value: IToken }
  | { kind: 'layout'; value: IToken }
  | { kind: 'metadata'; value: IToken }
  | { kind: 'element'; type: IToken; id: IToken; name: IToken }
  | { kind: 'description'; id: IToken; value: IToken }
  | { kind: 'note'; id: IToken; text: IToken; anchor?: IToken }
  | { kind: 'nesting'; child: IToken; parent: IToken; relationshipId?: IToken }
  | RelationshipDeclaration
  | ConnectorDeclaration;

export interface RelationshipDeclaration {
  kind: 'relationship';
  type: IToken;
  id: IToken;
  source: IToken;
  target: IToken;
  mode?: IToken;
  directed?: IToken;
  label?: IToken;
}

export interface ConnectorDeclaration {
  kind: 'connector';
  source: IToken;
  connector: IToken;
  target: IToken;
  label?: IToken;
}

function requiredToken(ctx: Context, name: string): IToken {
  const item = ctx[name]?.[0];
  if (!item || !('tokenType' in item)) throw new Error('Incomplete ArchiMate parse tree.');
  return item;
}

const parser = new ArchiMateParser();
const BaseVisitor = parser.getBaseCstVisitorConstructor<undefined, Declaration | Declaration[]>();

class DeclarationVisitor extends BaseVisitor {
  constructor() {
    super();
    this.validateVisitor();
  }

  document(ctx: Context): Declaration[] {
    return (ctx.statement ?? []).flatMap((node) => {
      if (!('children' in node)) throw new Error('Invalid ArchiMate parse tree.');
      return this.visit(node);
    });
  }

  statement(ctx: Context): Declaration | Declaration[] {
    const child = Object.values(ctx)[0]?.[0];
    if (!child || !('children' in child)) throw new Error('Incomplete ArchiMate statement.');
    return this.visit(child);
  }

  directionStatement(ctx: Context): Declaration {
    return { kind: 'direction', value: requiredToken(ctx, 'value') };
  }

  layoutStatement(ctx: Context): Declaration {
    return { kind: 'layout', value: requiredToken(ctx, 'value') };
  }

  elementStatement(ctx: Context): Declaration {
    return {
      kind: 'element',
      type: requiredToken(ctx, 'type'),
      id: requiredToken(ctx, 'id'),
      name: requiredToken(ctx, 'name'),
    };
  }

  descriptionStatement(ctx: Context): Declaration {
    return { kind: 'description', id: requiredToken(ctx, 'id'), value: requiredToken(ctx, 'value') };
  }

  relationshipStatement(ctx: Context): Declaration {
    return {
      kind: 'relationship',
      type: requiredToken(ctx, 'type'),
      id: requiredToken(ctx, 'id'),
      source: requiredToken(ctx, 'source'),
      target: requiredToken(ctx, 'target'),
      ...(ctx.mode && { mode: requiredToken(ctx, 'mode') }),
      ...(ctx.Directed && { directed: requiredToken(ctx, 'Directed') }),
      ...(ctx.labelText && { label: requiredToken(ctx, 'labelText') }),
    };
  }

  connectorStatement(ctx: Context): Declaration {
    return {
      kind: 'connector',
      source: requiredToken(ctx, 'source'),
      connector: requiredToken(ctx, 'connector'),
      target: requiredToken(ctx, 'target'),
      ...(ctx.labelText && { label: requiredToken(ctx, 'labelText') }),
    };
  }

  metadataStatement(ctx: Context): Declaration {
    return { kind: 'metadata', value: requiredToken(ctx, 'value') };
  }

  noteStatement(ctx: Context): Declaration {
    return {
      kind: 'note',
      id: requiredToken(ctx, 'id'),
      text: requiredToken(ctx, 'text'),
      ...(ctx.anchor && { anchor: requiredToken(ctx, 'anchor') }),
    };
  }

  nestingStatement(ctx: Context): Declaration {
    return {
      kind: 'nesting',
      child: requiredToken(ctx, 'child'),
      parent: requiredToken(ctx, 'parent'),
      ...(ctx.relationshipId && { relationshipId: requiredToken(ctx, 'relationshipId') }),
    };
  }
}

const visitor = new DeclarationVisitor();

export type GrammarResult = { readonly declarations: Declaration[] } | { readonly syntaxError: IRecognitionException };

export function parseDeclarations(input: IToken[]): GrammarResult {
  parser.input = input;
  const tree = parser.document();
  const syntaxError = parser.errors[0];
  if (syntaxError) return { syntaxError };
  const declarations = visitor.visit(tree);
  if (!Array.isArray(declarations)) throw new Error('Invalid ArchiMate document parse tree.');
  return { declarations };
}

const relationshipOptionOrder: readonly TokenType[] = [access, directed, label];

// Chevrotain reports a misplaced relationship option as unexpected trailing input; name the ordering rule instead.
export function describeSyntaxError(error: IRecognitionException, tokens: readonly IToken[]): string {
  const rank = relationshipOptionOrder.indexOf(error.token.tokenType);
  const index = tokens.indexOf(error.token);
  if (rank < 0 || index < 0) return error.message;
  let statementStart = index;
  while (statementStart > 0 && tokens[statementStart - 1]?.tokenType !== newline) statementStart--;
  const statement = tokens.slice(statementStart, index);
  if (statement[0]?.tokenType !== relationship) return error.message;
  const later = statement.find((token) => relationshipOptionOrder.indexOf(token.tokenType) > rank);
  return later ? '"' + error.token.image + '" must come before "' + later.image + '".' : error.message;
}
